import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LocalFsStorageAdapter, verifySignedPath } from "./localAdapter";

describe("LocalFsStorageAdapter", () => {
  let rootDir: string;
  let adapter: LocalFsStorageAdapter;

  beforeEach(async () => {
    rootDir = await mkdtemp(join(tmpdir(), "lumiframe-storage-"));
    adapter = new LocalFsStorageAdapter({ rootDir, secret: "test-secret", publicBaseUrl: "http://localhost:4000" });
  });

  afterEach(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  it("round-trips an object through put -> signed URL -> verify -> read", async () => {
    const bytes = Buffer.from("hello world");
    await adapter.putObject("tryon-results", "abc/result.png", bytes, "image/png");

    const url = await adapter.getSignedUrl("tryon-results", "abc/result.png", 60);
    const parsed = new URL(url);
    const [, , , bucket, key] = parsed.pathname.split("/"); // "", internal, storage, :bucket, :key
    if (!bucket || !key) throw new Error("unexpected signed URL shape");
    const exp = Number(parsed.searchParams.get("exp"));
    const sig = parsed.searchParams.get("sig")!;

    const verified = verifySignedPath(bucket, decodeURIComponent(key), exp, sig, "test-secret");
    expect(verified).toEqual({ bucket: "tryon-results", key: "abc/result.png" });

    const readBack = await adapter.readObject(bucket, decodeURIComponent(key));
    expect(readBack.toString()).toBe("hello world");
  });

  it("rejects a signature signed with the wrong secret", async () => {
    await adapter.putObject("tryon-results", "x.png", Buffer.from("x"), "image/png");
    const url = await adapter.getSignedUrl("tryon-results", "x.png", 60);
    const parsed = new URL(url);
    const exp = Number(parsed.searchParams.get("exp"));
    const sig = parsed.searchParams.get("sig")!;

    expect(verifySignedPath("tryon-results", "x.png", exp, sig, "wrong-secret")).toBeNull();
  });

  it("rejects an expired signature", async () => {
    await adapter.putObject("tryon-results", "x.png", Buffer.from("x"), "image/png");
    // -1 seconds TTL => the embedded expiry is already in the past.
    const url = await adapter.getSignedUrl("tryon-results", "x.png", -1);
    const parsed = new URL(url);
    const exp = Number(parsed.searchParams.get("exp"));
    const sig = parsed.searchParams.get("sig")!;

    expect(verifySignedPath("tryon-results", "x.png", exp, sig, "test-secret")).toBeNull();
  });

  it("getSignedUrls returns one verifiable URL per key, deduped", async () => {
    await adapter.putObject("tryon-results", "a.png", Buffer.from("a"), "image/png");
    await adapter.putObject("tryon-results", "b.png", Buffer.from("b"), "image/png");

    const urls = await adapter.getSignedUrls("tryon-results", ["a.png", "b.png", "a.png"], 60);
    expect(Object.keys(urls).sort()).toEqual(["a.png", "b.png"]);

    for (const key of ["a.png", "b.png"] as const) {
      const parsed = new URL(urls[key]!);
      const exp = Number(parsed.searchParams.get("exp"));
      const sig = parsed.searchParams.get("sig")!;
      expect(verifySignedPath("tryon-results", key, exp, sig, "test-secret")).toEqual({ bucket: "tryon-results", key });
    }
  });

  it("deleteObject removes the file", async () => {
    await adapter.putObject("tryon-results", "y.png", Buffer.from("y"), "image/png");
    await adapter.deleteObject("tryon-results", "y.png");
    await expect(adapter.readObject("tryon-results", "y.png")).rejects.toThrow();
  });
});
