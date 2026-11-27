# kvadro² → HOMI migration audit

This folder is the working set for the **1:1 functional migration** of the running product kvadro² (KvadroApp:
Telegram bot `@KvadroAppBot`, Mini App `app.kvadro.app`, landing and SEO pages `kvadro.app`) onto the HOMI stack in
this repository (Laravel 13 / PostgreSQL / Next.js 16). The legacy system is the reference for behaviour. Nothing here
is new product design until a document says so explicitly and links the decision.

Status (2026-11-14): **audit and plan complete; no migration code yet.** The audit describes legacy release
`index-YX9bFVws.js`, brought up to it on 2026-11-20, and the legacy landing at its release `d9bbbc696337`, also on
2026-11-20 (baseline, the landing pin and intake log: [`wave-1/baseline.md`](wave-1/baseline.md)). Start with
[`21-development-master-plan.md`](21-development-master-plan.md); to continue the work, read
[`22-agent-handoff.md`](22-agent-handoff.md).

**Change of course (2026-11-14, decided by the developer).** HOMI no longer takes over the legacy bot, hosts and
users. It ships a **new product** under its own bot and brand that reproduces kvadro² function by function, reads
listings from legacy until it has its own, and replaces that source method by method — three waves.
[`24-three-wave-strategy.md`](24-three-wave-strategy.md) is the strategy and says what it replaces in 21, 18 and 22;
[`25-wave-1-plan.md`](25-wave-1-plan.md) is the plan of the first wave; [`wave-1/README.md`](wave-1/README.md) is
the work queue. Documents 01–09 remain the description of the behaviour to reproduce. The "Migration policy" below
still holds, except its compatibility window: no legacy client or old bot message ever talks to HOMI.

## Migration policy

Developer's decision, 2026-11-09: «в homi.uz мы будем исправлять старые ошибки и логически неверные решения».

- **Parity is about capabilities, data and links, not about defects.** Every legacy feature, data set, contract
  used by a still-running client, public URL and deep link is carried over; nothing is dropped silently.
- **Legacy bugs and logically wrong decisions are fixed, not reproduced.** The audit records each one as `LB-…`
  (tag `decision` for a design choice rather than a crash-type bug) with a proposed fix. A fix that changes
  observable behaviour becomes a deviation `DEV-NNN` (legacy behaviour → problem → new behaviour → compatibility
  impact) and is listed in `09-feature-parity-matrix.md`, so parity tests expect the new behaviour on purpose.
- **Compatibility window.** While the legacy Mini App or old bot messages still talk to the new backend
  (`$KVADRO_ROOT/docs/about.md` §8.4), a fix on the API or `callback_data` side must not break them: it ships
  compatible, or after the client it would break is retired.
- A deviation that changes business logic, money, permissions or user-visible flows beyond fixing an obvious defect
  is `PROPOSED` until the developer approves it.

## Sources

| Name | What it is | How to refer to it |
| ---- | ---------- | ------------------ |
| Legacy root | SVN working copy of `kvadro.uz` (machine path in `.ai/local.env` → `KVADRO_ROOT`) | `$KVADRO_ROOT/…` |
| Legacy docs | `docs/about.md`, `docs/api.md`, `docs/telegram-bot.md`, `docs/seo-pages.md` | `$KVADRO_ROOT/docs/api.md:120` |
| Mini App | React 19 + Vite code **decompiled from the production bundle** (no original sources) | `$KVADRO_ROOT/demo/app/src/…` |
| Mini App docs | `RECOVERY.md`, `MODULE_MAP.md`, `CHANGELOG.md`, `releases/` | `$KVADRO_ROOT/demo/app/docs/…` |
| Landing | static production mirror (`site/` = prod files 1:1) | `$KVADRO_ROOT/demo/landing/…` |
| Target | this repository | repo-relative paths (`backend/…`, `docs/architecture/decisions/…`) |

The legacy **backend source code and database are not available** (Python/FastAPI + PostgreSQL/PostGIS, per
`$KVADRO_ROOT/docs/about.md` §3). Server behaviour is known only from the API contract, the client code, the bot's
observed behaviour and the landing/SEO output. Everything derived from that is marked accordingly.

Rules for every document here:

- The legacy tree is **read-only**: no edits, no `svn` writes, no builds or `npm` runs inside it (they write `dist/`
  and `.sync/`), no dev servers (they proxy to production and send analytics to production).
- No absolute machine paths, no secrets, tokens, `initData`, API keys, real phone numbers or personal data — name a
  value, never copy it.
- Repository artifacts are in English. Quote legacy UI strings verbatim in their original language.
- Source code beats documentation. When they disagree, record both and say which one the code supports.

## Evidence and status labels

Every significant claim cites evidence as `path:line` (or `path` + symbol). Status labels:

| Label | Meaning |
| ----- | ------- |
| `CONFIRMED` | Seen in code or a contract document that the code agrees with. |
| `RUNTIME_VERIFIED` | Observed in a running system **by us**, with the command or session recorded. |
| `DOCUMENTED_ONLY` | Described in legacy docs; no implementation visible in the material we have (for server-side behaviour this is the normal case). |
| `UNVERIFIED` | Inferred or partial; needs a check — always paired with a `Q-…` question. |
| `DEPRECATED_CANDIDATE` | Probably obsolete; dropping it still needs a decision. |

Legacy markers in `$KVADRO_ROOT/docs/*.md`: ✅ = fact, 🔶 = inference. A 🔶 item is never `CONFIRMED` here.

## Identifier scheme

IDs are stable once written; never renumber, mark removed items `DEPRECATED_CANDIDATE` instead.

| Prefix | Item | Owner document |
| ------ | ---- | -------------- |
| `API-NNN` | Mini App HTTP endpoint (method + path) | `08-api-inventory.md`, `data/api-inventory.json` |
| `RES-NNN` | Non-API HTTP resource (`/media`, `/tiles`, `/call`, landing data, sitemap…) | `08-api-inventory.md` |
| `SCR-NNN` | Mini App screen, sheet, modal or overlay | `03-legacy-frontend-audit.md`, `data/screens.json` |
| `TMA-NNN` | Telegram WebApp integration point (initData, buttons, storage, start_param…) | `05-telegram-miniapp-audit.md` |
| `BOT-NNN` | Bot command, scenario step or free-text handler | `04-telegram-bot-audit.md`, `data/bot-handlers.json` |
| `BTN-NNN` | Bot inline/reply button or callback action | `04-telegram-bot-audit.md` |
| `LND-NNN` | Landing page, block or behaviour | `03b-legacy-landing-seo-audit.md` |
| `URL-NNN` | Public URL pattern that must keep working (SEO, deep links, share links) | `03b-legacy-landing-seo-audit.md`, `data/public-urls.json` |
| `TXT-<AREA>-NNN` | User-visible text, toast or alert that must be carried over (or deliberately rewritten) | the audit doc that found it (`TXT-BOT-…` in 04) |
| `ENT-NNN` | Domain entity / table | `06-database-schema.md` |
| `BR-<AREA>-NNN` | Business rule (`AREA` = `API`, `APP`, `BOT`, `LND`, `SEO`, `DATA`) | the audit doc that found it; compiled in `07-business-rules.md` |
| `LB-<AREA>-NNN` | Legacy bug or questionable decision (tag `decision`) with a proposed fix — **never ported as-is** | the audit doc that found it |
| `DEV-NNN` | Deliberate deviation from legacy behaviour (`PROPOSED` / `APPROVED`) | `09-feature-parity-matrix.md` |
| `F-<MODULE>-NNN` | Feature in the parity matrix | `09-feature-parity-matrix.md`, `data/features.csv` |
| `Q-<AREA>-NNN` | Open question / unverified item with the check that would close it | the audit doc; compiled in `20-open-questions.md` |
| `CF-NNN` | Conflict between an existing HOMI decision (ADR/code) and the legacy contract | `10-target-architecture.md` |
| `GAP-NNN` | Legacy capability with no home in HOMI yet | `10-target-architecture.md` |
| `FD-N` | Frontend decision (FD-1 = DEC-06) | `12-frontend-roadmap.md` §9 |
| `RK-NN` | Migration risk | `19-risk-register.md` (`RK-24` onward: `24-three-wave-strategy.md` §8.3) |
| `DEC-NN` | Decision that needs a person (developer / first developer / product owner) | `10-target-architecture.md` §8 (`DEC-31` onward: `24-three-wave-strategy.md` §8.1) |
| `SEC-NNN` / `SEC-REQ-NNN` | Security finding on legacy behaviour / testable security requirement for HOMI | `16-security-review.md` |
| `KV-<TRACK>-NNN` | Executable task (`BE`, `FE`, `TG`, `DB`, `INF`, `QA`) | `tasks/<track>/` |

## Documents

| # | Document | Content |
| - | -------- | ------- |
| 01 | `01-legacy-system-map.md` | Components, sources, entry points, external services |
| 02 | `02-legacy-backend-audit.md` | Server-side behaviour reconstructed from contracts and clients |
| 03 | `03-legacy-frontend-audit.md` | Mini App screens, states, components, i18n, storage, analytics |
| 03b | `03b-legacy-landing-seo-audit.md` | Landing (`kvadro.app`), SEO pages, public URLs |
| 04 | `04-telegram-bot-audit.md` | Bot commands, scenarios, buttons, state machines |
| 05 | `05-telegram-miniapp-audit.md` | Telegram WebApp integration of the Mini App |
| 06 | `06-database-schema.md` | Reconstructed data model (logical; the legacy DB is unavailable) |
| 07 | `07-business-rules.md` | All business rules, compiled |
| 08 | `08-api-inventory.md` | Every endpoint and resource with the full contract row |
| 09 | `09-feature-parity-matrix.md` | Every feature → legacy evidence → target → tests |
| 10 | `10-target-architecture.md` | How the features land in HOMI; conflicts with existing ADRs |
| 11 | `11-backend-roadmap.md` | Backend milestones |
| 11a | `11a-backend-roadmap-m4-m6-m7.md` | Backend milestones M4 (radars), M6 (ingestion), M7 (landing/SEO data, analytics) |
| 11b | `11b-telegram-and-infra-roadmap.md` | Bot (M5) and infrastructure milestones |
| 12 | `12-frontend-roadmap.md` | Frontend milestones |
| 13 | `13-dependency-graph.md` | Task dependencies, critical path, parallel workstreams |
| 14 | `14-data-migration-plan.md` | Legacy DB → mapping → transformation → validation → HOMI DB |
| 15 | `15-testing-strategy.md` | Characterization, contract, E2E, visual, migration tests; parity gate |
| 16 | `16-security-review.md` | initData, webhooks, IDOR, files, personal data |
| 17 | `17-infrastructure-and-deployment.md` | Environments, bots, domains, storage, queues |
| 18 | `18-release-and-rollback.md` | Cut-over order and rollback |
| 19 | `19-risk-register.md` | Risks with likelihood, impact, mitigation |
| 20 | `20-open-questions.md` | All `Q-…` items, grouped by who can answer |
| 21 | `21-development-master-plan.md` | **The plan to follow** |
| 22 | `22-agent-handoff.md` | How to continue without re-auditing |
| 23 | `23-coverage-audit.md` | Independent second pass: what the audit covers, with denominators and method |
| 24 | `24-three-wave-strategy.md` | **The strategy since 2026-11-14:** a new product in three waves, `/api/v1` with a source per method, what it replaces in the earlier plan, decisions `DEC-31` onward, questions, risks |
| 25 | `25-wave-1-plan.md` | **The plan to follow for Wave 1:** frontend and API architecture, native modules, bot, landing, acceptance, environments |
| — | `wave-1/README.md`, `wave-1/WP-NN-*.md` | The single work queue of Wave 1 and one specification per work package |
| — | `decisions/2026-11-14-developer-answers.md` | The developer's answers of 2026-11-14, verbatim |
| — | `decisions/2026-11-19-developer-answers.md` | The developer's answers of 2026-11-19, verbatim (DEC-57 … DEC-68) and the order of work after the third release |
| — | `decisions/2026-11-20-developer-answers.md` | The developer's answers of 2026-11-20, verbatim (DEC-89 … DEC-94) and the order of work after the fourth release |
| — | `decisions/2026-11-20-landing-answers.md` | The developer's answers of 2026-11-20 on the landing intake, verbatim (DEC-95 … DEC-97) |
| — | `decisions/2026-11-26-developer-answers.md` | The developer's answers of 2026-11-26, asked by WP-40 and after its merge, verbatim (DEC-104 … DEC-109: the daily cap on opening listings, team accounts during a pause, the end-to-end job on backend changes, two development sessions sharing the queue) |
| — | `decisions/2026-11-27-developer-answers.md` | The developer's answers of 2026-11-27, asked by WP-42, verbatim (DEC-110: how long a page of previews waits for the legacy limiter) |

Machine-readable registers live in `data/` (`ids.csv` is generated by `python3 scripts/migration/collect_ids.py`;
`--check` fails on an ID defined in two documents or referenced but never defined).
