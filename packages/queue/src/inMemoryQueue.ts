// Dev/CI queue — no Redis. `enqueue` schedules the registered handler on
// the next tick (never inline in the caller's call stack, so callers can't
// accidentally depend on synchronous completion). No persistence, no
// retries, no cross-process delivery — this is what makes `pnpm dev`
// work with zero infra, not a production queue. BullMqTryOnQueue is the
// real one.

import type { TryOnJobData, TryOnJobHandler, TryOnQueue } from "./types";

export class InMemoryTryOnQueue implements TryOnQueue {
  private handler: TryOnJobHandler | null = null;
  private readonly onError: (error: unknown, data: TryOnJobData) => void;

  constructor(options: { onError?: (error: unknown, data: TryOnJobData) => void } = {}) {
    this.onError = options.onError ?? ((error, data) => console.error("[InMemoryTryOnQueue] job failed", data, error));
  }

  process(handler: TryOnJobHandler): void {
    this.handler = handler;
  }

  async enqueue(data: TryOnJobData): Promise<void> {
    if (!this.handler) {
      throw new Error("InMemoryTryOnQueue.enqueue called before .process(handler) was registered.");
    }
    const handler = this.handler;
    setImmediate(() => {
      handler(data).catch((error) => this.onError(error, data));
    });
  }

  async close(): Promise<void> {
    this.handler = null;
  }
}
