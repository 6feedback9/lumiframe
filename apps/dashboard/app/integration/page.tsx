"use client";

import { useEffect, useState } from "react";
import { AuthGuard } from "../AuthGuard";
import { IntegrationSnippet } from "../IntegrationSnippet";
import { apiFetch } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { WidgetConfig } from "@/lib/snippet";

interface StoreInfo {
  id: string;
  name: string;
  storeUrl: string;
  status: string;
  allowedDomains: string[];
  widgetConfig?: WidgetConfig;
}

function IntegrationContent() {
  const { t } = useI18n();
  const [store, setStore] = useState<StoreInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<StoreInfo>("/api/v1/store").then(setStore).catch((err) => setError(err.message));
  }, []);

  if (error) return <div className="empty-state">{error}</div>;
  if (!store) return <div className="empty-state">{t("common.loading")}</div>;

  return (
    <>
      <div className="page-title">{t("integration.title")}</div>

      <div className="panel" style={{ padding: 24, marginBottom: 20, maxWidth: 640 }}>
        <h3 style={{ margin: "0 0 4px", fontSize: 15 }}>{t("integration.snippetTitle")}</h3>
        <p style={{ fontSize: 12, color: "var(--mist)", marginBottom: 14 }}>{t("integration.snippetDesc")}</p>
        <IntegrationSnippet storeId={store.id} widgetConfig={store.widgetConfig} />
      </div>

      <div className="panel" style={{ padding: 24, maxWidth: 640 }}>
        <h3 style={{ margin: "0 0 4px", fontSize: 15 }}>{t("integration.domainsTitle")}</h3>
        <p style={{ fontSize: 12, color: "var(--mist)", marginBottom: 14 }}>{t("integration.domainsDesc")}</p>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
          {store.allowedDomains.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      </div>
    </>
  );
}

export default function IntegrationPage() {
  return (
    <AuthGuard>
      <IntegrationContent />
    </AuthGuard>
  );
}
