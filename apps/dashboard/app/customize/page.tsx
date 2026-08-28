"use client";

import { useEffect, useState } from "react";
import { AuthGuard } from "../AuthGuard";
import { IntegrationSnippet } from "../IntegrationSnippet";
import { apiFetch } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { WidgetConfig } from "@/lib/snippet";

interface StoreInfo {
  id: string;
  widgetConfig?: WidgetConfig;
}

const FONT_OPTIONS = [
  { value: "", labelKey: "customize.fontDefault" },
  { value: "'Manrope', sans-serif", labelKey: "customize.fontManrope" },
  { value: "'Inter', sans-serif", labelKey: "customize.fontInter" },
  { value: "'Poppins', sans-serif", labelKey: "customize.fontPoppins" },
  { value: "Georgia, serif", labelKey: "customize.fontGeorgia" },
] as const;

const DEFAULTS: Required<Pick<WidgetConfig, "buttonText" | "buttonColorStart" | "buttonColorEnd" | "buttonTextColor">> = {
  buttonText: "Try on",
  buttonColorStart: "#73b7ff",
  buttonColorEnd: "#9f8cff",
  buttonTextColor: "#ffffff",
};

function CustomizeContent() {
  const { t } = useI18n();
  const [storeId, setStoreId] = useState<string | null>(null);
  const [config, setConfig] = useState<WidgetConfig>(DEFAULTS);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    apiFetch<StoreInfo>("/api/v1/store")
      .then((store) => {
        setStoreId(store.id);
        setConfig({ ...DEFAULTS, ...store.widgetConfig });
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
  if (!storeId) return <div className="empty-state">{t("common.loading")}</div>;

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
    cursor: "pointer",
    boxShadow: config.buttonGlow ? `0 0 18px 2px ${config.buttonColorStart}` : "none",
  };

  return (
    <>
      <div className="page-title">{t("customize.title")}</div>
      <p style={{ fontSize: 13, color: "var(--mist)", marginBottom: 20, maxWidth: 560 }}>{t("customize.desc")}</p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, alignItems: "start" }}>
        <div className="panel" style={{ padding: 24 }}>
          <div className="field" style={{ marginBottom: 14 }}>
            <label>{t("customize.label")}</label>
            <input value={config.buttonText ?? ""} onChange={(e) => setConfig({ ...config, buttonText: e.target.value })} maxLength={60} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
            <div className="field">
              <label>{t("customize.color1")}</label>
              <input type="color" value={config.buttonColorStart} onChange={(e) => setConfig({ ...config, buttonColorStart: e.target.value })} style={{ height: 40, padding: 4 }} />
            </div>
            <div className="field">
              <label>{t("customize.color2")}</label>
              <input type="color" value={config.buttonColorEnd} onChange={(e) => setConfig({ ...config, buttonColorEnd: e.target.value })} style={{ height: 40, padding: 4 }} />
            </div>
          </div>
          <div className="field" style={{ marginBottom: 14 }}>
            <label>{t("customize.textColor")}</label>
            <input type="color" value={config.buttonTextColor} onChange={(e) => setConfig({ ...config, buttonTextColor: e.target.value })} style={{ height: 40, padding: 4 }} />
          </div>
          <div className="field" style={{ marginBottom: 14 }}>
            <label>{t("customize.font")}</label>
            <select
              value={config.buttonFont ?? ""}
              onChange={(e) => setConfig({ ...config, buttonFont: e.target.value || undefined })}
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
              {FONT_OPTIONS.map((f) => (
                <option key={f.value} value={f.value}>
                  {t(f.labelKey)}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ marginBottom: 20, display: "flex", alignItems: "center", gap: 10, flexDirection: "row" }}>
            <input
              type="checkbox"
              id="glow"
              checked={!!config.buttonGlow}
              onChange={(e) => setConfig({ ...config, buttonGlow: e.target.checked })}
              style={{ width: "auto" }}
            />
            <label htmlFor="glow" style={{ margin: 0 }}>
              {t("customize.glow")}
            </label>
          </div>
          <button className="btn" onClick={save} disabled={saving}>
            {saving ? t("common.saving") : saved ? t("common.saved") : t("common.save")}
          </button>
        </div>

        <div className="panel" style={{ padding: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--mist-dim)", marginBottom: 14, textTransform: "uppercase", letterSpacing: ".06em" }}>
            {t("customize.preview")}
          </div>
          <div
            style={{
              padding: 40,
              borderRadius: 12,
              background: "rgba(173,201,255,0.03)",
              border: "1px solid var(--line)",
              display: "flex",
              justifyContent: "center",
              marginBottom: 20,
            }}
          >
            <button type="button" style={previewStyle} disabled>
              {config.buttonText || "Try on"}
            </button>
          </div>
          <IntegrationSnippet storeId={storeId} widgetConfig={config} />
        </div>
      </div>
    </>
  );
}

export default function CustomizePage() {
  return (
    <AuthGuard>
      <CustomizeContent />
    </AuthGuard>
  );
}
