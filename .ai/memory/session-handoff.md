---
updated: 2026-11-14 (WP-00 media ownership fix done up to review: PR #27 open, CI pass; companion PR #28 for known issues; queue row WP-00 = REVIEW)
source-of-truth: this session; overwritten every session — owned by the development track (KI-20)
---

# Session handoff

Written for whoever continues the **development track** (the second developer, a colleague, Codex or Claude Code). The production track's state is in `docs/ai/reports/production-notes.md`, not here.

## Developer's standing instruction
- 2026-11-09: «Коллега: продолжает незавершённые задачи по разработке проекта согласно подготовленному плану.» / «Не включай настройку production-среды в задачи коллеги». «Не изменяй legacy-проект. Он является источником истины и эталоном поведения.» «в homi.uz мы будем исправлят старые ошибки и логические не верные решение».
- 2026-11-14 answer rounds (verbatim in `docs/migration/decisions/2026-11-14-developer-answers.md`), among them: «Сразу новый /api/v1»; «Сначала весь фронтенд на моках»; «фуллстак только по очереди там где ты остоновился он продолжит или там где он остоновился ты продоожиш»; «Всё сразу на prod»; «Срока нет, важнее полнота».
- 2026-11-14, queue prompt: «Возьми первый пакет очереди со статусом не DONE. Сейчас это WP-00 …; добро на него дано. Работай строго по спецификации: тесты сначала, затем код, затем чек-лист приёмки.» «Один пакет = одна ветка = один PR в main. В main напрямую не пушить.» «Если спецификация расходится с кодом … исправь её в том же PR и напиши об этом в описании PR.» «Без согласия первого разработчика не делать: новые зависимости, всё, что касается staging и production, миграции на production.» «Legacy production никогда не вызывать».

## State at handoff
- **WP-00** (Media ownership fix): branch `feat/wp-00-media-ownership-fix` (4 commits on `main` 3bf4f39, plus the save commit), **PR #27** github.com/amediateam/homi/pull/27, `gh pr checks 27` → `ci pass`. Queue row and spec status: `REVIEW`. Spec "Handoff" filled.
- **PR #28** (draft, branch `chore/known-issues-media-ownership`): KI-25 → resolved, new KI-27, KI-28. Merge after #27 is deployed.
- `backend/composer.lock` in the working tree is modified by someone else's `composer update` (PR #26 `chore/deps-update`, another session). Not part of WP-00 — never stage it. `backend/vendor` already matches the new lock. After #26 merges, merge `main` into the WP-00 branch.
- Next package of the queue after WP-00: **WP-01** (ADRs and shared files); WP-03 depends on WP-00 and WP-01.
- Verify: `make ci-backend` (exit 0 at the last code commit: Pest 92/92, PHPStan 0 errors) and `python3 scripts/migration/collect_ids.py --check && python3 scripts/migration/task_graph.py --check` (both exit 0).

## Done this session
- WP-00 test-first: `tests/Feature/Media/MediaOwnershipTest.php` (36 cases) written before the code; RED run: media suite 27 of 54 passed, every new case failed for the missing feature. Then code; `php artisan test --compact tests/Feature/Media` → 64/64.
- Specification corrected in the PR (rule 6): AM-50 (a Source never wrote media rows — `getAuthIdentifier()` 500 in `actorKey()`), `actorKey()` and `MediaApiTest` added to the files, `failed()` guard dropped, test notes. Recorded in `docs/ai/reports/phase-3-notes.md` §I.
- `security-reviewer` subagent pass on the diff: no blocker; S1, S2, S4 (min), S5, S6 fixed with tests (each seen failing first). Its `%C3%28` → 500 claim did not reproduce over HTTP (framework answers `400 Malformed URL.`); `%00` reproduced the class of problem. Other claims spot-checked: regex newline (`php -r`), missing `throttle:api` (`route:list`).
- `php artisan migrate --pretend` → PostgreSQL SQL of the migration read; **not executed on PostgreSQL**.

## Waiting for the developer (do NOT start on your own)
1. Other developer: review and merge PR #27; then PR #28.
2. Production track (copied into PR #27): two counts from staging and production — rows in `media_files`, rows with `uploaded_by` null; approve the migration on production (`homi-deploy production --migrate`); deploy; check that `GET` of a foreign media id on staging answers `404`. Then set WP-00 to `DONE` in `docs/migration/wave-1/README.md`.
3. Developer: is the database configured in this checkout (a LAN host, not localhost) a personal dev database? If yes, `php artisan migrate` there would verify the migration on PostgreSQL before staging does.
4. Unchanged from before: review of PR #25 points, operator contact and service key (Q-SYS-009, Q-API-059 … 062), artwork (Q-APP-025), legal basis (DEC-13, Q-SEC-021), PostHog (DEC-47), support-bot operators (WP-59), DEC-08/12/19/20.

## Gotchas learned this session
- A `Source` is a plain model: `Sanctum::actingAs($source)` throws `TypeError`; sign it in with `createToken()` + `withToken()` and call `app('auth')->forgetGuards()` when a test switches actors.
- `Queue::fake()` also captures `dispatchSync()`; fake per test, not in `beforeEach`, when a test runs a job synchronously.
- Over HTTP, invalid UTF-8 in a path is refused by the framework (`400 Malformed URL.`), and `TrimStrings` strips trailing newlines; use `%00` to probe what reaches the database.
- Pest `artisan test` prints JSON (agent format); summarise it with a short `python3 -c` over the output file. zsh: a word starting with `==` breaks the command.
- The shared working tree may be used by a second session; do side branches in a `git worktree` under the scratchpad, not by switching branches.
- Next numbers after this session: AM-51, KI-29, ADR 0016 (check `main` and open PRs first; PR #28 takes KI-27, KI-28).

## Active subagent work at handoff
- None (the `security-reviewer` run finished; its report is summarised in PR #27).
