import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { authRoutes } from "./routes/auth";
import { tryOnRoutes } from "./routes/tryons";
import { eventRoutes } from "./routes/events";
import { analyticsRoutes } from "./routes/analytics";
import { storeRoutes } from "./routes/store";
import { adminRoutes } from "./routes/admin";
import { healthRoutes } from "./routes/health";
import { storageServeRoutes } from "./routes/storageServe";

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: process.env.NODE_ENV !== "test" });

  // Public routes are called from the customer's browser on an arbitrary
  // merchant domain — CORS is permissive here because the actual security
  // boundary is storeId + Origin/allowedDomains (ARCHITECTURE.md §11 /
  // apps/api/src/plugins/auth.ts), not CORS. Dashboard/auth routes don't
  // rely on cookies, so this stays safe for them too.
  await app.register(cors, { origin: true });

  await app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: "1 minute",
    keyGenerator: (request) => {
      const body = request.body as { storeId?: string } | undefined;
      return `${body?.storeId ?? "anon"}:${request.ip}`;
    },
  });

  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(tryOnRoutes);
  await app.register(eventRoutes);
  await app.register(analyticsRoutes);
  await app.register(storeRoutes);
  await app.register(adminRoutes);
  await app.register(storageServeRoutes);

  app.setErrorHandler((error, request, reply) => {
    request.log.error(error);
    if (reply.statusCode < 400) reply.code(500);
    reply.send({ error: error.message ?? "Internal server error" });
  });

  return app;
}
