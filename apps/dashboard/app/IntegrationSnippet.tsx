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
    </div>
  );
}
