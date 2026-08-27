// Automatic product detection — ARCHITECTURE.md §8. Tried in priority
// order, first match for a field wins; `explicit` (from TryOn.attach)
// always wins outright since a merchant who called attach() knows better
// than any heuristic.
//
// Platform adapters (Shopify/WooCommerce, packages/integrations/*) run
// before this and can short-circuit it entirely — this module is the
// generic fallback for "we've never seen this platform before".

import type { AttachProductInput } from "./types";

export interface DomSelectorConfig {
  productIdSelector?: string;
  productTitleSelector?: string;
  productImageSelector?: string;
  priceSelector?: string;
  skuSelector?: string;
}

type PartialProduct = Partial<AttachProductInput>;

function textOf(doc: Document, selector?: string): string | undefined {
  if (!selector) return undefined;
  const el = doc.querySelector(selector);
  const text = el?.textContent?.trim();
  return text || undefined;
}

function attrOf(doc: Document, selector: string | undefined, attr: string): string | undefined {
  if (!selector) return undefined;
  const el = doc.querySelector(selector);
  const value = el?.getAttribute(attr)?.trim();
  return value || undefined;
}

function parsePrice(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const match = raw.replace(/\s/g, "").match(/[\d.,]+/);
  if (!match) return undefined;
  const normalized = match[0].replace(/,(?=\d{3}(\D|$))/g, "").replace(",", ".");
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** Priority 3: JSON-LD `Product` structured data. */
export function readJsonLdProduct(doc: Document): PartialProduct | null {
  const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
  for (const script of Array.from(scripts)) {
    try {
      const parsed = JSON.parse(script.textContent ?? "");
      const candidates = Array.isArray(parsed) ? parsed : [parsed];
      for (const node of candidates) {
        const graph = node["@graph"] ?? [node];
        for (const entry of Array.isArray(graph) ? graph : [graph]) {
          if (entry?.["@type"] === "Product" || (Array.isArray(entry?.["@type"]) && entry["@type"].includes("Product"))) {
            const offers = Array.isArray(entry.offers) ? entry.offers[0] : entry.offers;
            const image = Array.isArray(entry.image) ? entry.image[0] : entry.image;
            return {
              productId: entry.sku ?? entry.productID ?? undefined,
              productTitle: entry.name ?? undefined,
              productImageUrl: typeof image === "string" ? image : image?.url,
              sku: entry.sku ?? undefined,
              price: parsePrice(offers?.price ?? offers?.priceSpecification?.price),
              currency: offers?.priceCurrency ?? undefined,
            };
          }
        }
      }
    } catch {
      // malformed JSON-LD on the page — skip it, try the next <script> tag
    }
  }
  return null;
}

/** Priority 4: OpenGraph / product meta tags. */
export function readOpenGraphProduct(doc: Document): PartialProduct | null {
  const image = attrOf(doc, 'meta[property="og:image"]', "content");
  const title = attrOf(doc, 'meta[property="og:title"]', "content");
  const url = attrOf(doc, 'meta[property="og:url"]', "content");
  const price = attrOf(doc, 'meta[property="product:price:amount"]', "content");
  const currency = attrOf(doc, 'meta[property="product:price:currency"]', "content");
  if (!image && !title) return null;
  return {
    productTitle: title,
    productImageUrl: image,
    productUrl: url,
    price: parsePrice(price),
    currency,
  };
}

/** Priority 5: merchant-configured DOM selectors, for unknown platforms. */
export function readSelectorProduct(doc: Document, selectors: DomSelectorConfig): PartialProduct | null {
  if (!Object.values(selectors).some(Boolean)) return null;
  return {
    productId: textOf(doc, selectors.productIdSelector) ?? attrOf(doc, selectors.productIdSelector, "data-product-id"),
    productTitle: textOf(doc, selectors.productTitleSelector),
    productImageUrl: attrOf(doc, selectors.productImageSelector, "src"),
    price: parsePrice(textOf(doc, selectors.priceSelector)),
    sku: textOf(doc, selectors.skuSelector),
  };
}

export interface DetectProductOptions {
  explicit?: AttachProductInput;
  /** Set by a platform adapter (packages/integrations/*) before this runs. */
  platformAdapterResult?: PartialProduct | null;
  domSelectors?: DomSelectorConfig;
}

/**
 * Merges detection layers in priority order (ARCHITECTURE.md §8): explicit
 * config > platform adapter > JSON-LD > OpenGraph > DOM selectors. Earlier
 * layers win field-by-field, later layers only fill gaps.
 *
 * Returns null if `productImageUrl` — the one field the widget cannot
 * function without — was never resolved. The SDK must not render the
 * "Try on" button in that case (ARCHITECTURE.md §8).
 */
export function detectProduct(doc: Document, options: DetectProductOptions = {}): AttachProductInput | null {
  const layers: (PartialProduct | null)[] = [
    options.explicit ?? null,
    options.platformAdapterResult ?? null,
    readJsonLdProduct(doc),
    readOpenGraphProduct(doc),
    options.domSelectors ? readSelectorProduct(doc, options.domSelectors) : null,
  ];

  const merged: PartialProduct = {};
  for (const layer of layers) {
    if (!layer) continue;
    for (const [key, value] of Object.entries(layer) as [keyof PartialProduct, unknown][]) {
      if (merged[key] === undefined && value !== undefined) {
        (merged as Record<string, unknown>)[key] = value;
      }
    }
  }

  if (!merged.productImageUrl) return null;
  if (!merged.productId) merged.productId = merged.productUrl ?? merged.productImageUrl;

  return merged as AttachProductInput;
}
