# apps/admin

The platform owner's (your) own console — every tenant/merchant on Lumi
Frame, not a single tenant's view. This is deliberately a *separate* app
from `apps/dashboard`: different login, different auth model
(`isPlatformAdmin`, see `packages/database/prisma/schema.prisma`'s comment
on `User.isPlatformAdmin` and `apps/api/src/plugins/auth.ts`'s
`authenticateAdmin`), and no tenant can ever end up here by mistake.

## Creating your account

There is no sign-up page and no HTTP endpoint that can create a platform
admin — run this once, yourself, against the database:

```bash
cd apps/api
node scripts/createPlatformAdmin.mjs you@example.com "a strong password"
```

Re-running it with the same email just resets the password — safe to
re-run if you forget it.

## Running it

```bash
cp .env.example .env.local
pnpm dev   # http://localhost:3300
```

## Phase 1 scope

Tenants list (every tenant, its store(s), try-on count, billable usage
units) and a tenant detail page (stores, team, recent try-ons). Plan/quota
management, suspending a tenant, and billing/invoicing are Phase 4
(`UsageRecord` already has what a billing view would aggregate).
