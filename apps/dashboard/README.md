# apps/dashboard — Phase 1 (Overview + Try-ons), Phase 4 (rest)

Next.js merchant-facing SaaS dashboard. Navigation per the product spec §22:
Overview, Try-ons, Analytics, Orders, Integration, Appearance, Team,
Settings. The primary object is the **try-on**, not a product catalog — see
`ARCHITECTURE.md` §1.

Phase 1 ships Overview + the Try-ons list/detail view only (reads
`TryOnSession`/`TryOnGeneration`/`Event` via `@lumiframe/database`).
Analytics/Orders/Integration/Appearance/Team/Settings land in later phases
per `ARCHITECTURE.md` §16.

Not yet implemented — this is a placeholder for Phase 1.
