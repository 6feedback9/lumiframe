import type { FastifyInstance } from "fastify";
import type { Prisma } from "@lumiframe/database";
import { prisma } from "../context";
import { authenticateStorePublic } from "../plugins/auth";
import { eventSchema } from "../schemas";

// ARCHITECTURE.md §9 — the funnel log. Public because it's called by the
// SDK/widget from the customer's browser, same auth model as /tryons.
export async function eventRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/v1/events", { preHandler: authenticateStorePublic }, async (request, reply) => {
    const parsed = eventSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid request body", details: parsed.error.flatten() });
    const input = parsed.data;
    const store = request.store!;

    await prisma.event.create({
      data: {
        tenantId: store.tenantId,
        storeId: store.id,
        type: input.type,
        tryOnSessionId: input.tryOnSessionId,
        externalProductId: input.externalProductId,
        visitorId: input.visitorId,
        browserSessionId: input.browserSessionId,
        referrer: input.referrer,
        device: input.device,
        metadata: input.metadata as Prisma.InputJsonValue | undefined,
      },
    });

    return reply.code(202).send({ ok: true });
  });
}
