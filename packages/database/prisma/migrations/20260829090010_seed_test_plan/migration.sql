-- The trial as a real Plan row: $0/mo, 5 try-ons, sortOrder 0 so it
-- lists first (before Starter). topUpPackSize/Price are 0 — you don't
-- buy a top-up pack on top of a free trial, you upgrade to a real plan
-- (apps/dashboard's billing page already hides the top-up button for
-- this plan specifically — see routes/billing.ts). Never shown in the
-- merchant-facing plan list (routes/billing.ts filters it out) — only
-- the admin can assign it (routes/admin.ts).
INSERT INTO "plans" ("id", "key", "name", "monthlyLimit", "priceUsd", "topUpPackSize", "topUpPackPriceUsd", "sortOrder", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'TEST', 'Тест', 5, 0.00, 0, 0.00, 0, now(), now())
ON CONFLICT ("key") DO NOTHING;
