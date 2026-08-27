# apps/api — Phase 1

Fastify service hosting:
- the public API (`/api/v1/tryons`, `/api/v1/events`, `/api/v1/uploads`,
  `/api/v1/analytics`, `/api/v1/orders`, `/api/v1/webhooks/:provider`,
  `/api/v1/auth/*`, `/api/v1/store`, `/api/v1/integration`);
- the `TryOnWorker` process (BullMQ, queue `tryon-generation`).

Depends on `@lumiframe/database`, `@lumiframe/tryon`, and whichever
provider package `AI_PROVIDER` selects (`@lumiframe/provider-mock` for now).
See `ARCHITECTURE.md` §7 for the exact pipeline and §11 for the security
rules every route here must enforce (store-scoped auth, `allowedDomains`,
rate limiting, signed URLs).

Not yet implemented — this is a placeholder for Phase 1.
