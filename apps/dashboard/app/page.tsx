"use client";

import { useEffect, useMemo, useState } from "react";
import { AuthGuard } from "./AuthGuard";
import { apiFetch } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { BarTrendChart, LineTrendChart } from "./charts";

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
  byDay: Record<string, number>;
  topProducts: { externalProductId: string; title: string; tryOns: number; orders: number; revenue: number }[];
}

interface BillingInfo {
  plan: { name: string; monthlyLimit: number } | null;
  usedThisMonth: number;
  topUpCredits: number;
}

interface BillingHistory {
  months: { month: string; tryOns: number }[];
}

/** Last 14 calendar days (oldest first) as { label: "08-15", value } from analytics' byDay map. */
function last14Days(byDay: Record<string, number>): { label: string; value: number }[] {
  const days = [];
  const now = new Date();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
    const iso = d.toISOString().slice(0, 10);
    days.push({ label: iso.slice(5), value: byDay[iso] ?? 0 });
  }
  return days;
}

const MONTH_FORMATTER = new Intl.DateTimeFormat("en", { month: "short" });
function monthLabel(value: string): string {
  const [year, month] = value.split("-").map(Number);
  return MONTH_FORMATTER.format(new Date(Date.UTC(year, month - 1, 1)));
}

function OverviewContent() {
  const { t } = useI18n();
  const [data, setData] = useState<Analytics | null>(null);
  const [billing, setBilling] = useState<BillingInfo | null>(null);
  const [history, setHistory] = useState<BillingHistory | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<Analytics>("/api/v1/analytics?period=30d")
      .then(setData)
      .catch((err) => setError(err.message));
    apiFetch<BillingInfo>("/api/v1/billing").then(setBilling).catch(() => {});
    apiFetch<BillingHistory>("/api/v1/billing/history").then(setHistory).catch(() => {});
  }, []);

  const dailyPoints = useMemo(() => (data ? last14Days(data.byDay) : []), [data]);
  const monthlyPoints = useMemo(
    () => history?.months.map((m) => ({ label: monthLabel(m.month), value: m.tryOns })) ?? [],
    [history]
  );

  if (error) return <div className="empty-state">{error}</div>;
  // Wait for all three — not just `data` — before rendering anything.
  // Each is its own fetch, so whichever loses the race used to pop its
  // section in above content that had already rendered (the billing
  // stat-grid at the top, the monthly charts further down), shifting the
  // whole page down a beat after first paint (product-reported: the top
  // panel "loads after" everything below it). Showing nothing until
  // every section actually has data to show renders the page complete
  // and stable on the first paint instead.
  if (!data || !billing || !history) return <div className="empty-state">{t("common.loading")}</div>;

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

      <div className="stat-grid" style={{ marginBottom: 20 }}>
        <div className="stat-card">
          <div className="label">{t("overview.currentPlan")}</div>
          <div className="value">{billing.plan?.name ?? "—"}</div>
        </div>
        <div className="stat-card">
          <div className="label">{t("overview.usedThisMonth")}</div>
          <div className="value">
            {billing.usedThisMonth}
            {billing.plan ? ` / ${billing.plan.monthlyLimit}` : ""}
          </div>
        </div>
        <div className="stat-card">
          <div className="label">{t("overview.creditsLeft")}</div>
          <div className="value">{billing.topUpCredits}</div>
        </div>
      </div>

      <div className="stat-grid">
        {stats.map((s) => (
          <div className="stat-card" key={s.label}>
            <div className="label">{s.label}</div>
            <div className="value">{s.value}</div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 20, marginBottom: 20 }}>
        <LineTrendChart title={t("overview.dailyTryOns")} points={dailyPoints} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
        <BarTrendChart title={t("overview.monthlyTryOns")} points={monthlyPoints} />
        <BarTrendChart title={t("overview.creditsUsage")} points={monthlyPoints} />
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
