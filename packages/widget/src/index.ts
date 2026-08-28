// The real widget UI (Phase 1), wired to the async /api/v1/tryons flow
// (ARCHITECTURE.md §3/§7). Lazy-loaded by @lumiframe/sdk on open() — see
// packages/sdk/src/index.ts — so this module's weight never lands on a
// product page that no one clicks "Try on" on.

import { ApiClient } from "./apiClient";
import { fileToUploadDataUri } from "./imageResize";
import { getBrowserSessionId, getVisitorId } from "./ids";
import { getCopy } from "./i18n";
import { WIDGET_CSS } from "./styles";
import { currentDevice, readUtmFromLocation } from "./utm";
import type { MountWidgetOptions, WidgetHandle } from "./types";

export type { WidgetProduct, WidgetEventName, MountWidgetOptions, WidgetHandle } from "./types";

let stylesInjected = false;
function ensureStyles(): void {
  if (stylesInjected) return;
  const el = document.createElement("style");
  el.textContent = WIDGET_CSS;
  document.head.appendChild(el);
  stylesInjected = true;
}

const POLL_INTERVAL_MS = 1200;
const POLL_TIMEOUT_MS = 45_000;

export function mountWidget(options: MountWidgetOptions): WidgetHandle {
  ensureStyles();
  const T = getCopy(options.locale);
  const api = new ApiClient(options.apiBaseUrl, options.storeId);
  const visitorId = getVisitorId();
  const browserSessionId = getBrowserSessionId();

  let selectedFile: File | null = null;
  let tryOnId: string | null = null;
  let pollHandle: ReturnType<typeof setTimeout> | null = null;

  const showTryAnother = options.showTryAnotherButton ?? true;
  const showBack = options.showBackButton ?? true;

  const backdrop = document.createElement("div");
  backdrop.className = "lf-backdrop";
  backdrop.setAttribute("data-lumiframe-widget", "");
  if (options.modalMaxWidth) {
    backdrop.style.setProperty("--lf-modal-width", `${options.modalMaxWidth}px`);
  }
  backdrop.innerHTML = `
    <div class="lf-modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(T.title)}">
      <div class="lf-header">
        <span class="lf-brand">${escapeHtml(T.title)}</span>
        <button type="button" class="lf-close" data-close aria-label="${escapeHtml(T.close)}">✕</button>
      </div>
      <div class="lf-body">
        ${
          options.product.productTitle
            ? `<div class="lf-product">
                <img class="lf-pimg" src="${escapeHtml(options.product.productImageUrl)}" alt="" onerror="this.style.display='none'">
                <div>
                  <div class="lf-pname">${escapeHtml(options.product.productTitle)}</div>
                  ${options.product.price ? `<div class="lf-pprice">${escapeHtml(formatPrice(options.product.price, options.product.currency))}</div>` : ""}
                </div>
              </div>`
            : ""
        }

        <div data-step="upload">
          <div class="lf-head">${escapeHtml(T.head)}</div>
          <div class="lf-desc">${escapeHtml(T.desc)}</div>
          <div class="lf-zone" data-zone>
            <input type="file" accept="image/jpeg,image/png,image/webp" class="lf-finput" data-file-input>
            <img class="lf-preview" data-preview alt="">
            <div class="lf-placeholder" data-placeholder>
              <div class="lf-placeholder-icon">📷</div>
              <div class="lf-upload-text">${escapeHtml(T.upload)}</div>
              <div class="lf-upload-hint">${escapeHtml(T.hint)}</div>
            </div>
          </div>
          <div class="lf-privacy">${escapeHtml(T.privacy)}</div>
          <div class="lf-error" data-error style="display:none"></div>
          <button type="button" class="lf-btn lf-btn-primary" data-generate disabled>${escapeHtml(T.generate)}</button>
        </div>

        <div data-step="processing" style="display:none">
          <div class="lf-generating">
            <div class="lf-spinner"></div>
            <div class="lf-gen-title">${escapeHtml(T.generating)}</div>
            <div class="lf-gen-sub">${escapeHtml(T.genSub)}</div>
          </div>
        </div>

        <div data-step="result" style="display:none">
          <img class="lf-result-img" data-result-img alt="Try-on result">
          <div class="lf-ai-note">${escapeHtml(T.aiNote)}</div>
          <div class="lf-actions">
            ${showTryAnother ? `<button type="button" class="lf-btn lf-btn-secondary" data-retry>${escapeHtml(T.tryAnother)}</button>` : ""}
            ${showBack ? `<button type="button" class="lf-btn lf-btn-secondary" data-back>${escapeHtml(T.backToProduct)}</button>` : ""}
          </div>
          <button type="button" class="lf-btn lf-btn-primary" data-add-to-cart>${escapeHtml(T.addToCart)}</button>
        </div>
      </div>
      <div class="lf-footer">Lumi Frame</div>
    </div>
  `;
  document.body.appendChild(backdrop);
  document.body.style.overflow = "hidden";

  const q = <E extends Element = Element>(sel: string) => backdrop.querySelector<E>(sel)!;

  function showStep(name: "upload" | "processing" | "result"): void {
    for (const step of ["upload", "processing", "result"]) {
      (q(`[data-step="${step}"]`) as HTMLElement).style.display = step === name ? "block" : "none";
    }
  }

  function showError(message: string): void {
    const el = q<HTMLElement>("[data-error]");
    el.textContent = message;
    el.style.display = "block";
  }
  function clearError(): void {
    q<HTMLElement>("[data-error]").style.display = "none";
  }

  async function onFileSelected(file: File): Promise<void> {
    if (!file.type.startsWith("image/")) {
      showError(T.errUpload);
      return;
    }
    selectedFile = file;
    clearError();
    const dataUri = await fileToUploadDataUri(file);
    q<HTMLImageElement>("[data-preview]").src = dataUri;
    q<HTMLElement>("[data-zone]").classList.add("has-photo");
    q<HTMLButtonElement>("[data-generate]").disabled = false;
    options.onEvent("tryon:photo-selected", { product: options.product });
    void api.postEvent({ type: "PHOTO_SELECTED", externalProductId: options.product.productId, visitorId, browserSessionId });
  }

  async function pollUntilDone(): Promise<void> {
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    const tick = async () => {
      if (!tryOnId) return;
      try {
        const status = await api.getStatus(tryOnId);
        if (status.status === "COMPLETED" && status.resultUrl) {
          options.onEvent("tryon:completed", { tryOnId, resultUrl: status.resultUrl });
          q<HTMLImageElement>("[data-result-img]").src = status.resultUrl;
          showStep("result");
          return;
        }
        if (status.status === "FAILED" || status.status === "EXPIRED") {
          options.onEvent("tryon:failed", { tryOnId, errorCode: status.errorCode ?? "EXPIRED", errorMessage: status.message ?? status.errorMessage });
          showStep("upload");
          showError(status.status === "EXPIRED" ? T.expired : T.errGen);
          return;
        }
        if (Date.now() > deadline) {
          options.onEvent("tryon:failed", { tryOnId, errorCode: "CLIENT_POLL_TIMEOUT" });
          showStep("upload");
          showError(T.errGen);
          return;
        }
        pollHandle = setTimeout(tick, POLL_INTERVAL_MS);
      } catch {
        if (Date.now() > deadline) {
          showStep("upload");
          showError(T.errGen);
          return;
        }
        pollHandle = setTimeout(tick, POLL_INTERVAL_MS);
      }
    };
    void tick();
  }

  async function generate(): Promise<void> {
    if (!selectedFile) return;
    clearError();
    showStep("processing");
    options.onEvent("tryon:processing", {});

    try {
      const dataUri = await fileToUploadDataUri(selectedFile);
      const created = await api.createTryOn({
        product: options.product,
        customerImageDataUri: dataUri,
        visitorId,
        browserSessionId,
        referrer: document.referrer || undefined,
        device: currentDevice(),
        utm: readUtmFromLocation(),
      });
      tryOnId = created.tryOnId;
      options.onEvent("tryon:started", { product: options.product, tryOnId: created.tryOnId });
      await pollUntilDone();
    } catch (error) {
      showStep("upload");
      showError((error as Error).message || T.errGen);
    }
  }

  async function retry(): Promise<void> {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/jpeg,image/png,image/webp";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file || !tryOnId) return;
      showStep("processing");
      try {
        const dataUri = await fileToUploadDataUri(file);
        await api.retryTryOn(tryOnId, dataUri);
        await pollUntilDone();
      } catch (error) {
        showStep("result"); // stay on the previous result rather than losing it
        showError((error as Error).message || T.errGen);
      }
    };
    input.click();
  }

  function close(): void {
    if (pollHandle) clearTimeout(pollHandle);
    backdrop.remove();
    document.body.style.overflow = "";
    options.onClose();
  }

  /**
   * Finds the variant id Shopify's own AJAX Cart API needs. Every stock
   * Shopify theme's product form carries a `[name="id"]` field with the
   * selected variant — the same field the theme's own "Add to cart" button
   * submits. Gated on `window.Shopify` existing so a non-Shopify page that
   * happens to have an unrelated `name="id"` field never gets a false hit.
   */
  function detectShopifyVariantId(): string | null {
    if (typeof window === "undefined" || !(window as unknown as { Shopify?: unknown }).Shopify) return null;
    const field = document.querySelector<HTMLInputElement | HTMLSelectElement>(
      'form[action*="/cart/add"] [name="id"], form[action*="/cart/add"] select[name="id"], [name="id"]'
    );
    return field?.value || null;
  }

  async function addToCart(): Promise<void> {
    options.onEvent("tryon:add-to-cart", { product: options.product, tryOnId: tryOnId ?? undefined });
    void api.postEvent({
      type: "TRYON_ADD_TO_CART",
      tryOnSessionId: tryOnId ?? undefined,
      externalProductId: options.product.productId,
      visitorId,
      browserSessionId,
    });

    const btn = q<HTMLButtonElement>("[data-add-to-cart]");
    const originalLabel = btn.textContent;
    const variantId = detectShopifyVariantId();

    if (!variantId) {
      // Not a storefront we can add to directly (or no variant resolved) —
      // don't fake a success state. Tell the shopper what to do and let
      // them use the store's own button.
      showError(T.addToCartFallback);
      return;
    }

    btn.disabled = true;
    btn.textContent = T.addingToCart;
    clearError();
    try {
      const res = await fetch("/cart/add.js", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ items: [{ id: variantId, quantity: 1 }] }),
      });
      if (!res.ok) throw new Error(`cart add failed: ${res.status}`);
      btn.textContent = T.addedToCart;
      // Most Shopify themes listen for one of these to refresh a cart
      // drawer/count bubble — harmless no-op on themes that don't.
      document.dispatchEvent(new CustomEvent("cart:refresh"));
      document.dispatchEvent(new CustomEvent("cart:updated"));
      setTimeout(close, 1100);
    } catch {
      btn.disabled = false;
      btn.textContent = originalLabel;
      showError(T.errGen);
    }
  }

  // ── Wire up events ──────────────────────────────────────────────────
  q("[data-close]").addEventListener("click", close);
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) close();
  });
  document.addEventListener("keydown", function onEsc(e) {
    if (e.key === "Escape") {
      close();
      document.removeEventListener("keydown", onEsc);
    }
  });

  const zone = q<HTMLElement>("[data-zone]");
  const fileInput = q<HTMLInputElement>("[data-file-input]");
  fileInput.addEventListener("change", (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) void onFileSelected(file);
  });
  zone.addEventListener("dragover", (e) => e.preventDefault());
  zone.addEventListener("drop", (e) => {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (file) void onFileSelected(file);
  });

  q("[data-generate]").addEventListener("click", () => void generate());
  backdrop.querySelector("[data-retry]")?.addEventListener("click", () => void retry());
  backdrop.querySelector("[data-back]")?.addEventListener("click", close);
  q("[data-add-to-cart]").addEventListener("click", () => void addToCart());

  return { close };
}

function escapeHtml(value: string): string {
  const div = document.createElement("div");
  div.textContent = value;
  return div.innerHTML;
}

function formatPrice(price: number, currency?: string): string {
  return currency ? `${price} ${currency}` : String(price);
}
