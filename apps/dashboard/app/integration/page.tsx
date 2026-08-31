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
  maxTryOnsPerVisitor?: number | null;
}

const FONT_OPTIONS = [
  { value: "", labelKey: "customize.fontDefault" },
  { value: "'Manrope', sans-serif", labelKey: "customize.fontManrope" },
  { value: "'Inter', sans-serif", labelKey: "customize.fontInter" },
  { value: "'Poppins', sans-serif", labelKey: "customize.fontPoppins" },
  { value: "Georgia, serif", labelKey: "customize.fontGeorgia" },
] as const;

const SHAPE_OPTIONS = [
  { value: "rounded", labelKey: "customize.shapeRounded" },
  { value: "rectangular", labelKey: "customize.shapeRectangular" },
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

const CARD_VARIANT_OPTIONS = [
  { value: "corner", labelKey: "customize.cardVariantCorner", descKey: "customize.cardVariantCornerDesc" },
  { value: "drawer", labelKey: "customize.cardVariantDrawer", descKey: "customize.cardVariantDrawerDesc" },
  { value: "scrim", labelKey: "customize.cardVariantScrim", descKey: "customize.cardVariantScrimDesc" },
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
    | "buttonWidth"
    | "buttonShape"
    | "buttonAnimation"
    | "buttonPosition"
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
  buttonStyle: "gradient",
  buttonSize: 100,
  buttonWidth: 100,
  buttonShape: "rounded",
  buttonAnimation: "none",
  buttonPosition: "after",
  showTryAnotherButton: true,
  showBackButton: true,
  cardButtonEnabled: false,
  cardButtonVariant: "corner",
};

const SELECT_STYLE: React.CSSProperties = {
  width: "100%",
  padding: "9px 12px",
  borderRadius: 10,
  border: "1px solid var(--line-strong)",
  background: "rgba(255,255,255,0.05)",
  color: "var(--paper)",
  fontSize: 13,
};

// A plain, non-interpolated string — the exact same reference on every
// render, so React never touches this <style> tag's DOM node at all once
// mounted (a primitive child that hasn't changed is a no-op update). The
// handful of values that actually vary with the merchant's chosen colors
// come in as CSS custom properties, set inline on a wrapper further down
// instead of baked into this text — updating a custom property is a cheap
// style recalculation, not a full stylesheet re-parse. This used to be a
// template literal rebuilt with the live color values on every render,
// which meant retyping a hex code or dragging the color picker reparsed
// this whole block on every keystroke/drag frame (product report: the
// page "подлагивает" — this was the actual cause on this page).
const PREVIEW_CSS = `
  @keyframes lumiframe-preview-pulse {
    0% { box-shadow: 0 0 0 0 var(--lumi-pulse-color, rgba(115,183,255,.6)); }
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

  /* Mini-card preview (tab === "card") — same three variants
     packages/sdk/src/index.ts injects on a real storefront, scoped
     under .lumi-card-preview so it can't leak into the rest of this
     settings page. */
  .lumi-card-preview { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .lumi-card-thumb { position: relative; aspect-ratio: 4/5; border-radius: 10px; overflow: hidden; background: #f2f1ee; }
  .lumi-card-name { font-size: 11px; font-weight: 600; margin-top: 8px; color: var(--paper); }

  .lumi-card-badge {
    position: absolute; top: 8px; right: 8px; width: 28px; height: 28px; border-radius: 50%;
    background: #fff; box-shadow: 0 2px 8px rgba(20,20,30,.16);
    display: flex; align-items: center; justify-content: center; overflow: hidden; white-space: nowrap;
    color: var(--lumi-accent-1, #73b7ff); transition: width .2s ease;
  }
  .lumi-card-badge span { font-size: 10.5px; font-weight: 700; color: #171923; opacity: 0; max-width: 0; margin-left: 0; transition: opacity .15s ease, max-width .2s ease; }
  .lumi-card-thumb:hover .lumi-card-badge { width: 118px; border-radius: 14px; }
  .lumi-card-thumb:hover .lumi-card-badge span { opacity: 1; max-width: 84px; margin-left: 6px; }

  .lumi-card-drawer {
    position: absolute; left: 0; right: 0; bottom: 0; height: 32px;
    background: var(--lumi-accent-bg, linear-gradient(135deg, #73b7ff, #9f8cff)); color: var(--lumi-accent-contrast, #fff);
    display: flex; align-items: center; justify-content: center; gap: 6px; font-size: 10.5px; font-weight: 700;
    transform: translateY(100%); transition: transform .2s cubic-bezier(.2,.8,.2,1);
  }
  .lumi-card-thumb:hover .lumi-card-drawer { transform: translateY(0); }

  .lumi-card-scrim {
    position: absolute; inset: 0; display: flex; align-items: flex-end; justify-content: center; padding-bottom: 12px;
    background: transparent; transition: background .2s ease;
  }
  .lumi-card-thumb:hover .lumi-card-scrim { background: rgba(17,19,25,.22); }
  .lumi-card-scrim-pill {
    display: flex; align-items: center; gap: 6px; background: #fff; color: #171923; font-size: 10.5px; font-weight: 700;
    padding: 7px 12px; border-radius: 999px; box-shadow: 0 6px 18px rgba(0,0,0,.18);
    opacity: 0; transform: translateY(6px); transition: opacity .15s ease, transform .15s ease;
  }
  .lumi-card-thumb:hover .lumi-card-scrim-pill { opacity: 1; transform: translateY(0); }
`;

const TABS = [
  { id: "button", labelKey: "integration.tabButton" },
  { id: "modal", labelKey: "integration.tabModal" },
  { id: "card", labelKey: "integration.tabCard" },
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
  // Per-visitor try-on cap (product ask: anti-abuse). Kept as a plain text
  // input rather than a controlled number — empty means "unlimited" and
  // shouldn't fight the user by snapping back to 0.
  const [visitorLimit, setVisitorLimit] = useState("");
  const [savingLimit, setSavingLimit] = useState(false);
  const [savedLimit, setSavedLimit] = useState(false);

  // Allowed domains — the actual security allowlist (apps/api's
  // isAllowedProductUrl), separate from the informational "store URL" the
  // platform admin can edit elsewhere. Nothing kept them in sync, and
  // until now this list was read-only everywhere — a merchant re-pointing
  // storeUrl (e.g. a fresh Shopify preview link, which changes every
  // session) had no way to actually update what the widget accepts.
  const [domains, setDomains] = useState<string[]>([]);
  const [newDomain, setNewDomain] = useState("");
  const [savingDomains, setSavingDomains] = useState(false);
  const [domainsError, setDomainsError] = useState<string | null>(null);

  // CSS selector for the page's live product image — folded into the
  // generated snippet's TryOn.init() call (packages/sdk's own
  // productImageSelector option) rather than something a merchant edits
  // by hand each time. Only needed for a product with color/style
  // swatches — see integration.imageSelectorDesc below.
  const [imageSelector, setImageSelector] = useState("");
  const [savingImageSelector, setSavingImageSelector] = useState(false);
  const [savedImageSelector, setSavedImageSelector] = useState(false);

  useEffect(() => {
    apiFetch<StoreInfo>("/api/v1/store")
      .then((s) => {
        setStore(s);
        setConfig({ ...DEFAULTS, ...s.widgetConfig });
        setVisitorLimit(s.maxTryOnsPerVisitor ? String(s.maxTryOnsPerVisitor) : "");
        setDomains(s.allowedDomains);
        setImageSelector(s.widgetConfig?.productImageSelector ?? "");
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

  async function saveVisitorLimit() {
    setSavingLimit(true);
    setSavedLimit(false);
    const n = Number(visitorLimit);
    const value = visitorLimit.trim() && Number.isFinite(n) && n > 0 ? Math.round(n) : null;
    try {
      await apiFetch("/api/v1/store", { method: "PATCH", body: JSON.stringify({ maxTryOnsPerVisitor: value }) });
      setVisitorLimit(value ? String(value) : "");
      setSavedLimit(true);
      setTimeout(() => setSavedLimit(false), 2500);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingLimit(false);
    }
  }

  async function persistDomains(next: string[]) {
    setSavingDomains(true);
    setDomainsError(null);
    try {
      const updated = await apiFetch<StoreInfo>("/api/v1/store", { method: "PATCH", body: JSON.stringify({ allowedDomains: next }) });
      setDomains(updated.allowedDomains);
    } catch (err) {
      setDomainsError((err as Error).message);
    } finally {
      setSavingDomains(false);
    }
  }

  function addDomain() {
    const trimmed = newDomain.trim();
    if (!trimmed || domains.includes(trimmed)) {
      setNewDomain("");
      return;
    }
    setNewDomain("");
    void persistDomains([...domains, trimmed]);
  }

  function removeDomain(domain: string) {
    // updateStoreSchema requires a non-empty array — the widget would
    // otherwise accept requests from nowhere at all, which reads as
    // "broken" rather than "locked down" from the merchant's side.
    if (domains.length <= 1) {
      setDomainsError(t("integration.domainsEmptyError"));
      return;
    }
    void persistDomains(domains.filter((d) => d !== domain));
  }

  async function saveImageSelector() {
    setSavingImageSelector(true);
    setSavedImageSelector(false);
    const trimmed = imageSelector.trim();
    try {
      await apiFetch("/api/v1/store", { method: "PATCH", body: JSON.stringify({ widgetConfig: { productImageSelector: trimmed } }) });
      // Also update the live-preview `config` state — that's what
      // IntegrationSnippet actually renders, and it's a separate slice
      // from this panel's own imageSelector state (same split as
      // domains/visitorLimit above), so the generated snippet box
      // wouldn't otherwise reflect this save until a page reload.
      setConfig((prev) => ({ ...prev, productImageSelector: trimmed || undefined }));
      setSavedImageSelector(true);
      setTimeout(() => setSavedImageSelector(false), 2500);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingImageSelector(false);
    }
  }

  if (error) return <div className="empty-state">{error}</div>;
  if (!store) return <div className="empty-state">{t("common.loading")}</div>;

  const sizeScale = (config.buttonSize ?? 100) / 100;
  // Horizontal-only stretch on top of sizeScale — mirrors packages/sdk's
  // --lumiframe-width-scale, so "make it longer" doesn't also make it taller.
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

      <style>{PREVIEW_CSS}</style>

      <div
        style={
          {
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 20,
            alignItems: "start",
            // Feeds PREVIEW_CSS above — only these three custom properties
            // change as the merchant edits colors, so only they get
            // touched on each keystroke/drag, not the stylesheet text.
            "--lumi-accent-1": config.buttonColorStart,
            "--lumi-accent-bg": previewBackground,
            "--lumi-accent-contrast": config.buttonTextColor,
            "--lumi-pulse-color": `${config.buttonColorStart}99`,
          } as React.CSSProperties
        }
      >
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
              <option value="outline">{t("customize.styleOutline")}</option>
            </select>
          </div>

          {/* One row of same-width swatches whenever there are exactly two to
              show — [color1, color2] for gradient, [fill, text] for solid.
              Outline only ever has the one (no text-color field — see
              isOutline below), so it stays alone in its own row. */}
          <div style={{ display: "grid", gridTemplateColumns: config.buttonStyle === "outline" ? "1fr" : "1fr 1fr", gap: 14, marginBottom: 14 }}>
            <div className="field">
              <label>{config.buttonStyle === "gradient" ? t("customize.color1") : t("customize.style")}</label>
              <input type="color" value={config.buttonColorStart} onChange={(e) => setConfig({ ...config, buttonColorStart: e.target.value })} style={{ height: 40, padding: 4 }} />
            </div>
            {config.buttonStyle === "gradient" && (
              <div className="field">
                <label>{t("customize.color2")}</label>
                <input type="color" value={config.buttonColorEnd} onChange={(e) => setConfig({ ...config, buttonColorEnd: e.target.value })} style={{ height: 40, padding: 4 }} />
              </div>
            )}
            {config.buttonStyle === "solid" && (
              <div className="field">
                <label>{t("customize.textColor")}</label>
                <input type="color" value={config.buttonTextColor} onChange={(e) => setConfig({ ...config, buttonTextColor: e.target.value })} style={{ height: 40, padding: 4 }} />
              </div>
            )}
          </div>

          {config.buttonStyle === "gradient" && (
          <div className="field" style={{ marginBottom: 14 }}>
            <label>{t("customize.textColor")}</label>
            <input type="color" value={config.buttonTextColor} onChange={(e) => setConfig({ ...config, buttonTextColor: e.target.value })} style={{ height: 40, padding: 4 }} />
          </div>
          )}

          <div className="field" style={{ marginBottom: 14 }}>
            <label>
              {t("customize.size")} — {config.buttonSize ?? 100}%
            </label>
            <input
              type="range"
              min={70}
              max={160}
              step={5}
              value={config.buttonSize ?? 100}
              onChange={(e) => setConfig({ ...config, buttonSize: Number(e.target.value) })}
              style={{ width: "100%", accentColor: "var(--sky)" }}
            />
          </div>

          <div className="field" style={{ marginBottom: 14 }}>
            <label>
              {t("customize.width")} — {config.buttonWidth ?? 100}%
            </label>
            <input
              type="range"
              min={100}
              max={300}
              step={10}
              value={config.buttonWidth ?? 100}
              onChange={(e) => setConfig({ ...config, buttonWidth: Number(e.target.value) })}
              style={{ width: "100%", accentColor: "var(--sky)" }}
            />
          </div>

          <div className="field" style={{ marginBottom: 14 }}>
            <label>{t("customize.shape")}</label>
            <select
              value={config.buttonShape ?? "rounded"}
              onChange={(e) => setConfig({ ...config, buttonShape: e.target.value as WidgetConfig["buttonShape"] })}
              style={SELECT_STYLE}
            >
              {SHAPE_OPTIONS.map((s) => (
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

          <h3 style={{ margin: "6px 0 14px", fontSize: 15, borderTop: "1px solid var(--line)", paddingTop: 20 }}>{t("customize.placementTitle")}</h3>

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
            </>
          )}

          {tab === "modal" && (
            <>
          <div className="field" style={{ marginBottom: 4 }}>
            <label>{t("customize.modalLayout")}</label>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
            {(
              [
                { value: "split", label: "customize.modalLayoutSplit", desc: "customize.modalLayoutSplitDesc" },
                { value: "compact", label: "customize.modalLayoutCompact", desc: "customize.modalLayoutCompactDesc" },
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

          {tab === "card" && (
            <>
          <p style={{ fontSize: 12.5, color: "var(--mist)", marginBottom: 18, lineHeight: 1.6 }}>{t("customize.cardDesc")}</p>

          <div className="field" style={{ marginBottom: 20, display: "flex", alignItems: "center", gap: 10, flexDirection: "row" }}>
            <input
              type="checkbox"
              id="cardEnable"
              checked={!!config.cardButtonEnabled}
              onChange={(e) => setConfig({ ...config, cardButtonEnabled: e.target.checked })}
              style={{ width: "auto" }}
            />
            <label htmlFor="cardEnable" style={{ margin: 0 }}>
              {t("customize.cardEnable")}
            </label>
          </div>

          <div className="field" style={{ marginBottom: 4 }}>
            <label>{t("customize.cardVariant")}</label>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 20 }}>
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
                <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 3 }}>{t(v.labelKey)}</div>
                <div style={{ fontSize: 11, color: "var(--mist)", lineHeight: 1.4 }}>{t(v.descKey)}</div>
              </button>
            ))}
          </div>

          <p style={{ fontSize: 11.5, color: "var(--mist-dim)", lineHeight: 1.6 }}>{t("customize.cardNote")}</p>
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
              <div style={{ padding: 40, borderRadius: 12, background: "rgba(255,255,255,0.03)", border: "1px solid var(--line)", display: "flex", justifyContent: "center", marginBottom: 20 }}>
                <button type="button" style={previewStyle} className={config.buttonAnimation === "shimmer" ? "lumiframe-preview-shimmer" : undefined} disabled>
                  {config.buttonText || "Try on"}
                </button>
              </div>
            ) : tab === "modal" ? (
              config.modalLayout === "compact" ? (
              <div
                style={{
                  padding: 26, borderRadius: 12, background: "#2a2c33", marginBottom: 20,
                  display: "flex", justifyContent: "flex-start",
                  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                }}
              >
                {/* Small floating card over a dimmed page — same content
                    as the split layout's photo panel, just the shell that
                    changes. */}
                <div style={{ width: 220, background: "#fff", borderRadius: 16, padding: "20px 16px 16px", boxShadow: "0 16px 40px rgba(0,0,0,.4)", position: "relative" }}>
                  <div style={{ position: "absolute", top: 8, right: 8, width: 20, height: 20, borderRadius: "50%", background: "rgba(0,0,0,.06)", fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center", color: "#444" }}>
                    ✕
                  </div>
                  <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "#aaa", marginBottom: 6 }}>
                    {t("customize.previewModalBrand")}
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", marginBottom: 10, color: "#111" }}>
                    {config.modalHeading || t("customize.modalHeadingPlaceholder")}
                  </div>
                  <div style={{ borderRadius: 12, border: "1.5px dashed #d6d6d4", background: "#fafafa", aspectRatio: "3 / 4", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 10, fontSize: 18 }}>
                    🧍
                  </div>
                  <button
                    type="button"
                    disabled
                    style={{
                      width: "100%", padding: "8px", border: "none",
                      borderRadius: config.buttonShape === "rectangular" ? 6 : 8,
                      fontWeight: 700, fontSize: 9, letterSpacing: ".02em", textTransform: "uppercase",
                      background: modalBtnBackground, color: modalAccentText, fontFamily: "inherit",
                    }}
                  >
                    {t("customize.previewModalCta")}
                  </button>
                </div>
              </div>
              ) : (
              <div style={{ padding: 0, borderRadius: 12, overflow: "hidden", border: "1px solid var(--line)", marginBottom: 20 }}>
                <div
                  style={{
                    display: "flex",
                    minHeight: 380,
                    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                  }}
                >
                  {/* Photo panel */}
                  <div style={{ flex: 1, background: "#f6f6f5", color: "#111", padding: "24px 18px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
                    <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "#aaa", marginBottom: 8 }}>
                      {t("customize.previewModalBrand")}
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 800, textTransform: "uppercase", marginBottom: 6 }}>
                      {config.modalHeading || t("customize.modalHeadingPlaceholder")}
                    </div>
                    <div style={{ fontSize: 10, color: "#8a8a8a", marginBottom: 12, lineHeight: 1.5 }}>
                      {config.modalSubheading || t("customize.modalSubheadingPlaceholder")}
                    </div>
                    <div
                      style={{
                        position: "relative",
                        borderRadius: 10,
                        background: "#e7e7e6",
                        aspectRatio: "3 / 4",
                        maxHeight: 140,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        marginBottom: 10,
                        fontSize: 20,
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
                        {t("customize.previewModalBadge")}
                      </span>
                      🧍
                    </div>
                    <div style={{ fontSize: 9, color: "#999", marginBottom: 10 }}>
                      ✓ {t("customize.previewModalTip")}
                    </div>
                    <button
                      type="button"
                      disabled
                      style={{
                        width: "100%",
                        padding: "9px",
                        border: "none",
                        borderRadius: config.buttonShape === "rectangular" ? 6 : 8,
                        fontWeight: 700,
                        fontSize: 10,
                        letterSpacing: ".02em",
                        textTransform: "uppercase",
                        background: modalBtnBackground,
                        color: modalAccentText,
                        fontFamily: "inherit",
                      }}
                    >
                      {t("customize.previewModalCta")}
                    </button>
                  </div>

                  {/* Product panel */}
                  <div style={{ flex: 1, background: "#fff", color: "#111", padding: "24px 18px", display: "flex", flexDirection: "column", justifyContent: "center", borderLeft: "1px solid #ececec" }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 16 }}>
                      <div style={{ width: 36, height: 44, borderRadius: 8, background: "#eee", flexShrink: 0 }} />
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700 }}>{t("customize.previewProductName")}</div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#111" }}>$49</div>
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled
                      style={{
                        width: "100%",
                        padding: "9px",
                        border: "none",
                        borderRadius: config.buttonShape === "rectangular" ? 6 : 8,
                        fontWeight: 700,
                        fontSize: 10,
                        letterSpacing: ".02em",
                        textTransform: "uppercase",
                        background: modalBtnBackground,
                        color: modalAccentText,
                        fontFamily: "inherit",
                      }}
                    >
                      {t("customize.previewModalAddToCart")}
                    </button>
                  </div>
                </div>
              </div>
              )
            ) : (
              <div style={{ padding: 20, borderRadius: 12, background: "rgba(255,255,255,0.03)", border: "1px solid var(--line)", marginBottom: 20 }}>
                {!config.cardButtonEnabled && (
                  <p style={{ fontSize: 11.5, color: "var(--mist-dim)", marginBottom: 12 }}>{t("customize.cardPreviewOff")}</p>
                )}
                <div className="lumi-card-preview" style={{ opacity: config.cardButtonEnabled ? 1 : 0.45 }}>
                  {[0, 1].map((i) => (
                    <div key={i}>
                      <div className="lumi-card-thumb">
                        <svg viewBox="0 0 64 32" fill="none" style={{ width: "60%", height: "60%", position: "absolute", inset: 0, margin: "auto" }}>
                          <ellipse cx="16" cy="16" rx="13" ry="10" stroke="#c3b8a4" strokeWidth="2" />
                          <ellipse cx="48" cy="16" rx="13" ry="10" stroke="#c3b8a4" strokeWidth="2" />
                          <path d="M29 16h6M3 14l-3 4M61 14l3 4" stroke="#c3b8a4" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                        {(config.cardButtonVariant ?? "corner") === "corner" && (
                          <div className="lumi-card-badge">
                            <svg viewBox="0 0 20 12" fill="none" width="13" height="13">
                              <path d="M1 6C2.5 3 5 1 10 1s7.5 2 9 5c-1.5 3-4 5-9 5s-7.5-2-9-5z" stroke="currentColor" strokeWidth="1.4" />
                              <circle cx="10" cy="6" r="2" fill="currentColor" />
                            </svg>
                            <span>{config.buttonText || "Try on"}</span>
                          </div>
                        )}
                        {config.cardButtonVariant === "drawer" && (
                          <div className="lumi-card-drawer">
                            <svg viewBox="0 0 20 12" fill="none" width="13" height="13">
                              <path d="M1 6C2.5 3 5 1 10 1s7.5 2 9 5c-1.5 3-4 5-9 5s-7.5-2-9-5z" stroke="currentColor" strokeWidth="1.4" />
                              <circle cx="10" cy="6" r="2" fill="currentColor" />
                            </svg>
                            {config.buttonText || "Try on"}
                          </div>
                        )}
                        {config.cardButtonVariant === "scrim" && (
                          <div className="lumi-card-scrim">
                            <div className="lumi-card-scrim-pill">
                              <svg viewBox="0 0 20 12" fill="none" width="13" height="13">
                                <path d="M1 6C2.5 3 5 1 10 1s7.5 2 9 5c-1.5 3-4 5-9 5s-7.5-2-9-5z" stroke="currentColor" strokeWidth="1.4" />
                                <circle cx="10" cy="6" r="2" fill="currentColor" />
                              </svg>
                              <span>{config.buttonText || "Try on"}</span>
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="lumi-card-name">{t("customize.cardPreviewProduct")}</div>
                    </div>
                  ))}
                </div>
                <p style={{ fontSize: 11, color: "var(--mist-dim)", marginTop: 14, lineHeight: 1.5 }}>{t("customize.cardPreviewHint")}</p>
              </div>
            )}
            <h3 style={{ margin: "0 0 4px", fontSize: 15 }}>{t("integration.snippetTitle")}</h3>
            <p style={{ fontSize: 12, color: "var(--mist)", marginBottom: 14 }}>{t("integration.snippetDesc")}</p>
            <IntegrationSnippet storeId={store.id} widgetConfig={config} />
          </div>

          <div className="panel" style={{ padding: 24 }}>
            <h3 style={{ margin: "0 0 4px", fontSize: 15 }}>{t("integration.domainsTitle")}</h3>
            <p style={{ fontSize: 12, color: "var(--mist)", marginBottom: 14 }}>{t("integration.domainsDesc")}</p>
            <ul style={{ margin: "0 0 12px", padding: 0, fontSize: 13, listStyle: "none" }}>
              {domains.map((d) => (
                <li key={d} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "6px 0" }}>
                  <span>{d}</span>
                  <button
                    type="button"
                    aria-label={t("integration.domainsRemove")}
                    onClick={() => removeDomain(d)}
                    disabled={savingDomains}
                    style={{ background: "none", border: "none", color: "var(--mist-dim)", cursor: "pointer", fontSize: 16, lineHeight: 1, padding: 4 }}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <div className="field" style={{ flex: 1 }}>
                <input
                  type="text"
                  value={newDomain}
                  onChange={(e) => setNewDomain(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addDomain();
                    }
                  }}
                  placeholder={t("integration.domainsAddPlaceholder")}
                />
              </div>
              <button className="btn" style={{ width: "auto", padding: "9px 16px" }} disabled={savingDomains || !newDomain.trim()} onClick={addDomain}>
                {savingDomains ? t("common.saving") : t("integration.domainsAdd")}
              </button>
            </div>
            {domainsError && <p className="error-text">{domainsError}</p>}
          </div>

          <div className="panel" style={{ padding: 24 }}>
            <h3 style={{ margin: "0 0 4px", fontSize: 15 }}>{t("integration.imageSelectorTitle")}</h3>
            <p style={{ fontSize: 12, color: "var(--mist)", marginBottom: 14 }}>{t("integration.imageSelectorDesc")}</p>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <div className="field" style={{ flex: 1 }}>
                <input
                  type="text"
                  value={imageSelector}
                  onChange={(e) => setImageSelector(e.target.value)}
                  placeholder={t("integration.imageSelectorPlaceholder")}
                  maxLength={300}
                />
              </div>
              <button className="btn" style={{ width: "auto", padding: "9px 16px" }} disabled={savingImageSelector} onClick={saveImageSelector}>
                {savingImageSelector ? t("common.saving") : savedImageSelector ? "✓" : t("common.save")}
              </button>
            </div>
          </div>

          <div className="panel" style={{ padding: 24 }}>
            <h3 style={{ margin: "0 0 4px", fontSize: 15 }}>{t("integration.visitorLimitTitle")}</h3>
            <p style={{ fontSize: 12, color: "var(--mist)", marginBottom: 4 }}>{t("integration.visitorLimitDesc")}</p>
            <p style={{ fontSize: 12, color: "var(--sky)", marginBottom: 14 }}>
              {t("integration.visitorLimitCurrent")}: {visitorLimit || t("integration.visitorLimitUnlimited")}
            </p>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <div className="field" style={{ width: 220 }}>
                <input
                  type="number"
                  min={1}
                  max={1000}
                  value={visitorLimit}
                  onChange={(e) => setVisitorLimit(e.target.value)}
                  placeholder={t("integration.visitorLimitUnlimited")}
                />
              </div>
              <button className="btn" style={{ width: "auto", padding: "9px 16px" }} disabled={savingLimit} onClick={saveVisitorLimit}>
                {savingLimit ? t("common.saving") : savedLimit ? "✓" : t("common.save")}
              </button>
            </div>
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
