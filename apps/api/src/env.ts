import { z } from "zod";

// Fails fast at boot with a readable message instead of undefined creeping
// into a signature check or a JWT secret three layers deep.
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  API_BASE_URL: z.string().url().default("http://localhost:4000"),

  DATABASE_URL: z.string().min(1),

  AI_PROVIDER: z.string().default("mock"),
  REDIS_URL: z.string().optional(),

  // Only required when AI_PROVIDER=gemini (packages/providers/real). Left
  // optional here so a mock-only deployment never needs to set these.
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_IMAGE_MODEL: z.string().optional(),

  // Only required when AI_PROVIDER=fashn (packages/providers/fashn).
  FASHN_API_KEY: z.string().optional(),

  SUPABASE_URL: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  STORAGE_SIGNING_SECRET: z.string().optional(),

  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 characters"),

  CUSTOMER_IMAGE_RETENTION_HOURS: z.coerce.number().positive().default(24),
  TRYON_RESULT_RETENTION_HOURS: z.coerce.number().positive().default(720),
  TRYON_ATTRIBUTION_WINDOW_HOURS: z.coerce.number().positive().default(72),
}).refine((data) => data.AI_PROVIDER !== "gemini" || !!data.GEMINI_API_KEY, {
  message: "GEMINI_API_KEY is required when AI_PROVIDER=gemini",
  path: ["GEMINI_API_KEY"],
}).refine((data) => data.AI_PROVIDER !== "fashn" || !!data.FASHN_API_KEY, {
  message: "FASHN_API_KEY is required when AI_PROVIDER=fashn",
  path: ["FASHN_API_KEY"],
});

function loadEnv() {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    console.error("Invalid environment configuration:\n" + parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n"));
    process.exit(1);
  }
  return parsed.data;
}

export const env = loadEnv();
