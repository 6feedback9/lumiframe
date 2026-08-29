-- Adds "TEST" to the PlanKey enum — trial moves from a special
-- "no plan + topUpCredits" tenant state to a real Plan row (see the
-- schema comment on PlanKey and Tenant.trialGrantedAt). A newly added
-- enum value can't be used in the same transaction it's added in on
-- Postgres, so this is its own migration; the seed row that actually
-- uses it is the next one.
ALTER TYPE "PlanKey" ADD VALUE 'TEST';
