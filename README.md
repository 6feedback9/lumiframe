# Lumi Frame

AI virtual try-on for eyewear ecommerce stores — a B2B SaaS platform that
plugs into a merchant's **existing** product pages via a single "Try on"
button. It is not a catalog, not a marketplace, and it never becomes the
merchant's product database.

Start here: **[`ARCHITECTURE.md`](./ARCHITECTURE.md)** — the source of
truth for the domain model, the async try-on pipeline, provider
abstraction, product detection strategy, and order attribution.

## Status

Phase 0 (design baseline): architecture doc, Prisma schema, core domain
interfaces (`TryOnProvider`, `TryOnSession` lifecycle,
`ProductImageProcessor`), `MockTryOnProvider`, and the SDK contract
(`@lumiframe/sdk`) with generic product auto-detection are in place. See
`ARCHITECTURE.md` §16 for what's next (Phase 1: async API + queue + worker,
widget UI, demo store, minimal dashboard).

## Layout

```
apps/       api · dashboard · admin · demo-store
packages/   database · tryon · sdk · widget · storage · analytics
            providers/mock · providers/real
            integrations/shopify · woocommerce · generic
```

## Getting started

```bash
pnpm install
cp .env.example .env        # fill in Supabase + Redis credentials
pnpm --filter @lumiframe/database db:generate
pnpm test                   # runs the Phase 0 unit tests (session lifecycle, MockTryOnProvider)
```

`AI_PROVIDER=mock` (the default) runs the entire pipeline with zero
external AI calls — see `ARCHITECTURE.md` §6.
