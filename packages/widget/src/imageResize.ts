// Downscales/recompresses a customer's photo client-side before it goes
// into the JSON `customerImage` data: URI payload (packages/sdk README) —
// an unmodified phone photo can be 8-20MB+, which is slow to upload on a
// mobile connection, close to (or over) the API's request body limit, and
// — once a real AI provider is wired up (ARCHITECTURE.md §13) — more than
// it needs to pay to process. Always resolves; on any decode/canvas
// failure it falls back to the untouched original rather than blocking
// the customer's upload.

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.85;
// Below this, and already a JPEG at an acceptable resolution, re-encoding
// only costs time for no real size win.
const SKIP_REENCODE_BELOW_BYTES = 2_000_000;

interface ImageSource {
  source: CanvasImageSource;
  width: number;
  height: number;
  cleanup: () => void;
}

async function loadImageSource(file: File): Promise<ImageSource> {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file);
    return { source: bitmap, width: bitmap.width, height: bitmap.height, cleanup: () => bitmap.close() };
  }
  // Older-browser fallback — createImageBitmap has been broadly supported
  // for years, but this keeps a very old customer's browser working too.
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => resolve({ source: img, width: img.naturalWidth, height: img.naturalHeight, cleanup: () => URL.revokeObjectURL(url) });
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not decode image"));
    };
    img.src = url;
  });
}

/** Reads a File into a base64 data: URI as-is — no resizing. The fallback path. */
export function fileToDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * Downscales to at most `MAX_DIMENSION` on the long edge and re-encodes as
 * JPEG at `JPEG_QUALITY`, unless the file is already small enough that
 * it's not worth it. Never rejects.
 */
export async function fileToUploadDataUri(file: File): Promise<string> {
  try {
    const { source, width, height, cleanup } = await loadImageSource(file);
    try {
      const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height));
      const alreadySmallJpeg = scale === 1 && file.type === "image/jpeg" && file.size < SKIP_REENCODE_BELOW_BYTES;
      if (alreadySmallJpeg) return await fileToDataUri(file);

      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) return await fileToDataUri(file);
      ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
    } finally {
      cleanup();
    }
  } catch {
    return fileToDataUri(file);
  }
}
