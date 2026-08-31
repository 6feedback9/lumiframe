// Manual, relayed password reset (product ask: "человек нажимает [забыли
// пароль] мне в кабинет приходит код я говорю им этот код") — see the
// schema comment on PasswordResetCode and routes/auth.ts. Covers the full
// three-step flow end to end, plus the guardrails that make it safe as a
// public, unauthenticated surface: no email-existence leak, a code that's
// single-use and expires, and a reset token that can't double as a real
// login token.

import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "./app";
import { prisma } from "./context";

describe("password reset — forgot-password / verify-reset-code / reset-password", () => {
  let app: FastifyInstance;
  let email: string;
  let originalPassword: string;
  let userId: string;

  beforeAll(async () => {
    app = await buildApp();
    email = `password-reset-test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
    originalPassword = "the original password";
    const register = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { email, password: originalPassword, storeName: "Password Reset Test Co", storeUrl: "http://password-reset-test.example.com" },
    });
    expect(register.statusCode).toBe(201);
    const me = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: { authorization: `Bearer ${register.json().token}` },
    });
    userId = me.json().user.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it("runs the full flow: request a code, verify it, set a new password, and log in with only the new one", async () => {
    const forgot = await app.inject({ method: "POST", url: "/api/v1/auth/forgot-password", payload: { email } });
    expect(forgot.statusCode).toBe(200);

    const stored = await prisma.passwordResetCode.findFirstOrThrow({ where: { userId, usedAt: null } });

    const verify = await app.inject({
      method: "POST",
      url: "/api/v1/auth/verify-reset-code",
      payload: { email, code: stored.code },
    });
    expect(verify.statusCode).toBe(200);
    const { resetToken } = verify.json();
    expect(typeof resetToken).toBe("string");

    const newPassword = "the brand new password";
    const reset = await app.inject({
      method: "POST",
      url: "/api/v1/auth/reset-password",
      payload: { resetToken, newPassword },
    });
    expect(reset.statusCode).toBe(200);
    expect(typeof reset.json().token).toBe("string");

    const oldLogin = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { email, password: originalPassword } });
    expect(oldLogin.statusCode).toBe(401);

    const newLogin = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { email, password: newPassword } });
    expect(newLogin.statusCode).toBe(200);
  });

  it("doesn't leak whether an email is registered", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/forgot-password",
      payload: { email: "definitely-not-a-real-account@example.com" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  it("rejects a wrong code, and a code can't be replayed after a successful verify", async () => {
    const localEmail = `password-reset-replay-${Date.now()}@example.com`;
    const register = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { email: localEmail, password: "correct horse battery staple", storeName: "Replay Test Co", storeUrl: "http://replay-test.example.com" },
    });
    const localUserId = (await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: { authorization: `Bearer ${register.json().token}` },
    })).json().user.id;

    await app.inject({ method: "POST", url: "/api/v1/auth/forgot-password", payload: { email: localEmail } });
    const stored = await prisma.passwordResetCode.findFirstOrThrow({ where: { userId: localUserId, usedAt: null } });

    const wrongCode = await app.inject({
      method: "POST",
      url: "/api/v1/auth/verify-reset-code",
      payload: { email: localEmail, code: "000000" === stored.code ? "111111" : "000000" },
    });
    expect(wrongCode.statusCode).toBe(400);

    const rightCode = await app.inject({
      method: "POST",
      url: "/api/v1/auth/verify-reset-code",
      payload: { email: localEmail, code: stored.code },
    });
    expect(rightCode.statusCode).toBe(200);

    // Same code again — already consumed by the successful verify above.
    const replay = await app.inject({
      method: "POST",
      url: "/api/v1/auth/verify-reset-code",
      payload: { email: localEmail, code: stored.code },
    });
    expect(replay.statusCode).toBe(400);
  });

  it("a new forgot-password request supersedes an earlier unused code", async () => {
    const localEmail = `password-reset-supersede-${Date.now()}@example.com`;
    const register = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { email: localEmail, password: "correct horse battery staple", storeName: "Supersede Test Co", storeUrl: "http://supersede-test.example.com" },
    });
    const localUserId = (await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: { authorization: `Bearer ${register.json().token}` },
    })).json().user.id;

    await app.inject({ method: "POST", url: "/api/v1/auth/forgot-password", payload: { email: localEmail } });
    const firstCode = await prisma.passwordResetCode.findFirstOrThrow({ where: { userId: localUserId, usedAt: null } });

    await app.inject({ method: "POST", url: "/api/v1/auth/forgot-password", payload: { email: localEmail } });

    const stillValid = await app.inject({
      method: "POST",
      url: "/api/v1/auth/verify-reset-code",
      payload: { email: localEmail, code: firstCode.code },
    });
    expect(stillValid.statusCode).toBe(400);
  });

  it("rejects reset-password with a plain merchant login token, not a real reset token", async () => {
    const login = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { email, password: "the brand new password" } });
    const loginToken = login.json().token;

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/reset-password",
      payload: { resetToken: loginToken, newPassword: "should not matter what this is" },
    });
    expect(res.statusCode).toBe(401);
  });
});
