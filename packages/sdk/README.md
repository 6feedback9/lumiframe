# @lumiframe/sdk

The universal JS SDK merchants embed on their product pages. See
[`ARCHITECTURE.md`](../../ARCHITECTURE.md) §8 for the detection strategy
this implements and §3 for where it sits in the overall flow.

## Install (merchant-facing usage)

```html
<script src="https://cdn.lumiframe.com/sdk.js"></script>
<script>
  TryOn.init({ storeId: "store_123" });

  // Explicit product config always wins over auto-detection:
  TryOn.attach({
    productId: "RB-001",
    productTitle: "Ray-Ban Aviator",
    productImageUrl: "https://merchant.com/images/rayban-aviator.jpg",
    productUrl: "https://merchant.com/product/ray-ban-aviator",
    price: 4500,
    currency: "UAH",
    sku: "RB-001",
  });
</script>
```

If `attach()` is never called, `TryOn.open()` re-runs the detection cascade
in `detectProduct()` (JSON-LD → microdata → OpenGraph → merchant-configured
DOM selectors) against the current page **every time it's called** — not
once and cached — so it reflects whatever's actually on screen at that
moment. If a platform adapter (`packages/integrations/shopify` etc.) is
loaded, it takes priority over the generic cascade. Calling `attach()`
explicitly opts out of all of this: the product you passed is trusted as-is
and stays sticky across opens until you call `attach()` again yourself.

### Products with multiple colors/styles on one page

If a product page has color swatches (a common pattern — see e.g. Quay's
product pages), plain auto-detection alone will not track which one the
shopper has selected: JSON-LD, microdata and OpenGraph tags are rendered
once by the server for the page's default variant and never update when a
swatch is clicked client-side. Configure a DOM selector pointing at the
theme's live gallery image instead — it's re-read on every `TryOn.open()`
and takes priority over the static tags specifically for the image field:

```html
<script>
  TryOn.configureSelectors({
    productImageSelector: "#gallery-img", // whatever element the theme swaps `src` on when a swatch is clicked
  });
</script>
```

This only works if the theme updates that element's `src` in place when the
color changes (true for most Shopify themes' main gallery image); if a
theme instead swaps in a wholly different `<img>` element per color, point
the selector at whichever one is actually visible, or call `attach()`
yourself from the theme's own variant-change handler with the new image URL.

Two Shopify-specific quirks this handles automatically, so you don't need
to hunt for a "clean" element: a protocol-relative `src`
(`//cdn.shopify.com/...`, common in Shopify themes) resolves to a full
`https://` URL rather than failing the backend's domain check outright;
and a small explicit `width` in the URL (real example: a theme's sticky
add-to-cart bar reusing the same image at `width=120` for its own
thumbnail) gets widened back out, since a 120px photo makes for a poor
try-on generation regardless of which domain it's on.

## Auto-injected "Try on" button

By default (`autoInject: true`), the SDK inserts a "Try on" button itself
as soon as a product resolves — right after whatever looks like the page's
add-to-cart control (`.add-to-cart`, `[name="add"]`, `.btn-cart`,
`.product-form__submit`, `[data-add-to-cart]` — this list covers Shopify's
default themes and generic/WooCommerce markup), or after the page's `<h1>`
if none of those match. Clicking it calls `TryOn.open()`. This is what
makes the one `<script>` snippet above sufficient on its own — no theme
editing beyond pasting it.

The default look is a small pill button styled via a `<style>` tag the SDK
injects once; override it with your own CSS against `.lumiframe-tryon-button`,
or just the `--lumiframe-accent` / `--lumiframe-radius` custom properties.

Opt out (to place your own trigger element and call `TryOn.open()` from its
click handler instead), override the label, or override where it's placed:

```html
<script>
  TryOn.init({
    storeId: "store_123",
    autoInject: false,              // or:
    buttonLabel: "Try it on",       // default: "Try on"
    buttonAnchorSelector: "#hero",  // insert after this element instead of the auto-detected anchor
  });
</script>
```

## "Try on" buttons on a catalog/collection page

`autoInject` above only covers the single product page. Set
`cardButtonEnabled: true` to also add a smaller affordance to every product
card on a listing page — collection, search results, a category grid:

```html
<script>
  TryOn.init({
    storeId: "store_123",
    cardButtonEnabled: true,
    cardButtonVariant: "corner",   // "corner" (default) | "drawer" | "scrim"
  });
</script>
```

Reuses the same `buttonColorStart`/`buttonColorEnd`/`buttonTextColor`/
`buttonStyle` as the page button above — no separate color config. Clicking
a card's button opens the try-on window straight for *that* card's product,
without navigating to its product page first.

**Detection.** `detectCards()` (`src/detectCards.ts`) finds cards by
looking for a thumbnail `<img>` inside a link to `/products/<handle>`
(Shopify) or `/product/<slug>/` (WooCommerce) — the two platforms this was
actually verified against. Anything else needs one attribute per card for
guaranteed correctness:

```html
<div data-lumiframe-card data-lumiframe-title="Aviator" data-lumiframe-price="45.00">
  <img src="..." alt="Aviator">
</div>
```

`data-lumiframe-card` on any element containing an `<img>` (or on the
`<img>` itself) wins outright and skips the link heuristic entirely —
`data-lumiframe-image`/`-title`/`-price`/`-id`/`-url` override what would
otherwise be read from the image/link/nearby text. Once any
`data-lumiframe-card` markers exist on the page, only those are used (no
mixing with the heuristic, so a hand-wired card never gets a duplicate
button).

**Known limits:** one-shot detection on page load — a grid that loads more
cards later (infinite scroll, an AJAX filter) won't pick those up. No
platform-specific enrichment yet (unlike the single product page's
`enrichFromShopify`), so price shown before opening the widget is whatever
the card's own markup says. A cart drawer/mini-cart line item links to the
same `/products/...` URL a catalog card does and is deliberately excluded
— anything inside a container whose id/class/tag mentions "cart" is
skipped, so a shopper never gets a "Try on" button on an item already in
their cart.

## API

```ts
TryOn.init(options: {
  storeId: string;
  apiBaseUrl?: string;
  locale?: "en"|"uk"|"ru";
  autoInject?: boolean;             // default true — see "Auto-injected button" above
  buttonLabel?: string;
  buttonAnchorSelector?: string;
  cardButtonEnabled?: boolean;      // default false — see "Try on buttons on a catalog page" above
  cardButtonVariant?: "corner"|"drawer"|"scrim";
}): TryOnSdk
TryOn.attach(product: AttachProductInput): void
TryOn.open(product?: AttachProductInput): void
TryOn.close(): void
TryOn.destroy(): void
TryOn.on(event: SdkEventName, listener: (payload) => void): () => void   // returns an unsubscribe fn
```

`AttachProductInput`:

```ts
{
  productId: string;
  productTitle?: string;
  productImageUrl: string;   // required — the button will not render without it
  productUrl?: string;
  price?: number;
  currency?: string;
  sku?: string;
}
```

## Events

Emitted both through `TryOn.on(...)` and as `document` `CustomEvent`s of the
same name (so merchant analytics/GTM snippets can listen without touching
our JS API):

`tryon:open`, `tryon:photo-selected`, `tryon:started`, `tryon:processing`,
`tryon:completed`, `tryon:failed`, `tryon:add-to-cart`, `tryon:close`.

## Design constraints this package must keep holding

- **No heavy dependencies, no bundler runtime assumptions.** Ships as an
  IIFE + ESM build via `tsup`; must work dropped into any site via a single
  `<script>` tag.
- **Lazy widget loading.** `@lumiframe/widget` is only imported (dynamically)
  the moment `open()` actually runs — most product-page loads never click
  "Try on", so the SDK's own footprint on every page load must stay tiny.
- **Never talks to an AI vendor or storage directly.** The SDK only ever
  calls our own `/api/v1/*`; provider/storage credentials never reach the
  browser (ARCHITECTURE.md §11).
