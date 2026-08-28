import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { BUCKETS } from "@lumiframe/storage";
import { prisma, storage } from "../context";
import { verifyPassword, hashPassword } from "../auth/password";
import { signMerchantToken } from "../auth/jwt";
import { authenticateAdmin } from "../plugins/auth";
import { loginSchema } from "../schemas";
import { startOfCurrentMonthUtc } from "../domain/planEntitlement";
import { buildTryOnDetailPayload } from "./tryons";

const setPlanSchema = z.object({ planId: z.string().nullable() });
const addCreditsSchema = z.object({ addCredits: z.number().int() });
const addUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(["OWNER", "ADMIN", "MEMBER"]).default("MEMBER"),
});
const addAdminUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

// The reserved tenant apps/api/scripts/createPlatformAdmin.mjs creates to
// hold platform-admin accounts — never a real merchant, so it's excluded
// from every client-facing list/aggregate below.
const PLATFORM_TENANT_SLUG = "lumiframe-platform";

// Same shape as apps/api/src/routes/store.ts's own PATCH /api/v1/store —
// duplicated rather than imported since that route's schema is merchant-
// facing (allowedDomains + widgetConfig together) and this one is
// deliberately narrower (button design only, admin-scoped, no
// allowedDomains — the admin shouldn't casually change a merchant's
// security boundary from this screen).
const setWidgetConfigSchema = z.object({
  buttonText: z.string().max(60).optional(),
  buttonColorStart: z.string().max(20).optional(),
  buttonColorEnd: z.string().max(20).optional(),
  buttonTextColor: z.string().max(20).optional(),
  buttonFont: z.string().max(80).optional(),
  buttonGlow: z.boolean().optional(),
  buttonStyle: z.enum(["gradient", "solid"]).optional(),
  buttonSize: z.number().int().min(70).max(160).optional(),
  buttonWidth: z.number().int().min(100).max(300).optional(),
  buttonShape: z.enum(["rounded", "rectangular"]).optional(),
  buttonAnimation: z.enum(["none", "pulse", "shimmer"]).optional(),
  buttonPosition: z.enum(["before", "after", "floating"]).optional(),
  buttonAnchorSelector: z.string().max(300).optional(),
  modalMaxWidth: z.number().int().min(900).max(2000).optional(),
  showTryAnotherButton: z.boolean().optional(),
  showBackButton: z.boolean().optional(),
  modalHeading: z.string().max(120).optional(),
  modalSubheading: z.string().max(200).optional(),
  modalAccentColorStart: z.string().max(20).optional(),
  modalAccentColorEnd: z.string().max(20).optional(),
  modalAccentTextColor: z.string().max(20).optional(),
});

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
    const startOfMonth = startOfCurrentMonthUtc();
    const [tenants, tryOnCounts, usageSums, usedThisMonthByTenant, tryOnsThisMonthPlatformWide] = await Promise.all([
      // Never list the reserved platform-admin tenant here — it's not a
      // client (see the schema comment on User.isPlatformAdmin) and was
      // only ever showing up because nothing filtered it.
      prisma.tenant.findMany({
        where: { slug: { not: PLATFORM_TENANT_SLUG } },
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
        where: { createdAt: { gte: startOfMonth } },
      }),
      prisma.tryOnSession.count({
        where: { createdAt: { gte: startOfMonth }, tenant: { slug: { not: PLATFORM_TENANT_SLUG } } },
      }),
    ]);

    const tryOnCountByTenant = new Map(tryOnCounts.map((c) => [c.tenantId, c._count._all]));
    const usageByTenant = new Map(usageSums.map((u) => [u.tenantId, u._sum.units ?? 0]));
    const usedThisMonthMap = new Map(usedThisMonthByTenant.map((u) => [u.tenantId, u._count._all]));

    // What actually matters to a SaaS owner at a glance: how many paying
    // clients, how many are live, how fast that's growing, how much
    // activity is happening right now, and who's waiting on me — not raw
    // all-time totals (product ask: "подумай что важно для меня как для
    // владельца"). MRR is "if everyone with an assigned plan pays for it"
    // — honest given billing is still manual (DEPLOYMENT.md §8).
    const summary = {
      totalClients: tenants.length,
      activeClients: tenants.filter((t) => t.stores.some((s) => s.status === "ACTIVE")).length,
      newThisMonth: tenants.filter((t) => t.createdAt >= startOfMonth).length,
      tryOnsThisMonth: tryOnsThisMonthPlatformWide,
      pendingRequests: tenants.filter((t) => t.planRequestNote).length,
      mrrUsd: tenants.reduce((sum, t) => sum + (t.plan ? Number(t.plan.priceUsd) : 0), 0),
    };

    return reply.send({
      summary,
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

  // ── Edit a tenant's store's button design directly (product ask: the
  // platform owner should be able to make changes to a client's store —
  // button design, plan — from her own console, not just the merchant's
  // own dashboard). Applies to that tenant's first/only store, same
  // convention as apps/api/src/routes/store.ts's firstStoreForTenant. ──
  app.patch("/api/v1/admin/tenants/:id/widget-config", { preHandler: authenticateAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = setWidgetConfigSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid request body", details: parsed.error.flatten() });

    const store = await prisma.store.findFirst({ where: { tenantId: id }, orderBy: { createdAt: "asc" } });
    if (!store) return reply.code(404).send({ error: "No store found for this tenant" });

    const updated = await prisma.store.update({
      where: { id: store.id },
      data: { widgetConfig: { ...(store.widgetConfig as object), ...parsed.data } },
    });
    await prisma.auditLog.create({
      data: { tenantId: id, action: "store.widgetConfig.updated_by_admin", targetType: "Store", targetId: store.id },
    });
    return reply.send({ storeId: updated.id, widgetConfig: updated.widgetConfig });
  });

  // ── Cross-tenant try-on browsing (product ask: platform owner sees
  // every store's try-ons, photos included) ────────────────────────────
  app.get("/api/v1/admin/tryons", { preHandler: authenticateAdmin }, async (request, reply) => {
    const query = request.query as { page?: string; limit?: string; tenantId?: string; feedback?: string };
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const feedbackFilter =
      query.feedback === "LIKE"
        ? { feedback: "LIKE" as const }
        : query.feedback === "DISLIKE"
          ? { feedback: "DISLIKE" as const }
          : query.feedback === "ANY"
            ? { feedback: { not: null } }
            : {};
    const where = { ...(query.tenantId ? { tenantId: query.tenantId } : {}), ...feedbackFilter };

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

    // Product ask: the platform owner should see the customer photo and
    // the result right in the list, not just after clicking through.
    //
    // Two batched calls (one per bucket) for the whole page instead of up
    // to 2x`limit` individual signed-url requests — the Supabase adapter's
    // getSignedUrl is a real network call each time, so this page was the
    // worst offender for the "loading hangs" complaint.
    const resultKeys: string[] = [];
    const customerKeys: string[] = [];
    for (const session of items) {
      const latest = session.generations[0];
      if (latest?.status === "COMPLETED" && latest.resultImageKey) resultKeys.push(latest.resultImageKey);
      if (latest?.customerImageKey) customerKeys.push(latest.customerImageKey);
    }
    const [resultUrls, customerUrls] = await Promise.all([
      storage.getSignedUrls(BUCKETS.tryonResults, resultKeys, 3600).catch(() => ({}) as Record<string, string>),
      storage.getSignedUrls(BUCKETS.customerPhotos, customerKeys, 3600).catch(() => ({}) as Record<string, string>),
    ]);

    const rows = items.map((session) => {
      const latest = session.generations[0];
      return {
        id: session.id,
        tenantId: session.tenantId,
        tenantName: session.tenant.name,
        storeName: session.store.name,
        productTitle: session.productTitle,
        productImageUrl: session.productImageUrl,
        customerImageUrl: (latest?.customerImageKey && customerUrls[latest.customerImageKey]) ?? null,
        resultUrl: (latest?.resultImageKey && resultUrls[latest.resultImageKey]) ?? null,
        feedback: session.feedback,
        status: latest?.status ?? session.status,
        errorCode: latest?.errorCode ?? null,
        errorMessage: latest?.errorMessage ?? null,
        createdAt: session.createdAt,
      };
    });

    return reply.send({ items: rows, total, page, limit });
  });

  // ── Team management: the platform owner can add/remove a user on any
  // tenant directly (product ask), the same mechanism the merchant's own
  // "Team" page uses (apps/api/src/routes/team.ts) — never sets
  // isPlatformAdmin (that stays script-only, see the schema comment on
  // User.isPlatformAdmin — this endpoint cannot create another admin
  // account no matter what the request body says). ────────────────────
  app.post("/api/v1/admin/tenants/:id/users", { preHandler: authenticateAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = addUserSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid request body", details: parsed.error.flatten() });

    const existing = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
    if (existing) return reply.code(409).send({ error: "An account with this email already exists" });

    const passwordHash = await hashPassword(parsed.data.password);
    const user = await prisma.user.create({
      data: { tenantId: id, email: parsed.data.email.toLowerCase(), passwordHash, role: parsed.data.role },
    });
    await prisma.auditLog.create({
      data: { tenantId: id, action: "user.created_by_admin", targetType: "User", targetId: user.id },
    });
    return reply.code(201).send({ id: user.id, email: user.email, role: user.role, createdAt: user.createdAt });
  });

  app.delete("/api/v1/admin/tenants/:id/users/:userId", { preHandler: authenticateAdmin }, async (request, reply) => {
    const { id, userId } = request.params as { id: string; userId: string };
    const user = await prisma.user.findFirst({ where: { id: userId, tenantId: id } });
    if (!user) return reply.code(404).send({ error: "User not found on this tenant" });
    if (user.isPlatformAdmin) return reply.code(403).send({ error: "Cannot remove a platform admin account from here" });

    await prisma.user.delete({ where: { id: userId } });
    await prisma.auditLog.create({
      data: { tenantId: id, action: "user.removed_by_admin", targetType: "User", targetId: userId },
    });
    return reply.send({ ok: true });
  });

  app.get("/api/v1/admin/tryons/:id", { preHandler: authenticateAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const session = await prisma.tryOnSession.findUnique({
      where: { id },
      include: { generations: { orderBy: { createdAt: "desc" } }, attribution: { include: { order: true } } },
    });
    if (!session) return reply.code(404).send({ error: "Try-on session not found" });

    // The platform admin is the one place all three photos are shown —
    // including the customer's raw uploaded photo (apps/api/src/routes/
    // tryons.ts's merchant-facing route deliberately omits it).
    return reply.send(await buildTryOnDetailPayload(session, { includeCustomerImage: true }));
  });

  // ── Platform-owner team: other platform-admin accounts ───────────────
  // The owner explicitly asked for this — "make it self-serve, like the
  // merchant Team page, so I can add my partner myself" — after being
  // shown the tradeoff: unlike every other endpoint in this file,
  // isPlatformAdmin was previously script-only (see
  // apps/api/scripts/createPlatformAdmin.mjs) precisely so no web form
  // could ever mint another full-access admin account. These three routes
  // are that deliberate exception: still gated behind authenticateAdmin
  // (only an existing platform admin can call them at all), but an
  // authenticated admin can now add or remove *other* platform-admin
  // accounts from her own console instead of needing a one-off SQL
  // migration each time.
  app.get("/api/v1/admin/team", { preHandler: authenticateAdmin }, async (_request, reply) => {
    const users = await prisma.user.findMany({
      where: { isPlatformAdmin: true },
      orderBy: { createdAt: "asc" },
      select: { id: true, email: true, lastLoginAt: true, createdAt: true },
    });
    return reply.send({ users });
  });

  app.post("/api/v1/admin/team", { preHandler: authenticateAdmin }, async (request, reply) => {
    const parsed = addAdminUserSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid request body", details: parsed.error.flatten() });

    const email = parsed.data.email.toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return reply.code(409).send({ error: "An account with this email already exists" });

    const platformTenant = await prisma.tenant.upsert({
      where: { slug: PLATFORM_TENANT_SLUG },
      create: { name: "Lumi Frame (platform)", slug: PLATFORM_TENANT_SLUG },
      update: {},
    });
    const passwordHash = await hashPassword(parsed.data.password);
    const user = await prisma.user.create({
      data: { tenantId: platformTenant.id, email, passwordHash, role: "OWNER", isPlatformAdmin: true },
    });
    return reply.code(201).send({ id: user.id, email: user.email, createdAt: user.createdAt });
  });

  app.delete("/api/v1/admin/team/:userId", { preHandler: authenticateAdmin }, async (request, reply) => {
    const { userId: actorId } = request.merchant!;
    const { userId } = request.params as { userId: string };

    if (userId === actorId) return reply.code(400).send({ error: "You can't remove your own account" });

    const target = await prisma.user.findFirst({ where: { id: userId, isPlatformAdmin: true } });
    if (!target) return reply.code(404).send({ error: "Admin account not found" });

    const adminCount = await prisma.user.count({ where: { isPlatformAdmin: true } });
    if (adminCount <= 1) return reply.code(400).send({ error: "Can't remove the last platform admin account" });

    await prisma.user.delete({ where: { id: userId } });
    return reply.send({ ok: true });
  });
}
