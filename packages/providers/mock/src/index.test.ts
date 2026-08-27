import { describe, expect, it } from "vitest";
import { MockTryOnProvider } from "./index";
import type { TryOnGenerationInput } from "@lumiframe/tryon";

const baseInput: TryOnGenerationInput = {
  tryOnSessionId: "session_1",
  tryOnGenerationId: "gen_1",
  faceImage: { key: "customer/face.jpg", mimeType: "image/jpeg" },
  eyewearImage: { key: "product/frame.png", mimeType: "image/png" },
};

describe("MockTryOnProvider", () => {
  it("rejects malformed input before enqueueing", () => {
    const provider = new MockTryOnProvider();
    const result = provider.validateInput({
      ...baseInput,
      faceImage: { key: "", mimeType: "" },
    });
    expect(result.valid).toBe(false);
    expect(result.errors?.length).toBeGreaterThan(0);
  });

  it("resolves to completed with a result image after the configured delay", async () => {
    const provider = new MockTryOnProvider({ delayMs: 10, failureRate: 0, timeoutRate: 0 });
    const { providerJobId } = await provider.generateTryOn(baseInput);

    expect((await provider.getJobStatus(providerJobId)).state).toBe("processing");

    await new Promise((r) => setTimeout(r, 25));

    const status = await provider.getJobStatus(providerJobId);
    expect(status.state).toBe("completed");
    expect(status.resultImageUrl).toBeTruthy();
    expect(status.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("can be forced to fail deterministically", async () => {
    const provider = new MockTryOnProvider({ delayMs: 5, failureRate: 1, timeoutRate: 0 });
    const { providerJobId } = await provider.generateTryOn(baseInput);
    await new Promise((r) => setTimeout(r, 15));

    const status = await provider.getJobStatus(providerJobId);
    expect(status.state).toBe("failed");
    expect(status.errorCode).toBe("MOCK_GENERATION_FAILED");
  });

  it("never resolves a forced-timeout job", async () => {
    const provider = new MockTryOnProvider({ delayMs: 5, failureRate: 0, timeoutRate: 1 });
    const { providerJobId } = await provider.generateTryOn(baseInput);
    await new Promise((r) => setTimeout(r, 15));

    const status = await provider.getJobStatus(providerJobId);
    expect(status.state).toBe("processing");
  });

  it("cancelJob forgets the job", async () => {
    const provider = new MockTryOnProvider({ delayMs: 5 });
    const { providerJobId } = await provider.generateTryOn(baseInput);
    await provider.cancelJob(providerJobId);

    const status = await provider.getJobStatus(providerJobId);
    expect(status.state).toBe("failed");
    expect(status.errorCode).toBe("MOCK_JOB_NOT_FOUND");
  });
});
