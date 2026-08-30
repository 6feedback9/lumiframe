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
      // Long-lived — this is a static file shipped with the deploy, not
      // something that changes without a new release.
      reply.header("Cache-Control", "public, max-age=604800, immutable");
      return reply.send(bytes);
    } catch {
      return reply.code(404).send();
    }
  });
}
