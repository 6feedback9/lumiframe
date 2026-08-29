"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthGuard } from "../AuthGuard";
import { openLightbox, PhotoLightbox } from "../PhotoLightbox";
import { apiFetch } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

interface TryOnRow {
  id: string;
  sessionId: string;
  tenantId: string;
  tenantName: string;
  storeName: string;
  productTitle: string | null;
  productImageUrl: string;
  customerImageUrl: string | null;
  resultUrl: string | null;
  status: string;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
}

interface TenantOption {
  id: string;
  name: string;
  stores: { storeUrl: string }[];
}

function badgeClass(status: string): string {
  return `badge badge-${status.toLowerCase()}`;
}

function TryOnsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tenantId = searchParams.get("tenantId") ?? "";
  const { t } = useI18n();
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [items, setItems] = useState<TryOnRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [zoomUrl, setZoomUrl] = useState<string | null>(null);
  const limit = 20;

  useEffect(() => {
    apiFetch<{ tenants: TenantOption[] }>("/api/v1/admin/tenants")
      .then((res) => setTenants(res.tenants))
      .catch(() => {
        // Non-fatal — the store selector just shows only "All stores".
      });
  }, []);

  useEffect(() => {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (tenantId) params.set("tenantId", tenantId);
    apiFetch<{ items: TryOnRow[]; total: number }>(`/api/v1/admin/tryons?${params.toString()}`)
      .then((res) => {
        setItems(res.items);
        setTotal(res.total);
      })
      .catch((err) => setError(err.message));
  }, [page, tenantId]);

  const selectedTenant = useMemo(() => tenants.find((tn) => tn.id === tenantId), [tenants, tenantId]);

  function selectTenant(next: string) {
    const params = new URLSearchParams();
    if (next) params.set("tenantId", next);
    router.push(`/tryons${params.toString() ? `?${params.toString()}` : ""}`);
    setPage(1);
  }

  return (
    <>
      <div className="page-title">{t("tryons.title")}</div>

      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16 }}>
        <label style={{ fontSize: 12, color: "var(--mist-dim)" }}>{t("tryons.selectStore")}</label>
        <select
          value={tenantId}
          onChange={(e) => selectTenant(e.target.value)}
          style={{
            padding: "9px 12px",
            borderRadius: 10,
            border: "1px solid var(--line-strong)",
            background: "rgba(173,201,255,0.05)",
            color: "var(--paper)",
            fontSize: 13,
            minWidth: 260,
          }}
        >
          <option value="">{t("common.allStores")}</option>
          {tenants.map((tn) => (
            <option key={tn.id} value={tn.id}>
              {tn.name} {tn.stores[0]?.storeUrl ? `— ${tn.stores[0].storeUrl}` : ""}
            </option>
          ))}
        </select>

        {tenantId && (
          <div className="stat-card" style={{ padding: "10px 20px" }}>
            <div className="label">
              {t("tryons.countLabel")}
              {selectedTenant ? ` — ${selectedTenant.name}` : ""}
            </div>
            <div className="value">{total}</div>
          </div>
        )}
      </div>

      {error && <div className="empty-state">{error}</div>}
      <div className="panel">
        <table>
          <thead>
            <tr>
              <th>{t("tryons.tenant")}</th>
              <th>{t("tryons.store")}</th>
              <th>{t("tryons.product")}</th>
              <th>{t("detail.customerPhoto")}</th>
              <th>{t("detail.productPhoto")}</th>
              <th>{t("detail.resultPhoto")}</th>
              <th>{t("tryons.status")}</th>
              <th>{t("tryons.createdAt")}</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && !error ? (
              <tr>
                <td colSpan={8} className="empty-state">
                  {t("tryons.empty")}
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id} className="clickable" onClick={() => router.push(`/tryons/${item.sessionId}`)}>
                  <td>{item.tenantName}</td>
                  <td>{item.storeName}</td>
                  <td>{item.productTitle ?? "—"}</td>
                  <td>
                    {item.customerImageUrl ? (
                      <img className="thumb" src={item.customerImageUrl} alt="" style={{ cursor: "zoom-in" }} onClick={openLightbox(setZoomUrl, item.customerImageUrl)} />
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    <img className="thumb" src={item.productImageUrl} alt="" style={{ cursor: "zoom-in" }} onClick={openLightbox(setZoomUrl, item.productImageUrl)} />
                  </td>
                  <td>
                    {item.resultUrl ? (
                      <img className="thumb" src={item.resultUrl} alt="" style={{ cursor: "zoom-in" }} onClick={openLightbox(setZoomUrl, item.resultUrl)} />
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    <span className={badgeClass(item.status)}>{item.status}</span>
                  </td>
                  <td>{new Date(item.createdAt).toLocaleString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {total > limit && (
        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button className="btn" style={{ width: "auto", padding: "8px 14px" }} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            {t("common.previous")}
          </button>
          <button
            className="btn"
            style={{ width: "auto", padding: "8px 14px" }}
            disabled={page * limit >= total}
            onClick={() => setPage((p) => p + 1)}
          >
            {t("common.next")}
          </button>
        </div>
      )}

      {zoomUrl && <PhotoLightbox url={zoomUrl} onClose={() => setZoomUrl(null)} />}
    </>
  );
}

export default function TryOnsPage() {
  return (
    <AuthGuard>
      <TryOnsContent />
    </AuthGuard>
  );
}
