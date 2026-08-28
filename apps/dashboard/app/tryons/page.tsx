"use client";

import { useEffect, useMemo, useState } from "react";
import { AuthGuard } from "../AuthGuard";
import { apiFetch } from "@/lib/api";

interface TryOnRow {
  id: string;
  productTitle: string | null;
  productImageUrl: string;
  status: string;
  errorCode: string | null;
  errorMessage: string | null;
  generationDurationMs: number | null;
  utmSource: string | null;
  utmCampaign: string | null;
  createdAt: string;
}

function badgeClass(status: string): string {
  return `badge badge-${status.toLowerCase()}`;
}

const MONTH_FORMATTER = new Intl.DateTimeFormat("en", { month: "long", year: "numeric" });

/** Last 12 months (this one first), as { value: "2026-08", label: "August 2026" }. */
function recentMonths(count = 12): { value: string; label: string }[] {
  const months = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const value = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    months.push({ value, label: MONTH_FORMATTER.format(d) });
  }
  return months;
}

/** "2026-08" -> the UTC instants bounding that month, for the API's from/to. */
function monthRange(value: string): { from: string; to: string } {
  const [year, month] = value.split("-").map(Number);
  const from = new Date(Date.UTC(year, month - 1, 1));
  const to = new Date(Date.UTC(year, month, 1));
  return { from: from.toISOString(), to: to.toISOString() };
}

function TryOnsContent() {
  const [items, setItems] = useState<TryOnRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [month, setMonth] = useState(""); // "" = all time
  const [error, setError] = useState<string | null>(null);
  const limit = 10;
  const monthOptions = useMemo(() => recentMonths(), []);

  useEffect(() => {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (month) {
      const { from, to } = monthRange(month);
      params.set("from", from);
      params.set("to", to);
    }
    apiFetch<{ items: TryOnRow[]; total: number }>(`/api/v1/tryons?${params.toString()}`)
      .then((res) => {
        setItems(res.items);
        setTotal(res.total);
      })
      .catch((err) => setError(err.message));
  }, [page, month]);

  return (
    <>
      <div className="page-title">Try-ons</div>

      <div style={{ marginBottom: 16 }}>
        <select
          value={month}
          onChange={(e) => {
            setMonth(e.target.value);
            setPage(1);
          }}
          style={{
            padding: "9px 12px",
            borderRadius: 10,
            border: "1px solid var(--line-strong)",
            background: "rgba(173,201,255,0.05)",
            color: "var(--paper)",
            fontSize: 13,
            fontFamily: "inherit",
          }}
        >
          <option value="">All time</option>
          {monthOptions.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </div>

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
                  {month ? "No try-ons in this month." : "No try-ons yet."}
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
                    {item.status === "FAILED" && (item.errorMessage || item.errorCode) && (
                      <div
                        title={item.errorMessage ?? undefined}
                        style={{
                          fontSize: 11,
                          color: "var(--danger, #ff6b6b)",
                          marginTop: 4,
                          maxWidth: 240,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {item.errorCode ? `${item.errorCode}: ` : ""}
                        {item.errorMessage ?? ""}
                      </div>
                    )}
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
