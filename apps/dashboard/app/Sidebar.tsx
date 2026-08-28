"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { apiFetch, getToken } from "@/lib/api";
import { useI18n, type Locale } from "@/lib/i18n";

interface StoreInfo {
  name: string;
}

export function Sidebar() {
  const pathname = usePathname();
  const { t, locale, setLocale } = useI18n();
  const [storeName, setStoreName] = useState<string | null>(null);

  const hidden = pathname === "/login" || pathname === "/register";

  useEffect(() => {
    if (hidden || !getToken()) return;
    apiFetch<StoreInfo>("/api/v1/store")
      .then((store) => setStoreName(store.name))
      .catch(() => {
        // Not fatal — the sidebar just falls back to the platform name.
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
