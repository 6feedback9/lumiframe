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

  // The admin's manual trial grant (apps/admin's tenant Billing panel) —
  // registration itself grants every new tenant a trial automatically now
  // (see apps/api/src/domain/trial.ts), so this route only matters for a
  // tenant that somehow doesn't have one: simulate that by clearing both
  // planId and the trial registration already granted.
  it("lets the platform admin grant a trial to a plan-less tenant", async () => {
    await prisma.tenant.update({ where: { id: merchantTenantId }, data: { planId: null, trialGrantedAt: null, topUpCredits: 0 } });

    const before = await app.inject({
      method: "GET",
      url: `/api/v1/admin/tenants/${merchantTenantId}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(before.json().planId).toBeNull();
    expect(before.json().trialGrantedAt).toBeNull();

    const grant = await app.inject({
      method: "POST",
      url: `/api/v1/admin/tenants/${merchantTenantId}/trial`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(grant.statusCode).toBe(200);
    expect(grant.json().topUpCredits).toBe(5);
    expect(grant.json().trialGrantedAt).not.toBeNull();

    const after = await app.inject({
      method: "GET",
      url: `/api/v1/admin/tenants/${merchantTenantId}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(after.json().topUpCredits).toBe(5);
    expect(after.json().trialGrantedAt).not.toBeNull();
  });

  it("refuses to grant the same tenant a second trial", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/admin/tenants/${merchantTenantId}/trial`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(409);
  });

  it("rejects a merchant JWT on the trial-grant route", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/admin/tenants/${merchantTenantId}/trial`,
      headers: { authorization: `Bearer ${merchantToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  // Its own tenant, registered fresh (auto-grants a 5-credit trial, no
  // plan — routes/auth.ts) rather than reusing merchantTenantId, whose
  // trial the very next test consumes by converting it to a real plan.
  // Product-reported bug: re-selecting "Без тарифу" in apps/admin's plan
  // dropdown while a trial was still active visibly did nothing — planId
  // was already null, so writing null again was a no-op, and the select
  // just sprang back to showing "Тестовий режим" after the refetch.
  it("re-selecting no plan while a trial is active ends it (clears the credits)", async () => {
    const email = `trial-cancel-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
    const register = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { email, password: "correct horse battery staple", storeName: "Trial Cancel Co", storeUrl: "http://trial-cancel.example.com" },
    });
    expect(register.statusCode).toBe(201);
    const me = await app.inject({ method: "GET", url: "/api/v1/auth/me", headers: { authorization: `Bearer ${register.json().token}` } });
    const trialTenantId = me.json().tenant.id;

    const before = await prisma.tenant.findUniqueOrThrow({ where: { id: trialTenantId } });
    expect(before.planId).toBeNull();
    expect(before.topUpCredits).toBe(5);

    // planId was already null — this re-selects "no plan" on a tenant
    // that already has none, which is exactly what the admin UI sends
    // when picking "Без тарифу" out of an active trial.
    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/admin/tenants/${trialTenantId}/plan`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { planId: null },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().topUpCredits).toBe(0);

    const after = await prisma.tenant.findUniqueOrThrow({ where: { id: trialTenantId } });
    expect(after.planId).toBeNull();
    expect(after.topUpCredits).toBe(0);
    // trialGrantedAt stays set — it already happened, it's just spent —
    // so grantTrial() still correctly refuses to grant a second one.
    expect(after.trialGrantedAt).not.toBeNull();
  });

  // merchantTenantId is still plan-less with its 5-credit trial balance
  // from the grant test above — a plan-less tenant's only possible
  // source of topUpCredits, so assigning its first real plan should
  // clear it (see routes/admin.ts's isTrialConversion).
  it("converting a trial tenant to its first real plan clears the trial's leftover credits", async () => {
    const starterPlan = await prisma.plan.findUniqueOrThrow({ where: { key: "STARTER" } });

    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/admin/tenants/${merchantTenantId}/plan`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { planId: starterPlan.id },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().plan.key).toBe("STARTER");
    expect(res.json().topUpCredits).toBe(0);

    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: merchantTenantId } });
    expect(tenant.topUpCredits).toBe(0);
  });

  it("does NOT touch topUpCredits when changing plan on an already-paying tenant", async () => {
    // merchantTenantId now has a real plan (previous test) — top up its
    // balance the way a purchased pack would, then switch plans again.
    // That balance is real money, not a trial freebie, and must survive.
    await prisma.tenant.update({ where: { id: merchantTenantId }, data: { topUpCredits: 20 } });
    const growthPlan = await prisma.plan.findUniqueOrThrow({ where: { key: "GROWTH" } });

    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/admin/tenants/${merchantTenantId}/plan`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { planId: growthPlan.id },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().topUpCredits).toBe(20);
  });

  it("suspends and reactivates every store under a tenant", async () => {
    const suspend = await app.inject({
      method: "PATCH",
      url: `/api/v1/admin/tenants/${merchantTenantId}/status`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { status: "SUSPENDED" },
    });
    expect(suspend.statusCode).toBe(200);
    expect(suspend.json().stores.every((s: { status: string }) => s.status === "SUSPENDED")).toBe(true);

    const reactivate = await app.inject({
      method: "PATCH",
      url: `/api/v1/admin/tenants/${merchantTenantId}/status`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { status: "ACTIVE" },
    });
    expect(reactivate.statusCode).toBe(200);
    expect(reactivate.json().stores.every((s: { status: string }) => s.status === "ACTIVE")).toBe(true);
  });

  it("updates a tenant's profile (company name, store name, URL)", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/admin/tenants/${merchantTenantId}/profile`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { tenantName: "Renamed Co", storeName: "Renamed Store", storeUrl: "https://renamed.example.com" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().name).toBe("Renamed Co");
    expect(res.json().stores[0].name).toBe("Renamed Store");
    expect(res.json().stores[0].storeUrl).toBe("https://renamed.example.com");
  });

  it("wipes a tenant's try-ons without touching the account itself", async () => {
    const store = await prisma.store.findFirstOrThrow({ where: { tenantId: merchantTenantId } });
    const session = await prisma.tryOnSession.create({
      data: {
        tenantId: merchantTenantId,
        storeId: store.id,
        externalProductId: "fixture-to-delete",
        productImageUrl: "https://example.com/fixture.jpg",
        visitorId: "fixture-visitor",
        status: "COMPLETED",
      },
    });

    const res = await app.inject({
      method: "DELETE",
      url: `/api/v1/admin/tenants/${merchantTenantId}/tryons`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().deleted).toBeGreaterThanOrEqual(1);

    expect(await prisma.tryOnSession.findUnique({ where: { id: session.id } })).toBeNull();
    // The account itself must survive a try-ons wipe.
    expect(await prisma.tenant.findUnique({ where: { id: merchantTenantId } })).not.toBeNull();
  });

  it("refuses to delete the reserved platform tenant", async () => {
    // The real reserved slug (routes/admin.ts's PLATFORM_TENANT_SLUG) —
    // distinct from this file's own "lumiframe-platform-test" fixture,
    // which is a normal, deletable tenant as far as this route is
    // concerned. Upsert rather than assuming it exists: whichever test
    // file runs first is the one that actually creates it.
    const platformTenant = await prisma.tenant.upsert({
      where: { slug: "lumiframe-platform" },
      create: { name: "Lumi Frame (platform)", slug: "lumiframe-platform" },
      update: {},
    });
    const res = await app.inject({
      method: "DELETE",
      url: `/api/v1/admin/tenants/${platformTenant.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(403);
    expect(await prisma.tenant.findUnique({ where: { id: platformTenant.id } })).not.toBeNull();
  });

  // Last test in this file on purpose — deletes merchantTenantId for real.
  it("deletes a tenant's account entirely, cascading its data", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: `/api/v1/admin/tenants/${merchantTenantId}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);

    expect(await prisma.tenant.findUnique({ where: { id: merchantTenantId } })).toBeNull();
    expect(await prisma.store.findFirst({ where: { tenantId: merchantTenantId } })).toBeNull();
  });
});
