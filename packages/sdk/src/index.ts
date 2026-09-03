// Universal JS SDK — the one script merchants embed. Kept dependency-free
// and small; the widget (packages/widget) is only pulled in, via dynamic
// import, the moment a customer actually opens it (product spec §42/§10:
// "load the heavy widget only after the customer clicks Try On").
//
// Usage:
//   <script src=".../lumiframe-sdk.js"></script>
//   <script>
//     TryOn.init({ storeId: "store_123" });
//     TryOn.attach({ productId: "RB-001", productImageUrl: "..." });
//   </script>

import { detectCards } from "./detectCards";
import { detectProduct, enrichFromShopify, type DomSelectorConfig } from "./detectProduct";
import type {
  AttachProductInput,
  SdkEventListener,
  SdkEventName,
  SdkEventPayloads,
  TryOnInitOptions,
  TryOnSdk,
} from "./types";

const DEFAULT_API_BASE_URL = "https://api.lumiframe.com";

// Priority order for where to auto-insert the "Try on" button, matched
// against a merchant's existing add-to-cart control — chosen to cover
// Shopify's default themes (`.product-form__submit`, `[name="add"]`) as
// well as generic/WooCommerce markup (`.add-to-cart`, `.btn-cart`).
const CART_BUTTON_SELECTORS =
  '.add-to-cart, [name="add"], .btn-cart, .product-form__submit, [data-add-to-cart], button[type="submit"][name="add"]';

/**
 * True if any of `keywords` (comma-separated, case-insensitive substring
 * match) is found in the product's URL *or* its title — or if `keywords`
 * is unset/empty, in which case there's no restriction at all. See
 * TryOnInitOptions' `categoryUrlKeywords` doc comment for what this is for.
 *
 * Checks the title as well as the URL (not just the URL, despite the
 * option's name — kept for backward compatibility with configs already
 * saved) because a real merchant's own naming convention is often the
 * one honest, always-present signal: a real report set up a product
 * titled "Окуляри The Collection Snowboard: Liquid" specifically to mark
 * it as eyewear, on a store whose URLs are generic seed-data handles
 * ("the-collection-snowboard-liquid") with no distinguishing word in them
 * at all — a URL-only match had no way to ever succeed for that store,
 * even though the merchant's own title made the intent completely clear.
 */
function matchesCategoryFilter(product: { productUrl?: string; productTitle?: string }, keywords: string | undefined): boolean {
  if (!keywords?.trim()) return true;
  const haystack = `${product.productUrl ?? ""} ${product.productTitle ?? ""}`.toLowerCase();
  return keywords
    .split(",")
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean)
    .some((k) => haystack.includes(k));
}

/**
 * True when `url` points at the page currently open — i.e. the "card"
 * detectCards() matched isn't a different catalog entry at all, it's this
 * same product page's own link+thumbnail (a real report, with the store's
 * actual theme code confirmed: a related-products/recommendation block, or
 * any other in-page element, can link back to the very product already on
 * screen). injectCardButtons() runs on every page the snippet is on,
 * product pages included, and tryAutoInject() already gives that exact
 * product its own dedicated button — wrapping its own hero image in a
 * second, redundant mini-card trigger on top of it is never correct, on
 * any theme, regardless of which element happened to cause the match.
 * Compares path only (no query/hash) so a tracking param on one side
 * doesn't defeat an otherwise-real match.
 */
function isCurrentPageProduct(url: string | undefined): boolean {
  if (!url || typeof window === "undefined") return false;
  // Trailing slash is not a meaningful difference for this comparison
  // (Shopify itself redirects "/products/x" <-> "/products/x/" — a
  // catalog card's href and location.pathname can disagree on it even
  // when they're the same product), so strip one before comparing.
  const normalize = (path: string) => path.replace(/\/$/, "");
  try {
    return normalize(new URL(url, window.location.href).pathname) === normalize(window.location.pathname);
  } catch {
    return false;
  }
}

/**
 * Best-effort language for the try-on window when the merchant hasn't set
 * `locale` explicitly — reads the page's own `<html lang>` (what a Shopify
 * theme sets from the store's actual language/market, and what any other
 * platform's own i18n setup does too), falling back to the browser's own
 * language if that's missing. Real report: an English-language store still
 * showed a Ukrainian window, because the widget only ever read this from
 * config and otherwise defaulted flat to "uk" regardless of the page it was
 * actually running on. "uk" stays the last-resort default when neither
 * signal maps to a supported locale — this platform's own base audience.
 */
function detectPageLocale(): "en" | "uk" | "ru" {
  if (typeof document === "undefined") return "uk";
  const candidates = [document.documentElement.lang, typeof navigator !== "undefined" ? navigator.language : ""];
  for (const raw of candidates) {
    const primary = raw?.split(/[-_]/)[0]?.toLowerCase();
    if (primary === "en" || primary === "uk" || primary === "ru") return primary;
  }
  return "uk";
}

const BUTTON_STYLE_ID = "lumiframe-tryon-styles";
let buttonStylesInjected = false;

/** Injected once, so the auto-placed button looks reasonable with zero merchant CSS. Fully overridable via the `.lumiframe-tryon-button` class or the `--lumiframe-accent` custom property. */
function ensureButtonStylesInjected(): void {
  if (buttonStylesInjected || typeof document === "undefined") return;
  if (document.getElementById(BUTTON_STYLE_ID)) {
    buttonStylesInjected = true;
    return;
  }
  buttonStylesInjected = true;
  const style = document.createElement("style");
  style.id = BUTTON_STYLE_ID;
  style.textContent = `
.lumiframe-tryon-button {
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5em;
  margin: 0.75em 0;
  padding: 0.75em calc(1.5em * var(--lumiframe-width-scale, 1));
  border: none;
  border-radius: var(--lumiframe-radius, 999px);
  background: var(--lumiframe-accent, linear-gradient(135deg, #73b7ff, #9f8cff));
  color: var(--lumiframe-accent-contrast, #fff);
  font: inherit;
  font-weight: 600;
  line-height: 1;
  cursor: pointer;
  position: relative;
  transition: opacity 0.15s ease, transform 0.15s ease, background 0.15s ease;
}
.lumiframe-tryon-button:hover { opacity: 0.9; }
.lumiframe-tryon-button:active { transform: scale(0.98); }

/* Style "outline" (TryOnInitOptions.buttonStyle) — no fill at all, just a
   border + matching text in the accent color. --lumiframe-accent-1 is set
   alongside --lumiframe-accent whenever a button color is configured
   (see createButton()), specifically so this has a flat color to use —
   --lumiframe-accent itself may be a gradient, which border-color/color
   can't use directly. */
.lumiframe-tryon-button.lumiframe-style-outline {
  background: transparent;
  border: 2px solid var(--lumiframe-accent-1, #73b7ff);
  color: var(--lumiframe-accent-1, #73b7ff);
}
.lumiframe-tryon-button.lumiframe-style-outline:hover {
  background: color-mix(in srgb, var(--lumiframe-accent-1, #73b7ff) 10%, transparent);
  opacity: 1;
}

/* Position (TryOnInitOptions.buttonPosition, default "after") */
.lumiframe-tryon-button-floating {
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 2147483000;
  margin: 0;
  box-shadow: 0 8px 28px rgba(0,0,0,0.22);
}

/* Size (TryOnInitOptions.buttonSize, a 70-160 percent scale, default 100)
   is applied inline via --lumiframe-scale below instead of a class, so it
   can vary continuously rather than in fixed steps. */
.lumiframe-tryon-button { font-size: calc(1em * var(--lumiframe-scale, 1)); }

/* Width (TryOnInitOptions.buttonWidth, a 100-300 percent scale, default 100)
   stretches horizontal padding only, independent of --lumiframe-scale above
   — lets a merchant make the button longer without also making it taller. */

/* Animation (TryOnInitOptions.buttonAnimation, default "none") */
.lumiframe-tryon-button.lumiframe-anim-pulse {
  animation: lumiframe-pulse 1.8s ease-out infinite;
}
@keyframes lumiframe-pulse {
  0% { box-shadow: 0 0 0 0 var(--lumiframe-pulse-color, rgba(115,183,255,0.6)); }
  70% { box-shadow: 0 0 0 10px rgba(115,183,255,0); }
  100% { box-shadow: 0 0 0 0 rgba(115,183,255,0); }
}
.lumiframe-tryon-button.lumiframe-anim-shimmer { overflow: hidden; }
.lumiframe-tryon-button.lumiframe-anim-shimmer::after {
  content: "";
  position: absolute;
  top: 0;
  left: -150%;
  width: 60%;
  height: 100%;
  background: linear-gradient(120deg, transparent, rgba(255,255,255,0.55), transparent);
  animation: lumiframe-shimmer 2.4s ease-in-out infinite;
}
@keyframes lumiframe-shimmer {
  0% { left: -150%; }
  60% { left: 150%; }
  100% { left: 150%; }
}
`.trim();
  document.head.appendChild(style);
}

// A minimal glasses glyph, reused across all three card-button variants —
// same icon, just wrapped differently per variant's CSS below.
const GLASSES_ICON_SVG =
  '<svg viewBox="0 0 20 12" fill="none" width="14" height="14"><path d="M1 6C2.5 3 5 1 10 1s7.5 2 9 5c-1.5 3-4 5-9 5s-7.5-2-9-5z" stroke="currentColor" stroke-width="1.4"/><circle cx="10" cy="6" r="2" fill="currentColor"/></svg>';

const CARD_STYLE_ID = "lumiframe-tryon-card-styles";
let cardStylesInjected = false;

/**
 * Injected once, only when `cardButtonEnabled` is actually used — the
 * three variants from the mini-card prototype the merchant approved
 * (corner badge / bottom drawer / full-image scrim). All three read the
 * same --lumiframe-accent* custom properties createCardButton() sets, so
 * a card button always matches whatever colors the merchant configured for
 * the page button (no separate card-button color config).
 */
function ensureCardStylesInjected(): void {
  if (cardStylesInjected || typeof document === "undefined") return;
  if (document.getElementById(CARD_STYLE_ID)) {
    cardStylesInjected = true;
    return;
  }
  cardStylesInjected = true;
  const style = document.createElement("style");
  style.id = CARD_STYLE_ID;
  style.textContent = `
.lumiframe-card-wrap { position: relative; display: block; }
.lumiframe-card-wrap img { display: block; width: 100%; height: 100%; }

/* ── corner (default) ─────────────────────────────────────────────── */
.lumiframe-card-badge {
  position: absolute; top: 8px; right: 8px; z-index: 2;
  width: 30px; height: 30px; border: none; border-radius: 50%; padding: 0;
  background: #fff; box-shadow: 0 2px 8px rgba(20,20,30,.16);
  display: flex; align-items: center; justify-content: center; overflow: hidden;
  color: var(--lumiframe-accent-1, #73b7ff); cursor: pointer; white-space: nowrap;
}
.lumiframe-card-badge span { display: none; font-size: 11px; font-weight: 700; color: #171923; margin-left: 6px; }
@media (hover: hover) and (pointer: fine) {
  .lumiframe-card-badge { transition: width .2s ease; }
  .lumiframe-card-wrap:hover .lumiframe-card-badge,
  .lumiframe-card-wrap.lumiframe-hover .lumiframe-card-badge { width: 130px; border-radius: 15px; }
  .lumiframe-card-wrap:hover .lumiframe-card-badge span,
  .lumiframe-card-wrap.lumiframe-hover .lumiframe-card-badge span { display: inline; }
}
@keyframes lumiframe-card-ring {
  0% { box-shadow: 0 2px 8px rgba(20,20,30,.16), 0 0 0 0 var(--lumiframe-pulse-color, rgba(115,183,255,.55)); }
  70% { box-shadow: 0 2px 8px rgba(20,20,30,.16), 0 0 0 11px rgba(115,183,255,0); }
  100% { box-shadow: 0 2px 8px rgba(20,20,30,.16), 0 0 0 0 rgba(115,183,255,0); }
}
@media (hover: none) {
  .lumiframe-card-badge.lumiframe-card-first { animation: lumiframe-card-ring 1.8s ease-out .6s 1; }
}
@media (prefers-reduced-motion: reduce) {
  .lumiframe-card-badge.lumiframe-card-first { animation: none; }
}

/* ── drawer ────────────────────────────────────────────────────────── */
.lumiframe-card-drawer {
  position: absolute; left: 0; right: 0; bottom: 0; z-index: 2; height: 34px; width: 100%;
  border: none; padding: 0; cursor: pointer;
  background: var(--lumiframe-accent, linear-gradient(135deg,#73b7ff,#9f8cff));
  color: var(--lumiframe-accent-contrast, #0c1220);
  display: flex; align-items: center; justify-content: center; gap: 6px;
  font-size: 11.5px; font-weight: 700; font-family: inherit;
}
@media (hover: hover) and (pointer: fine) {
  .lumiframe-card-drawer { transform: translateY(100%); transition: transform .2s cubic-bezier(.2,.8,.2,1); }
  .lumiframe-card-wrap:hover .lumiframe-card-drawer,
  .lumiframe-card-wrap.lumiframe-hover .lumiframe-card-drawer { transform: translateY(0); }
}

/* ── scrim ─────────────────────────────────────────────────────────── */
.lumiframe-card-scrim {
  position: absolute; inset: 0; z-index: 2; border: none; padding: 0; cursor: pointer; background: transparent;
  display: flex; align-items: flex-end; justify-content: center; padding-bottom: 14px;
}
.lumiframe-card-scrim-pill {
  display: flex; align-items: center; gap: 6px; background: #fff; color: #171923;
  font-size: 11px; font-weight: 700; padding: 8px 14px; border-radius: 999px;
  box-shadow: 0 6px 18px rgba(0,0,0,.18);
}
@media (hover: hover) and (pointer: fine) {
  .lumiframe-card-scrim { transition: background .2s ease; }
  .lumiframe-card-scrim-pill { opacity: 0; transform: translateY(6px); transition: opacity .15s ease, transform .15s ease; }
  .lumiframe-card-wrap:hover .lumiframe-card-scrim,
  .lumiframe-card-wrap.lumiframe-hover .lumiframe-card-scrim { background: rgba(17,19,25,.2); }
  .lumiframe-card-wrap:hover .lumiframe-card-scrim-pill,
  .lumiframe-card-wrap.lumiframe-hover .lumiframe-card-scrim-pill { opacity: 1; transform: translateY(0); }
}
@media (hover: none) {
  .lumiframe-card-scrim { align-items: flex-start; justify-content: flex-end; padding: 8px; }
  .lumiframe-card-scrim-pill { padding: 7px; }
  .lumiframe-card-scrim-pill span { display: none; }
}
`.trim();
  document.head.appendChild(style);
}

type Listener = (payload: unknown) => void;

class EventBus {
  private listeners = new Map<SdkEventName, Set<Listener>>();

  on<E extends SdkEventName>(event: E, listener: SdkEventListener<E>): () => void {
    const set = this.listeners.get(event) ?? new Set<Listener>();
    set.add(listener as Listener);
    this.listeners.set(event, set);
    return () => set.delete(listener as Listener);
  }

  emit<E extends SdkEventName>(event: E, payload: SdkEventPayloads[E]): void {
    this.listeners.get(event)?.forEach((listener) => listener(payload));
    // Also dispatch as a DOM CustomEvent so non-SDK-aware merchant code
    // (analytics snippets, GTM triggers) can listen without our JS API.
    if (typeof document !== "undefined") {
      document.dispatchEvent(new CustomEvent(event, { detail: payload }));
    }
  }
}

class TryOnSdkImpl implements TryOnSdk {
  private options: TryOnInitOptions | null = null;
  private currentProduct: AttachProductInput | null = null;
  // True only once a merchant has explicitly called attach() — at that
  // point currentProduct is trusted and stays sticky (ARCHITECTURE.md §8:
  // "a merchant who called attach() knows better than any heuristic").
  // False while currentProduct merely holds the last auto-detected result:
  // resolveProduct() re-detects fresh on every call in that case, so a
  // shopper picking a different color swatch between opens gets the frame
  // they're actually looking at, not whatever was on screen the first time.
  private explicitProductAttached = false;
  private domSelectors: DomSelectorConfig | undefined;
  private bus = new EventBus();
  private isOpen = false;
  private buttonInjected = false;
  private cardButtonsInjected = false;
  // See ensureCardClickInterceptor()'s own doc comment for why a click on
  // a card button needs this instead of just its own click listener.
  private cardButtonProducts = new WeakMap<HTMLElement, AttachProductInput>();
  private cardClickInterceptorInstalled = false;
  // See ensureCardHoverTracking()'s own doc comment for why the drawer/
  // scrim reveal (and the corner badge's expand) can't rely on CSS
  // :hover either, for the exact same reason a plain click listener isn't
  // enough — same real report, same theme, same root cause.
  private cardWraps: HTMLElement[] = [];
  private hoveredCardWrap: HTMLElement | null = null;
  private cardHoverTrackingInstalled = false;
  private cardHoverRafPending = false;
  private lastPointerX = 0;
  private lastPointerY = 0;

  init(options: TryOnInitOptions): TryOnSdk {
    if (!options.storeId) {
      throw new Error("TryOn.init requires { storeId }");
    }
    this.options = { apiBaseUrl: DEFAULT_API_BASE_URL, ...options };
    // Equivalent to a separate configureSelectors() call — folded into
    // init() so the dashboard's generated snippet (apps/dashboard/lib/
    // snippet.ts) stays a single script block instead of two, for the one
    // selector field the Integration page's UI actually exposes.
    if (options.productImageSelector) {
      this.configureSelectors({ productImageSelector: options.productImageSelector });
    }
    this.scheduleAutoInject();
    this.scheduleCardButtons();
    return this;
  }

  /** Set merchant-configured DOM selectors for the generic detection fallback (ARCHITECTURE.md §8). */
  configureSelectors(selectors: DomSelectorConfig): void {
    this.domSelectors = selectors;
  }

  attach(product: AttachProductInput): void {
    // Deliberately does NOT require init() to have run first. On a
    // component-based storefront (React/Next/Vue), a product page's own
    // mount effect can legitimately fire before an "afterInteractive"-style
    // init script has — attach() only records state, so there is nothing
    // here that actually depends on { storeId, apiBaseUrl }. open() is what
    // needs both and asserts accordingly.
    if (!product.productImageUrl) {
      throw new Error("TryOn.attach requires at least { productId, productImageUrl }");
    }
    this.currentProduct = product;
    this.explicitProductAttached = true;
    // A late attach() (e.g. a React product page's mount effect firing
    // after init()'s own DOMContentLoaded-timed attempt already ran and
    // found nothing to attach to) still deserves a button — try again now
    // that we actually have a product. No-ops if one is already injected.
    this.tryAutoInject();
  }

  /**
   * Resolves the current product via the full detection cascade
   * (ARCHITECTURE.md §8) when no explicit product was attached or passed in.
   *
   * Auto-detected products are deliberately NOT cached across calls: a
   * shopper can click a color/style swatch between one open() and the
   * next, and detectProduct()'s own productImageUrl priority (a configured
   * DOM selector over the static JSON-LD/OpenGraph tags) only helps if
   * this actually re-reads the page each time. Only a merchant's own
   * explicit attach() call is sticky — see explicitProductAttached's own
   * comment.
   */
  private resolveProduct(explicit?: AttachProductInput): AttachProductInput | null {
    if (explicit) return explicit;
    if (this.explicitProductAttached && this.currentProduct) return this.currentProduct;
    if (typeof document === "undefined") return this.currentProduct;
    // Falls back to the last successfully detected product if this run
    // found nothing — e.g. a themed re-render briefly removed the matched
    // element between opens — rather than failing an open() outright.
    return detectProduct(document, { domSelectors: this.domSelectors }) ?? this.currentProduct;
  }

  open(product?: AttachProductInput): void {
    this.assertInitialized();
    // A double-click (or a fast repeat tap) on the auto-injected button
    // used to mount a second, stacked copy of the widget — same instance,
    // no re-entry guard. packages/widget also guards this independently
    // (for a page that loads the SDK script twice), but this is the cheap
    // no-op for the common case.
    if (this.isOpen) return;
    const resolved = this.resolveProduct(product);
    if (!resolved) {
      throw new Error(
        "TryOn.open: no product could be resolved. Call TryOn.attach(...) explicitly, or configure detection (see packages/sdk README)."
      );
    }
    this.currentProduct = resolved;
    this.isOpen = true;
    this.bus.emit("tryon:open", { product: resolved });

    // Lazy-load the widget bundle only now — this keeps the SDK's own
    // footprint tiny on every product page, most of which never see a click.
    void this.mountWidget(resolved);
  }

  private async mountWidget(product: AttachProductInput): Promise<void> {
    // Best-effort: on a Shopify store, corrects price/currency against
    // Shopify's own product JSON — the page's own markup isn't always
    // right (see detectProduct.ts). A no-op on any non-Shopify store.
    const enriched = await enrichFromShopify(product);

    // packages/widget ships its real implementation in Phase 1. The
    // contract is fixed now so neither side has to change when it lands:
    // it receives the resolved product + SDK options, and reports back
    // through the same event names this module already emits.
    const { mountWidget } = await import("@lumiframe/widget");
    mountWidget({
      product: enriched,
      apiBaseUrl: this.options!.apiBaseUrl!,
      storeId: this.options!.storeId,
      // An explicit `locale` in init() always wins; otherwise follow the
      // page's own language (detectPageLocale) rather than a flat default —
      // see its own doc comment for why.
      locale: this.options!.locale ?? detectPageLocale(),
      showTryAnotherButton: this.options!.showTryAnotherButton,
      showBackButton: this.options!.showBackButton,
      modalHeading: this.options!.modalHeading,
      modalSubheading: this.options!.modalSubheading,
      modalLayout: this.options!.modalLayout,
      // Modal-specific colors win when set; otherwise falls back to the
      // auto-injected page button's colors, so the window still reads as
      // the same product by default without needing separate setup.
      accentColorStart: this.options!.modalAccentColorStart ?? this.options!.buttonColorStart,
      accentColorEnd: this.options!.modalAccentColorEnd ?? this.options!.buttonColorEnd,
      accentStyle: this.options!.buttonStyle,
      accentTextColor: this.options!.modalAccentTextColor ?? this.options!.buttonTextColor,
      onEvent: (event, payload) => this.bus.emit(event, payload as never),
      onClose: () => this.close(),
    });
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.bus.emit("tryon:close", {});
  }

  destroy(): void {
    this.close();
    this.currentProduct = null;
    this.explicitProductAttached = false;
    this.options = null;
    this.buttonInjected = false;
    this.cardButtonsInjected = false;
  }

  /**
   * Waits for the DOM (and, if `init()`/`attach()` fired synchronously
   * together in one merchant `<script>` block, for that block to finish)
   * before the first auto-inject attempt.
   */
  private scheduleAutoInject(): void {
    if (typeof document === "undefined") return;
    if (this.options?.autoInject === false) return;
    const run = () => this.tryAutoInject();
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", run, { once: true });
    } else {
      // DOM is already parsed (script tag placed at the end of <body>, or
      // loaded with defer/async) — still yield one tick so a synchronous
      // TryOn.attach(...) call right after init() runs first.
      setTimeout(run, 0);
    }
  }

  /**
   * Auto-inject a "Try on" button next to the page's add-to-cart control
   * (ARCHITECTURE.md §8) once a product can be resolved. Safe to call
   * repeatedly — no-ops once a button exists, and does nothing at all if
   * `autoInject: false` was passed to init(), if no product resolves yet
   * (nothing to attach the button's action to), or if no safe place to put
   * it can be found on the page.
   */
  private tryAutoInject(): void {
    if (this.buttonInjected) return;
    if (typeof document === "undefined") return;
    if (this.options?.autoInject === false) return;

    const product = this.resolveProduct();
    if (!product) return; // nothing resolved yet — try again from attach()

    if (
      typeof window !== "undefined" &&
      !matchesCategoryFilter({ productUrl: product.productUrl ?? window.location.href, productTitle: product.productTitle }, this.options?.categoryUrlKeywords)
    ) {
      return; // this page's product doesn't match the merchant's category filter
    }

    const position = this.options?.buttonPosition ?? "after";
    const button = this.createButton();

    if (position === "floating") {
      // No anchor needed — pinned to the viewport corner. The right spot
      // for a page where neither an add-to-cart button nor a heading gives
      // a sensible place to inject inline.
      button.classList.add("lumiframe-tryon-button-floating");
      document.body.appendChild(button);
      this.buttonInjected = true;
      return;
    }

    const anchorSelector = this.options?.buttonAnchorSelector;
    const anchor = anchorSelector
      ? document.querySelector<HTMLElement>(anchorSelector)
      : (document.querySelector<HTMLElement>(CART_BUTTON_SELECTORS) ?? document.querySelector<HTMLElement>("h1"));

    if (!anchor?.parentElement) return; // no safe place found — merchant can place a manual trigger instead

    anchor.insertAdjacentElement(position === "before" ? "beforebegin" : "afterend", button);
    this.buttonInjected = true;
  }

  private createButton(): HTMLButtonElement {
    ensureButtonStylesInjected();
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("data-lumiframe-tryon", "");
    button.textContent = this.options?.buttonLabel ?? "Try on";

    // Per-store overrides (dashboard's "Button design" page) win over the
    // default look via the same custom properties ensureButtonStylesInjected
    // already wires the base CSS to — set inline so they beat the default
    // rule's specificity without needing !important.
    const {
      buttonColorStart,
      buttonColorEnd,
      buttonTextColor,
      buttonFont,
      buttonGlow,
      buttonStyle,
      buttonSize,
      buttonWidth,
      buttonShape,
      buttonAnimation,
    } = this.options ?? {};

    const animation = buttonAnimation ?? "none";
    const styleClass = buttonStyle === "outline" ? " lumiframe-style-outline" : "";
    button.className = `lumiframe-tryon-button${styleClass}${animation !== "none" ? ` lumiframe-anim-${animation}` : ""}`;

    // Continuous size (70-160% of the default), not fixed sm/md/lg steps —
    // em-based padding on .lumiframe-tryon-button scales along with this.
    const scale = Math.max(0.5, (buttonSize ?? 100) / 100);
    button.style.setProperty("--lumiframe-scale", String(scale));
    // Width (100-300%) stretches horizontal padding only, on top of the
    // above — lets a merchant make the button longer without also making
    // it taller (product ask: the uniform size scale alone couldn't do this).
    const widthScale = Math.max(1, (buttonWidth ?? 100) / 100);
    button.style.setProperty("--lumiframe-width-scale", String(widthScale));
    if (buttonShape) button.style.setProperty("--lumiframe-radius", buttonShape === "rectangular" ? "8px" : "999px");

    if (buttonColorStart || buttonColorEnd) {
      const start = buttonColorStart ?? buttonColorEnd!;
      // A flat color for "outline" to use as its border/text — separate
      // from --lumiframe-accent below, which can be a gradient and isn't
      // usable directly as a border-color or text color.
      button.style.setProperty("--lumiframe-accent-1", start);
      // "solid" (TryOnInitOptions.buttonStyle) uses just the start color,
      // flat — no gradient. Default/"gradient" keeps the two-color blend.
      // "outline" ignores this — no fill at all, see the CSS rule above.
      const background =
        buttonStyle === "solid" ? start : `linear-gradient(135deg, ${start}, ${buttonColorEnd ?? buttonColorStart!})`;
      button.style.setProperty("--lumiframe-accent", background);
      // Feeds the "pulse" animation's ring color (8-digit hex = alpha,
      // broadly supported) — harmless to set even when unused.
      button.style.setProperty("--lumiframe-pulse-color", `${start}99`);
    }
    if (buttonTextColor) button.style.setProperty("--lumiframe-accent-contrast", buttonTextColor);
    if (buttonFont) button.style.fontFamily = buttonFont;
    // A static glow and an animated one both drive box-shadow — only
    // apply the static version when no animation is going to keep
    // overwriting it anyway.
    if (buttonGlow && animation === "none") {
      const glowColor = buttonColorStart ?? buttonColorEnd ?? "#73b7ff";
      button.style.boxShadow = `0 0 18px 2px ${glowColor}`;
    }

    button.addEventListener("click", (event) => {
      event.preventDefault();
      this.open();
    });
    return button;
  }

  /**
   * Same DOMContentLoaded-or-next-tick timing as scheduleAutoInject, kept
   * separate rather than merged into it: a catalog/collection page — the
   * whole point of card buttons — has no single "the product" for
   * resolveProduct() to find, and tryAutoInject()'s own product-detection
   * guard would otherwise mean cards never inject on the pages this
   * feature actually targets.
   */
  private scheduleCardButtons(): void {
    if (typeof document === "undefined") return;
    if (!this.options?.cardButtonEnabled) return;
    const run = () => this.injectCardButtons();
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", run, { once: true });
    } else {
      setTimeout(run, 0);
    }
  }

  /**
   * Adds the configured per-card affordance to every product card
   * detectCards() finds (packages/sdk/src/detectCards.ts) — a merchant
   * report on a real store, with screenshots, asked specifically for a
   * "Try on" trigger on a catalog grid's mini-cards, not just the single
   * product page. One-shot on page load, same as tryAutoInject(): a grid
   * that loads more cards later (infinite scroll, an AJAX filter) won't
   * pick those up yet.
   */
  private injectCardButtons(): void {
    if (this.cardButtonsInjected) return;
    if (typeof document === "undefined") return;
    if (!this.options?.cardButtonEnabled) return;
    this.cardButtonsInjected = true;

    const matches = detectCards(document);
    // Own counter for "is this the first button actually placed", not
    // `index` — a category filter can skip earlier matches, and the
    // one-time explainer pulse (createCardButton's `isFirst`) should land
    // on whichever card is genuinely first on screen, not just first in
    // the unfiltered list.
    let injectedCount = 0;
    // Each iteration wrapped on its own: one card whose DOM doesn't match
    // this shape as cleanly as expected (a theme oddity detectCards()
    // didn't fully account for) must not silently take every other,
    // perfectly good card down with it — forEach has no built-in isolation
    // between iterations, an uncaught throw on card #1 would otherwise
    // abort the whole run and leave every card on the page with no button
    // at all, not just the one that actually had a problem.
    matches.forEach((match) => {
      try {
        if (!matchesCategoryFilter(match.product, this.options?.categoryUrlKeywords)) return;
        if (isCurrentPageProduct(match.product.productUrl)) return;
        const img = match.image;
        if (img.closest(".lumiframe-card-wrap")) return; // already wrapped — e.g. detectCards ran twice
        const wrap = document.createElement("span");
        wrap.className = "lumiframe-card-wrap";
        img.replaceWith(wrap);
        wrap.appendChild(img);
        wrap.appendChild(this.createCardButton(match.product, injectedCount === 0));
        this.cardWraps.push(wrap);
        this.ensureCardHoverTracking();
        injectedCount++;
      } catch (err) {
        console.warn("[lumiframe] skipped one card button (unexpected page markup):", err);
      }
    });
  }

  private createCardButton(product: AttachProductInput, isFirst: boolean): HTMLElement {
    ensureCardStylesInjected();
    const variant = this.options?.cardButtonVariant ?? "corner";
    const { buttonColorStart, buttonColorEnd, buttonTextColor, buttonStyle } = this.options ?? {};
    const label = this.options?.buttonLabel ?? "Try on";

    const applyAccent = (el: HTMLElement) => {
      if (!buttonColorStart && !buttonColorEnd) return;
      const start = buttonColorStart ?? buttonColorEnd!;
      el.style.setProperty("--lumiframe-accent-1", start);
      const background = buttonStyle === "solid" ? start : `linear-gradient(135deg, ${start}, ${buttonColorEnd ?? buttonColorStart!})`;
      el.style.setProperty("--lumiframe-accent", background);
      el.style.setProperty("--lumiframe-pulse-color", `${start}99`);
      if (buttonTextColor) el.style.setProperty("--lumiframe-accent-contrast", buttonTextColor);
    };

    const open = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
      this.open(product);
    };

    // Own click listener as the normal path (fires for a theme with no
    // conflict), plus registered into cardButtonProducts so
    // ensureCardClickInterceptor()'s coordinate check also catches this
    // button on a theme where it wouldn't otherwise receive the click at
    // all — see that method's doc comment.
    const register = (el: HTMLElement): HTMLElement => {
      this.cardButtonProducts.set(el, product);
      this.ensureCardClickInterceptor();
      el.addEventListener("click", open);
      return el;
    };

    if (variant === "drawer") {
      const el = document.createElement("button");
      el.type = "button";
      el.className = "lumiframe-card-drawer";
      el.innerHTML = `${GLASSES_ICON_SVG}<span>${label}</span>`;
      applyAccent(el);
      return register(el);
    }

    if (variant === "scrim") {
      const el = document.createElement("button");
      el.type = "button";
      el.className = "lumiframe-card-scrim";
      el.innerHTML = `<span class="lumiframe-card-scrim-pill">${GLASSES_ICON_SVG}<span>${label}</span></span>`;
      applyAccent(el);
      return register(el);
    }

    // "corner" (default)
    const el = document.createElement("button");
    el.type = "button";
    el.className = `lumiframe-card-badge${isFirst ? " lumiframe-card-first" : ""}`;
    el.innerHTML = `${GLASSES_ICON_SVG}<span>${label}</span>`;
    applyAccent(el);
    return register(el);
  }

  /**
   * A real theme (Dawn-derived, confirmed against a live store's own CSS):
   * the card's title link carries an invisible, full-card ::after overlay
   * (the standard "make the whole card clickable" pattern) that the theme
   * gives an explicit z-index. Our card button sits inside card__media,
   * which the SAME theme separately gives its own explicit z-index — that
   * makes card__media its own capped local stacking context, so no
   * z-index we set on our own button, however high, can ever out-rank a
   * sibling-branch element outside that context (that's how CSS stacking
   * contexts work: a local z-index never escapes the context it's local
   * to). The button still paints visibly on top — nothing opaque covers
   * it — but the browser's hit-test for a *click* still resolves to the
   * theme's invisible overlay sitting in the uncapped context one level
   * up, so the click silently falls through to that link instead: a real
   * report showed the button clearly, but clicking it just navigated to
   * the product page. No CSS fix on our side can win that fight from
   * inside the loser's own stacking context.
   *
   * So this doesn't try to win it: one page-wide, capture-phase click
   * listener (installed once, lazily, the first time any card button
   * exists) checks every click's real (x, y) against every live card
   * button's own bounding box *before* the browser resolves whatever
   * element it would have picked as the click's target, and short-circuits
   * straight to opening the widget on a hit — independent of stacking
   * context entirely, so it can't lose this fight on any theme.
   */
  private ensureCardClickInterceptor(): void {
    if (this.cardClickInterceptorInstalled || typeof document === "undefined") return;
    this.cardClickInterceptorInstalled = true;
    document.addEventListener(
      "click",
      (event: MouseEvent) => {
        // A real report: the widget's own close (×) button became
        // unclickable once opened from a card button, on a page with many
        // cards — this listener runs for every click for the rest of the
        // page's life, with no notion of "the widget is already open", so
        // if the close button's on-screen position happened to overlap ANY
        // still-in-the-page card badge's bounding box (very plausible on a
        // grid with a dozen-plus cards, mostly hidden behind the now-open
        // modal but still exactly where they always were), that click got
        // hijacked into a redundant this.open() no-op instead of ever
        // reaching the widget's own handler. No card button click should
        // do anything at all while a widget is already open — only a
        // fresh, unopened state should ever start one.
        if (this.isOpen) return;
        const buttons = document.querySelectorAll<HTMLElement>(".lumiframe-card-badge, .lumiframe-card-drawer, .lumiframe-card-scrim");
        for (const el of Array.from(buttons)) {
          const product = this.cardButtonProducts.get(el);
          if (!product) continue;
          const rect = el.getBoundingClientRect();
          if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) continue;
          event.preventDefault();
          event.stopPropagation();
          this.open(product);
          return;
        }
      },
      true
    );
  }

  /**
   * The drawer/scrim reveal and the corner badge's hover-expand
   * (ensureCardStylesInjected()'s `:hover` rules) hit the exact same wall
   * as a plain click listener did (ensureCardClickInterceptor()'s own doc
   * comment): CSS `:hover` is native pointer hit-testing too, so on a
   * theme where card__media's capped local stacking context loses to the
   * card's own invisible ::after overlay, the browser considers the
   * pointer "over" that overlay, not our wrap — `.lumiframe-card-wrap:hover`
   * never matches at all, confirmed on a real store: the corner badge was
   * visible (nothing covers it) but did nothing on hover.
   *
   * Same fix, extended to pointer movement instead of clicks: one shared
   * `mousemove` listener (installed once, lazily, alongside the first
   * card wrap) tracks the pointer's real (x, y) and, throttled to one
   * check per animation frame, tests it against every live card wrap's
   * own bounding box directly — independent of what the browser itself
   * would have hit-tested — toggling a `.lumiframe-hover` class that the
   * injected stylesheet responds to identically to `:hover`. Native
   * `:hover` stays in the CSS too (harmless, and correct on any theme
   * that doesn't have this trap) — this is a second path to the same
   * class, not a replacement for a working one.
   */
  private ensureCardHoverTracking(): void {
    if (this.cardHoverTrackingInstalled || typeof document === "undefined") return;
    this.cardHoverTrackingInstalled = true;
    const updateHover = () => {
      this.cardHoverRafPending = false;
      let match: HTMLElement | null = null;
      for (const wrap of this.cardWraps) {
        const rect = wrap.getBoundingClientRect();
        if (
          this.lastPointerX >= rect.left &&
          this.lastPointerX <= rect.right &&
          this.lastPointerY >= rect.top &&
          this.lastPointerY <= rect.bottom
        ) {
          match = wrap;
          break;
        }
      }
      if (match !== this.hoveredCardWrap) {
        this.hoveredCardWrap?.classList.remove("lumiframe-hover");
        match?.classList.add("lumiframe-hover");
        this.hoveredCardWrap = match;
      }
    };
    document.addEventListener(
      "mousemove",
      (event: MouseEvent) => {
        this.lastPointerX = event.clientX;
        this.lastPointerY = event.clientY;
        if (this.cardHoverRafPending) return;
        this.cardHoverRafPending = true;
        requestAnimationFrame(updateHover);
      },
      { passive: true }
    );
  }

  on<E extends SdkEventName>(event: E, listener: SdkEventListener<E>): () => void {
    return this.bus.on(event, listener);
  }

  private assertInitialized(): void {
    if (!this.options) {
      throw new Error("TryOn.init({ storeId }) must be called before this method.");
    }
  }
}

const instance = new TryOnSdkImpl();

export default instance;
export { detectProduct } from "./detectProduct";
export type * from "./types";
