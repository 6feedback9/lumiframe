"use client";

import { useEffect, useState } from "react";
import { AuthGuard } from "../AuthGuard";
import { apiFetch } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

interface FeedbackRow {
  id: string;
  productTitle: string | null;
  productImageUrl: string;
  resultUrl: string | null;
  feedback: "LIKE" | "DISLIKE" | null;
  createdAt: string;
}

type FilterValue = "ANY" | "LIKE" | "DISLIKE";

function FeedbackContent() {
  const { t } = useI18n();
  const [filter, setFilter] = useState<FilterValue>("ANY");
  const [items, setItems] = useState<FeedbackRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ items: FeedbackRow[] }>(`/api/v1/tryons?limit=100&feedback=${filter}`)
      .then((res) => setItems(res.items))
      .catch((err) => setError(err.message));
  }, [filter]);

  return (
    <>
      <div className="page-title">{t("feedback.title")}</div>
      <p style={{ fontSize: 13, color: "var(--mist)", marginBottom: 20, maxWidth: 560 }}>{t("feedback.desc")}</p>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <label style={{ fontSize: 12, color: "var(--mist-dim)" }}>{t("feedback.filter")}</label>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as FilterValue)}
          style={{
            padding: "9px 12px",
            borderRadius: 10,
            border: "1px solid var(--line-strong)",
            background: "rgba(255,255,255,0.05)",
            color: "var(--paper)",
            fontSize: 13,
          }}
        >
          <option value="ANY">{t("feedback.filterAll")}</option>
          <option value="LIKE">{t("feedback.filterLike")}</option>
          <option value="DISLIKE">{t("feedback.filterDislike")}</option>
        </select>
      </div>

      {error && <div className="empty-state">{error}</div>}
      <div className="panel">
        <table>
          <thead>
            <tr>
              <th>{t("feedback.product")}</th>
              <th>{t("feedback.result")}</th>
              <th>{t("feedback.rating")}</th>
              <th>{t("feedback.date")}</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && !error ? (
              <tr>
                <td colSpan={4} className="empty-state">
                  {t("feedback.empty")}
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id}>
                  <td>{item.productTitle ?? "—"}</td>
                  <td>{item.resultUrl ? <img className="thumb" src={item.resultUrl} alt="" /> : "—"}</td>
                  <td>{item.feedback === "LIKE" ? t("feedback.like") : item.feedback === "DISLIKE" ? t("feedback.dislike") : "—"}</td>
                  <td>{new Date(item.createdAt).toLocaleString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default function FeedbackPage() {
  return (
    <AuthGuard>
      <FeedbackContent />
    </AuthGuard>
  );
}
