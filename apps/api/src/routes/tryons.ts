import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { BUCKETS, fetchImageBytes } from "@lumiframe/storage";
import type { Store } from "@lumiframe/database";
import { prisma, queue, storage } from "../context";
import { env } from "../env";
import { authenticateMerchant, authenticateStorePublic } from "../plugins/auth";
import { isAllowedProductUrl } from "../domain/allowedDomains";
import { checkPlanEntitlement } from "../domain/planEntitlement";
import { checkVisitorLimit } from "../domain/visitorLimit";
import { createTryOnSchema, feedbackSchema, retryPhotoSchema } from "../schemas";

const MAX_CUSTOMER_IMAGE_BYTES = 10 * 1024 * 1024;

function resultRetentionMs(store: Store): number {
  return (store.tryonResultRetentionHours ?? env.TRYON_RESULT_RETENTION_HOURS) * 3600_000;
}

function extensionForMime(mimeType: string): string {
  const map: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
  return map[mimeType.toLowerCase()] ?? "bin";
}

async function storeCustomerImage(
  store: Store,
  sessionId: string,
  generationId: string,
  dataUri: string
): Promise<{ key: string; mimeType: string }> {
  const { buffer, mimeType } = await fetchImageBytes(dataUri, MAX_CUSTOMER_IMAGE_BYTES);
  if (!mimeType.startsWith("image/")) throw new ValidationError("customerImage must decode to an image");
  const key = `${store.id}/${sessionId}/${generationId}.${extensionForMime(mimeType)}`;
  await storage.putObject(BUCKETS.customerPhotos, key, buffer, mimeType);
  return { key, mimeType };
}

class ValidationError extends Error {}

export async function tryOnRoutes(app: FastifyInstance): Promise<void> {
  // ── Public: create a try-on session + first generation ──────────────
  app.post("/api/v1/tryons", { preHandler: authenticateStorePublic }, async (request, reply) => {
    const parsed = createTryOnSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid request body", details: parsed.error.flatten() });
    }
    const input = parsed.data;
    const store = request.store!;

    const entitlement = await checkPlanEntitlement(store.tenantId);
    if (!entitlement.allowed) {
      console.warn(`[tryons] store ${store.id} (tenant ${store.tenantId}) hit its plan limit: ${entitlement.usedThisMonth}/${entitlement.monthlyLimit} used this month, 0 top-up credits left`);
      // Never expose plan/billing internals to the shopper — this is the
      // merchant's problem to notice (dashboard shows usage prominently)
      // and fix, not something a customer should be told about.
      return reply.code(402).send({
        error: "This store is temporarily unable to process try-ons. Please try again soon.",
        code: "PLAN_LIMIT_REACHED",
      });
    }

    if (!isAllowedProductUrl(store.allowedDomains, input.product.imageUrl)) {
      return reply.code(403).send({ error: "product.imageUrl is not on an allowed domain for this store" });
    }
    if (input.product.url && !isAllowedProductUrl(store.allowedDomains, input.product.url)) {
      return reply.code(403).send({ error: "product.url is not on an allowed domain for this store" });
    }

    const visitorIp = request.ip;
    const withinVisitorLimit = await checkVisitorLimit(store.id, store.maxTryOnsPerVisitor, visitorIp);
    if (!withinVisitorLimit) {
      return reply.code(429).send({
        error: "You've reached the try-on limit for this store. Please contact the store if you'd like another try.",
        code: "VISITOR_LIMIT_REACHED",
      });
    }

    const visitorId = input.visitorId ?? randomUUID();
    const expiresAt = new Date(Date.now() + resultRetentionMs(store));

    const session = await prisma.tryOnSession.create({
      data: {
        tenantId: store.tenantId,
        storeId: store.id,
        externalProductId: input.product.id,
        productTitle: input.product.title,
        productUrl: input.product.url,
        productImageUrl: input.product.imageUrl,
        sku: input.product.sku,
        price: input.product.price,
        currency: input.product.currency,
        visitorId,
        visitorIp,
        browserSessionId: input.browserSessionId,
        utmSource: input.utm?.source,
        utmMedium: input.utm?.medium,
        utmCampaign: input.utm?.campaign,
        utmTerm: input.utm?.term,
        utmContent: input.utm?.content,
        gclid: input.utm?.gclid,
        fbclid: input.utm?.fbclid,
        ttclid: input.utm?.ttclid,
        referrer: input.referrer,
        device: input.device,
        status: "CREATED",
        expiresAt,
      },
    });

    const generation = await prisma.tryOnGeneration.create({
      data: { tryOnSessionId: session.id, tenantId: store.tenantId, storeId: store.id, status: "CREATED", expiresAt },
    });

    let imageRef: { key: string; mimeType: string };
    try {
      imageRef = await storeCustomerImage(store, session.id, generation.id, input.customerImage);
    } catch (error) {
      await prisma.tryOnGeneration.update({
        where: { id: generation.id },
        data: { status: "FAILED", errorCode: "INVALID_CUSTOMER_IMAGE", errorMessage: (error as Error).message },
      });
      await prisma.tryOnSession.update({ where: { id: session.id }, data: { status: "FAILED" } });
      return reply.code(400).send({ error: "Could not process customerImage", message: (error as Error).message });
    }

    await prisma.tryOnGeneration.update({
      where: { id: generation.id },
      data: { customerImageKey: imageRef.key, customerImageMimeType: imageRef.mimeType, status: "UPLOADING" },
    });
    await prisma.tryOnSession.update({ where: { id: session.id }, data: { status: "UPLOADING" } });

    await prisma.event.create({
      data: {
        tenantId: store.tenantId,
        storeId: store.id,
        type: "TRYON_STARTED",
        tryOnSessionId: session.id,
        externalProductId: session.externalProductId,
        visitorId,
        utm: input.utm ?? undefined,
        referrer: input.referrer,
        device: input.device,
      },
    });

    await queue.enqueue({ tryOnGenerationId: generation.id });

    return reply.code(202).send({
      tryOnId: session.id,
      generationId: generation.id,
      status: "UPLOADING",
      visitorId,
    });
  });

  // ── Public: "try another photo" — new generation, same session ──────
  app.post("/api/v1/tryons/:id/retry", { preHandler: authenticateStorePublic }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = retryPhotoSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid request body", details: parsed.error.flatten() });

    const store = request.store!;
    const session = await prisma.tryOnSession.findFirst({ where: { id, storeId: store.id } });
    if (!session) return reply.code(404).send({ error: "Try-on session not found" });

    const entitlement = await checkPlanEntitlement(store.tenantId);
    if (!entitlement.allowed) {
      console.warn(`[tryons] store ${store.id} (tenant ${store.tenantId}) hit its plan limit on retry`);
      return reply.code(402).send({
        error: "This store is temporarily unable to process try-ons. Please try again soon.",
        code: "PLAN_LIMIT_REACHED",
      });
    }

    const expiresAt = new Date(Date.now() + resultRetentionMs(store));
    const generation = await prisma.tryOnGeneration.create({
      data: { tryOnSessionId: session.id, tenantId: store.tenantId, storeId: store.id, status: "CREATED", expiresAt },
    });

    let imageRef: { key: string; mimeType: string };
    try {
      imageRef = await storeCustomerImage(store, session.id, generation.id, parsed.data.customerImage);
    } catch (error) {
      await prisma.tryOnGeneration.update({
        where: { id: generation.id },
        data: { status: "FAILED", errorCode: "INVALID_CUSTOMER_IMAGE", errorMessage: (error as Error).message },
      });
      return reply.code(400).send({ error: "Could not process customerImage", message: (error as Error).message });
    }

    await prisma.tryOnGeneration.update({
      where: { id: generation.id },
      data: { customerImageKey: imageRef.key, customerImageMimeType: imageRef.mimeType, status: "UPLOADING" },
    });
    // The session tracks its latest generation's status; retrying moves it
    // back out of a terminal state.
    await prisma.tryOnSession.update({ where: { id: session.id }, data: { status: "UPLOADING" } });

    await queue.enqueue({ tryOnGenerationId: generation.id });

    return reply.code(202).send({ tryOnId: session.id, generationId: generation.id, status: "UPLOADING" });
  });

  // ── Public: poll status / fetch result ───────────────────────────────
  app.get("/api/v1/tryons/:id", { preHandler: authenticateStorePublic }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const store = request.store!;

    const session = await prisma.tryOnSession.findFirst({
      where: { id, storeId: store.id },
      include: { generations: { orderBy: { createdAt: "desc" }, take: 1 } },
    });
    if (!session) return reply.code(404).send({ error: "Try-on session not found" });

    const latest = session.generations[0];
    if (!latest) return reply.send({ tryOnId: session.id, status: session.status });

    if (latest.status === "COMPLETED" && latest.resultImageKey) {
      const resultUrl = await storage.getSignedUrl(BUCKETS.tryonResults, latest.resultImageKey, 3600);
      return reply.send({
        tryOnId: session.id,
        generationId: latest.id,
        status: latest.status,
        resultUrl,
        generationDurationMs: latest.generationDurationMs,
        product: {
          id: session.externalProductId,
          title: session.productTitle,
          url: session.productUrl,
          price: session.price ? Number(session.price) : undefined,
          currency: session.currency,
        },
      });
    }

    if (latest.status === "FAILED") {
      return reply.send({
        tryOnId: session.id,
        generationId: latest.id,
        status: latest.status,
        errorCode: latest.errorCode,
        errorMessage: latest.errorMessage,
      });
    }

    if (latest.status === "EXPIRED") {
      return reply.send({
        tryOnId: session.id,
        generationId: latest.id,
        status: "EXPIRED",
        message: "Customer image expired according to privacy policy.",
      });
    }

    return reply.send({ tryOnId: session.id, generationId: latest.id, status: latest.status });
  });

  // ── Public: shopper likes/dislikes their own result (product ask) ───
  app.post("/api/v1/tryons/:id/feedback", { preHandler: authenticateStorePublic }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = feedbackSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid request body", details: parsed.error.flatten() });

    const store = request.store!;
    const session = await prisma.tryOnSession.findFirst({ where: { id, storeId: store.id } });
    if (!session) return reply.code(404).send({ error: "Try-on session not found" });
    // Only makes sense once there's a result to react to — and keeps this
    // endpoint from being usable to spam a session that never generated.
    if (session.status !== "COMPLETED") return reply.code(409).send({ error: "This try-on has no result yet" });

    await prisma.tryOnSession.update({
      where: { id },
      data: { feedback: parsed.data.rating, feedbackAt: new Date() },
    });
    return reply.send({ ok: true });
  });

  // ── Merchant dashboard: list try-ons for the authenticated tenant ────
  //
  // One row per TryOnGeneration (attempt), not per TryOnSession — see the
  // matching comment on GET /api/v1/admin/tryons (routes/admin.ts) for
  // why: a session showed only its latest attempt, so a successful
  // generation that was later retried (and failed) had no row anywhere
  // that a merchant could find it.
  app.get("/api/v1/tryons", { preHandler: authenticateMerchant }, async (request, reply) => {
    const { tenantId } = request.merchant!;
    const query = request.query as {
      page?: string;
      limit?: string;
      storeId?: string;
      from?: string;
      to?: string;
      feedback?: string;
    };
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));

    // `from`/`to` are ISO timestamps — the dashboard's month filter sends
    // the first instant of the selected month and of the following month.
    const from = query.from ? new Date(query.from) : undefined;
    const to = query.to ? new Date(query.to) : undefined;
    const createdAtFilter =
      (from && !Number.isNaN(from.getTime())) || (to && !Number.isNaN(to.getTime()))
        ? {
            createdAt: {
              ...(from && !Number.isNaN(from.getTime()) ? { gte: from } : {}),
              ...(to && !Number.isNaN(to.getTime()) ? { lt: to } : {}),
            },
          }
        : {};

    const feedbackFilter =
      query.feedback === "LIKE"
        ? { session: { feedback: "LIKE" as const } }
        : query.feedback === "DISLIKE"
          ? { session: { feedback: "DISLIKE" as const } }
          : query.feedback === "ANY"
            ? { session: { feedback: { not: null } } }
            : {};
    const where = { tenantId, ...(query.storeId ? { storeId: query.storeId } : {}), ...createdAtFilter, ...feedbackFilter };
    const [items, total] = await Promise.all([
      prisma.tryOnGeneration.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          session: {
            select: {
              id: true,
              productTitle: true,
              productImageUrl: true,
              feedback: true,
              // Product ask: the list should show whether a try-on led to
              // an add-to-cart, not duration/UTM — those weren't useful
              // here (duration barely varies, and a lone UTM tag on a
              // browse event says nothing on its own; it matters once
              // there's a real order to tie it to, which is what the
              // detail route's `attribution` below is for). One row is
              // enough to know "yes" without fetching every event.
              events: { where: { type: "ADD_TO_CART" }, select: { id: true }, take: 1 },
            },
          },
        },
      }),
      prisma.tryOnGeneration.count({ where }),
    ]);

    // Product ask: the list itself should show the result thumbnail, not
    // just the row you click into. Never the customer's raw photo here
    // either — same privacy split as buildTryOnDetailPayload below.
    //
    // One batched call for the whole page instead of one signed-url request
    // per row — the Supabase adapter's getSignedUrl is a real network call,
    // so this page was firing up to `limit` concurrent requests to Supabase
    // Storage and feeling like it hangs (product-reported slowness).
    const resultKeys = items.filter((g) => g.status === "COMPLETED" && g.resultImageKey).map((g) => g.resultImageKey!);
    const resultUrls = await storage.getSignedUrls(BUCKETS.tryonResults, resultKeys, 3600).catch(() => ({}) as Record<string, string>);

    const rows = items.map((gen) => ({
      id: gen.id,
      sessionId: gen.session.id,
      productTitle: gen.session.productTitle,
      productImageUrl: gen.session.productImageUrl,
      resultUrl: (gen.resultImageKey && resultUrls[gen.resultImageKey]) ?? null,
      status: gen.status,
      errorCode: gen.errorCode,
      errorMessage: gen.errorMessage,
      feedback: gen.session.feedback,
      addedToCart: gen.session.events.length > 0,
      createdAt: gen.createdAt,
    }));

    return reply.send({ items: rows, total, page, limit });
  });

  // ── Merchant dashboard: one try-on's full detail ─────────────────────
  app.get("/api/v1/tryons/:id/detail", { preHandler: authenticateMerchant }, async (request, reply) => {
    const { tenantId } = request.merchant!;
    const { id } = request.params as { id: string };

    const session = await prisma.tryOnSession.findFirst({
      where: { id, tenantId },
      include: { generations: { orderBy: { createdAt: "desc" } }, attribution: { include: { order: true } } },
    });
    if (!session) return reply.code(404).send({ error: "Try-on session not found" });

    // Merchants see the product photo + the result (customer already
    // wearing it) — never the customer's raw uploaded photo. Only the
    // platform admin sees all three (apps/api/src/routes/admin.ts) — a
    // deliberate privacy split, not an oversight.
    return reply.send(await buildTryOnDetailPayload(session, { includeCustomerImage: false }));
  });
}

// Product photo — customer's uploaded photo — generated result: what a
// try-on's detail view can show. Shared by the merchant route above (with
// `includeCustomerImage: false`, per the privacy split noted there) and,
// cross-tenant, the platform admin (apps/api/src/routes/admin.ts, with
// `includeCustomerImage: true`) — one function so both routes' shape stays
// in sync on everything except that one field.
type SessionWithGenerationsAndAttribution = Awaited<ReturnType<typeof prisma.tryOnSession.findFirstOrThrow<{
  include: { generations: true; attribution: { include: { order: true } } };
}>>>;

export async function buildTryOnDetailPayload(
  session: SessionWithGenerationsAndAttribution,
  options: { includeCustomerImage: boolean } = { includeCustomerImage: true }
) {
  const generations = [...session.generations].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const latest = generations[0];

  // "Try another photo" (packages/widget's retry()) doesn't start a new
  // session — it adds another TryOnGeneration to this same one (routes/
  // tryons.ts's own /retry route comment: "new generation, same session").
  // A session's top-level status/resultUrl below only ever reflected the
  // *latest* generation, so a shopper whose first attempt actually
  // completed and then retried with a different photo that failed would
  // see this whole session as FAILED with no result — the successful
  // photo was still sitting in the DB the whole time, just with no way to
  // reach it from here (merchant report: "результат заменился", she was
  // right). All generations are now signed and returned below so every
  // attempt on this session — including an earlier successful one a later
  // retry buried — stays visible.
  const resultKeys = generations.filter((g) => g.status === "COMPLETED" && g.resultImageKey).map((g) => g.resultImageKey!);
  const customerKeys = options.includeCustomerImage ? generations.filter((g) => g.customerImageKey).map((g) => g.customerImageKey!) : [];

  const [resultUrls, customerUrls] = await Promise.all([
    storage.getSignedUrls(BUCKETS.tryonResults, resultKeys, 3600).catch(() => ({}) as Record<string, string>),
    options.includeCustomerImage
      ? storage.getSignedUrls(BUCKETS.customerPhotos, customerKeys, 3600).catch(() => ({}) as Record<string, string>)
      : Promise.resolve({} as Record<string, string>),
  ]);
  const resultUrl = (latest?.resultImageKey && resultUrls[latest.resultImageKey]) ?? null;
  const customerImageUrl = (latest?.customerImageKey && customerUrls[latest.customerImageKey]) ?? null;

  const generationHistory = generations.map((g) => ({
    id: g.id,
    status: g.status,
    errorCode: g.errorCode,
    errorMessage: g.errorMessage,
    resultUrl: (g.resultImageKey && resultUrls[g.resultImageKey]) ?? null,
    customerImageUrl: (g.customerImageKey && customerUrls[g.customerImageKey]) ?? null,
    generationDurationMs: g.generationDurationMs,
    createdAt: g.createdAt,
    completedAt: g.completedAt,
  }));

  return {
      id: session.id,
      storeId: session.storeId,
      product: {
        id: session.externalProductId,
        title: session.productTitle,
        url: session.productUrl,
        imageUrl: session.productImageUrl,
        sku: session.sku,
        price: session.price ? Number(session.price) : undefined,
        currency: session.currency,
      },
      status: latest?.status ?? session.status,
      errorCode: latest?.errorCode ?? null,
      errorMessage: latest?.errorMessage ?? null,
      // Not shown if the object was already cleared by a retention sweep
      // (ARCHITECTURE.md §16 — not yet built, so this is always present
      // today, but the null case is handled either way).
      customerImageUrl,
      resultUrl,
      feedback: session.feedback,
      generationDurationMs: latest?.generationDurationMs ?? null,
      generationsCount: session.generations.length,
      // Newest first, same order as `generations` above — every attempt on
      // this session, not just the latest one that the fields above reflect.
      generations: generationHistory,
      utm: {
        source: session.utmSource,
        medium: session.utmMedium,
        campaign: session.utmCampaign,
        term: session.utmTerm,
        content: session.utmContent,
      },
      attribution: session.attribution
        ? {
            orderId: session.attribution.order.externalOrderId,
            revenue: Number(session.attribution.order.totalAmount),
            currency: session.attribution.order.currency,
            minutesBetween: session.attribution.minutesBetween,
          }
        : null,
      createdAt: session.createdAt,
      completedAt: latest?.completedAt ?? null,
  };
}
