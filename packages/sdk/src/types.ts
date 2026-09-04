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
   * CSS selector for the page's live/current product image — the element
   * the theme actually updates when a shopper picks a different
   * color/style swatch. Needed on any product page with multiple variant
   * photos: JSON-LD/OpenGraph/microdata alone reflect only whichever
   * variant was default when the page first loaded, not a swatch click
   * (packages/sdk/README.md's "Products with multiple colors/styles" has
   * the full explanation + how to find the right selector). Equivalent to
   * calling `TryOn.configureSelectors({ productImageSelector })` yourself.
   */
  productImageSelector?: string;
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
  /** `"gradient"` (default) blends buttonColorStart -> buttonColorEnd; `"solid"` uses buttonColorStart flat; `"outline"` drops the fill entirely — just a buttonColorStart-colored border and text on a transparent background. */
  buttonStyle?: "gradient" | "solid" | "outline";
  /** Continuous scale, percent of the default size. 100 = default. Range 70-160. Scales the button uniformly (both height and width). */
  buttonSize?: number;
  /** Stretches the button's horizontal padding only, on top of `buttonSize` — makes it longer without also making it taller. 100 = default (no stretch). Range 100-300. */
  buttonWidth?: number;
  /**
   * Explicit text size in px, independent of `buttonSize` — unset (default)
   * means the label still scales with `buttonSize` as before (15px at
   * 100%), for a merchant who just wants "bigger/smaller button" from one
   * slider. Set this when the two need to move independently instead: a
   * wider/taller button (`buttonSize`/`buttonWidth`) whose label should
   * stay compact, or vice versa (product ask: "размер шрифта в кнопке").
   * Range 10-28.
   */
  buttonFontSize?: number;
  /**
   * Explicit label font-weight, unset defaults to 600 (semi-bold). Real
   * themes' own buttons are usually plain body-text weight (400) — set
   * this to 400 to match one instead of the bolder default. Range 300-900.
   */
  buttonFontWeight?: number;
  /**
   * Stretches the button to fill its container's full width — matching a
   * theme's own "Add to cart"/"Buy it now" (usually edge-to-edge in their
   * shared column) rather than the button's own natural content width.
   * Default `false`. Real report: buttonSize/buttonFontSize matched a
   * theme's button exactly in height and text, but ours still sat at its
   * own shorter content width next to full-width neighbors.
   */
  buttonFullWidth?: boolean;
  /** `"rounded"` (default) is a fully rounded pill. `"rectangular"` is a normal ~8px corner radius. */
  buttonShape?: "rounded" | "rectangular";
  /** Default `"none"`. `"pulse"` is a soft expanding ring in the accent color; `"shimmer"` is a light sweep across the button. */
  buttonAnimation?: "none" | "pulse" | "shimmer";
  /** Show the "Try another photo" action on the try-on result screen. Default `true`. */
  showTryAnotherButton?: boolean;
  /** Show the "Back to product" action on the try-on result screen. Default `true`. */
  showBackButton?: boolean;
  /** Overrides the try-on window's default upload-step heading/subheading text. */
  modalHeading?: string;
  modalSubheading?: string;
  /**
   * The try-on window's own accent color (its primary button, spinner,
   * upload-zone border) — independent of the page button's colors above.
   * Defaults to the button's colors when omitted, so a merchant who never
   * touches these still gets a consistent look; set explicitly for a
   * window that should look different from the page button.
   */
  modalAccentColorStart?: string;
  modalAccentColorEnd?: string;
  modalAccentTextColor?: string;
  /**
   * `"split"` (default) — the try-on window fills the whole page. `"compact"`
   * — a small floating card instead, over the dimmed (still-visible)
   * product page — see packages/widget's own MountWidgetOptions.
   */
  modalLayout?: "split" | "compact";
  /**
   * Also add a smaller "Try on" affordance to every product card on a
   * catalog/collection page (packages/sdk/src/detectCards.ts) — not just
   * the single button on a product page. Default `false`: opt-in, since it
   * touches every card the detector finds instead of one known button.
   * Reuses buttonColorStart/End/TextColor/Style above — no separate color
   * config for the card affordance.
   */
  cardButtonEnabled?: boolean;
  /**
   * Visual style of the per-card affordance. `"corner"` (default) — a
   * small circular badge in the thumbnail's corner that expands into a
   * label on hover (desktop); stays compact on touch, with a one-time
   * pulse on the first card to teach what it does. `"drawer"` — a strip
   * that slides up from the bottom of the thumbnail on hover, and sits
   * permanently under it on touch. `"scrim"` — the whole thumbnail dims
   * slightly with a centered pill on hover; a compact corner pill on touch.
   */
  cardButtonVariant?: "corner" | "drawer" | "scrim";
  /**
   * Restricts where the widget shows itself at all — both the auto-injected
   * product-page button and, per matching card, the catalog card buttons
   * above. Comma-separated keywords checked (case-insensitively) against
   * the product's own URL *and* its title; a match on either, on any one
   * keyword, is enough. Empty/unset (default) means "everywhere detection
   * succeeds", the original behavior.
   *
   * Exists for a merchant whose store isn't eyewear-only: pasting the
   * snippet once, sitewide, would otherwise put a "Try on" button on every
   * product regardless of category. Configuring this from the dashboard —
   * no Liquid/theme editing, no per-product template — is the deliberate
   * point: product ask was "нужно придумать чтобы это можно было
   * реализовать через кабинет клиента" after "не моя головная боль" (whose
   * job it is to touch the merchant's theme) turned out to be the wrong
   * answer. Also checks the title, not just the URL (despite the option's
   * name, kept as-is for backward compatibility with configs already
   * saved): a real report set up a product titled "Окуляри ..." on a store
   * whose URLs are generic seed-data handles with no distinguishing word
   * at all — URL-only matching had no way to ever succeed there, even
   * though the merchant's own naming made the intent completely clear.
   * Manual `attach()`/`open()` calls are NOT filtered — a merchant wiring
   * their own trigger has already made that placement decision.
   */
  categoryUrlKeywords?: string;
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
