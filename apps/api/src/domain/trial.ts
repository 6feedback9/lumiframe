// A one-time free top-up a tenant can get before any plan is assigned.
// Originally a merchant self-service action (POST /api/v1/billing/trial);
// product decision changed this to owner-granted only — the platform
// owner activates it herself from apps/admin for a specific client
// (POST /api/v1/admin/tenants/:id/trial), and the merchant dashboard no
// longer has a way to trigger it. Kept as a domain function rather than
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
