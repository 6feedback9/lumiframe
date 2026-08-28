// ARCHITECTURE.md §11/§15: customer photos and try-on results live in
// private buckets behind signed URLs, never public storage. Product assets
// (processed eyewear images) are cacheable but still private — nothing here
// is ever served unsigned.

export interface StorageAdapter {
  putObject(bucket: string, key: string, data: Buffer, contentType: string): Promise<void>;
  /** Returns a time-limited URL a browser can fetch the object from directly. */
  getSignedUrl(bucket: string, key: string, expiresInSeconds: number): Promise<string>;
  /**
   * Batched version of getSignedUrl — one round trip for many keys in the
   * same bucket instead of N (the Supabase adapter's getSignedUrl is a real
   * network call per key; a list page with 10-20 rows was firing that many
   * concurrent requests to Supabase Storage, which is what actually made
   * the try-ons list feel like it hangs — product-reported slowness).
   * Missing/failed keys are simply absent from the result rather than
   * throwing, so one bad key doesn't sink the whole page.
   */
  getSignedUrls(bucket: string, keys: string[], expiresInSeconds: number): Promise<Record<string, string>>;
  deleteObject(bucket: string, key: string): Promise<void>;
}

export const BUCKETS = {
  customerPhotos: "customer-photos",
  tryonResults: "tryon-results",
  productAssets: "product-assets",
} as const;
