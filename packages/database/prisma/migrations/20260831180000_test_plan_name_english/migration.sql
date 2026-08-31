-- Every other plan's "name" is a plain, un-translated label shown as-is
-- regardless of dashboard locale ('Starter', 'Growth', 'Pro' — see
-- 20260828110544_seed_plans). The TEST plan's seed (20260829090010) gave
-- it a Ukrainian literal, 'Тест', instead of following that same
-- convention — so switching the dashboard to EN still showed "Тест" on
-- the Overview page's "Current plan" card (merchant-reported, with a
-- screenshot). Renaming to match the others' convention, not adding a
-- translation layer just for this one row.
UPDATE "plans" SET "name" = 'Test', "updatedAt" = now() WHERE "key" = 'TEST';
