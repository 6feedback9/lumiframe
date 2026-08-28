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
  // as a one-line summary instead of just "see note".
  kind: z.enum(["upgrade", "topup"]),
  planKey: z.enum(["STARTER", "GROWTH", "PRO"]).optional(),
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

  app.post("/api/v1/billing/request", { preHandler: authenticateMerchant }, async (request, reply) => {
    const parsed = requestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid request body", details: parsed.error.flatten() });

    const { tenantId } = request.merchant!;
    const note =
      parsed.data.kind === "upgrade"
        ? `Requested upgrade to ${parsed.data.planKey ?? "a higher plan"}.${parsed.data.message ? ` Note: ${parsed.data.message}` : ""}`
        : `Requested a top-up pack.${parsed.data.message ? ` Note: ${parsed.data.message}` : ""}`;

    const tenant = await prisma.tenant.update({
      where: { id: tenantId },
      data: { planRequestNote: note, planRequestedAt: new Date() },
    });

    return reply.send({ planRequestNote: tenant.planRequestNote, planRequestedAt: tenant.planRequestedAt });
  });
}
