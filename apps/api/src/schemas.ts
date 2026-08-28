import { z } from "zod";

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  storeName: z.string().min(1).max(200),
  storeUrl: z.string().url(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// Product spec §34. `customerImage` is a data: URI (base64) — see
// ARCHITECTURE.md's note in packages/sdk README on why uploads are inlined
// for Phase 1 instead of a separate /api/v1/uploads call.
export const createTryOnSchema = z.object({
  storeId: z.string().optional(), // informational only — the API key is the actual auth
  product: z.object({
    id: z.string().min(1),
    title: z.string().max(300).optional(),
    imageUrl: z.string().url(),
    url: z.string().url().optional(),
    sku: z.string().max(120).optional(),
    price: z.number().nonnegative().optional(),
    currency: z.string().length(3).optional(),
  }),
  customerImage: z
    .string()
    .startsWith("data:image/", "customerImage must be a data:image/... URI"),
  visitorId: z.string().min(1).max(200).optional(),
  browserSessionId: z.string().max(200).optional(),
  referrer: z.string().max(2000).optional(),
  device: z.string().max(50).optional(),
  utm: z
    .object({
      source: z.string().max(200).optional(),
      medium: z.string().max(200).optional(),
      campaign: z.string().max(200).optional(),
      term: z.string().max(200).optional(),
      content: z.string().max(200).optional(),
      gclid: z.string().max(500).optional(),
      fbclid: z.string().max(500).optional(),
      ttclid: z.string().max(500).optional(),
    })
    .optional(),
});
export type CreateTryOnInput = z.infer<typeof createTryOnSchema>;

export const retryPhotoSchema = z.object({
  customerImage: z.string().startsWith("data:image/", "customerImage must be a data:image/... URI"),
});

export const feedbackSchema = z.object({
  rating: z.enum(["LIKE", "DISLIKE"]),
});

export const eventSchema = z.object({
  type: z.enum([
    "WIDGET_OPENED",
    "PHOTO_SELECTED",
    "TRYON_STARTED",
    "TRYON_COMPLETED",
    "TRYON_FAILED",
    "RESULT_VIEWED",
    "TRY_ANOTHER",
    "BACK_TO_PRODUCT",
    "ADD_TO_CART",
    "TRYON_ADD_TO_CART",
    "CHECKOUT_STARTED",
    "ORDER_COMPLETED",
    "TRYON_ORDER",
  ]),
  tryOnSessionId: z.string().optional(),
  externalProductId: z.string().optional(),
  visitorId: z.string().min(1),
  browserSessionId: z.string().optional(),
  referrer: z.string().max(2000).optional(),
  device: z.string().max(50).optional(),
  metadata: z.record(z.unknown()).optional(),
});
