"use client";

import { useState } from "react";
import { AuthGuard } from "../AuthGuard";
import { useI18n, type TranslationKey } from "@/lib/i18n";

const PLATFORMS = [
  { id: "shopify", labelKey: "help.platformShopify", steps: ["help.shopify1", "help.shopify2", "help.shopify3", "help.shopify4"], noteKey: "help.shopifyNote" },
  { id: "wordpress", labelKey: "help.platformWordpress", steps: ["help.wordpress1", "help.wordpress2", "help.wordpress3"], noteKey: "help.wordpressNote" },
  { id: "weblium", labelKey: "help.platformWeblium", steps: ["help.weblium1", "help.weblium2", "help.weblium3"], noteKey: "help.webliumNote" },
  { id: "horoshop", labelKey: "help.platformHoroshop", steps: ["help.horoshop1", "help.horoshop2", "help.horoshop3"], noteKey: "help.horoshopNote" },
  { id: "other", labelKey: "help.platformOther", steps: ["help.other1", "help.other2"], noteKey: "help.otherNote" },
] as const satisfies readonly { id: string; labelKey: TranslationKey; steps: readonly TranslationKey[]; noteKey: TranslationKey }[];

type PlatformId = (typeof PLATFORMS)[number]["id"];

const OTHER_STEPS: { icon: string; titleKey: TranslationKey; bodyKey: TranslationKey }[] = [
  { icon: "🎨", titleKey: "help.step2Title", bodyKey: "help.step2Body" },
  { icon: "🖼️", titleKey: "help.step3Title", bodyKey: "help.step3Body" },
  { icon: "📊", titleKey: "help.step4Title", bodyKey: "help.step4Body" },
  { icon: "👥", titleKey: "help.step5Title", bodyKey: "help.step5Body" },
  { icon: "💬", titleKey: "help.step6Title", bodyKey: "help.step6Body" },
];

function HelpContent() {
  const { t } = useI18n();
  const [platform, setPlatform] = useState<PlatformId>("shopify");
  const active = PLATFORMS.find((p) => p.id === platform)!;

  return (
    <>
      <div className="page-title">{t("help.title")}</div>
      <p style={{ fontSize: 13, color: "var(--mist)", marginBottom: 24, maxWidth: 620, lineHeight: 1.6 }}>{t("help.intro")}</p>

      <div className="panel" style={{ padding: 24, marginBottom: 14, maxWidth: 720 }}>
        <h3 style={{ margin: "0 0 4px", fontSize: 15 }}>{t("help.installTitle")}</h3>
        <p style={{ fontSize: 12, color: "var(--mist)", marginBottom: 16 }}>{t("help.installDesc")}</p>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 18 }}>
          {PLATFORMS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPlatform(p.id)}
              style={{
                padding: "8px 14px",
                borderRadius: 999,
                border: platform === p.id ? "1px solid var(--sky)" : "1px solid var(--line-strong)",
                background: platform === p.id ? "rgba(115,183,255,0.12)" : "rgba(255,255,255,0.05)",
                color: platform === p.id ? "var(--paper)" : "var(--mist)",
                fontSize: 13,
                fontWeight: platform === p.id ? 700 : 500,
                cursor: "pointer",
              }}
            >
              {t(p.labelKey)}
            </button>
          ))}
        </div>

        <ol style={{ margin: "0 0 14px", paddingLeft: 20, display: "flex", flexDirection: "column", gap: 10 }}>
          {active.steps.map((stepKey) => (
            <li key={stepKey} style={{ fontSize: 13, color: "var(--paper)", lineHeight: 1.6 }}>
              {t(stepKey)}
            </li>
          ))}
        </ol>
        <p style={{ fontSize: 12, color: "var(--mist-dim)", lineHeight: 1.6, margin: 0, borderTop: "1px solid var(--line)", paddingTop: 12 }}>
          {t(active.noteKey)}
        </p>
      </div>

      <div style={{ display: "grid", gap: 14, maxWidth: 720 }}>
        {OTHER_STEPS.map((step) => (
          <div key={step.titleKey} className="panel" style={{ padding: 20, display: "flex", gap: 16, alignItems: "flex-start" }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: "rgba(255,255,255,0.08)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 20,
                flexShrink: 0,
              }}
            >
              {step.icon}
            </div>
            <div>
              <h3 style={{ margin: "0 0 6px", fontSize: 15 }}>{t(step.titleKey)}</h3>
              <p style={{ margin: 0, fontSize: 13, color: "var(--mist)", lineHeight: 1.6 }}>{t(step.bodyKey)}</p>
            </div>
          </div>
        ))}
      </div>

      <p style={{ fontSize: 12, color: "var(--mist-dim)", marginTop: 24 }}>{t("help.needHelp")}</p>
    </>
  );
}

export default function HelpPage() {
  return (
    <AuthGuard>
      <HelpContent />
    </AuthGuard>
  );
}
