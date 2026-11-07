# TRASTAR eCommerce Foundation

Scope: development branch, not live eCommerce. No actual payments or couriers.

## Architecture
- Existing storefront and admin remain static visual prototypes, with visible DEMO notices and payment button disabled.
- New Vercel API routes under `api/` use Node.js and PostgreSQL (`pg`), not Supabase.
- A dedicated Neon development project has schema migrations in `db/`.
- Pricing is computed server side from SKU-specific quantity tiers.
- Checkout preview reserves stock and creates an **unpaid**, time-limited simulation order. The quote is HMAC signed and all line item prices and quantities are revalidated inside a database transaction.
- Payments are explicitly unavailable pending merchant provider activation and webhook testing. International shipping quote values are **fabricated test rates** and never claims to be a courier quote.
- Admin API is separate from the existing demo admin. Session, product creation, tier updates, order list require a server-backed admin account and signed HttpOnly cookie.

## Environment and safety
- Use Neon project `frosty-frost-15366768`, database `trastar_dev`, development branch only.
- Never use or copy credentials from unrelated projects.
- The preview simulation is enabled only if `ALLOW_PREVIEW_SIMULATION=true` and either `VERCEL_ENV=preview` or `TRASTAR_ENV=development` with no production Vercel environment.
- Do not enable on a production host. Never point production traffic at the development database.
- Do not run `db/seed.js` or `db/create-admin.js` against a production database.
- In absence of merchant sandbox credentials, payment and real shipping APIs return an explicit unavailable response.

## Commands
```
npm ci
npm run check
npm test
npm run db:migrate
ALLOW_PREVIEW_SIMULATION=true npm run db:seed
```
Run the latter commands only with explicitly verified TRASTAR development DATABASE_URL (secret not committed).
Provision an admin with `TRASTAR_INITIAL_ADMIN_EMAIL` and `TRASTAR_INITIAL_ADMIN_PASSWORD` in an isolated development environment, then run `npm run db:create-admin`.

## API (prototype)
- `GET /api/health` verifies project identity and database schema.
- `GET /api/products` lists actual Neon development products/variants/tier prices.
- `POST /api/quote` receives `{country:'ID'|'SG'|...,items:[{variantId,quantity}]}`, returns signed simulated quote (preview only).
- `POST /api/orders` receives `{items,quoteToken,address:{country,line1,city,...},email,recipientName}`, creates PENDING/unpaid preview order; no payment is captured.
- `GET /api/orders?orderNo=...` with `x-order-access-token` returns a single customer-owned order status.
- `POST /api/session` authenticates an existing admin; `GET` checks session, `DELETE` logs out locally.
- `GET/POST /api/admin-products`, `POST /api/admin-price-tiers`, `GET /api/admin-orders` are RBAC protected.
- `POST /api/payments` responds 503 until the approved payment integration is implemented.

## Release blockers
Payment provider activation, verified international shipping carrier/coverage, finalized scope and actual product catalog, production hosting specs and database, secure admin interface integration, e2e QA, backups and recovery, CTO/CEO production approval.

## Database migration to client infrastructure
Production uses a separate PostgreSQL instance controlled by client. Apply reviewed schema migrations to *empty* client database and import approved catalog only. Preview fixture orders must not become production orders. Verify DB connection, app identity, backup/restore and a known rollback path before DNS cutover.

## Development-only QA screens
- `/qa` reads Neon catalog and tests signed shipping quotes plus PENDING simulated orders using synthetic recipient data.
- `/admin-live` is the separate database-backed admin prototype. It supports session login, product creation, per-SKU quantity price tiers, and order reporting. Existing `/admin` remains the original demo and is not connected to PostgreSQL.
- The development QA admin is provisioned using an isolated, gitignored local environment. Do not publish credentials or reuse this account for the client. Production owner onboarding and MFA are still pending.
- Backend tests against Neon development include `node --env-file=.env.local test/integration-neon.mjs` and `node --env-file=.env.local test/integration-admin.mjs`. These tests WRITE clearly labeled fixtures; they are not part of routine CI and must never run against client production.
