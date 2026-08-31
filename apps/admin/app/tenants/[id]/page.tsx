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
  /** "split" (default) — full-page takeover. "compact" — a small floating
   * card over the dimmed, still-visible product page instead. */
  modalLayout?: "split" | "compact";
  /** Same "Try on" affordance on catalog mini-cards the merchant's own
   * dashboard configures — see packages/sdk's TryOnInitOptions. */
  cardButtonEnabled?: boolean;
  cardButtonVariant?: "corner" | "drawer" | "scrim";
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

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
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
              background: "rgba(255,255,255,0.05)",
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

const CARD_VARIANT_OPTIONS = [
  { value: "corner", label: "buttonDesign.cardVariantCorner", desc: "buttonDesign.cardVariantCornerDesc" },
  { value: "drawer", label: "buttonDesign.cardVariantDrawer", desc: "buttonDesign.cardVariantDrawerDesc" },
  { value: "scrim", label: "buttonDesign.cardVariantScrim", desc: "buttonDesign.cardVariantScrimDesc" },
] as const;

const DESIGN_TABS = [
  { id: "button", label: "buttonDesign.tabButton" },
  { id: "modal", label: "buttonDesign.tabModal" },
  { id: "card", label: "buttonDesign.tabCard" },
] as const;
type DesignTabId = (typeof DESIGN_TABS)[number]["id"];

// Same fix as apps/dashboard/app/integration/page.tsx's own PREVIEW_CSS —
// a plain, non-interpolated string, module-scope, so React never touches
// this <style> tag once mounted. Live colors come in as CSS custom
// properties set inline on the panel below instead of baked into this
// text, which used to get rebuilt (and reparsed by the browser) on every
// keystroke or color-picker drag (product report: the app "подлагивает").
const ADMIN_PREVIEW_CSS = `
  @keyframes lumiframe-admin-preview-pulse {
    0% { box-shadow: 0 0 0 0 var(--lumi-pulse-color, rgba(115,183,255,.6)); }
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
  .lumi-admin-card-preview { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .lumi-admin-card-thumb { position: relative; aspect-ratio: 4/5; border-radius: 10px; overflow: hidden; background: #f2f1ee; }
  .lumi-admin-card-name { font-size: 11px; font-weight: 600; margin-top: 8px; color: var(--paper); }
  .lumi-admin-card-badge {
    position: absolute; top: 8px; right: 8px; width: 28px; height: 28px; border-radius: 50%;
    background: #fff; box-shadow: 0 2px 8px rgba(20,20,30,.16);
    display: flex; align-items: center; justify-content: center; overflow: hidden; white-space: nowrap;
    color: var(--lumi-accent-1, #73b7ff); transition: width .2s ease;
  }
  .lumi-admin-card-badge span { font-size: 10.5px; font-weight: 700; color: #171923; opacity: 0; max-width: 0; margin-left: 0; transition: opacity .15s ease, max-width .2s ease; }
  .lumi-admin-card-thumb:hover .lumi-admin-card-badge { width: 118px; border-radius: 14px; }
  .lumi-admin-card-thumb:hover .lumi-admin-card-badge span { opacity: 1; max-width: 84px; margin-left: 6px; }
  .lumi-admin-card-drawer {
    position: absolute; left: 0; right: 0; bottom: 0; height: 32px;
    background: var(--lumi-accent-bg, linear-gradient(135deg, #73b7ff, #9f8cff)); color: var(--lumi-accent-contrast, #fff);
    display: flex; align-items: center; justify-content: center; gap: 6px; font-size: 10.5px; font-weight: 700;
    transform: translateY(100%); transition: transform .2s cubic-bezier(.2,.8,.2,1);
  }
  .lumi-admin-card-thumb:hover .lumi-admin-card-drawer { transform: translateY(0); }
  .lumi-admin-card-scrim {
    position: absolute; inset: 0; display: flex; align-items: flex-end; justify-content: center; padding-bottom: 12px;
    background: transparent; transition: background .2s ease;
  }
  .lumi-admin-card-thumb:hover .lumi-admin-card-scrim { background: rgba(17,19,25,.22); }
  .lumi-admin-card-scrim-pill {
    display: flex; align-items: center; gap: 6px; background: #fff; color: #171923; font-size: 10.5px; font-weight: 700;
    padding: 7px 12px; border-radius: 999px; box-shadow: 0 6px 18px rgba(0,0,0,.18);
    opacity: 0; transform: translateY(6px); transition: opacity .15s ease, transform .15s ease;
  }
  .lumi-admin-card-thumb:hover .lumi-admin-card-scrim-pill { opacity: 1; transform: translateY(0); }
`;

const WIDGET_CONFIG_DEFAULTS: Required<
  Pick<
    WidgetConfig,
    | "buttonText"
    | "buttonColorStart"
    | "buttonColorEnd"
    | "buttonTextColor"
    | "buttonPosition"
    | "buttonSize"
    | "buttonWidth"
    | "buttonShape"
    | "showTryAnotherButton"
    | "showBackButton"
    | "cardButtonEnabled"
    | "cardButtonVariant"
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
  cardButtonEnabled: false,
  cardButtonVariant: "corner",
};

/** Lets the platform owner edit a client's "Try on" button design directly, without needing the merchant's own dashboard (product ask: make changes to a client's store from my own console). */
/**
 * Same three sections the merchant configures herself
 * (apps/dashboard/app/integration/page.tsx) — button / try-on window /
 * mini-card button — with the same live previews, so the platform owner
 * sees exactly what a client sees and can edit it from here directly
 * (product ask: "визуально что должно выглядеть у меня так же как у
 * клиента ... и я могу править в случае чего"). Deliberately does NOT
 * duplicate the dashboard's embed-snippet/allowed-domains/visitor-limit
 * sections — those are the merchant's own integration concerns, not part
 * of "what does this look like right now".
 */
function ButtonDesignPanel({ id, tenant, onUpdated }: { id: string; tenant: TenantDetail; onUpdated: () => void }) {
  const { t } = useI18n();
  const store = tenant.stores[0];
  const [config, setConfig] = useState<WidgetConfig>({ ...WIDGET_CONFIG_DEFAULTS, ...store?.widgetConfig });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [designTab, setDesignTab] = useState<DesignTabId>("button");

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

  const selectStyle: React.CSSProperties = { width: "100%", padding: "9px 12px", borderRadius: 10, border: "1px solid var(--line-strong)", background: "rgba(255,255,255,0.05)", color: "var(--paper)", fontSize: 13 };

  // Mirrors packages/widget's own fallback: modal-specific colors win when
  // set, otherwise the button's own colors.
  const modalAccentStart = config.modalAccentColorStart ?? config.buttonColorStart ?? "#73b7ff";
  const modalAccentEnd = config.modalAccentColorEnd ?? config.buttonColorEnd ?? "#9f8cff";
  const modalAccentText = config.modalAccentTextColor ?? config.buttonTextColor ?? "#ffffff";
  const modalBtnBackground = config.buttonStyle === "solid" ? modalAccentStart : `linear-gradient(135deg, ${modalAccentStart}, ${modalAccentEnd})`;

  return (
    <div
      className="panel"
      style={
        {
          padding: 24,
          marginBottom: 20,
          // Feeds ADMIN_PREVIEW_CSS above — only these custom properties
          // change as the admin edits colors, not the stylesheet text.
          "--lumi-accent-1": config.buttonColorStart,
          "--lumi-accent-bg": previewBackground,
          "--lumi-accent-contrast": config.buttonTextColor,
          "--lumi-pulse-color": `${config.buttonColorStart}99`,
        } as React.CSSProperties
      }
    >
      <h3 style={{ margin: "0 0 14px", fontSize: 15 }}>{t("buttonDesign.title")}</h3>
      <style>{ADMIN_PREVIEW_CSS}</style>

      {/* overflow-x: auto, not a plain flex row — on a narrow phone the
          three labels together don't fit, and a flex row with no wrap
          and no scroll of its own pushes the whole page wider than the
          viewport instead (same fix as the 6-tab bar further below). */}
      <div style={{ display: "flex", gap: 6, marginBottom: 18, borderBottom: "1px solid var(--line)", overflowX: "auto" }}>
        {DESIGN_TABS.map((tb) => (
          <button
            key={tb.id}
            type="button"
            onClick={() => setDesignTab(tb.id)}
            style={{
              padding: "8px 14px",
              background: "none",
              border: "none",
              borderBottom: designTab === tb.id ? "2px solid var(--sky)" : "2px solid transparent",
              color: designTab === tb.id ? "var(--paper)" : "var(--mist)",
              fontSize: 13,
              fontWeight: designTab === tb.id ? 700 : 500,
              cursor: "pointer",
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            {t(tb.label)}
          </button>
        ))}
      </div>

      {/* auto-fit/minmax(320px), not a flat "1fr 1fr" — mirrors the same
          fix in apps/dashboard/app/integration/page.tsx: settings and
          preview both need real width, so this stacks on a phone instead
          of squeezing both into half a narrow screen. */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 20, alignItems: "start" }}>
        <div>
          {designTab === "button" && (
            <>
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
            </>
          )}

          {designTab === "modal" && (
            <>
          <div className="field" style={{ marginBottom: 4 }}>
            <label>{t("buttonDesign.modalLayout")}</label>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 16 }}>
            {(
              [
                { value: "split", label: "buttonDesign.modalLayoutSplit", desc: "buttonDesign.modalLayoutSplitDesc" },
                { value: "compact", label: "buttonDesign.modalLayoutCompact", desc: "buttonDesign.modalLayoutCompactDesc" },
              ] as const
            ).map((v) => (
              <button
                key={v.value}
                type="button"
                onClick={() => setConfig({ ...config, modalLayout: v.value })}
                style={{
                  textAlign: "left",
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: (config.modalLayout ?? "split") === v.value ? "1.5px solid var(--sky)" : "1px solid var(--line-strong)",
                  background: (config.modalLayout ?? "split") === v.value ? "rgba(115,183,255,0.08)" : "rgba(255,255,255,0.03)",
                  color: "var(--paper)",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 3 }}>{t(v.label)}</div>
                <div style={{ fontSize: 11, color: "var(--mist)", lineHeight: 1.4 }}>{t(v.desc)}</div>
              </button>
            ))}
          </div>

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
                value={modalAccentStart}
                onChange={(e) => setConfig({ ...config, modalAccentColorStart: e.target.value })}
                style={{ height: 38, padding: 4 }}
              />
            </div>
            <div className="field">
              <label>{t("buttonDesign.color2")}</label>
              <input
                type="color"
                value={modalAccentEnd}
                onChange={(e) => setConfig({ ...config, modalAccentColorEnd: e.target.value })}
                style={{ height: 38, padding: 4 }}
              />
            </div>
          </div>

          <div className="field" style={{ marginBottom: 16 }}>
            <label>{t("buttonDesign.textColor")}</label>
            <input
              type="color"
              value={modalAccentText}
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
            </>
          )}

          {designTab === "card" && (
            <>
          <p style={{ fontSize: 12.5, color: "var(--mist)", marginBottom: 16, lineHeight: 1.6 }}>{t("buttonDesign.cardDesc")}</p>

          <div className="field" style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 10, flexDirection: "row" }}>
            <input
              type="checkbox"
              id="admin-card-enable"
              checked={!!config.cardButtonEnabled}
              onChange={(e) => setConfig({ ...config, cardButtonEnabled: e.target.checked })}
              style={{ width: "auto" }}
            />
            <label htmlFor="admin-card-enable" style={{ margin: 0 }}>
              {t("buttonDesign.cardEnable")}
            </label>
          </div>

          <div className="field" style={{ marginBottom: 4 }}>
            <label>{t("buttonDesign.cardVariant")}</label>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10, marginBottom: 16 }}>
            {CARD_VARIANT_OPTIONS.map((v) => (
              <button
                key={v.value}
                type="button"
                onClick={() => setConfig({ ...config, cardButtonVariant: v.value })}
                disabled={!config.cardButtonEnabled}
                style={{
                  textAlign: "left",
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: config.cardButtonVariant === v.value ? "1.5px solid var(--sky)" : "1px solid var(--line-strong)",
                  background: config.cardButtonVariant === v.value ? "rgba(115,183,255,0.08)" : "rgba(255,255,255,0.03)",
                  color: "var(--paper)",
                  cursor: config.cardButtonEnabled ? "pointer" : "default",
                  opacity: config.cardButtonEnabled ? 1 : 0.5,
                  fontFamily: "inherit",
                }}
              >
                <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 3 }}>{t(v.label)}</div>
                <div style={{ fontSize: 11, color: "var(--mist)", lineHeight: 1.4 }}>{t(v.desc)}</div>
              </button>
            ))}
          </div>

          <p style={{ fontSize: 11.5, color: "var(--mist-dim)", lineHeight: 1.6 }}>{t("buttonDesign.cardNote")}</p>
            </>
          )}

          <button className="btn" style={{ width: "auto", padding: "9px 18px", marginTop: 4 }} disabled={saving} onClick={save}>
            {saving ? t("common.saving") : saved ? "✓" : t("common.save")}
          </button>
        </div>

        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--mist-dim)", marginBottom: 10, textTransform: "uppercase", letterSpacing: ".06em" }}>
            {t("buttonDesign.preview")}
          </div>

          {designTab === "button" && (
            <div style={{ padding: 32, borderRadius: 12, background: "rgba(255,255,255,0.03)", border: "1px solid var(--line)", display: "flex", justifyContent: "center" }}>
              <button type="button" style={previewStyle} className={config.buttonAnimation === "shimmer" ? "lumiframe-admin-preview-shimmer" : undefined} disabled>
                {config.buttonText || "Try on"}
              </button>
            </div>
          )}

          {designTab === "modal" && (
            config.modalLayout === "compact" ? (
            <div
              style={{
                padding: 24, borderRadius: 12, background: "#2a2c33",
                display: "flex", justifyContent: "flex-start",
                fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
              }}
            >
              <div style={{ width: 200, background: "#fff", borderRadius: 16, padding: "18px 14px 14px", boxShadow: "0 16px 40px rgba(0,0,0,.4)", position: "relative" }}>
                <div style={{ position: "absolute", top: 8, right: 8, width: 18, height: 18, borderRadius: "50%", background: "rgba(0,0,0,.06)", fontSize: 9, display: "flex", alignItems: "center", justifyContent: "center", color: "#444" }}>
                  ✕
                </div>
                <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "#aaa", marginBottom: 6 }}>
                  {t("buttonDesign.previewModalBrand")}
                </div>
                <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", marginBottom: 9, color: "#111" }}>
                  {config.modalHeading || t("buttonDesign.modalHeadingPlaceholder")}
                </div>
                <div style={{ borderRadius: 12, border: "1.5px dashed #d6d6d4", background: "#fafafa", aspectRatio: "3 / 4", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 9, fontSize: 16 }}>
                  🧍
                </div>
                <button
                  type="button"
                  disabled
                  style={{
                    width: "100%", padding: "7px", border: "none",
                    borderRadius: config.buttonShape === "rectangular" ? 6 : 8,
                    fontWeight: 700, fontSize: 8, letterSpacing: ".02em", textTransform: "uppercase",
                    background: modalBtnBackground, color: modalAccentText, fontFamily: "inherit",
                  }}
                >
                  {t("buttonDesign.previewModalCta")}
                </button>
              </div>
            </div>
            ) : (
            <div style={{ padding: 0, borderRadius: 12, overflow: "hidden", border: "1px solid var(--line)" }}>
              <div style={{ display: "flex", minHeight: 340, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
                <div style={{ flex: 1, background: "#f6f6f5", color: "#111", padding: "22px 16px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
                  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "#aaa", marginBottom: 8 }}>
                    {t("buttonDesign.previewModalBrand")}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 800, textTransform: "uppercase", marginBottom: 6 }}>
                    {config.modalHeading || t("buttonDesign.modalHeadingPlaceholder")}
                  </div>
                  <div style={{ fontSize: 10, color: "#8a8a8a", marginBottom: 12, lineHeight: 1.5 }}>
                    {config.modalSubheading || t("buttonDesign.modalSubheadingPlaceholder")}
                  </div>
                  <div
                    style={{
                      position: "relative",
                      borderRadius: 10,
                      background: "#e7e7e6",
                      aspectRatio: "3 / 4",
                      maxHeight: 130,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      marginBottom: 10,
                      fontSize: 18,
                    }}
                  >
                    <span
                      style={{
                        position: "absolute",
                        top: 6,
                        left: 6,
                        background: "rgba(255,255,255,.94)",
                        fontSize: 8,
                        fontWeight: 700,
                        letterSpacing: ".04em",
                        textTransform: "uppercase",
                        padding: "3px 7px",
                        borderRadius: 999,
                        color: "#444",
                      }}
                    >
                      {t("buttonDesign.previewModalBadge")}
                    </span>
                    🧍
                  </div>
                  <button
                    type="button"
                    disabled
                    style={{
                      width: "100%",
                      padding: "8px",
                      border: "none",
                      borderRadius: config.buttonShape === "rectangular" ? 6 : 8,
                      fontWeight: 700,
                      fontSize: 9,
                      letterSpacing: ".02em",
                      textTransform: "uppercase",
                      background: modalBtnBackground,
                      color: modalAccentText,
                      fontFamily: "inherit",
                    }}
                  >
                    {t("buttonDesign.previewModalCta")}
                  </button>
                </div>
                <div style={{ flex: 1, background: "#fff", color: "#111", padding: "22px 16px", display: "flex", flexDirection: "column", justifyContent: "center", borderLeft: "1px solid #ececec" }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14 }}>
                    <div style={{ width: 32, height: 40, borderRadius: 8, background: "#eee", flexShrink: 0 }} />
                    <div>
                      <div style={{ fontSize: 10.5, fontWeight: 700 }}>{t("buttonDesign.previewProductName")}</div>
                      <div style={{ fontSize: 10.5, fontWeight: 700, color: "#111" }}>$49</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled
                    style={{
                      width: "100%",
                      padding: "8px",
                      border: "none",
                      borderRadius: config.buttonShape === "rectangular" ? 6 : 8,
                      fontWeight: 700,
                      fontSize: 9,
                      letterSpacing: ".02em",
                      textTransform: "uppercase",
                      background: modalBtnBackground,
                      color: modalAccentText,
                      fontFamily: "inherit",
                    }}
                  >
                    {t("buttonDesign.previewModalAddToCart")}
                  </button>
                </div>
              </div>
            </div>
            )
          )}

          {designTab === "card" && (
            <div style={{ padding: 20, borderRadius: 12, background: "rgba(255,255,255,0.03)", border: "1px solid var(--line)" }}>
              {!config.cardButtonEnabled && <p style={{ fontSize: 11.5, color: "var(--mist-dim)", marginBottom: 12 }}>{t("buttonDesign.cardPreviewOff")}</p>}
              <div className="lumi-admin-card-preview" style={{ opacity: config.cardButtonEnabled ? 1 : 0.45 }}>
                {[0, 1].map((i) => (
                  <div key={i}>
                    <div className="lumi-admin-card-thumb">
                      <svg viewBox="0 0 64 32" fill="none" style={{ width: "60%", height: "60%", position: "absolute", inset: 0, margin: "auto" }}>
                        <ellipse cx="16" cy="16" rx="13" ry="10" stroke="#c3b8a4" strokeWidth="2" />
                        <ellipse cx="48" cy="16" rx="13" ry="10" stroke="#c3b8a4" strokeWidth="2" />
                        <path d="M29 16h6M3 14l-3 4M61 14l3 4" stroke="#c3b8a4" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                      {(config.cardButtonVariant ?? "corner") === "corner" && (
                        <div className="lumi-admin-card-badge">
                          <svg viewBox="0 0 20 12" fill="none" width="13" height="13">
                            <path d="M1 6C2.5 3 5 1 10 1s7.5 2 9 5c-1.5 3-4 5-9 5s-7.5-2-9-5z" stroke="currentColor" strokeWidth="1.4" />
                            <circle cx="10" cy="6" r="2" fill="currentColor" />
                          </svg>
                          <span>{config.buttonText || "Try on"}</span>
                        </div>
                      )}
                      {config.cardButtonVariant === "drawer" && (
                        <div className="lumi-admin-card-drawer">
                          <svg viewBox="0 0 20 12" fill="none" width="13" height="13">
                            <path d="M1 6C2.5 3 5 1 10 1s7.5 2 9 5c-1.5 3-4 5-9 5s-7.5-2-9-5z" stroke="currentColor" strokeWidth="1.4" />
                            <circle cx="10" cy="6" r="2" fill="currentColor" />
                          </svg>
                          {config.buttonText || "Try on"}
                        </div>
                      )}
                      {config.cardButtonVariant === "scrim" && (
                        <div className="lumi-admin-card-scrim">
                          <div className="lumi-admin-card-scrim-pill">
                            <svg viewBox="0 0 20 12" fill="none" width="13" height="13">
                              <path d="M1 6C2.5 3 5 1 10 1s7.5 2 9 5c-1.5 3-4 5-9 5s-7.5-2-9-5z" stroke="currentColor" strokeWidth="1.4" />
                              <circle cx="10" cy="6" r="2" fill="currentColor" />
                            </svg>
                            <span>{config.buttonText || "Try on"}</span>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="lumi-admin-card-name">{t("buttonDesign.cardPreviewProduct")}</div>
                  </div>
                ))}
              </div>
              <p style={{ fontSize: 11, color: "var(--mist-dim)", marginTop: 14, lineHeight: 1.5 }}>{t("buttonDesign.cardPreviewHint")}</p>
            </div>
          )}
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
      <form onSubmit={addUser} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, alignItems: "end" }}>
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
            style={{ width: "100%", padding: "9px 12px", borderRadius: 10, border: "1px solid var(--line-strong)", background: "rgba(255,255,255,0.05)", color: "var(--paper)", fontSize: 13 }}
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

      {/* overflow-x: auto — six tab labels don't fit a phone's width, and
          a plain flex row with no wrap/scroll of its own pushed the whole
          page wider than the viewport instead of just this row (found via
          a mobile screenshot: body rendered 517px wide against a 375px
          viewport). Scrolls within itself instead. */}
      <div style={{ display: "flex", gap: 6, marginBottom: 20, borderBottom: "1px solid var(--line)", overflowX: "auto" }}>
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
              whiteSpace: "nowrap",
              flexShrink: 0,
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
