---
updated: 2026-11-14 (new-product course; Wave 1 plan and a queue of 45 work packages, all specified and verified; second answer round DEC-50 … DEC-56; PR #25 open; next step package WP-00)
source-of-truth: this session; overwritten every session — owned by the development track (KI-20)
---

# Session handoff

Written for whoever continues the **development track** (the second developer, a colleague, Codex or Claude Code). The production track's state is in `docs/ai/reports/production-notes.md`, not here.

## Developer's standing instruction
- 2026-11-09, work split: «Коллега: продолжает незавершённые задачи по разработке проекта согласно подготовленному плану.» Production/staging belongs to the first developer: «Не включай настройку production-среды в задачи коллеги».
- 2026-11-09: «Не изменяй legacy-проект. Он является источником истины и эталоном поведения.» Plan before code; no real passwords, tokens or personal data in docs or tests. «в homi.uz мы будем исправлят старые ошибки и логические не верные решение».
- 2026-11-14, three waves (prompt kept local as `prompt.md`): «Основной принцип — постепенный переход на новую архитектуру без остановки работающего сайта и нарушения существующей функциональности.»
- 2026-11-14, answer round (43 answers, verbatim in `docs/migration/decisions/2026-11-14-developer-answers.md`). The ones that shape everything: «Пока будет новый бот с нашим backend старый бот будет работат в старом»; «Постоянный новый продукт»; «Сразу новый /api/v1»; «Laravel как шлюз»; «Пересборка по аудиту»; «Полный App Router»; «На сервере через cookie-сессию»; «Сначала весь фронтенд на моках»; «Крупные PR по модулям»; «фуллстак только по очереди там где ты остоновился он продолжит или там где он остоновился ты продоожиш»; «Всё сразу на prod»; «Срока нет, важнее полнота».
- 2026-11-14: «у нас план должен быть детальным чтобы у разработчика не возникола вопросов и чтобы быстро безостоновки все сделал»; «Переписать план в этом же PR».
- 2026-11-14, second round (answers 44–51, DEC-50 … DEC-56): demo marker kept; radars switched off until WP-57; «Номер после нажатия»; «Постранично, по 20»; «<Город> целиком»; «Будет все модели мы сами переключим»; «Свой бот поддержки», operators in «Личный чат оператора».
- Gates that need the first developer's OK: dependency changes, new tools, anything on staging/production, `HANDOFF.md` §4 items marked **gate**.

## State at handoff
- **Where to continue:** read `docs/migration/25-wave-1-plan.md` once, then take the first package of `docs/migration/wave-1/README.md` that is not `DONE` — today **WP-00** (Media ownership fix, KI-25). Strategy and decisions: `docs/migration/24-three-wave-strategy.md`. Start code only after the developer's OK.
- The course: HOMI ships a new product under its own bot and brand; the frontend talks only to `/api/v1`; each method answers from a stub, from legacy through the operator's service key, or from HOMI's own code (a Pennant flag per method). The legacy bot, hosts and users are not taken over; nothing is migrated.
- Branch `docs/three-wave-plan`, **PR #25** (github.com/amediateam/homi/pull/25), open, docs only, no review yet, no CI on it. `main` is at `596d0db`. Until the PR is merged the plan is read from the branch.
- No application code has changed. `make ci-backend`, `make ci-frontend`, `make dev-check` were not run this session.
- `prompt.md` and `writing-block.md` stay untracked on purpose (machine paths); unstage them if they appear staged.
- Verify the plan: `python3 scripts/migration/collect_ids.py --check && python3 scripts/migration/task_graph.py --check` (both exit 0 at the last commit).

## Done this session
- `24` rewritten, `25-wave-1-plan.md` written, `wave-1/README.md` (one ordered queue) and 45 specifications `wave-1/WP-NN-*.md` (about 18 400 lines), drafted by subagents; WP-59 (support bot) written by the main session.
- **Verification pass.** WP-00 … WP-03 read by the main session against the code they change (WP-00: four defects fixed). The other 40 read in full by three agents against the repository, each other, `25` and for executability: 58 + 81 + 71 corrections (reported); 26 of their claims sampled by the main session against framework source, application code and the bundled Next.js docs → 26 confirmed.
- Settled for all packages: tests of concurrent writes live in `backend/tests/Pgsql/` (own base class, only a database named `*_test`, helper `concurrently()`), built by WP-03.
- Second answer round carried through 32 specifications by one agent (reported), seams and `24`/`25`/queue aligned by the main session (`phase-3-notes.md` §H lists the defaults it chose).
- Checks at the last commit: template of all 45 files (script); `collect_ids.py --check` exit 0; `build_open_questions.py` → 245 questions; `task_graph.py --check` exit 0; every repository path named exists or is created by a package (script); address and token scan → no hit.
- **Not covered:** nothing was executed; texts, constants and thresholds were not compared line by line with the audit; behaviour of packages not installed yet and of the Telegram Bot API is worded "verify before writing" (`wave-1/README.md`, "State of the specifications").
- Legacy tree only read; legacy production not called.

## Waiting for the developer (do NOT start on your own)
1. First developer: review PR #25. It changes three project rules: PR size (one PR per work package), the dependency batch (DEC-49), a production deploy on every merge. Technical points for him are listed in the PR description (OpenAPI UI and `/pulse` behind nginx, Redis in CI, the API server of the end-to-end CI job).
2. Developer: OK to start WP-00. Then WP-01 (four ADRs 0016–0019, each its own PR), WP-02 (send the request to the operator — the text is in the specification — and pin the legacy baseline), WP-03 (dependencies, test tooling).
3. Product owner: the operator's contact, the service key and its contract, limits, a batch read for saved lists, dump and schema (Q-SYS-009, Q-API-059, Q-API-060, Q-API-062); HOMI's own artwork (Q-APP-025); the legal basis and privacy text before real users arrive (DEC-13, Q-SEC-021); a PostHog account (DEC-47); proofreading of uz and en texts (Q-BOT-014).
4. Product owner, for the support bot (WP-59): who the operators are (their Telegram ids); the production track creates one support bot per environment.
5. Still open and needed inside Wave 1: DEC-08 (landing CSP), DEC-12 (retention periods), DEC-19 (thresholds of the phone-disclosure quota), DEC-20 (cap on instant cards) — each package has a configurable default (`24` §7).

## Gotchas learned this session
- The earlier task files (`docs/migration/tasks/**`) and `21`, `18`, `14` describe the abandoned plan. They are behaviour reference only; `24` §7 maps what still applies.
- A specification is a checked starting point: when it disagrees with `25`, the audit or the code, those win and the specification is fixed in the same PR.
- `backend/app/Enums` exists, so `make:enum Name` already lands there (no `Enums/` prefix); `tests/Unit` has no application (Pest binds `TestCase` to `Feature` only); CI has PostgreSQL but no Redis.
- Legacy production ships a Mini App release every one to three days; the audit trails it by two (Q-APP-024). WP-02 pins the baseline.
- In `docs/migration/**` no table row, heading or bold list item may start with an existing identifier (prefix "Ref. "). Run `collect_ids.py`, then `build_open_questions.py`.
- Subagents hit the usage limit twice earlier; resume them with SendMessage and tell them not to fan out.
- `$PIPESTATUS` is empty in zsh; there is no `timeout` command on this machine. Next numbers: AM-50, KI-27, ADR 0016.

## Active subagent work at handoff
- None.
