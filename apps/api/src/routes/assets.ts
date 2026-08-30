import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";

// Static, non-tenant-specific assets the widget itself references (not
// anything merchant-uploaded — that would go through packages/storage
// like customer photos/results do). Same "read the file straight off
// disk, no build step" pattern as sdk.ts's /sdk.js route.
export async function assetsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/assets/example-tryon.jpg", async (_request, reply) => {
    const here = fileURLToPath(new URL(".", import.meta.url));
    const path = join(here, "..", "assets", "example-tryon.jpg");
    try {
      const bytes = await readFile(path);
      reply.header("Content-Type", "image/jpeg");
      // Short-lived, same as sdk.js's own Cache-Control below — not
      // "immutable" week-long caching. This file is still being iterated
      // on (already replaced twice over one merchant's feedback), and it's
      // referenced from a single fixed URL rather than a content-hashed
      // one, so a long cache would mean an already-cached browser (or a
      // CDN in front of this API) keeps serving the old version for days
      // after a redeploy actually shipped the new one.
      reply.header("Cache-Control", "public, max-age=300");
      return reply.send(bytes);
    } catch {
      return reply.code(404).send();
    }
  });
}
