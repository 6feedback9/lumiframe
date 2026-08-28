"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthGuard } from "./AuthGuard";
import { apiFetch } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

interface Store {
  id: string;
  name: string;
  storeUrl: string;
  status: string;
  platformType: string;
}

interface Plan {
  key: string;
  name: string;
  monthlyLimit: number;
}

interface Tenant {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  stores: Store[];
  totalTryOns: number;
  totalUsageUnits: number;
  plan: Plan | null;
  usedThisMonth: number;
  topUpCredits: number;
  planRequestNote: string | null;
  planRequestedAt: string | null;
}

function TenantsContent() {
  const router = useRouter();
  const { t } = useI18n();
  const [tenants, setTenants] = useState<Tenant[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ tenants: Tenant[] }>("/api/v1/admin/tenants")
      .then((res) => setTenants(res.tenants))
      .catch((err) => setError(err.message));
  }, []);

  return (
    <>
      <div className="page-title">{t("tenants.title")}</div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="label">{t("tenants.total")}</div>
          <div className="value">{tenants?.length ?? "—"}</div>
        </div>
        <div className="stat-card">
          <div className="label">{t("tenants.totalTryOns")}</div>
          <div className="value">{tenants?.reduce((s, t) => s + t.totalTryOns, 0) ?? "—"}</div>
        </div>
        <div className="stat-card">
          <div className="label">{t("tenants.totalUnits")}</div>
          <div className="value">{tenants?.reduce((s, t) => s + t.totalUsageUnits, 0) ?? "—"}</div>
        </div>
      </div>

      {error && <div className="empty-state">{error}</div>}
      <div className="panel">
        <table>
          <thead>
            <tr>
              <th>{t("tenants.tenant")}</th>
              <th>{t("tenants.store")}</th>
              <th>{t("tenants.status")}</th>
              <th>{t("tenants.plan")}</th>
              <th>{t("tenants.usedThisMonth")}</th>
              <th>{t("tenants.topUp")}</th>
              <th>{t("tenants.created")}</th>
            </tr>
          </thead>
          <tbody>
            {tenants?.length === 0 && !error ? (
              <tr>
                <td colSpan={7} className="empty-state">
                  {t("tenants.empty")}
                </td>
              </tr>
            ) : (
              tenants?.map((tn) => (
                <tr key={tn.id} className="clickable" onClick={() => router.push(`/tenants/${tn.id}`)}>
                  <td>
                    {tn.name}
                    {tn.planRequestNote && (
                      <div style={{ fontSize: 11, color: "var(--sky)", marginTop: 2 }} title={tn.planRequestNote}>
                        ● {t("tenants.pendingRequest")}
                      </div>
                    )}
                  </td>
                  <td>{tn.stores[0]?.storeUrl ?? "—"}</td>
                  <td>
                    <span className={`badge badge-${(tn.stores[0]?.status ?? "pending").toLowerCase()}`}>
                      {tn.stores[0]?.status ?? "—"}
                    </span>
                  </td>
                  <td>{tn.plan ? tn.plan.name : <span style={{ color: "var(--danger, #ff6b6b)" }}>{t("tenants.noPlan")}</span>}</td>
                  <td>
                    {tn.usedThisMonth}
                    {tn.plan ? ` / ${tn.plan.monthlyLimit}` : ""}
                  </td>
                  <td>{tn.topUpCredits || "—"}</td>
                  <td>{new Date(tn.createdAt).toLocaleDateString()}</td>
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
