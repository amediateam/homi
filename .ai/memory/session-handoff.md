---
updated: 2026-11-15 (WP-11 merged #45/#46, WAITING for the production track; WP-10 merged #42/#43/#44, WAITING for the production track; WP-03 WAITING deploy; WP-00/01/02 WAITING)
source-of-truth: this session; overwritten every session — owned by the development track (KI-20)
---

# Session handoff

Written for whoever continues the **development track** (the second developer, a colleague, Codex or Claude Code). The production track's state is in `docs/ai/reports/production-notes.md`, not here.

## Developer's standing instruction
- 2026-11-09: «Коллега: продолжает незавершённые задачи по разработке проекта согласно подготовленному плану.» / «Не включай настройку production-среды в задачи коллеги». «Не изменяй legacy-проект. Он является источником истины и эталоном поведения.» «в homi.uz мы будем исправлят старые ошибки и логические не верные решение».
- 2026-11-14 answer rounds (verbatim in `docs/migration/decisions/2026-11-14-developer-answers.md`), among them: «Сразу новый /api/v1»; «Сначала весь фронтенд на моках»; «фуллстак только по очереди …»; «Всё сразу на prod»; «Срока нет, важнее полнота».
- 2026-11-14, queue prompt: «Один пакет = одна ветка = один PR в main. В main напрямую не пушить.» «Если спецификация расходится с кодом … исправь её в том же PR …» «Без согласия первого разработчика не делать: новые зависимости, всё, что касается staging и production, миграции на production.» «Legacy production никогда не вызывать».
- 2026-11-15: «Удали черновик gmail это не та почта который нужно использовать» (never use the connected Gmail for project mail); «бери WP-03»; «сливай #39» … «сливай #46» (each PR merged on its own word); «тебе можно править .env пока я сам не запрещу» (the committed deny `Edit(**/.env)` and the guard hook still block the agent; it never bypasses them and never prints values); «сделай все сам и добав все что не хватает» (the follow-up docs PR #47 of WP-11, opened and merged by the agent).

## State at handoff
- `main` = `e1a65f2` plus the WP-11 follow-up docs PR #47 (branch `docs/wp-11-after-merge`). Merged today: #42, #44, #43 (WP-10), #45 (WP-11) and #46 (its env keys). `backend` green on `main` after #45 (run 43657763081, `frontend` 43657762964) and after #46 (run 43658186462).
- WP-10 and WP-11 are `WAITING` for the production track; WP-03, WP-00, WP-01 and WP-02 are `WAITING`, unchanged. Open PRs: only Dependabot #5 (not to be merged, KI-4).
- Local only: `homi_test` on Homebrew PostgreSQL (`127.0.0.1`); Playwright's Chromium in `~/Library/Caches/ms-playwright`.
- Verify: `make ci-backend` → exit 0 (Pest 343 passed, 4 skipped); `DB_HOST=127.0.0.1 DB_USERNAME=<os user> DB_PASSWORD= make test-pgsql` → 4 passed; `make ci-frontend` → exit 0; `scripts/dev/env-keys.sh` → the four missing keys of item 2 below.

## Done this session
- **WP-10** steps 1–10 (error codes, source drivers, audit and `sources:*`, stubs, OpenAPI with `openapi:check`, generated types with `types:check`, typed client); each test seen failing first. AM-52 in `docs/ai/reports/phase-3-notes.md` §M.
- **WP-11** steps 1–9: the seven methods on stubs, `SetRequestLocale`, `AccessDenied`, `StubResponder`, the reference data objects, fixtures following the audit, OpenAPI and `@homi/types` typed field by field; each contract test seen failing first. AM-53 in §N.
- **Follow-up docs PR #47:** WP-11 `WAITING` in the queue and the spec; `CLAUDE.md` (current state, the `v1` route groups); the key names `TELESCOPE_RECORD_ALL`, `SOURCES_ALLOW_STUB`, `TELEGRAM_SUPPORT_USERNAME`, `RADAR_CREATION_ENABLED` in `docs/infrastructure/environments.md`, which the rule of `docs/handoff/parallel-work.md` §6 asks for and which were missing.

## Waiting for the developer (do NOT start on your own)
1. **WP-10 (production track):** approve the migration `2026_11_14_224945_create_source_flag_changes_table` on production, deploy, add `/docs/api` to the nginx basic-auth locations, run `php artisan sources:list` on staging; then `DONE`.
2. **The developer's local `backend/.env`** lacks `SOURCES_ALLOW_STUB`, `TELESCOPE_RECORD_ALL`, `TELEGRAM_SUPPORT_USERNAME` and `RADAR_CREATION_ENABLED` (without the last the local stack runs with radars off). The agent cannot write the file; the developer runs: `! printf '\nSOURCES_ALLOW_STUB=true\nTELESCOPE_RECORD_ALL=false\nTELEGRAM_SUPPORT_USERNAME=\nRADAR_CREATION_ENABLED=true\n' >> backend/.env`.
3. **WP-11 (production track):** set `TELEGRAM_SUPPORT_USERNAME` on staging and production, leave `RADAR_CREATION_ENABLED` unset, deploy, check on staging that `GET /api/v1/reference` answers without a token with `radars_enabled: false` and that a sign-in token opens `GET /api/v1/me`; then `DONE`.
4. **WP-03:** the deploy with the production track (a no-op for users), then `DONE`.
5. **Operator request:** from the project's own mailbox (WP-02 Part A; never the connected Gmail); then "Sent" in `docs/migration/decisions/2026-11-14-operator-request.md` and WP-02 `DONE`.
6. **First developer:** accept ADR-0016 … 0019, answer the PR-size and deploy questions of #30; then WP-01 `DONE`.
7. **WP-00 (production track):** counts, migration approval, deploy, staging check; outbound addresses to the operator (#37).
8. **Reviewer decisions of #37:** `GET /listings/new`, the `503` on a malformed `count`, DEC-51 hiding, a WP-30 split. Unchanged: Q-API-059 … 062, Q-APP-025, DEC-13 / Q-SEC-021, DEC-47, WP-59 operators, DEC-08/12/19/20.
9. **WP-12** (the next queue package) only on the developer's word.

## Gotchas learned this session
- Source feature names contain dots: read `config('sources.features')` whole; a dotted key reads a nested array.
- **Scramble:** an array `+` union becomes a bare `array`, a ternary over two shapes an `anyOf`; an enum resolves only through a method that declares it (`Locale::fromField()`, not `BackedEnum::from()`); a list built with `foreach` is typed, one from `array_map` is not; the `array` rule reads as a list of strings; the server URL comes from `APP_URL` unless a transformer replaces it; in-process exports fill static caches (one per test process); it types model attributes from the migrated database, so `openapi:export` needs it (CI passes `DB_*` to `ci:check`).
- Pennant: its retry of a lost insert cannot run inside a PostgreSQL transaction (store the default row first); its events carry the `GlobalScope` object.
- Pest: global functions and `const` in test files collide across files (use `Tests\Support` classes); `Request::create()` sends `Accept-Language: en-us` unless removed. Vitest runs `@ts-expect-error` calls (put them in an uncalled function).
- `vp check` of `backend/` formats the JSON fixtures; run `npm run check:fix`. The guard hook refuses any Bash command whose text names the env file, even inside a heredoc; use Edit for such text.
- Check `gh api repos/amediateam/homi/pulls/<n> --jq .merged` before acting on "слит". Next numbers: AM-54, KI-29, ADR 0020.

## Active subagent work at handoff
- None.
