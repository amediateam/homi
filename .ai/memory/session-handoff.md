---
updated: 2026-11-15 (WP-03 taken: draft PR #39 with the npm package list for confirmation and the backend pgsql group; WP-00/01/02 WAITING)
source-of-truth: this session; overwritten every session — owned by the development track (KI-20)
---

# Session handoff

Written for whoever continues the **development track** (the second developer, a colleague, Codex or Claude Code). The production track's state is in `docs/ai/reports/production-notes.md`, not here.

## Developer's standing instruction
- 2026-11-09: «Коллега: продолжает незавершённые задачи по разработке проекта согласно подготовленному плану.» / «Не включай настройку production-среды в задачи коллеги». «Не изменяй legacy-проект. Он является источником истины и эталоном поведения.» «в homi.uz мы будем исправлят старые ошибки и логические не верные решение».
- 2026-11-14 answer rounds (verbatim in `docs/migration/decisions/2026-11-14-developer-answers.md`), among them: «Сразу новый /api/v1»; «Сначала весь фронтенд на моках»; «фуллстак только по очереди …»; «Всё сразу на prod»; «Срока нет, важнее полнота».
- 2026-11-14, queue prompt: «Один пакет = одна ветка = один PR в main. В main напрямую не пушить.» «Если спецификация расходится с кодом … исправь её в том же PR …» «Без согласия первого разработчика не делать: новые зависимости, всё, что касается staging и production, миграции на production.» «Legacy production никогда не вызывать».
- 2026-11-15: «Удали черновик gmail это не та почта который нужно использовать» (never use the connected Gmail for project mail); «бери WP-03»; «открой PR со статусом в main».

## State at handoff
- `main` = `3876d9b` (#38). WP-03 branch `feat/wp-03-dependencies-and-test-tooling` (pushed), **draft PR #39**, 3 commits on `main`. The shared working tree is on that branch.
- **WP-03** — `WAITING (draft PR #39)` in the spec and the queue row of the branch; `main` still shows `TODO` until #39 merges. Done on the branch: the backend `pgsql` group (step 10) and the package table with vetting in the PR body (step 2). **Nothing is installed**: `frontend/pnpm-lock.yaml`, `composer.lock` unchanged.
- WP-00, WP-01, WP-02 — `WAITING`, unchanged (see the list below).
- Local only: database `homi_test` on this machine's Homebrew PostgreSQL (`127.0.0.1`, owner = the OS user). The `.env` database host of this machine is another LAN host; it was not touched.
- Verify: `DB_HOST=127.0.0.1 DB_USERNAME=<os user> DB_PASSWORD= make test-pgsql` → 3 passed; `make ci-backend` → exit 0 (103 tests: 100 passed, 3 skipped); `collect_ids.py --check` and `task_graph.py --check` → 0; `make registry-check` → current.

## Done this session
- **pgsql group** (`backend/tests/PgsqlTestCase.php`, `tests/Pest.php` binding + `concurrently()`, suite `Pgsql`, `make test-pgsql`, CI steps in `backend.yml`): red first (class, helper, binding missing), then green. `MediaOwnershipRaceTest` fails when `MediaFile::fromStored()` is made `first() ?? create()` (tried, reverted with `git checkout`). Guard: `PgsqlGuardTest` (8 cases); `DB_DATABASE=homi_guard_probe` → 3 skipped, exit 1 with `--fail-on-skipped`.
- **Package vetting** without installing: `npm view` metadata; a scratch resolution outside the repository (`pnpm install --lockfile-only --ignore-scripts`); `pnpm audit --prod` → no known vulnerabilities; `pnpm audit` → 1 moderate (`minimatch` via `eslint`), the same on `main`'s lockfile; lockfile 417 → 665 packages.
- **Spec WP-03 corrected** (rule 6): `vite` is a required peer of Vitest 5 (added); `vite-tsconfig-paths` not needed (Vite 8 `resolve.tsconfigPaths`); `esbuild` key → `oxc`; no `esbuild` build script, install scripts are `@swc/core`, `@parcel/watcher` (via `next-intl` 4.15) and `fsevents`; `openapi-typescript` peer `typescript ^5`; `react-dom` peer for `@homi/ui`; pnpm 11 minimum release age; backend details (unbinding, `--fail-on-skipped`, booted-config check).
- I told the developer mid-session that `php artisan test` drops a shell `DB_CONNECTION`; a run disproved it (Dotenv only clears what it loaded) and I corrected it in chat. The spec states the checked behaviour.

## Waiting for the developer (do NOT start on your own)
1. **First developer:** confirm the package table of PR #39 (31 packages; the points `vite`, `@vitejs/plugin-react`, `next-intl`'s native packages, no build scripts allowed). Then WP-03 steps 3–9 on the same branch.
2. **Main's queue row:** PR #40 (`docs/wp-03-queue-status`, opened on «открой PR со статусом в main») sets WP-03 to `WAITING` on `main`, the same line as on #39; it waits for review and merge.
3. **Send the operator request** from the project's own mailbox (WP-02 spec, Part A; never the connected Gmail); then fill "Sent" in `docs/migration/decisions/2026-11-14-operator-request.md` and set WP-02 to `DONE`.
4. **First developer:** accept ADR-0016 … 0019 (then a `Status` PR) and answer the PR-size and deploy questions of #30; then WP-01 `DONE`.
5. **WP-00 (production track):** counts, migration approval, deploy, staging check; then `DONE`. Outbound addresses to the operator (#37).
6. Reviewer decisions of #37: `GET /listings/new`, the `503` on a malformed `count`, DEC-51 hiding, a WP-30 split. Unchanged: Q-API-059 … 062, Q-APP-025, DEC-13 / Q-SEC-021, DEC-47, WP-59 operators, DEC-08/12/19/20.

## Gotchas learned this session
- The PostToolUse Pint hook removes imports that are unused at the moment of an edit: add the `use` lines in the same edit as their first use, or re-add them.
- A closure written inside a Pest test carries the generated test class as scope; unbind it before `Concurrency` (done in `concurrently()`). The serialiser cannot tell two closures on one line apart.
- `ProcessDriver` rethrows a child's exception by class; a `QueryException` turns into an `ArgumentCountError` naming it.
- pnpm 11 silently writes `minimumReleaseAgeExclude` entries for pinned versions younger than its release age; never commit them.
- The local PostgreSQL has a database named `:memory:` (someone ran pgsql with phpunit's SQLite name) — not ours to drop.
- Check `gh api repos/amediateam/homi/pulls/<n> --jq .merged` before acting on "слит". Next numbers: AM-51, KI-29, ADR 0020.

## Active subagent work at handoff
- None. CI of PR #39 was still running when this was written.
