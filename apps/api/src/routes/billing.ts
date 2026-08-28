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

// Self-serve trial size (product ask: let a brand-new merchant unblock
// themselves with a handful of try-ons instead of waiting on the owner to
// assign a plan). A plain constant, not DB-configurable — same pattern as
// PAYMENT_DETAILS in apps/dashboard/app/billing/page.tsx.
const TRIAL_CREDITS = 5;

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
      prisma.plan.findMany({ orderBy: { sortOrder: "asc" } }),
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
      // The dashboard only offers the trial button while there's no plan
      // assigned yet and it hasn't already been claimed once.
      trialAvailable: !tenant.planId && !tenant.trialGrantedAt,
      trialCredits: TRIAL_CREDITS,
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
  // dashboard's Overview trend charts. Computed as 6 small count queries
  // rather than a SQL date_trunc, matching this route's existing "bounded
  // window, JS-side aggregation" style (see apps/api/src/routes/
  // analytics.ts's top comment) — fine at Phase 1 data volumes.
  app.get("/api/v1/billing/history", { preHandler: authenticateMerchant }, async (request, reply) => {
    const { tenantId } = request.merchant!;
    const now = new Date();
    const months: { month: string; tryOns: number }[] = [];

    for (let i = 5; i >= 0; i--) {
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i + 1, 1));
      const count = await prisma.usageRecord.count({ where: { tenantId, createdAt: { gte: start, lt: end } } });
      months.push({ month: `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}`, tryOns: count });
    }

    return reply.send({ months });
  });

  // ── Self-serve trial: unblocks a brand-new tenant with no plan yet ────
  app.post("/api/v1/billing/trial", { preHandler: authenticateMerchant }, async (request, reply) => {
    const { tenantId } = request.merchant!;
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) return reply.code(404).send({ error: "Tenant not found" });
    if (tenant.planId) return reply.code(409).send({ error: "A plan is already assigned — the trial is only for tenants with no plan yet" });
    if (tenant.trialGrantedAt) return reply.code(409).send({ error: "Trial already used" });

    const updated = await prisma.tenant.update({
      where: { id: tenantId },
      data: { topUpCredits: { increment: TRIAL_CREDITS }, trialGrantedAt: new Date() },
    });
    return reply.send({ topUpCredits: updated.topUpCredits, trialGrantedAt: updated.trialGrantedAt });
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
