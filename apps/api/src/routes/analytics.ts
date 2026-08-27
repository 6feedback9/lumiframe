import type { FastifyInstance } from "fastify";
import { prisma } from "../context";
import { authenticateMerchant } from "../plugins/auth";

// ARCHITECTURE.md §9/§10 + product spec §23/§49/§56 — business-impact
// metrics, not technical noise. Computed in JS over a bounded window
// (Phase 1 data volumes are small); revisit with SQL aggregation /
// packages/analytics once a tenant has enough rows for it to matter.
export async function analyticsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/analytics", { preHandler: authenticateMerchant }, async (request, reply) => {
    const { tenantId } = request.merchant!;
    const query = request.query as { period?: string; storeId?: string };
    const days = query.period === "7d" ? 7 : query.period === "90d" ? 90 : 30;
    const since = new Date(Date.now() - days * 86_400_000);
    const storeFilter = query.storeId ? { storeId: query.storeId } : {};

    const [sessions, addToCartEvents, orders, attributions] = await Promise.all([
      prisma.tryOnSession.findMany({
        where: { tenantId, ...storeFilter, createdAt: { gte: since } },
        include: { generations: { orderBy: { createdAt: "desc" }, take: 1 } },
      }),
      prisma.event.count({
        where: { tenantId, ...storeFilter, type: { in: ["ADD_TO_CART", "TRYON_ADD_TO_CART"] }, occurredAt: { gte: since } },
      }),
      prisma.order.count({ where: { tenantId, ...storeFilter, placedAt: { gte: since } } }),
      prisma.attribution.findMany({
        where: { tenantId, ...storeFilter, createdAt: { gte: since } },
        include: { order: true, session: true },
      }),
    ]);

    const completed = sessions.filter((s) => s.generations[0]?.status === "COMPLETED").length;
    const failed = sessions.filter((s) => s.generations[0]?.status === "FAILED").length;
    const uniqueVisitors = new Set(sessions.map((s) => s.visitorId)).size;
    const revenue = attributions.reduce((sum, a) => sum + Number(a.order.totalAmount), 0);

    const byDay: Record<string, number> = {};
    for (const s of sessions) {
      const day = s.createdAt.toISOString().slice(0, 10);
      byDay[day] = (byDay[day] ?? 0) + 1;
    }

    const productStats = new Map<string, { title: string; tryOns: number; orders: number; revenue: number }>();
    for (const s of sessions) {
      const entry = productStats.get(s.externalProductId) ?? { title: s.productTitle ?? s.externalProductId, tryOns: 0, orders: 0, revenue: 0 };
      entry.tryOns += 1;
      productStats.set(s.externalProductId, entry);
    }
    for (const a of attributions) {
      const productId = a.session.externalProductId;
      const entry = productStats.get(productId) ?? { title: productId, tryOns: 0, orders: 0, revenue: 0 };
      entry.orders += 1;
      entry.revenue += Number(a.order.totalAmount);
      productStats.set(productId, entry);
    }
    const topProducts = [...productStats.entries()]
      .map(([externalProductId, stats]) => ({ externalProductId, ...stats }))
      .sort((a, b) => b.tryOns - a.tryOns)
      .slice(0, 10);

    return reply.send({
      period: `${days}d`,
      totalTryOns: sessions.length,
      uniqueVisitors,
      completed,
      failed,
      addToCart: addToCartEvents,
      orders,
      revenue,
      conversionRate: sessions.length > 0 ? Number(((orders / sessions.length) * 100).toFixed(1)) : 0,
      byDay,
      topProducts,
    });
  });
}
