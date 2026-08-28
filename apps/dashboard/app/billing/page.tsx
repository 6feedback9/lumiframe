"use client";

import { useEffect, useState } from "react";
import { AuthGuard } from "../AuthGuard";
import { apiFetch } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

interface PlanInfo {
  key: string;
  name: string;
  monthlyLimit: number;
  priceUsd: number;
  topUpPackSize: number;
  topUpPackPriceUsd: number;
}

interface BillingInfo {
  plan: PlanInfo | null;
  usedThisMonth: number;
  topUpCredits: number;
  planRequestNote: string | null;
  planRequestedAt: string | null;
  allPlans: PlanInfo[];
  trialAvailable: boolean;
  trialCredits: number;
}

// Lumi Web Agency's own bank details — every merchant pays the same
// account (this is the platform owner's business, not per-tenant), so
// these are a plain constant rather than a DB-backed setting.
const PAYMENT_DETAILS = {
  recipient: "ФОП Єрьоміна Марія Миколаївна",
  taxId: "3503210546",
  iban: "UA663052990000026001004902429",
  bank: "АТ КБ «ПРИВАТБАНК»",
};

// What the merchant is confirming payment for when the popup opens —
// either one of the plan cards or the top-up pack. `label` is the
// human-readable line the popup shows ("Growth — $99/mo"), precomputed by
// the caller so the popup itself doesn't need to re-derive pack pricing.
type PayTarget = { kind: "plan"; planKey: string; label: string } | { kind: "topup"; label: string };

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // clipboard unavailable — the value is still selectable by hand
    }
  }
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 11, color: "var(--mist-dim)", marginBottom: 2 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ fontSize: 13, fontFamily: "monospace", wordBreak: "break-all" }}>{value}</div>
        <button
          type="button"
          onClick={copy}
          style={{
            flexShrink: 0,
            border: "1px solid var(--line-strong)",
            background: "rgba(173,201,255,0.05)",
            color: copied ? "var(--sky)" : "var(--mist)",
            borderRadius: 8,
            padding: "3px 8px",
            fontSize: 11,
            cursor: "pointer",
          }}
        >
          {copied ? "✓" : "⧉"}
        </button>
      </div>
    </div>
  );
}

function ProgressBar({ used, limit }: { used: number; limit: number }) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const danger = limit > 0 && used >= limit;
  return (
    <div style={{ height: 8, borderRadius: 999, background: "rgba(173,201,255,0.08)", overflow: "hidden" }}>
      <div
        style={{
          height: "100%",
          width: `${pct}%`,
          background: danger ? "var(--danger, #ff6b6b)" : "linear-gradient(135deg, #73b7ff, #9f8cff)",
          transition: "width .3s ease",
        }}
      />
    </div>
  );
}

// The order → requisites → "I've paid" flow lives entirely in this popup now
// (product ask: clicking a plan should show payment details right there,
// not send a silent "interested" ping while the actual payment details sit
// in an unrelated section further down the page). Confirming always sends
// kind: "paid" — the platform owner sees exactly what was paid for and
// activates it herself.
function PaymentPopup({ target, onClose, onPaid }: { target: PayTarget; onClose: () => void; onPaid: () => void }) {
  const { t } = useI18n();
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmPaid() {
    setSending(true);
    setError(null);
    try {
      await apiFetch("/api/v1/billing/request", {
        method: "POST",
        body: JSON.stringify({
          kind: "paid",
          planKey: target.kind === "plan" ? target.planKey : undefined,
          topUp: target.kind === "topup",
          message: note || undefined,
        }),
      });
      setSent(true);
      onPaid();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(6,10,20,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        className="panel"
        style={{ padding: 26, maxWidth: 460, width: "100%", position: "relative", maxHeight: "90vh", overflowY: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label={t("billing.payPopupClose")}
          style={{
            position: "absolute",
            top: 14,
            right: 14,
            width: 28,
            height: 28,
            borderRadius: "50%",
            border: "1px solid var(--line-strong)",
            background: "rgba(173,201,255,0.05)",
            color: "var(--mist)",
            cursor: "pointer",
            fontSize: 14,
          }}
        >
          ×
        </button>

        <h3 style={{ margin: "0 20px 4px 0", fontSize: 17 }}>{target.label}</h3>
        <p style={{ fontSize: 12, color: "var(--mist)", margin: "0 0 18px", lineHeight: 1.5 }}>{t("billing.paymentDesc")}</p>

        <CopyRow label={t("billing.recipient")} value={PAYMENT_DETAILS.recipient} />
        <CopyRow label={t("billing.taxId")} value={PAYMENT_DETAILS.taxId} />
        <CopyRow label={t("billing.iban")} value={PAYMENT_DETAILS.iban} />
        <CopyRow label={t("billing.bank")} value={PAYMENT_DETAILS.bank} />
        <CopyRow label={t("billing.purpose")} value={t("billing.purposeValue")} />

        <div className="field" style={{ marginTop: 14, marginBottom: 14 }}>
          <label>{t("billing.paidNote")}</label>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("billing.paidNotePlaceholder")} maxLength={300} />
        </div>

        {error && <p style={{ fontSize: 12, color: "var(--danger, #ff6b6b)", marginBottom: 12 }}>{error}</p>}

        {sent ? (
          <p style={{ fontSize: 12, color: "var(--sky)" }}>{t("billing.paidSent")}</p>
        ) : (
          <button className="btn" style={{ width: "100%", padding: "10px 16px" }} disabled={sending} onClick={confirmPaid}>
            {sending ? t("common.saving") : t("billing.confirmPaid")}
          </button>
        )}
      </div>
    </div>
  );
}

function BillingContent() {
  const { t } = useI18n();
  const [data, setData] = useState<BillingInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [startingTrial, setStartingTrial] = useState(false);
  const [payTarget, setPayTarget] = useState<PayTarget | null>(null);
  const [trialToast, setTrialToast] = useState<string | null>(null);

  function load() {
    apiFetch<BillingInfo>("/api/v1/billing").then(setData).catch((err) => setError(err.message));
  }

  useEffect(load, []);

  async function startTrial() {
    setStartingTrial(true);
    try {
      await apiFetch("/api/v1/billing/trial", { method: "POST" });
      setTrialToast(t("billing.trialActivatedToast").replace("{count}", String(data?.trialCredits ?? "")));
      setTimeout(() => setTrialToast(null), 4000);
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setStartingTrial(false);
    }
  }

  if (error) return <div className="empty-state">{error}</div>;
  if (!data) return <div className="empty-state">{t("common.loading")}</div>;

  // The top-up button only makes sense once there's actually nothing left
  // to use — otherwise it's just clutter next to the trial button (product
  // ask: it should "appear automatically once try-ons run out").
  const showTopUp = !!data.plan && data.usedThisMonth >= data.plan.monthlyLimit && data.topUpCredits <= 0;

  return (
    <>
      <div className="page-title">{t("billing.title")}</div>

      <div className="panel" style={{ padding: 24, marginBottom: 24, maxWidth: 640 }}>
        {data.plan ? (
          <>
            <h3 style={{ margin: "0 0 4px", fontSize: 18 }}>
              {data.plan.name} — ${data.plan.priceUsd}
              {t("billing.perMonth")}
            </h3>
            <p style={{ fontSize: 12, color: "var(--mist)", margin: "0 0 16px" }}>
              {t("billing.usedThisMonth")}: {data.usedThisMonth} / {data.plan.monthlyLimit}
              {data.topUpCredits > 0 ? ` (+${data.topUpCredits} ${t("billing.topUpCredits").toLowerCase()})` : ""}
            </p>
            <ProgressBar used={data.usedThisMonth} limit={data.plan.monthlyLimit} />
          </>
        ) : data.topUpCredits > 0 ? (
          <>
            <h3 style={{ margin: "0 0 4px", fontSize: 18 }}>{t("billing.trialActive")}</h3>
            <p style={{ fontSize: 12, color: "var(--mist)", margin: "0 0 4px" }}>
              {t("billing.topUpCredits")}: {data.topUpCredits}
            </p>
          </>
        ) : (
          <p style={{ fontSize: 13, color: "var(--danger, #ff6b6b)", margin: 0 }}>{t("billing.noPlan")}</p>
        )}

        {data.planRequestNote && <p style={{ fontSize: 12, color: "var(--sky)", marginTop: 16 }}>{t("billing.pendingRequest")}</p>}

        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 16 }}>
          {!data.plan &&
            (data.trialAvailable ? (
              <button className="btn" style={{ width: "auto", padding: "9px 16px" }} disabled={startingTrial} onClick={startTrial}>
                {startingTrial ? t("common.saving") : t("billing.startTrial")}
              </button>
            ) : (
              <button className="btn" style={{ width: "auto", padding: "9px 16px", opacity: 0.5, cursor: "default" }} disabled>
                {t("billing.trialUsed")}
              </button>
            ))}
          {showTopUp && data.plan && (
            <button
              className="btn"
              style={{ width: "auto", padding: "9px 16px" }}
              onClick={() =>
                setPayTarget({
                  kind: "topup",
                  label: `${t("billing.topUpPack")} (+${data.plan!.topUpPackSize} — $${data.plan!.topUpPackPriceUsd})`,
                })
              }
            >
              {t("billing.requestTopUp")} (+{data.plan.topUpPackSize} — ${data.plan.topUpPackPriceUsd})
            </button>
          )}
        </div>
      </div>

      <h3 style={{ margin: "0 0 14px", fontSize: 15 }}>{t("billing.plans")}</h3>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${data.allPlans.length}, 1fr)`, gap: 16, maxWidth: 900, marginBottom: 24 }}>
        {data.allPlans.map((p) => {
          const isCurrent = data.plan?.key === p.key;
          return (
            <div
              key={p.key}
              className="panel"
              style={{
                padding: 22,
                display: "flex",
                flexDirection: "column",
                border: isCurrent ? "1px solid var(--sky)" : "1px solid var(--line)",
                background: isCurrent ? "rgba(115,183,255,0.06)" : undefined,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 15, fontWeight: 700 }}>{p.name}</span>
                {isCurrent && (
                  <span className="badge badge-completed" style={{ fontSize: 10 }}>
                    {t("billing.currentBadge")}
                  </span>
                )}
              </div>
              <div style={{ margin: "6px 0 18px" }}>
                <span style={{ fontSize: 26, fontWeight: 800 }}>${p.priceUsd}</span>
                <span style={{ fontSize: 12, color: "var(--mist)" }}>{t("billing.perMonth")}</span>
              </div>
              <div style={{ fontSize: 12, color: "var(--mist)", display: "flex", flexDirection: "column", gap: 6, marginBottom: 20, flex: 1 }}>
                <span>
                  {t("billing.monthlyLimit")}: <strong style={{ color: "var(--paper)" }}>{p.monthlyLimit}</strong>
                </span>
                <span>
                  {t("billing.topUpPack")}: <strong style={{ color: "var(--paper)" }}>+{p.topUpPackSize}</strong> — ${p.topUpPackPriceUsd}
                </span>
              </div>
              {!isCurrent && (
                <button
                  className="btn"
                  style={{ width: "100%", padding: "9px 12px", fontSize: 13 }}
                  onClick={() => setPayTarget({ kind: "plan", planKey: p.key, label: `${p.name} — $${p.priceUsd}${t("billing.perMonth")}` })}
                >
                  {t("billing.choosePlan")}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {payTarget && (
        <PaymentPopup
          target={payTarget}
          onClose={() => setPayTarget(null)}
          onPaid={() => {
            load();
          }}
        />
      )}

      {trialToast && (
        <div
          style={{
            position: "fixed",
            left: 20,
            bottom: 20,
            zIndex: 500,
            maxWidth: 260,
            background: "var(--surface)",
            border: "1px solid var(--sky)",
            borderRadius: 12,
            padding: "12px 16px",
            fontSize: 12.5,
            color: "var(--paper)",
            lineHeight: 1.5,
            boxShadow: "0 12px 32px rgba(0,0,0,0.4)",
          }}
        >
          ✓ {trialToast}
        </div>
      )}
    </>
  );
}

export default function BillingPage() {
  return (
    <AuthGuard>
      <BillingContent />
    </AuthGuard>
  );
}
