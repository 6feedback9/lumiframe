// Domain types shared by the API, worker, and providers. These are the
// contracts referenced in ARCHITECTURE.md §6/§8 — nothing here is
// provider-specific.

/**
 * The product data captured from the merchant's page at the moment the
 * customer opened the widget. This is a SNAPSHOT, not a catalog reference —
 * see ARCHITECTURE.md §4. `imageUrl` must resolve to one of the store's
 * `allowedDomains` (enforced before this type is ever constructed from
 * request input).
 */
export interface ProductSnapshot {
  externalProductId: string;
  title?: string;
  url?: string;
  imageUrl: string;
  sku?: string;
  price?: number;
  currency?: string;
}

/** UTM + click-id attribution context captured once at session creation. */
export interface AttributionContext {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;
  gclid?: string;
  fbclid?: string;
  ttclid?: string;
  referrer?: string;
  device?: string;
}

/** A private-storage image reference, resolved to a signed URL at read time. */
export interface StoredImageRef {
  /** Object key in private storage (packages/storage), not a public URL. */
  key: string;
  mimeType: string;
  /**
   * A signed URL the provider can fetch the bytes from directly, resolved
   * by the worker immediately before calling generateTryOn (short-lived —
   * providers must not persist it). Optional because MockTryOnProvider
   * never needs to fetch anything; a real vendor adapter will require it.
   */
  url?: string;
  width?: number;
  height?: number;
}

/**
 * Everything a TryOnProvider needs to generate one result. `faceImage` is
 * the customer's photo; `eyewearImage` is the canonical processed product
 * asset (ARCHITECTURE.md §12) — by the time this type is constructed, the
 * arbitrary merchant product photo has already been normalized.
 */
export interface TryOnGenerationInput {
  tryOnSessionId: string;
  tryOnGenerationId: string;
  faceImage: StoredImageRef;
  eyewearImage: StoredImageRef;
  /** Passed through to the provider for logging/debugging only. */
  metadata?: Record<string, unknown>;
}

export type TryOnJobState = "queued" | "processing" | "completed" | "failed" | "timeout";

/** Returned immediately by `generateTryOn` — the job is not awaited inline. */
export interface TryOnJobHandle {
  providerJobId: string;
}

export interface TryOnJobStatus {
  state: TryOnJobState;
  /** Present only when state === "completed". */
  resultImageUrl?: string;
  /** Present only when state is "failed" or "timeout". */
  errorCode?: string;
  errorMessage?: string;
  /** Wall-clock time spent generating, once known. */
  durationMs?: number;
}

export interface TryOnValidationResult {
  valid: boolean;
  errors?: string[];
}
