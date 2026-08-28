// Per-visitor try-on cap (apps/api/src/domain/visitorLimit.ts), end to end
// through the real /api/v1/tryons route — keyed by IP (via
// X-Forwarded-For, since buildApp() sets trustProxy: true), not just the
// pure function.

import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "./app";
import { bootstrapProviders } from "./providers/bootstrap";
import { queue } from "./context";
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

describe("per-visitor try-on limit", () => {
  let app: FastifyInstance;
  let imageServer: Server;
  let productImageUrl: string;
  let origin: string;
  let storeId: string;
  let merchantToken: string;

  beforeAll(async () => {
    bootstrapProviders();
    queue.process(processTryOnJob);
    app = await buildApp();

    const fixture = await startFixtureImageServer();
    imageServer = fixture.server;
    productImageUrl = fixture.url;
    origin = `http://${fixture.hostname}`;

    const email = `visitor-limit-test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
    const register = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { email, password: "correct horse battery staple", storeName: "Visitor Limit Test Co", storeUrl: `http://${fixture.hostname}:9997` },
    });
    expect(register.statusCode).toBe(201);
    const body = register.json();
    storeId = body.store.id;
    merchantToken = body.token;

    const configure = await app.inject({
      method: "PATCH",
      url: "/api/v1/store",
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: { maxTryOnsPerVisitor: 1 },
    });
    expect(configure.statusCode).toBe(200);
    expect(configure.json().maxTryOnsPerVisitor).toBe(1);
  }, 30_000);

  afterAll(async () => {
    await app.close();
    imageServer.close();
  });

  async function createTryOn(externalProductId: string, ip: string) {
    return app.inject({
      method: "POST",
      url: "/api/v1/tryons",
      headers: { origin, "x-forwarded-for": ip },
      payload: {
        storeId,
        product: { id: externalProductId, imageUrl: productImageUrl },
        customerImage: `data:image/jpeg;base64,${TINY_JPEG.toString("base64")}`,
      },
    });
  }

  it("allows the first try-on from a given IP", async () => {
    const create = await createTryOn("frame-a", "203.0.113.10");
    expect(create.statusCode).toBe(202);
  });

  it("blocks a second try-on from the same IP, with 429 + VISITOR_LIMIT_REACHED", async () => {
    const blocked = await createTryOn("frame-b", "203.0.113.10");
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json().code).toBe("VISITOR_LIMIT_REACHED");
  });

  it("still allows a try-on from a different IP", async () => {
    const create = await createTryOn("frame-c", "203.0.113.20");
    expect(create.statusCode).toBe(202);
  });
});
