// Dev/CI storage adapter — no Supabase project required, mirrors the real
// adapter's "private bucket + signed URL" contract using an HMAC-signed
// query string instead of a vendor's signing. apps/api serves the actual
// bytes through a route that calls `verifySignedPath` before returning
// anything, so an unsigned or expired link 403s exactly like a real
// private-bucket URL would.

import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { StorageAdapter } from "./types";

function sign(bucket: string, key: string, expiresAtMs: number, secret: string): string {
  return createHmac("sha256", secret).update(`${bucket}:${key}:${expiresAtMs}`).digest("hex");
}

export interface VerifiedSignedPath {
  bucket: string;
  key: string;
}

/**
 * Used by apps/api's storage-serving route. Returns the bucket/key if the
 * signature is valid and not expired, otherwise null.
 */
export function verifySignedPath(
  bucket: string,
  key: string,
  expiresAtMs: number,
  signature: string,
  secret: string
): VerifiedSignedPath | null {
  if (!Number.isFinite(expiresAtMs) || Date.now() > expiresAtMs) return null;
  const expected = sign(bucket, key, expiresAtMs, secret);
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(signature, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return { bucket, key };
}

export class LocalFsStorageAdapter implements StorageAdapter {
  private readonly rootDir: string;
  private readonly secret: string;
  private readonly publicBaseUrl: string;

  constructor(options: { rootDir?: string; secret: string; publicBaseUrl: string }) {
    this.rootDir = resolve(options.rootDir ?? ".data/storage");
    this.secret = options.secret;
    this.publicBaseUrl = options.publicBaseUrl.replace(/\/$/, "");
  }

  private pathFor(bucket: string, key: string): string {
    return join(this.rootDir, bucket, key);
  }

  async putObject(bucket: string, key: string, data: Buffer, _contentType: string): Promise<void> {
    const filePath = this.pathFor(bucket, key);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, data);
  }

  async getSignedUrl(bucket: string, key: string, expiresInSeconds: number): Promise<string> {
    const expiresAtMs = Date.now() + expiresInSeconds * 1000;
    const signature = sign(bucket, key, expiresAtMs, this.secret);
    const params = new URLSearchParams({ exp: String(expiresAtMs), sig: signature });
    return `${this.publicBaseUrl}/internal/storage/${bucket}/${encodeURIComponent(key)}?${params.toString()}`;
  }

  // Purely local HMAC signing — no network call either way, so a loop is
  // just as fast as a real batch. Kept for interface parity with the
  // Supabase adapter, where batching is what actually matters.
  async getSignedUrls(bucket: string, keys: string[], expiresInSeconds: number): Promise<Record<string, string>> {
    const result: Record<string, string> = {};
    for (const key of [...new Set(keys)]) {
      result[key] = await this.getSignedUrl(bucket, key, expiresInSeconds);
    }
    return result;
  }

  async deleteObject(bucket: string, key: string): Promise<void> {
    await rm(this.pathFor(bucket, key), { force: true });
  }

  /** Only used by apps/api's storage-serving route, after verifySignedPath passes. */
  async readObject(bucket: string, key: string): Promise<Buffer> {
    return readFile(this.pathFor(bucket, key));
  }
}
