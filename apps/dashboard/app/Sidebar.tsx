"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { apiFetch, clearToken, getToken } from "@/lib/api";
import { useI18n, type Locale } from "@/lib/i18n";

interface StoreInfo {
  name: string;
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

  useEffect(() => {
    if (hidden || !getToken()) return;
    apiFetch<StoreInfo>("/api/v1/store")
      .then((store) => setStoreName(store.name))
      .catch(() => {
        // Not fatal — the sidebar just falls back to the platform name.
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
    { href: "/help", label: t("nav.help") },
  ];

  return (
    <aside className="sidebar">
      <a href="/" className="logo">
        <span className="mark">Ú</span>
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
