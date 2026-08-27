# apps/demo-store

A fake eyewear ecommerce store (catalog, product pages, cart, fake
checkout) embedding `@lumiframe/sdk` exactly like a real merchant would —
this is how the full loop gets tested end-to-end (ARCHITECTURE.md §16,
product spec §50): SDK → widget → `apps/api` → worker → `MockTryOnProvider`
→ result → `tryon:add-to-cart` → this store's own cart.

## Running the full loop

1. Start Postgres (`DATABASE_URL` in `apps/api/.env`) and `apps/api`:
   ```bash
   pnpm --filter @lumiframe/database db:generate
   pnpm --filter @lumiframe/api dev
   ```
2. Seed a demo store (registers a merchant account whose `allowedDomains`
   matches `http://localhost:3100`, the demo store's own origin —
   ARCHITECTURE.md §11):
   ```bash
   pnpm --filter @lumiframe/demo-store seed
   ```
   Copy the printed `NEXT_PUBLIC_STORE_ID` into `apps/demo-store/.env.local`
   (copy `.env.example` first).
3. Start the demo store (builds `@lumiframe/sdk` first, via `predev`):
   ```bash
   pnpm --filter @lumiframe/demo-store dev
   ```
4. Open http://localhost:3100, pick a product, click **Try on your face**,
   upload any photo. `MockTryOnProvider` returns a placeholder result
   within a couple seconds — no AI vendor credentials needed
   (`AI_PROVIDER=mock`, the default).

## What this app is not

It doesn't create real orders or call `apps/api` on checkout — "Checkout"
just clears the local cart. Wiring `ADD_TO_CART`/`ORDER_COMPLETED` through
to real attribution (`Attribution`, `Order` — ARCHITECTURE.md §10) is
Phase 3's `OrderTrackingAdapter` work, not this slice.
