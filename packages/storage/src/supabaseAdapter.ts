import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { StorageAdapter } from "./types";

export class SupabaseStorageAdapter implements StorageAdapter {
  private readonly client: SupabaseClient;

  constructor(options: { url: string; serviceRoleKey: string }) {
    this.client = createClient(options.url, options.serviceRoleKey);
  }

  async putObject(bucket: string, key: string, data: Buffer, contentType: string): Promise<void> {
    const { error } = await this.client.storage.from(bucket).upload(key, data, {
      contentType,
      upsert: true,
    });
    if (error) throw new Error(`SupabaseStorageAdapter.putObject(${bucket}/${key}): ${error.message}`);
  }

  async getSignedUrl(bucket: string, key: string, expiresInSeconds: number): Promise<string> {
    const { data, error } = await this.client.storage.from(bucket).createSignedUrl(key, expiresInSeconds);
    if (error || !data) throw new Error(`SupabaseStorageAdapter.getSignedUrl(${bucket}/${key}): ${error?.message}`);
    return data.signedUrl;
  }

  async deleteObject(bucket: string, key: string): Promise<void> {
    const { error } = await this.client.storage.from(bucket).remove([key]);
    if (error) throw new Error(`SupabaseStorageAdapter.deleteObject(${bucket}/${key}): ${error.message}`);
  }
}
