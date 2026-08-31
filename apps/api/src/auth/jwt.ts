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

export interface PasswordResetTokenPayload {
  userId: string;
  /** Distinguishes this from a MerchantTokenPayload — verifyMerchantToken
   * would otherwise happily decode one of these too (same secret, no
   * `tenantId` claim required at the type level), letting a short-lived
   * reset token double as a real login token. */
  type: "password_reset";
}

// Minted only after verify-reset-code accepts the one-time code (see
// routes/auth.ts) — this is what the "enter new password" step actually
// authorizes with, not the code itself, so the code can be single-use
// and the reset-password call doesn't need to re-check it.
export function signPasswordResetToken(userId: string): string {
  return jwt.sign({ userId, type: "password_reset" } satisfies PasswordResetTokenPayload, env.JWT_SECRET, { expiresIn: "10m" });
}

export function verifyPasswordResetToken(token: string): PasswordResetTokenPayload | null {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as PasswordResetTokenPayload;
    return decoded.type === "password_reset" ? decoded : null;
  } catch {
    return null;
  }
}
