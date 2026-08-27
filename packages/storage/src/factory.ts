import { LocalFsStorageAdapter } from "./localAdapter";
import { SupabaseStorageAdapter } from "./supabaseAdapter";
import type { StorageAdapter } from "./types";

/**
 * Supabase when configured (real deployments), local filesystem otherwise
 * (dev/CI) — same pattern as `getTryOnProvider` picking mock vs. a real
 * vendor. Nothing that calls a StorageAdapter needs to know which one it got.
 */
export function createStorageAdapter(): StorageAdapter {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
    return new SupabaseStorageAdapter({ url: SUPABASE_URL, serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY });
  }

  const secret = process.env.STORAGE_SIGNING_SECRET;
  if (!secret) {
    throw new Error(
      "No storage configured: set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY for Supabase Storage, " +
        "or STORAGE_SIGNING_SECRET to use the local filesystem adapter for dev/CI."
    );
  }
  return new LocalFsStorageAdapter({
    secret,
    publicBaseUrl: process.env.API_BASE_URL ?? "http://localhost:4000",
  });
}
