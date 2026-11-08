---
updated: 2026-11-08 (Phase 1)
source-of-truth: docs/ai/reports/phase-0.md, phase-1.md; observed tool output
---

# Known issues

| # | Severity | Found | Issue | Workaround / owner |
|---|---|---|---|---|
| KI-1 | medium | 2026-11-08 | Local `backend/.env` has `QUEUE_CONNECTION=database` while `artisan dev` runs Horizon (Redis only) → queued jobs never run in dev | Phase 2 sets redis per ADR-0005 |
| KI-2 | medium | 2026-11-08 | Laravel Boost MCP (`php artisan boost:mcp`) failed to connect (CONNECTION_CLOSED) | Phase 4: run manually, check PHP path/timeout; until then use `composer show`/docs |
| KI-3 | low | 2026-11-08 | `pnpm peers check`: `eslint-config-next` plugins declare peer `eslint ≤9`, installed eslint 10 — warning only, lint works | Watch on eslint-config-next upgrades |
| KI-4 | low | 2026-11-08 | `create-next-app` 16.4 writes `typescript ^7`; `typescript-eslint` 8.x rejects TS 7.0 | Pinned `^6` (ADR-0004); revisit when typescript-eslint supports ≥7.1 |
| KI-5 | low | 2026-11-08 | Ports 8000/8001 are taken by HTTP Toolkit on the developer machine → `php artisan serve` default collides | Use nginx + php-fpm (ADR-0008) |
| KI-6 | low | 2026-11-08 | `backend/.env.example` missing `DB_*`, `REVERB_*` keys present in `.env` | Phase 2 `.env.example` sync + `dev-check` key parity |
| KI-7 | info | 2026-11-08 | GitHub free plan: branch protection/required checks unavailable (403) | ADR-0010 conventions + local hooks |
| KI-8 | info | 2026-11-08 | Frozen starter UI still built in CI (`npm run check`, `tsc`, Vite build) — extra minutes, no value | Accept until the UI stack is removed by a future ADR |
| KI-9 | info | 2026-11-08 | Bash tool: cwd carried between parallel calls in one turn; `index.lock` appeared briefly from the IDE's git | Always use absolute paths; retry git after a second |
