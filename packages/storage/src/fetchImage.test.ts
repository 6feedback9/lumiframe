import { describe, expect, it } from "vitest";
import { fetchImageBytes } from "./fetchImage";

describe("fetchImageBytes", () => {
  it("decodes a base64 data: URI", async () => {
    const original = Buffer.from("not really a png, just test bytes");
    const dataUri = `data:image/png;base64,${original.toString("base64")}`;

    const result = await fetchImageBytes(dataUri);

    expect(result.mimeType).toBe("image/png");
    expect(result.buffer.equals(original)).toBe(true);
  });

  it("rejects a data: URI over the size limit", async () => {
    const big = Buffer.alloc(1024, 1);
    const dataUri = `data:image/png;base64,${big.toString("base64")}`;

    await expect(fetchImageBytes(dataUri, 100)).rejects.toThrow(/exceeds max size/);
  });

  it("throws on a malformed data: URI", async () => {
    await expect(fetchImageBytes("data:not-a-valid-uri")).rejects.toThrow(/Malformed/);
  });
});
