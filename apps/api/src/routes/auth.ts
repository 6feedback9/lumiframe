import type { FastifyInstance } from "fastify";
import { prisma } from "../context";
import { hashPassword, verifyPassword } from "../auth/password";
import { generateApiKey, hashApiKey } from "../auth/apiKey";
import { signMerchantToken } from "../auth/jwt";
import { authenticateMerchant } from "../plugins/auth";
import { loginSchema, registerSchema } from "../schemas";

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

    // Every new tenant starts on Starter (packages/database/prisma —
    // seeded by migration). Not fatal if the Plan row is somehow missing
    // (e.g. a fresh DB that hasn't run the seed migration yet) — the
    // tenant just starts with planId null, same as before Plans existed.
    const starterPlan = await prisma.plan.findUnique({ where: { key: "STARTER" } });
    const tenant = await prisma.tenant.create({
      data: { name: storeName, slug: `${hostname}-${Date.now().toString(36)}`, planId: starterPlan?.id },
    });
    const user = await prisma.user.create({
      data: { tenantId: tenant.id, email: email.toLowerCase(), passwordHash, role: "OWNER" },
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
