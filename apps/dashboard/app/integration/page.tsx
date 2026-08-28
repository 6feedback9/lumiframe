"use client";

import { useEffect, useState } from "react";
import { AuthGuard } from "../AuthGuard";
import { IntegrationSnippet } from "../IntegrationSnippet";
import { apiFetch } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { WidgetConfig } from "@/lib/snippet";

interface StoreInfo {
  id: string;
  name: string;
  storeUrl: string;
  status: string;
  allowedDomains: string[];
  widgetConfig?: WidgetConfig;
}

const FONT_OPTIONS = [
  { value: "", labelKey: "customize.fontDefault" },
  { value: "'Manrope', sans-serif", labelKey: "customize.fontManrope" },
  { value: "'Inter', sans-serif", labelKey: "customize.fontInter" },
  { value: "'Poppins', sans-serif", labelKey: "customize.fontPoppins" },
  { value: "Georgia, serif", labelKey: "customize.fontGeorgia" },
] as const;

const SIZE_OPTIONS = [
  { value: "sm", labelKey: "customize.sizeSm" },
  { value: "md", labelKey: "customize.sizeMd" },
  { value: "lg", labelKey: "customize.sizeLg" },
] as const;

const ANIMATION_OPTIONS = [
  { value: "none", labelKey: "customize.animationNone" },
  { value: "pulse", labelKey: "customize.animationPulse" },
  { value: "shimmer", labelKey: "customize.animationShimmer" },
] as const;

const POSITION_OPTIONS = [
  { value: "after", labelKey: "customize.positionAfter" },
  { value: "before", labelKey: "customize.positionBefore" },
  { value: "floating", labelKey: "customize.positionFloating" },
] as const;

// Presets rather than a raw px input — friendlier for a non-technical
// merchant, and the SDK only needs a number either way.
const MODAL_WIDTH_OPTIONS = [
  { value: 480, labelKey: "customize.modalWidthSm" },
  { value: 560, labelKey: "customize.modalWidthMd" },
  { value: 680, labelKey: "customize.modalWidthLg" },
] as const;

const DEFAULTS: Required<
  Pick<
    WidgetConfig,
    | "buttonText"
    | "buttonColorStart"
    | "buttonColorEnd"
    | "buttonTextColor"
    | "buttonStyle"
    | "buttonSize"
    | "buttonAnimation"
    | "buttonPosition"
    | "modalMaxWidth"
    | "showTryAnotherButton"
    | "showBackButton"
  >
> = {
  buttonText: "Try on",
  buttonColorStart: "#73b7ff",
  buttonColorEnd: "#9f8cff",
  buttonTextColor: "#ffffff",
  buttonStyle: "gradient",
  buttonSize: "md",
  buttonAnimation: "none",
  buttonPosition: "after",
  modalMaxWidth: 560,
  showTryAnotherButton: true,
  showBackButton: true,
};

const SELECT_STYLE: React.CSSProperties = {
  width: "100%",
  padding: "9px 12px",
  borderRadius: 10,
  border: "1px solid var(--line-strong)",
  background: "rgba(173,201,255,0.05)",
  color: "var(--paper)",
  fontSize: 13,
};

const TABS = [
  { id: "button", labelKey: "integration.tabButton" },
  { id: "modal", labelKey: "integration.tabModal" },
] as const;
type TabId = (typeof TABS)[number]["id"];

function IntegrationContent() {
  const { t } = useI18n();
  const [store, setStore] = useState<StoreInfo | null>(null);
  const [config, setConfig] = useState<WidgetConfig>(DEFAULTS);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [tab, setTab] = useState<TabId>("button");

  useEffect(() => {
    apiFetch<StoreInfo>("/api/v1/store")
      .then((s) => {
        setStore(s);
        setConfig({ ...DEFAULTS, ...s.widgetConfig });
      })
      .catch((err) => setError(err.message));
  }, []);

  async function save() {
    setSaving(true);
    setSaved(false);
    try {
      await apiFetch("/api/v1/store", { method: "PATCH", body: JSON.stringify({ widgetConfig: config }) });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (error) return <div className="empty-state">{error}</div>;
  if (!store) return <div className="empty-state">{t("common.loading")}</div>;

  const sizeScale = config.buttonSize === "sm" ? 0.85 : config.buttonSize === "lg" ? 1.15 : 1;
  const previewBackground =
    config.buttonStyle === "solid" ? config.buttonColorStart : `linear-gradient(135deg, ${config.buttonColorStart}, ${config.buttonColorEnd})`;
  const previewStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: `${0.75 * sizeScale}em ${1.5 * sizeScale}em`,
    border: "none",
    borderRadius: 999,
    background: previewBackground,
    color: config.buttonTextColor,
    fontFamily: config.buttonFont || "inherit",
    fontWeight: 600,
    fontSize: 15 * sizeScale,
    cursor: "pointer",
    boxShadow: config.buttonGlow && config.buttonAnimation === "none" ? `0 0 18px 2px ${config.buttonColorStart}` : "none",
    animation: config.buttonAnimation === "pulse" ? "lumiframe-preview-pulse 1.8s ease-out infinite" : undefined,
    position: "relative",
    overflow: config.buttonAnimation === "shimmer" ? "hidden" : undefined,
  };

  // Mirrors packages/widget's own fallback: modal-specific colors win when
  // set, otherwise the button's own colors — see packages/sdk/src/index.ts.
  const modalAccentStart = config.modalAccentColorStart ?? config.buttonColorStart ?? "#73b7ff";
  const modalAccentEnd = config.modalAccentColorEnd ?? config.buttonColorEnd ?? "#9f8cff";
  const modalAccentText = config.modalAccentTextColor ?? config.buttonTextColor ?? "#ffffff";
  const modalBtnBackground = config.buttonStyle === "solid" ? modalAccentStart : `linear-gradient(135deg, ${modalAccentStart}, ${modalAccentEnd})`;

  return (
    <>
      <div className="page-title">{t("integration.title")}</div>
      <p style={{ fontSize: 13, color: "var(--mist)", marginBottom: 20, maxWidth: 560 }}>{t("customize.desc")}</p>

      <style>{`
        @keyframes lumiframe-preview-pulse {
          0% { box-shadow: 0 0 0 0 ${config.buttonColorStart}99; }
          70% { box-shadow: 0 0 0 10px transparent; }
          100% { box-shadow: 0 0 0 0 transparent; }
        }
        @keyframes lumiframe-preview-shimmer {
          0% { left: -150%; }
          60% { left: 150%; }
          100% { left: 150%; }
        }
        .lumiframe-preview-shimmer::after {
          content: "";
          position: absolute;
          top: 0; left: -150%;
          width: 60%; height: 100%;
          background: linear-gradient(120deg, transparent, rgba(255,255,255,0.55), transparent);
          animation: lumiframe-preview-shimmer 2.4s ease-in-out infinite;
        }
      `}</style>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, alignItems: "start" }}>
        <div className="panel" style={{ padding: 24 }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 18, borderBottom: "1px solid var(--line)" }}>
            {TABS.map((tb) => (
              <button
                key={tb.id}
                type="button"
                onClick={() => setTab(tb.id)}
                style={{
                  padding: "8px 14px",
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

          {tab === "button" && (
            <>
          <div className="field" style={{ marginBottom: 14 }}>
            <label>{t("customize.label")}</label>
            <input value={config.buttonText ?? ""} onChange={(e) => setConfig({ ...config, buttonText: e.target.value })} maxLength={60} />
          </div>

          <div className="field" style={{ marginBottom: 14 }}>
            <label>{t("customize.style")}</label>
            <select value={config.buttonStyle} onChange={(e) => setConfig({ ...config, buttonStyle: e.target.value as WidgetConfig["buttonStyle"] })} style={SELECT_STYLE}>
              <option value="gradient">{t("customize.styleGradient")}</option>
              <option value="solid">{t("customize.styleSolid")}</option>
            </select>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: config.buttonStyle === "solid" ? "1fr" : "1fr 1fr", gap: 14, marginBottom: 14 }}>
            <div className="field">
              <label>{config.buttonStyle === "solid" ? t("customize.style") : t("customize.color1")}</label>
              <input type="color" value={config.buttonColorStart} onChange={(e) => setConfig({ ...config, buttonColorStart: e.target.value })} style={{ height: 40, padding: 4 }} />
            </div>
            {config.buttonStyle !== "solid" && (
              <div className="field">
                <label>{t("customize.color2")}</label>
                <input type="color" value={config.buttonColorEnd} onChange={(e) => setConfig({ ...config, buttonColorEnd: e.target.value })} style={{ height: 40, padding: 4 }} />
              </div>
            )}
          </div>

          <div className="field" style={{ marginBottom: 14 }}>
            <label>{t("customize.textColor")}</label>
            <input type="color" value={config.buttonTextColor} onChange={(e) => setConfig({ ...config, buttonTextColor: e.target.value })} style={{ height: 40, padding: 4 }} />
          </div>

          <div className="field" style={{ marginBottom: 14 }}>
            <label>{t("customize.size")}</label>
            <select value={config.buttonSize} onChange={(e) => setConfig({ ...config, buttonSize: e.target.value as WidgetConfig["buttonSize"] })} style={SELECT_STYLE}>
              {SIZE_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {t(s.labelKey)}
                </option>
              ))}
            </select>
          </div>

          <div className="field" style={{ marginBottom: 14 }}>
            <label>{t("customize.font")}</label>
            <select value={config.buttonFont ?? ""} onChange={(e) => setConfig({ ...config, buttonFont: e.target.value || undefined })} style={SELECT_STYLE}>
              {FONT_OPTIONS.map((f) => (
                <option key={f.value} value={f.value}>
                  {t(f.labelKey)}
                </option>
              ))}
            </select>
          </div>

          <div className="field" style={{ marginBottom: 14 }}>
            <label>{t("customize.animation")}</label>
            <select
              value={config.buttonAnimation}
              onChange={(e) => setConfig({ ...config, buttonAnimation: e.target.value as WidgetConfig["buttonAnimation"] })}
              style={SELECT_STYLE}
            >
              {ANIMATION_OPTIONS.map((a) => (
                <option key={a.value} value={a.value}>
                  {t(a.labelKey)}
                </option>
              ))}
            </select>
          </div>

          {config.buttonAnimation === "none" && (
            <div className="field" style={{ marginBottom: 20, display: "flex", alignItems: "center", gap: 10, flexDirection: "row" }}>
              <input type="checkbox" id="glow" checked={!!config.buttonGlow} onChange={(e) => setConfig({ ...config, buttonGlow: e.target.checked })} style={{ width: "auto" }} />
              <label htmlFor="glow" style={{ margin: 0 }}>
                {t("customize.glow")}
              </label>
            </div>
          )}
            </>
          )}

          {tab === "modal" && (
            <>
          <div className="field" style={{ marginBottom: 14 }}>
            <label>{t("customize.position")}</label>
            <select
              value={config.buttonPosition ?? "after"}
              onChange={(e) => setConfig({ ...config, buttonPosition: e.target.value as WidgetConfig["buttonPosition"] })}
              style={SELECT_STYLE}
            >
              {POSITION_OPTIONS.map((p) => (
                <option key={p.value} value={p.value}>
                  {t(p.labelKey)}
                </option>
              ))}
            </select>
          </div>

          {config.buttonPosition !== "floating" && (
            <div className="field" style={{ marginBottom: 14 }}>
              <label>{t("customize.anchorSelector")}</label>
              <input
                value={config.buttonAnchorSelector ?? ""}
                onChange={(e) => setConfig({ ...config, buttonAnchorSelector: e.target.value || undefined })}
                placeholder=".add-to-cart"
                maxLength={300}
              />
              <div style={{ fontSize: 11, color: "var(--mist-dim)", marginTop: 4 }}>{t("customize.anchorSelectorHint")}</div>
            </div>
          )}

          <div className="field" style={{ marginBottom: 14 }}>
            <label>{t("customize.modalWidth")}</label>
            <select
              value={config.modalMaxWidth ?? 560}
              onChange={(e) => setConfig({ ...config, modalMaxWidth: Number(e.target.value) })}
              style={SELECT_STYLE}
            >
              {MODAL_WIDTH_OPTIONS.map((w) => (
                <option key={w.value} value={w.value}>
                  {t(w.labelKey)} ({w.value}px)
                </option>
              ))}
            </select>
          </div>

          <div className="field" style={{ marginBottom: 20 }}>
            <label>{t("customize.modalButtons")}</label>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <input
                  type="checkbox"
                  id="showTryAnother"
                  checked={config.showTryAnotherButton !== false}
                  onChange={(e) => setConfig({ ...config, showTryAnotherButton: e.target.checked })}
                  style={{ width: "auto" }}
                />
                <label htmlFor="showTryAnother" style={{ margin: 0 }}>
                  {t("customize.showTryAnother")}
                </label>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <input
                  type="checkbox"
                  id="showBack"
                  checked={config.showBackButton !== false}
                  onChange={(e) => setConfig({ ...config, showBackButton: e.target.checked })}
                  style={{ width: "auto" }}
                />
                <label htmlFor="showBack" style={{ margin: 0 }}>
                  {t("customize.showBack")}
                </label>
              </div>
            </div>
          </div>

          <h3 style={{ margin: "20px 0 10px", fontSize: 15, borderTop: "1px solid var(--line)", paddingTop: 20 }}>{t("customize.modalColorTitle")}</h3>
          <p style={{ fontSize: 11, color: "var(--mist-dim)", marginBottom: 14 }}>{t("customize.modalColorNote")}</p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
            <div className="field">
              <label>{t("customize.color1")}</label>
              <input
                type="color"
                value={config.modalAccentColorStart ?? config.buttonColorStart ?? "#73b7ff"}
                onChange={(e) => setConfig({ ...config, modalAccentColorStart: e.target.value })}
                style={{ height: 40, padding: 4 }}
              />
            </div>
            <div className="field">
              <label>{t("customize.color2")}</label>
              <input
                type="color"
                value={config.modalAccentColorEnd ?? config.buttonColorEnd ?? "#9f8cff"}
                onChange={(e) => setConfig({ ...config, modalAccentColorEnd: e.target.value })}
                style={{ height: 40, padding: 4 }}
              />
            </div>
          </div>

          <div className="field" style={{ marginBottom: 20 }}>
            <label>{t("customize.textColor")}</label>
            <input
              type="color"
              value={config.modalAccentTextColor ?? config.buttonTextColor ?? "#ffffff"}
              onChange={(e) => setConfig({ ...config, modalAccentTextColor: e.target.value })}
              style={{ height: 40, padding: 4 }}
            />
          </div>

          <h3 style={{ margin: "0 0 10px", fontSize: 15, borderTop: "1px solid var(--line)", paddingTop: 20 }}>{t("customize.modalTextTitle")}</h3>

          <div className="field" style={{ marginBottom: 14 }}>
            <label>{t("customize.modalHeading")}</label>
            <input
              value={config.modalHeading ?? ""}
              onChange={(e) => setConfig({ ...config, modalHeading: e.target.value || undefined })}
              placeholder={t("customize.modalHeadingPlaceholder")}
              maxLength={120}
            />
          </div>

          <div className="field" style={{ marginBottom: 20 }}>
            <label>{t("customize.modalSubheading")}</label>
            <input
              value={config.modalSubheading ?? ""}
              onChange={(e) => setConfig({ ...config, modalSubheading: e.target.value || undefined })}
              placeholder={t("customize.modalSubheadingPlaceholder")}
              maxLength={200}
            />
          </div>
            </>
          )}

          <button className="btn" onClick={save} disabled={saving}>
            {saving ? t("common.saving") : saved ? t("common.saved") : t("common.save")}
          </button>
        </div>

        <div>
          <div className="panel" style={{ padding: 24, marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--mist-dim)", marginBottom: 14, textTransform: "uppercase", letterSpacing: ".06em" }}>
              {t("customize.preview")}
            </div>
            {tab === "button" ? (
              <div style={{ padding: 40, borderRadius: 12, background: "rgba(173,201,255,0.03)", border: "1px solid var(--line)", display: "flex", justifyContent: "center", marginBottom: 20 }}>
                <button type="button" style={previewStyle} className={config.buttonAnimation === "shimmer" ? "lumiframe-preview-shimmer" : undefined} disabled>
                  {config.buttonText || "Try on"}
                </button>
              </div>
            ) : (
              <div style={{ padding: 20, borderRadius: 12, background: "rgba(173,201,255,0.03)", border: "1px solid var(--line)", display: "flex", justifyContent: "center", marginBottom: 20 }}>
                <div
                  style={{
                    width: "100%",
                    maxWidth: config.modalMaxWidth ?? 560,
                    background: "#fff",
                    color: "#111",
                    borderRadius: 16,
                    overflow: "hidden",
                    boxShadow: "0 20px 60px rgba(0,0,0,.35)",
                    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid #f0f0f0" }}>
                    <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase" }}>{t("customize.previewModalBrand")}</span>
                    <span style={{ width: 22, height: 22, borderRadius: "50%", background: "#f2f2f2", color: "#777", fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      ✕
                    </span>
                  </div>
                  <div style={{ padding: 18 }}>
                    <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{config.modalHeading || t("customize.modalHeadingPlaceholder")}</div>
                    <div style={{ fontSize: 12, color: "#999", marginBottom: 14, lineHeight: 1.5 }}>
                      {config.modalSubheading || t("customize.modalSubheadingPlaceholder")}
                    </div>
                    <div
                      style={{
                        border: `1.5px solid ${modalAccentStart}`,
                        borderRadius: 12,
                        background: "#fff",
                        minHeight: 100,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        marginBottom: 14,
                        fontSize: 26,
                      }}
                    >
                      📷
                    </div>
                    <button
                      type="button"
                      disabled
                      style={{
                        width: "100%",
                        padding: "12px",
                        border: "none",
                        borderRadius: 10,
                        fontWeight: 700,
                        fontSize: 13,
                        background: modalBtnBackground,
                        color: modalAccentText,
                        fontFamily: "inherit",
                      }}
                    >
                      {t("customize.previewModalCta")}
                    </button>
                  </div>
                </div>
              </div>
            )}
            <h3 style={{ margin: "0 0 4px", fontSize: 15 }}>{t("integration.snippetTitle")}</h3>
            <p style={{ fontSize: 12, color: "var(--mist)", marginBottom: 14 }}>{t("integration.snippetDesc")}</p>
            <IntegrationSnippet storeId={store.id} widgetConfig={config} />
          </div>

          <div className="panel" style={{ padding: 24 }}>
            <h3 style={{ margin: "0 0 4px", fontSize: 15 }}>{t("integration.domainsTitle")}</h3>
            <p style={{ fontSize: 12, color: "var(--mist)", marginBottom: 14 }}>{t("integration.domainsDesc")}</p>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
              {store.allowedDomains.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </>
  );
}

export default function IntegrationPage() {
  return (
    <AuthGuard>
      <IntegrationContent />
    </AuthGuard>
  );
}
