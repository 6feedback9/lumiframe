// The consumer side of the pipeline described in ARCHITECTURE.md §7.
// Deliberately a single function (not a class) so it can be handed to
// either queue implementation's `.process()` unchanged.

import { BUCKETS, fetchImageBytes } from "@lumiframe/storage";
import { assertTransition, getTryOnProvider, type TryOnStatus } from "@lumiframe/tryon";
import type { TryOnJobData } from "@lumiframe/queue";
import { createHash } from "node:crypto";
import { prisma, storage } from "../context";
import { env } from "../env";
import { checkPlanEntitlement } from "../domain/planEntitlement";

const SIGNED_URL_TTL_SECONDS = 3600;
const POLL_INTERVAL_MS = 1000;
// A real provider's own generateTryOn() call is fully synchronous (see
// packages/providers/real's own comment) — it doesn't return until its
// internal retry loop is done, up to GENERATE_TIMEOUT_MS * MAX_ATTEMPTS
// there (75s as of this writing). This loop only ever actually waits on
// a provider that returns a non-terminal status and keeps the worker
// polling — for the real provider that's already resolved by the time
// this loop starts, so in practice this is a safety net against a
// provider hanging indefinitely, not the real bound on retry time. Keep
// it comfortably above that 75s regardless, so it never fires first and
// cuts a legitimate in-flight retry off from underneath the provider.
const POLL_TIMEOUT_MS = 90_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extensionForMime(mimeType: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
  };
  return map[mimeType.toLowerCase()] ?? "bin";
}

async function setSessionStatus(sessionId: string, from: TryOnStatus, to: TryOnStatus): Promise<void> {
  assertTransition(from, to);
  await prisma.tryOnSession.update({ where: { id: sessionId }, data: { status: to } });
}

async function failGeneration(
  generationId: string,
  sessionId: string,
  sessionStatus: TryOnStatus,
  errorCode: string,
  errorMessage: string
): Promise<void> {
  await prisma.tryOnGeneration.update({
    where: { id: generationId },
    data: { status: "FAILED", errorCode, errorMessage, completedAt: new Date() },
  });
  // A session may already be FAILED (e.g. a prior generation on a retried
  // photo) — only transition if it's still in a state that allows it.
  if (sessionStatus !== "FAILED") {
    await setSessionStatus(sessionId, sessionStatus, "FAILED");
  }
}

export async function processTryOnJob({ tryOnGenerationId }: TryOnJobData): Promise<void> {
  const generation = await prisma.tryOnGeneration.findUnique({
    where: { id: tryOnGenerationId },
    include: { session: true },
  });
  if (!generation) {
    console.error(`[worker] TryOnGeneration ${tryOnGenerationId} not found — dropping job`);
    return;
  }
  const { session } = generation;

  // How long this job sat in the queue before a worker picked it up, as
  // opposed to how long the generation itself took (that's `durationMs`
  // in the provider's own logs/errors) — the two get conflated in a
  // shopper-facing "it's slow" report otherwise. A large gap here on the
  // first job after a period of no traffic points at the host spinning
  // the worker down when idle (see DEPLOYMENT.md §3.7: Render's free
  // tier does this — the fix is a paid always-on instance, not code).
  const queueLatencyMs = Date.now() - generation.createdAt.getTime();
  if (queueLatencyMs > 5_000) {
    console.warn(`[worker] generation ${generation.id} waited ${queueLatencyMs}ms in queue before a worker picked it up`);
  }

  try {
    await prisma.tryOnGeneration.update({
      where: { id: generation.id },
      data: { status: "PROCESSING", startedAt: new Date() },
    });
    await setSessionStatus(session.id, session.status as TryOnStatus, "PROCESSING");

    if (!generation.customerImageKey || !generation.customerImageMimeType) {
      throw new Error("Generation is missing a stored customer image");
    }

    // ── Product image: Phase 1 pass-through (download + store + hash).
    // Real detection/background-removal/geometry extraction is Phase 2's
    // ProductImageProcessor (packages/tryon/src/productImageProcessor.ts);
    // content-hash caching also lands then.
    const product = await fetchImageBytes(session.productImageUrl);
    const productHash = createHash("sha256").update(product.buffer).digest("hex");
    const productKey = `${session.storeId}/${productHash}.${extensionForMime(product.mimeType)}`;

    // Persisting the product asset (audit trail / future reuse) and
    // resolving the customer photo's signed URL don't depend on each
    // other, and — since a real provider now gets the product image's
    // bytes inline below instead of re-fetching them from our own
    // storage (see StoredImageRef.buffer) — neither one blocks the
    // actual generation call either. This used to be three sequential
    // network round trips (upload the product asset, sign both URLs,
    // then the provider re-fetches the product image back down) sitting
    // in front of every single Gemini call; now it's one, done in
    // parallel with the other two instead of before them.
    const [customerUrl] = await Promise.all([
      storage.getSignedUrl(BUCKETS.customerPhotos, generation.customerImageKey, SIGNED_URL_TTL_SECONDS),
      storage.putObject(BUCKETS.productAssets, productKey, product.buffer, product.mimeType),
      prisma.tryOnGeneration.update({
        where: { id: generation.id },
        data: { productAssetKey: productKey, productAssetMimeType: product.mimeType },
      }),
    ]);

    const provider = getTryOnProvider(env.AI_PROVIDER);
    const { providerJobId } = await provider.generateTryOn({
      tryOnSessionId: session.id,
      tryOnGenerationId: generation.id,
      faceImage: { key: generation.customerImageKey, mimeType: generation.customerImageMimeType, url: customerUrl },
      eyewearImage: { key: productKey, mimeType: product.mimeType, buffer: product.buffer },
    });
    await prisma.tryOnGeneration.update({
      where: { id: generation.id },
      data: { provider: provider.name, providerJobId },
    });

    // ── Poll until terminal or our own timeout (independent of whatever
    // the provider itself reports — a provider stuck in "processing"
    // forever must not hang this worker slot indefinitely).
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    let status = await provider.getJobStatus(providerJobId);
    while (status.state === "queued" || status.state === "processing") {
      if (Date.now() > deadline) {
        await provider.cancelJob(providerJobId).catch(() => {});
        await failGeneration(generation.id, session.id, "PROCESSING", "WORKER_POLL_TIMEOUT", "Timed out waiting for the provider");
        return;
      }
      await sleep(POLL_INTERVAL_MS);
      status = await provider.getJobStatus(providerJobId);
    }

    if (status.state !== "completed" || !status.resultImageUrl) {
      // A provider reporting "failed"/"timeout" cleanly isn't an exception
      // (the outer catch below never sees it), so without this the only
      // record of why a real customer's try-on failed is a DB column no
      // one's looking at — log it too, so it shows up in Render/hosting
      // logs the same way an actual crash would.
      console.error(
        `[worker] generation ${generation.id}: provider "${provider.name}" reported ${status.state} — ${status.errorCode ?? "PROVIDER_FAILED"}: ${status.errorMessage ?? "(no message)"}`
      );
      await failGeneration(
        generation.id,
        session.id,
        "PROCESSING",
        status.errorCode ?? "PROVIDER_FAILED",
        status.errorMessage ?? "Provider did not return a result"
      );
      return;
    }

    // ── Validate + store the result (ARCHITECTURE.md §14: existence,
    // decodability, and sane size are checked before COMPLETED is set).
    const result = await fetchImageBytes(status.resultImageUrl);
    if (result.buffer.length === 0) {
      await failGeneration(generation.id, session.id, "PROCESSING", "RESULT_VALIDATION_FAILED", "Empty result image");
      return;
    }
    const resultKey = `${generation.id}.${extensionForMime(result.mimeType)}`;
    await storage.putObject(BUCKETS.tryonResults, resultKey, result.buffer, result.mimeType);

    const completedAt = new Date();
    await prisma.tryOnGeneration.update({
      where: { id: generation.id },
      data: {
        status: "COMPLETED",
        resultImageKey: resultKey,
        resultImageMimeType: result.mimeType,
        generationDurationMs: status.durationMs ?? completedAt.getTime() - (generation.startedAt?.getTime() ?? completedAt.getTime()),
        completedAt,
      },
    });
    await setSessionStatus(session.id, "PROCESSING", "COMPLETED");

    // Before recording this generation's own usage: if the tenant's plan
    // monthly allowance is already used up by generations before this one,
    // this one is running on the top-up balance — decrement it.
    // checkPlanEntitlement already gated this at creation time (an empty
    // top-up balance would have blocked it before it got here); the
    // `topUpCredits: { gt: 0 }` guard just keeps this update a no-op
    // instead of going negative if two completions race each other.
    const entitlement = await checkPlanEntitlement(session.tenantId);
    if (entitlement.usedThisMonth >= entitlement.monthlyLimit) {
      await prisma.tenant.updateMany({
        where: { id: session.tenantId, topUpCredits: { gt: 0 } },
        data: { topUpCredits: { decrement: 1 } },
      });
    }

    await prisma.usageRecord.create({
      data: {
        tenantId: session.tenantId,
        storeId: session.storeId,
        tryOnGenerationId: generation.id,
        provider: provider.name,
        units: 1,
      },
    });

    // The TEST plan is a one-time lifetime allowance (see PlanKey's
    // schema comment), not a monthly quota that resets free forever like
    // every real paid plan's does — once it's fully used, take the
    // tenant off it automatically, back to "no plan", the same end state
    // the owner cancelling it manually already produces (routes/admin.ts's
    // isTrialCancellation). Otherwise the plan would just sit there with
    // zero capacity left until an admin noticed and cleared it by hand.
    const tenantWithPlan = await prisma.tenant.findUnique({ where: { id: session.tenantId }, include: { plan: true } });
    if (tenantWithPlan?.plan?.key === "TEST") {
      const lifetimeUsed = await prisma.usageRecord.count({ where: { tenantId: session.tenantId } });
      if (lifetimeUsed >= tenantWithPlan.plan.monthlyLimit) {
        await prisma.tenant.update({ where: { id: session.tenantId }, data: { planId: null } });
      }
    }

    await prisma.event.create({
      data: {
        tenantId: session.tenantId,
        storeId: session.storeId,
        type: "TRYON_COMPLETED",
        tryOnSessionId: session.id,
        externalProductId: session.externalProductId,
        visitorId: session.visitorId,
      },
    });
  } catch (error) {
    console.error(`[worker] job for generation ${generation.id} threw`, error);
    const fresh = await prisma.tryOnSession.findUnique({ where: { id: session.id } });
    await failGeneration(
      generation.id,
      session.id,
      (fresh?.status as TryOnStatus) ?? "PROCESSING",
      "WORKER_ERROR",
      error instanceof Error ? error.message : String(error)
    ).catch((e) => console.error("[worker] failed to record failure state", e));
  }
}
