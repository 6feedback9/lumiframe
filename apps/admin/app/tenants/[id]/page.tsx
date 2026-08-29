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
  buttonStyle?: "gradient" | "solid" | "outline";
  /** Continuous scale, percent of the default size. 100 = default. */
  buttonSize?: number;
  /** Horizontal-only stretch on top of buttonSize. 100 = default (no stretch). */
  buttonWidth?: number;
  buttonShape?: "rounded" | "rectangular";
  buttonAnimation?: "none" | "pulse" | "shimmer";
  buttonPosition?: "before" | "after" | "floating";
  buttonAnchorSelector?: string;
  showTryAnotherButton?: boolean;
  showBackButton?: boolean;
  modalHeading?: string;
  modalSubheading?: string;
  modalAccentColorStart?: string;
  modalAccentColorEnd?: string;
  modalAccentTextColor?: string;
}

interface TenantUser {
  id: string;
  email: string;
  role: string;
  lastLoginAt: string | null;
  createdAt: string;
}

interface TenantDetail {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  stores: { id: string; name: string; storeUrl: string; status: string; allowedDomains: string[]; widgetConfig?: WidgetConfig }[];
  users: TenantUser[];
  totalTryOns: number;
  totalUsageUnits: number;
  usedThisMonth: number;
  topUpCredits: number;
  trialGrantedAt: string | null;
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
  const [planError, setPlanError] = useState<string | null>(null);

  // "Тест" (see PlanKey's schema comment) is a real Plan row now, not a
  // separate "no plan + topUpCredits" state with its own grant/cancel
  // machinery — it's just one more option in `plans` below (sortOrder 0,
  // so it lists first), assigned and cleared the exact same way as
  // Starter/Growth/Pro. This used to need a sentinel value, a separate
  // POST /trial call, and its own error/loading state to stay in sync
  // with the select; now it doesn't need any of that.
  async function changePlan(planId: string) {
    setSavingPlan(true);
    setPlanError(null);
    try {
      await apiFetch(`/api/v1/admin/tenants/${id}/plan`, { method: "PATCH", body: JSON.stringify({ planId: planId || null }) });
      onUpdated();
    } catch (err) {
      setPlanError((err as Error).message);
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
          {planError && <p style={{ fontSize: 12, color: "var(--danger, #ff6b6b)", marginTop: 6 }}>{planError}</p>}
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

const POSITION_OPTIONS = [
  { value: "after", label: "buttonDesign.positionAfter" },
  { value: "before", label: "buttonDesign.positionBefore" },
  { value: "floating", label: "buttonDesign.positionFloating" },
] as const;

const SHAPE_OPTIONS = [
  { value: "rounded", label: "buttonDesign.shapeRounded" },
  { value: "rectangular", label: "buttonDesign.shapeRectangular" },
] as const;

const WIDGET_CONFIG_DEFAULTS: Required<
  Pick<
    WidgetConfig,
    "buttonText" | "buttonColorStart" | "buttonColorEnd" | "buttonTextColor" | "buttonPosition" | "buttonSize" | "buttonWidth" | "buttonShape" | "showTryAnotherButton" | "showBackButton"
  >
> = {
  buttonText: "Try on",
  buttonColorStart: "#73b7ff",
  buttonColorEnd: "#9f8cff",
  buttonTextColor: "#ffffff",
  buttonPosition: "after",
  buttonSize: 100,
  buttonWidth: 100,
  buttonShape: "rounded",
  showTryAnotherButton: true,
  showBackButton: true,
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

  const sizeScale = (config.buttonSize ?? 100) / 100;
  const widthScale = (config.buttonWidth ?? 100) / 100;
  const isOutline = config.buttonStyle === "outline";
  const previewBackground = isOutline
    ? "transparent"
    : config.buttonStyle === "solid"
      ? config.buttonColorStart
      : `linear-gradient(135deg, ${config.buttonColorStart}, ${config.buttonColorEnd})`;
  const previewStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: `${0.75 * sizeScale}em ${1.5 * sizeScale * widthScale}em`,
    border: isOutline ? `2px solid ${config.buttonColorStart}` : "none",
    borderRadius: config.buttonShape === "rectangular" ? 8 : 999,
    background: previewBackground,
    color: isOutline ? config.buttonColorStart : config.buttonTextColor,
    fontFamily: config.buttonFont || "inherit",
    fontWeight: 600,
    fontSize: 15 * sizeScale,
    boxShadow: config.buttonGlow && (!config.buttonAnimation || config.buttonAnimation === "none") ? `0 0 18px 2px ${config.buttonColorStart}` : "none",
    animation: config.buttonAnimation === "pulse" ? "lumiframe-admin-preview-pulse 1.8s ease-out infinite" : undefined,
    position: "relative",
    overflow: config.buttonAnimation === "shimmer" ? "hidden" : undefined,
  };

  const selectStyle: React.CSSProperties = { width: "100%", padding: "9px 12px", borderRadius: 10, border: "1px solid var(--line-strong)", background: "rgba(173,201,255,0.05)", color: "var(--paper)", fontSize: 13 };

  return (
    <div className="panel" style={{ padding: 24, marginBottom: 20, maxWidth: 720 }}>
      <h3 style={{ margin: "0 0 14px", fontSize: 15 }}>{t("buttonDesign.title")}</h3>
      <style>{`
        @keyframes lumiframe-admin-preview-pulse {
          0% { box-shadow: 0 0 0 0 ${config.buttonColorStart}99; }
          70% { box-shadow: 0 0 0 10px transparent; }
          100% { box-shadow: 0 0 0 0 transparent; }
        }
        @keyframes lumiframe-admin-preview-shimmer {
          0% { left: -150%; } 60% { left: 150%; } 100% { left: 150%; }
        }
        .lumiframe-admin-preview-shimmer::after {
          content: ""; position: absolute; top: 0; left: -150%; width: 60%; height: 100%;
          background: linear-gradient(120deg, transparent, rgba(255,255,255,0.55), transparent);
          animation: lumiframe-admin-preview-shimmer 2.4s ease-in-out infinite;
        }
      `}</style>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <div>
          <div className="field" style={{ marginBottom: 12 }}>
            <label>{t("buttonDesign.label")}</label>
            <input value={config.buttonText ?? ""} onChange={(e) => setConfig({ ...config, buttonText: e.target.value })} maxLength={60} />
          </div>
          <div className="field" style={{ marginBottom: 12 }}>
            <label>{t("buttonDesign.style")}</label>
            <select value={config.buttonStyle ?? "gradient"} onChange={(e) => setConfig({ ...config, buttonStyle: e.target.value as WidgetConfig["buttonStyle"] })} style={selectStyle}>
              <option value="gradient">{t("buttonDesign.styleGradient")}</option>
              <option value="solid">{t("buttonDesign.styleSolid")}</option>
              <option value="outline">{t("buttonDesign.styleOutline")}</option>
            </select>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: config.buttonStyle === "outline" ? "1fr" : "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div className="field">
              <label>{t("buttonDesign.color1")}</label>
              <input type="color" value={config.buttonColorStart} onChange={(e) => setConfig({ ...config, buttonColorStart: e.target.value })} style={{ height: 38, padding: 4 }} />
            </div>
            {config.buttonStyle === "gradient" && (
              <div className="field">
                <label>{t("buttonDesign.color2")}</label>
                <input type="color" value={config.buttonColorEnd} onChange={(e) => setConfig({ ...config, buttonColorEnd: e.target.value })} style={{ height: 38, padding: 4 }} />
              </div>
            )}
            {config.buttonStyle === "solid" && (
              <div className="field">
                <label>{t("buttonDesign.textColor")}</label>
                <input type="color" value={config.buttonTextColor} onChange={(e) => setConfig({ ...config, buttonTextColor: e.target.value })} style={{ height: 38, padding: 4 }} />
              </div>
            )}
          </div>
          {config.buttonStyle === "gradient" && (
          <div className="field" style={{ marginBottom: 12 }}>
            <label>{t("buttonDesign.textColor")}</label>
            <input type="color" value={config.buttonTextColor} onChange={(e) => setConfig({ ...config, buttonTextColor: e.target.value })} style={{ height: 38, padding: 4 }} />
          </div>
          )}
          <div className="field" style={{ marginBottom: 12 }}>
            <label>
              {t("buttonDesign.size")}: {config.buttonSize ?? 100}%
            </label>
            <input
              type="range"
              min={70}
              max={160}
              step={5}
              value={config.buttonSize ?? 100}
              onChange={(e) => setConfig({ ...config, buttonSize: Number(e.target.value) })}
              style={{ width: "100%" }}
            />
          </div>
          <div className="field" style={{ marginBottom: 12 }}>
            <label>
              {t("buttonDesign.width")}: {config.buttonWidth ?? 100}%
            </label>
            <input
              type="range"
              min={100}
              max={300}
              step={10}
              value={config.buttonWidth ?? 100}
              onChange={(e) => setConfig({ ...config, buttonWidth: Number(e.target.value) })}
              style={{ width: "100%" }}
            />
          </div>
          <div className="field" style={{ marginBottom: 12 }}>
            <label>{t("buttonDesign.shape")}</label>
            <select value={config.buttonShape ?? "rounded"} onChange={(e) => setConfig({ ...config, buttonShape: e.target.value as WidgetConfig["buttonShape"] })} style={selectStyle}>
              {SHAPE_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {t(s.label)}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ marginBottom: 12 }}>
            <label>{t("buttonDesign.font")}</label>
            <select
              value={config.buttonFont ?? ""}
              onChange={(e) => setConfig({ ...config, buttonFont: e.target.value || undefined })}
              style={selectStyle}
            >
              {FONT_OPTIONS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.value ? f.label : t(f.label as "buttonDesign.fontDefault")}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ marginBottom: 12 }}>
            <label>{t("buttonDesign.animation")}</label>
            <select value={config.buttonAnimation ?? "none"} onChange={(e) => setConfig({ ...config, buttonAnimation: e.target.value as WidgetConfig["buttonAnimation"] })} style={selectStyle}>
              <option value="none">{t("buttonDesign.animationNone")}</option>
              <option value="pulse">{t("buttonDesign.animationPulse")}</option>
              <option value="shimmer">{t("buttonDesign.animationShimmer")}</option>
            </select>
          </div>
          {(!config.buttonAnimation || config.buttonAnimation === "none") && (
            <div className="field" style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 10, flexDirection: "row" }}>
              <input type="checkbox" id="admin-glow" checked={!!config.buttonGlow} onChange={(e) => setConfig({ ...config, buttonGlow: e.target.checked })} style={{ width: "auto" }} />
              <label htmlFor="admin-glow" style={{ margin: 0 }}>
                {t("buttonDesign.glow")}
              </label>
            </div>
          )}

          <h4 style={{ margin: "16px 0 12px", fontSize: 13, borderTop: "1px solid var(--line)", paddingTop: 16 }}>{t("buttonDesign.placementTitle")}</h4>

          <div className="field" style={{ marginBottom: 12 }}>
            <label>{t("buttonDesign.position")}</label>
            <select
              value={config.buttonPosition ?? "after"}
              onChange={(e) => setConfig({ ...config, buttonPosition: e.target.value as WidgetConfig["buttonPosition"] })}
              style={selectStyle}
            >
              {POSITION_OPTIONS.map((p) => (
                <option key={p.value} value={p.value}>
                  {t(p.label)}
                </option>
              ))}
            </select>
          </div>

          {config.buttonPosition !== "floating" && (
            <div className="field" style={{ marginBottom: 12 }}>
              <label>{t("buttonDesign.anchorSelector")}</label>
              <input
                value={config.buttonAnchorSelector ?? ""}
                onChange={(e) => setConfig({ ...config, buttonAnchorSelector: e.target.value || undefined })}
                placeholder=".add-to-cart"
                maxLength={300}
              />
            </div>
          )}


          <div className="field" style={{ marginBottom: 16 }}>
            <label>{t("buttonDesign.modalButtons")}</label>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <input
                  type="checkbox"
                  id="admin-show-try-another"
                  checked={config.showTryAnotherButton !== false}
                  onChange={(e) => setConfig({ ...config, showTryAnotherButton: e.target.checked })}
                  style={{ width: "auto" }}
                />
                <label htmlFor="admin-show-try-another" style={{ margin: 0 }}>
                  {t("buttonDesign.showTryAnother")}
                </label>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <input
                  type="checkbox"
                  id="admin-show-back"
                  checked={config.showBackButton !== false}
                  onChange={(e) => setConfig({ ...config, showBackButton: e.target.checked })}
                  style={{ width: "auto" }}
                />
                <label htmlFor="admin-show-back" style={{ margin: 0 }}>
                  {t("buttonDesign.showBack")}
                </label>
              </div>
            </div>
          </div>

          <h4 style={{ margin: "16px 0 8px", fontSize: 13, borderTop: "1px solid var(--line)", paddingTop: 16 }}>{t("buttonDesign.modalColorTitle")}</h4>
          <p style={{ fontSize: 11, color: "var(--mist-dim)", marginBottom: 12 }}>{t("buttonDesign.modalColorNote")}</p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div className="field">
              <label>{t("buttonDesign.color1")}</label>
              <input
                type="color"
                value={config.modalAccentColorStart ?? config.buttonColorStart ?? "#73b7ff"}
                onChange={(e) => setConfig({ ...config, modalAccentColorStart: e.target.value })}
                style={{ height: 38, padding: 4 }}
              />
            </div>
            <div className="field">
              <label>{t("buttonDesign.color2")}</label>
              <input
                type="color"
                value={config.modalAccentColorEnd ?? config.buttonColorEnd ?? "#9f8cff"}
                onChange={(e) => setConfig({ ...config, modalAccentColorEnd: e.target.value })}
                style={{ height: 38, padding: 4 }}
              />
            </div>
          </div>

          <div className="field" style={{ marginBottom: 16 }}>
            <label>{t("buttonDesign.textColor")}</label>
            <input
              type="color"
              value={config.modalAccentTextColor ?? config.buttonTextColor ?? "#ffffff"}
              onChange={(e) => setConfig({ ...config, modalAccentTextColor: e.target.value })}
              style={{ height: 38, padding: 4 }}
            />
          </div>

          <h4 style={{ margin: "0 0 8px", fontSize: 13, borderTop: "1px solid var(--line)", paddingTop: 16 }}>{t("buttonDesign.modalTextTitle")}</h4>

          <div className="field" style={{ marginBottom: 12 }}>
            <label>{t("buttonDesign.modalHeading")}</label>
            <input value={config.modalHeading ?? ""} onChange={(e) => setConfig({ ...config, modalHeading: e.target.value || undefined })} maxLength={120} />
          </div>

          <div className="field" style={{ marginBottom: 16 }}>
            <label>{t("buttonDesign.modalSubheading")}</label>
            <input value={config.modalSubheading ?? ""} onChange={(e) => setConfig({ ...config, modalSubheading: e.target.value || undefined })} maxLength={200} />
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

/** Add/remove a user on this client's account directly (product ask), same mechanism as the merchant's own Team page (apps/api/src/routes/team.ts) — never sets isPlatformAdmin. */
function TeamPanel({ id, users, onUpdated }: { id: string; users: TenantUser[]; onUpdated: () => void }) {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("MEMBER");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function addUser(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/api/v1/admin/tenants/${id}/users`, { method: "POST", body: JSON.stringify({ email, password, role }) });
      setEmail("");
      setPassword("");
      setRole("MEMBER");
      onUpdated();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function removeUser(userId: string) {
    try {
      await apiFetch(`/api/v1/admin/tenants/${id}/users/${userId}`, { method: "DELETE" });
      onUpdated();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="panel" style={{ padding: 24, maxWidth: 640 }}>
      <h3 style={{ margin: "0 0 14px", fontSize: 15 }}>{t("team.title")}</h3>
      {error && <div className="empty-state">{error}</div>}
      <table style={{ marginBottom: 20 }}>
        <thead>
          <tr>
            <th>{t("team.email")}</th>
            <th>{t("team.role")}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td>{u.email}</td>
              <td>{u.role}</td>
              <td>
                <button className="btn" style={{ width: "auto", padding: "5px 10px", fontSize: 12 }} onClick={() => removeUser(u.id)}>
                  {t("team.remove")}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <form onSubmit={addUser} style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr auto", gap: 10, alignItems: "end" }}>
        <div className="field" style={{ margin: 0 }}>
          <label>{t("team.email")}</label>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label>{t("team.password")}</label>
          <input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label>{t("team.role")}</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            style={{ width: "100%", padding: "9px 12px", borderRadius: 10, border: "1px solid var(--line-strong)", background: "rgba(173,201,255,0.05)", color: "var(--paper)", fontSize: 13 }}
          >
            <option value="MEMBER">MEMBER</option>
            <option value="ADMIN">ADMIN</option>
            <option value="OWNER">OWNER</option>
          </select>
        </div>
        <button className="btn" type="submit" style={{ width: "auto", padding: "9px 16px" }} disabled={saving}>
          {saving ? t("common.saving") : t("team.addUser")}
        </button>
      </form>
    </div>
  );
}

function AccountPanel({ id, tenant, onUpdated }: { id: string; tenant: TenantDetail; onUpdated: () => void }) {
  const { t } = useI18n();
  const firstStore = tenant.stores[0];
  const [tenantName, setTenantName] = useState(tenant.name);
  const [storeName, setStoreName] = useState(firstStore?.name ?? "");
  const [storeUrl, setStoreUrl] = useState(firstStore?.storeUrl ?? "");
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [deletingTryOns, setDeletingTryOns] = useState(false);
  const [deleteConfirmInput, setDeleteConfirmInput] = useState("");
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Suspended only once every store agrees — a tenant with more than one
  // store isn't fully "off" if any of them can still serve try-ons.
  const isActive = tenant.stores.length > 0 && tenant.stores.every((s) => s.status === "ACTIVE");

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    setError(null);
    try {
      await apiFetch(`/api/v1/admin/tenants/${id}/profile`, {
        method: "PATCH",
        body: JSON.stringify({ tenantName, storeName, storeUrl }),
      });
      onUpdated();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingProfile(false);
    }
  }

  async function toggleStatus() {
    setSavingStatus(true);
    setError(null);
    try {
      await apiFetch(`/api/v1/admin/tenants/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: isActive ? "SUSPENDED" : "ACTIVE" }),
      });
      onUpdated();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingStatus(false);
    }
  }

  async function deleteTryOns() {
    if (!window.confirm(t("account.deleteTryOnsConfirm").replace("{name}", tenant.name))) return;
    setDeletingTryOns(true);
    setError(null);
    try {
      await apiFetch(`/api/v1/admin/tenants/${id}/tryons`, { method: "DELETE" });
      onUpdated();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDeletingTryOns(false);
    }
  }

  async function deleteAccount() {
    setDeletingAccount(true);
    setError(null);
    try {
      await apiFetch(`/api/v1/admin/tenants/${id}`, { method: "DELETE" });
      // Full navigation, not client-side routing — the tenant this page
      // is showing no longer exists, so there's nothing left to render
      // here even for an instant.
      window.location.href = "/";
    } catch (err) {
      setError((err as Error).message);
      setDeletingAccount(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 20, maxWidth: 640 }}>
      {error && <div className="empty-state">{error}</div>}

      <div className="panel" style={{ padding: 24 }}>
        <h3 style={{ margin: "0 0 14px", fontSize: 15 }}>{t("account.profileTitle")}</h3>
        <form onSubmit={saveProfile}>
          <div className="field" style={{ marginBottom: 12 }}>
            <label>{t("account.tenantName")}</label>
            <input value={tenantName} onChange={(e) => setTenantName(e.target.value)} required maxLength={200} />
          </div>
          <div className="field" style={{ marginBottom: 12 }}>
            <label>{t("account.storeName")}</label>
            <input value={storeName} onChange={(e) => setStoreName(e.target.value)} required maxLength={200} />
          </div>
          <div className="field" style={{ marginBottom: 14 }}>
            <label>{t("account.storeUrl")}</label>
            <input type="url" value={storeUrl} onChange={(e) => setStoreUrl(e.target.value)} required />
          </div>
          <button className="btn" type="submit" style={{ width: "auto", padding: "9px 16px" }} disabled={savingProfile}>
            {savingProfile ? t("common.saving") : t("common.save")}
          </button>
        </form>
      </div>

      <div className="panel" style={{ padding: 24 }}>
        <h3 style={{ margin: "0 0 4px", fontSize: 15 }}>{t("account.statusTitle")}</h3>
        <p style={{ fontSize: 12, color: "var(--mist)", marginBottom: 14 }}>{t("account.statusDesc")}</p>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span className={`badge badge-${isActive ? "active" : "suspended"}`}>
            {isActive ? t("account.statusActive") : t("account.statusSuspended")}
          </span>
          <button
            className="btn"
            type="button"
            style={{ width: "auto", padding: "9px 16px" }}
            disabled={savingStatus || tenant.stores.length === 0}
            onClick={toggleStatus}
          >
            {savingStatus ? t("common.saving") : isActive ? t("account.statusSuspended") : t("account.statusActive")}
          </button>
        </div>
      </div>

      <div className="panel" style={{ padding: 24, border: "1px solid rgba(255,107,107,0.35)" }}>
        <h3 style={{ margin: "0 0 14px", fontSize: 15, color: "var(--danger)" }}>{t("account.dangerTitle")}</h3>

        <div style={{ marginBottom: 20, paddingBottom: 20, borderBottom: "1px solid var(--line)" }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>{t("account.deleteTryOnsTitle")}</div>
          <p style={{ fontSize: 12, color: "var(--mist)", marginBottom: 12 }}>{t("account.deleteTryOnsDesc")}</p>
          <button
            type="button"
            className="btn"
            style={{ width: "auto", padding: "9px 16px", background: "rgba(255,107,107,0.15)", color: "var(--danger)" }}
            disabled={deletingTryOns}
            onClick={deleteTryOns}
          >
            {deletingTryOns ? t("common.saving") : t("account.deleteTryOnsButton")}
          </button>
        </div>

        <div>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>{t("account.deleteAccountTitle")}</div>
          <p style={{ fontSize: 12, color: "var(--mist)", marginBottom: 12 }}>{t("account.deleteAccountDesc")}</p>
          <div className="field" style={{ marginBottom: 12, maxWidth: 320 }}>
            <label>{t("account.deleteAccountConfirmLabel")}</label>
            <input value={deleteConfirmInput} onChange={(e) => setDeleteConfirmInput(e.target.value)} placeholder={tenant.name} />
          </div>
          <button
            type="button"
            className="btn"
            style={{ width: "auto", padding: "9px 16px", background: "rgba(255,107,107,0.15)", color: "var(--danger)" }}
            disabled={deletingAccount || deleteConfirmInput !== tenant.name}
            onClick={deleteAccount}
          >
            {deletingAccount ? t("common.saving") : t("account.deleteAccountButton")}
          </button>
        </div>
      </div>
    </div>
  );
}

const TABS = [
  { id: "overview", labelKey: "tenantDetail.tabOverview" },
  { id: "plan", labelKey: "tenantDetail.tabPlan" },
  { id: "button", labelKey: "tenantDetail.tabButton" },
  { id: "team", labelKey: "tenantDetail.tabTeam" },
  { id: "products", labelKey: "tenantDetail.tabProducts" },
  { id: "account", labelKey: "tenantDetail.tabAccount" },
] as const;
type TabId = (typeof TABS)[number]["id"];

function TenantDetailContent({ id }: { id: string }) {
  const { t } = useI18n();
  const [tenant, setTenant] = useState<TenantDetail | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>("overview");

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

      <div className="stat-grid" style={{ marginBottom: 20 }}>
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

      <div style={{ display: "flex", gap: 6, marginBottom: 20, borderBottom: "1px solid var(--line)" }}>
        {TABS.map((tb) => (
          <button
            key={tb.id}
            type="button"
            onClick={() => setTab(tb.id)}
            style={{
              padding: "10px 16px",
              background: "none",
              border: "none",
              borderBottom: tab === tb.id ? "2px solid var(--sky)" : "2px solid transparent",
              color: tab === tb.id ? "var(--paper)" : "var(--mist)",
              fontSize: 13,
              fontWeight: tab === tb.id ? 700 : 500,
              cursor: "pointer",
            }}
          >
            {t(tb.labelKey)}
          </button>
        ))}
      </div>

      {tab === "overview" && (
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
      )}

      {tab === "plan" && <BillingPanel id={id} tenant={tenant} plans={plans} onUpdated={load} />}

      {tab === "button" && <ButtonDesignPanel id={id} tenant={tenant} onUpdated={load} />}

      {tab === "team" && <TeamPanel id={id} users={tenant.users} onUpdated={load} />}

      {tab === "products" && (
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
      )}

      {tab === "account" && <AccountPanel id={id} tenant={tenant} onUpdated={load} />}
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
