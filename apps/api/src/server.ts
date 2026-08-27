import "./loadEnv";
import { buildApp } from "./app";
import { env } from "./env";
import { queue } from "./context";
import { bootstrapProviders } from "./providers/bootstrap";
import { processTryOnJob } from "./worker/processTryOnJob";

async function main() {
  bootstrapProviders();

  // No REDIS_URL => in-memory queue, which only exists within this one
  // process, so this process must also be the worker (ARCHITECTURE.md
  // §7). With REDIS_URL set, run `pnpm worker:dev` / `worker:start`
  // separately instead — see apps/api/src/worker/run.ts.
  if (!env.REDIS_URL) {
    queue.process(processTryOnJob);
  }

  const app = await buildApp();
  await app.listen({ port: env.PORT, host: "0.0.0.0" });
}

main().catch((error) => {
  console.error("Failed to start apps/api:", error);
  process.exit(1);
});
