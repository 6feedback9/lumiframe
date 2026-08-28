"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setToken } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { LocaleToggle } from "../LocaleToggle";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export default function LoginPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Login failed");
      setToken(body.token);
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
      <form className="login-card" onSubmit={onSubmit}>
        <h1>{t("login.title")}</h1>
        <div className="field">
          <label htmlFor="email">{t("login.email")}</label>
          <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="password">{t("login.password")}</label>
          <input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <button className="btn" type="submit" disabled={loading}>
          {loading ? t("login.submitting") : t("login.submit")}
        </button>
        {error && <div className="error-text">{error}</div>}
        <div style={{ textAlign: "center", marginTop: 16, fontSize: 12, color: "var(--mist)" }}>
          {t("login.newHere")}{" "}
          <a href="/register" style={{ color: "var(--sky)" }}>
            {t("login.createAccount")}
          </a>
        </div>
      </form>
    </div>
  );
}
