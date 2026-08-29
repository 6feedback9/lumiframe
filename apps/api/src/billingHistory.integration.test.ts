// GET /api/v1/billing/history — used to run 6 sequential count() queries,
// one full round trip per month; rewritten to one query for the whole
// window bucketed in JS (perf report: dashboard pages taking several
// seconds to load). This guards the rewrite produced the same shape and
// actually bucketed a record into the right month, not just that it
// doesn't throw.

import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "./app";
import { prisma } from "./context";

describe("GET /api/v1/billing/history", () => {
  let app: FastifyInstance;
  let token: string;
  let tenantId: string;
  let storeId: string;

  beforeAll(async () => {
    app = await buildApp();
    const email = `billing-history-test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
    const register = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { email, password: "correct horse battery staple", storeName: "Billing History Test Co", storeUrl: "http://billing-history-test.example.com" },
    });
    expect(register.statusCode).toBe(201);
    token = register.json().token;
    storeId = register.json().store.id;
    const store = await prisma.store.findUniqueOrThrow({ where: { id: storeId } });
    tenantId = store.tenantId;

    // Two billed try-ons this calendar month — the cheapest way to put
    // real UsageRecord rows in place without running real generations
    // through the pipeline (same technique as planEntitlement's own
    // fabricateUsageThisMonth).
    for (let i = 0; i < 2; i++) {
      const session = await prisma.tryOnSession.create({
        data: {
          tenantId,
          storeId,
          externalProductId: `history-fixture-${i}`,
          productImageUrl: "https://example.com/fixture.jpg",
          visitorId: `history-fixture-visitor-${i}`,
          status: "COMPLETED",
        },
      });
      const generation = await prisma.tryOnGeneration.create({
        data: { tryOnSessionId: session.id, tenantId, storeId, status: "COMPLETED" },
      });
      await prisma.usageRecord.create({
        data: { tenantId, storeId, tryOnGenerationId: generation.id, provider: "mock", units: 1 },
      });
    }
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns 6 months, oldest first, with this month's 2 fabricated try-ons counted", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/billing/history", headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(200);
    const { months } = res.json();
    expect(months).toHaveLength(6);

    const now = new Date();
    const currentKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    expect(months[5].month).toBe(currentKey); // current month is last (oldest first)
    expect(months[5].tryOns).toBe(2);

    // Every other month for this brand-new tenant has nothing in it.
    for (let i = 0; i < 5; i++) expect(months[i].tryOns).toBe(0);
  });
});
