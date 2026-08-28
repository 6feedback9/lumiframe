// A one-time free top-up a tenant can get before any plan is assigned.
// Every new tenant is granted this automatically at registration now
// (routes/auth.ts) — no plan assigned yet, TRIAL_CREDITS to try the
// product with. This function stays as the admin's manual fallback
// (POST /api/v1/admin/tenants/:id/trial) for the one case a fresh
// signup doesn't cover: a tenant that somehow doesn't have a trial yet
// (e.g. a pre-existing tenant from before the auto-grant, or one an
// admin reset back to plan-less). Kept as a domain function rather than
// inline in the admin route since the grant logic (guards + the actual
// update) doesn't belong to routing.

import { prisma } from "../context";

export const TRIAL_CREDITS = 5;

export class TrialGrantError extends Error {
  constructor(message: string, public readonly statusCode: number) {
    super(message);
  }
}

export async function grantTrial(tenantId: string): Promise<{ topUpCredits: number; trialGrantedAt: Date }> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) throw new TrialGrantError("Tenant not found", 404);
  if (tenant.planId) throw new TrialGrantError("A plan is already assigned — the trial is only for tenants with no plan yet", 409);
  if (tenant.trialGrantedAt) throw new TrialGrantError("Trial already granted", 409);

  const updated = await prisma.tenant.update({
    where: { id: tenantId },
    data: { topUpCredits: { increment: TRIAL_CREDITS }, trialGrantedAt: new Date() },
  });
  return { topUpCredits: updated.topUpCredits, trialGrantedAt: updated.trialGrantedAt! };
}
