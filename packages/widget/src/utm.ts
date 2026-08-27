// ARCHITECTURE.md §10: captured once at session creation from whatever the
// current page URL carries. Persisting first-touch UTM across navigation
// (so it survives a customer landing on an ad, then browsing to another
// page before opening the widget) is a Phase 3 refinement — this reads the
// current URL only.

export interface UtmContext {
  source?: string;
  medium?: string;
  campaign?: string;
  term?: string;
  content?: string;
  gclid?: string;
  fbclid?: string;
  ttclid?: string;
}

export function readUtmFromLocation(): UtmContext | undefined {
  if (typeof window === "undefined") return undefined;
  const params = new URLSearchParams(window.location.search);
  const utm: UtmContext = {
    source: params.get("utm_source") ?? undefined,
    medium: params.get("utm_medium") ?? undefined,
    campaign: params.get("utm_campaign") ?? undefined,
    term: params.get("utm_term") ?? undefined,
    content: params.get("utm_content") ?? undefined,
    gclid: params.get("gclid") ?? undefined,
    fbclid: params.get("fbclid") ?? undefined,
    ttclid: params.get("ttclid") ?? undefined,
  };
  return Object.values(utm).some(Boolean) ? utm : undefined;
}

export function currentDevice(): "mobile" | "desktop" {
  if (typeof window === "undefined") return "desktop";
  return window.innerWidth <= 768 ? "mobile" : "desktop";
}
