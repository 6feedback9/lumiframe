"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { clearToken } from "@/lib/api";
import { useI18n, type Locale } from "@/lib/i18n";

export function Sidebar() {
  const pathname = usePathname();
  const { t, locale, setLocale } = useI18n();
  // Mobile only (<760px, see globals.css) — the sidebar becomes an
  // off-canvas drawer instead of an always-visible column, toggled from
  // the fixed top bar's hamburger button. Desktop ignores this entirely
  // (the CSS that positions/hides the drawer is itself inside the mobile
  // media query), so it's harmless dead state above that width. Ported
  // from apps/dashboard's Sidebar, minus the store-name/billing-badge
  // bits that don't apply to the platform owner's own panel.
  const [mobileOpen, setMobileOpen] = useState(false);

  // Nav links are plain <a href> (full page loads, not next/link), which
  // already tears the drawer state down on every navigation. This just
  // covers the same-page case (e.g. back/forward cache) so a stale-open
  // drawer never survives a route change.
  useEffect(() => setMobileOpen(false), [pathname]);

  // Same lock the widget's own backdrop uses (packages/widget/src/index.ts)
  // — without it, a swipe on the dimmed page behind the open drawer still
  // scrolls the real content underneath.
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  if (pathname === "/login") return null;

  return (
    <>
      <header className="mobile-topbar">
        <button type="button" className="mobile-burger" aria-label={t("nav.openMenu")} onClick={() => setMobileOpen(true)}>
          <span className="bars" />
        </button>
        <a href="/" className="logo">
          <span className="mark">
            <img src="/logo-mark.png" alt="" width={16} height={16} />
          </span>
          <span className="word">Lumi Frame</span>
        </a>
        <span style={{ width: 36 }} aria-hidden="true" />
      </header>

      <div className={`sidebar-backdrop${mobileOpen ? " open" : ""}`} onClick={() => setMobileOpen(false)} />

      <aside className={`sidebar${mobileOpen ? " open" : ""}`}>
        <a href="/" className="logo">
          <span className="mark">
            <img src="/logo-mark.png" alt="" width={18} height={18} />
          </span>
          <span>
            <span className="word">Lumi Frame</span>
            <span className="tag">{t("nav.tag")}</span>
          </span>
        </a>
        <nav>
          <a href="/" className={pathname === "/" || pathname.startsWith("/tenants") ? "active" : ""}>
            {t("nav.tenants")}
          </a>
          <a href="/tryons" className={pathname.startsWith("/tryons") ? "active" : ""}>
            {t("nav.tryons")}
          </a>
          <a href="/feedback" className={pathname.startsWith("/feedback") ? "active" : ""}>
            {t("nav.feedback")}
          </a>
        </nav>
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
      </aside>
    </>
  );
}
