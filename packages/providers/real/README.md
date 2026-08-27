# packages/providers/real — Phase 2

Real AI vendor adapter, implementing the same `TryOnProvider` interface as
`@lumiframe/provider-mock` (`packages/tryon/src/provider.ts`). Vendor choice
is an open decision — see `ARCHITECTURE.md` §13. All vendor-specific HTTP
calls, auth, and response parsing live here and nowhere else in the repo.

Not yet implemented — deferred until a vendor is selected.
