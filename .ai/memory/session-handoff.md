---
updated: 2026-11-14 (new-product course decided by the developer; strategy, Wave 1 plan, queue of 44 work packages and their specifications written, PR #25 open; next step package WP-00)
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
- Gates that need the first developer's OK: dependency changes, new tools, anything on staging/production, `HANDOFF.md` §4 items marked **gate**.

## State at handoff
- **Where to continue:** read `docs/migration/25-wave-1-plan.md` once, then take the first package of `docs/migration/wave-1/README.md` that is not `DONE` — today **WP-00** (Media ownership fix, KI-25). Strategy and decisions: `docs/migration/24-three-wave-strategy.md`. Start code only after the developer's OK.
- The course: HOMI ships a new product under its own bot and brand; the frontend talks only to `/api/v1`; each method answers from a stub, from legacy through the operator's service key, or from HOMI's own code (a Pennant flag per method). The legacy bot, hosts and users are not taken over; nothing is migrated.
- Branch `docs/three-wave-plan`, **PR #25** (github.com/amediateam/homi/pull/25), open, docs only, waits for the first developer's review. No CI runs on it. `main` is at `596d0db`.
- No application code has changed. `make ci-backend`, `make ci-frontend`, `make dev-check` were not run this session.
- `prompt.md` and `writing-block.md` stay untracked on purpose (machine paths); unstage them if they appear staged.
- Verify the plan: `python3 scripts/migration/collect_ids.py --check && python3 scripts/migration/task_graph.py --check` (both exit 0 at the last commit).

## Done this session
- Local `main` fast-forwarded to `596d0db`. First draft of the three-wave plan committed (`cf4d325`), then replaced after the answer round.
- `24` rewritten: the new product, `/api/v1` with a source driver per method, DEC-31…DEC-49 answered, questions for the operator, RK-24…RK-32. `25-wave-1-plan.md` written (replaces `25-wave-1-frontend-plan.md`). `wave-1/README.md`: one ordered queue of 44 work packages; 44 specifications `wave-1/WP-NN-*.md` (about 17 000 lines).
- The specifications were drafted by three subagents (and their sub-agents) from the audit and the earlier task files. Checked by the main session: structure of all 44 (script), `collect_ids.py --check` exit 0, v1 method names against `25` §4.2 (script: no undefined method), the authors' coverage totals (45/45 screens, 69/69 rules, 47/47 client defects, 84/84 bot handlers, 76/76 buttons, 88/88 texts — reported, not re-counted), the contradictions the authors reported (settled in the files). Read in full: WP-02, WP-10 and the changed parts of WP-13, 40, 45, 46, 48, 54, 57. **Everything else was not read line by line.**
- Checks at the last commit: `collect_ids.py --check` exit 0; `build_open_questions.py` → 245 questions; `task_graph.py --check` exit 0; path and address scan of the new files → no hits.
- Legacy tree only read (changelog, sources at cited lines); legacy production not called.

## Waiting for the developer (do NOT start on your own)
1. First developer: review PR #25. It changes three project rules and he has to agree: PR size (one PR per work package), the dependency batch (DEC-49), a production deploy on every merge. The author merges after approval.
2. Developer: OK to start WP-00. Then WP-01 (four ADRs, numbers 0016–0019, each its own PR), WP-02 (send the request to the operator — the text is in the specification — and pin the legacy baseline), WP-03 (dependencies).
3. Product owner: the operator's contact, the service key and its contract, limits, dump and schema (Q-SYS-009, Q-API-059, Q-API-060, Q-API-062); HOMI's own artwork (Q-APP-025); the legal basis and privacy text before real users arrive (DEC-13, Q-SEC-021); a PostHog account (DEC-47).
4. Developers together: RK-32 — radars can be created before the bot can deliver them; RK-27 — stub data is visible on production (a "demo data" marker is planned); the phone number on the card stays as in legacy while SEC-REQ-036 asks to hide it (DEV-007, off).
5. Still open and needed inside Wave 1: DEC-03 (LLM vendor for the bot's free-text queries), DEC-08, DEC-12, DEC-19, DEC-20, DEC-21 (`24` §7).

## Gotchas learned this session
- The earlier task files (`docs/migration/tasks/**`) and `21`, `18`, `14` describe the abandoned plan (taking over the legacy bot, a legacy-shaped `/api/*`, data migration). They are behaviour reference only; `24` §7 maps what still applies.
- A specification is a subagent's draft: when it disagrees with `25` or the audit, those win and the specification is fixed in the same PR.
- Legacy production ships a Mini App release every one to three days; the audit trails it by two (Q-APP-024). WP-02 pins the baseline.
- In `docs/migration/**` no table row, heading or bold list item may start with an existing identifier; `perl` one-liner used here prefixes such cells with "Ref. ". Run `collect_ids.py`, then `build_open_questions.py`.
- Subagents hit the usage limit twice; resume them with SendMessage instead of starting new ones, and tell them not to fan out.
- `$PIPESTATUS` is empty in zsh. Next numbers: AM-50, KI-27, ADR 0016.

## Active subagent work at handoff
- None.
