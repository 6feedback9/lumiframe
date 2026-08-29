// Plan-limit enforcement (apps/api/src/domain/planEntitlement.ts), end to
// end through the real /api/v1/tryons route — not just the pure function,
// since the point is that a store actually gets blocked/unblocked by it.

import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "./app";
import { bootstrapProviders } from "./providers/bootstrap";
import { prisma, queue } from "./context";
import { processTryOnJob } from "./worker/processTryOnJob";

const TINY_JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=",
  "base64"
);

async function startFixtureImageServer(): Promise<{ server: Server; url: string; hostname: string }> {
  const server = createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "image/jpeg" });
    res.end(TINY_JPEG);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return { server, url: `http://127.0.0.1:${port}/frame.jpg`, hostname: "127.0.0.1" };
}

/** Fabricates `count` already-COMPLETED, billed generations for a tenant this month — the cheapest way to put a tenant "at" some usage level without actually running `count` real generations through the pipeline. */
async function fabricateUsageThisMonth(tenantId: string, storeId: string, count: number): Promise<void> {
  for (let i = 0; i < count; i++) {
    const session = await prisma.tryOnSession.create({
      data: {
        tenantId,
        storeId,
        externalProductId: `fixture-${i}`,
        productImageUrl: "https://example.com/fixture.jpg",
        visitorId: `fixture-visitor-${i}`,
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
}

describe("plan-limit enforcement", () => {
  let app: FastifyInstance;
  let imageServer: Server;
  let productImageUrl: string;
  let origin: string;
  let storeId: string;
  let tenantId: string;

  beforeAll(async () => {
    bootstrapProviders();
    queue.process(processTryOnJob);
    app = await buildApp();

    const fixture = await startFixtureImageServer();
    imageServer = fixture.server;
    productImageUrl = fixture.url;
    origin = `http://${fixture.hostname}`;

    const email = `plan-test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
    const register = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { email, password: "correct horse battery staple", storeName: "Plan Test Co", storeUrl: `http://${fixture.hostname}:9998` },
    });
    expect(register.statusCode).toBe(201);
    const body = register.json();
    storeId = body.store.id;

    const store = await prisma.store.findUniqueOrThrow({ where: { id: storeId } });
    tenantId = store.tenantId;

    // Registration only grants a trial now (see domain/trial.ts), not a
    // paid plan — assign Starter (100/mo) directly, the same way the
    // platform admin would once a merchant actually pays, and clear the
    // trial credits registration granted alongside it (topUpCredits: 0)
    // so this test exercises plan-limit enforcement specifically, not
    // trial-credit enforcement (that's covered by trial.ts's own tests) —
    // the first assertion below assumes blocking happens with zero
    // top-up balance to fall back on.
    const starterPlan = await prisma.plan.findUniqueOrThrow({ where: { key: "STARTER" } });
    await prisma.tenant.update({ where: { id: tenantId }, data: { planId: starterPlan.id, topUpCredits: 0 } });
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, include: { plan: true } });
    expect(tenant.plan?.key).toBe("STARTER");
    expect(tenant.plan?.monthlyLimit).toBe(100);

    // Fill it to exactly the limit so the very next try-on is the one that
    // should get blocked, without needing to run 100 real generations.
    await fabricateUsageThisMonth(tenantId, storeId, tenant.plan!.monthlyLimit);
  }, 30_000);

  afterAll(async () => {
    await app.close();
    imageServer.close();
  });

  async function createTryOn(externalProductId: string) {
    return app.inject({
      method: "POST",
      url: "/api/v1/tryons",
      headers: { origin },
      payload: {
        storeId,
        product: { id: externalProductId, imageUrl: productImageUrl },
        customerImage: `data:image/jpeg;base64,${TINY_JPEG.toString("base64")}`,
      },
    });
  }

  it("blocks a try-on once the monthly limit is used up, with 402 + PLAN_LIMIT_REACHED", async () => {
    const create = await createTryOn("frame-over-limit");
    expect(create.statusCode).toBe(402);
    expect(create.json().code).toBe("PLAN_LIMIT_REACHED");
    // The shopper-facing message must never leak billing internals.
    expect(create.json().error).not.toMatch(/plan|quota|billing/i);
  });

  it("a top-up credit unblocks it again, and gets consumed by the completion", async () => {
    await prisma.tenant.update({ where: { id: tenantId }, data: { topUpCredits: { increment: 1 } } });

    const create = await createTryOn("frame-topup");
    expect(create.statusCode).toBe(202);

    const tryOnId = create.json().tryOnId;
    let status = "UPLOADING";
    const deadline = Date.now() + 15_000;
    while (status !== "COMPLETED" && status !== "FAILED" && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 150));
      const poll = await app.inject({ method: "GET", url: `/api/v1/tryons/${tryOnId}?storeId=${storeId}`, headers: { origin } });
      status = poll.json().status;
    }
    expect(status).toBe("COMPLETED");

    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    expect(tenant.topUpCredits).toBe(0);

    // And it's blocked again now that the top-up credit is spent.
    const blockedAgain = await createTryOn("frame-over-limit-again");
    expect(blockedAgain.statusCode).toBe(402);
  });

  // A separate, freshly-registered tenant — the shared one above already
  // has a plan and various credits from earlier tests in this file. This
  // is specifically the trial flow apps/admin's plan dropdown now offers
  // directly (product ask): register with no plan, get exactly 5 trial
  // credits, run every single one through the real pipeline, and confirm
  // both that they all actually work and that the boundary holds — the
  // 6th is blocked, and the tenant is never silently given a plan.
  it("a trial tenant's 5 credits all generate successfully, the 6th is blocked, and it stays plan-less throughout", async () => {
    const email = `trial-boundary-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
    const register = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { email, password: "correct horse battery staple", storeName: "Trial Boundary Co", storeUrl: `http://${origin.replace("http://", "")}:9996` },
    });
    expect(register.statusCode).toBe(201);
    const trialStoreId = register.json().store.id;
    const trialStore = await prisma.store.findUniqueOrThrow({ where: { id: trialStoreId } });
    const trialTenantId = trialStore.tenantId;

    const freshTenant = await prisma.tenant.findUniqueOrThrow({ where: { id: trialTenantId } });
    expect(freshTenant.planId).toBeNull();
    expect(freshTenant.topUpCredits).toBe(5);

    async function createAndCompleteForTrialTenant(externalProductId: string): Promise<number> {
      const create = await app.inject({
        method: "POST",
        url: "/api/v1/tryons",
        headers: { origin },
        payload: {
          storeId: trialStoreId,
          product: { id: externalProductId, imageUrl: productImageUrl },
          customerImage: `data:image/jpeg;base64,${TINY_JPEG.toString("base64")}`,
        },
      });
      if (create.statusCode !== 202) return create.statusCode;

      const tryOnId = create.json().tryOnId;
      let status = "UPLOADING";
      const deadline = Date.now() + 15_000;
      while (status !== "COMPLETED" && status !== "FAILED" && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 150));
        const poll = await app.inject({ method: "GET", url: `/api/v1/tryons/${tryOnId}?storeId=${trialStoreId}`, headers: { origin } });
        status = poll.json().status;
      }
      expect(status).toBe("COMPLETED");
      return create.statusCode;
    }

    for (let i = 0; i < 5; i++) {
      const statusCode = await createAndCompleteForTrialTenant(`trial-boundary-frame-${i}`);
      expect(statusCode).toBe(202);
    }

    const afterFive = await prisma.tenant.findUniqueOrThrow({ where: { id: trialTenantId } });
    expect(afterFive.topUpCredits).toBe(0);
    expect(afterFive.planId).toBeNull(); // never silently assigned a plan

    const sixth = await app.inject({
      method: "POST",
      url: "/api/v1/tryons",
      headers: { origin },
      payload: {
        storeId: trialStoreId,
        product: { id: "trial-boundary-frame-6", imageUrl: productImageUrl },
        customerImage: `data:image/jpeg;base64,${TINY_JPEG.toString("base64")}`,
      },
    });
    expect(sixth.statusCode).toBe(402);
    expect(sixth.json().code).toBe("PLAN_LIMIT_REACHED");

    const stillPlanless = await prisma.tenant.findUniqueOrThrow({ where: { id: trialTenantId } });
    expect(stillPlanless.planId).toBeNull();
  }, 30_000);
});
