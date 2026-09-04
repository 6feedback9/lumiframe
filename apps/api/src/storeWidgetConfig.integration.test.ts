// PATCH /api/v1/store's widgetConfig — merchant report: settings saved in
// apps/dashboard's integration page (specifically the new "Кнопка на
// мінікартці" tab) weren't actually persisting, reverting to defaults on
// reload. Root cause: updateStoreSchema (routes/store.ts) validates
// widgetConfig with a plain z.object({...}), which silently *strips* any
// key not listed in the schema rather than rejecting the request — so a
// PATCH with cardButtonEnabled/cardButtonVariant still returned 200, just
// quietly dropped both fields before they ever reached the database. This
// guards every field the schema is supposed to accept actually survives a
// save/reload round trip, not just the two that broke.

import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "./app";
import { prisma } from "./context";
import { hashPassword } from "./auth/password";

describe("PATCH /api/v1/store — widgetConfig persistence", () => {
  let app: FastifyInstance;
  let token: string;

  beforeAll(async () => {
    app = await buildApp();
    const email = `widget-config-test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
    const register = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { email, password: "correct horse battery staple", storeName: "Widget Config Test Co", storeUrl: "http://widget-config-test.example.com" },
    });
    expect(register.statusCode).toBe(201);
    token = register.json().token;
  });

  afterAll(async () => {
    await app.close();
  });

  it("round-trips every widgetConfig field, including the mini-card ones, through a save and a fresh GET", async () => {
    const widgetConfig = {
      buttonText: "Приміряти",
      buttonColorStart: "#111111",
      buttonColorEnd: "#222222",
      buttonTextColor: "#ffffff",
      buttonStyle: "solid" as const,
      buttonSize: 120,
      buttonFontSize: 18,
      modalLayout: "compact" as const,
      cardButtonEnabled: true,
      cardButtonVariant: "drawer" as const,
      categoryUrlKeywords: "glasses, sunglasses",
    };

    const save = await app.inject({
      method: "PATCH",
      url: "/api/v1/store",
      headers: { authorization: `Bearer ${token}` },
      payload: { widgetConfig },
    });
    expect(save.statusCode).toBe(200);
    // Not enough on its own — reproduces the actual bug, where the save
    // response itself already silently dropped the stripped fields.
    expect(save.json().widgetConfig).toMatchObject(widgetConfig);

    const reload = await app.inject({ method: "GET", url: "/api/v1/store", headers: { authorization: `Bearer ${token}` } });
    expect(reload.statusCode).toBe(200);
    expect(reload.json().widgetConfig).toMatchObject(widgetConfig);
  });

  it("merges a second save on top of the first instead of replacing it", async () => {
    await app.inject({
      method: "PATCH",
      url: "/api/v1/store",
      headers: { authorization: `Bearer ${token}` },
      payload: { widgetConfig: { cardButtonVariant: "scrim" } },
    });

    const reload = await app.inject({ method: "GET", url: "/api/v1/store", headers: { authorization: `Bearer ${token}` } });
    const config = reload.json().widgetConfig;
    // Untouched by the second save — still there from the first.
    expect(config.cardButtonEnabled).toBe(true);
    expect(config.buttonText).toBe("Приміряти");
    // What the second save actually changed.
    expect(config.cardButtonVariant).toBe("scrim");
  });
});

// The platform admin's own widget-config route (routes/admin.ts) — a
// separate, deliberately narrower Zod schema (product spec §11: no
// allowedDomains from this screen) that duplicates routes/store.ts's
// field list rather than importing it, so it can drift out of sync the
// exact same way — same class of bug, same fix, own regression test.
describe("PATCH /api/v1/admin/tenants/:id/widget-config — persistence", () => {
  let app: FastifyInstance;
  let adminToken: string;
  let tenantId: string;

  beforeAll(async () => {
    app = await buildApp();

    const email = `admin-widget-config-test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
    const register = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { email, password: "correct horse battery staple", storeName: "Admin Widget Config Test Co", storeUrl: "http://admin-widget-config-test.example.com" },
    });
    expect(register.statusCode).toBe(201);
    const me = await app.inject({ method: "GET", url: "/api/v1/auth/me", headers: { authorization: `Bearer ${register.json().token}` } });
    tenantId = me.json().tenant.id;

    const adminEmail = `platform-admin-widget-config-test-${Date.now()}@example.com`;
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

  it("round-trips the mini-card fields through a save and the tenant-detail GET", async () => {
    const save = await app.inject({
      method: "PATCH",
      url: `/api/v1/admin/tenants/${tenantId}/widget-config`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { modalLayout: "compact", cardButtonEnabled: true, cardButtonVariant: "scrim" },
    });
    expect(save.statusCode).toBe(200);
    expect(save.json().widgetConfig).toMatchObject({ modalLayout: "compact", cardButtonEnabled: true, cardButtonVariant: "scrim" });

    const reload = await app.inject({ method: "GET", url: `/api/v1/admin/tenants/${tenantId}`, headers: { authorization: `Bearer ${adminToken}` } });
    expect(reload.statusCode).toBe(200);
    expect(reload.json().stores[0].widgetConfig).toMatchObject({ modalLayout: "compact", cardButtonEnabled: true, cardButtonVariant: "scrim" });
  });
});
