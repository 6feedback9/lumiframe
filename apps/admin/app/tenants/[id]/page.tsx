"use client";

import { useEffect, useState } from "react";
import { AuthGuard } from "../../AuthGuard";
import { apiFetch } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

interface Plan {
  id: string;
  key: string;
  name: string;
  monthlyLimit: number;
  priceUsd: number;
}

interface WidgetConfig {
  buttonText?: string;
  buttonColorStart?: string;
  buttonColorEnd?: string;
  buttonTextColor?: string;
  buttonFont?: string;
  buttonGlow?: boolean;
}

interface TenantDetail {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  stores: { id: string; name: string; storeUrl: string; status: string; allowedDomains: string[]; widgetConfig?: WidgetConfig }[];
  users: { id: string; email: string; role: string; lastLoginAt: string | null; createdAt: string }[];
  totalTryOns: number;
  totalUsageUnits: number;
  usedThisMonth: number;
  topUpCredits: number;
  plan: Plan | null;
  planRequestNote: string | null;
  planRequestedAt: string | null;
  recentTryOns: { id: string; productTitle: string | null; status: string; createdAt: string }[];
}

function BillingPanel({ id, tenant, plans, onUpdated }: { id: string; tenant: TenantDetail; plans: Plan[]; onUpdated: () => void }) {
  const { t } = useI18n();
  const [savingPlan, setSavingPlan] = useState(false);
  const [creditsInput, setCreditsInput] = useState("");
  const [savingCredits, setSavingCredits] = useState(false);

  async function changePlan(planId: string) {
    setSavingPlan(true);
    try {
      await apiFetch(`/api/v1/admin/tenants/${id}/plan`, { method: "PATCH", body: JSON.stringify({ planId: planId || null }) });
      onUpdated();
    } finally {
      setSavingPlan(false);
    }
  }

  async function addCredits() {
    const amount = Number(creditsInput);
    if (!Number.isFinite(amount) || amount === 0) return;
    setSavingCredits(true);
    try {
      await apiFetch(`/api/v1/admin/tenants/${id}/topup`, { method: "POST", body: JSON.stringify({ addCredits: amount }) });
      setCreditsInput("");
      onUpdated();
    } finally {
      setSavingCredits(false);
    }
  }

  return (
    <div className="panel" style={{ padding: 24, marginBottom: 20, maxWidth: 640 }}>
      <h3 style={{ margin: "0 0 14px", fontSize: 15 }}>{t("tenantDetail.billingTitle")}</h3>

      {tenant.planRequestNote && (
        <div
          style={{
            background: "rgba(115,183,255,0.08)",
            border: "1px solid var(--sky)",
            borderRadius: 10,
            padding: 12,
            fontSize: 12,
            marginBottom: 16,
          }}
        >
          <strong>{t("tenantDetail.pendingRequestTitle")}</strong>
          <div style={{ marginTop: 4, color: "var(--mist)" }}>{tenant.planRequestNote}</div>
          {tenant.planRequestedAt && (
            <div style={{ marginTop: 4, color: "var(--mist-dim)" }}>{new Date(tenant.planRequestedAt).toLocaleString()}</div>
          )}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div className="field">
          <label>{t("tenantDetail.assignPlan")}</label>
          <select
            value={tenant.plan?.id ?? ""}
            disabled={savingPlan}
            onChange={(e) => changePlan(e.target.value)}
            style={{
              width: "100%",
              padding: "9px 12px",
              borderRadius: 10,
              border: "1px solid var(--line-strong)",
              background: "rgba(173,201,255,0.05)",
              color: "var(--paper)",
              fontSize: 13,
            }}
          >
            <option value="">{t("tenantDetail.noPlan")}</option>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.monthlyLimit}/mo, ${p.priceUsd})
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label>{t("tenantDetail.addCredits")}</label>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="number"
              value={creditsInput}
              onChange={(e) => setCreditsInput(e.target.value)}
              placeholder={t("tenantDetail.addCreditsPlaceholder")}
            />
            <button className="btn" style={{ width: "auto", padding: "9px 14px" }} disabled={savingCredits} onClick={addCredits}>
              {savingCredits ? t("common.saving") : t("common.save")}
            </button>
          </div>
        </div>
      </div>

      <p style={{ fontSize: 12, color: "var(--mist)", marginTop: 16 }}>
        {t("tenantDetail.usedThisMonth")}: {tenant.usedThisMonth}
        {tenant.plan ? ` / ${tenant.plan.monthlyLimit}` : ""} · {t("tenantDetail.topUpCredits")}: {tenant.topUpCredits}
      </p>
    </div>
  );
}

const FONT_OPTIONS = [
  { value: "", label: "buttonDesign.fontDefault" },
  { value: "'Manrope', sans-serif", label: "Manrope" },
  { value: "'Inter', sans-serif", label: "Inter" },
  { value: "'Poppins', sans-serif", label: "Poppins" },
  { value: "Georgia, serif", label: "Georgia" },
] as const;

const WIDGET_CONFIG_DEFAULTS: Required<Pick<WidgetConfig, "buttonText" | "buttonColorStart" | "buttonColorEnd" | "buttonTextColor">> = {
  buttonText: "Try on",
  buttonColorStart: "#73b7ff",
  buttonColorEnd: "#9f8cff",
  buttonTextColor: "#ffffff",
};

/** Lets the platform owner edit a client's "Try on" button design directly, without needing the merchant's own dashboard (product ask: make changes to a client's store from my own console). */
function ButtonDesignPanel({ id, tenant, onUpdated }: { id: string; tenant: TenantDetail; onUpdated: () => void }) {
  const { t } = useI18n();
  const store = tenant.stores[0];
  const [config, setConfig] = useState<WidgetConfig>({ ...WIDGET_CONFIG_DEFAULTS, ...store?.widgetConfig });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setConfig({ ...WIDGET_CONFIG_DEFAULTS, ...store?.widgetConfig });
  }, [store?.widgetConfig]);

  if (!store) return null;

  async function save() {
    setSaving(true);
    setSaved(false);
    try {
      await apiFetch(`/api/v1/admin/tenants/${id}/widget-config`, { method: "PATCH", body: JSON.stringify(config) });
      setSaved(true);
      onUpdated();
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  }

  const previewStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0.75em 1.5em",
    border: "none",
    borderRadius: 999,
    background: `linear-gradient(135deg, ${config.buttonColorStart}, ${config.buttonColorEnd})`,
    color: config.buttonTextColor,
    fontFamily: config.buttonFont || "inherit",
    fontWeight: 600,
    fontSize: 15,
    boxShadow: config.buttonGlow ? `0 0 18px 2px ${config.buttonColorStart}` : "none",
  };

  return (
    <div className="panel" style={{ padding: 24, marginBottom: 20, maxWidth: 720 }}>
      <h3 style={{ margin: "0 0 14px", fontSize: 15 }}>{t("buttonDesign.title")}</h3>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <div>
          <div className="field" style={{ marginBottom: 12 }}>
            <label>{t("buttonDesign.label")}</label>
            <input value={config.buttonText ?? ""} onChange={(e) => setConfig({ ...config, buttonText: e.target.value })} maxLength={60} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div className="field">
              <label>{t("buttonDesign.color1")}</label>
              <input type="color" value={config.buttonColorStart} onChange={(e) => setConfig({ ...config, buttonColorStart: e.target.value })} style={{ height: 38, padding: 4 }} />
            </div>
            <div className="field">
              <label>{t("buttonDesign.color2")}</label>
              <input type="color" value={config.buttonColorEnd} onChange={(e) => setConfig({ ...config, buttonColorEnd: e.target.value })} style={{ height: 38, padding: 4 }} />
            </div>
          </div>
          <div className="field" style={{ marginBottom: 12 }}>
            <label>{t("buttonDesign.textColor")}</label>
            <input type="color" value={config.buttonTextColor} onChange={(e) => setConfig({ ...config, buttonTextColor: e.target.value })} style={{ height: 38, padding: 4 }} />
          </div>
          <div className="field" style={{ marginBottom: 12 }}>
            <label>{t("buttonDesign.font")}</label>
            <select
              value={config.buttonFont ?? ""}
              onChange={(e) => setConfig({ ...config, buttonFont: e.target.value || undefined })}
              style={{ width: "100%", padding: "9px 12px", borderRadius: 10, border: "1px solid var(--line-strong)", background: "rgba(173,201,255,0.05)", color: "var(--paper)", fontSize: 13 }}
            >
              {FONT_OPTIONS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.value ? f.label : t(f.label as "buttonDesign.fontDefault")}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 10, flexDirection: "row" }}>
            <input type="checkbox" id="admin-glow" checked={!!config.buttonGlow} onChange={(e) => setConfig({ ...config, buttonGlow: e.target.checked })} style={{ width: "auto" }} />
            <label htmlFor="admin-glow" style={{ margin: 0 }}>
              {t("buttonDesign.glow")}
            </label>
          </div>
          <button className="btn" style={{ width: "auto", padding: "9px 18px" }} disabled={saving} onClick={save}>
            {saving ? t("common.saving") : saved ? "✓" : t("common.save")}
          </button>
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--mist-dim)", marginBottom: 10, textTransform: "uppercase", letterSpacing: ".06em" }}>
            {t("buttonDesign.preview")}
          </div>
          <div style={{ padding: 32, borderRadius: 12, background: "rgba(173,201,255,0.03)", border: "1px solid var(--line)", display: "flex", justifyContent: "center" }}>
            <button type="button" style={previewStyle} disabled>
              {config.buttonText || "Try on"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TenantDetailContent({ id }: { id: string }) {
  const { t } = useI18n();
  const [tenant, setTenant] = useState<TenantDetail | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [error, setError] = useState<string | null>(null);

  function load() {
    Promise.all([apiFetch<TenantDetail>(`/api/v1/admin/tenants/${id}`), apiFetch<{ plans: Plan[] }>("/api/v1/admin/plans")])
      .then(([t, p]) => {
        setTenant(t);
        setPlans(p.plans);
      })
      .catch((err) => setError(err.message));
  }

  useEffect(load, [id]);

  if (error) return <div className="empty-state">{error}</div>;
  if (!tenant) return <div className="empty-state">{t("common.loading")}</div>;

  return (
    <>
      <a className="back-link" href="/">
        {t("tenants.back")}
      </a>
      <div className="page-title">{tenant.name}</div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="label">{t("tenantDetail.tryOnsAllTime")}</div>
          <div className="value">{tenant.totalTryOns}</div>
        </div>
        <div className="stat-card">
          <div className="label">{t("tenantDetail.billableUnits")}</div>
          <div className="value">{tenant.totalUsageUnits}</div>
        </div>
        <div className="stat-card">
          <div className="label">{t("tenantDetail.teamMembers")}</div>
          <div className="value">{tenant.users.length}</div>
        </div>
      </div>

      <BillingPanel id={id} tenant={tenant} plans={plans} onUpdated={load} />
      <ButtonDesignPanel id={id} tenant={tenant} onUpdated={load} />

      <div className="panel" style={{ marginBottom: 20 }}>
        <table>
          <thead>
            <tr>
              <th>{t("tenantDetail.store")}</th>
              <th>{t("tenantDetail.url")}</th>
              <th>{t("tenantDetail.status")}</th>
              <th>{t("tenantDetail.allowedDomains")}</th>
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
              <th>{t("tenantDetail.product")}</th>
              <th>{t("tenants.status")}</th>
              <th>{t("tenantDetail.created")}</th>
            </tr>
          </thead>
          <tbody>
            {tenant.recentTryOns.length === 0 ? (
              <tr>
                <td colSpan={3} className="empty-state">
                  {t("tenantDetail.empty")}
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
        <div style={{ padding: 16 }}>
          <a href={`/tryons?tenantId=${id}`} style={{ fontSize: 12, color: "var(--sky)" }}>
            {t("tenantDetail.viewAllTryOns")}
          </a>
        </div>
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
