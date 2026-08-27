import type { FastifyInstance } from "fastify";
import { prisma } from "../context";

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/health", async (_request, reply) => reply.send({ ok: true, ts: Date.now() }));

  app.get("/ready", async (_request, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return reply.send({ ok: true });
    } catch (error) {
      return reply.code(503).send({ ok: false, error: (error as Error).message });
    }
  });
}
