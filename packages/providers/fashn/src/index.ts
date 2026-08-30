// FashnTryOnProvider — second real AI vendor adapter (ARCHITECTURE.md §6/§13),
// alongside packages/providers/real (Gemini). Uses FASHN's "Try-On Max"
// model (model_name: "tryon-max"), their premium/general endpoint that
// explicitly places "clothing, shoes, and accessories" onto a model photo —
// unlike their older "Try-On v1.6" model, whose `category` is constrained to
// `tops | bottoms | one-pieces | auto` (clothing only, no accessory/eyewear
// option at all). Chosen after a merchant compared both vendors on real
// glasses photos and found FASHN's results better for this specific use case.
//
// Contract verified against the official `fashn` npm package's shipped
// TypeScript source (resources/predictions.ts) — not from memory or from
// scraped docs pages, both of which this environment's network policy
// blocks outright (docs.fashn.ai, fashn.ai and api.fashn.ai are all
// unreachable from here; only the npm registry is allowlisted). That
// package is a thin, dependency-free, official SDK generated from FASHN's
// own OpenAPI spec, so it's used directly here rather than hand-rolled
// fetch() calls against a guessed request shape.
//
// Unlike Gemini's generateContent (synchronous — see provider-real's own
// comment on why that adapter has to fake an async job), FASHN's /v1/run
// genuinely is fire-and-forget: it returns a prediction id immediately, and
// /v1/status/{id} is polled for the result. That maps directly onto
// TryOnProvider's contract instead of needing to be shoehorned into it —
// generateTryOn() below does no polling itself; the worker's own poll loop
// (apps/api/src/worker/processTryOnJob.ts) calls getJobStatus() repeatedly
// until it reports a terminal state, exactly as the interface intends.

import {
  registerTryOnProvider,
  type TryOnProvider,
  type TryOnGenerationInput,
  type TryOnJobHandle,
  type TryOnJobStatus,
  type TryOnValidationResult,
  type StoredImageRef,
} from "@lumiframe/tryon";
import Fashn, { APIError } from "fashn";

// FASHN's own guidance ("Optional instructions to customize the try-on
// result... make minor styling changes", examples given are all clothing
// tweaks like "tuck in shirt") suggests this field nudges the model rather
// than fully steering it the way Gemini's free-form multimodal prompt does
// — kept short accordingly. Not a substitute for the prompt-engineering
// work in provider-real; just the equivalent lever this vendor exposes.
// Two asks folded in here: match the eyewear itself precisely (mirrors
// provider-real's own rim/material/tint instruction), and touch nothing
// else about the person's photo — Try-On Max's own field doc already
// claims it "preserves the model's identity, pose, and styling" by
// design, so this is reinforcing stated model behavior, not overriding
// it; if a result still relights or subtly alters the face/background
// despite this, that's the underlying model's own behavior, not
// something a prompt string can fully constrain — flagging honestly
// rather than promising the instruction guarantees a fix.
const INSTRUCTIONS =
  "Keep the eyewear's exact frame shape, rim style, material, color and lens tint as shown in the product photo — do not substitute a different style or color. " +
  "Do not change anything else about the person: keep their face, expression, skin tone, hair, pose, body, clothing, background and lighting exactly as in the original photo — only add the eyewear.";

type PreflightFailure = {
  state: "failed";
  errorCode: string;
  errorMessage: string;
};

export interface FashnProviderOptions {
  apiKey?: string;
}

/**
 * FASHN's model_image/product_image inputs accept either a public URL or a
 * base64 data: URI — prefer the URL when we already have one (the worker
 * signs one for the customer's photo), since that lets FASHN's own servers
 * fetch the bytes directly instead of this process downloading them just to
 * re-upload them as base64 in the request body. Falls back to base64 for
 * the product image, which the worker only ever hands over as an in-memory
 * buffer (see StoredImageRef.buffer's own doc comment in packages/tryon).
 */
function toImageInput(ref: StoredImageRef): string {
  if (ref.url) return ref.url;
  if (ref.buffer) return `data:${ref.mimeType};base64,${ref.buffer.toString("base64")}`;
  throw new Error("StoredImageRef must have a url or a buffer");
}

function errorCodeFor(error: unknown): string {
  // APIError subclasses (AuthenticationError, RateLimitError, etc.) all
  // carry a distinct constructor name — surfacing that instead of a single
  // flat "FASHN_REQUEST_FAILED" for every failure means an admin looking at
  // a failed try-on's error code can immediately tell a bad API key apart
  // from a rate limit apart from FASHN being down, without opening logs.
  if (error instanceof APIError) return `FASHN_${error.constructor.name.replace(/([a-z])([A-Z])/g, "$1_$2").toUpperCase()}`;
  return "FASHN_REQUEST_FAILED";
}

export class FashnTryOnProvider implements TryOnProvider {
  readonly name = "fashn";

  private readonly client: Fashn;
  // Only ever holds an entry for a generation whose /v1/run call itself
  // failed (bad input, auth, network) before FASHN ever assigned a real
  // prediction id — there's nothing to poll for those, so getJobStatus
  // returns the stored outcome directly instead of calling FASHN's status
  // endpoint with a made-up id. A successful run() never touches this map;
  // its real prediction id is polled live every time, both because that's
  // what the interface expects and because there's no reason to cache a
  // non-terminal status locally when FASHN is already tracking it.
  private readonly preflightFailures = new Map<string, PreflightFailure>();

  constructor(options: FashnProviderOptions = {}) {
    const apiKey = options.apiKey ?? process.env.FASHN_API_KEY;
    if (!apiKey) {
      throw new Error("FashnTryOnProvider requires FASHN_API_KEY (or options.apiKey)");
    }
    this.client = new Fashn({ apiKey });
  }

  validateInput(input: TryOnGenerationInput): TryOnValidationResult {
    const errors: string[] = [];
    if (!input.faceImage?.url && !input.faceImage?.buffer) errors.push("faceImage.url or faceImage.buffer is required — a real provider must have actual bytes");
    if (!input.faceImage?.mimeType?.startsWith("image/")) errors.push("faceImage must be an image");
    if (!input.eyewearImage?.url && !input.eyewearImage?.buffer) errors.push("eyewearImage.url or eyewearImage.buffer is required");
    if (!input.eyewearImage?.mimeType?.startsWith("image/")) errors.push("eyewearImage must be an image");
    return errors.length ? { valid: false, errors } : { valid: true };
  }

  async generateTryOn(input: TryOnGenerationInput): Promise<TryOnJobHandle> {
    const validation = this.validateInput(input);
    if (!validation.valid) {
      throw new Error(`Invalid TryOnGenerationInput: ${validation.errors?.join(", ")}`);
    }

    try {
      const response = await this.client.predictions.run({
        model_name: "tryon-max",
        inputs: {
          model_image: toImageInput(input.faceImage),
          product_image: toImageInput(input.eyewearImage),
          prompt: INSTRUCTIONS,
          num_images: 1,
        },
      });
      return { providerJobId: response.id };
    } catch (error) {
      // Mirrors provider-real's own pattern: a failure here still returns a
      // TryOnJobHandle (never throws past this point) so the caller always
      // gets a providerJobId to poll, and the actual failure surfaces
      // through the normal getJobStatus()/errorCode path the worker and
      // the merchant/admin try-on lists already know how to display —
      // rather than a generic WORKER_ERROR that loses which vendor/reason.
      const providerJobId = `fashn_preflight_${input.tryOnGenerationId}_${Date.now().toString(36)}`;
      console.warn(`[fashn] generation ${input.tryOnGenerationId}: /v1/run failed — ${error instanceof Error ? error.message : String(error)}`);
      this.preflightFailures.set(providerJobId, {
        state: "failed",
        errorCode: errorCodeFor(error),
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      return { providerJobId };
    }
  }

  async getJobStatus(jobId: string): Promise<TryOnJobStatus> {
    const preflight = this.preflightFailures.get(jobId);
    if (preflight) return preflight;

    try {
      const response = await this.client.predictions.status(jobId);
      switch (response.status) {
        case "starting":
        case "in_queue":
          return { state: "queued" };
        case "processing":
          return { state: "processing" };
        case "completed": {
          const resultImageUrl = response.output?.[0];
          if (!resultImageUrl) {
            return { state: "failed", errorCode: "FASHN_NO_OUTPUT", errorMessage: "FASHN reported the prediction completed but returned no output image" };
          }
          return { state: "completed", resultImageUrl };
        }
        case "canceled":
          return { state: "failed", errorCode: "FASHN_CANCELED", errorMessage: "Prediction was canceled" };
        case "time_out":
          return { state: "timeout", errorCode: "FASHN_TIMEOUT", errorMessage: "FASHN reported the prediction timed out" };
        case "failed":
        default:
          return {
            state: "failed",
            errorCode: response.error?.name ?? "FASHN_FAILED",
            errorMessage: response.error?.message ?? `FASHN reported a failure with no message (status: ${response.status})`,
          };
      }
    } catch (error) {
      return {
        state: "failed",
        errorCode: errorCodeFor(error),
        errorMessage: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Best-effort, per the interface's own doc comment — FASHN's SDK has no
   * server-side cancel endpoint yet (its own subscribe() helper has a
   * "TODO: Cancel prediction on server when cancellation API is
   * available"), so there's nothing to call FASHN about. Only clears our
   * own local bookkeeping for the pre-flight-failure case above; a job
   * that made it to a real FASHN prediction id just keeps running on
   * their side unattended, same as it would if this method didn't exist.
   */
  async cancelJob(jobId: string): Promise<void> {
    this.preflightFailures.delete(jobId);
  }
}

/** Call once at app startup (apps/api bootstrap) to make "fashn" resolvable via getTryOnProvider(). */
export function registerFashnProvider(options?: FashnProviderOptions): void {
  registerTryOnProvider("fashn", () => new FashnTryOnProvider(options));
}
