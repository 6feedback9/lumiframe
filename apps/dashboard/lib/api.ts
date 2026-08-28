"use client";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";
const TOKEN_KEY = "lumiframe_dashboard_token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      // Only when there's actually a body — Fastify's default JSON body
      // parser rejects a request that declares Content-Type: application/
      // json but sends no body at all with a bare 400 "Bad Request", no
      // useful detail (found via apps/admin's identical bug on the
      // trial-grant button, a bodyless POST).
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });

  if (res.status === 401) {
    clearToken();
    if (typeof window !== "undefined") window.location.href = "/login";
    throw new ApiError("Unauthorized", 401);
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    // message before error: our own routes only ever set `error` (with a
    // real description), but Fastify's own error responses (body parsing,
    // rate limiting) put the useful detail in `message` and just the
    // generic HTTP reason phrase ("Bad Request") in `error`.
    throw new ApiError(body.message ?? body.error ?? `Request failed (HTTP ${res.status})`, res.status);
  }
  return res.json();
}
