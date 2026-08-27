import { Queue, Worker, type ConnectionOptions } from "bullmq";
import { QUEUE_NAME, type TryOnJobData, type TryOnJobHandler, type TryOnQueue } from "./types";

export class BullMqTryOnQueue implements TryOnQueue {
  private readonly connection: ConnectionOptions;
  private queue: Queue<TryOnJobData> | null = null;
  private worker: Worker<TryOnJobData> | null = null;

  constructor(private readonly redisUrl: string) {
    this.connection = { url: redisUrl } as ConnectionOptions;
  }

  private getQueue(): Queue<TryOnJobData> {
    if (!this.queue) {
      this.queue = new Queue<TryOnJobData>(QUEUE_NAME, { connection: this.connection });
    }
    return this.queue;
  }

  async enqueue(data: TryOnJobData): Promise<void> {
    await this.getQueue().add("generate", data, {
      attempts: 1, // retries are a Phase 2 concern (need idempotency in the worker first)
      removeOnComplete: 500,
      removeOnFail: 1000,
    });
  }

  process(handler: TryOnJobHandler): void {
    if (this.worker) {
      throw new Error("BullMqTryOnQueue.process() called more than once — one Worker per process.");
    }
    this.worker = new Worker<TryOnJobData>(
      QUEUE_NAME,
      async (job) => {
        await handler(job.data);
      },
      { connection: this.connection }
    );
  }

  async close(): Promise<void> {
    await Promise.all([this.queue?.close(), this.worker?.close()]);
  }
}
