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

/** Priority 4: schema.org `Product` microdata (`itemprop` attributes) —
 * common on storefront builders that mark up prices this way instead of (or
 * alongside) JSON-LD, e.g. many Ukrainian platforms like Horoshop. */
export function readMicrodataProduct(doc: Document): PartialProduct | null {
  // Must find an actual Product-scoped root — no document-wide fallback.
  // itemprop="name"/"image" aren't unique to products (an Organization or
  // WebSite schema uses "name" too, breadcrumbs and articles have "image")
  // — searching the whole page for bare itemprop attributes was the same
  // false-positive risk as the og:type-less OpenGraph check right below,
  // and would auto-inject the button on non-product pages just the same.
  const root = doc.querySelector('[itemscope][itemtype*="schema.org/Product" i]');
  if (!root) return null;
  const nameEl = root.querySelector('[itemprop="name"]');
  const imageEl = root.querySelector('[itemprop="image"]');
  const priceEl = root.querySelector('[itemprop="price"]');
  const currencyEl = root.querySelector('[itemprop="priceCurrency"]');
  if (!nameEl && !imageEl && !priceEl) return null;
  const title = nameEl?.getAttribute("content") ?? nameEl?.textContent?.trim();
  const image = imageEl?.getAttribute("content") ?? imageEl?.getAttribute("src") ?? undefined;
  const currency = currencyEl?.getAttribute("content") ?? currencyEl?.textContent?.trim();
  return {
    productTitle: title || undefined,
    productImageUrl: image || undefined,
    price: parsePrice(priceEl?.getAttribute("content") ?? priceEl?.textContent ?? undefined),
    currency: currency || undefined,
  };
}

/** Priority 5: OpenGraph / product meta tags. */
export function readOpenGraphProduct(doc: Document): PartialProduct | null {
  // og:title/og:image alone are NOT a product signal — nearly every page
  // on the internet has them for social-share previews (a homepage, a
  // blog post, a collection page — all of these have og:title/og:image
  // too). Without this check, the "Try on" button was auto-injecting on
  // every page of a real store, homepage included, because those generic
  // sharing tags happily "detected" as a product. og:type is the actual,
  // standard way a page declares itself a product page.
  const type = attrOf(doc, 'meta[property="og:type"]', "content");
  if (type?.toLowerCase() !== "product") return null;

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
    readMicrodataProduct(doc),
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

/**
 * Best-effort live enrichment via Shopify's own product JSON endpoint —
 * every Shopify storefront publishes `/products/<handle>.js`, public and
 * unauthenticated, with an always-accurate price straight from the
 * catalog. Not every theme emits price in JSON-LD/OpenGraph/microdata
 * correctly — a theme can render "$49" as plain text with no
 * machine-readable tag at all, or worse, a hand-edited JSON-LD block can
 * output the raw Liquid `variant.price` (the store's minor currency unit,
 * e.g. cents) without the `| money` filter, which parses as a real-looking
 * but 100x-too-large price (confirmed on a real store this session: a
 * price rendered as "158384 UAH" instead of "1583.84 UAH"). Since Shopify's
 * own catalog JSON can't have that bug, it deliberately OVERRIDES whatever
 * price detectProduct() found rather than just filling a gap, whenever
 * we're confirmed to be on a Shopify store — page markup is not a more
 * trustworthy source than Shopify's own data for its own store.
 *
 * packages/integrations/shopify is the eventual real Shopify App (Phase 3,
 * OAuth'd), but this needs none of that: it's the same JSON a theme's own
 * scripts could fetch.
 *
 * Only tried when `window.Shopify` is present (Shopify injects this on
 * every storefront page — a reliable "this is a Shopify site" signal) and
 * the URL is a product page. Leaves productTitle/productImageUrl/etc. from
 * detectProduct() alone — only price/currency are corrected here. Fails
 * silently on any error, or if the fetch didn't yield a usable price: this
 * must never block the widget from opening, and must never overwrite a
 * good price with nothing.
 */
export async function enrichFromShopify(product: AttachProductInput): Promise<AttachProductInput> {
  if (typeof window === "undefined" || !(window as unknown as { Shopify?: unknown }).Shopify) return product;

  const match = window.location.pathname.match(/\/products\/([^/?#]+)/);
  if (!match) return product;

  try {
    const res = await fetch(`${window.location.origin}/products/${match[1]}.js`, { credentials: "omit" });
    if (!res.ok) return product;
    const shopifyProduct = await res.json();
    // Shopify returns price in the smallest currency unit (cents).
    const price = typeof shopifyProduct.price === "number" ? shopifyProduct.price / 100 : undefined;
    if (price === undefined) return product;
    const currency = (window as unknown as { Shopify?: { currency?: { active?: string } } }).Shopify?.currency?.active;
    return { ...product, price, currency: currency ?? product.currency };
  } catch {
    return product;
  }
}
