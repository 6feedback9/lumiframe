// The consumer side of the pipeline described in ARCHITECTURE.md §7.
// Deliberately a single function (not a class) so it can be handed to
// either queue implementation's `.process()` unchanged.

import { BUCKETS, fetchImageBytes } from "@lumiframe/storage";
import { assertTransition, getTryOnProvider, type TryOnStatus } from "@lumiframe/tryon";
import type { TryOnJobData } from "@lumiframe/queue";
import { createHash } from "node:crypto";
import { prisma, storage } from "../context";
import { env } from "../env";

const SIGNED_URL_TTL_SECONDS = 3600;
const POLL_INTERVAL_MS = 1000;
const POLL_TIMEOUT_MS = 60_000;

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
    await storage.putObject(BUCKETS.productAssets, productKey, product.buffer, product.mimeType);

    await prisma.tryOnGeneration.update({
      where: { id: generation.id },
      data: { productAssetKey: productKey, productAssetMimeType: product.mimeType },
    });

    const [customerUrl, productUrl] = await Promise.all([
      storage.getSignedUrl(BUCKETS.customerPhotos, generation.customerImageKey, SIGNED_URL_TTL_SECONDS),
      storage.getSignedUrl(BUCKETS.productAssets, productKey, SIGNED_URL_TTL_SECONDS),
    ]);

    const provider = getTryOnProvider(env.AI_PROVIDER);
    const { providerJobId } = await provider.generateTryOn({
      tryOnSessionId: session.id,
      tryOnGenerationId: generation.id,
      faceImage: { key: generation.customerImageKey, mimeType: generation.customerImageMimeType, url: customerUrl },
      eyewearImage: { key: productKey, mimeType: product.mimeType, url: productUrl },
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

    await prisma.usageRecord.create({
      data: {
        tenantId: session.tenantId,
        storeId: session.storeId,
        tryOnGenerationId: generation.id,
        provider: provider.name,
        units: 1,
      },
    });

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
