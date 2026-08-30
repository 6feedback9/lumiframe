import { describe, expect, it, vi, beforeEach } from "vitest";
import type { TryOnGenerationInput } from "@lumiframe/tryon";

// Mock the `fashn` package before importing the module under test, so
// FashnTryOnProvider's constructor never tries a real client, and
// predictions.run/status are fully under test control.
const runMock = vi.fn();
const statusMock = vi.fn();

class MockAPIError extends Error {
  constructor(message: string) {
    super(message);
  }
}
// Named to match the real SDK's own class name, not prefixed "Mock" —
// errorCodeFor() derives the error code from error.constructor.name, so a
// mock class named differently from the real one it stands in for would
// make this test assert on an artifact of the mock rather than on the
// actual behavior it's meant to verify.
class AuthenticationError extends MockAPIError {}

vi.mock("fashn", () => ({
  default: vi.fn().mockImplementation(() => ({
    predictions: { run: runMock, status: statusMock },
  })),
  APIError: MockAPIError,
  AuthenticationError,
}));

const { FashnTryOnProvider } = await import("./index");

const baseInput: TryOnGenerationInput = {
  tryOnSessionId: "session_1",
  tryOnGenerationId: "gen_1",
  faceImage: { key: "customer/face.jpg", mimeType: "image/jpeg", url: "https://storage.example.com/face.jpg" },
  eyewearImage: { key: "product/frame.png", mimeType: "image/png", buffer: Buffer.from("real-bytes") },
};

beforeEach(() => {
  runMock.mockReset();
  statusMock.mockReset();
});

describe("FashnTryOnProvider", () => {
  it("throws at construction without an API key", () => {
    expect(() => new FashnTryOnProvider({})).toThrow(/FASHN_API_KEY/);
  });

  it("rejects malformed input before calling FASHN", () => {
    const provider = new FashnTryOnProvider({ apiKey: "test-key" });
    const result = provider.validateInput({
      ...baseInput,
      faceImage: { key: "", mimeType: "" },
    });
    expect(result.valid).toBe(false);
    expect(runMock).not.toHaveBeenCalled();
  });

  it("prefers a URL over base64 for an image that has both", async () => {
    runMock.mockResolvedValue({ id: "pred_1" });
    const provider = new FashnTryOnProvider({ apiKey: "test-key" });
    await provider.generateTryOn(baseInput);

    const call = runMock.mock.calls[0]?.[0];
    expect(call.model_name).toBe("tryon-max");
    expect(call.inputs.model_image).toBe("https://storage.example.com/face.jpg");
  });

  it("base64-encodes an image that only has a buffer", async () => {
    runMock.mockResolvedValue({ id: "pred_1" });
    const provider = new FashnTryOnProvider({ apiKey: "test-key" });
    await provider.generateTryOn(baseInput);

    const call = runMock.mock.calls[0]?.[0];
    expect(call.inputs.product_image).toBe(`data:image/png;base64,${Buffer.from("real-bytes").toString("base64")}`);
  });

  it("returns FASHN's own prediction id as the job handle", async () => {
    runMock.mockResolvedValue({ id: "pred_abc123" });
    const provider = new FashnTryOnProvider({ apiKey: "test-key" });
    const { providerJobId } = await provider.generateTryOn(baseInput);
    expect(providerJobId).toBe("pred_abc123");
  });

  it("maps queued/processing/completed statuses without polling itself — one status() call per getJobStatus()", async () => {
    const provider = new FashnTryOnProvider({ apiKey: "test-key" });

    statusMock.mockResolvedValueOnce({ id: "pred_1", status: "in_queue", output: null, error: null });
    expect((await provider.getJobStatus("pred_1")).state).toBe("queued");

    statusMock.mockResolvedValueOnce({ id: "pred_1", status: "processing", output: null, error: null });
    expect((await provider.getJobStatus("pred_1")).state).toBe("processing");

    statusMock.mockResolvedValueOnce({ id: "pred_1", status: "completed", output: ["https://cdn.fashn.ai/result.jpg"], error: null });
    const completed = await provider.getJobStatus("pred_1");
    expect(completed.state).toBe("completed");
    expect(completed.resultImageUrl).toBe("https://cdn.fashn.ai/result.jpg");

    expect(statusMock).toHaveBeenCalledTimes(3);
  });

  it("surfaces FASHN's structured error name/message on a failed prediction", async () => {
    statusMock.mockResolvedValue({
      id: "pred_1",
      status: "failed",
      output: null,
      error: { name: "ContentModerationError", message: "Prohibited content detected" },
    });

    const provider = new FashnTryOnProvider({ apiKey: "test-key" });
    const status = await provider.getJobStatus("pred_1");
    expect(status.state).toBe("failed");
    expect(status.errorCode).toBe("ContentModerationError");
    expect(status.errorMessage).toBe("Prohibited content detected");
  });

  it("maps time_out to the timeout state and canceled to failed", async () => {
    const provider = new FashnTryOnProvider({ apiKey: "test-key" });

    statusMock.mockResolvedValueOnce({ id: "pred_1", status: "time_out", output: null, error: null });
    expect((await provider.getJobStatus("pred_1")).state).toBe("timeout");

    statusMock.mockResolvedValueOnce({ id: "pred_1", status: "canceled", output: null, error: null });
    expect((await provider.getJobStatus("pred_1")).state).toBe("failed");
  });

  it("fails cleanly with a providerJobId when /v1/run itself throws, instead of throwing past generateTryOn", async () => {
    runMock.mockRejectedValue(new Error("network blip"));

    const provider = new FashnTryOnProvider({ apiKey: "test-key" });
    const { providerJobId } = await provider.generateTryOn(baseInput);
    expect(providerJobId).toBeTruthy();

    const status = await provider.getJobStatus(providerJobId);
    expect(status.state).toBe("failed");
    expect(status.errorCode).toBe("FASHN_REQUEST_FAILED");
    expect(status.errorMessage).toBe("network blip");
    // The pre-flight failure is answered locally — FASHN never issued a
    // real prediction id, so there's nothing to poll status() for.
    expect(statusMock).not.toHaveBeenCalled();
  });

  it("distinguishes an APIError subclass's failure reason in the error code", async () => {
    runMock.mockRejectedValue(new AuthenticationError("Unauthorized: Invalid token"));

    const provider = new FashnTryOnProvider({ apiKey: "test-key" });
    const { providerJobId } = await provider.generateTryOn(baseInput);
    const status = await provider.getJobStatus(providerJobId);
    expect(status.errorCode).toBe("FASHN_AUTHENTICATION_ERROR");
  });

  it("cancelJob is a no-op that doesn't throw", async () => {
    runMock.mockResolvedValue({ id: "pred_1" });
    const provider = new FashnTryOnProvider({ apiKey: "test-key" });
    const { providerJobId } = await provider.generateTryOn(baseInput);
    await expect(provider.cancelJob(providerJobId)).resolves.toBeUndefined();
  });
});
