// Whether a tenant may run one more try-on generation this month — the
// enforcement side of Plans (packages/database/prisma/schema.prisma).
//
// Usage is counted from UsageRecord, which is only ever created once a
// generation actually COMPLETED (apps/api/src/worker/processTryOnJob.ts) —
// i.e. once real cost was actually incurred with the AI provider. A
// tenant's monthly quota resets on the calendar month; topUpCredits is a
// persistent balance on top of it that does not expire on its own, and is
// only ever added by an admin (DEPLOYMENT.md — billing is manual for now).

import { prisma } from "../context";

export interface EntitlementCheck {
  allowed: boolean;
  usedThisMonth: number;
  monthlyLimit: number;
  topUpCredits: number;
  /** True if this next generation, once completed, should draw from topUpCredits rather than the plan's monthly allowance. */
  willConsumeTopUp: boolean;
}

export function startOfCurrentMonthUtc(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export async function checkPlanEntitlement(tenantId: string): Promise<EntitlementCheck> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, include: { plan: true } });
  const monthlyLimit = tenant?.plan?.monthlyLimit ?? 0;
  const topUpCredits = tenant?.topUpCredits ?? 0;

  const usedThisMonth = await prisma.usageRecord.count({
    where: { tenantId, createdAt: { gte: startOfCurrentMonthUtc() } },
  });

  const withinPlan = usedThisMonth < monthlyLimit;
  const willConsumeTopUp = !withinPlan && topUpCredits > 0;

  return { allowed: withinPlan || willConsumeTopUp, usedThisMonth, monthlyLimit, topUpCredits, willConsumeTopUp };
}
