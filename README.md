# Lumi Frame

AI virtual try-on for eyewear ecommerce stores — a B2B SaaS platform that
plugs into a merchant's **existing** product pages via a single "Try on"
button. It is not a catalog, not a marketplace, and it never becomes the
merchant's product database.

Start here: **[`ARCHITECTURE.md`](./ARCHITECTURE.md)** — the source of
truth for the domain model, the async try-on pipeline, provider
abstraction, product detection strategy, and order attribution. Ready to
put this live? See **[`DEPLOYMENT.md`](./DEPLOYMENT.md)**.

## Status

**Phase 1 (core loop) is built and running:** product page → click "Try
on" → upload a photo → async generation via `MockTryOnProvider` → result
→ add to cart, plus a merchant dashboard (login, Overview, Try-ons list).
See `ARCHITECTURE.md` §16 for exactly what's in Phase 1 vs. deferred to
Phase 2/3/4 (real AI provider, Shopify/WooCommerce, billing/white-label).

## Layout

```
apps/
  api/            Fastify — public API + TryOnWorker (ARCHITECTURE.md §7)
  demo-store/     Fake eyewear store embedding the SDK, for testing the loop
  dashboard/      Merchant dashboard (Overview, Try-ons)
  admin/          Internal ops console — not yet built (Phase 4)
packages/
  database/       Prisma schema (Tenant/Store/TryOnSession/…)
  tryon/          TryOnProvider interface, TryOnSession state machine
  sdk/            The universal JS SDK (packages/sdk/README.md)
  widget/         The try-on widget UI, lazy-loaded by the SDK
  storage/        Object storage (local fs for dev/CI, Supabase for real)
  queue/          TryOnQueue (in-memory for dev/CI, BullMQ for real)
  providers/mock  MockTryOnProvider — no external AI calls
  providers/real  GeminiTryOnProvider — real generation via Google Gemini
  integrations/   Shopify/WooCommerce/generic — not yet built (Phase 3)
```

## Running the full loop locally

```bash
pnpm install

# 1. Database (Postgres — Supabase in prod, any local Postgres for dev)
cp .env.example apps/api/.env   # set DATABASE_URL/DIRECT_URL, JWT_SECRET, STORAGE_SIGNING_SECRET
pnpm --filter @lumiframe/database db:generate
pnpm --filter @lumiframe/database exec prisma migrate dev

# 2. API + worker (in-process, since no REDIS_URL is set — see ARCHITECTURE.md §7)
pnpm --filter @lumiframe/api dev            # http://localhost:4000

# 3. Seed a demo store, then start the demo storefront
pnpm --filter @lumiframe/demo-store seed    # prints NEXT_PUBLIC_STORE_ID
cp apps/demo-store/.env.example apps/demo-store/.env.local  # paste the storeId in
pnpm --filter @lumiframe/demo-store dev     # http://localhost:3100

# 4. Merchant dashboard
pnpm --filter @lumiframe/dashboard dev      # http://localhost:3200
```

`AI_PROVIDER=mock` (the default) runs the entire pipeline with zero
external AI calls — see `ARCHITECTURE.md` §6.

## Testing

```bash
pnpm test        # unit tests everywhere + apps/api's real-Postgres integration test
pnpm typecheck
```

`apps/api`'s test needs a local Postgres — see `apps/api/README.md`.
