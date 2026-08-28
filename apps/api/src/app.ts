import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { authRoutes } from "./routes/auth";
import { billingRoutes } from "./routes/billing";
import { tryOnRoutes } from "./routes/tryons";
import { eventRoutes } from "./routes/events";
import { analyticsRoutes } from "./routes/analytics";
import { storeRoutes } from "./routes/store";
import { adminRoutes } from "./routes/admin";
import { sdkRoutes } from "./routes/sdk";
import { healthRoutes } from "./routes/health";
import { storageServeRoutes } from "./routes/storageServe";

// Fastify's default bodyLimit (1 MiB) is well under a single base64-encoded
// customer photo (packages/widget resizes to ~1600px/JPEG q0.85 before
// upload, but that's still commonly 1-4MB, and the client-side resize is a
// best-effort optimization, not something this limit should depend on).
const MAX_REQUEST_BODY_BYTES = 20 * 1024 * 1024; // 20MB

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: process.env.NODE_ENV !== "test", bodyLimit: MAX_REQUEST_BODY_BYTES });

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
  await app.register(billingRoutes);
  await app.register(adminRoutes);
  await app.register(sdkRoutes);
  await app.register(storageServeRoutes);

  app.setErrorHandler((error, request, reply) => {
    request.log.error(error);
    if (reply.statusCode < 400) reply.code(500);
    reply.send({ error: error.message ?? "Internal server error" });
  });

  return app;
}
