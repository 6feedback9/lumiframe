"use client";

import { useState } from "react";
import { buildSnippet, type WidgetConfig } from "@/lib/snippet";
import { useI18n } from "@/lib/i18n";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export function IntegrationSnippet({ storeId, widgetConfig }: { storeId: string; widgetConfig?: WidgetConfig }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);

  const snippet = buildSnippet(storeId, API_BASE_URL, widgetConfig);

  async function copy() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable — the snippet is still selectable/copyable by hand
    }
  }

  return (
    <div>
      <pre
        style={{
          background: "rgba(255,255,255,0.05)",
          border: "1px solid var(--line)",
          borderRadius: 10,
          padding: 14,
          fontSize: 12,
          overflowX: "auto",
          color: "var(--paper)",
          margin: 0,
        }}
      >
        {snippet}
      </pre>
      <button type="button" className="btn" style={{ marginTop: 10 }} onClick={copy}>
        {copied ? t("common.copied") : t("common.copy")}
      </button>
      <p style={{ fontSize: 12, color: "var(--mist)", marginTop: 10, lineHeight: 1.6 }}>{t("integration.snippetHelp")}</p>

      {/* A Liquid-template-conditional alternative used to live here, for
          scoping the widget to just eyewear products at the theme-code
          level instead of via the "На яких товарах показувати кнопку"
          panel above. Removed outright (product ask: "убери его из
          программы и не путай ни меня ни людей") — it required editing
          Shopify's own code by hand and got exactly one real merchant
          stuck on a field mismatch (product.type vs. the product's title)
          that was genuinely hard to diagnose without reading the theme's
          source. The panel above is the one supported way to do this now,
          and matchesCategoryFilter() (packages/sdk) checks both a
          product's URL and its title, specifically so a merchant whose
          store has no distinguishing word in its URLs (a real report: a
          Shopify dev store's generic seed-data handles) can still scope
          by naming convention alone — no code, ever. */}
    </div>
  );
}
