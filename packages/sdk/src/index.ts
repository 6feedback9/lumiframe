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
 * True if `url` matches at least one of `keywords` (comma-separated,
 * case-insensitive substring match) — or if `keywords` is unset/empty,
 * in which case there's no restriction at all. See TryOnInitOptions'
 * `categoryUrlKeywords` doc comment for what this is for.
 */
function matchesCategoryFilter(url: string, keywords: string | undefined): boolean {
  if (!keywords?.trim()) return true;
  const haystack = url.toLowerCase();
  return keywords
    .split(",")
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean)
    .some((k) => haystack.includes(k));
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
  .lumiframe-card-wrap:hover .lumiframe-card-badge { width: 130px; border-radius: 15px; }
  .lumiframe-card-wrap:hover .lumiframe-card-badge span { display: inline; }
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
  .lumiframe-card-wrap:hover .lumiframe-card-drawer { transform: translateY(0); }
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
  .lumiframe-card-wrap:hover .lumiframe-card-scrim { background: rgba(17,19,25,.2); }
  .lumiframe-card-wrap:hover .lumiframe-card-scrim-pill { opacity: 1; transform: translateY(0); }
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

    if (typeof window !== "undefined" && !matchesCategoryFilter(product.productUrl ?? window.location.href, this.options?.categoryUrlKeywords)) {
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
    matches.forEach((match) => {
      if (!matchesCategoryFilter(match.product.productUrl ?? "", this.options?.categoryUrlKeywords)) return;
      const img = match.image;
      if (img.closest(".lumiframe-card-wrap")) return; // already wrapped — e.g. detectCards ran twice
      const wrap = document.createElement("span");
      wrap.className = "lumiframe-card-wrap";
      img.replaceWith(wrap);
      wrap.appendChild(img);
      wrap.appendChild(this.createCardButton(match.product, injectedCount === 0));
      injectedCount++;
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

    if (variant === "drawer") {
      const el = document.createElement("button");
      el.type = "button";
      el.className = "lumiframe-card-drawer";
      el.innerHTML = `${GLASSES_ICON_SVG}<span>${label}</span>`;
      applyAccent(el);
      el.addEventListener("click", open);
      return el;
    }

    if (variant === "scrim") {
      const el = document.createElement("button");
      el.type = "button";
      el.className = "lumiframe-card-scrim";
      el.innerHTML = `<span class="lumiframe-card-scrim-pill">${GLASSES_ICON_SVG}<span>${label}</span></span>`;
      applyAccent(el);
      el.addEventListener("click", open);
      return el;
    }

    // "corner" (default)
    const el = document.createElement("button");
    el.type = "button";
    el.className = `lumiframe-card-badge${isFirst ? " lumiframe-card-first" : ""}`;
    el.innerHTML = `${GLASSES_ICON_SVG}<span>${label}</span>`;
    applyAccent(el);
    el.addEventListener("click", open);
    return el;
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
