"use client";

import { useEffect, useState } from "react";
import { AuthGuard } from "../AuthGuard";
import { IntegrationSnippet } from "../IntegrationSnippet";
import { apiFetch } from "@/lib/api";

interface StoreInfo {
  id: string;
  name: string;
  storeUrl: string;
  status: string;
  allowedDomains: string[];
}

function IntegrationContent() {
  const [store, setStore] = useState<StoreInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<StoreInfo>("/api/v1/store").then(setStore).catch((err) => setError(err.message));
  }, []);

  if (error) return <div className="empty-state">{error}</div>;
  if (!store) return <div className="empty-state">Loading…</div>;

  return (
    <>
      <div className="page-title">Integration</div>

      <div className="panel" style={{ padding: 24, marginBottom: 20, maxWidth: 640 }}>
        <h3 style={{ margin: "0 0 4px", fontSize: 15 }}>Embed snippet</h3>
        <p style={{ fontSize: 12, color: "var(--mist)", marginBottom: 14 }}>
          storeId is not secret — it&rsquo;s scoped by the allowed domains below and
          rate-limited, the same pattern Stripe/Shopify widgets use.
        </p>
        <IntegrationSnippet storeId={store.id} />
      </div>

      <div className="panel" style={{ padding: 24, maxWidth: 640 }}>
        <h3 style={{ margin: "0 0 4px", fontSize: 15 }}>Allowed domains</h3>
        <p style={{ fontSize: 12, color: "var(--mist)", marginBottom: 14 }}>
          The widget will only create try-ons for requests coming from — and
          product images hosted on — these domains.
        </p>
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
