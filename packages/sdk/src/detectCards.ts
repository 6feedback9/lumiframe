// Per-card product detection for a catalog/collection grid — a harder
// problem than the single product page (detectProduct.ts): there's no
// page-level JSON-LD/OpenGraph for a card, since a listing page describes
// many products, not one. This is DOM-heuristic only, same spirit as
// detectProduct's DOM-selector fallback, applied once per card instead of
// once for the whole page.
//
// Priority: a merchant/theme dev who marks their own card markup with
// data-lumiframe-card (packages/sdk/README.md) always wins outright and
// skips the heuristic entirely — the only way to *guarantee* correct
// detection on a platform this module has no built-in pattern for. The
// fallback below only recognizes the two link patterns actually verified:
// Shopify's /products/<handle> and WooCommerce's /product/<slug>/.

import { parsePrice } from "./detectProduct";
import type { AttachProductInput } from "./types";

export interface CardMatch {
  /** The <img> this card's button gets positioned against. */
  image: HTMLImageElement;
  product: AttachProductInput;
}

/** Shopify's own `| image_url` filter, and plenty of themes' own markup,
 * emit protocol-relative ("//cdn.shopify.com/...") or site-relative
 * ("/cdn/...") image URLs — real, but not a URL `fetch()`/the API accepts
 * as-is. Absolute http(s) URLs pass through unchanged. */
function toAbsoluteUrl(url: string): string {
  if (url.startsWith("//")) return `https:${url}`;
  if (url.startsWith("/") && typeof window !== "undefined") return `${window.location.origin}${url}`;
  return url;
}

/** A lazy-loaded thumbnail often keeps its real URL in data-src/data-srcset
 * (or the plain srcset) until it scrolls into view — .currentSrc/.src fall
 * back to a 1x1 placeholder or an empty string until then. Checks every
 * place a theme might be keeping the real address, in order of how likely
 * it is to already be resolved, and normalizes whichever one's found. */
function resolveImageUrl(img: HTMLImageElement): string | undefined {
  const candidates = [
    img.currentSrc,
    img.getAttribute("src"),
    img.getAttribute("data-src"),
    img.getAttribute("data-srcset")?.split(",")[0]?.trim().split(/\s+/)[0],
    img.getAttribute("srcset")?.split(",")[0]?.trim().split(/\s+/)[0],
  ];
  for (const raw of candidates) {
    if (!raw || raw.startsWith("data:")) continue;
    return toAbsoluteUrl(raw);
  }
  return undefined;
}

/**
 * `link.querySelector("img")` (the direct-nesting case below) only finds a
 * thumbnail when the theme puts it inside the product's own <a> — true on
 * the themes this was first verified against, but not universal: a real
 * store (Shopify's own Dawn-derived markup) instead puts the image as a
 * *sibling* of the link, both inside a shared "card" wrapper div, and that
 * pattern found zero matches for every product on the page. Falls back to
 * climbing from the link (not the image) for a nearby ancestor that
 * contains one — the same fix already shipped in the standalone Shopify
 * app's own fallback-detection pass, ported back here so every integration
 * gets it instead of just that one.
 */
function findNearbyImage(link: HTMLAnchorElement): HTMLImageElement | null {
  const direct = link.querySelector("img");
  if (direct) return direct;
  let container: Element | null = link.parentElement;
  for (let i = 0; i < 6 && container; i++) {
    const img = container.querySelector<HTMLImageElement>("img");
    if (img) return img;
    container = container.parentElement;
  }
  return null;
}

function firstMatchText(root: ParentNode, selector: string): string | undefined {
  const text = root.querySelector(selector)?.textContent?.trim();
  return text || undefined;
}

/** Climbs a fixed, shallow number of ancestors from the thumbnail to scope
 * the title/price search — there's no real per-theme contract for "where a
 * card ends", so this stays deliberately narrow rather than risking a wide
 * ancestor that picks up a neighboring card's price instead. */
function cardScope(img: Element): ParentNode {
  let node: Element = img;
  for (let i = 0; i < 4 && node.parentElement; i++) node = node.parentElement;
  return node;
}

function fromManualMarkers(doc: Document): CardMatch[] {
  const matches: CardMatch[] = [];
  for (const el of Array.from(doc.querySelectorAll<HTMLElement>("[data-lumiframe-card]"))) {
    const img = el instanceof HTMLImageElement ? el : el.querySelector("img");
    if (!img) continue;
    const imageUrl = el.getAttribute("data-lumiframe-image") ?? resolveImageUrl(img);
    if (!imageUrl) continue;
    const url = el.getAttribute("data-lumiframe-url") ?? el.closest("a")?.href;
    matches.push({
      image: img,
      product: {
        productId: el.getAttribute("data-lumiframe-id") ?? url ?? imageUrl,
        productImageUrl: imageUrl,
        productTitle: el.getAttribute("data-lumiframe-title") ?? img.alt ?? undefined,
        productUrl: url,
        price: parsePrice(el.getAttribute("data-lumiframe-price") ?? undefined),
      },
    });
  }
  return matches;
}

// Deliberately just these two link shapes — the two real platforms this
// was verified against. Anything else needs data-lumiframe-card.
const PRODUCT_LINK_SELECTOR = 'a[href*="/products/"], a[href*="/product/"]';

// A cart drawer/mini-cart line item links to the exact same /products/...
// URL and has its own thumbnail — a real store's cart, with a button
// injected on its own line-item photo, was the first thing a merchant
// caught this on. Every cart implementation seen in the wild — Shopify's
// own cart-drawer/cart-notification, WooCommerce's mini-cart widget, and
// every generic "cart drawer" — names itself "cart" somewhere in an id,
// class, or the container tag itself, so that's the signal excluded here
// rather than trying to enumerate every theme's markup.
const CART_CONTAINER_SELECTOR = '[id*="cart" i], [class*="cart" i], [data-cart], cart-drawer, cart-notification, cart-items';

function fromLinkHeuristic(doc: Document): CardMatch[] {
  const seen = new Set<string>();
  const matches: CardMatch[] = [];
  for (const link of Array.from(doc.querySelectorAll<HTMLAnchorElement>(PRODUCT_LINK_SELECTOR))) {
    if (link.closest(CART_CONTAINER_SELECTOR)) continue; // a cart line item, not a catalog card — see above
    const img = findNearbyImage(link);
    if (!img || img.closest(CART_CONTAINER_SELECTOR)) continue;
    const imageUrl = resolveImageUrl(img);
    if (!imageUrl) continue;
    if (seen.has(link.href)) continue; // thumbnail and a second nested link to the same product, seen once already
    seen.add(link.href);

    const scope = cardScope(img);
    matches.push({
      image: img,
      product: {
        productId: link.href,
        productImageUrl: imageUrl,
        productTitle: firstMatchText(scope, '[class*="title" i], [class*="name" i], h1, h2, h3, h4') ?? img.alt ?? undefined,
        productUrl: link.href,
        price: parsePrice(firstMatchText(scope, '[class*="price" i], [data-price]')),
      },
    });
  }
  return matches;
}

/** Every try-on-able product card found on the current page. Manual
 * data-lumiframe-card markers win outright and skip the link heuristic
 * entirely — mixing both would double up buttons on cards the merchant
 * already wired by hand. */
export function detectCards(doc: Document): CardMatch[] {
  const manual = fromManualMarkers(doc);
  if (manual.length > 0) return manual;
  return fromLinkHeuristic(doc);
}
