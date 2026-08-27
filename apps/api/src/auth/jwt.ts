import jwt from "jsonwebtoken";
import { env } from "../env";

export interface MerchantTokenPayload {
  userId: string;
  tenantId: string;
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
