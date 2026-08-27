#!/usr/bin/env node
// Registers (or logs into) a demo merchant account against a running
// apps/api, so this demo store has a real storeId with allowedDomains
// matching http://localhost:3100 — see README.md "Running the full loop".

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";
const STORE_URL = "http://localhost:3100";
const EMAIL = "demo@lumiframe.local";
const PASSWORD = "demo-store-password";

async function main() {
  let token;
  let store;

  const register = await fetch(`${API_BASE_URL}/api/v1/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, storeName: "Lumière Eyewear (Demo)", storeUrl: STORE_URL }),
  });

  if (register.status === 201) {
    const body = await register.json();
    token = body.token;
    store = body.store;
  } else if (register.status === 409) {
    const login = await fetch(`${API_BASE_URL}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    });
    if (!login.ok) throw new Error(`Login failed: HTTP ${login.status}`);
    token = (await login.json()).token;
    const me = await fetch(`${API_BASE_URL}/api/v1/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
    store = (await me.json()).stores[0];
  } else {
    throw new Error(`Register failed: HTTP ${register.status} ${await register.text()}`);
  }

  console.log(`\nDemo store ready: ${store.name} (${store.id})`);
  console.log(`allowedDomains: ${store.allowedDomains.join(", ")}\n`);
  console.log("Add this to apps/demo-store/.env.local:\n");
  console.log(`NEXT_PUBLIC_STORE_ID=${store.id}`);
  console.log(`NEXT_PUBLIC_API_BASE_URL=${API_BASE_URL}\n`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
