# Architecture Decision Records

One file per decision, numbered, never edited after acceptance except to change `Status` (Superseded by ADR-xxxx). Write a new ADR to change a decision.

Format: `NNNN-short-slug.md`, template in `0000-adr-template.md`. Language: English. Keep each ADR under ~80 lines: context, decision, consequences. Link the Phase report or task contract that triggered it.

| # | Title | Status |
|---|---|---|
| [0001](0001-monorepo-layout-and-canonical-paths.md) | Monorepo layout and canonical paths | Accepted |
| [0002](0002-backend-frozen-inertia-stack.md) | Backend: Inertia/React starter stack kept but frozen | Accepted |
| [0003](0003-auth-sanctum-bearer-tokens.md) | Authentication: Sanctum bearer tokens, Telegram as identity | Accepted, amended by 0018 |
| [0004](0004-toolchain-pins-pnpm-node-php.md) | Toolchain pins: pnpm workspace, Node 26, PHP 8.6 | Accepted |
| [0005](0005-redis-queue-cache-horizon.md) | Redis for queue and cache, Horizon as worker | Accepted |
| [0006](0006-time-locale-i18n-currency.md) | Time, locale, translations and currency defaults | Accepted, amended by 0019 |
| [0007](0007-api-v1-response-envelope-pagination.md) | API versioning, response envelope, pagination | Accepted, amended by 0017 |
| [0008](0008-local-environment-nginx-mkcert.md) | Local environment: Homebrew nginx + php-fpm + mkcert | Accepted |
| [0009](0009-listing-ingestion-push-model.md) | Listing ingestion: HOMI owns the data, collectors push | Accepted |
| [0010](0010-git-workflow-conventions.md) | Git workflow without server-side branch protection | Accepted |
| [0011](0011-hosting-topology.md) | Hosting topology for staging and production | Accepted, amended by 0015 |
| [0012](0012-local-media-on-disk-no-minio.md) | Local media storage on disk — no MinIO in development | Accepted |
| [0013](0013-nextjs-ssr-behind-nginx.md) | Next.js apps run as SSR servers behind nginx in production (SEO/GEO/AEO) | Accepted, amended by 0015 and 0018 |
| [0015](0015-server-runtime-as-deployed.md) | Server runtime as deployed: databases, Redis, process manager, code delivery | Accepted |
| [0016](0016-new-product-three-waves.md) | HOMI ships a new product; the migration runs in three waves | Proposed |
| [0017](0017-api-v1-source-drivers.md) | `/api/v1` is the only contract; a source driver per method selected by a Pennant feature | Proposed |
| [0018](0018-mini-app-architecture.md) | Mini App: App Router with a route per screen, server rendering through a session cookie with a header fallback | Proposed, amended by 0020 |
| [0019](0019-frontend-ui-stack.md) | Frontend UI stack: Tailwind 4 tokens, shadcn/ui with Radix, next-intl | Proposed |
| [0020](0020-mini-app-csp-nonce-per-request-documents.md) | Mini App CSP: a nonce per request, every document rendered at request time | Proposed |

Decisions 0001–0013 were taken at the Phase 0–2 checkpoints on 2026-11-08 (`docs/ai/reports/phase-0.md` §14). 0015 records the production bring-up decisions of 2026-11-09 (`docs/ai/reports/production-notes.md` §6). 0014 is reserved for the Phase 3 close ("media stack and Scramble", `HANDOFF.md` §4 T4), and the kvadro² plan (PR #9) also refers to it. 0016–0019 record the kvadro² migration decisions of 2026-11-14 (`docs/migration/24-three-wave-strategy.md` §8.1). 0020 records the CSP spike of WP-21 step 1 (2026-11-15).
