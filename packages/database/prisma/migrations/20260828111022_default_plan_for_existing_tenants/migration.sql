-- Enforcement (apps/api/src/domain/planEntitlement.ts) blocks new try-ons
-- for a tenant with no plan assigned (monthlyLimit defaults to 0). Without
-- this, every tenant that registered before Plans existed — including any
-- already-live merchant — would silently lose the ability to create a
-- try-on the moment this deploys. Default them onto Starter; an admin can
-- change it from apps/admin afterward. Excludes the reserved
-- "lumiframe-platform" tenant (platform-admin accounts only, never a real
-- merchant — see the comment on User.isPlatformAdmin in schema.prisma).
UPDATE "tenants"
SET "planId" = (SELECT "id" FROM "plans" WHERE "key" = 'STARTER')
WHERE "planId" IS NULL AND "slug" != 'lumiframe-platform';