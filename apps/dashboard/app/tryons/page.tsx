"use client";

import { useEffect, useState } from "react";
import { AuthGuard } from "../AuthGuard";
import { apiFetch } from "@/lib/api";

interface TryOnRow {
  id: string;
  productTitle: string | null;
  productImageUrl: string;
  status: string;
  generationDurationMs: number | null;
  utmSource: string | null;
  utmCampaign: string | null;
  createdAt: string;
}

function badgeClass(status: string): string {
  return `badge badge-${status.toLowerCase()}`;
}

function TryOnsContent() {
  const [items, setItems] = useState<TryOnRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const limit = 10;

  useEffect(() => {
    apiFetch<{ items: TryOnRow[]; total: number }>(`/api/v1/tryons?page=${page}&limit=${limit}`)
      .then((res) => {
        setItems(res.items);
        setTotal(res.total);
      })
      .catch((err) => setError(err.message));
  }, [page]);

  return (
    <>
      <div className="page-title">Try-ons</div>
      {error && <div className="empty-state">{error}</div>}
      <div className="panel">
        <table>
          <thead>
            <tr>
              <th>Image</th>
              <th>Product</th>
              <th>Status</th>
              <th>Duration</th>
              <th>UTM</th>
              <th>Created At</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && !error ? (
              <tr>
                <td colSpan={6} className="empty-state">
                  No try-ons yet.
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <img className="thumb" src={item.productImageUrl} alt="" />
                  </td>
                  <td>{item.productTitle ?? "—"}</td>
                  <td>
                    <span className={badgeClass(item.status)}>{item.status}</span>
                  </td>
                  <td>{item.generationDurationMs ? `${(item.generationDurationMs / 1000).toFixed(1)}s` : "—"}</td>
                  <td>{item.utmSource ? `${item.utmSource}${item.utmCampaign ? ` / ${item.utmCampaign}` : ""}` : "—"}</td>
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
            Previous
          </button>
          <button
            className="btn"
            style={{ width: "auto", padding: "8px 14px" }}
            disabled={page * limit >= total}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
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
