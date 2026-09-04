import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../context";
import { authenticateMerchant } from "../plugins/auth";

const updateStoreSchema = z.object({
  allowedDomains: z.array(z.string().min(1)).min(1).optional(),
  // Anti-abuse cap on try-ons per shopper (product ask), enforced by IP —
  // see apps/api/src/domain/visitorLimit.ts. null explicitly clears it back
  // to unlimited; omitted leaves it untouched.
  maxTryOnsPerVisitor: z.number().int().min(1).max(1000).nullable().optional(),
  widgetConfig: z
    .object({
      logo: z.string().url().optional(),
      primaryColor: z.string().max(20).optional(),
      buttonText: z.string().max(60).optional(),
      language: z.enum(["en", "uk", "ru"]).optional(),
      showPoweredBy: z.boolean().optional(),
      // Button appearance (product ask: merchant-configurable button
      // color/font/glow/size/style/animation — packages/sdk/src/index.ts
      // applies all of these).
      buttonColorStart: z.string().max(20).optional(),
      buttonColorEnd: z.string().max(20).optional(),
      buttonTextColor: z.string().max(20).optional(),
      buttonFont: z.string().max(80).optional(),
      buttonGlow: z.boolean().optional(),
      buttonStyle: z.enum(["gradient", "solid", "outline"]).optional(),
      // Continuous scale (percent of default), not fixed sm/md/lg steps.
      buttonSize: z.number().int().min(70).max(160).optional(),
      // Horizontal-only stretch on top of buttonSize — makes the button
      // longer without also making it taller.
      buttonWidth: z.number().int().min(100).max(300).optional(),
      // Explicit label text size, independent of buttonSize (product ask:
      // "размер шрифта в кнопке") — see packages/sdk's own doc comment on
      // why this exists alongside buttonSize rather than replacing it.
      buttonFontSize: z.number().int().min(10).max(28).optional(),
      buttonFontWeight: z.number().int().min(300).max(900).optional(),
      buttonFullWidth: z.boolean().optional(),
      buttonShape: z.enum(["rounded", "rectangular"]).optional(),
      buttonAnimation: z.enum(["none", "pulse", "shimmer"]).optional(),
      // Button placement + try-on modal layout (product ask: merchant
      // picks where the button lands, and how the try-on window itself is
      // laid out — packages/sdk + packages/widget apply all of these).
      buttonPosition: z.enum(["before", "after", "floating"]).optional(),
      buttonAnchorSelector: z.string().max(300).optional(),
      // CSS selector for the page's live product image, for stores with
      // color/style swatches (product ask, from a real Shopify store this
      // session: JSON-LD/OpenGraph alone only reflect whichever variant
      // was default on page load, not a swatch click) — folded into
      // TryOn.init() by packages/sdk/src/index.ts, same as
      // buttonAnchorSelector above.
      productImageSelector: z.string().max(300).optional(),
      // The try-on window always fills the screen and adapts to the
      // viewport on its own (packages/widget's own responsive CSS) — no
      // merchant-configurable width, deliberately (product ask: it should
      // just work on every device, not need tuning per store).
      showTryAnotherButton: z.boolean().optional(),
      showBackButton: z.boolean().optional(),
      // Try-on window text + color overrides (product ask: "цвета/текст/
      // размеры" for the window itself. Colors default to the button's own
      // when unset — see packages/sdk's fallback.
      modalHeading: z.string().max(120).optional(),
      modalSubheading: z.string().max(200).optional(),
      modalAccentColorStart: z.string().max(20).optional(),
      modalAccentColorEnd: z.string().max(20).optional(),
      modalAccentTextColor: z.string().max(20).optional(),
      // "split" (default) — full-page takeover. "compact" — a small
      // floating card over the dimmed, still-visible product page.
      modalLayout: z.enum(["split", "compact"]).optional(),
      // A "Try on" affordance on every catalog-card thumbnail, not just the
      // product page's own button (packages/sdk's detectCards.ts). Reuses
      // the buttonColorStart/End/TextColor/Style fields above — no
      // separate color config.
      cardButtonEnabled: z.boolean().optional(),
      cardButtonVariant: z.enum(["corner", "drawer", "scrim"]).optional(),
      // Restricts which pages show the widget at all, for a merchant whose
      // store isn't eyewear-only (product ask: "чтобы это можно было
      // реализовать через кабинет клиента" — no Liquid/theme editing, one
      // sitewide snippet, everything else configured here). Comma-separated
      // keywords, matched case-insensitively against the product URL by
      // packages/sdk/src/index.ts — see its categoryUrlKeywords doc comment.
      categoryUrlKeywords: z.string().max(500).optional(),
    })
    .optional(),
});

const integrationSchema = z.object({
  platformType: z.enum(["SHOPIFY", "WOOCOMMERCE", "GENERIC", "CUSTOM"]).default("GENERIC"),
  config: z
    .object({
      productIdSelector: z.string().optional(),
      productTitleSelector: z.string().optional(),
      productImageSelector: z.string().optional(),
      priceSelector: z.string().optional(),
      skuSelector: z.string().optional(),
      addToCartSelector: z.string().optional(),
    })
    .default({}),
});

async function firstStoreForTenant(tenantId: string) {
  return prisma.store.findFirst({ where: { tenantId }, orderBy: { createdAt: "asc" } });
}

export async function storeRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/store", { preHandler: authenticateMerchant }, async (request, reply) => {
    const store = await firstStoreForTenant(request.merchant!.tenantId);
    if (!store) return reply.code(404).send({ error: "No store found for this account" });
    return reply.send(store);
  });

  app.patch("/api/v1/store", { preHandler: authenticateMerchant }, async (request, reply) => {
    const parsed = updateStoreSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid request body", details: parsed.error.flatten() });

    const store = await firstStoreForTenant(request.merchant!.tenantId);
    if (!store) return reply.code(404).send({ error: "No store found for this account" });

    const updated = await prisma.store.update({
      where: { id: store.id },
      data: {
        ...(parsed.data.allowedDomains ? { allowedDomains: parsed.data.allowedDomains } : {}),
        ...(parsed.data.maxTryOnsPerVisitor !== undefined ? { maxTryOnsPerVisitor: parsed.data.maxTryOnsPerVisitor } : {}),
        ...(parsed.data.widgetConfig ? { widgetConfig: { ...(store.widgetConfig as object), ...parsed.data.widgetConfig } } : {}),
      },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: store.tenantId,
        actorUserId: request.merchant!.userId,
        action: "store.updated",
        targetType: "Store",
        targetId: store.id,
      },
    });
    return reply.send(updated);
  });

  app.get("/api/v1/integration", { preHandler: authenticateMerchant }, async (request, reply) => {
    const store = await firstStoreForTenant(request.merchant!.tenantId);
    if (!store) return reply.code(404).send({ error: "No store found for this account" });
    const integration = await prisma.integration.findUnique({ where: { storeId: store.id } });
    return reply.send(integration ?? { storeId: store.id, platformType: "GENERIC", status: "NOT_CONFIGURED", config: {} });
  });

  app.post("/api/v1/integration", { preHandler: authenticateMerchant }, async (request, reply) => {
    const parsed = integrationSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid request body", details: parsed.error.flatten() });

    const store = await firstStoreForTenant(request.merchant!.tenantId);
    if (!store) return reply.code(404).send({ error: "No store found for this account" });

    const integration = await prisma.integration.upsert({
      where: { storeId: store.id },
      create: {
        storeId: store.id,
        platformType: parsed.data.platformType,
        status: "CONNECTED",
        config: parsed.data.config,
        installedAt: new Date(),
      },
      update: { platformType: parsed.data.platformType, status: "CONNECTED", config: parsed.data.config },
    });
    return reply.send(integration);
  });
}
