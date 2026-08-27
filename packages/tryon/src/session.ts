// TryOnSession / TryOnGeneration lifecycle — ARCHITECTURE.md §5.
//
//   CREATED → UPLOADING → PROCESSING → COMPLETED
//                       ↘ PROCESSING → FAILED
//   (any non-terminal state) → EXPIRED   [retention TTL sweep]
//
// This module is the single place that knows which transitions are legal,
// so the worker, the API, and the retention sweep job all agree on it
// instead of each re-implementing the state machine.

export type TryOnStatus =
  | "CREATED"
  | "UPLOADING"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED"
  | "EXPIRED";

const TERMINAL_STATUSES: ReadonlySet<TryOnStatus> = new Set([
  "COMPLETED",
  "FAILED",
  "EXPIRED",
]);

// Explicit adjacency list rather than a general rule — a status transition
// bug here silently corrupts analytics, so "new statuses must be added
// here deliberately" is the safer default.
const ALLOWED_TRANSITIONS: Record<TryOnStatus, ReadonlySet<TryOnStatus>> = {
  CREATED: new Set(["UPLOADING", "EXPIRED"]),
  UPLOADING: new Set(["PROCESSING", "FAILED", "EXPIRED"]),
  PROCESSING: new Set(["COMPLETED", "FAILED", "EXPIRED"]),
  COMPLETED: new Set([]),
  FAILED: new Set([]),
  EXPIRED: new Set([]),
};

export function isTerminal(status: TryOnStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

export function canTransition(from: TryOnStatus, to: TryOnStatus): boolean {
  return ALLOWED_TRANSITIONS[from].has(to);
}

/**
 * Throws if the transition is illegal. Call this at every status write site
 * (API, worker, retention sweep) instead of assigning the field directly.
 */
export function assertTransition(from: TryOnStatus, to: TryOnStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Illegal TryOnStatus transition: ${from} → ${to}`);
  }
}
