-- Trial bumped from 5 to 10 try-ons — product decision, not a bugfix.
-- The TEST plan row is the single source of truth for the trial size
-- (apps/api/src/routes/auth.ts grants it on signup, planEntitlement.ts
-- enforces monthlyLimit against it); no other place hardcodes the
-- count, so this is the whole change on the data side.
UPDATE "plans" SET "monthlyLimit" = 10, "updatedAt" = now() WHERE "key" = 'TEST';
