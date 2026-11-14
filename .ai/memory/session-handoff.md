---
updated: 2026-11-15 (WP-11 IN_PROGRESS on feat/wp-11-contract-session-reference; WP-10 merged #42/#43/#44, WAITING for the production track; WP-03 WAITING deploy; WP-00/01/02 WAITING)
source-of-truth: this session; overwritten every session — owned by the development track (KI-20)
---

# Session handoff

Written for whoever continues the **development track** (the second developer, a colleague, Codex or Claude Code). The production track's state is in `docs/ai/reports/production-notes.md`, not here.

## Developer's standing instruction
- 2026-11-09: «Коллега: продолжает незавершённые задачи по разработке проекта согласно подготовленному плану.» / «Не включай настройку production-среды в задачи коллеги». «Не изменяй legacy-проект. Он является источником истины и эталоном поведения.» «в homi.uz мы будем исправлят старые ошибки и логические не верные решение».
- 2026-11-14 answer rounds (verbatim in `docs/migration/decisions/2026-11-14-developer-answers.md`), among them: «Сразу новый /api/v1»; «Сначала весь фронтенд на моках»; «фуллстак только по очереди …»; «Всё сразу на prod»; «Срока нет, важнее полнота».
- 2026-11-14, queue prompt: «Один пакет = одна ветка = один PR в main. В main напрямую не пушить.» «Если спецификация расходится с кодом … исправь её в том же PR …» «Без согласия первого разработчика не делать: новые зависимости, всё, что касается staging и production, миграции на production.» «Legacy production никогда не вызывать».
- 2026-11-15: «Удали черновик gmail это не та почта который нужно использовать» (never use the connected Gmail for project mail); «бери WP-03»; «открой PR со статусом в main»; «сливай #40»; «потверждаю» (the WP-03 package list of #39); «сливай #39»; «сливай #41»; «бери WP-04»; «сливай #42»; «погнали» (the follow-up docs PR); «сливай #44»; «сливай #43»; «бери WP-11»; «тебе можно править .env пока я сам не запрещу» (the committed deny `Edit(**/.env)` in `.claude/settings.json` still blocks the agent; values are never printed).

## State at handoff
- `main` = `02f43ae`: #42 (WP-10), #44 (its status and `CLAUDE.md` commands) and #43 (`SOURCES_ALLOW_STUB` in `backend/.env.example`) are merged. `backend` is green on `main` after each (#43: run 43654802905). The developer's local `backend/.env` lacks `SOURCES_ALLOW_STUB` and `TELESCOPE_RECORD_ALL`, which `scripts/dev/env-keys.sh` reports.
- **WP-11** was taken on «бери WP-11». Branch `feat/wp-11-contract-session-reference`, status `IN_PROGRESS`.
- WP-10 is `WAITING (merged in #42; production track …)`; WP-03, WP-00, WP-01 and WP-02 are `WAITING`, unchanged. Local only: `homi_test` on Homebrew PostgreSQL (`127.0.0.1`); Playwright's Chromium in `~/Library/Caches/ms-playwright`.
- Verify: `make ci-backend` → exit 0; `DB_HOST=127.0.0.1 DB_USERNAME=<os user> DB_PASSWORD= make test-pgsql` → 4 passed; `make ci-frontend` → exit 0.

## Done this session
- WP-10 steps 1–10, each test seen failing first: error codes; drivers and selector; audit and `sources:*`; stubs and `JsonShape`; OpenAPI with its check and `ApiError`; generated types with `types:check`; typed client and `put`; `docs/api/README.md`. `make ci-backend` → exit 0 (Pest 215 passed, 4 skipped); `make test-pgsql` → 4 passed (the race test failed 3/3 without the lock); `make ci-frontend` → exit 0.
- Stale-file proofs: `composer openapi:check` and `pnpm types:check` → exit 1 with a field added to `MediaFileResource`, exit 0 restored.
- Spec corrected (rule 6); AM-52 in `docs/ai/reports/phase-3-notes.md` §M; the spec's Handoff filled.

## Waiting for the developer (do NOT start on your own)
1. **WP-10 (production track):** it approves the migration `2026_11_14_224945_create_source_flag_changes_table` on production, deploys, adds `/docs/api` to the nginx basic-auth locations and runs `php artisan sources:list` on staging; then WP-10 `DONE`.
2. **The developer's local `backend/.env`:** add `SOURCES_ALLOW_STUB=true` and `TELESCOPE_RECORD_ALL=false` (the template defaults); staging and production `.env` get `SOURCES_ALLOW_STUB` from the production track.
3. **WP-03:** the deploy with the production track (a no-op for users), then `DONE`.
4. **Operator request:** from the project's own mailbox (WP-02 Part A; never the connected Gmail); then "Sent" in `docs/migration/decisions/2026-11-14-operator-request.md` and WP-02 `DONE`.
5. **First developer:** accept ADR-0016 … 0019, answer the PR-size and deploy questions of #30; then WP-01 `DONE`.
6. **WP-00 (production track):** counts, migration approval, deploy, staging check; outbound addresses to the operator (#37).
7. **Reviewer decisions of #37:** `GET /listings/new`, the `503` on a malformed `count`, DEC-51 hiding, a WP-30 split. Unchanged: Q-API-059 … 062, Q-APP-025, DEC-13 / Q-SEC-021, DEC-47, WP-59 operators, DEC-08/12/19/20.
8. The queue package after WP-11 only on the developer's word.

## Gotchas learned this session
- Source feature names contain dots: read `config('sources.features')` whole; a dotted key reads a nested array.
- Scramble documents array literals, enums and spreads, but an array `+` union becomes a bare `array` and a ternary over two shapes an `anyOf`; the server URL comes from `APP_URL` unless a transformer replaces it; in-process exports fill static caches (one per test process).
- Pennant: its retry of a lost insert cannot run inside a PostgreSQL transaction (store the default row first); its events carry the `GlobalScope` object.
- Scramble types model attributes from the migrated database of the default connection: `openapi:export` needs it (CI passes `DB_*` to `ci:check`).
- Pest: global functions and `const` in test files collide across files (use `Tests\Support` classes); `Request::create()` sends `Accept-Language: en-us` unless removed. Vitest runs `@ts-expect-error` calls (put them in an uncalled function).
- Check `gh api repos/amediateam/homi/pulls/<n> --jq .merged` before acting on "слит". Next numbers: AM-53, KI-29, ADR 0020.

## Active subagent work at handoff
- None.
