import { describe, expect, it, vi } from "vitest";
import { InMemoryTryOnQueue } from "./inMemoryQueue";

describe("InMemoryTryOnQueue", () => {
  it("throws if enqueue is called before process()", async () => {
    const queue = new InMemoryTryOnQueue();
    await expect(queue.enqueue({ tryOnGenerationId: "gen_1" })).rejects.toThrow(/process\(handler\)/);
  });

  it("invokes the registered handler asynchronously, not inline", async () => {
    const queue = new InMemoryTryOnQueue();
    const seen: string[] = [];
    queue.process(async (data) => {
      seen.push(data.tryOnGenerationId);
    });

    await queue.enqueue({ tryOnGenerationId: "gen_1" });
    expect(seen).toEqual([]); // not yet — runs on a later tick

    await new Promise((r) => setImmediate(r));
    expect(seen).toEqual(["gen_1"]);
  });

  it("routes handler errors to onError instead of throwing out of enqueue", async () => {
    const onError = vi.fn();
    const queue = new InMemoryTryOnQueue({ onError });
    queue.process(async () => {
      throw new Error("boom");
    });

    await queue.enqueue({ tryOnGenerationId: "gen_1" });
    await new Promise((r) => setImmediate(r));

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(expect.any(Error), { tryOnGenerationId: "gen_1" });
  });
});
