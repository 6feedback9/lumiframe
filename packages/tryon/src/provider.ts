// The one interface every AI vendor integration must implement.
//
// ARCHITECTURE.md §6: no provider-specific code (HTTP calls, auth headers,
// response parsing) may live outside packages/providers/*. The API routes,
// the worker, the SDK, and the database layer only ever depend on this
// interface plus `getTryOnProvider(name)` below — never a concrete vendor
// package. That's what makes AI_PROVIDER=mock able to run the whole system
// with zero external calls, and what lets a real vendor be swapped in later
// (packages/providers/real) without touching anything else.

import type {
  TryOnGenerationInput,
  TryOnJobHandle,
  TryOnJobStatus,
  TryOnValidationResult,
} from "./types";

export interface TryOnProvider {
  /** Human-readable id used in TryOnGeneration.provider and logs, e.g. "mock". */
  readonly name: string;

  /**
   * Kick off generation. Must return quickly (enqueue-and-return on the
   * vendor's side) — never block until the image is ready. The worker
   * polls `getJobStatus` afterward.
   */
  generateTryOn(input: TryOnGenerationInput): Promise<TryOnJobHandle>;

  getJobStatus(jobId: string): Promise<TryOnJobStatus>;

  /** Best-effort cancellation, e.g. if the session expires mid-flight. */
  cancelJob(jobId: string): Promise<void>;

  /**
   * Synchronous, pre-flight validation (file types, size limits, whatever
   * this vendor requires) — run before a job is ever enqueued so obviously
   * bad input fails fast with a friendly error instead of burning a job slot.
   */
  validateInput(input: TryOnGenerationInput): TryOnValidationResult;
}

type ProviderFactory = () => TryOnProvider;

const registry = new Map<string, ProviderFactory>();

/**
 * Called once per provider package to register itself. Keeps the registry
 * decoupled from any specific provider's import — `getTryOnProvider` below
 * only knows about whatever has been registered by whichever provider
 * package the app actually imports (see apps/api's provider bootstrap).
 */
export function registerTryOnProvider(name: string, factory: ProviderFactory): void {
  registry.set(name, factory);
}

export function getTryOnProvider(name: string = process.env.AI_PROVIDER ?? "mock"): TryOnProvider {
  const factory = registry.get(name);
  if (!factory) {
    throw new Error(
      `Unknown AI_PROVIDER "${name}". Registered providers: ${[...registry.keys()].join(", ") || "(none imported yet)"}`
    );
  }
  return factory();
}
