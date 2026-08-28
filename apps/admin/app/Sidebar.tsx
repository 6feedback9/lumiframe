"use client";

import { usePathname } from "next/navigation";
import { useI18n, type Locale } from "@/lib/i18n";

export function Sidebar() {
  const pathname = usePathname();
  const { t, locale, setLocale } = useI18n();
  if (pathname === "/login") return null;

  return (
    <aside className="sidebar">
      <div className="logo">
        <span className="mark">Ú</span>
        <span>
          <span className="word">Lumi Frame</span>
          <span className="tag">{t("nav.tag")}</span>
        </span>
      </div>
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
      <div style={{ marginTop: "auto", padding: "16px 20px", display: "flex", gap: 6 }}>
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
    </aside>
  );
}
