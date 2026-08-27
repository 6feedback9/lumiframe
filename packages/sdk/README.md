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

If `attach()` is never called, `TryOn.open()` runs the detection cascade in
`detectProduct()` (JSON-LD → OpenGraph → merchant-configured DOM selectors)
against the current page. If a platform adapter
(`packages/integrations/shopify` etc.) is loaded, it takes priority over
the generic cascade.

## API

```ts
TryOn.init(options: { storeId: string; apiBaseUrl?: string; locale?: "en"|"uk"|"ru" }): TryOnSdk
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
