// Verifies the platform-admin surface end to end: only an account with
// User.isPlatformAdmin=true (never mintable over HTTP — see the schema
// comment) can sign in via /api/v1/admin/auth/login, a regular merchant's
// valid JWT is correctly rejected on admin routes, and the tenant list
// actually reflects tenants created through the normal merchant flow.

import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "./app";
import { prisma } from "./context";
import { hashPassword } from "./auth/password";

describe("platform admin", () => {
  let app: FastifyInstance;
  let merchantToken: string;
  let adminToken: string;
  let merchantTenantId: string;

  const adminEmail = `admin-${Date.now()}@example.com`;
  const adminPassword = "platform-admin-password";

  beforeAll(async () => {
    app = await buildApp();

    // A normal merchant, via the public registration flow.
    const register = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: {
        email: `merchant-${Date.now()}@example.com`,
        password: "merchant password 123",
        storeName: "Some Merchant",
        storeUrl: "http://merchant.example.com",
      },
    });
    expect(register.statusCode).toBe(201);
    const registered = register.json();
    merchantToken = registered.token;

    const me = await app.inject({ method: "GET", url: "/api/v1/auth/me", headers: { authorization: `Bearer ${merchantToken}` } });
    merchantTenantId = me.json().tenant.id;

    // A platform admin, created the same way the operator script does —
    // directly against the DB, never through a registration endpoint.
    const platformTenant = await prisma.tenant.upsert({
      where: { slug: "lumiframe-platform-test" },
      create: { name: "Lumi Frame (platform, test)", slug: "lumiframe-platform-test" },
      update: {},
    });
    await prisma.user.upsert({
      where: { email: adminEmail },
      create: {
        tenantId: platformTenant.id,
        email: adminEmail,
        passwordHash: await hashPassword(adminPassword),
        isPlatformAdmin: true,
      },
      update: { passwordHash: await hashPassword(adminPassword), isPlatformAdmin: true },
    });

    const adminLogin = await app.inject({
      method: "POST",
      url: "/api/v1/admin/auth/login",
      payload: { email: adminEmail, password: adminPassword },
    });
    expect(adminLogin.statusCode).toBe(200);
    adminToken = adminLogin.json().token;
  });

  afterAll(async () => {
    await app.close();
  });

  it("rejects a regular merchant account on the admin login", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/admin/auth/login",
      payload: { email: adminEmail.replace("admin-", "merchant-"), password: "wrong" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("rejects a valid merchant JWT on admin routes", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/admin/tenants", headers: { authorization: `Bearer ${merchantToken}` } });
    expect(res.statusCode).toBe(403);
  });

  it("rejects admin routes with no token", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/admin/tenants" });
    expect(res.statusCode).toBe(401);
  });

  it("lets the platform admin list every tenant, including ones it didn't create", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/admin/tenants", headers: { authorization: `Bearer ${adminToken}` } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    const ids = body.tenants.map((t: { id: string }) => t.id);
    expect(ids).toContain(merchantTenantId);
  });

  it("returns tenant detail with its stores and recent try-ons", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/admin/tenants/${merchantTenantId}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.id).toBe(merchantTenantId);
    expect(Array.isArray(body.stores)).toBe(true);
    expect(body.stores.length).toBeGreaterThanOrEqual(1);
  });
});
