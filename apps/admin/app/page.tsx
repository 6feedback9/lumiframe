"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthGuard } from "./AuthGuard";
import { apiFetch } from "@/lib/api";

interface Store {
  id: string;
  name: string;
  storeUrl: string;
  status: string;
  platformType: string;
}

interface Tenant {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  stores: Store[];
  totalTryOns: number;
  totalUsageUnits: number;
}

function TenantsContent() {
  const router = useRouter();
  const [tenants, setTenants] = useState<Tenant[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ tenants: Tenant[] }>("/api/v1/admin/tenants")
      .then((res) => setTenants(res.tenants))
      .catch((err) => setError(err.message));
  }, []);

  return (
    <>
      <div className="page-title">Tenants — every client on Lumi Frame</div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="label">Total tenants</div>
          <div className="value">{tenants?.length ?? "—"}</div>
        </div>
        <div className="stat-card">
          <div className="label">Total try-ons (all time)</div>
          <div className="value">{tenants?.reduce((s, t) => s + t.totalTryOns, 0) ?? "—"}</div>
        </div>
        <div className="stat-card">
          <div className="label">Total billable units</div>
          <div className="value">{tenants?.reduce((s, t) => s + t.totalUsageUnits, 0) ?? "—"}</div>
        </div>
      </div>

      {error && <div className="empty-state">{error}</div>}
      <div className="panel">
        <table>
          <thead>
            <tr>
              <th>Tenant</th>
              <th>Store</th>
              <th>Status</th>
              <th>Try-ons</th>
              <th>Usage units</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {tenants?.length === 0 && !error ? (
              <tr>
                <td colSpan={6} className="empty-state">
                  No tenants yet.
                </td>
              </tr>
            ) : (
              tenants?.map((t) => (
                <tr key={t.id} className="clickable" onClick={() => router.push(`/tenants/${t.id}`)}>
                  <td>{t.name}</td>
                  <td>{t.stores[0]?.storeUrl ?? "—"}</td>
                  <td>
                    <span className={`badge badge-${(t.stores[0]?.status ?? "pending").toLowerCase()}`}>
                      {t.stores[0]?.status ?? "—"}
                    </span>
                  </td>
                  <td>{t.totalTryOns}</td>
                  <td>{t.totalUsageUnits}</td>
                  <td>{new Date(t.createdAt).toLocaleDateString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default function TenantsPage() {
  return (
    <AuthGuard>
      <TenantsContent />
    </AuthGuard>
  );
}
