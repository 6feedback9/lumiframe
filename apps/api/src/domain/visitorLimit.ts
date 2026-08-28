// Whether a shopper may start one more try-on on a given store — the
// enforcement side of Store.maxTryOnsPerVisitor (product ask: a merchant
// can cap how many try-ons the same shopper gets, so one visitor can't
// hammer the store's monthly quota).
//
// Keyed by IP, not TryOnSession.visitorId — visitorId is a client-generated
// value the widget stores in the browser, so it resets the instant a
// shopper clears storage or opens a private window. IP is what actually
// survives that. It's an imperfect proxy too (shared networks, mobile
// carriers, VPNs can over- or under-count) but it's the practical signal
// available without asking shoppers to sign in.
//
// Lifetime count, not a rolling window — "one try-on per customer" is the
// product ask, not "N per day". A merchant who wants it reset just asks the
// platform owner, same as any other manual billing action today.

import { prisma } from "../context";

export async function checkVisitorLimit(storeId: string, maxTryOnsPerVisitor: number | null, visitorIp: string | undefined): Promise<boolean> {
  if (!maxTryOnsPerVisitor || !visitorIp) return true;

  const priorCount = await prisma.tryOnSession.count({
    where: { storeId, visitorIp },
  });
  return priorCount < maxTryOnsPerVisitor;
}
