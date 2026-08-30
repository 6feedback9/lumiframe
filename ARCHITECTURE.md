# Lumi Frame — Architecture

Status: **Phase 1 — core loop implemented.** SDK → widget → async API →
queue/worker → MockTryOnProvider → result → dashboard is built, tested
(unit + a real end-to-end integration test + a real-browser smoke test
through `apps/demo-store`), and running. This document is the source of
truth for the platform's shape. Anything that contradicts it should be
raised before being implemented, not silently diverged from.

## 1. What this is (and isn't)

Lumi Frame is a B2B SaaS **virtual try-on technology** that a merchant plugs
into an **existing** eyewear ecommerce website. It is not a marketplace, not
a catalog manager, and it never becomes the merchant's product database.

- The merchant's product page is the source of truth for product data
  (title, image, price, SKU, URL, add-to-cart, checkout).
- Our system adds one thing to that page: a **"Try on"** button that opens a
  widget, takes a customer selfie, and generates a photorealistic image of
  that customer wearing that exact pair of glasses.
- We store a **snapshot** of the product at try-on time (for analytics and
  attribution), never a merchant-wide catalog import.
- The customer never creates an account. The merchant does.

Non-goals, explicitly:
- No merchant product catalog / inventory / pricing management.
- No requirement that merchants supply transparent/pre-processed eyewear
  images — we normalize whatever product photo already exists on their site.
- No customer-facing account system.
- No coupling to a single AI vendor — see [§6](#6-tryonprovider-abstraction).

## 2. Monorepo layout

pnpm workspaces + Turborepo. One repo, many deployables, shared packages
between them so the widget/SDK/API/dashboard never drift on types.

```
apps/
  api/            Fastify service: public API + BullMQ worker process
  dashboard/      Next.js — merchant-facing SaaS dashboard
  admin/          Next.js — internal ops console (tenants, plans, billing)
  demo-store/     Next.js — fake eyewear ecommerce store, integration testbed

packages/
  database/       Prisma schema + generated client, shared by api/admin/dashboard
  tryon/          Domain core: TryOnSession lifecycle, TryOnProvider interface,
                  ProductImageProcessor interface, shared domain types
  sdk/            packages/sdk — the universal JS SDK merchants embed
  widget/         The try-on widget UI, lazy-loaded by the SDK
  storage/        Object storage wrapper (signed URLs, retention/expiry)
  analytics/      Event ingestion + aggregation helpers shared by api/dashboard

  providers/
    mock/         MockTryOnProvider — no external calls, used in dev/CI
    real/         Real AI vendor adapter(s) — added in Phase 2, behind the
                  same TryOnProvider interface

  integrations/
    shopify/      Shopify app (product detection, cart/order tracking)
    woocommerce/  WooCommerce plugin equivalent
    generic/      OrderTrackingAdapter for any other platform (JSON-LD/OG/
                  DOM-selector based detection, webhook/callback tracking)
```

Why `apps/api` is a plain Fastify service and not Next.js API routes: it
hosts the BullMQ worker, which is a long-running process. Serverless
platforms (Vercel) are a bad fit for that — see [§7](#7-asynchronous-generation-pipeline).
`dashboard`, `admin`, `demo-store` can deploy to Vercel; `api` deploys
somewhere that runs a persistent process (Render/Fly/Railway/etc).

## 3. Core user flow

```
merchant's existing product page
        │  customer clicks "Try on"
        ▼
SDK reads current product (see §8) → opens widget
        │  customer uploads one selfie
        ▼
POST /api/v1/tryons  { storeId, product snapshot, customerImage, utm }
        │
        ▼
TryOnSession created (status=CREATED) → job queued → 202 { tryOnId }
        │                                            (widget starts polling)
        ▼
TryOnWorker picks up job
        │
        ├─ ProductImageProcessor: normalize + cache the product's eyewear asset
        ├─ Customer image pipeline: validate + normalize + face check
        ▼
TryOnProvider.generateTryOn({ face, eyewear })
        │
        ▼
result validated → uploaded to private storage → session COMPLETED
        │
        ▼
widget polls GET /api/v1/tryons/:id → renders result
        │
        ├─ "Try another photo"   → new TryOnGeneration, same session
        ├─ "Back to product"     → widget closes, customer stays on merchant site
        └─ "Add to cart"         → ADD_TO_CART event recorded, tied to tryOnId
                                        │
                                        ▼
                        merchant's own cart/checkout runs (untouched by us)
                                        │
                                        ▼
                        order created on merchant platform
                                        │
                                        ▼
                OrderTrackingAdapter reports it → Attribution links
                the order back to the TryOnSession (see §10)
```

A **new** `TryOnSession` is always created per product. Opening the widget
on the Wayfarer after trying the Aviator never reuses or overwrites the
Aviator session — sessions are never mixed across products.

## 4. Domain model

Full field-level definitions live in
[`packages/database/prisma/schema.prisma`](packages/database/prisma/schema.prisma).
Summary of the entities and why each exists:

| Entity | Purpose |
|---|---|
| `Tenant` | Top-level isolation boundary. Everything else hangs off it. |
| `User` | A person who logs into the merchant dashboard (not a customer). |
| `Store` | One merchant storefront under a tenant (`storeId`, allowed domains, platform type). |
| `ApiKey` | Server-side credential for a store to call the try-on API. Never exposed to the browser directly by the merchant — the SDK talks to our API, not the AI vendor. |
| `Integration` | Per-store config: platform (shopify/woocommerce/generic), DOM selectors, white-label settings. |
| `TryOnSession` | One customer's try-on attempt on one product. Holds the **product snapshot** (title/url/image/sku — not a catalog row), visitor/session ids, UTM, status. |
| `TryOnGeneration` | One AI generation attempt within a session ("try another photo" adds a row here, not a new session). |
| `Event` | Append-only funnel event log (`WIDGET_OPENED` … `ORDER_COMPLETED`), see [§9](#9-events). |
| `Attribution` | Links a `TryOnSession` to an `Order` when the order falls inside the attribution window. |
| `Order` / `OrderItem` | Snapshot of merchant order data relevant to attribution — not a merchant order management system. |
| `UsageRecord` | One row per completed try-on, for usage-based billing. |
| `AuditLog` | Security-relevant actions (login, API key rotation, settings changes). |

There is deliberately **no `Product` table**. Product identity across
try-ons is just `externalProductId` (whatever ID the merchant's page uses),
carried on `TryOnSession`. Dashboard reporting (top tried/converting
products) is a `GROUP BY externalProductId` over `TryOnSession`/`Order`, not
a join to a catalog we own.

## 5. TryOnSession lifecycle

```
CREATED → UPLOADING → PROCESSING → COMPLETED
                    ↘ PROCESSING → FAILED
CREATED/UPLOADING/PROCESSING → EXPIRED   (retention TTL hit before completion)
```

- `CREATED`: session row inserted, product snapshot captured, no image yet.
- `UPLOADING`: customer image received by the API, being validated/stored.
- `PROCESSING`: job queued/running in the worker (product image processing +
  AI generation).
- `COMPLETED`: result image stored, signed URL servable.
- `FAILED`: terminal, carries `errorCode` (validation, provider error,
  timeout, quality-check failure).
- `EXPIRED`: terminal, assigned by a retention sweep once the underlying
  customer image or result has been deleted per `CUSTOMER_IMAGE_RETENTION_HOURS`
  / `TRYON_RESULT_RETENTION_HOURS`. The dashboard must render this state as
  "Customer image expired according to privacy policy" — never pretend
  expired data still exists.

"Try another photo" does not create a new `TryOnSession` (that would break
analytics continuity for the product); it appends a new `TryOnGeneration`
row and re-runs `UPLOADING → PROCESSING → COMPLETED/FAILED` scoped to that
generation. "Try another frame" (a different product) always creates a new
`TryOnSession`.

## 6. `TryOnProvider` abstraction

`packages/tryon/src/provider.ts` defines the only contract the rest of the
system depends on:

```ts
interface TryOnProvider {
  generateTryOn(input: TryOnGenerationInput): Promise<TryOnJobHandle>;
  getJobStatus(jobId: string): Promise<TryOnJobStatus>;
  cancelJob(jobId: string): Promise<void>;
  validateInput(input: TryOnGenerationInput): TryOnValidationResult;
}
```

No provider-specific code (HTTP calls, auth headers, response shapes) may
live outside `packages/providers/*`. The API routes, the worker, the SDK and
the database layer only ever import the interface and a factory
(`getTryOnProvider(process.env.AI_PROVIDER)`), never a concrete vendor
package. This is what lets `AI_PROVIDER=mock` run the entire system in
dev/CI with zero external calls, and what lets a real eyewear-fidelity
vendor be swapped in later (`packages/providers/real`) without touching the
widget, API, database, or merchant integrations.

Phase 0/1 ships **`MockTryOnProvider`** only (`packages/providers/mock`):
it simulates queued → processing → completed/failed/timeout with
configurable delay and failure-rate knobs, and returns a deterministic
composited placeholder image so the full pipeline (queue → worker → storage
→ widget polling → result UX) can be built and tested end-to-end before any
AI vendor is chosen. See [§13](#13-open-decisions) for what plugging in a
real vendor later requires.

## 7. Asynchronous generation pipeline

AI generation is never awaited inside the request/response cycle.

```
POST /api/v1/tryons
   → validate + auth (store API key, allowed domain — §11)
   → create TryOnSession(status=CREATED)
   → store customer image (private bucket, signed upload)
   → enqueue job on "tryon-generation" (BullMQ/Redis)
   → 202 { tryOnId, status: "PROCESSING" }

TryOnWorker (separate long-running process, apps/api worker entrypoint)
   → dequeue job
   → ProductImageProcessor.process(productImageUrl)   (cached by content hash — §12)
   → ImageProcessingPipeline.prepareCustomerImage(customerImageKey)
   → provider.generateTryOn({ face, eyewear })
   → poll/await provider.getJobStatus() until terminal
   → validate result (§14)
   → upload result to private storage, update session COMPLETED/FAILED
```

The widget polls `GET /api/v1/tryons/:id/status` (short interval, capped
retries) until it observes a terminal status, then fetches the signed result
URL. A future iteration can upgrade this to SSE/WebSocket without changing
the state machine.

## 8. Product detection strategy (SDK)

The SDK must work on a site we've never seen, with zero catalog import.
Detection is tried in this priority order, first match wins:

1. **Explicit configuration** — `TryOn.attach({ productId, productTitle, productImageUrl, productUrl, price, currency, sku })` called by the merchant's theme/app code. Always wins if present.
2. **Platform adapter** — `packages/integrations/shopify` / `woocommerce` know how to read product data from that platform's runtime (Shopify `window.ShopifyAnalytics`/Liquid object, WooCommerce DOM conventions).
3. **Structured data (JSON-LD)** — `<script type="application/ld+json">` `Product` schema, the most reliable generic signal.
4. **OpenGraph metadata** — `og:title`, `og:image`, `product:price:amount`.
5. **Merchant-configured DOM selectors** — for unknown platforms, the
   dashboard's Integration page lets a merchant supply
   `productIdSelector` / `productTitleSelector` / `productImageSelector` /
   `priceSelector` / `skuSelector` / `addToCartSelector`; the SDK reads
   `textContent`/`src`/`data-*` off whatever matches.

If nothing resolves a required field (at minimum: a product image), the
"Try on" button does not render — we never open the widget with an
incomplete/garbage product snapshot. The Integration Checker (dashboard)
surfaces exactly which of these five layers succeeded, per §16.

The button itself is auto-inserted by the SDK (`packages/sdk/src/index.ts`,
`autoInject: true` by default) once detection succeeds — placed right after
whatever matches a cart-button heuristic (`.add-to-cart`, `[name="add"]`,
`.btn-cart`, `.product-form__submit`, `[data-add-to-cart]`, covering
Shopify's default themes and generic/WooCommerce markup), falling back to
right after the page's `<h1>`. This is what makes the one-line
`<script>` snippet on the Integration page sufficient by itself — a
merchant pasting it does not additionally hand-place a button anywhere. A
merchant can opt out (`autoInject: false`), override the label
(`buttonLabel`), or override placement (`buttonAnchorSelector`) — see
`packages/sdk/README.md`.

## 9. Events

Append-only, one row per event, always carrying
`{ tenantId, storeId, tryOnId, productId, visitorId, sessionId, timestamp, utm, referrer, device }`:

`WIDGET_OPENED`, `PHOTO_SELECTED`, `TRYON_STARTED`, `TRYON_COMPLETED`,
`TRYON_FAILED`, `RESULT_VIEWED`, `TRY_ANOTHER`, `BACK_TO_PRODUCT`,
`ADD_TO_CART`, `CHECKOUT_STARTED`, `ORDER_COMPLETED`.

This table is the only thing the Overview/Analytics dashboards read from —
it is intentionally flat and append-only so aggregation queries stay cheap
and there's a full funnel trail per session for debugging.

## 10. Order attribution strategy

1. On `TryOnSession` creation, capture UTM (`utm_source/medium/campaign/term/content`)
   and click ids (`gclid`, `fbclid`, `ttclid`) from the page the widget was
   opened on. Never overwrite an existing session's attribution fields once set.
2. `visitorId` (persisted in a first-party cookie/localStorage by the SDK,
   not tied to any account) threads through the rest of the merchant's
   browsing session.
3. `OrderTrackingAdapter` (platform-specific: Shopify webhook, WooCommerce
   webhook, or generic JS callback / server-side API / webhook for
   unsupported platforms) reports `ADD_TO_CART` and `ORDER_COMPLETED` with
   the merchant's own product id and the `visitorId`/`tryOnId` if the SDK
   attached it to the cart/checkout context.
4. An `Attribution` row is created when an order's `externalProductId`
   matches a `TryOnSession.externalProductId` for the same `visitorId`,
   **and** the order timestamp falls within `TRYON_ATTRIBUTION_WINDOW_HOURS`
   (default 72h) of the session's `createdAt`. Model: last-touch try-on
   per product, configurable window only for Phase 1 — richer attribution
   models (first-touch, linear) are a Phase 4 concern, not a blocker.
5. The dashboard renders this as: order → product → try-on YES/NO → time
   between try-on and order → UTM → revenue. Never fabricated when no
   session matches — "Try-on: NO" is a valid, expected state for organic
   orders.

## 11. Multi-tenancy & security

- Every table that isn't global carries `tenantId`; every query in
  `packages/database` is written to require it (no "trust the caller"
  helpers that skip the filter).
- **Public try-on/event endpoints** (`/api/v1/tryons`, `/api/v1/events` —
  called directly from the customer's browser by `@lumiframe/widget`)
  authenticate via `storeId` + the request's Origin/Referer checked
  against that store's `allowedDomains` — the same publishable-key pattern
  Stripe/Shopify widgets use. `storeId` is not secret; abuse is bounded by
  domain-restriction and rate limiting, not by hiding it. This was a
  refinement made during Phase 1: `TryOn.init()` only ever took a
  `storeId` (packages/sdk/src/types.ts, shipped in Phase 0), so the SDK
  was never going to hold a real secret in the browser in the first place.
- **Dashboard/server-to-server endpoints** (`/api/v1/store`,
  `/api/v1/analytics`, the merchant-facing `/api/v1/tryons` list, …) use a
  JWT from `/api/v1/auth/login` — these never run in a customer's browser.
- `ApiKey` (packages/database schema) is a secret, tenant-issued credential
  reserved for future server-to-server integrations (a merchant's own
  backend calling our API) — not used by the public widget flow above.
- `allowedDomains` per store gates which `productImageUrl` origins a store
  is permitted to submit (§ "important API security rule" in the product
  spec) — this is what stops the try-on API from being used as a free
  image-fetching proxy for arbitrary URLs.
- Rate limiting per store/IP on `/api/v1/tryons` and `/api/v1/uploads`.
- Signed URLs + private buckets for all customer photos and results; no
  public bucket ever holds a customer's face.
- Webhook signature verification on every inbound integration webhook
  (Shopify HMAC, WooCommerce webhook secret, generic HMAC for custom
  integrations).
- Audit log on auth events, API key rotation, and integration config
  changes.
- **Customer-photo visibility is deliberately narrower for a merchant than
  for the platform admin.** A try-on's detail view can show up to three
  images — the merchant's product/catalog photo, the customer's raw
  uploaded photo, and the AI-generated result — but
  `buildTryOnDetailPayload`'s `includeCustomerImage` flag (`apps/api/src/
  routes/tryons.ts`) means the merchant-facing route never returns the
  customer's raw photo, only the product photo and the result (the
  customer already wearing/using the product). Only the platform admin's
  cross-tenant route (`apps/api/src/routes/admin.ts`) passes
  `includeCustomerImage: true` and shows all three. This is a privacy
  choice, not an oversight: a shopper uploaded that photo to try on one
  product, not to be visible to a merchant browsing their dashboard.

## 12. Product image cache

Product photos are not transparent, not pre-processed, and not owned by us
— see the product spec's `ProductImageProcessor` responsibilities. To avoid
re-running detection/background-processing on every try-on of the same
product:

1. Download the product image, compute a content hash (sha256 of bytes).
2. If a `TryOnGeneration` (or a small `ProcessedProductAsset` cache keyed by
   hash — added when `packages/tryon`'s image pipeline is implemented in
   Phase 2) already has that hash processed, reuse the canonical eyewear
   asset instead of reprocessing.
3. Only the customer-specific generation step runs fresh every time.

This is a cost/latency optimization, not a correctness requirement — it
must never cause two different product photos to collide (hash includes the
full byte content, not just the URL, since merchants sometimes reuse a
filename for a different image).

## 13. Open decisions (deliberately deferred)

These are flagged rather than guessed at, per the phased plan:

- ~~**Real AI provider.**~~ Resolved in Phase 2, two vendors available —
  same `TryOnProvider` contract, swap via `AI_PROVIDER`, nothing else in
  the app changes either way:
  - `packages/providers/real` (`GeminiTryOnProvider`) calls Google
    Gemini's image-editing model (`gemini-3.1-flash-image-preview` by
    default, overridable via `GEMINI_IMAGE_MODEL`) directly with the
    customer's photo and the merchant's product photo, prompted to
    composite the eyewear onto the face. Set `AI_PROVIDER=gemini` +
    `GEMINI_API_KEY` — see DEPLOYMENT.md.
  - `packages/providers/fashn` (`FashnTryOnProvider`) calls FASHN's
    Try-On Max model via their official `fashn` SDK — a genuinely async
    vendor job (submit → poll), unlike Gemini's synchronous call, so it
    maps directly onto the interface's queued/processing/completed
    states rather than needing to fake them. Chosen as an alternative
    after a merchant compared both on real glasses photos and preferred
    FASHN's results. Set `AI_PROVIDER=fashn` + `FASHN_API_KEY`.

  `ProductImageProcessor` (glasses detection/isolation from an arbitrary
  product photo) is still deferred — see below.
- **Attribution model beyond last-touch.** Default is last-touch/product,
  configurable window. First-touch/linear models are a Phase 4 nice-to-have.
- **Shopify app review requirements** (OAuth scopes, embedded app vs. theme
  app extension) — deferred to Phase 3 when the Shopify integration is built.

## 14. Result validation

Before a `TryOnSession` is marked `COMPLETED`, the worker checks: the result
image exists and decodes, dimensions are sane, a face is present in
roughly the expected region, and the image isn't a degenerate/blank output.
Failing validation triggers one retry (new `TryOnGeneration` attempt,
transparent to the customer) before surfacing `FAILED` with a friendly
error — never silently returns a broken image.

## 15. Tech stack

| Concern | Choice | Why |
|---|---|---|
| Language | TypeScript everywhere | one type system across SDK ↔ API ↔ dashboard |
| Monorepo | pnpm workspaces + Turborepo | shared packages, cacheable builds |
| Dashboard/Admin/Demo store | Next.js + React + Tailwind | matches spec's stack, good DX for the premium-dashboard requirement |
| API + worker | Fastify (Node/TS) | needs a persistent process for BullMQ; not a serverless-shaped workload |
| ORM | Prisma | matches spec, works cleanly against Supabase Postgres |
| Database | PostgreSQL via Supabase | already in use by the existing LumiOn MVP; reused as infra, not as its schema |
| Object storage | Supabase Storage (S3-compatible) | signed URLs, private buckets, already available |
| Queue | Redis (Upstash) + BullMQ | standard, well-understood job/retry semantics |
| Validation | Zod | shared schemas between API and SDK payloads |
| Testing | Vitest (unit), Playwright (e2e) | matches spec |

## 16. Roadmap

- **Phase 0 (architecture + schema + interfaces)** — done.
- **Phase 1 (core loop) — done**: multi-tenant DB live, `MockTryOnProvider`,
  queue + worker (`InMemoryTryOnQueue` for dev/CI, `BullMqTryOnQueue` for
  real deployments — same env-driven pattern as storage/providers), async
  `/api/v1/tryons` + `/api/v1/events` + `/api/v1/analytics`, the universal
  SDK (`TryOn.init/attach/open/close/destroy` + `detectProduct()`'s
  JSON-LD/OpenGraph/DOM-selector cascade), the real widget UI,
  `apps/demo-store` (a 4-product eyewear catalog + cart, embedding the SDK
  exactly like a real merchant would), and `apps/dashboard` (login,
  Overview, Try-ons list). Verified with unit tests, a real-Postgres
  integration test exercising the full create→worker→COMPLETED pipeline
  including the `allowedDomains` security boundary, and a Playwright
  smoke test driving an actual browser through
  product page → widget → upload → result → add-to-cart → cart, plus the
  dashboard's login → Overview → Try-ons list.
  Not in Phase 1: `/api/v1/uploads` as a separate endpoint (the customer
  photo is inlined as a data: URI in the create-tryon call instead —
  packages/sdk/README.md explains why), the product image content-hash
  cache (§12 — Phase 1 reprocesses the product image on every generation),
  and any retention-sweep job (expiresAt is set at creation; nothing yet
  deletes on it).
- **Phase 2** — real AI provider behind `packages/providers/real` — **done**:
  `GeminiTryOnProvider` (Google Gemini image editing, see §13). Still
  outstanding from Phase 2: `ProductImageProcessor` (eyewear detection,
  background handling, geometry extraction — the provider currently hands
  Gemini the whole merchant product photo as-is and relies on the prompt
  to have it identify just the glasses, rather than a pre-isolated
  cutout), and the product image content-hash cache.
- **Phase 3** — Shopify app, WooCommerce plugin, `OrderTrackingAdapter`
  implementations, UTM/attribution wired to real orders.
- **Phase 4** — billing — **plans/usage limits done** (§17); still
  outstanding: real payment collection (Stripe — currently manual, see
  DEPLOYMENT.md §8), white-label beyond button appearance (`Store.
  widgetConfig` already carries `logo`/`showPoweredBy`, not yet surfaced in
  the dashboard), the Integration Checker diagnostics page, analytics
  polish.

Nothing in Phase 1 should require re-architecting for Phase 2/3 — that's
the point of §6, §8 and §10 being interfaces/strategies rather than
inline code.

## 17. Plans / usage limits

Every `Tenant` has an optional `planId` (`Plan` — `STARTER`/`GROWTH`/`PRO`,
seeded by migration, priced with Gemini's per-image cost plus margin — see
DEPLOYMENT.md §8) and a persistent `topUpCredits` balance. Enforcement
(`apps/api/src/domain/planEntitlement.ts`) runs at try-on **creation**
(`POST /api/v1/tryons` and `/retry`), before anything is enqueued — never
after the fact — so a blocked request never reaches the AI provider and
never costs anything:

1. Count `UsageRecord` rows for the tenant since the start of the current
   calendar month (UsageRecord is only ever created once a generation
   actually `COMPLETED` — real cost already incurred — matching how it's
   used elsewhere, e.g. the admin dashboard's billable-units total).
2. If under `plan.monthlyLimit`, allow.
3. Otherwise, allow only if `topUpCredits > 0`; the worker
   (`processTryOnJob.ts`) decrements it by one when *that* generation
   completes — a top-up credit is spent by completions past the monthly
   line, not by attempts.
4. A blocked request gets `402 { error, code: "PLAN_LIMIT_REACHED" }` —
   the `error` string is intentionally generic (never mentions plans,
   quota, or billing) since it reaches the shopper's browser via the
   widget; the merchant is expected to notice from their own dashboard
   (`GET /api/v1/billing` — plan, usage this month, top-up balance) rather
   than from anything shown to their customer.

A tenant with no plan (`planId: null`) has a monthly limit of 0 — i.e. is
fully blocked. Every new signup is assigned Starter automatically
(`POST /api/v1/auth/register`); the one migration-time exception is
existing tenants from before Plans existed, defaulted onto Starter by the
`default_plan_for_existing_tenants` migration so a deploy never silently
cuts off an already-live merchant.

Payment itself is manual for now (DEPLOYMENT.md §8): a merchant requests
an upgrade or top-up from their dashboard (`POST /api/v1/billing/request`
— just records a note + timestamp on the tenant), and the platform admin
fulfills it by hand from `apps/admin` (`PATCH .../plan`,
`POST .../topup`) once payment is confirmed outside the system — either
admin action clears the pending request note, since both are "the request
being handled," whether by granting it as asked or by a manual override.
