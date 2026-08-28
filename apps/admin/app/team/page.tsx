"use client";

import { useEffect, useState } from "react";
import { AuthGuard } from "../AuthGuard";
import { apiFetch } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

interface AdminUser {
  id: string;
  email: string;
  lastLoginAt: string | null;
  createdAt: string;
}

function TeamContent() {
  const { t } = useI18n();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [meId, setMeId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);

  function load() {
    apiFetch<{ users: AdminUser[] }>("/api/v1/admin/team")
      .then((res) => setUsers(res.users))
      .catch((err) => setError(err.message));
    apiFetch<{ user: { id: string } }>("/api/v1/auth/me")
      .then((res) => setMeId(res.user.id))
      .catch(() => {});
  }

  useEffect(load, []);

  async function addUser(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await apiFetch("/api/v1/admin/team", { method: "POST", body: JSON.stringify({ email, password }) });
      setEmail("");
      setPassword("");
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function removeUser(id: string) {
    try {
      await apiFetch(`/api/v1/admin/team/${id}`, { method: "DELETE" });
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <>
      <div className="page-title">{t("team.adminTitle")}</div>
      <p style={{ fontSize: 13, color: "var(--mist)", marginBottom: 20, maxWidth: 560 }}>{t("team.adminDesc")}</p>

      {error && <div className="empty-state">{error}</div>}

      <div className="panel" style={{ marginBottom: 20 }}>
        <table>
          <thead>
            <tr>
              <th>{t("team.email")}</th>
              <th>{t("team.lastLogin")}</th>
              <th>{t("team.createdAt")}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>
                  {u.email} {u.id === meId && <span style={{ color: "var(--mist-dim)" }}>{t("team.you")}</span>}
                </td>
                <td>{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : t("team.never")}</td>
                <td>{new Date(u.createdAt).toLocaleDateString()}</td>
                <td>
                  {u.id !== meId && (
                    <button className="btn" style={{ width: "auto", padding: "5px 10px", fontSize: 12 }} onClick={() => removeUser(u.id)}>
                      {t("team.remove")}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="panel" style={{ padding: 24, maxWidth: 480 }}>
        <h3 style={{ margin: "0 0 6px", fontSize: 15 }}>{t("team.addUser")}</h3>
        <p style={{ fontSize: 11, color: "var(--mist-dim)", marginBottom: 14, lineHeight: 1.5 }}>{t("team.adminAddWarning")}</p>
        <form onSubmit={addUser}>
          <div className="field" style={{ marginBottom: 12 }}>
            <label>{t("team.email")}</label>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="field" style={{ marginBottom: 16 }}>
            <label>{t("team.password")}</label>
            <input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <button className="btn" type="submit" disabled={saving}>
            {saving ? t("common.saving") : t("team.addUser")}
          </button>
        </form>
      </div>
    </>
  );
}

export default function TeamPage() {
  return (
    <AuthGuard>
      <TeamContent />
    </AuthGuard>
  );
}
