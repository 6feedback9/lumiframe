"use client";

import { useEffect, useState } from "react";
import { AuthGuard } from "../AuthGuard";
import { apiFetch } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { PasswordInput } from "../PasswordInput";

interface TeamUser {
  id: string;
  email: string;
  role: "OWNER" | "ADMIN" | "MEMBER";
  lastLoginAt: string | null;
  createdAt: string;
}

const ROLE_KEYS = { OWNER: "team.roleOwner", ADMIN: "team.roleAdmin", MEMBER: "team.roleMember" } as const;

// GET /api/v1/team bumps the viewer's own lastLoginAt to "now" on every
// load (apps/api/src/routes/team.ts) — this is what turns that into a
// lightweight "online" signal: anyone whose row is this fresh is either
// looking at this exact page right now, or was within the last few
// minutes. Older than that just falls back to the plain last-login time.
const ONLINE_THRESHOLD_MS = 5 * 60 * 1000;
function isOnline(lastLoginAt: string | null): boolean {
  if (!lastLoginAt) return false;
  return Date.now() - new Date(lastLoginAt).getTime() < ONLINE_THRESHOLD_MS;
}

function TeamContent() {
  const { t } = useI18n();
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [meId, setMeId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<TeamUser["role"]>("MEMBER");
  const [saving, setSaving] = useState(false);

  function load() {
    apiFetch<{ users: TeamUser[] }>("/api/v1/team")
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
      await apiFetch("/api/v1/team", { method: "POST", body: JSON.stringify({ email, password, role }) });
      setEmail("");
      setPassword("");
      setRole("MEMBER");
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function removeUser(id: string) {
    try {
      await apiFetch(`/api/v1/team/${id}`, { method: "DELETE" });
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <>
      <div className="page-title">{t("team.title")}</div>
      <p style={{ fontSize: 13, color: "var(--mist)", marginBottom: 20 }}>{t("team.desc")}</p>

      {error && <div className="empty-state">{error}</div>}

      <div className="panel" style={{ marginBottom: 20 }}>
        <table>
          <thead>
            <tr>
              <th>{t("team.email")}</th>
              <th>{t("team.role")}</th>
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
                <td>{t(ROLE_KEYS[u.role])}</td>
                <td>
                  {isOnline(u.lastLoginAt) ? (
                    <span style={{ color: "var(--good)", display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--good)", flexShrink: 0 }} />
                      {t("team.online")}
                    </span>
                  ) : u.lastLoginAt ? (
                    new Date(u.lastLoginAt).toLocaleString()
                  ) : (
                    t("team.never")
                  )}
                </td>
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
        <h3 style={{ margin: "0 0 14px", fontSize: 15 }}>{t("team.addUser")}</h3>
        <form onSubmit={addUser}>
          <div className="field" style={{ marginBottom: 12 }}>
            <label>{t("team.email")}</label>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="field" style={{ marginBottom: 12 }}>
            <label>{t("team.password")}</label>
            <PasswordInput required minLength={8} autoComplete="new-password" value={password} onChange={setPassword} />
          </div>
          <div className="field" style={{ marginBottom: 16 }}>
            <label>{t("team.role")}</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as TeamUser["role"])}
              style={{
                width: "100%",
                padding: "9px 12px",
                borderRadius: 10,
                border: "1px solid var(--line-strong)",
                background: "rgba(255,255,255,0.05)",
                color: "var(--paper)",
                fontSize: 13,
              }}
            >
              <option value="MEMBER">{t("team.roleMember")}</option>
              <option value="ADMIN">{t("team.roleAdmin")}</option>
              <option value="OWNER">{t("team.roleOwner")}</option>
            </select>
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
