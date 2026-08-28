"use client";

import { useEffect, useState } from "react";
import { AuthGuard } from "./AuthGuard";
import { apiFetch } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

interface Analytics {
  period: string;
  totalTryOns: number;
  uniqueVisitors: number;
  completed: number;
  failed: number;
  addToCart: number;
  orders: number;
  revenue: number;
  conversionRate: number;
  topProducts: { externalProductId: string; title: string; tryOns: number; orders: number; revenue: number }[];
}

function OverviewContent() {
  const { t } = useI18n();
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<Analytics>("/api/v1/analytics?period=30d")
      .then(setData)
      .catch((err) => setError(err.message));
  }, []);

  if (error) return <div className="empty-state">{error}</div>;
  if (!data) return <div className="empty-state">{t("common.loading")}</div>;

  const stats = [
    { label: t("overview.tryons30d"), value: data.totalTryOns },
    { label: t("overview.uniqueVisitors"), value: data.uniqueVisitors },
    { label: t("overview.completed"), value: data.completed },
    { label: t("overview.failed"), value: data.failed },
    { label: t("overview.addToCart"), value: data.addToCart },
    { label: t("overview.orders"), value: data.orders },
    { label: t("overview.conversionRate"), value: `${data.conversionRate}%` },
    { label: t("overview.revenue"), value: data.revenue },
  ];

  return (
    <>
      <div className="page-title">{t("overview.title")}</div>
      <div className="stat-grid">
        {stats.map((s) => (
          <div className="stat-card" key={s.label}>
            <div className="label">{s.label}</div>
            <div className="value">{s.value}</div>
          </div>
        ))}
      </div>

      <div className="panel">
        <table>
          <thead>
            <tr>
              <th>{t("overview.product")}</th>
              <th>{t("overview.tryOnsCol")}</th>
              <th>{t("overview.ordersCol")}</th>
              <th>{t("overview.revenueCol")}</th>
            </tr>
          </thead>
          <tbody>
            {data.topProducts.length === 0 ? (
              <tr>
                <td colSpan={4} className="empty-state">
                  {t("overview.empty")}
                </td>
              </tr>
            ) : (
              data.topProducts.map((p) => (
                <tr key={p.externalProductId}>
                  <td>{p.title}</td>
                  <td>{p.tryOns}</td>
                  <td>{p.orders}</td>
                  <td>{p.revenue}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default function OverviewPage() {
  return (
    <AuthGuard>
      <OverviewContent />
    </AuthGuard>
  );
}
