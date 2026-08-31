// GET /api/v1/billing's trialActive flag, specifically — the merchant
// dashboard's sidebar badge (apps/dashboard/app/Sidebar.tsx) reads this
// field directly, so a stale true here shows the merchant "Тестовий
// період" as active long after it's actually over.

import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "./app";
import { prisma } from "./context";
import { hashPassword } from "./auth/password";

describe("GET /api/v1/billing — trialActive", () => {
  let app: FastifyInstance;
  let adminToken: string;

  beforeAll(async () => {
    app = await buildApp();

    const adminEmail = `billing-test-admin-${Date.now()}@example.com`;
    const adminPassword = "platform-admin-password";
    const platformTenant = await prisma.tenant.upsert({
      where: { slug: "lumiframe-platform-test" },
      create: { name: "Lumi Frame (platform, test)", slug: "lumiframe-platform-test" },
      update: {},
    });
    await prisma.user.upsert({
      where: { email: adminEmail },
      create: { tenantId: platformTenant.id, email: adminEmail, passwordHash: await hashPassword(adminPassword), isPlatformAdmin: true },
      update: { passwordHash: await hashPassword(adminPassword), isPlatformAdmin: true },
    });
    const adminLogin = await app.inject({ method: "POST", url: "/api/v1/admin/auth/login", payload: { email: adminEmail, password: adminPassword } });
    adminToken = adminLogin.json().token;
  });

  afterAll(async () => {
    await app.close();
  });

  async function registerTrialMerchant(): Promise<{ token: string; tenantId: string }> {
    const email = `billing-trial-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
    const register = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { email, password: "correct horse battery staple", storeName: "Billing Trial Co", storeUrl: "http://billing-trial.example.com" },
    });
    expect(register.statusCode).toBe(201);
    const token = register.json().token;
    const me = await app.inject({ method: "GET", url: "/api/v1/auth/me", headers: { authorization: `Bearer ${token}` } });
    return { token, tenantId: me.json().tenant.id };
  }

  it("is true right after registration (the TEST plan, a fresh 10-use lifetime allowance)", async () => {
    const { token } = await registerTrialMerchant();
    const res = await app.inject({ method: "GET", url: "/api/v1/billing", headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(200);
    expect(res.json().trialActive).toBe(true);
    expect(res.json().plan.key).toBe("TEST");
  });

  it("goes false once the owner cancels the trial (back to no plan)", async () => {
    const { token, tenantId } = await registerTrialMerchant();

    const cancel = await app.inject({
      method: "PATCH",
      url: `/api/v1/admin/tenants/${tenantId}/plan`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { planId: null },
    });
    expect(cancel.statusCode).toBe(200);

    const res = await app.inject({ method: "GET", url: "/api/v1/billing", headers: { authorization: `Bearer ${token}` } });
    expect(res.json().trialActive).toBe(false);
    expect(res.json().plan).toBeNull();
    // trialGrantedAt is still set (it happened) — trialActive being
    // false must come from plan.key, not from that going null.
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    expect(tenant.trialGrantedAt).not.toBeNull();
  });

  it("goes false once the owner assigns a real plan", async () => {
    const { token, tenantId } = await registerTrialMerchant();
    const starterPlan = await prisma.plan.findUniqueOrThrow({ where: { key: "STARTER" } });

    await app.inject({
      method: "PATCH",
      url: `/api/v1/admin/tenants/${tenantId}/plan`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { planId: starterPlan.id },
    });

    const res = await app.inject({ method: "GET", url: "/api/v1/billing", headers: { authorization: `Bearer ${token}` } });
    expect(res.json().trialActive).toBe(false);
    expect(res.json().plan.key).toBe("STARTER");
  });
});
