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

/** A lazy-loaded thumbnail often keeps its real URL in data-src (or the
 * first entry of data-srcset) until it scrolls into view — .src/.currentSrc
 * fall back to a 1x1 placeholder or an empty string until then. */
function resolveImageUrl(img: HTMLImageElement): string | undefined {
  const lazySrc = img.getAttribute("data-src") ?? img.getAttribute("data-srcset")?.split(",")[0]?.trim().split(" ")[0];
  const liveSrc = img.currentSrc || img.src;
  if (liveSrc && !liveSrc.startsWith("data:")) return liveSrc;
  return lazySrc || undefined;
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

function fromLinkHeuristic(doc: Document): CardMatch[] {
  const seen = new Set<string>();
  const matches: CardMatch[] = [];
  for (const link of Array.from(doc.querySelectorAll<HTMLAnchorElement>(PRODUCT_LINK_SELECTOR))) {
    const img = link.querySelector("img");
    if (!img) continue; // the card's *title* link, not its thumbnail — the image link covers this same product
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
