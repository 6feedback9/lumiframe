// Shared by the worker for two things: downloading a merchant's product
// photo, and downloading a provider's result image. Handles both regular
// http(s) URLs and `data:` URIs (MockTryOnProvider returns a data: URI —
// see packages/providers/mock — so the pipeline never needs a network call
// in dev/CI).

export interface FetchedImage {
  buffer: Buffer;
  mimeType: string;
}

const DATA_URI_RE = /^data:([^;,]+)?(;base64)?,(.*)$/s;

export async function fetchImageBytes(url: string, maxBytes = 15 * 1024 * 1024): Promise<FetchedImage> {
  if (url.startsWith("data:")) {
    const match = url.match(DATA_URI_RE);
    if (!match) throw new Error("Malformed data: URI");
    const [, mime, isBase64, rawPayload] = match;
    const payload = rawPayload ?? "";
    const buffer = isBase64 ? Buffer.from(payload, "base64") : Buffer.from(decodeURIComponent(payload), "utf8");
    if (buffer.length > maxBytes) throw new Error(`Image exceeds max size of ${maxBytes} bytes`);
    return { buffer, mimeType: mime || "application/octet-stream" };
  }

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch image ${url}: HTTP ${res.status}`);
  const contentLength = res.headers.get("content-length");
  if (contentLength && Number(contentLength) > maxBytes) {
    throw new Error(`Image at ${url} exceeds max size of ${maxBytes} bytes`);
  }
  const arrayBuffer = await res.arrayBuffer();
  if (arrayBuffer.byteLength > maxBytes) {
    throw new Error(`Image at ${url} exceeds max size of ${maxBytes} bytes`);
  }
  const mimeType = res.headers.get("content-type") ?? "application/octet-stream";
  return { buffer: Buffer.from(arrayBuffer), mimeType };
}
