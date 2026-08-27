export interface TryOnJobData {
  tryOnGenerationId: string;
}

export type TryOnJobHandler = (data: TryOnJobData) => Promise<void>;

export const QUEUE_NAME = "tryon-generation";

export interface TryOnQueue {
  enqueue(data: TryOnJobData): Promise<void>;
  /**
   * Registers the consumer. Call exactly once per process at startup —
   * apps/api's main server process (in-memory queue, dev/CI) or the
   * standalone worker entrypoint (BullMQ, real deployments).
   */
  process(handler: TryOnJobHandler): void;
  close(): Promise<void>;
}
