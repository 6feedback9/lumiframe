// The real widget UI (Phase 1), wired to the async /api/v1/tryons flow
// (ARCHITECTURE.md §3/§7). Lazy-loaded by @lumiframe/sdk on open() — see
// packages/sdk/src/index.ts — so this module's weight never lands on a
// product page that no one clicks "Try on" on.
//
// Layout (product ask, from a reference screenshot): a full-page split
// view — photo/guidance on the left, product + cart on the right — rather
// than a floating bottom-sheet card. The product panel's "Add to cart" is
// deliberately always active, independent of the try-on's own state: a
// shopper should be able to buy without trying on, same as any store.

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
// The provider's own worst case is GENERATE_TIMEOUT_MS * MAX_ATTEMPTS = 75s
// (packages/providers/real/src/index.ts, bumped from 2 to 3 attempts —
// occasional slow Gemini responses were still hitting a hard failure with
// 2) — this needs real margin above that, not to equal it, or the
// browser gives up and shows an error to the shopper right as a retried
// generation was about to actually succeed.
const POLL_TIMEOUT_MS = 95_000;

type PhotoState = "empty" | "selected" | "processing" | "result";

export function mountWidget(options: MountWidgetOptions): WidgetHandle {
  // Guard against a second widget stacking on top of the first — a
  // double-click on the "Try on" button, or a merchant's page accidentally
  // loading the SDK script twice, both used to leave two full `.lf-backdrop`
  // overlays in the DOM at once (duplicated tips list, doubled-up content).
  // Belt-and-suspenders with the SDK's own open() re-entry guard
  // (packages/sdk/src/index.ts) — this one is a plain DOM check, so it
  // still catches a second, independent SDK instance on the same page.
  document.querySelectorAll("[data-lumiframe-widget]").forEach((el) => el.remove());

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

  // "compact" — the small floating card over the (dimmed, still-visible)
  // product page, back as an option per a later product ask, alongside
  // "split" (default) — the full-page takeover this widget switched to
  // earlier. Everything below reuses the exact same markup and JS flow
  // either way; only styles.ts's .lf-compact rules differ.
  const isCompact = options.modalLayout === "compact";

  const backdrop = document.createElement("div");
  backdrop.className = `lf-backdrop${isCompact ? " lf-compact" : ""}`;
  backdrop.setAttribute("data-lumiframe-widget", "");
  // Reuse the same accent the merchant configured for the auto-injected page
  // button (product ask: the try-on window's own design — colors included —
  // should be configurable, not a second, disconnected blue), unless a
  // modal-specific override was set — see packages/sdk's fallback chain.
  if (options.accentColorStart || options.accentColorEnd) {
    const start = options.accentColorStart ?? options.accentColorEnd!;
    const end = options.accentColorEnd ?? options.accentColorStart!;
    backdrop.style.setProperty("--lf-accent-1", start);
    backdrop.style.setProperty("--lf-btn-bg", options.accentStyle === "solid" ? start : `linear-gradient(135deg, ${start}, ${end})`);
  }
  if (options.accentTextColor) backdrop.style.setProperty("--lf-accent-contrast", options.accentTextColor);

  backdrop.innerHTML = `
    <div class="lf-shell${isCompact ? " lf-compact" : ""}" role="dialog" aria-modal="true" aria-label="${escapeHtml(T.title)}">
      <button type="button" class="lf-close" data-close aria-label="${escapeHtml(T.close)}">✕</button>

      <div class="lf-photo-panel">
        <div class="lf-col">
          <div class="lf-eyebrow">${escapeHtml(T.title)}</div>
          <div class="lf-head">${escapeHtml(options.modalHeading || T.head)}</div>

          <div class="lf-zone" data-zone>
            <input type="file" accept="image/jpeg,image/png,image/webp" class="lf-finput" data-file-input>
            <div class="lf-example-card" data-example-card>
              <svg class="lf-example-icon" viewBox="0 0 300 400" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
                <rect width="300" height="400" fill="#f3f3f2"/>
                <circle cx="150" cy="152" r="60" fill="#c7c7c4"/>
                <path d="M56 338c0-68 42-112 94-112s94 44 94 112" fill="#c7c7c4"/>
              </svg>
              <div class="lf-photo-badge" data-photo-badge>${escapeHtml(T.examplePhoto)}</div>
            </div>
            <div class="lf-placeholder" data-placeholder>
              <svg class="lf-placeholder-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 16V4M12 4L7 9M12 4l5 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </div>
            <img class="lf-preview" data-preview alt="">
            <img class="lf-result-img" data-result-img alt="Try-on result">
            <div class="lf-processing-overlay">
              <div class="lf-spinner"></div>
              <div class="lf-gen-title">${escapeHtml(T.generating)}</div>
              <div class="lf-gen-sub">${escapeHtml(T.genSub)}</div>
              <div class="lf-gen-progress" data-progress>0%</div>
            </div>
          </div>

          <div data-pre-upload>
            <button type="button" class="lf-btn lf-btn-primary" data-upload-trigger>${escapeHtml(T.upload)}</button>
            <div class="lf-privacy">${escapeHtml(T.privacy)}</div>
          </div>

          <div data-pre-generate style="display:none">
            <div class="lf-consent">
              <input type="checkbox" id="lf-consent-check" data-consent>
              <label for="lf-consent-check">${escapeHtml(T.consentLabel)}</label>
            </div>
            <button type="button" class="lf-btn lf-btn-primary" data-generate disabled>${escapeHtml(T.generate)}</button>
          </div>

          <div data-result-block style="display:none">
            <div class="lf-ai-note">${escapeHtml(T.aiNote)}</div>
            <div class="lf-feedback" data-feedback>
              <span class="lf-feedback-prompt">${escapeHtml(T.feedbackPrompt)}</span>
              <button type="button" class="lf-fb-btn" data-fb-like aria-label="${escapeHtml(T.likeAria)}">👍</button>
              <button type="button" class="lf-fb-btn" data-fb-dislike aria-label="${escapeHtml(T.dislikeAria)}">👎</button>
            </div>
            <div class="lf-feedback-thanks" data-fb-thanks style="display:none">${escapeHtml(T.feedbackThanks)}</div>
            <div class="lf-actions">
              ${showTryAnother ? `<button type="button" class="lf-btn lf-btn-secondary" data-retry>${escapeHtml(T.tryAnother)}</button>` : ""}
              ${showBack ? `<button type="button" class="lf-btn lf-btn-secondary" data-back>${escapeHtml(T.backToProduct)}</button>` : ""}
            </div>
          </div>

          <div class="lf-error" data-error style="display:none"></div>
        </div>
      </div>

      <div class="lf-product-panel">
        <div class="lf-col">
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
          <button type="button" class="lf-btn lf-btn-primary" data-add-to-cart>${escapeHtml(T.addToCart)}</button>
          <div class="lf-brand-footer">Lumi Frame</div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);
  document.body.style.overflow = "hidden";

  const q = <E extends Element = Element>(sel: string) => backdrop.querySelector<E>(sel)!;

  const shell = q<HTMLElement>(".lf-shell");

  // Belt-and-suspenders for styles.ts's `min-height: 100dvh` — a
  // JS-measured height that doesn't depend on dvh support or behavior at
  // all, for whatever environment still gets it wrong (some in-app /
  // theme-preview webviews render the page inside a shorter iframe of
  // their own, where dvh is measuring that iframe correctly but it's
  // still shorter than the shopper expects "the screen" to be — no CSS
  // unit fixes that, only really measuring what's actually there).
  // visualViewport, where supported, is the more accurate of the two —
  // it excludes an open on-screen keyboard, which innerHeight doesn't.
  // Re-synced on resize so it tracks an address bar or keyboard
  // showing/hiding after the initial mount, not just the state at open.
  function syncShellHeight(): void {
    // Only the full-page "split" layout needs this — a "compact" card
    // sizes to its own content (styles.ts's .lf-compact rules), forcing
    // it to the viewport height would defeat the point of it being small.
    if (isCompact) return;
    const h = window.visualViewport?.height ?? window.innerHeight;
    shell.style.minHeight = `${h}px`;
  }
  syncShellHeight();
  window.addEventListener("resize", syncShellHeight);
  window.visualViewport?.addEventListener("resize", syncShellHeight);

  const zone = q<HTMLElement>("[data-zone]");
  const preUpload = q<HTMLElement>("[data-pre-upload]");
  const preGenerate = q<HTMLElement>("[data-pre-generate]");
  const resultBlock = q<HTMLElement>("[data-result-block]");

  // A fake-but-honest progress percentage during generation (product ask:
  // the spinner alone gave no sense of whether it was almost done or
  // stuck). There's no real progress signal from the provider mid-call —
  // Gemini's generateContent() is one request/response, not a stream —
  // so this eases toward 90% over the real generation's typical timeframe
  // (providers/real's own comment: ~14-20s) and holds there; it never
  // claims 100% on its own; the overlay itself disappears the instant a
  // real result (or a real error) actually arrives.
  let progressTimer: ReturnType<typeof setInterval> | null = null;
  function stopProgressTimer(): void {
    if (progressTimer) {
      clearInterval(progressTimer);
      progressTimer = null;
    }
  }
  function startProgressTimer(): void {
    stopProgressTimer();
    const startedAt = Date.now();
    const el = q<HTMLElement>("[data-progress]");
    el.textContent = "0%";
    progressTimer = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const pct = Math.min(90, Math.round(90 * (1 - Math.exp(-elapsed / 9000))));
      el.textContent = `${pct}%`;
    }, 300);
  }

  function setPhotoState(state: PhotoState): void {
    zone.classList.toggle("has-photo", state === "selected" || state === "processing");
    zone.classList.toggle("has-result", state === "result");
    zone.classList.toggle("is-processing", state === "processing");
    preUpload.style.display = state === "empty" ? "block" : "none";
    preGenerate.style.display = state === "selected" ? "block" : "none";
    resultBlock.style.display = state === "result" ? "block" : "none";
    if (state === "processing") startProgressTimer();
    else stopProgressTimer();
    // Mobile only (see styles.ts): the product panel — photo, name, price,
    // "Add to cart" — is hidden until there's a result, so a shopper isn't
    // scrolling past the product they already know they're on before ever
    // seeing the upload step. Desktop's side-by-side layout has no such
    // problem and keeps it visible throughout (product ask, split view).
    shell.classList.toggle("lf-has-result", state === "result");
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
    setPhotoState("selected");
    updateGenerateEnabled();
    options.onEvent("tryon:photo-selected", { product: options.product });
    void api.postEvent({ type: "PHOTO_SELECTED", externalProductId: options.product.productId, visitorId, browserSessionId });
  }

  // "Try On" stays disabled until both a photo is chosen and the shopper
  // has ticked the consent box (product ask: a real, enforced privacy
  // checkbox on the try-on window, not just a passive footnote).
  function updateGenerateEnabled(): void {
    const consented = q<HTMLInputElement>("[data-consent]").checked;
    q<HTMLButtonElement>("[data-generate]").disabled = !(selectedFile && consented);
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
          resetFeedbackUi();
          setPhotoState("result");
          return;
        }
        if (status.status === "FAILED" || status.status === "EXPIRED") {
          options.onEvent("tryon:failed", { tryOnId, errorCode: status.errorCode ?? "EXPIRED", errorMessage: status.message ?? status.errorMessage });
          setPhotoState("selected");
          showError(status.status === "EXPIRED" ? T.expired : T.errGen);
          return;
        }
        if (Date.now() > deadline) {
          options.onEvent("tryon:failed", { tryOnId, errorCode: "CLIENT_POLL_TIMEOUT" });
          setPhotoState("selected");
          showError(T.errGen);
          return;
        }
        pollHandle = setTimeout(tick, POLL_INTERVAL_MS);
      } catch {
        if (Date.now() > deadline) {
          setPhotoState("selected");
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
    setPhotoState("processing");
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
      setPhotoState("selected");
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
      const dataUri = await fileToUploadDataUri(file);
      q<HTMLImageElement>("[data-preview]").src = dataUri;
      setPhotoState("processing");
      try {
        await api.retryTryOn(tryOnId, dataUri);
        await pollUntilDone();
      } catch (error) {
        setPhotoState("result"); // stay on the previous result rather than losing it
        showError((error as Error).message || T.errGen);
      }
    };
    input.click();
  }

  function close(): void {
    if (pollHandle) clearTimeout(pollHandle);
    stopProgressTimer();
    window.removeEventListener("resize", syncShellHeight);
    window.visualViewport?.removeEventListener("resize", syncShellHeight);
    backdrop.remove();
    document.body.style.overflow = "";
    options.onClose();
  }

  function resetFeedbackUi(): void {
    q("[data-fb-like]").classList.remove("selected");
    q("[data-fb-dislike]").classList.remove("selected");
    q<HTMLElement>("[data-fb-thanks]").style.display = "none";
    q<HTMLElement>("[data-feedback]").style.display = "flex";
  }

  function submitFeedback(rating: "LIKE" | "DISLIKE"): void {
    if (!tryOnId) return;
    q("[data-fb-like]").classList.toggle("selected", rating === "LIKE");
    q("[data-fb-dislike]").classList.toggle("selected", rating === "DISLIKE");
    q<HTMLElement>("[data-fb-thanks]").style.display = "block";
    options.onEvent("tryon:feedback", { tryOnId, rating });
    void api.submitFeedback(tryOnId, rating);
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

  const fileInput = q<HTMLInputElement>("[data-file-input]");
  fileInput.addEventListener("change", (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) void onFileSelected(file);
  });
  zone.addEventListener("dragover", (e) => {
    e.preventDefault();
    zone.classList.add("lf-dragging");
  });
  zone.addEventListener("dragleave", () => zone.classList.remove("lf-dragging"));
  zone.addEventListener("drop", (e) => {
    e.preventDefault();
    zone.classList.remove("lf-dragging");
    const file = e.dataTransfer?.files?.[0];
    if (file) void onFileSelected(file);
  });
  q("[data-upload-trigger]").addEventListener("click", () => fileInput.click());

  q("[data-generate]").addEventListener("click", () => void generate());
  q<HTMLInputElement>("[data-consent]").addEventListener("change", updateGenerateEnabled);
  backdrop.querySelector("[data-retry]")?.addEventListener("click", () => void retry());
  backdrop.querySelector("[data-back]")?.addEventListener("click", close);
  q("[data-add-to-cart]").addEventListener("click", () => void addToCart());
  q("[data-fb-like]").addEventListener("click", () => submitFeedback("LIKE"));
  q("[data-fb-dislike]").addEventListener("click", () => submitFeedback("DISLIKE"));

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
