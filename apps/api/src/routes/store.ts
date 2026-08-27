import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../context";
import { authenticateMerchant } from "../plugins/auth";

const updateStoreSchema = z.object({
  allowedDomains: z.array(z.string().min(1)).min(1).optional(),
  widgetConfig: z
    .object({
      logo: z.string().url().optional(),
      primaryColor: z.string().max(20).optional(),
      buttonText: z.string().max(60).optional(),
      language: z.enum(["en", "uk", "ru"]).optional(),
      showPoweredBy: z.boolean().optional(),
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
