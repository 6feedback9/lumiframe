// Shared Prisma client singleton. Every app (api, dashboard, admin) imports
// the client from here rather than instantiating its own — this is what
// makes "every tenant-scoped query filters on tenantId" enforceable in one
// place later (e.g. via Prisma client extensions), instead of trusted-by-
// convention across three codebases.

import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __lumiframePrisma: PrismaClient | undefined;
}

export const prisma =
  globalThis.__lumiframePrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__lumiframePrisma = prisma;
}

export * from "@prisma/client";
