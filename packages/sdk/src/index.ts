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

  init(options: TryOnInitOptions): TryOnSdk {
    if (!options.storeId) {
      throw new Error("TryOn.init requires { storeId }");
    }
    this.options = { apiBaseUrl: DEFAULT_API_BASE_URL, ...options };
    return this;
  }

  /** Set merchant-configured DOM selectors for the generic detection fallback (ARCHITECTURE.md §8). */
  configureSelectors(selectors: DomSelectorConfig): void {
    this.domSelectors = selectors;
  }

  attach(product: AttachProductInput): void {
    this.assertInitialized();
    if (!product.productImageUrl) {
      throw new Error("TryOn.attach requires at least { productId, productImageUrl }");
    }
    this.currentProduct = product;
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
