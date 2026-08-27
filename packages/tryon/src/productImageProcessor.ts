// Interface only — implementation lands in Phase 2 (ARCHITECTURE.md §16).
//
// Merchant product photos are not transparent, not pre-processed, and
// often have studio/colored/shadowed backgrounds. This is the contract for
// turning an arbitrary product photo URL into a canonical eyewear asset a
// TryOnProvider can use, per the product spec's `ProductImageProcessor`
// responsibilities: download, validate, normalize dimensions, detect
// glasses, isolate/remove background where useful, extract frame geometry
// and lens areas, normalize orientation, cache the result by content hash
// (ARCHITECTURE.md §12).
//
// Defined now so apps/api's job pipeline can be wired against this
// interface in Phase 1 with a trivial pass-through implementation
// (download + normalize dimensions only), and swapped for the real
// detection/background-removal pipeline in Phase 2 without touching the
// worker or the provider layer.

export interface ProcessedProductAsset {
  /** sha256 of the downloaded image bytes — the product image cache key. */
  contentHash: string;
  /** Private-storage key of the normalized/processed image. */
  storageKey: string;
  mimeType: string;
  width: number;
  height: number;
  eyewearDetected: boolean;
  /** Normalized [x, y, width, height], 0–1 relative to image dimensions. */
  boundingBox?: [number, number, number, number];
  backgroundRemoved: boolean;
}

export interface ProductImageProcessor {
  /**
   * Idempotent given the same URL contents: if an asset with the same
   * content hash has already been processed, implementations should return
   * the cached ProcessedProductAsset instead of reprocessing.
   */
  process(productImageUrl: string): Promise<ProcessedProductAsset>;
}
