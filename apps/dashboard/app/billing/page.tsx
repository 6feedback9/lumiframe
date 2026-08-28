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

function BillingContent() {
  const { t } = useI18n();
  const [data, setData] = useState<BillingInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [requesting, setRequesting] = useState<string | null>(null);
  const [requestSent, setRequestSent] = useState(false);
  const [paidNote, setPaidNote] = useState("");
  const [paidSent, setPaidSent] = useState(false);

  function load() {
    apiFetch<BillingInfo>("/api/v1/billing").then(setData).catch((err) => setError(err.message));
  }

  useEffect(load, []);

  async function requestUpgrade(planKey: string) {
    setRequesting(planKey);
    try {
      await apiFetch("/api/v1/billing/request", {
        method: "POST",
        body: JSON.stringify({ kind: "upgrade", planKey }),
      });
      setRequestSent(true);
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRequesting(null);
    }
  }

  async function requestTopUp() {
    setRequesting("topup");
    try {
      await apiFetch("/api/v1/billing/request", { method: "POST", body: JSON.stringify({ kind: "topup" }) });
      setRequestSent(true);
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRequesting(null);
    }
  }

  async function confirmPaid() {
    setRequesting("paid");
    try {
      await apiFetch("/api/v1/billing/request", {
        method: "POST",
        body: JSON.stringify({ kind: "paid", message: paidNote || undefined }),
      });
      setPaidSent(true);
      setPaidNote("");
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRequesting(null);
    }
  }

  if (error) return <div className="empty-state">{error}</div>;
  if (!data) return <div className="empty-state">{t("common.loading")}</div>;

  return (
    <>
      <div className="page-title">{t("billing.title")}</div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20, alignItems: "start" }}>
        <div className="panel" style={{ padding: 24 }}>
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
          ) : (
            <p style={{ fontSize: 13, color: "var(--danger, #ff6b6b)" }}>{t("billing.noPlan")}</p>
          )}

          {(data.planRequestNote || requestSent) && (
            <p style={{ fontSize: 12, color: "var(--sky)", marginTop: 16 }}>
              {requestSent ? t("billing.requestSent") : t("billing.pendingRequest")}
            </p>
          )}

          <button className="btn" style={{ marginTop: 16, width: "auto", padding: "8px 16px" }} disabled={requesting === "topup"} onClick={requestTopUp}>
            {t("billing.requestTopUp")}
            {data.plan ? ` (+${data.plan.topUpPackSize} — $${data.plan.topUpPackPriceUsd})` : ""}
          </button>
        </div>

        <div className="panel" style={{ padding: 24 }}>
          <h3 style={{ margin: "0 0 4px", fontSize: 15 }}>{t("billing.paymentTitle")}</h3>
          <p style={{ fontSize: 12, color: "var(--mist)", margin: "0 0 16px", lineHeight: 1.5 }}>{t("billing.paymentDesc")}</p>

          <CopyRow label={t("billing.recipient")} value={PAYMENT_DETAILS.recipient} />
          <CopyRow label={t("billing.taxId")} value={PAYMENT_DETAILS.taxId} />
          <CopyRow label={t("billing.iban")} value={PAYMENT_DETAILS.iban} />
          <CopyRow label={t("billing.bank")} value={PAYMENT_DETAILS.bank} />
          <CopyRow label={t("billing.purpose")} value={t("billing.purposeValue")} />

          <div className="field" style={{ marginTop: 14, marginBottom: 12 }}>
            <label>{t("billing.paidNote")}</label>
            <input value={paidNote} onChange={(e) => setPaidNote(e.target.value)} placeholder={t("billing.paidNotePlaceholder")} maxLength={300} />
          </div>

          {paidSent && <p style={{ fontSize: 12, color: "var(--sky)", marginBottom: 12 }}>{t("billing.paidSent")}</p>}

          <button className="btn" style={{ width: "auto", padding: "8px 16px" }} disabled={requesting === "paid"} onClick={confirmPaid}>
            {t("billing.confirmPaid")}
          </button>
        </div>
      </div>

      <div className="panel" style={{ padding: 24, maxWidth: 720 }}>
        <h3 style={{ margin: "0 0 14px", fontSize: 15 }}>{t("billing.plans")}</h3>
        <table>
          <thead>
            <tr>
              <th></th>
              <th>{t("billing.monthlyLimit")}</th>
              <th>{t("billing.price")}</th>
              <th>{t("billing.topUpPack")}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {data.allPlans.map((p) => (
              <tr key={p.key}>
                <td style={{ fontWeight: 600 }}>
                  {p.name}
                  {data.plan?.key === p.key && (
                    <span className="badge badge-completed" style={{ marginLeft: 8 }}>
                      {t("billing.currentBadge")}
                    </span>
                  )}
                </td>
                <td>{p.monthlyLimit}</td>
                <td>${p.priceUsd}</td>
                <td>
                  +{p.topUpPackSize} / ${p.topUpPackPriceUsd}
                </td>
                <td>
                  {data.plan?.key !== p.key && (
                    <button
                      className="btn"
                      style={{ width: "auto", padding: "6px 12px", fontSize: 12 }}
                      disabled={requesting === p.key}
                      onClick={() => requestUpgrade(p.key)}
                    >
                      {t("billing.choosePlan")}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
