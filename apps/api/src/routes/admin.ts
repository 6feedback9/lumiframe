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
const setStoreStatusSchema = z.object({ status: z.enum(["ACTIVE", "SUSPENDED"]) });
const setTenantProfileSchema = z.object({
  tenantName: z.string().min(1).max(200).optional(),
  storeName: z.string().min(1).max(200).optional(),
  storeUrl: z.string().url().optional(),
});
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
  buttonStyle: z.enum(["gradient", "solid", "outline"]).optional(),
  buttonSize: z.number().int().min(70).max(160).optional(),
  buttonWidth: z.number().int().min(100).max(300).optional(),
  buttonFontSize: z.number().int().min(10).max(28).optional(),
  buttonFontWeight: z.number().int().min(300).max(900).optional(),
  buttonFullWidth: z.boolean().optional(),
  buttonShape: z.enum(["rounded", "rectangular"]).optional(),
  buttonAnimation: z.enum(["none", "pulse", "shimmer"]).optional(),
  buttonPosition: z.enum(["before", "after", "floating", "inline"]).optional(),
  buttonAnchorSelector: z.string().max(300).optional(),
  showTryAnotherButton: z.boolean().optional(),
  showBackButton: z.boolean().optional(),
  modalHeading: z.string().max(120).optional(),
  modalSubheading: z.string().max(200).optional(),
  modalAccentColorStart: z.string().max(20).optional(),
  modalAccentColorEnd: z.string().max(20).optional(),
  modalAccentTextColor: z.string().max(20).optional(),
  // Mirrors routes/store.ts's own addition — a merchant report ("settings
  // silently not saving") traced back to exactly this schema missing a
  // field the frontend already sent, so every new widgetConfig field goes
  // into both schemas at the same time now rather than drifting again.
  modalLayout: z.enum(["split", "compact"]).optional(),
  cardButtonEnabled: z.boolean().optional(),
  cardButtonVariant: z.enum(["corner", "drawer", "scrim"]).optional(),
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
    const [tenants, tryOnCounts, usageSums, usedThisMonthByTenant, pendingResetCodes, tryOnsThisMonthPlatformWide] = await Promise.all([
      // Never list the reserved platform-admin tenant here — it's not a
      // client (see the schema comment on User.isPlatformAdmin) and was
      // only ever showing up because nothing filtered it.
      prisma.tenant.findMany({
        where: { slug: { not: PLATFORM_TENANT_SLUG } },
        orderBy: { createdAt: "desc" },
        include: {
          plan: true,
          stores: { select: { id: true, name: true, storeUrl: true, status: true, platformType: true } },
          // Earliest-created user, not role: "OWNER" — the OWNER role can
          // be reassigned or that user removed by another team member
          // (routes/team.ts has no special protection for it), so it's
          // not guaranteed to still exist. The account's original
          // registrant is always there and always the right contact
          // email to show next to a client in this list (product ask:
          // "надо добавить к каждому клиенту еще электронную почту").
          users: { orderBy: { createdAt: "asc" }, select: { email: true }, take: 1 },
        },
      }),
      prisma.tryOnSession.groupBy({ by: ["tenantId"], _count: { _all: true } }),
      prisma.usageRecord.groupBy({ by: ["tenantId"], _sum: { units: true } }),
      prisma.usageRecord.groupBy({
        by: ["tenantId"],
        _count: { _all: true },
        where: { createdAt: { gte: startOfMonth } },
      }),
      // Powers the "pending reset" badge below, same shape as the
      // existing pending-plan-request one — a code from ANY of a
      // tenant's users counts, not just the earliest one the `users`
      // include above picked for its email column.
      prisma.passwordResetCode.findMany({
        where: { usedAt: null, expiresAt: { gt: new Date() } },
        select: { user: { select: { tenantId: true } } },
      }),
      prisma.tryOnSession.count({
        where: { createdAt: { gte: startOfMonth }, tenant: { slug: { not: PLATFORM_TENANT_SLUG } } },
      }),
    ]);

    const tenantIdsWithPendingReset = new Set(pendingResetCodes.map((c) => c.user.tenantId));
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
        ownerEmail: t.users[0]?.email ?? null,
        totalTryOns: tryOnCountByTenant.get(t.id) ?? 0,
        totalUsageUnits: usageByTenant.get(t.id) ?? 0,
        plan: t.plan ? { key: t.plan.key, name: t.plan.name, monthlyLimit: t.plan.monthlyLimit } : null,
        usedThisMonth: usedThisMonthMap.get(t.id) ?? 0,
        topUpCredits: t.topUpCredits,
        planRequestNote: t.planRequestNote,
        planRequestedAt: t.planRequestedAt,
        hasPendingReset: tenantIdsWithPendingReset.has(t.id),
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
        // Earliest first — the Team panel lists them in this order, and
        // it's what the tenants-list endpoint above uses to pick the
        // "primary" email shown next to each client (users[0]).
        users: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            email: true,
            role: true,
            lastLoginAt: true,
            createdAt: true,
            // The code the Team panel shows so the platform owner can
            // read it off and relay it (see the schema comment on
            // PasswordResetCode). At most one live row per user by
            // construction (routes/auth.ts's forgot-password superseded
            // any prior one), but `take: 1` is the real guarantee here.
            passwordResetCodes: {
              where: { usedAt: null, expiresAt: { gt: new Date() } },
              orderBy: { createdAt: "desc" },
              take: 1,
              select: { code: true, expiresAt: true },
            },
          },
        },
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
      // Reshape the array `take: 1` produced into the single value (or
      // null) the Team panel actually wants — the array was only ever a
      // Prisma include mechanic, not a real "could be several" case.
      users: tenant.users.map((u) => ({ ...u, activeResetCode: u.passwordResetCodes[0] ?? null, passwordResetCodes: undefined })),
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

    const before = await prisma.tenant.findUnique({ where: { id } });
    if (!before) return reply.code(404).send({ error: "Tenant not found" });

    // Legacy-tenant handling only — trial is a real Plan row now (see
    // PlanKey's schema comment), assigned/cleared like any other plan
    // with no special-casing needed. This still matters for a tenant
    // that signed up before that change and is still sitting in the old
    // "no plan + topUpCredits" trial state: a plan-less tenant's only
    // possible source of topUpCredits was the old free-trial grant (a
    // real top-up purchase needs an existing plan to price a pack
    // against — see billing.ts), so moving one either onto its first
    // real plan or explicitly back to "Без тарифу" ends that old-style
    // trial and zeroes the leftover balance, the same outcome the TEST
    // plan's own auto-downgrade (processTryOnJob.ts) produces once its
    // 10 lifetime uses run out. Never fires for a tenant created after
    // this change — those start on the TEST plan, not planId=null, so
    // `!before.planId` is false for them from day one.
    const isTrialConversion = !before.planId && !!parsed.data.planId && !!before.trialGrantedAt;
    const isTrialCancellation = !before.planId && !parsed.data.planId && !!before.trialGrantedAt && before.topUpCredits > 0;

    const tenant = await prisma.tenant.update({
      where: { id },
      data: {
        planId: parsed.data.planId,
        planRequestNote: null,
        planRequestedAt: null,
        ...(isTrialConversion || isTrialCancellation ? { topUpCredits: 0 } : {}),
      },
      include: { plan: true },
    });
    return reply.send({ id: tenant.id, plan: tenant.plan, topUpCredits: tenant.topUpCredits });
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

  // ── Account status: pause/reactivate every store under this tenant at
  // once (product ask: the platform owner should be able to turn a
  // client's widget off — e.g. non-payment, abuse — without touching
  // their data). Blocks new try-on creation immediately: routes/store.ts's
  // authenticateStorePublic already refuses anything but an ACTIVE store.
  app.patch("/api/v1/admin/tenants/:id/status", { preHandler: authenticateAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = setStoreStatusSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid request body", details: parsed.error.flatten() });

    const tenant = await prisma.tenant.findUnique({ where: { id } });
    if (!tenant) return reply.code(404).send({ error: "Tenant not found" });

    await prisma.store.updateMany({ where: { tenantId: id }, data: { status: parsed.data.status } });
    await prisma.auditLog.create({
      data: { tenantId: id, action: "tenant.status_changed_by_admin", targetType: "Tenant", targetId: id },
    });

    const stores = await prisma.store.findMany({ where: { tenantId: id }, select: { id: true, status: true } });
    return reply.send({ id, stores });
  });

  // ── Profile: company/store name + URL (product ask: the platform
  // owner should be able to fix/edit a client's basic profile from her
  // own console — none of these have ever been editable anywhere, not
  // even by the merchant themselves; they're set once at registration).
  app.patch("/api/v1/admin/tenants/:id/profile", { preHandler: authenticateAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = setTenantProfileSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid request body", details: parsed.error.flatten() });

    const tenant = await prisma.tenant.findUnique({ where: { id } });
    if (!tenant) return reply.code(404).send({ error: "Tenant not found" });

    if (parsed.data.tenantName) {
      await prisma.tenant.update({ where: { id }, data: { name: parsed.data.tenantName } });
    }
    if (parsed.data.storeName || parsed.data.storeUrl) {
      const store = await prisma.store.findFirst({ where: { tenantId: id }, orderBy: { createdAt: "asc" } });
      if (store) {
        await prisma.store.update({
          where: { id: store.id },
          data: {
            ...(parsed.data.storeName ? { name: parsed.data.storeName } : {}),
            ...(parsed.data.storeUrl ? { storeUrl: parsed.data.storeUrl } : {}),
          },
        });
      }
    }
    await prisma.auditLog.create({
      data: { tenantId: id, action: "tenant.profile_updated_by_admin", targetType: "Tenant", targetId: id },
    });

    const updated = await prisma.tenant.findUniqueOrThrow({ where: { id }, include: { stores: true } });
    return reply.send({ id, name: updated.name, stores: updated.stores });
  });

  // Deletes the private-storage objects a tenant's generations reference
  // before their DB rows go away — best-effort (a storage hiccup must
  // never block the actual delete the owner asked for). Only the
  // privacy-sensitive images: the customer's own uploaded photo and the
  // generated result. Product asset photos are just the merchant's own
  // catalog shots, shared by content hash across a store's generations —
  // not worth the extra risk of touching here.
  async function deleteTenantPhotos(tenantId: string): Promise<void> {
    const generations = await prisma.tryOnGeneration.findMany({
      where: { tenantId },
      select: { customerImageKey: true, resultImageKey: true },
    });
    const deletions: Promise<void>[] = [];
    for (const g of generations) {
      if (g.customerImageKey) deletions.push(storage.deleteObject(BUCKETS.customerPhotos, g.customerImageKey).catch(() => {}));
      if (g.resultImageKey) deletions.push(storage.deleteObject(BUCKETS.tryonResults, g.resultImageKey).catch(() => {}));
    }
    await Promise.all(deletions);
  }

  // ── Bulk-delete every try-on for a tenant, keeping the account itself
  // (product ask: wipe test data / a client's history on request without
  // deleting their whole account). Cascades to generations/usage/
  // attribution via the schema's onDelete: Cascade on TryOnSession.
  app.delete("/api/v1/admin/tenants/:id/tryons", { preHandler: authenticateAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tenant = await prisma.tenant.findUnique({ where: { id } });
    if (!tenant) return reply.code(404).send({ error: "Tenant not found" });

    await deleteTenantPhotos(id);
    const { count } = await prisma.tryOnSession.deleteMany({ where: { tenantId: id } });
    await prisma.auditLog.create({
      data: { tenantId: id, action: "tenant.tryons_deleted_by_admin", targetType: "Tenant", targetId: id },
    });
    return reply.send({ ok: true, deleted: count });
  });

  // ── Delete a tenant's account entirely — irreversible. Every row tied
  // to this tenant cascades away at the DB level (every relevant FK in
  // the schema is onDelete: Cascade back to Tenant); this route's own
  // job is just the storage cleanup that cascading deletes can't do,
  // plus refusing the one tenant this must never touch: the reserved
  // platform-admin account (see PLATFORM_TENANT_SLUG) — that's not a
  // client, deleting it would lock every admin out.
  app.delete("/api/v1/admin/tenants/:id", { preHandler: authenticateAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tenant = await prisma.tenant.findUnique({ where: { id } });
    if (!tenant) return reply.code(404).send({ error: "Tenant not found" });
    if (tenant.slug === PLATFORM_TENANT_SLUG) {
      return reply.code(403).send({ error: "The platform's own account can't be deleted from here" });
    }

    await deleteTenantPhotos(id);
    console.warn(`[admin] tenant ${id} (${tenant.name}) deleted by ${request.merchant!.userId}`);
    await prisma.tenant.delete({ where: { id } });
    return reply.send({ ok: true });
  });

  // ── Cross-tenant try-on browsing (product ask: platform owner sees
  // every store's try-ons, photos included) ────────────────────────────
  //
  // One row per TryOnGeneration (attempt), not per TryOnSession. Used to
  // be the other way round — one row per session, showing only its
  // latest attempt — which silently buried an earlier successful
  // generation the moment a shopper hit "Спробувати інше фото" and that
  // retry failed: the merchant's own report, with screenshots, was that
  // a result she'd seen succeed was showing as FAILED with no way to
  // find it. buildTryOnDetailPayload (see routes/tryons.ts) now exposes
  // the same full history when you click into one row; this is that
  // same fix at the list level, so every attempt has its own row instead
  // of only being reachable by clicking through.
  app.get("/api/v1/admin/tryons", { preHandler: authenticateAdmin }, async (request, reply) => {
    const query = request.query as { page?: string; limit?: string; tenantId?: string; feedback?: string };
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const feedbackFilter =
      query.feedback === "LIKE"
        ? { session: { feedback: "LIKE" as const } }
        : query.feedback === "DISLIKE"
          ? { session: { feedback: "DISLIKE" as const } }
          : query.feedback === "ANY"
            ? { session: { feedback: { not: null } } }
            : {};
    const where = { ...(query.tenantId ? { tenantId: query.tenantId } : {}), ...feedbackFilter };

    const [items, total] = await Promise.all([
      prisma.tryOnGeneration.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          session: {
            select: {
              id: true,
              tenantId: true,
              productTitle: true,
              productImageUrl: true,
              feedback: true,
              tenant: { select: { name: true } },
              store: { select: { name: true } },
            },
          },
        },
      }),
      prisma.tryOnGeneration.count({ where }),
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
    for (const gen of items) {
      if (gen.status === "COMPLETED" && gen.resultImageKey) resultKeys.push(gen.resultImageKey);
      if (gen.customerImageKey) customerKeys.push(gen.customerImageKey);
    }
    const [resultUrls, customerUrls] = await Promise.all([
      storage.getSignedUrls(BUCKETS.tryonResults, resultKeys, 3600).catch(() => ({}) as Record<string, string>),
      storage.getSignedUrls(BUCKETS.customerPhotos, customerKeys, 3600).catch(() => ({}) as Record<string, string>),
    ]);

    const rows = items.map((gen) => ({
      id: gen.id,
      sessionId: gen.session.id,
      tenantId: gen.tenantId,
      tenantName: gen.session.tenant.name,
      storeName: gen.session.store.name,
      productTitle: gen.session.productTitle,
      productImageUrl: gen.session.productImageUrl,
      customerImageUrl: (gen.customerImageKey && customerUrls[gen.customerImageKey]) ?? null,
      resultUrl: (gen.resultImageKey && resultUrls[gen.resultImageKey]) ?? null,
      feedback: gen.session.feedback,
      status: gen.status,
      errorCode: gen.errorCode,
      errorMessage: gen.errorMessage,
      createdAt: gen.createdAt,
    }));

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
