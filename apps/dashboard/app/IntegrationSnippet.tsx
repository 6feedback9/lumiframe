"use client";

import { useState } from "react";
import { buildSnippet, type WidgetConfig } from "@/lib/snippet";
import { useI18n } from "@/lib/i18n";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

// Category-scoping example for a merchant whose store isn't eyewear-only.
// Not translated — Liquid keywords and the `product.type`/`tags` API stay
// the same regardless of dashboard locale; only the surrounding prose
// (integration.categoryHint*) is.
function categoryExample(snippet: string): string {
  return `{% if product.type == "Окуляри" or product.tags contains "eyewear" %}\n${snippet}\n{% endif %}`;
}

export function IntegrationSnippet({ storeId, widgetConfig }: { storeId: string; widgetConfig?: WidgetConfig }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const [showCategoryExample, setShowCategoryExample] = useState(false);

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

      {/* The widget has no idea what "eyewear" is — it just reacts to
          wherever this snippet physically sits on the page (product ask:
          "как присваивать эту примерку именно очкам? если у магазина
          несколько категорий товаров"). A store with only glasses needs
          nothing extra; a mixed-catalog store needs this wrapped in a
          category check, or the button shows up on every product. */}
      <div style={{ marginTop: 14, padding: 14, borderRadius: 10, background: "rgba(255,255,255,0.03)", border: "1px solid var(--line)" }}>
        <button
          type="button"
          onClick={() => setShowCategoryExample((v) => !v)}
          style={{
            background: "none",
            border: "none",
            padding: 0,
            color: "var(--sky)",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          {showCategoryExample ? "▾ " : "▸ "}
          {t("integration.categoryHintTitle")}
        </button>
        {showCategoryExample && (
          <>
            <p style={{ fontSize: 12, color: "var(--mist)", marginTop: 8, lineHeight: 1.6 }}>{t("integration.categoryHintDesc")}</p>
            <pre
              style={{
                background: "rgba(255,255,255,0.05)",
                border: "1px solid var(--line)",
                borderRadius: 10,
                padding: 14,
                fontSize: 11.5,
                overflowX: "auto",
                color: "var(--paper)",
                marginTop: 8,
              }}
            >
              {categoryExample(snippet)}
            </pre>
          </>
        )}
      </div>
    </div>
  );
}
