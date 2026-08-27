// Store API keys authenticate the public try-on endpoints (ARCHITECTURE.md
// §11). Only the hash is ever persisted — the raw key is returned once, at
// creation time, and never again.

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const KEY_PREFIX = "lf_";

export function generateApiKey(): string {
  return KEY_PREFIX + randomBytes(24).toString("hex");
}

export function hashApiKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}

export function verifyApiKeyHash(rawKey: string, hashed: string): boolean {
  const a = Buffer.from(hashApiKey(rawKey), "hex");
  const b = Buffer.from(hashed, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
