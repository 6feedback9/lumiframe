import type { FastifyInstance } from "fastify";
import { prisma } from "../context";
import { verifyPassword } from "../auth/password";
import { signMerchantToken } from "../auth/jwt";
import { authenticateAdmin } from "../plugins/auth";
import { loginSchema } from "../schemas";

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
    const [tenants, tryOnCounts, usageSums] = await Promise.all([
      prisma.tenant.findMany({
        orderBy: { createdAt: "desc" },
        include: { stores: { select: { id: true, name: true, storeUrl: true, status: true, platformType: true } } },
      }),
      prisma.tryOnSession.groupBy({ by: ["tenantId"], _count: { _all: true } }),
      prisma.usageRecord.groupBy({ by: ["tenantId"], _sum: { units: true } }),
    ]);

    const tryOnCountByTenant = new Map(tryOnCounts.map((c) => [c.tenantId, c._count._all]));
    const usageByTenant = new Map(usageSums.map((u) => [u.tenantId, u._sum.units ?? 0]));

    return reply.send({
      tenants: tenants.map((t) => ({
        id: t.id,
        name: t.name,
        slug: t.slug,
        createdAt: t.createdAt,
        stores: t.stores,
        totalTryOns: tryOnCountByTenant.get(t.id) ?? 0,
        totalUsageUnits: usageByTenant.get(t.id) ?? 0,
      })),
    });
  });

  app.get("/api/v1/admin/tenants/:id", { preHandler: authenticateAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tenant = await prisma.tenant.findUnique({
      where: { id },
      include: {
        stores: true,
        users: { select: { id: true, email: true, role: true, lastLoginAt: true, createdAt: true } },
      },
    });
    if (!tenant) return reply.code(404).send({ error: "Tenant not found" });

    const [totalTryOns, totalUsageUnits, recentSessions] = await Promise.all([
      prisma.tryOnSession.count({ where: { tenantId: id } }),
      prisma.usageRecord.aggregate({ where: { tenantId: id }, _sum: { units: true } }),
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
      recentTryOns: recentSessions.map((s) => ({
        id: s.id,
        productTitle: s.productTitle,
        status: s.generations[0]?.status ?? s.status,
        createdAt: s.createdAt,
      })),
    });
  });
}
