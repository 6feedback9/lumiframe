"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { apiFetch, clearToken, getToken } from "@/lib/api";
import { useI18n, type Locale } from "@/lib/i18n";

// useState's initializer can't safely read localStorage — this page is
// statically pre-rendered (no window at build time), so reading it there
// would make the client's first render disagree with the pre-rendered
// HTML (a React hydration mismatch). useLayoutEffect below reads it
// instead: it still runs before the browser paints, so there's no visible
// flash, it just avoids claiming a browser-only value during SSR.
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

interface StoreInfo {
  name: string;
}

// Avoids the sidebar flashing "Lumi Frame" (the fallback) and then
// jumping to the real store name once GET /api/v1/store resolves, on
// every single page load — product-reported "скачет". The store's own
// name barely ever changes, so caching the last one we saw and using it
// as the initial render is correct almost all the time, and the effect
// below still fetches fresh and re-syncs the cache regardless.
const STORE_NAME_CACHE_KEY = "lumiframe_dashboard_storename";

function readCachedStoreName(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(STORE_NAME_CACHE_KEY);
  } catch {
    return null;
  }
}

function cacheStoreName(name: string): void {
  try {
    localStorage.setItem(STORE_NAME_CACHE_KEY, name);
  } catch {
    // Best-effort only — private browsing, storage disabled, whatever.
    // The sidebar still works, it just won't skip the flash next time.
  }
}

// Just enough of GET /api/v1/billing to show the trial-active badge below
// the nav links (product decision: activation is admin-only now — see
// apps/admin's tenant Billing panel — so this is a passive status
// indicator, not a button).
interface BillingSummary {
  trialActive: boolean;
}

export function Sidebar() {
  const pathname = usePathname();
  const { t, locale, setLocale } = useI18n();
  const [storeName, setStoreName] = useState<string | null>(null);
  const [billing, setBilling] = useState<BillingSummary | null>(null);

  const hidden = pathname === "/login" || pathname === "/register";

  // Before paint, not just "early": this runs synchronously right after
  // the DOM is updated but before the browser shows anything, so a
  // cache hit renders the real store name from the very first frame —
  // no "Lumi Frame" flash to jump away from (product-reported "скачет").
  useIsomorphicLayoutEffect(() => {
    const cached = readCachedStoreName();
    if (cached) setStoreName(cached);
  }, []);

  useEffect(() => {
    if (hidden || !getToken()) return;
    apiFetch<StoreInfo>("/api/v1/store")
      .then((store) => {
        setStoreName(store.name);
        cacheStoreName(store.name);
      })
      .catch(() => {
        // Not fatal — the sidebar just falls back to the platform name
        // (or the cached one, if there is one).
      });
    apiFetch<BillingSummary>("/api/v1/billing")
      .then(setBilling)
      .catch(() => {
        // Not fatal — the sidebar simply won't show the trial badge.
      });
  }, [hidden]);

  if (hidden) return null;

  const links = [
    { href: "/", label: t("nav.overview") },
    { href: "/tryons", label: t("nav.tryons") },
    { href: "/integration", label: t("nav.integration") },
    { href: "/feedback", label: t("nav.feedback") },
    { href: "/team", label: t("nav.team") },
    { href: "/billing", label: t("nav.billing") },
  ];

  return (
    <aside className="sidebar">
      <a href="/" className="logo">
        <span className="mark">
          <img src="/logo-mark.png" alt="" width={18} height={18} />
        </span>
        <span>
          <span className="word">{storeName ?? "Lumi Frame"}</span>
          <span className="tag">{t("nav.poweredBy")}</span>
        </span>
      </a>
      <nav>
        {links.map((link) => (
          <a key={link.href} href={link.href} className={pathname === link.href ? "active" : ""}>
            {link.label}
          </a>
        ))}
      </nav>
      {billing?.trialActive && (
        <div style={{ padding: "0 20px 12px", display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "#3ddc84",
              boxShadow: "0 0 0 rgba(61,220,132,0.6)",
              animation: "lumiframe-trial-pulse 1.8s ease-out infinite",
              flexShrink: 0,
            }}
          />
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--paper)" }}>{t("billing.trialActive")}</span>
        </div>
      )}
      <div style={{ padding: "12px 20px", display: "flex", gap: 6 }}>
        {(["uk", "en"] as Locale[]).map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => setLocale(l)}
            style={{
              flex: 1,
              padding: "6px 0",
              borderRadius: 8,
              border: "1px solid var(--line-strong)",
              background: locale === l ? "var(--sky)" : "transparent",
              color: locale === l ? "#0d1426" : "var(--mist)",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {l.toUpperCase()}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => {
          clearToken();
          window.location.href = "/login";
        }}
        style={{
          margin: "0 20px 20px",
          padding: "10px 0",
          borderRadius: 8,
          border: "1px solid var(--line-strong)",
          background: "transparent",
          color: "var(--mist)",
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        {t("nav.logout")}
      </button>
      <style>{`
        @keyframes lumiframe-trial-pulse {
          0% { box-shadow: 0 0 0 0 rgba(61,220,132,0.6); }
          70% { box-shadow: 0 0 0 7px rgba(61,220,132,0); }
          100% { box-shadow: 0 0 0 0 rgba(61,220,132,0); }
        }
      `}</style>
    </aside>
  );
}
