import type { FastifyInstance } from "fastify";
import { randomInt } from "node:crypto";
import { prisma } from "../context";
import { hashPassword, verifyPassword } from "../auth/password";
import { generateApiKey, hashApiKey } from "../auth/apiKey";
import { signMerchantToken, signPasswordResetToken, verifyPasswordResetToken } from "../auth/jwt";
import { authenticateMerchant } from "../plugins/auth";
import { forgotPasswordSchema, loginSchema, registerSchema, resetPasswordSchema, verifyResetCodeSchema } from "../schemas";

// 30 minutes is enough time for the real, manual relay this is built for
// (merchant asks the platform owner for the code, owner reads it off
// apps/admin and tells them — see the schema comment on
// PasswordResetCode) without leaving a long-lived code sitting around.
const RESET_CODE_TTL_MS = 30 * 60 * 1000;

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/v1/auth/register", async (request, reply) => {
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid request body", details: parsed.error.flatten() });
    const { email, password, storeName, storeUrl } = parsed.data;

    const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (existing) return reply.code(409).send({ error: "An account with this email already exists" });

    const hostname = hostnameOf(storeUrl);
    if (!hostname) return reply.code(400).send({ error: "storeUrl must be a valid URL" });

    const passwordHash = await hashPassword(password);
    const rawApiKey = generateApiKey();

    // Every new tenant starts on the TEST plan — a real Plan row ($0/mo,
    // 10 try-ons, admin-grant only, never shown to a merchant choosing
    // their own plan — see routes/billing.ts) rather than a special
    // "no plan + topUpCredits" state. This used to auto-assign Starter
    // ($29/mo, 100/mo) here instead, which silently gave every signup
    // full paid-tier access with no payment ever collected. The owner
    // assigns a real paid plan herself once the merchant actually pays
    // (DEPLOYMENT.md's manual-billing flow) — apps/admin's tenant panel,
    // same as upgrading anyone else.
    const testPlan = await prisma.plan.findUniqueOrThrow({ where: { key: "TEST" } });
    const tenant = await prisma.tenant.create({
      data: {
        name: storeName,
        slug: `${hostname}-${Date.now().toString(36)}`,
        planId: testPlan.id,
        trialGrantedAt: new Date(),
      },
    });
    // Registration immediately hands back a token (below) — the owner is
    // logged in from this moment on, even though she never separately
    // hit /auth/login. lastLoginAt used to stay null until she did,
    // which showed as "never logged in" on her own Team row (merchant
    // report: "how have I not logged in if I'm sitting on this account
    // right now") — set it here too, for the same reason /auth/login
    // sets it on a normal login.
    const user = await prisma.user.create({
      data: { tenantId: tenant.id, email: email.toLowerCase(), passwordHash, role: "OWNER", lastLoginAt: new Date() },
    });
    const store = await prisma.store.create({
      data: {
        tenantId: tenant.id,
        name: storeName,
        storeUrl,
        platformType: "GENERIC",
        status: "ACTIVE",
        allowedDomains: [hostname],
      },
    });
    await prisma.apiKey.create({
      data: { tenantId: tenant.id, storeId: store.id, label: "Default", hashedKey: hashApiKey(rawApiKey) },
    });
    await prisma.auditLog.create({
      data: { tenantId: tenant.id, actorUserId: user.id, action: "tenant.registered", targetType: "Store", targetId: store.id },
    });

    const token = signMerchantToken({ userId: user.id, tenantId: tenant.id });
    return reply.code(201).send({
      token,
      store: { id: store.id, name: store.name, storeUrl: store.storeUrl, allowedDomains: store.allowedDomains },
      apiKey: rawApiKey, // shown once — only a hash is persisted
    });
  });

  app.post("/api/v1/auth/login", async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid request body" });
    const { email, password } = parsed.data;

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      return reply.code(401).send({ error: "Invalid email or password" });
    }

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    const token = signMerchantToken({ userId: user.id, tenantId: user.tenantId });
    return reply.send({ token });
  });

  // ── Manual, relayed password reset — see the schema comment on
  // PasswordResetCode for why there's no email step here. ───────────────
  app.post("/api/v1/auth/forgot-password", async (request, reply) => {
    const parsed = forgotPasswordSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid request body" });

    const user = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
    // Always the same response whether or not the email exists — this
    // endpoint is public and unauthenticated, so confirming an account's
    // existence here would be a real (if minor) leak. The dashboard's
    // "enter the code" screen is what actually tells the shopper anything
    // useful, and only once she's relayed a real code to them.
    if (user) {
      // One live code per user — a second request supersedes the first
      // rather than leaving both valid, so the code the owner reads off
      // apps/admin is always the current one.
      await prisma.passwordResetCode.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } });
      await prisma.passwordResetCode.create({
        data: {
          userId: user.id,
          code: String(randomInt(100000, 1000000)), // 6 digits, zero-padded by range not string-padding
          expiresAt: new Date(Date.now() + RESET_CODE_TTL_MS),
        },
      });
    }
    return reply.send({ ok: true });
  });

  app.post("/api/v1/auth/verify-reset-code", async (request, reply) => {
    const parsed = verifyResetCodeSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid request body" });
    const { email, code } = parsed.data;

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    const genericError = { error: "Invalid or expired code" };
    if (!user) return reply.code(400).send(genericError);

    const resetCode = await prisma.passwordResetCode.findFirst({
      where: { userId: user.id, code, usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    });
    if (!resetCode) return reply.code(400).send(genericError);

    // Single-use: consumed the moment it's verified, not when the new
    // password is actually set. The short-lived resetToken below is what
    // authorizes that next step instead, so this code can never be
    // replayed even if the "enter new password" screen is abandoned.
    await prisma.passwordResetCode.update({ where: { id: resetCode.id }, data: { usedAt: new Date() } });
    return reply.send({ resetToken: signPasswordResetToken(user.id) });
  });

  app.post("/api/v1/auth/reset-password", async (request, reply) => {
    const parsed = resetPasswordSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid request body", details: parsed.error.flatten() });

    const payload = verifyPasswordResetToken(parsed.data.resetToken);
    if (!payload) return reply.code(401).send({ error: "This reset link has expired — request a new code" });

    const passwordHash = await hashPassword(parsed.data.newPassword);
    const user = await prisma.user
      .update({ where: { id: payload.userId }, data: { passwordHash } })
      .catch(() => null); // the account could have been removed between the code step and here
    if (!user) return reply.code(404).send({ error: "Account not found" });

    await prisma.auditLog.create({
      data: { tenantId: user.tenantId, actorUserId: user.id, action: "user.password_reset", targetType: "User", targetId: user.id },
    });

    // Log the merchant straight in, same as register does — they just
    // proved ownership of the account via the code, no reason to make
    // them log in again with the password they just set.
    const token = signMerchantToken({ userId: user.id, tenantId: user.tenantId });
    return reply.send({ token });
  });

  app.get("/api/v1/auth/me", { preHandler: authenticateMerchant }, async (request, reply) => {
    const { userId, tenantId } = request.merchant!;
    const [user, tenant, stores] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId } }),
      prisma.tenant.findUnique({ where: { id: tenantId } }),
      prisma.store.findMany({ where: { tenantId } }),
    ]);
    if (!user || !tenant) return reply.code(404).send({ error: "Account not found" });

    return reply.send({
      user: { id: user.id, email: user.email, role: user.role },
      tenant: { id: tenant.id, name: tenant.name },
      stores: stores.map((s) => ({ id: s.id, name: s.name, storeUrl: s.storeUrl, status: s.status, allowedDomains: s.allowedDomains })),
    });
  });
}
