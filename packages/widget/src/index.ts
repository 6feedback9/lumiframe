// Widget contract, fixed now so @lumiframe/sdk can be built against it
// before the real premium UI exists. The real implementation (Phase 1)
// ports the visual language already proven in the original LumiOn MVP
// (backdrop/modal/steps/upload-zone/result — see the legacy
// backend/public/widget.js in the `lumion` repo for the reference design)
// onto the async `/api/v1/tryons` flow instead of a synchronous fetch, and
// replaces this placeholder body with the real upload → poll → result UX
// described in the product spec §15/§46.

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
  | "tryon:add-to-cart";

export interface MountWidgetOptions {
  product: WidgetProduct;
  apiBaseUrl: string;
  storeId: string;
  locale: "en" | "uk" | "ru";
  onEvent: (event: WidgetEventName, payload: unknown) => void;
  onClose: () => void;
}

export interface WidgetHandle {
  close(): void;
}

/**
 * Mounts the widget modal and returns a handle to close it programmatically.
 * Placeholder body: shows the resolved product and a "coming soon" state so
 * the full open()→mount→close() path is exercisable end-to-end today.
 */
export function mountWidget(options: MountWidgetOptions): WidgetHandle {
  const backdrop = document.createElement("div");
  backdrop.setAttribute("data-lumiframe-widget", "");
  backdrop.style.cssText =
    "position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.55);" +
    "display:flex;align-items:center;justify-content:center;";

  const modal = document.createElement("div");
  modal.style.cssText =
    "background:#fff;border-radius:16px;max-width:420px;width:calc(100% - 32px);" +
    "padding:24px;font-family:system-ui,sans-serif;text-align:center;";
  modal.innerHTML = `
    <div style="font-weight:600;font-size:15px;margin-bottom:8px;">${escapeHtml(options.product.productTitle ?? "Try on")}</div>
    <p style="font-size:13px;color:#777;line-height:1.5;">
      The try-on widget UI ships in Phase 1. This placeholder confirms
      @lumiframe/sdk successfully resolved the product and lazily loaded
      @lumiframe/widget.
    </p>
    <button type="button" data-close style="margin-top:16px;padding:10px 18px;border:none;border-radius:8px;background:#111;color:#fff;font-size:13px;cursor:pointer;">Close</button>
  `;

  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);

  function close(): void {
    backdrop.remove();
    options.onClose();
  }

  modal.querySelector<HTMLButtonElement>("[data-close]")?.addEventListener("click", close);
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) close();
  });

  return { close };
}

function escapeHtml(value: string): string {
  const div = document.createElement("div");
  div.textContent = value;
  return div.innerHTML;
}
