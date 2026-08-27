import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";

// The one file every real merchant's <script src="..."> actually points
// at (packages/sdk/README.md's usage example). apps/demo-store has its
// own copy of this route purely for local-dev convenience (works without
// apps/api running); this is the real, always-deployed-with-the-API one.
// Requires `pnpm --filter @lumiframe/sdk build` to have run.
export async function sdkRoutes(app: FastifyInstance): Promise<void> {
  app.get("/sdk.js", async (_request, reply) => {
    const here = fileURLToPath(new URL(".", import.meta.url));
    const path = join(here, "..", "..", "..", "..", "packages", "sdk", "dist", "index.global.js");
    try {
      const contents = await readFile(path, "utf8");
      reply.header("Content-Type", "application/javascript; charset=utf-8");
      reply.header("Cache-Control", "public, max-age=300");
      return reply.send(contents);
    } catch {
      reply.code(503);
      return reply.send("console.error('Lumi Frame SDK not built on this server yet.');");
    }
  });
}
