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
  padding: 0.75em 1.5em;
  border: none;
  border-radius: var(--lumiframe-radius, 999px);
  background: var(--lumiframe-accent, linear-gradient(135deg, #73b7ff, #9f8cff));
  color: var(--lumiframe-accent-contrast, #fff);
  font: inherit;
  font-weight: 600;
  line-height: 1;
  cursor: pointer;
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.lumiframe-tryon-button:hover { opacity: 0.9; }
.lumiframe-tryon-button:active { transform: scale(0.98); }
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

    const anchorSelector = this.options?.buttonAnchorSelector;
    const anchor = anchorSelector
      ? document.querySelector<HTMLElement>(anchorSelector)
      : (document.querySelector<HTMLElement>(CART_BUTTON_SELECTORS) ?? document.querySelector<HTMLElement>("h1"));

    if (!anchor?.parentElement) return; // no safe place found — merchant can place a manual trigger instead

    const button = this.createButton();
    anchor.insertAdjacentElement("afterend", button);
    this.buttonInjected = true;
  }

  private createButton(): HTMLButtonElement {
    ensureButtonStylesInjected();
    const button = document.createElement("button");
    button.type = "button";
    button.className = "lumiframe-tryon-button";
    button.setAttribute("data-lumiframe-tryon", "");
    button.textContent = this.options?.buttonLabel ?? "Try on";
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
