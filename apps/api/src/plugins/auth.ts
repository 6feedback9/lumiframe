// Two distinct auth models, deliberately different (see ARCHITECTURE.md
// §11 addendum added during Phase 1):
//
//  - Public try-on/event routes: called directly from the customer's
//    browser by @lumiframe/widget, which never holds a secret (the SDK's
//    TryOn.init() only takes a storeId — see packages/sdk/src/types.ts).
//    Auth here is storeId + Origin/Referer checked against the store's
//    allowedDomains, the same mechanism that already gates productImageUrl.
//    This is the publishable-key pattern (Stripe/Shopify widgets): the
//    identifier is not secret, abuse is bounded by domain-restriction +
//    rate limiting, not by hiding it.
//  - Dashboard/server-to-server routes: JWT (merchant login) — these never
//    run in a customer's browser.

import type { FastifyReply, FastifyRequest } from "fastify";
import type { Store } from "@lumiframe/database";
import { prisma } from "../context";
import { verifyMerchantToken } from "../auth/jwt";
import { isAllowedProductUrl } from "../domain/allowedDomains";

declare module "fastify" {
  interface FastifyRequest {
    store?: Store;
    merchant?: { userId: string; tenantId: string };
  }
}

function originOf(request: FastifyRequest): string | undefined {
  const origin = request.headers.origin;
  if (typeof origin === "string" && origin) return origin;
  const referer = request.headers.referer;
  if (typeof referer === "string" && referer) {
    try {
      const url = new URL(referer);
      return `${url.protocol}//${url.host}`;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/**
 * Resolves `storeId` from the body (falls back to query), loads the store,
 * and requires the request's Origin/Referer to match one of its
 * allowedDomains. Attaches the store to `request.store`.
 */
export async function authenticateStorePublic(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const body = (request.body ?? {}) as { storeId?: unknown };
  const query = (request.query ?? {}) as { storeId?: unknown };
  const storeId = typeof body.storeId === "string" ? body.storeId : typeof query.storeId === "string" ? query.storeId : undefined;

  if (!storeId) {
    reply.code(400).send({ error: "storeId is required" });
    return reply;
  }

  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store || store.status !== "ACTIVE") {
    reply.code(401).send({ error: "Unknown or inactive store" });
    return reply;
  }

  const origin = originOf(request);
  if (!origin || !isAllowedProductUrl(store.allowedDomains, origin)) {
    reply.code(403).send({ error: "Request origin is not an allowed domain for this store" });
    return reply;
  }

  request.store = store;
}

export async function authenticateMerchant(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const header = request.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;
  if (!token) {
    reply.code(401).send({ error: "Missing Authorization: Bearer <token>" });
    return reply;
  }

  const payload = verifyMerchantToken(token);
  if (!payload) {
    reply.code(401).send({ error: "Invalid or expired token" });
    return reply;
  }

  request.merchant = payload;
}

/**
 * Gates the internal admin API (apps/admin) — every route behind this
 * requires the JWT to carry `isPlatformAdmin: true`, which only
 * `apps/api/scripts/createPlatformAdmin.mjs` can ever mint (no HTTP path
 * creates one). A merchant's own valid token is correctly rejected here.
 */
export async function authenticateAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const header = request.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;
  if (!token) {
    reply.code(401).send({ error: "Missing Authorization: Bearer <token>" });
    return reply;
  }

  const payload = verifyMerchantToken(token);
  if (!payload || !payload.isPlatformAdmin) {
    reply.code(403).send({ error: "Platform admin access required" });
    return reply;
  }

  request.merchant = payload;
}
