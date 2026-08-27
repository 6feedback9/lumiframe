import jwt from "jsonwebtoken";
import { env } from "../env";

export interface MerchantTokenPayload {
  userId: string;
  tenantId: string;
  /**
   * Set only for a platform-owner account (User.isPlatformAdmin — see
   * schema comment). A merchant's token never carries this claim, so
   * `authenticateAdmin` (plugins/auth.ts) can gate on it without a second
   * DB round-trip per request.
   */
  isPlatformAdmin?: true;
}

export function signMerchantToken(payload: MerchantTokenPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: "7d" });
}

export function verifyMerchantToken(token: string): MerchantTokenPayload | null {
  try {
    return jwt.verify(token, env.JWT_SECRET) as MerchantTokenPayload;
  } catch {
    return null;
  }
}
