import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../context";
import { verifyPassword } from "../auth/password";
import { signMerchantToken } from "../auth/jwt";
import { authenticateAdmin } from "../plugins/auth";
import { loginSchema } from "../schemas";
import { startOfCurrentMonthUtc } from "../domain/planEntitlement";
import { buildTryOnDetailPayload } from "./tryons";

const setPlanSchema = z.object({ planId: z.string().nullable() });
const addCreditsSchema = z.object({ addCredits: z.number().int() });

// The platform-owner's own view across every tenant (ARCHITECTURE.md §11
// carves this out explicitly as the one place tenant isolation is
// intentionally crossed — every route here is authenticateAdmin-gated,
// never the merchant JWT). Consumed by apps/admin.
export async function adminRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/v1/admin/auth/login", async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid request body" });
    const { email, password } = parsed.data;

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user || !user.isPlatformAdmin || !(await verifyPassword(password, user.passwordHash))) {
      // Same message whether the account doesn't exist, the password is
      // wrong, or it's a real (non-admin) merchant account — don't leak
      // which case it was.
      return reply.code(401).send({ error: "Invalid email or password" });
    }

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    const token = signMerchantToken({ userId: user.id, tenantId: user.tenantId, isPlatformAdmin: true });
    return reply.send({ token });
  });

  app.get("/api/v1/admin/tenants", { preHandler: authenticateAdmin }, async (_request, reply) => {
    const [tenants, tryOnCounts, usageSums, usedThisMonthByTenant] = await Promise.all([
      prisma.tenant.findMany({
        orderBy: { createdAt: "desc" },
        include: {
          plan: true,
          stores: { select: { id: true, name: true, storeUrl: true, status: true, platformType: true } },
        },
      }),
      prisma.tryOnSession.groupBy({ by: ["tenantId"], _count: { _all: true } }),
      prisma.usageRecord.groupBy({ by: ["tenantId"], _sum: { units: true } }),
      prisma.usageRecord.groupBy({
        by: ["tenantId"],
        _count: { _all: true },
        where: { createdAt: { gte: startOfCurrentMonthUtc() } },
      }),
    ]);

    const tryOnCountByTenant = new Map(tryOnCounts.map((c) => [c.tenantId, c._count._all]));
    const usageByTenant = new Map(usageSums.map((u) => [u.tenantId, u._sum.units ?? 0]));
    const usedThisMonthMap = new Map(usedThisMonthByTenant.map((u) => [u.tenantId, u._count._all]));

    return reply.send({
      tenants: tenants.map((t) => ({
        id: t.id,
        name: t.name,
        slug: t.slug,
        createdAt: t.createdAt,
        stores: t.stores,
        totalTryOns: tryOnCountByTenant.get(t.id) ?? 0,
        totalUsageUnits: usageByTenant.get(t.id) ?? 0,
        plan: t.plan ? { key: t.plan.key, name: t.plan.name, monthlyLimit: t.plan.monthlyLimit } : null,
        usedThisMonth: usedThisMonthMap.get(t.id) ?? 0,
        topUpCredits: t.topUpCredits,
        planRequestNote: t.planRequestNote,
        planRequestedAt: t.planRequestedAt,
      })),
    });
  });

  app.get("/api/v1/admin/tenants/:id", { preHandler: authenticateAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tenant = await prisma.tenant.findUnique({
      where: { id },
      include: {
        plan: true,
        stores: true,
        users: { select: { id: true, email: true, role: true, lastLoginAt: true, createdAt: true } },
      },
    });
    if (!tenant) return reply.code(404).send({ error: "Tenant not found" });

    const [totalTryOns, totalUsageUnits, usedThisMonth, recentSessions] = await Promise.all([
      prisma.tryOnSession.count({ where: { tenantId: id } }),
      prisma.usageRecord.aggregate({ where: { tenantId: id }, _sum: { units: true } }),
      prisma.usageRecord.count({ where: { tenantId: id, createdAt: { gte: startOfCurrentMonthUtc() } } }),
      prisma.tryOnSession.findMany({
        where: { tenantId: id },
        orderBy: { createdAt: "desc" },
        take: 10,
        include: { generations: { orderBy: { createdAt: "desc" }, take: 1 } },
      }),
    ]);

    return reply.send({
      ...tenant,
      totalTryOns,
      totalUsageUnits: totalUsageUnits._sum.units ?? 0,
      usedThisMonth,
      recentTryOns: recentSessions.map((s) => ({
        id: s.id,
        productTitle: s.productTitle,
        status: s.generations[0]?.status ?? s.status,
        createdAt: s.createdAt,
      })),
    });
  });

  // ── Plans (read-only here — adjust via SQL, see DEPLOYMENT.md) ───────
  app.get("/api/v1/admin/plans", { preHandler: authenticateAdmin }, async (_request, reply) => {
    const plans = await prisma.plan.findMany({ orderBy: { sortOrder: "asc" } });
    return reply.send({
      plans: plans.map((p) => ({
        id: p.id,
        key: p.key,
        name: p.name,
        monthlyLimit: p.monthlyLimit,
        priceUsd: Number(p.priceUsd),
        topUpPackSize: p.topUpPackSize,
        topUpPackPriceUsd: Number(p.topUpPackPriceUsd),
      })),
    });
  });

  // ── Assign/change a tenant's plan — any change clears a pending
  // planRequestNote, since it's the fulfillment of that request (or a
  // manual override that supersedes it either way). ───────────────────
  app.patch("/api/v1/admin/tenants/:id/plan", { preHandler: authenticateAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = setPlanSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid request body", details: parsed.error.flatten() });

    if (parsed.data.planId) {
      const plan = await prisma.plan.findUnique({ where: { id: parsed.data.planId } });
      if (!plan) return reply.code(400).send({ error: "Unknown planId" });
    }

    const tenant = await prisma.tenant.update({
      where: { id },
      data: { planId: parsed.data.planId, planRequestNote: null, planRequestedAt: null },
      include: { plan: true },
    });
    return reply.send({ id: tenant.id, plan: tenant.plan });
  });

  app.post("/api/v1/admin/tenants/:id/topup", { preHandler: authenticateAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = addCreditsSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid request body", details: parsed.error.flatten() });

    const tenant = await prisma.tenant.update({
      where: { id },
      data: { topUpCredits: { increment: parsed.data.addCredits }, planRequestNote: null, planRequestedAt: null },
    });
    return reply.send({ id: tenant.id, topUpCredits: tenant.topUpCredits });
  });

  // ── Cross-tenant try-on browsing (product ask: platform owner sees
  // every store's try-ons, photos included) ────────────────────────────
  app.get("/api/v1/admin/tryons", { preHandler: authenticateAdmin }, async (request, reply) => {
    const query = request.query as { page?: string; limit?: string; tenantId?: string };
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const where = query.tenantId ? { tenantId: query.tenantId } : {};

    const [items, total] = await Promise.all([
      prisma.tryOnSession.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          generations: { orderBy: { createdAt: "desc" }, take: 1 },
          tenant: { select: { name: true } },
          store: { select: { name: true } },
        },
      }),
      prisma.tryOnSession.count({ where }),
    ]);

    return reply.send({
      items: items.map((session) => ({
        id: session.id,
        tenantId: session.tenantId,
        tenantName: session.tenant.name,
        storeName: session.store.name,
        productTitle: session.productTitle,
        productImageUrl: session.productImageUrl,
        status: session.generations[0]?.status ?? session.status,
        errorCode: session.generations[0]?.errorCode ?? null,
        errorMessage: session.generations[0]?.errorMessage ?? null,
        createdAt: session.createdAt,
      })),
      total,
      page,
      limit,
    });
  });

  app.get("/api/v1/admin/tryons/:id", { preHandler: authenticateAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const session = await prisma.tryOnSession.findUnique({
      where: { id },
      include: { generations: { orderBy: { createdAt: "desc" } }, attribution: { include: { order: true } } },
    });
    if (!session) return reply.code(404).send({ error: "Try-on session not found" });

    return reply.send(await buildTryOnDetailPayload(session));
  });
}
