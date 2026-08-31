"use client";

import { useI18n, type Locale } from "@/lib/i18n";

/** A small corner language toggle for pages the Sidebar doesn't render on (login). */
export function LocaleToggle() {
  const { locale, setLocale } = useI18n();

  return (
    <div style={{ position: "fixed", top: 20, right: 20, display: "flex", gap: 6, zIndex: 10 }}>
      {(["uk", "en"] as Locale[]).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setLocale(l)}
          style={{
            padding: "6px 12px",
            borderRadius: 8,
            border: "1px solid var(--line-strong)",
            background: locale === l ? "var(--sky)" : "rgba(255,255,255,0.05)",
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
  );
}
