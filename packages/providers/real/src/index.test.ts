import { describe, expect, it, vi, beforeEach } from "vitest";
import type { TryOnGenerationInput } from "@lumiframe/tryon";

// Mock @google/genai before importing the module under test, so
// GeminiTryOnProvider's constructor never tries a real client, and
// generateContent() is fully under test control.
const generateContentMock = vi.fn();
vi.mock("@google/genai", () => ({
  GoogleGenAI: vi.fn().mockImplementation(() => ({
    models: { generateContent: generateContentMock },
  })),
  Modality: { TEXT: "TEXT", IMAGE: "IMAGE" },
}));

// Mock @lumiframe/storage's fetchImageBytes so no real network call happens
// for the "signed URL" inputs either.
vi.mock("@lumiframe/storage", () => ({
  fetchImageBytes: vi.fn().mockResolvedValue({ buffer: Buffer.from("fake-bytes"), mimeType: "image/jpeg" }),
}));

const { GeminiTryOnProvider } = await import("./index");
const { fetchImageBytes: fetchImageBytesMock } = await import("@lumiframe/storage");

const baseInput: TryOnGenerationInput = {
  tryOnSessionId: "session_1",
  tryOnGenerationId: "gen_1",
  faceImage: { key: "customer/face.jpg", mimeType: "image/jpeg", url: "https://storage.example.com/face.jpg" },
  eyewearImage: { key: "product/frame.png", mimeType: "image/png", url: "https://storage.example.com/frame.png" },
};

beforeEach(() => {
  generateContentMock.mockReset();
  vi.mocked(fetchImageBytesMock).mockClear();
});

describe("GeminiTryOnProvider", () => {
  it("throws at construction without an API key", () => {
    expect(() => new GeminiTryOnProvider({})).toThrow(/GEMINI_API_KEY/);
  });

  it("rejects malformed input before calling Gemini", () => {
    const provider = new GeminiTryOnProvider({ apiKey: "test-key" });
    const result = provider.validateInput({
      ...baseInput,
      faceImage: { key: "", mimeType: "" },
    });
    expect(result.valid).toBe(false);
    expect(generateContentMock).not.toHaveBeenCalled();
  });

  it("resolves to completed with a data: URI on a successful image response", async () => {
    generateContentMock.mockResolvedValue({
      candidates: [{ content: { parts: [{ inlineData: { data: "ZmFrZQ==", mimeType: "image/png" } }] } }],
    });

    const provider = new GeminiTryOnProvider({ apiKey: "test-key" });
    const { providerJobId } = await provider.generateTryOn(baseInput);
    const status = await provider.getJobStatus(providerJobId);

    expect(status.state).toBe("completed");
    expect(status.resultImageUrl).toBe("data:image/png;base64,ZmFrZQ==");
    expect(generateContentMock).toHaveBeenCalledTimes(1);
    const call = generateContentMock.mock.calls[0]?.[0];
    expect(call.model).toBeTruthy();
    expect(call.contents[0].parts).toHaveLength(3); // prompt text + 2 images
  });

  it("uses inline buffer bytes when present instead of fetching by URL", async () => {
    generateContentMock.mockResolvedValue({
      candidates: [{ content: { parts: [{ inlineData: { data: "ZmFrZQ==", mimeType: "image/png" } }] } }],
    });

    // The worker sets this for the product image (it already downloaded
    // the bytes to compute a content hash) — no reason to also round-trip
    // them through our storage and a signed URL just to read them back.
    const provider = new GeminiTryOnProvider({ apiKey: "test-key" });
    await provider.generateTryOn({
      ...baseInput,
      eyewearImage: { key: "product/frame.png", mimeType: "image/png", buffer: Buffer.from("real-bytes") },
    });

    // Only the customer photo (still URL-only) should have gone through
    // fetchImageBytes — the product image's inline buffer must not.
    expect(fetchImageBytesMock).toHaveBeenCalledTimes(1);
    expect(fetchImageBytesMock).toHaveBeenCalledWith("https://storage.example.com/face.jpg");
    const call = generateContentMock.mock.calls[0]?.[0];
    const inlineDatas = call.contents[0].parts.filter((p: { inlineData?: unknown }) => p.inlineData).map((p: { inlineData: { data: string } }) => p.inlineData.data);
    expect(inlineDatas).toContain(Buffer.from("real-bytes").toString("base64"));
  });

  it("fails cleanly when Gemini returns no image (e.g. a safety refusal)", async () => {
    generateContentMock.mockResolvedValue({
      candidates: [{ content: { parts: [{ text: "I can't do that." }] }, finishMessage: "Blocked by safety filters" }],
    });

    const provider = new GeminiTryOnProvider({ apiKey: "test-key" });
    const { providerJobId } = await provider.generateTryOn(baseInput);
    const status = await provider.getJobStatus(providerJobId);

    expect(status.state).toBe("failed");
    expect(status.errorCode).toBe("GEMINI_NO_IMAGE");
    expect(status.errorMessage).toBe("Blocked by safety filters");
  });

  it("fails cleanly when the Gemini call itself throws on every attempt", async () => {
    generateContentMock.mockRejectedValue(new Error("network blip"));

    const provider = new GeminiTryOnProvider({ apiKey: "test-key" });
    const { providerJobId } = await provider.generateTryOn(baseInput);
    const status = await provider.getJobStatus(providerJobId);

    expect(status.state).toBe("failed");
    expect(status.errorCode).toBe("GEMINI_REQUEST_FAILED");
    expect(status.errorMessage).toBe("network blip");
    // MAX_ATTEMPTS = 3 — a transient-looking failure gets retried before
    // giving up, not just a single shot.
    expect(generateContentMock).toHaveBeenCalledTimes(3);
  });

  it("retries after failed attempts and succeeds on the last one", async () => {
    generateContentMock
      .mockRejectedValueOnce(new Error("network blip"))
      .mockRejectedValueOnce(new Error("network blip"))
      .mockResolvedValueOnce({
        candidates: [{ content: { parts: [{ inlineData: { data: "ZmFrZQ==", mimeType: "image/png" } }] } }],
      });

    const provider = new GeminiTryOnProvider({ apiKey: "test-key" });
    const { providerJobId } = await provider.generateTryOn(baseInput);
    const status = await provider.getJobStatus(providerJobId);

    expect(status.state).toBe("completed");
    expect(generateContentMock).toHaveBeenCalledTimes(3);
  });

  it("does not retry a clean no-image result — that's a real response, not a transient failure", async () => {
    generateContentMock.mockResolvedValue({
      candidates: [{ content: { parts: [{ text: "I can't do that." }] }, finishMessage: "Blocked by safety filters" }],
    });

    const provider = new GeminiTryOnProvider({ apiKey: "test-key" });
    await provider.generateTryOn(baseInput);

    expect(generateContentMock).toHaveBeenCalledTimes(1);
  });

  it("getJobStatus on an unknown job id reports not-found instead of throwing", async () => {
    const provider = new GeminiTryOnProvider({ apiKey: "test-key" });
    const status = await provider.getJobStatus("nonexistent");
    expect(status.state).toBe("failed");
    expect(status.errorCode).toBe("GEMINI_JOB_NOT_FOUND");
  });

  it("cancelJob forgets the job", async () => {
    generateContentMock.mockResolvedValue({
      candidates: [{ content: { parts: [{ inlineData: { data: "ZmFrZQ==", mimeType: "image/png" } }] } }],
    });
    const provider = new GeminiTryOnProvider({ apiKey: "test-key" });
    const { providerJobId } = await provider.generateTryOn(baseInput);
    await provider.cancelJob(providerJobId);

    const status = await provider.getJobStatus(providerJobId);
    expect(status.errorCode).toBe("GEMINI_JOB_NOT_FOUND");
  });
});
