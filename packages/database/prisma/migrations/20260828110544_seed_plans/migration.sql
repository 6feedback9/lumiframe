-- Seeds the three plans (ARCHITECTURE.md §13 addendum). Prices derived from
-- Gemini's ~$0.07/image cost (packages/providers/real) with a 3-4x margin
-- for infrastructure/support — see DEPLOYMENT.md for the full breakdown.
-- Safe to re-run: ON CONFLICT keeps existing rows untouched so a manual
-- price edit via SQL later isn't clobbered by a redeploy re-running this.
INSERT INTO "plans" ("id", "key", "name", "monthlyLimit", "priceUsd", "topUpPackSize", "topUpPackPriceUsd", "sortOrder", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'STARTER', 'Starter', 100, 29.00, 50, 12.00, 1, now(), now()),
  (gen_random_uuid()::text, 'GROWTH', 'Growth', 500, 99.00, 100, 20.00, 2, now(), now()),
  (gen_random_uuid()::text, 'PRO', 'Pro', 1000, 179.00, 200, 35.00, 3, now(), now())
ON CONFLICT ("key") DO NOTHING;