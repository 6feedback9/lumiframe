"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthGuard } from "../AuthGuard";
import { apiFetch } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

interface TryOnRow {
  id: string;
  tenantId: string;
  tenantName: string;
  storeName: string;
  productTitle: string | null;
  productImageUrl: string;
  status: string;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
}

function badgeClass(status: string): string {
  return `badge badge-${status.toLowerCase()}`;
}

function TryOnsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tenantId = searchParams.get("tenantId");
  const { t } = useI18n();
  const [items, setItems] = useState<TryOnRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const limit = 20;

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

  return (
    <>
      <div className="page-title">{t("tryons.title")}</div>
      {error && <div className="empty-state">{error}</div>}
      <div className="panel">
        <table>
          <thead>
            <tr>
              <th></th>
              <th>{t("tryons.tenant")}</th>
              <th>{t("tryons.store")}</th>
              <th>{t("tryons.product")}</th>
              <th>{t("tryons.status")}</th>
              <th>{t("tryons.createdAt")}</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && !error ? (
              <tr>
                <td colSpan={6} className="empty-state">
                  {t("tryons.empty")}
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id} className="clickable" onClick={() => router.push(`/tryons/${item.id}`)}>
                  <td>
                    <img className="thumb" src={item.productImageUrl} alt="" />
                  </td>
                  <td>{item.tenantName}</td>
                  <td>{item.storeName}</td>
                  <td>{item.productTitle ?? "—"}</td>
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
