#!/usr/bin/env node
// Run this yourself, once, to create (or promote) your own platform-owner
// account. There is deliberately no HTTP endpoint that can do this — see
// the schema comment on User.isPlatformAdmin.
//
// Usage:
//   node apps/api/scripts/createPlatformAdmin.mjs you@example.com "a strong password"
//
// Reads DATABASE_URL from the environment (or apps/api/.env via dotenv).

import { config } from "dotenv";
import { randomBytes, scrypt as scryptCb } from "node:crypto";
import { promisify } from "node:util";
import { prisma } from "@lumiframe/database";

config();
const scrypt = promisify(scryptCb);

async function hashPassword(password) {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, 64);
  return `${salt.toString("hex")}:${derived.toString("hex")}`;
}

const [, , email, password] = process.argv;
if (!email || !password) {
  console.error('Usage: node createPlatformAdmin.mjs <email> "<password>"');
  process.exit(1);
}
if (password.length < 8) {
  console.error("Password must be at least 8 characters.");
  process.exit(1);
}

async function main() {
  const platformTenant = await prisma.tenant.upsert({
    where: { slug: "lumiframe-platform" },
    create: { name: "Lumi Frame (platform)", slug: "lumiframe-platform" },
    update: {},
  });

  const passwordHash = await hashPassword(password);
  const normalizedEmail = email.toLowerCase().trim();

  const user = await prisma.user.upsert({
    where: { email: normalizedEmail },
    create: {
      tenantId: platformTenant.id,
      email: normalizedEmail,
      passwordHash,
      role: "OWNER",
      isPlatformAdmin: true,
    },
    update: { passwordHash, isPlatformAdmin: true },
  });

  console.log(`Platform admin ready: ${user.email} (${user.id})`);
  console.log("Sign in at apps/admin with this email/password.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
