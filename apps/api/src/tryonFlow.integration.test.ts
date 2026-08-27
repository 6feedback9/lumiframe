// End-to-end over the real pipeline: register -> create try-on -> worker
// (MockTryOnProvider, in-memory queue) -> poll -> COMPLETED, plus the
// allowedDomains security boundary. Runs against a real local Postgres
// (see .env.test) and the local filesystem storage adapter — nothing here
// is mocked except the AI vendor itself, which is the point of
// MockTryOnProvider (ARCHITECTURE.md §6).

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

describe("try-on flow", () => {
  let app: FastifyInstance;
  let imageServer: Server;
  let productImageUrl: string;
  let origin: string;
  let token: string;
  let storeId: string;

  beforeAll(async () => {
    bootstrapProviders();
    queue.process(processTryOnJob);
    app = await buildApp();

    const fixture = await startFixtureImageServer();
    imageServer = fixture.server;
    productImageUrl = fixture.url;
    origin = `http://${fixture.hostname}`;

    const email = `test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
    const register = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: {
        email,
        password: "correct horse battery staple",
        storeName: "Test Eyewear Co",
        storeUrl: `http://${fixture.hostname}:9999`,
      },
    });
    expect(register.statusCode).toBe(201);
    const body = register.json();
    token = body.token;
    storeId = body.store.id;
    expect(body.store.allowedDomains).toEqual(["127.0.0.1"]);
  });

  afterAll(async () => {
    await app.close();
    imageServer.close();
  });

  it("runs a try-on from creation through the worker to COMPLETED", async () => {
    const create = await app.inject({
      method: "POST",
      url: "/api/v1/tryons",
      headers: { origin },
      payload: {
        storeId,
        product: { id: "frame-1", title: "Test Aviator", imageUrl: productImageUrl, price: 49.99, currency: "USD" },
        customerImage: `data:image/jpeg;base64,${TINY_JPEG.toString("base64")}`,
        utm: { source: "instagram", campaign: "summer" },
      },
    });
    expect(create.statusCode).toBe(202);
    const created = create.json();
    expect(created.status).toBe("UPLOADING");

    let status = "UPLOADING";
    let resultUrl: string | undefined;
    const deadline = Date.now() + 15_000;
    while (status !== "COMPLETED" && status !== "FAILED" && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 150));
      const poll = await app.inject({ method: "GET", url: `/api/v1/tryons/${created.tryOnId}?storeId=${storeId}`, headers: { origin } });
      expect(poll.statusCode).toBe(200);
      const body = poll.json();
      status = body.status;
      resultUrl = body.resultUrl;
    }

    expect(status).toBe("COMPLETED");
    expect(resultUrl).toBeTruthy();

    // The signed result URL must actually resolve to bytes through the
    // local storage-serving route (proves signing + serving, not just the
    // DB row).
    const resultPath = new URL(resultUrl!).pathname + new URL(resultUrl!).search;
    const fetched = await app.inject({ method: "GET", url: resultPath });
    expect(fetched.statusCode).toBe(200);
    expect(fetched.rawPayload.length).toBeGreaterThan(0);
  });

  it("rejects a product image on a domain the store doesn't own", async () => {
    const create = await app.inject({
      method: "POST",
      url: "/api/v1/tryons",
      headers: { origin },
      payload: {
        storeId,
        product: { id: "frame-2", imageUrl: "https://evil.example.com/steal.jpg" },
        customerImage: `data:image/jpeg;base64,${TINY_JPEG.toString("base64")}`,
      },
    });
    expect(create.statusCode).toBe(403);
  });

  it("rejects a request whose Origin isn't an allowed domain", async () => {
    const create = await app.inject({
      method: "POST",
      url: "/api/v1/tryons",
      headers: { origin: "https://not-my-store.example.com" },
      payload: {
        storeId,
        product: { id: "frame-3", imageUrl: productImageUrl },
        customerImage: `data:image/jpeg;base64,${TINY_JPEG.toString("base64")}`,
      },
    });
    expect(create.statusCode).toBe(403);
  });

  it("rejects an unauthenticated dashboard request", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/store" });
    expect(res.statusCode).toBe(401);
  });

  it("lets the merchant list their own try-ons via JWT", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/tryons", headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.total).toBeGreaterThanOrEqual(1);
    expect(body.items[0]).toHaveProperty("productTitle");
  });

  it("filters the list by from/to (the dashboard's month filter)", async () => {
    const future = new Date(Date.now() + 365 * 86_400_000).toISOString();
    const empty = await app.inject({
      method: "GET",
      url: `/api/v1/tryons?from=${future}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(empty.statusCode).toBe(200);
    expect(empty.json().total).toBe(0);

    const past = new Date(Date.now() - 365 * 86_400_000).toISOString();
    const all = await app.inject({
      method: "GET",
      url: `/api/v1/tryons?from=${past}&to=${future}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(all.statusCode).toBe(200);
    expect(all.json().total).toBeGreaterThanOrEqual(1);
  });
});
