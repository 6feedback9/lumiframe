"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setToken } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { LocaleToggle } from "../LocaleToggle";
import { PasswordInput } from "../PasswordInput";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

// Raw fetch, not apiFetch (lib/api.ts) — same reason login/register use
// it directly: apiFetch force-redirects to /login on any 401, which
// reset-password deliberately returns for an expired/invalid resetToken
// (this page's own error case, not a reason to bounce away from it).
async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "Request failed");
  return json;
}

type Step = "email" | "code" | "newPassword";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submitEmail(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await post("/api/v1/auth/forgot-password", { email });
      setStep("code");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { resetToken } = await post<{ resetToken: string }>("/api/v1/auth/verify-reset-code", { email, code });
      setResetToken(resetToken);
      setStep("newPassword");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function submitNewPassword(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { token } = await post<{ token: string }>("/api/v1/auth/reset-password", { resetToken, newPassword });
      setToken(token);
      router.push("/");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <LocaleToggle />
      <div className="login-card">
        <h1>{t("forgotPassword.title")}</h1>

        {step === "email" && (
          <>
            <p style={{ fontSize: 12, color: "var(--mist)", marginBottom: 16, lineHeight: 1.5 }}>{t("forgotPassword.emailStepDesc")}</p>
            <form onSubmit={submitEmail}>
              <div className="field">
                <label htmlFor="email">{t("login.email")}</label>
                <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <button className="btn" type="submit" disabled={loading}>
                {loading ? t("common.saving") : t("forgotPassword.sendCode")}
              </button>
              {error && <div className="error-text">{error}</div>}
            </form>
          </>
        )}

        {step === "code" && (
          <>
            <p style={{ fontSize: 12, color: "var(--mist)", marginBottom: 16, lineHeight: 1.5 }}>{t("forgotPassword.codeStepDesc")}</p>
            <form onSubmit={submitCode}>
              <div className="field">
                <label htmlFor="code">{t("forgotPassword.codeLabel")}</label>
                <input
                  id="code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  maxLength={12}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  style={{ letterSpacing: "0.3em", fontSize: 18, textAlign: "center" }}
                />
              </div>
              <button className="btn" type="submit" disabled={loading}>
                {loading ? t("common.saving") : t("forgotPassword.verifyCode")}
              </button>
              {error && <div className="error-text">{error}</div>}
              <div style={{ textAlign: "center", marginTop: 14 }}>
                <button
                  type="button"
                  onClick={() => {
                    setStep("email");
                    setCode("");
                    setError(null);
                  }}
                  style={{ background: "none", border: "none", color: "var(--mist)", fontSize: 12, cursor: "pointer", textDecoration: "underline" }}
                >
                  {t("forgotPassword.requestNewCode")}
                </button>
              </div>
            </form>
          </>
        )}

        {step === "newPassword" && (
          <form onSubmit={submitNewPassword}>
            <div className="field">
              <label htmlFor="newPassword">{t("forgotPassword.newPasswordLabel")}</label>
              <PasswordInput id="newPassword" required minLength={8} autoComplete="new-password" value={newPassword} onChange={setNewPassword} />
            </div>
            <button className="btn" type="submit" disabled={loading}>
              {loading ? t("common.saving") : t("forgotPassword.setPassword")}
            </button>
            {error && <div className="error-text">{error}</div>}
          </form>
        )}

        <div style={{ textAlign: "center", marginTop: 16, fontSize: 12, color: "var(--mist)" }}>
          <a href="/login" style={{ color: "var(--sky)" }}>
            {t("forgotPassword.backToLogin")}
          </a>
        </div>
      </div>
    </div>
  );
}
