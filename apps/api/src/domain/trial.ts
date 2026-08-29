// A free top-up a tenant can get before any plan is assigned. Every new
// tenant is granted this automatically at registration now (routes/auth.ts)
// — no plan assigned yet, TRIAL_CREDITS to try the product with. This
// function is the admin's manual grant/re-grant (POST
// /api/v1/admin/tenants/:id/trial) — apps/admin's plan dropdown calls it
// whenever "Тестовий режим" is picked, which covers both a tenant that
// never had one (e.g. pre-existing from before the auto-grant) and one
// the owner wants to give another go after cancelling or using up the
// last one. Kept as a domain function rather than inline in the admin
// route since the grant logic (guards + the actual update) doesn't
// belong to routing.
//
// Guards against stacking on an *outstanding* balance (topUpCredits > 0),
// not against ever having had a trial before (trialGrantedAt, once set,
// is permanent — see the schema comment on Tenant.trialGrantedAt) —
// re-granting is exactly the point once a previous trial is spent or the
// owner cancelled it (see isTrialCancellation in routes/admin.ts).

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
  if (tenant.topUpCredits > 0) throw new TrialGrantError("This tenant already has an active trial balance", 409);

  const updated = await prisma.tenant.update({
    where: { id: tenantId },
    data: { topUpCredits: { increment: TRIAL_CREDITS }, trialGrantedAt: new Date() },
  });
  return { topUpCredits: updated.topUpCredits, trialGrantedAt: updated.trialGrantedAt! };
}
