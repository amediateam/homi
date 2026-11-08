# Architecture Decision Records

One file per decision, numbered, never edited after acceptance except to change `Status` (Superseded by ADR-xxxx). Write a new ADR to change a decision.

Format: `NNNN-short-slug.md`, template in `0000-adr-template.md`. Language: English. Keep each ADR under ~80 lines: context, decision, consequences. Link the Phase report or task contract that triggered it.

| # | Title | Status |
|---|---|---|
| [0001](0001-monorepo-layout-and-canonical-paths.md) | Monorepo layout and canonical paths | Accepted |
| [0002](0002-backend-frozen-inertia-stack.md) | Backend: Inertia/React starter stack kept but frozen | Accepted |
| [0003](0003-auth-sanctum-bearer-tokens.md) | Authentication: Sanctum bearer tokens, Telegram as identity | Accepted |
| [0004](0004-toolchain-pins-pnpm-node-php.md) | Toolchain pins: pnpm workspace, Node 26, PHP 8.5 | Accepted |
| [0005](0005-redis-queue-cache-horizon.md) | Redis for queue and cache, Horizon as worker | Accepted |
| [0006](0006-time-locale-i18n-currency.md) | Time, locale, translations and currency defaults | Accepted |
| [0007](0007-api-v1-response-envelope-pagination.md) | API versioning, response envelope, pagination | Accepted |
| [0008](0008-local-environment-nginx-mkcert.md) | Local environment: Homebrew nginx + php-fpm + mkcert | Accepted |
| [0009](0009-listing-ingestion-push-model.md) | Listing ingestion: HOMI owns the data, collectors push | Proposed (details pending collector audit) |
| [0010](0010-git-workflow-conventions.md) | Git workflow without server-side branch protection | Accepted |
| [0011](0011-hosting-topology.md) | Hosting topology for staging and production | Accepted |

Decisions were taken at the Phase 0 checkpoint on 2026-11-08 (`docs/ai/reports/phase-0.md` §14).
