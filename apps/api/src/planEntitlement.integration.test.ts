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

    // Registering assigns Starter (100/mo) by default.
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
});
