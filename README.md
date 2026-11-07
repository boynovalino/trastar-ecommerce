# TRASTAR eCommerce Sparepart Motor

This repository contains the existing TRASTAR storefront/admin visual prototype and the initial Node.js + PostgreSQL backend foundation.

**Status: DEVELOPMENT, NOT AN ONLINE STORE.** The storefront and existing admin are demo UI; checkout/payments are disabled, and the real admin dashboard integration is still under development. Do not use real customer information or attempt transfers to sample accounts.

## Scope
- Static prototype: `index.html`, `admin.html`, `assets/`.
- Backend: `api/` Vercel Node.js functions and `lib/` shared services.
- Database: `db/` versioned PostgreSQL migrations, `test/` source/integration tests.
- Development database: Neon project `frosty-frost-15366768`, `trastar_dev`; no other project databases used.
- Production database: client hosting PostgreSQL, not selected or provisioned.
- Payment gateway, foreign card acceptance, carrier international rates, real admin UI, production release: **not completed**.

See [DEVELOPMENT.md](DEVELOPMENT.md) for API usage, development-only migration/seed, safe simulation mode, and remaining blockers.

## Local verification
```
npm ci
npm run check
npm test
```

The legacy HTML prototype can still be served statically, but it is explicitly marked as non-transactional. No production release is authorized by this development branch.
