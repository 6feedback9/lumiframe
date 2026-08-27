"use client";

import { useEffect, useState } from "react";
import { AuthGuard } from "./AuthGuard";
import { apiFetch } from "@/lib/api";

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
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<Analytics>("/api/v1/analytics?period=30d")
      .then(setData)
      .catch((err) => setError(err.message));
  }, []);

  if (error) return <div className="empty-state">{error}</div>;
  if (!data) return <div className="empty-state">Loading…</div>;

  const stats = [
    { label: "Try-ons (30d)", value: data.totalTryOns },
    { label: "Unique visitors", value: data.uniqueVisitors },
    { label: "Completed", value: data.completed },
    { label: "Failed", value: data.failed },
    { label: "Add to cart", value: data.addToCart },
    { label: "Orders", value: data.orders },
    { label: "Conversion rate", value: `${data.conversionRate}%` },
    { label: "Revenue attributed", value: data.revenue },
  ];

  return (
    <>
      <div className="page-title">Overview</div>
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
              <th>Product</th>
              <th>Try-ons</th>
              <th>Orders</th>
              <th>Revenue</th>
            </tr>
          </thead>
          <tbody>
            {data.topProducts.length === 0 ? (
              <tr>
                <td colSpan={4} className="empty-state">
                  No try-ons yet.
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
