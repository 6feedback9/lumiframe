// MockTryOnProvider — no external API calls. Used whenever AI_PROVIDER=mock
// (the default), which is how dev environments and CI run the entire
// queue → worker → provider → storage → widget pipeline without needing
// any AI vendor credentials. See ARCHITECTURE.md §6.
//
// Behavior is deliberately configurable via env vars so tests can exercise
// every terminal state the real pipeline has to handle:
//   MOCK_PROVIDER_DELAY_MS     — ms before a job resolves (default 1500)
//   MOCK_PROVIDER_FAILURE_RATE — 0..1 probability of "failed" (default 0)
//   MOCK_PROVIDER_TIMEOUT_RATE — 0..1 probability of "timeout" (default 0)

import {
  registerTryOnProvider,
  type TryOnProvider,
  type TryOnGenerationInput,
  type TryOnJobHandle,
  type TryOnJobStatus,
  type TryOnValidationResult,
} from "@lumiframe/tryon";

// A minimal valid 1x1 PNG, used as a stand-in "generated result" so the
// storage/upload/signed-URL leg of the pipeline can be built and tested
// before any real image generation exists. Replaced entirely once
// packages/providers/real ships in Phase 2.
const PLACEHOLDER_RESULT_DATA_URI =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

type Outcome = "completed" | "failed" | "timeout";

interface MockJob {
  outcome: Outcome;
  resolvesAt: number;
  startedAt: number;
}

export interface MockProviderOptions {
  delayMs?: number;
  failureRate?: number;
  timeoutRate?: number;
}

function readNumberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export class MockTryOnProvider implements TryOnProvider {
  readonly name = "mock";

  private readonly delayMs: number;
  private readonly failureRate: number;
  private readonly timeoutRate: number;
  private readonly jobs = new Map<string, MockJob>();

  constructor(options: MockProviderOptions = {}) {
    this.delayMs = options.delayMs ?? readNumberEnv("MOCK_PROVIDER_DELAY_MS", 1500);
    this.failureRate = options.failureRate ?? readNumberEnv("MOCK_PROVIDER_FAILURE_RATE", 0);
    this.timeoutRate = options.timeoutRate ?? readNumberEnv("MOCK_PROVIDER_TIMEOUT_RATE", 0);
  }

  validateInput(input: TryOnGenerationInput): TryOnValidationResult {
    const errors: string[] = [];
    if (!input.faceImage?.key) errors.push("faceImage is required");
    if (!input.faceImage?.mimeType?.startsWith("image/")) errors.push("faceImage must be an image");
    if (!input.eyewearImage?.key) errors.push("eyewearImage is required");
    if (!input.eyewearImage?.mimeType?.startsWith("image/")) errors.push("eyewearImage must be an image");
    return errors.length ? { valid: false, errors } : { valid: true };
  }

  async generateTryOn(input: TryOnGenerationInput): Promise<TryOnJobHandle> {
    const validation = this.validateInput(input);
    if (!validation.valid) {
      throw new Error(`Invalid TryOnGenerationInput: ${validation.errors?.join(", ")}`);
    }

    const providerJobId = `mock_${input.tryOnGenerationId}_${Date.now().toString(36)}`;
    const roll = Math.random();
    const outcome: Outcome =
      roll < this.timeoutRate ? "timeout" : roll < this.timeoutRate + this.failureRate ? "failed" : "completed";

    const startedAt = Date.now();
    this.jobs.set(providerJobId, {
      outcome,
      startedAt,
      // "timeout" jobs never resolve within a sane window — the worker's
      // own poll-timeout is what should surface this, not this provider.
      resolvesAt: outcome === "timeout" ? Number.POSITIVE_INFINITY : startedAt + this.delayMs,
    });

    return { providerJobId };
  }

  async getJobStatus(jobId: string): Promise<TryOnJobStatus> {
    const job = this.jobs.get(jobId);
    if (!job) {
      return { state: "failed", errorCode: "MOCK_JOB_NOT_FOUND", errorMessage: `No such job: ${jobId}` };
    }

    if (Date.now() < job.resolvesAt) {
      return { state: "processing" };
    }

    const durationMs = Date.now() - job.startedAt;
    switch (job.outcome) {
      case "completed":
        return { state: "completed", resultImageUrl: PLACEHOLDER_RESULT_DATA_URI, durationMs };
      case "failed":
        return {
          state: "failed",
          errorCode: "MOCK_GENERATION_FAILED",
          errorMessage: "Simulated provider failure (MOCK_PROVIDER_FAILURE_RATE)",
          durationMs,
        };
      case "timeout":
        return { state: "timeout", errorCode: "MOCK_TIMEOUT", errorMessage: "Simulated provider timeout", durationMs };
    }
  }

  async cancelJob(jobId: string): Promise<void> {
    this.jobs.delete(jobId);
  }
}

/** Call once at app startup (apps/api bootstrap) to make "mock" resolvable via getTryOnProvider(). */
export function registerMockProvider(options?: MockProviderOptions): void {
  registerTryOnProvider("mock", () => new MockTryOnProvider(options));
}
