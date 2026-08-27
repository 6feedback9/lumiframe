// Standalone worker process entrypoint — used when REDIS_URL is set
// (ARCHITECTURE.md §2/§7: the worker needs a persistent process, unlike
// the API which can run serverless). Run alongside `pnpm dev` /
// `pnpm start`, never instead of it.
//
// When REDIS_URL is unset, don't run this at all — server.ts registers
// the same processor on the in-memory queue itself, since an in-memory
// queue only exists within one process.

import "../loadEnv";
import { env } from "../env";
import { queue } from "../context";
import { bootstrapProviders } from "../providers/bootstrap";
import { processTryOnJob } from "./processTryOnJob";

if (!env.REDIS_URL) {
  console.error(
    "REDIS_URL is not set. The standalone worker process is only needed in BullMQ mode; " +
      "in dev/CI (no REDIS_URL) the API server itself processes jobs in-process. Exiting."
  );
  process.exit(1);
}

bootstrapProviders();
queue.process(processTryOnJob);
console.log(`[worker] listening on the tryon-generation queue (provider=${env.AI_PROVIDER})`);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    await queue.close();
    process.exit(0);
  });
}
