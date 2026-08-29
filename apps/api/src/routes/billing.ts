// Merchant-facing plan/usage visibility (product ask: "клиенты должны
// видеть тариф и сколько уже использовано, с возможностью запросить
// апгрейд или докупить примерки"). Payment itself is manual for now
// (DEPLOYMENT.md) — this only records the request; the platform admin
// (apps/admin) acts on it and updates the tenant's plan/credits.

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../context";
import { authenticateMerchant } from "../plugins/auth";
import { checkPlanEntitlement } from "../domain/planEntitlement";

const requestSchema = z.object({
  message: z.string().min(1).max(1000).optional(),
  // What the merchant is asking for, so the admin dashboard can show it
  // as a one-line summary instead of just "see note". "paid" is the
  // merchant confirming they've sent a bank transfer for the payment
  // requisites shown on the billing page (product ask: manual-billing
  // flow — merchant pays by transfer, taps "I've paid", the platform
  // owner verifies and activates the plan herself).
  kind: z.enum(["upgrade", "topup", "paid"]),
  planKey: z.enum(["STARTER", "GROWTH", "PRO"]).optional(),
  // "paid" needs to say what was paid for, so the admin's pending-request
  // note actually names a plan instead of just "payment sent" (product
  // ask: the owner couldn't tell which plan a merchant had paid for).
  // planKey doubles as this when paying for a plan; topUp covers a pack.
  topUp: z.boolean().optional(),
});

export async function billingRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/billing", { preHandler: authenticateMerchant }, async (request, reply) => {
    const { tenantId } = request.merchant!;
    const [tenant, entitlement, allPlans] = await Promise.all([
      prisma.tenant.findUnique({ where: { id: tenantId }, include: { plan: true } }),
      checkPlanEntitlement(tenantId),
      // TEST excluded — it's an admin-grant-only plan (schema comment on
      // PlanKey), never something a merchant can self-select here.
      prisma.plan.findMany({ where: { key: { not: "TEST" } }, orderBy: { sortOrder: "asc" } }),
    ]);
    if (!tenant) return reply.code(404).send({ error: "Tenant not found" });

    return reply.send({
      plan: tenant.plan
        ? {
            key: tenant.plan.key,
            name: tenant.plan.name,
            monthlyLimit: tenant.plan.monthlyLimit,
            priceUsd: Number(tenant.plan.priceUsd),
            topUpPackSize: tenant.plan.topUpPackSize,
            topUpPackPriceUsd: Number(tenant.plan.topUpPackPriceUsd),
          }
        : null,
      usedThisMonth: entitlement.usedThisMonth,
      topUpCredits: entitlement.topUpCredits,
      planRequestNote: tenant.planRequestNote,
      planRequestedAt: tenant.planRequestedAt,
      // The sidebar's "Тестовий період" badge — true exactly while the
      // tenant is actually on the TEST plan (see PlanKey's schema
      // comment). Simpler than it used to be: trial is a real plan now,
      // not a "no plan + topUpCredits" state that needed its own
      // separate active/expired bookkeeping to stay in sync.
      trialActive: tenant.plan?.key === "TEST",
      allPlans: allPlans.map((p) => ({
        key: p.key,
        name: p.name,
        monthlyLimit: p.monthlyLimit,
        priceUsd: Number(p.priceUsd),
        topUpPackSize: p.topUpPackSize,
        topUpPackPriceUsd: Number(p.topUpPackPriceUsd),
      })),
    });
  });

  // Last 6 calendar months' completed try-ons (== billed units, since one
  // UsageRecord is exactly one completed generation) — feeds the
  // dashboard's Overview trend charts. Used to run 6 separate `count`
  // queries, one per month, each one a full sequential round trip to the
  // database — noticeably slow over a real network to Supabase (product
  // report: pages taking "several seconds" to load), even though each
  // individual query was cheap. One query for the whole 6-month window,
  // bucketed into months here in JS, is one round trip instead of six —
  // still fine at Phase 1 data volumes (this route's existing "bounded
  // window, JS-side aggregation" style, see apps/api/src/routes/
  // analytics.ts's top comment), and there's no plausible tenant at this
  // stage with enough monthly usage rows to make that bucketing itself
  // the bottleneck.
  app.get("/api/v1/billing/history", { preHandler: authenticateMerchant }, async (request, reply) => {
    const { tenantId } = request.merchant!;
    const now = new Date();
    const windowStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1));

    const records = await prisma.usageRecord.findMany({
      where: { tenantId, createdAt: { gte: windowStart } },
      select: { createdAt: true },
    });

    const counts = new Map<string, number>();
    for (const r of records) {
      const key = `${r.createdAt.getUTCFullYear()}-${String(r.createdAt.getUTCMonth() + 1).padStart(2, "0")}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    const months: { month: string; tryOns: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
      months.push({ month: key, tryOns: counts.get(key) ?? 0 });
    }

    return reply.send({ months });
  });

  app.post("/api/v1/billing/request", { preHandler: authenticateMerchant }, async (request, reply) => {
    const parsed = requestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid request body", details: parsed.error.flatten() });

    const { tenantId } = request.merchant!;

    // This note is only ever read by the platform owner in her own admin
    // (apps/admin) — never by the merchant — so it's written in Ukrainian
    // directly rather than run through the (merchant-facing) i18n system.
    let note: string;
    if (parsed.data.kind === "upgrade") {
      note = `Запит на підвищення тарифу до ${parsed.data.planKey ?? "вищого тарифу"}.${parsed.data.message ? ` Коментар: ${parsed.data.message}` : ""}`;
    } else if (parsed.data.kind === "topup") {
      note = `Запит на пакет додаткових примірок.${parsed.data.message ? ` Коментар: ${parsed.data.message}` : ""}`;
    } else {
      const paidPlan = parsed.data.planKey ? await prisma.plan.findUnique({ where: { key: parsed.data.planKey } }) : null;
      const target = paidPlan ? `тариф «${paidPlan.name}»` : parsed.data.topUp ? "пакет додаткових примірок" : "свій тариф";
      note = `💰 Клієнт підтверджує оплату за ${target} — перевірте надходження і активуйте.${parsed.data.message ? ` Коментар: ${parsed.data.message}` : ""}`;
    }

    const tenant = await prisma.tenant.update({
      where: { id: tenantId },
      data: { planRequestNote: note, planRequestedAt: new Date() },
    });

    return reply.send({ planRequestNote: tenant.planRequestNote, planRequestedAt: tenant.planRequestedAt });
  });
}
