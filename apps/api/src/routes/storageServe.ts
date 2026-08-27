import type { FastifyInstance } from "fastify";
import { LocalFsStorageAdapter, verifySignedPath } from "@lumiframe/storage";
import { env } from "../env";
import { storage } from "../context";

const MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

/**
 * Only registered when the local filesystem storage adapter is active
 * (dev/CI — no SUPABASE_URL configured). This is what makes
 * `LocalFsStorageAdapter.getSignedUrl`'s URLs actually resolve to bytes;
 * in a real deployment, Supabase Storage serves signed URLs directly and
 * this route never runs.
 */
export async function storageServeRoutes(app: FastifyInstance): Promise<void> {
  if (!(storage instanceof LocalFsStorageAdapter)) return;

  app.get("/internal/storage/:bucket/:key", async (request, reply) => {
    const { bucket, key } = request.params as { bucket: string; key: string };
    const { exp, sig } = request.query as { exp?: string; sig?: string };
    if (!exp || !sig) return reply.code(400).send({ error: "Missing exp/sig" });

    const decodedKey = decodeURIComponent(key);
    const verified = verifySignedPath(bucket, decodedKey, Number(exp), sig, env.STORAGE_SIGNING_SECRET!);
    if (!verified) return reply.code(403).send({ error: "Invalid or expired signature" });

    try {
      const bytes = await (storage as LocalFsStorageAdapter).readObject(bucket, decodedKey);
      const ext = decodedKey.split(".").pop()?.toLowerCase() ?? "";
      reply.header("Content-Type", MIME_BY_EXT[ext] ?? "application/octet-stream");
      reply.header("Cache-Control", "private, max-age=3600");
      return reply.send(bytes);
    } catch {
      return reply.code(404).send({ error: "Object not found" });
    }
  });
}
