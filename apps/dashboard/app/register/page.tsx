"use client";

import { useState } from "react";
import { setToken } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { IntegrationSnippet } from "../IntegrationSnippet";
import { LocaleToggle } from "../LocaleToggle";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

interface RegisterResult {
  store: { id: string; name: string; storeUrl: string; allowedDomains: string[] };
}

export default function RegisterPage() {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [storeName, setStoreName] = useState("");
  const [storeUrl, setStoreUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RegisterResult | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, storeName, storeUrl }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Registration failed");
      setToken(body.token);
      setResult(body);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  if (result) {
    return (
      <div className="login-page">
        <LocaleToggle />
        <div className="login-card" style={{ width: 480 }}>
          <h1>
            {result.store.name} {t("register.readyTitle")}
          </h1>
          <p style={{ fontSize: 13, color: "var(--mist)", marginBottom: 18 }}>{t("register.readyDesc")}</p>
          <IntegrationSnippet storeId={result.store.id} />
          <a className="btn" href="/" style={{ display: "block", textAlign: "center", marginTop: 16 }}>
            {t("register.continue")}
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <LocaleToggle />
      <form className="login-card" onSubmit={onSubmit}>
        <h1>{t("register.title")}</h1>
        <div className="field">
          <label htmlFor="storeName">{t("register.storeName")}</label>
          <input id="storeName" required value={storeName} onChange={(e) => setStoreName(e.target.value)} placeholder="Glasses.ua" />
        </div>
        <div className="field">
          <label htmlFor="storeUrl">{t("register.storeUrl")}</label>
          <input
            id="storeUrl"
            type="url"
            required
            value={storeUrl}
            onChange={(e) => setStoreUrl(e.target.value)}
            placeholder="https://glasses.ua"
          />
        </div>
        <div className="field">
          <label htmlFor="email">{t("login.email")}</label>
          <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="password">{t("login.password")}</label>
          <input
            id="password"
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <button className="btn" type="submit" disabled={loading}>
          {loading ? t("register.submitting") : t("register.submit")}
        </button>
        {error && <div className="error-text">{error}</div>}
        <div style={{ textAlign: "center", marginTop: 16, fontSize: 12, color: "var(--mist)" }}>
          {t("register.haveAccount")}{" "}
          <a href="/login" style={{ color: "var(--sky)" }}>
            {t("register.signIn")}
          </a>
        </div>
      </form>
    </div>
  );
}
