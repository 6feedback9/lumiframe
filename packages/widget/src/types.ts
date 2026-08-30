export interface WidgetProduct {
  productId: string;
  productTitle?: string;
  productImageUrl: string;
  productUrl?: string;
  price?: number;
  currency?: string;
  sku?: string;
}

export type WidgetEventName =
  | "tryon:photo-selected"
  | "tryon:started"
  | "tryon:processing"
  | "tryon:completed"
  | "tryon:failed"
  | "tryon:add-to-cart"
  | "tryon:feedback";

export interface MountWidgetOptions {
  product: WidgetProduct;
  apiBaseUrl: string;
  storeId: string;
  locale: "en" | "uk" | "ru";
  onEvent: (event: WidgetEventName, payload: unknown) => void;
  onClose: () => void;
  /** Show the "Try another photo" action on the result screen. Default true. */
  showTryAnotherButton?: boolean;
  /** Show the "Back to product" action on the result screen. Default true. */
  showBackButton?: boolean;
  /**
   * The modal's own accent (its "Try On"/"Add to cart" buttons, the
   * spinner, the upload zone's hover border) — same accent the merchant
   * already configures for the auto-injected page button, reused here so
   * the two look like one product instead of two different blues.
   */
  accentColorStart?: string;
  accentColorEnd?: string;
  // "outline" is a page-button-only style (packages/sdk) — the modal's own
  // buttons stay filled regardless, so this just falls back to "gradient"
  // for that case, same as any other unrecognized value.
  accentStyle?: "gradient" | "solid" | "outline";
  accentTextColor?: string;
  /** Overrides the default upload-step heading/subheading text. */
  modalHeading?: string;
  modalSubheading?: string;
  /**
   * `"split"` (default) — the current full-page takeover: photo on one
   * side, product + cart on the other. `"compact"` — a small floating
   * card over the (dimmed, still-visible) product page instead, closer
   * to the original design before the full-page split view (product ask:
   * bring the small popup back as a *second* option, not a replacement).
   * Same upload/generate/result flow either way — only the shell's size,
   * position and backdrop differ.
   */
  modalLayout?: "split" | "compact";
}

export interface WidgetHandle {
  close(): void;
}
