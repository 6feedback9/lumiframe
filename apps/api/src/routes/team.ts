// Team management for a merchant's own account (product ask: "у клиентов
// возможность добавлять юзеров, давать доступы"). Deliberately simple —
// no invite emails yet (no email-sending infra exists), the owner just
// sets the new teammate's password directly and shares it with them, the
// same self-serve pattern as registration itself.

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../context";
import { hashPassword } from "../auth/password";
import { authenticateMerchant } from "../plugins/auth";

const addUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(["OWNER", "ADMIN", "MEMBER"]).default("MEMBER"),
});

export async function teamRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/team", { preHandler: authenticateMerchant }, async (request, reply) => {
    const { tenantId } = request.merchant!;
    const users = await prisma.user.findMany({
      where: { tenantId },
      orderBy: { createdAt: "asc" },
      select: { id: true, email: true, role: true, lastLoginAt: true, createdAt: true },
    });
    return reply.send({ users });
  });

  app.post("/api/v1/team", { preHandler: authenticateMerchant }, async (request, reply) => {
    const parsed = addUserSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid request body", details: parsed.error.flatten() });

    const { tenantId, userId } = request.merchant!;
    const existing = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
    if (existing) return reply.code(409).send({ error: "An account with this email already exists" });

    const passwordHash = await hashPassword(parsed.data.password);
    const user = await prisma.user.create({
      data: { tenantId, email: parsed.data.email.toLowerCase(), passwordHash, role: parsed.data.role },
    });
    await prisma.auditLog.create({
      data: { tenantId, actorUserId: userId, action: "user.created", targetType: "User", targetId: user.id },
    });
    return reply.code(201).send({ id: user.id, email: user.email, role: user.role, createdAt: user.createdAt });
  });

  app.delete("/api/v1/team/:userId", { preHandler: authenticateMerchant }, async (request, reply) => {
    const { tenantId, userId: actorId } = request.merchant!;
    const { userId } = request.params as { userId: string };

    if (userId === actorId) return reply.code(400).send({ error: "You can't remove your own account" });

    const target = await prisma.user.findFirst({ where: { id: userId, tenantId } });
    if (!target) return reply.code(404).send({ error: "User not found on this account" });

    await prisma.user.delete({ where: { id: userId } });
    await prisma.auditLog.create({
      data: { tenantId, actorUserId: actorId, action: "user.removed", targetType: "User", targetId: userId },
    });
    return reply.send({ ok: true });
  });
}
