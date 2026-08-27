// ARCHITECTURE.md §11/§15: customer photos and try-on results live in
// private buckets behind signed URLs, never public storage. Product assets
// (processed eyewear images) are cacheable but still private — nothing here
// is ever served unsigned.

export interface StorageAdapter {
  putObject(bucket: string, key: string, data: Buffer, contentType: string): Promise<void>;
  /** Returns a time-limited URL a browser can fetch the object from directly. */
  getSignedUrl(bucket: string, key: string, expiresInSeconds: number): Promise<string>;
  deleteObject(bucket: string, key: string): Promise<void>;
}

export const BUCKETS = {
  customerPhotos: "customer-photos",
  tryonResults: "tryon-results",
  productAssets: "product-assets",
} as const;
