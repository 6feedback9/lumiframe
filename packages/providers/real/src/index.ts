// GeminiTryOnProvider — the first real AI vendor adapter (ARCHITECTURE.md
// §6/§13). Calls Gemini's image-editing model directly with the customer's
// photo and the merchant's product photo, and asks it to composite the
// eyewear onto the customer's face.
//
// Model: as of this writing, Google's recommended model for this is
// "gemini-3.1-flash-image-preview" — the successor to the older
// "gemini-2.5-flash-image" ("nano-banana"), which Google is retiring
// 2026-10-02. Override via GEMINI_IMAGE_MODEL if Google ships another
// successor later — that's an env var change, not a code change.
//
// Request/response shape below is written against @google/genai's actual
// installed TypeScript types (the classic `models.generateContent` surface,
// not the newer "Interactions API", which is less battle-tested and whose
// own README examples don't fully typecheck) — verified with
// `tsc --noEmit` against the real SDK, not from memory.
//
// Unlike a vendor with an async job queue, Gemini's generateContent call is
// itself synchronous — there's no vendor-side "job id" to hand back the way
// TryOnProvider's contract expects (packages/tryon/src/provider.ts: "must
// return quickly ... never block"). generateTryOn() below does the actual
// work (fetch both images, call Gemini, remember the outcome) and only
// returns once that's done; getJobStatus() then just reads back what's
// already known. A hung Gemini request is still bounded by
// GENERATE_TIMEOUT_MS below, so it can't wedge the worker forever.

import { fetchImageBytes } from "@lumiframe/storage";
import {
  registerTryOnProvider,
  type TryOnProvider,
  type TryOnGenerationInput,
  type TryOnJobHandle,
  type TryOnJobStatus,
  type TryOnValidationResult,
} from "@lumiframe/tryon";
import { GoogleGenAI, Modality, type Part } from "@google/genai";

const DEFAULT_MODEL = "gemini-3.1-flash-image-preview";
// Matches packages/widget's own POLL_TIMEOUT_MS — no point holding this
// call open longer than the customer's browser is still polling for it.
const GENERATE_TIMEOUT_MS = 45_000;

const PROMPT = `You are editing photo #1, a photo of a person, so they appear to be wearing the eyewear shown in photo #2.

Photo #2 is a merchant product photo and may include packaging, a plain background, or other objects — first identify just the glasses/sunglasses in it, ignoring everything else in that photo.

Then edit photo #1 so the person is wearing those glasses: match their head position, angle and scale realistically. Keep the person's face, expression, body, clothing, background and lighting in photo #1 completely unchanged — do not alter anything else about photo #1.

Output only the edited photo. No text.`;

type Outcome =
  | { state: "completed"; resultImageUrl: string; durationMs: number }
  | { state: "failed"; errorCode: string; errorMessage: string; durationMs: number };

export interface GeminiProviderOptions {
  apiKey?: string;
  model?: string;
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

/** Finds the first inline-image part in a Gemini response's first candidate. */
function firstImagePart(parts: Part[] | undefined): { data: string; mimeType: string } | null {
  for (const part of parts ?? []) {
    if (part.inlineData?.data) {
      return { data: part.inlineData.data, mimeType: part.inlineData.mimeType ?? "image/png" };
    }
  }
  return null;
}

export class GeminiTryOnProvider implements TryOnProvider {
  readonly name = "gemini";

  private readonly client: GoogleGenAI;
  private readonly model: string;
  private readonly jobs = new Map<string, Outcome>();

  constructor(options: GeminiProviderOptions = {}) {
    const apiKey = options.apiKey ?? process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GeminiTryOnProvider requires GEMINI_API_KEY (or options.apiKey)");
    }
    this.client = new GoogleGenAI({ apiKey });
    this.model = options.model ?? process.env.GEMINI_IMAGE_MODEL ?? DEFAULT_MODEL;
  }

  validateInput(input: TryOnGenerationInput): TryOnValidationResult {
    const errors: string[] = [];
    if (!input.faceImage?.url) errors.push("faceImage.url is required — a real provider must fetch actual bytes");
    if (!input.faceImage?.mimeType?.startsWith("image/")) errors.push("faceImage must be an image");
    if (!input.eyewearImage?.url) errors.push("eyewearImage.url is required");
    if (!input.eyewearImage?.mimeType?.startsWith("image/")) errors.push("eyewearImage must be an image");
    return errors.length ? { valid: false, errors } : { valid: true };
  }

  async generateTryOn(input: TryOnGenerationInput): Promise<TryOnJobHandle> {
    const validation = this.validateInput(input);
    if (!validation.valid) {
      throw new Error(`Invalid TryOnGenerationInput: ${validation.errors?.join(", ")}`);
    }

    const providerJobId = `gemini_${input.tryOnGenerationId}_${Date.now().toString(36)}`;
    const startedAt = Date.now();

    try {
      const outcome = await withTimeout(
        this.runGeneration(input, startedAt),
        GENERATE_TIMEOUT_MS,
        `Gemini did not respond within ${GENERATE_TIMEOUT_MS}ms`
      );
      this.jobs.set(providerJobId, outcome);
    } catch (error) {
      this.jobs.set(providerJobId, {
        state: "failed",
        errorCode: "GEMINI_REQUEST_FAILED",
        errorMessage: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startedAt,
      });
    }

    return { providerJobId };
  }

  private async runGeneration(input: TryOnGenerationInput, startedAt: number): Promise<Outcome> {
    const [face, eyewear] = await Promise.all([
      fetchImageBytes(input.faceImage.url!),
      fetchImageBytes(input.eyewearImage.url!),
    ]);

    const response = await this.client.models.generateContent({
      model: this.model,
      contents: [
        {
          role: "user",
          parts: [
            { text: PROMPT },
            { inlineData: { data: face.buffer.toString("base64"), mimeType: face.mimeType } },
            { inlineData: { data: eyewear.buffer.toString("base64"), mimeType: eyewear.mimeType } },
          ],
        },
      ],
      config: {
        responseModalities: [Modality.TEXT, Modality.IMAGE],
      },
    });

    const image = firstImagePart(response.candidates?.[0]?.content?.parts);
    if (!image) {
      return {
        state: "failed",
        errorCode: "GEMINI_NO_IMAGE",
        errorMessage:
          response.promptFeedback?.blockReasonMessage ??
          response.candidates?.[0]?.finishMessage ??
          "Gemini did not return an image",
        durationMs: Date.now() - startedAt,
      };
    }

    return {
      state: "completed",
      resultImageUrl: `data:${image.mimeType};base64,${image.data}`,
      durationMs: Date.now() - startedAt,
    };
  }

  async getJobStatus(jobId: string): Promise<TryOnJobStatus> {
    const outcome = this.jobs.get(jobId);
    if (!outcome) {
      return { state: "failed", errorCode: "GEMINI_JOB_NOT_FOUND", errorMessage: `No such job: ${jobId}` };
    }
    return outcome;
  }

  async cancelJob(jobId: string): Promise<void> {
    this.jobs.delete(jobId);
  }
}

/** Call once at app startup (apps/api bootstrap) to make "gemini" resolvable via getTryOnProvider(). */
export function registerGeminiProvider(options?: GeminiProviderOptions): void {
  registerTryOnProvider("gemini", () => new GeminiTryOnProvider(options));
}
