# apps/dashboard

Merchant-facing SaaS dashboard. Phase 1 ships **Overview** and **Try-ons**
only (reads `TryOnSession`/`TryOnGeneration`/`Event` via `apps/api`'s
`/api/v1/analytics` and `/api/v1/tryons`) — the primary object is the
try-on, not a product catalog (ARCHITECTURE.md §1/§22). Analytics detail,
Orders, Integration, Appearance, Team, and Settings land in later phases.

## Running it

```bash
cp .env.example .env.local   # point NEXT_PUBLIC_API_BASE_URL at apps/api
pnpm dev
```

Sign in with the account created by `apps/demo-store`'s seed script
(`pnpm --filter @lumiframe/demo-store seed`), or register your own via
`POST /api/v1/auth/register`.
