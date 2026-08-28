// Public SDK contract. Product spec §9/§42-44, ARCHITECTURE.md §8.

export interface TryOnInitOptions {
  storeId: string;
  /** Defaults to the production API; override for local/staging. */
  apiBaseUrl?: string;
  locale?: "en" | "uk" | "ru";
  /**
   * Automatically insert a "Try on" button on the product page once a
   * product can be resolved (ARCHITECTURE.md §8) — next to the page's
   * add-to-cart button, or near the main heading as a fallback. Default
   * `true`; this is what the dashboard's integration snippet promises
   * merchants. Set `false` to place your own trigger element and call
   * `TryOn.open()` from its click handler instead.
   */
  autoInject?: boolean;
  /** Overrides the default "Try on" label on the auto-injected button. */
  buttonLabel?: string;
  /**
   * CSS selector for where to insert the auto-injected button, instead of
   * the built-in add-to-cart-button/heading heuristics. Useful on a
   * storefront where those heuristics pick the wrong spot.
   */
  buttonAnchorSelector?: string;
  /**
   * Where the auto-injected button lands relative to its anchor (the
   * add-to-cart button, `buttonAnchorSelector`, or the page heading
   * fallback). `"after"` (default) matches the original behavior — right
   * after the anchor. `"before"` puts it just above. `"floating"` ignores
   * the anchor entirely and pins the button to the bottom-right corner of
   * the viewport — useful on a page where no anchor placement looks right.
   */
  buttonPosition?: "before" | "after" | "floating";
  /**
   * Button appearance overrides (dashboard's "Button design" page writes
   * these into the generated snippet from Store.widgetConfig). Any CSS
   * color value works for the color fields (`#hex`, `rgb()`, a named
   * color). `buttonGlow` adds a soft box-shadow in the accent color.
   */
  buttonColorStart?: string;
  buttonColorEnd?: string;
  buttonTextColor?: string;
  buttonFont?: string;
  /** A static glow in the accent color. Ignored when `buttonAnimation` is set to anything but `"none"` — the animation drives the same box-shadow. */
  buttonGlow?: boolean;
  /** `"gradient"` (default) blends buttonColorStart -> buttonColorEnd; `"solid"` uses buttonColorStart flat. */
  buttonStyle?: "gradient" | "solid";
  /** Default `"md"`. */
  buttonSize?: "sm" | "md" | "lg";
  /** Default `"none"`. `"pulse"` is a soft expanding ring in the accent color; `"shimmer"` is a light sweep across the button. */
  buttonAnimation?: "none" | "pulse" | "shimmer";
  /** Try-on modal width in px on wide viewports (>=560px). Default 560. */
  modalMaxWidth?: number;
  /** Show the "Try another photo" action on the try-on result screen. Default `true`. */
  showTryAnotherButton?: boolean;
  /** Show the "Back to product" action on the try-on result screen. Default `true`. */
  showBackButton?: boolean;
  /** Overrides the try-on window's default upload-step heading/subheading text. */
  modalHeading?: string;
  modalSubheading?: string;
}

/**
 * Explicit product configuration — priority 1 in the detection order
 * (ARCHITECTURE.md §8). Anything omitted here falls through to platform
 * adapter → JSON-LD → OpenGraph → merchant-configured DOM selectors.
 */
export interface AttachProductInput {
  productId: string;
  productTitle?: string;
  productImageUrl: string;
  productUrl?: string;
  price?: number;
  currency?: string;
  sku?: string;
}

export type SdkEventName =
  | "tryon:open"
  | "tryon:photo-selected"
  | "tryon:started"
  | "tryon:processing"
  | "tryon:completed"
  | "tryon:failed"
  | "tryon:add-to-cart"
  | "tryon:feedback"
  | "tryon:close";

export interface SdkEventPayloads {
  "tryon:open": { product: AttachProductInput };
  "tryon:photo-selected": { product: AttachProductInput };
  "tryon:started": { product: AttachProductInput; tryOnId: string };
  "tryon:processing": { tryOnId: string };
  "tryon:completed": { tryOnId: string; resultUrl: string };
  "tryon:failed": { tryOnId?: string; errorCode: string; errorMessage?: string };
  "tryon:add-to-cart": { product: AttachProductInput; tryOnId?: string };
  "tryon:feedback": { tryOnId: string; rating: "LIKE" | "DISLIKE" };
  "tryon:close": Record<string, never>;
}

export type SdkEventListener<E extends SdkEventName> = (payload: SdkEventPayloads[E]) => void;

export interface TryOnSdk {
  init(options: TryOnInitOptions): TryOnSdk;
  attach(product: AttachProductInput): void;
  open(product?: AttachProductInput): void;
  close(): void;
  destroy(): void;
  on<E extends SdkEventName>(event: E, listener: SdkEventListener<E>): () => void;
}
