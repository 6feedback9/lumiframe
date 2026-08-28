"use client";

import { AuthGuard } from "../AuthGuard";
import { useI18n, type TranslationKey } from "@/lib/i18n";

const STEPS: { icon: string; titleKey: TranslationKey; bodyKey: TranslationKey }[] = [
  { icon: "🔌", titleKey: "help.step1Title", bodyKey: "help.step1Body" },
  { icon: "🎨", titleKey: "help.step2Title", bodyKey: "help.step2Body" },
  { icon: "🖼️", titleKey: "help.step3Title", bodyKey: "help.step3Body" },
  { icon: "📊", titleKey: "help.step4Title", bodyKey: "help.step4Body" },
  { icon: "👥", titleKey: "help.step5Title", bodyKey: "help.step5Body" },
  { icon: "💬", titleKey: "help.step6Title", bodyKey: "help.step6Body" },
];

function HelpContent() {
  const { t } = useI18n();

  return (
    <>
      <div className="page-title">{t("help.title")}</div>
      <p style={{ fontSize: 13, color: "var(--mist)", marginBottom: 24, maxWidth: 620, lineHeight: 1.6 }}>{t("help.intro")}</p>

      <div style={{ display: "grid", gap: 14, maxWidth: 720 }}>
        {STEPS.map((step) => (
          <div key={step.titleKey} className="panel" style={{ padding: 20, display: "flex", gap: 16, alignItems: "flex-start" }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: "rgba(173,201,255,0.08)",
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
