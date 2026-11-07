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

## Customer storefront integration (development preview)
- index.html now waits for GET /api/products and builds the customer-facing catalog from database variants. No hardcoded catalog fallback on API failure.
- Legacy localStorage checkout/order and fake payment/VA display routes are removed from the customer path. Guest cart uses sessionStorage only. Server recalculates price/stock/total.
- storefront-connected.js preserves the home/shop/product shell and provides connected cart, preview checkout and customer order status.
- Preview checkout calls POST /api/quote for an HMAC-signed simulated shipping quote, then POST /api/orders. Backend stores an unpaid PENDING simulation in Neon. Customer checks status using session token and GET /api/orders.
- admin-live.html reads the same order through authenticated GET /api/admin-orders.
- Preview uses fixed .invalid email and synthetic customer name; address fields are test-only. DO NOT collect actual customer information until privacy/payment/shipping scope gates pass.
- Multiple variants are separate SKU cards until a final variant picker is approved. Quantity tier pricing is displayed on product detail and cart.
- npm test exercises mock catalog boot; node --env-file=.env.local test/integration-storefront.mjs exercises the TRASTAR development database. Never run against production.
- Browser-interactive UI QA: NOT RUN. Vercel preview GET health and catalog checks are separate.

## Admin inventory, order lifecycle and audit log
- The Vercel /admin route now targets the database-backed admin-live.html. The old admin.html remains a visually labelled legacy demo, not a genuine management backend.
- Dev admin OWNER/ADMIN may update product name, weight, visibility, export flag, SKU price/stock/active state, with an obligatory reason. Mutations are recorded in admin_audit_events. Staff view access remains limited to order listing.
- Admin can read simulated order items and cancel a PENDING preview order exactly once. Cancellation releases reserved stock transactionally, updates order to EXPIRED/CANCELLED and records an audit event; it never marks PAID.
- Expired preview orders are reclaimed before catalog, shipping quote or customer order-status reads. These lazy cleanup calls are for QA. Production requires durable payment/stock reservation policies and scheduled reconciliation.
- Migration 003_admin_audit.sql is additive and applies only to verified TRASTAR development PostgreSQL. It must not be applied to any unrelated app or client database.
- Lifecycle test: node --env-file=.env.local test/integration-admin-lifecycle.mjs; writes only synthetic fixtures to TRASTAR development and verifies concurrent checkout oversell prevention, cancellation idempotency, expiry release and audit trail.
