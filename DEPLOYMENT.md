# Deploying Lumi Frame

Everything in this repo has only ever run inside a temporary dev sandbox
(see `ARCHITECTURE.md`, `README.md`). This is the step-by-step to turn it
into a real, publicly reachable service. Recommended stack — matches what
`ARCHITECTURE.md` §15 already assumes, so nothing in the code needs to
change, only environment variables:

| Piece | Service | Why |
|---|---|---|
| Postgres + object storage | **Supabase** | Already what `packages/database`/`packages/storage` are built against |
| Redis (queue) | **Upstash** | Serverless-billed, works with `BullMqTryOnQueue` out of the box |
| `apps/api` (+ worker) | **Render** (or Railway/Fly) | Needs a process that stays running — not Vercel serverless (`ARCHITECTURE.md` §2) |
| `apps/dashboard`, `apps/admin` | **Vercel** | Next.js, zero-config |

`apps/demo-store` is a testing tool, not part of the product — skip it in
production (or deploy it too if you want a live demo to show prospects).

I can't run any of this myself from this session — the sandbox's network
egress is allowlisted to package registries and a few dev services, and
these hosting dashboards aren't reachable from here even if I had your
credentials. Everything below you run yourself, in your own accounts.

---

## 1. Database + storage — Supabase

1. Create a project at supabase.com.
2. **Settings → Database → Connection string**: copy both the *pooled*
   connection string (port 6543, `?pgbouncer=true`) and the *direct* one
   (port 5432). Pooled → `DATABASE_URL`, direct → `DIRECT_URL` (Prisma
   needs the direct one for migrations).
3. **Settings → API**: copy the Project URL → `SUPABASE_URL`, and the
   `service_role` key (not `anon`) → `SUPABASE_SERVICE_ROLE_KEY`. This key
   is as sensitive as a DB password — it only ever belongs in `apps/api`'s
   server-side env, never in a `NEXT_PUBLIC_*` var or any frontend.
4. **Storage**: create three **private** buckets — `customer-photos`,
   `tryon-results`, `product-assets`. Leave "Public bucket" off; the app
   only ever hands out signed URLs (`packages/storage`).
5. From your own machine, apply the schema once:
   ```bash
   DATABASE_URL="<pooled>" DIRECT_URL="<direct>" \
     pnpm --filter @lumiframe/database exec prisma migrate deploy
   ```

## 2. Queue — Upstash (optional to start)

Skip this and leave `REDIS_URL` unset if you're deploying a single API
instance to start — it'll run the worker in-process on an in-memory queue
(fine for low volume, but jobs are lost on a restart/redeploy and it can't
scale past one instance). To do it properly:

1. Create a Redis database at upstash.com (enable TLS).
2. Copy the `rediss://...` connection string → `REDIS_URL`.

## 3. `apps/api` — Render

1. New **Web Service**, connect the `6feedback9/lumiframe` repo, branch
   `claude/eyewear-tryon-saas-arch` (or `main` once merged).
2. **Build Command** (runs from the repo root):
   ```
   corepack enable && pnpm install --frozen-lockfile && pnpm --filter @lumiframe/database exec prisma generate && pnpm --filter @lumiframe/sdk build
   ```
3. **Start Command**: `pnpm --filter @lumiframe/api start`
4. **Environment** — set these (see `.env.example` for the full list):
   - `DATABASE_URL`, `DIRECT_URL` — from Supabase
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — from Supabase
   - `JWT_SECRET` — generate one: `openssl rand -hex 32`
   - `REDIS_URL` — from Upstash, if you set it up
   - `AI_PROVIDER=mock` — until a real vendor is wired up (`ARCHITECTURE.md` §13)
   - `API_BASE_URL` — Render's assigned URL, e.g. `https://lumiframe-api.onrender.com`
   - Leave `PORT` alone — Render sets it.
5. Deploy, then check `https://<your-service>.onrender.com/health` returns
   `{"ok":true}`.
6. **Only if you set `REDIS_URL`**: add a second Render service —
   **Background Worker**, same repo/build command, **Start Command**:
   `pnpm --filter @lumiframe/api worker:start`. Without `REDIS_URL` set,
   don't create this — the web service already runs the worker in-process.
7. Render's free tier sleeps after inactivity, which breaks a live
   `/sdk.js` and try-on creation for real merchants — use a paid
   always-on tier for anything beyond testing.

## 4. `apps/dashboard` and `apps/admin` — Vercel

Two separate Vercel projects from the same repo (Vercel handles monorepos
via a per-project "Root Directory"):

1. Import the repo twice — once per app.
2. Project 1: **Root Directory** = `apps/dashboard`. Framework preset
   Next.js (auto-detected). Env: `NEXT_PUBLIC_API_BASE_URL` = your Render
   API URL.
3. Project 2: **Root Directory** = `apps/admin`. Same env var.
4. Deploy both. You'll get `*.vercel.app` URLs immediately; attach your
   own domains under each project's Settings → Domains whenever you want.

## 5. Create your platform admin account

Once `DATABASE_URL` points at the real Supabase project, run **from your
own machine** (never expose this as an HTTP endpoint — see the schema
comment on `User.isPlatformAdmin`):

```bash
DATABASE_URL="<supabase pooled url>" DIRECT_URL="<supabase direct url>" \
  node apps/api/scripts/createPlatformAdmin.mjs you@example.com "a strong password"
```

Sign in at your deployed `apps/admin` URL with that email/password.

## 6. Onboard your first real merchant

Send them to your deployed `apps/dashboard` URL → **Create a store
account**. They enter their real store URL — `allowedDomains` is set from
its hostname automatically. The success screen (and the Integration page
later) gives them the exact `<script>` snippet to paste into their
product page template, pointed at your Render API's `/sdk.js`.

## Rough cost to start

- Supabase free tier: fine initially (500MB DB, 1GB storage).
- Upstash free tier: fine initially, or skip it entirely (§2).
- Render: the free web-service tier sleeps — budget ~$7/mo for always-on
  once you have a real merchant depending on it.
- Vercel: Hobby tier covers `apps/dashboard` + `apps/admin` easily at this stage.
