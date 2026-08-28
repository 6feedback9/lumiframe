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
  /** Modal width in px on wide viewports (>=560px). Default 560. */
  modalMaxWidth?: number;
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
  accentStyle?: "gradient" | "solid";
  accentTextColor?: string;
  /** Overrides the default upload-step heading/subheading text. */
  modalHeading?: string;
  modalSubheading?: string;
}

export interface WidgetHandle {
  close(): void;
}
