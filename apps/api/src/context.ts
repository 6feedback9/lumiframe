// Process-wide singletons, built once from env. Both server.ts and
// worker/run.ts import from here so they share the exact same
// construction logic.

import { prisma } from "@lumiframe/database";
import { getTryOnQueue } from "@lumiframe/queue";
import { createStorageAdapter } from "@lumiframe/storage";

export { prisma };
export const storage = createStorageAdapter();
export const queue = getTryOnQueue();
