# apps/api

Fastify service hosting the public API and the `TryOnWorker`. See
`ARCHITECTURE.md` §7 for the pipeline and §11 for the auth model (public
try-on/event routes vs. JWT-authenticated dashboard routes).

## Endpoints (Phase 1)

- `POST /api/v1/auth/register` / `login` / `GET /me` — merchant account.
- `GET`/`PATCH /api/v1/store`, `GET`/`POST /api/v1/integration` — merchant-authenticated (JWT).
- `POST /api/v1/tryons` — public (storeId + Origin/allowedDomains). Creates a
  `TryOnSession` + first `TryOnGeneration`, stores the customer photo,
  enqueues the job, returns `202 { tryOnId, generationId, status }`.
- `POST /api/v1/tryons/:id/retry` — public. "Try another photo" — new
  `TryOnGeneration` on the same session.
- `GET /api/v1/tryons/:id` — public. Poll status / fetch the signed result URL.
- `GET /api/v1/tryons` / `GET /api/v1/tryons/:id/detail` — merchant-authenticated (JWT).
- `POST /api/v1/events` — public. Funnel events (ARCHITECTURE.md §9).
- `GET /api/v1/analytics` — merchant-authenticated (JWT).
- `GET /health`, `GET /ready`.

## Running it

Needs Postgres (`DATABASE_URL`) — see `packages/database`. Redis
(`REDIS_URL`) is optional: unset, the API process itself runs the worker
in-process on an in-memory queue (dev/CI); set, run the worker as a
separate process:

```bash
cp ../../.env.example .env   # fill in DATABASE_URL at minimum
pnpm --filter @lumiframe/database db:generate
pnpm --filter @lumiframe/database exec prisma migrate dev
pnpm dev                      # http://localhost:4000
# only if REDIS_URL is set:
pnpm worker:dev
```

## Testing

`src/tryonFlow.integration.test.ts` runs the real pipeline (register →
create try-on → in-process worker → `MockTryOnProvider` → poll →
`COMPLETED`, plus the `allowedDomains` security boundary) against a real
local Postgres — see `.env.test` and `vitest.setup.ts`. Requires a
Postgres reachable at the URL in `.env.test`; create the DB and apply
migrations once:

```bash
createdb lumiframe_test
DATABASE_URL=<...>/lumiframe_test pnpm --filter @lumiframe/database exec prisma migrate deploy
pnpm test
```
