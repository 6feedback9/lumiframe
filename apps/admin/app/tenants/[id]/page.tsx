"use client";

import { useEffect, useState } from "react";
import { AuthGuard } from "../../AuthGuard";
import { apiFetch } from "@/lib/api";

interface TenantDetail {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  stores: { id: string; name: string; storeUrl: string; status: string; allowedDomains: string[] }[];
  users: { id: string; email: string; role: string; lastLoginAt: string | null; createdAt: string }[];
  totalTryOns: number;
  totalUsageUnits: number;
  recentTryOns: { id: string; productTitle: string | null; status: string; createdAt: string }[];
}

function TenantDetailContent({ id }: { id: string }) {
  const [tenant, setTenant] = useState<TenantDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<TenantDetail>(`/api/v1/admin/tenants/${id}`)
      .then(setTenant)
      .catch((err) => setError(err.message));
  }, [id]);

  if (error) return <div className="empty-state">{error}</div>;
  if (!tenant) return <div className="empty-state">Loading…</div>;

  return (
    <>
      <a className="back-link" href="/">
        ← All tenants
      </a>
      <div className="page-title">{tenant.name}</div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="label">Try-ons (all time)</div>
          <div className="value">{tenant.totalTryOns}</div>
        </div>
        <div className="stat-card">
          <div className="label">Billable units</div>
          <div className="value">{tenant.totalUsageUnits}</div>
        </div>
        <div className="stat-card">
          <div className="label">Team members</div>
          <div className="value">{tenant.users.length}</div>
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 20 }}>
        <table>
          <thead>
            <tr>
              <th>Store</th>
              <th>URL</th>
              <th>Status</th>
              <th>Allowed domains</th>
            </tr>
          </thead>
          <tbody>
            {tenant.stores.map((s) => (
              <tr key={s.id}>
                <td>{s.name}</td>
                <td>{s.storeUrl}</td>
                <td>
                  <span className={`badge badge-${s.status.toLowerCase()}`}>{s.status}</span>
                </td>
                <td>{s.allowedDomains.join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="panel">
        <table>
          <thead>
            <tr>
              <th>Product</th>
              <th>Status</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {tenant.recentTryOns.length === 0 ? (
              <tr>
                <td colSpan={3} className="empty-state">
                  No try-ons yet.
                </td>
              </tr>
            ) : (
              tenant.recentTryOns.map((r) => (
                <tr key={r.id}>
                  <td>{r.productTitle ?? "—"}</td>
                  <td>
                    <span className={`badge badge-${r.status.toLowerCase()}`}>{r.status}</span>
                  </td>
                  <td>{new Date(r.createdAt).toLocaleString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default function TenantDetailPage({ params }: { params: { id: string } }) {
  return (
    <AuthGuard>
      <TenantDetailContent id={params.id} />
    </AuthGuard>
  );
}
