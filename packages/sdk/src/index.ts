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

import { detectProduct, type DomSelectorConfig } from "./detectProduct";
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
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5em;
  margin: 0.75em 0;
  border: none;
  border-radius: var(--lumiframe-radius, 999px);
  background: var(--lumiframe-accent, linear-gradient(135deg, #73b7ff, #9f8cff));
  color: var(--lumiframe-accent-contrast, #fff);
  font: inherit;
  font-weight: 600;
  line-height: 1;
  cursor: pointer;
  position: relative;
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.lumiframe-tryon-button:hover { opacity: 0.9; }
.lumiframe-tryon-button:active { transform: scale(0.98); }

/* Position (TryOnInitOptions.buttonPosition, default "after") */
.lumiframe-tryon-button-floating {
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 2147483000;
  margin: 0;
  box-shadow: 0 8px 28px rgba(0,0,0,0.22);
}

/* Size (TryOnInitOptions.buttonSize, default "md") */
.lumiframe-tryon-button.lumiframe-size-sm { padding: 0.5em 1em; font-size: 0.85em; }
.lumiframe-tryon-button.lumiframe-size-md { padding: 0.75em 1.5em; font-size: 1em; }
.lumiframe-tryon-button.lumiframe-size-lg { padding: 1em 2em; font-size: 1.15em; }

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
  private domSelectors: DomSelectorConfig | undefined;
  private bus = new EventBus();
  private isOpen = false;
  private buttonInjected = false;

  init(options: TryOnInitOptions): TryOnSdk {
    if (!options.storeId) {
      throw new Error("TryOn.init requires { storeId }");
    }
    this.options = { apiBaseUrl: DEFAULT_API_BASE_URL, ...options };
    this.scheduleAutoInject();
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
    // A late attach() (e.g. a React product page's mount effect firing
    // after init()'s own DOMContentLoaded-timed attempt already ran and
    // found nothing to attach to) still deserves a button — try again now
    // that we actually have a product. No-ops if one is already injected.
    this.tryAutoInject();
  }

  /**
   * Resolves the current product via the full detection cascade
   * (ARCHITECTURE.md §8) when no explicit product was attached or passed in.
   */
  private resolveProduct(explicit?: AttachProductInput): AttachProductInput | null {
    if (explicit) return explicit;
    if (this.currentProduct) return this.currentProduct;
    if (typeof document === "undefined") return null;
    return detectProduct(document, { domSelectors: this.domSelectors });
  }

  open(product?: AttachProductInput): void {
    this.assertInitialized();
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
    // packages/widget ships its real implementation in Phase 1. The
    // contract is fixed now so neither side has to change when it lands:
    // it receives the resolved product + SDK options, and reports back
    // through the same event names this module already emits.
    const { mountWidget } = await import("@lumiframe/widget");
    mountWidget({
      product,
      apiBaseUrl: this.options!.apiBaseUrl!,
      storeId: this.options!.storeId,
      locale: this.options!.locale ?? "en",
      modalMaxWidth: this.options!.modalMaxWidth,
      showTryAnotherButton: this.options!.showTryAnotherButton,
      showBackButton: this.options!.showBackButton,
      modalHeading: this.options!.modalHeading,
      modalSubheading: this.options!.modalSubheading,
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
    this.options = null;
    this.buttonInjected = false;
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
    const { buttonColorStart, buttonColorEnd, buttonTextColor, buttonFont, buttonGlow, buttonStyle, buttonSize, buttonAnimation } =
      this.options ?? {};

    const size = buttonSize ?? "md";
    const animation = buttonAnimation ?? "none";
    button.className = `lumiframe-tryon-button lumiframe-size-${size}${animation !== "none" ? ` lumiframe-anim-${animation}` : ""}`;

    if (buttonColorStart || buttonColorEnd) {
      const start = buttonColorStart ?? buttonColorEnd!;
      // "solid" (TryOnInitOptions.buttonStyle) uses just the start color,
      // flat — no gradient. Default/"gradient" keeps the two-color blend.
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
