"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { apiFetch, getToken } from "@/lib/api";
import { useI18n, type Locale } from "@/lib/i18n";

interface StoreInfo {
  name: string;
}

// Just enough of GET /api/v1/billing to decide whether the trial CTA below
// the nav links should show, and in which state (product ask: the trial
// activation should be visible from anywhere in the app, not just found by
// digging into the Billing page).
interface BillingSummary {
  plan: { key: string } | null;
  trialAvailable: boolean;
  trialCredits: number;
}

export function Sidebar() {
  const pathname = usePathname();
  const { t, locale, setLocale } = useI18n();
  const [storeName, setStoreName] = useState<string | null>(null);
  const [billing, setBilling] = useState<BillingSummary | null>(null);
  const [activatingTrial, setActivatingTrial] = useState(false);
  const [trialToast, setTrialToast] = useState<string | null>(null);

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
        // Not fatal — the sidebar simply won't show the trial CTA.
      });
  }, [hidden]);

  async function activateTrial() {
    setActivatingTrial(true);
    try {
      await apiFetch("/api/v1/billing/trial", { method: "POST" });
      const fresh = await apiFetch<BillingSummary>("/api/v1/billing");
      setBilling(fresh);
      setTrialToast(t("billing.trialActivatedToast").replace("{count}", String(fresh.trialCredits)));
      setTimeout(() => setTrialToast(null), 4000);
    } catch {
      // Best-effort here — the Billing page itself is the authoritative
      // place to retry if this fails for some reason.
    } finally {
      setActivatingTrial(false);
    }
  }

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
      <div className="logo">
        <span className="mark">Ú</span>
        <span>
          <span className="word">{storeName ?? "Lumi Frame"}</span>
          <span className="tag">{t("nav.poweredBy")}</span>
        </span>
      </div>
      <nav>
        {links.map((link) => (
          <a key={link.href} href={link.href} className={pathname === link.href ? "active" : ""}>
            {link.label}
          </a>
        ))}
      </nav>
      {billing && !billing.plan && (
        <div style={{ padding: "0 20px 12px" }}>
          {billing.trialAvailable ? (
            <button
              type="button"
              onClick={activateTrial}
              disabled={activatingTrial}
              className="btn"
              style={{ width: "100%", padding: "9px 0", fontSize: 12 }}
            >
              {activatingTrial ? t("common.saving") : t("billing.startTrial")}
            </button>
          ) : (
            <button
              type="button"
              disabled
              className="btn"
              style={{ width: "100%", padding: "9px 0", fontSize: 12, opacity: 0.5, cursor: "default" }}
            >
              {t("billing.trialUsed")}
            </button>
          )}
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
      {trialToast && (
        <div
          style={{
            position: "fixed",
            left: 20,
            bottom: 20,
            zIndex: 500,
            maxWidth: 260,
            background: "var(--surface)",
            border: "1px solid var(--sky)",
            borderRadius: 12,
            padding: "12px 16px",
            fontSize: 12.5,
            color: "var(--paper)",
            lineHeight: 1.5,
            boxShadow: "0 12px 32px rgba(0,0,0,0.4)",
          }}
        >
          ✓ {trialToast}
        </div>
      )}
    </aside>
  );
}
