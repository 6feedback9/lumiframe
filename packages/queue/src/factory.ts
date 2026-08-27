import { BullMqTryOnQueue } from "./bullmqQueue";
import { InMemoryTryOnQueue } from "./inMemoryQueue";
import type { TryOnQueue } from "./types";

let shared: TryOnQueue | null = null;

/**
 * BullMQ/Redis when REDIS_URL is set (real deployments — see
 * ARCHITECTURE.md §7 on why the worker needs a persistent process), the
 * in-memory queue otherwise (dev/CI). Returns a process-wide singleton so
 * the server (enqueue side) and any in-process worker registration
 * (process() call) share the same instance.
 */
export function getTryOnQueue(): TryOnQueue {
  if (!shared) {
    shared = process.env.REDIS_URL ? new BullMqTryOnQueue(process.env.REDIS_URL) : new InMemoryTryOnQueue();
  }
  return shared;
}

/** Test-only: forces the next getTryOnQueue() to construct a fresh instance. */
export function resetTryOnQueueForTests(): void {
  shared = null;
}
