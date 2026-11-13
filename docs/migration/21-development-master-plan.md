# 21 — Development master plan: kvadro² → HOMI

**This is the document to steer by.** It summarises the audit and the plan and points to the detail. Conventions:
[`README.md`](README.md). State on **2026-11-09**: audit and plan complete, no migration code written.

## 1. Executive summary

- **What the product is.** kvadro² is a running Telegram product:
  - the bot `@KvadroAppBot`;
  - the Mini App `app.kvadro.app`;
  - the landing and 1 008 SEO pages on `kvadro.app`;
  - a Python backend that reads 217 public channels, parses posts with Gemini, merges duplicates, computes district
    medians and pushes "radar" alerts.
- **What we have and lack.** We have the Mini App code (decompiled from production), the landing files and four
  detailed legacy documents. We do **not** have the backend code or the database.
- **The audit.** It inventoried every legacy surface, with evidence for each item. An independent second pass found no
  high-severity gaps.
- **The plan.** 144 features in a parity matrix, 383 task files sized to one session each, and a release path.
- **Strategy (compatibility first).**
  - HOMI's backend and bot first serve the **unchanged** legacy Mini App and the old bot buttons, through a
    legacy-compatible `/api/*` surface.
  - Then the bot webhook and the kvadro hosts switch to HOMI (S2).
  - New HOMI frontends replace the legacy files later (S4).
- **Bugs and wrong decisions** are fixed, not ported. Each behaviour change is a `DEV-…` item that needs approval
  (*Migration policy*).
- **Readiness: READY WITH BLOCKERS** (section 8). Engineering can start today on M0. Cut-over is blocked by people's
  decisions (`DEC-…`), the legacy data dump and a legal basis for moving personal data.

## 2. Actual scale (with denominators)

Counted mechanically from `data/ids.csv`, `data/features.csv` and `data/tasks.csv` (scripts in `scripts/migration/`).

| Legacy surface | Items | Audit |
| -------------- | ----: | ----- |
| Mini App API methods / non-API resources | 34 / 22 | [08](08-api-inventory.md) |
| Mini App screens, sheets, modals, overlays, states | 45 | [03](03-legacy-frontend-audit.md) |
| Telegram WebApp integration points | 45 (39 used, 6 confirmed unused) | [05](05-telegram-miniapp-audit.md) |
| Bot commands and scenario steps / buttons / texts and toasts | 84 / 76 / 88 | [04](04-telegram-bot-audit.md) |
| Landing items and SEO page types | 64 (39 landing, 25 SEO) | [03b](03b-legacy-landing-seo-audit.md) |
| Public URL patterns (49 must keep working) | 62 | [03b](03b-legacy-landing-seo-audit.md), `data/public-urls.json` |
| Logical entities | 59 | [06](06-database-schema.md) |
| Business rules | 430 | [07](07-business-rules.md) |
| Legacy bugs and questionable decisions (55 bugs, 114 decisions, 11 untagged) | 180 | 02, 03, 03b, 04, 06 |

| Plan | Count |
| ---- | ----: |
| Features (28 modules) | 144 — CONFIRMED 32, DOCUMENTED_ONLY 71, UNVERIFIED 39, DEPRECATED_CANDIDATE 2; RUNTIME_VERIFIED 0 |
| Feature priority | P0 94 · P1 29 · P2 15 · P3 6 |
| Migration decision | MIGRATE 33 · MIGRATE_WITH_FIX 79 · REBUILD 26 · DEFER 2 · DROP_CANDIDATE 4 |
| Deviations from legacy (`DEV`, all PROPOSED) / defect fixes without behaviour change | 52 / 107 |
| Conflicts with HOMI decisions / legacy capabilities with no HOMI home | 20 / 27 |
| Decisions that need people (`DEC`) | 30 (+ frontend decisions FD-1…, [12](12-frontend-roadmap.md) §9) |
| Open questions | 235 |
| Security findings (7 high, 20 medium, 8 low) / testable requirements | 35 / 50 |
| Risks | 23 |
| Tasks | **383** — backend 103, frontend 126, telegram 61, database 37, infrastructure 33, QA 23 |
| Task status | TODO 333 · BLOCKED 49 (each names its blocker) · DROPPED 1 |
| Task size | S 116 · M 223 · L 44 · XL 0 |

**Coverage.**
- Features without a task: 1 of 144, `F-LANDING-011`, a P3 drop candidate.
- Every API method (34/34), screen (45/45), bot handler (84/84), bot button (76/76), landing item (64/64) and public
  URL pattern (62/62) is covered by a task, either directly or through its feature.
- Method: `python3 scripts/migration/task_graph.py --check` plus the cross-check recorded in
  [23](23-coverage-audit.md) §11.

"RUNTIME_VERIFIED 0" is deliberate. Nothing was observed on a running system during the audit, and parity is a goal
to prove, not a fact.

## 3. Modules

The target module map is [10](10-target-architecture.md) §4.2. Feature modules (09):

- **Access and onboarding:** ACCESS, ONBOARD.
- **Search and listings:** FEED, FILTER, MAP, LISTING, CONTACT, SHARE.
- **Personal lists and reports:** FAV, HISTORY, HIDE, REPORT, OWNER.
- **Radars:** RADAR, DELIVERY.
- **User settings:** SETTINGS, PRIVACY, LOCALE.
- **Telegram:** TMA, BOT.
- **Public web:** LANDING, SEO.
- **Data and backend:** MEDIA, PIPELINE, ANALYTICS, COMPAT.
- **Operations:** ADMIN, SUPPORT.

## 4. Architecture in brief

Details and alternatives: [10](10-target-architecture.md) §3–§5. All decisions are PROPOSED until their ADRs are
accepted.

- **One HOMI backend** (Laravel 13, Horizon queues per workload, PostgreSQL + PostGIS) with domain modules. Two API
  adapters sit on top:
  - the **legacy surface**: bare `/api/*`, legacy shapes, `{"detail"}` errors, `Authorization: tma <initData>`,
    legacy hosts only;
  - the **HOMI `/api/v1`** with the ADR-0007 envelope.
- **Listings** keep an opaque key plus the public integer `number` that existing links use. Money has a normalised USD
  amount for filters and medians. Locale `uz_Latn` maps to HOMI `uz`.
- **Bot.** It moves to HOMI's webhook host with `secret_token`, `update_id` idempotency and server-side wizard state
  with TTL. Old `callback_data` gets a decoder (blocked on Q-BOT-017) plus a "form outdated" catch-all.
- **Listing acquisition.**
  - Now: our own reader of the public channels, as an isolated module feeding the intake API.
  - Later: `telegram.uz`, after a side-by-side run.
  - LLM extraction stays in HOMI (Gemini for parity). Decided by DEC-02 and DEC-03.
- **Hosts.** HOMI takes over `kvadro.app`, `app.kvadro.app` and `@KvadroAppBot` at S2. The bot token is rotated. A
  brand move is a separate, optional S6.
- **Frontends.**
  - Until S4 the original legacy Mini App files are served unchanged.
  - The new Mini App (Next.js client route group or a Vite SPA; DEC-06 / FD-1) is chosen from WebView data and a
    spike.
  - SEO pages are rebuilt in `frontend/landing` and must be ready for S2.

## 5. Migration strategy

1. **Compatibility first.** The legacy clients are the reference: the backend must satisfy them byte-for-byte where
   they are strict. This is what parity means at S1.
2. **One change at a time.** Backend and bot switch at S2. Frontends switch at S4. A regression is then easy to
   locate (`$KVADRO_ROOT/docs/about.md` §8.4).
3. **Fix, don't copy.**
   - Defect fixes that change nothing intended are applied directly (107).
   - Behaviour changes are DEV items (52): flagged, tested as `todo` until approved, and never breaking a client that
     is still running.
4. **Migrate the data, don't re-read it.** Listings keep their numbers and users keep their radars, favourites and
   delivered-card history (14). Re-ingesting would break every link and relation.
5. **Evidence over assumption.** A feature is "migrated" only after its parity gate (15 §4).

## 6. Order of development

Milestones are defined in [13](13-dependency-graph.md) §1.

| Milestone | Content | Tasks | Plan |
| --------- | ------- | ----- | ---- |
| M0 Decisions and foundations | ADRs, PostGIS, PostgreSQL test DB, legacy surface skeleton, `initData` guard, access gate, Media fix | 16 (+ infra, QA foundations) | [11](11-backend-roadmap.md) |
| M1 Core data model | users and settings, listings with numbers, dictionaries and code aliases | 15 | [11](11-backend-roadmap.md) |
| M2 Mini App read path | meta, cities, bot, feed / count / flow / map, details, media, tiles, call page | 18 | [11](11-backend-roadmap.md) |
| M3 Per-user features | favourites, history, hidden, blocked, votes, share, translate, settings, deletion | 13 | [11](11-backend-roadmap.md) |
| M4 Radars and delivery planning | radar CRUD, relax, flow, matching, delivered set, quiet hours and digests | 12 | [11a](11a-backend-roadmap-m4-m6-m7.md) |
| M5 Telegram bot | webhook, client, router, commands, wizard, free text, cards, polls, `/owner`, `/privacy`, deep links, legacy callbacks, sending and pacing | 61 | [11b](11b-telegram-and-infra-roadmap.md) |
| M6 Ingestion pipeline | reader, intake, LLM extraction, normalisation, geo, dedup, statuses, photos, medians, translation | 24 | [11a](11a-backend-roadmap-m4-m6-m7.md) |
| M7 Landing/SEO data, analytics, retention | landing data, SEO aggregates and sitemap, events and action log, PostHog, purges | 17 | [11a](11a-backend-roadmap-m4-m6-m7.md) |
| M8 Data migration and rehearsals | extraction, transforms, loads, validation, rehearsals R1–R3 | 24 (+ QA) | [14](14-data-migration-plan.md), database tasks |
| M9 New frontends | FE-0 … FE-5: decisions and spikes, foundations, Mini App screens, SEO and landing, ARM, parity | 126 | [12](12-frontend-roadmap.md) |
| Infrastructure | dev bot and tunnel, PostGIS, queues, storage and tiles, monitoring, backups, cut-over automation (12 development-track, 20 production-track) | 33 | [11b](11b-telegram-and-infra-roadmap.md) |
| QA | PostGIS feature tests, golden fixtures, contract harness, reference-client runs, bot kit, URL suite, migration validation, security, visual, performance | 23 | [15](15-testing-strategy.md) |

## 7. Milestones per track

- **Backend.**
  - M0–M3: [11](11-backend-roadmap.md).
  - M4, M6, M7: [11a](11a-backend-roadmap-m4-m6-m7.md). M4 plans *what and when* to deliver; the telegram track
    *sends* it (11b §2.3).
- **Frontend:** [12](12-frontend-roadmap.md).
  - The SEO pages (FE-3, 23 tasks) are on the S2 path, because HOMI must serve `kvadro.app` at the cut-over.
  - The new Mini App (FE-2) is S4.
  - ARM (FE-4) is a placeholder until DEC-22.
- **Telegram:** [11b](11b-telegram-and-infra-roadmap.md). Webhook security and the update ledger come first (HANDOFF
  T1). Around 20 DEV items sit behind `bot.devNNN` flags that default to the legacy behaviour.
- **Database:** [14](14-data-migration-plan.md) and the KV-DB tasks.
  - The ADRs (KV-DB-004/005) and the schema are early.
  - 22 KV-DB tasks are BLOCKED. Most wait for the legacy schema or dump (Q-SYS-002, Q-DATA-001…005); the rest
    wait for the legal basis or a decision (DEC-02, DEC-29, the rollback window).

## 8. Readiness: READY WITH BLOCKERS

Ready:

- Every legacy surface we have access to is inventoried with evidence. The coverage pass found no high-severity
  misses.
- Features, rules, deviations, architecture, tasks and tests are linked, and checked by three scripts.
- The development environment is set up and verified (T0).

Blockers (none is engineering work):

1. Decisions: DEC-01 (freeze), DEC-02/03 (acquisition, LLM), DEC-05 (bot custody), DEC-09/10/11/12 (PostGIS, money,
   numbers, retention ADRs), DEC-13 (legal basis), DEC-23 (dependencies).
2. The legacy schema and data dump, and ideally the backend source (Q-SYS-001/002, Q-DATA-001…005).
3. Behaviour never observed: radar pushes, digests, deletion, the `callback_data` format. These can be observed on a
   test account with approval.

## 9. Database migration

[14](14-data-migration-plan.md) has the full plan: Legacy DB → mapping → transformation → validation → HOMI DB.

- **What is kept:**
  - users and settings;
  - radars with full filters;
  - favourites, history, hidden items, blocked authors, votes;
  - the delivered-card log, merged-listing aliases and takedowns;
  - owner-verification hashes, for a window only (DEC-29);
  - attribution and the PostHog id mapping;
  - listing numbers.
- **How it runs.** Idempotent, restartable runs. Rehearsals R1–R3 on staging with timings. Count, checksum,
  referential and business-level validation. Freeze → final delta → switch.

## 10. Critical path

From [13](13-dependency-graph.md) §2–§3.

- **People.** The DEC answers and the legacy dump gate S2.
- **Tasks.** The longest chain is 26 tasks, weight 67 in S-units:
  1. PostgreSQL/PostGIS test DB → PostGIS ADR → schema;
  2. intake → extraction → normalisation, geo, dedup → publication → medians;
  3. SEO aggregates and interlinking → SEO page templates (FE-3).
- **Implication:** the SEO pages, not the Mini App, are the longest technical chain to S2. Start the pipeline and SEO
  data early.

## 11. Parallel workstreams

These can run in parallel once M0 lands, each in its own branch and PR:

- **A. Legacy surface and per-user API** (M2, M3). It depends on the M1 schema.
- **B. Bot** (M5). Start now with the webhook, ledger and client (KV-TG-001…005); it shares only the user model with A.
- **C. Pipeline** (M6) → M7 data. This is the longest chain.
- **D. SEO frontend** (FE-3). Build against contract mocks of the M7 aggregates.
- **E. Data migration tooling** (M8). Build against the reconstructed schema and fixtures until the dump arrives.
- **F. QA harness.** Golden fixtures, the contract harness and the bot kit, early, because everything else uses them.
- **Production track** (first developer): staging, PostGIS on the server, bots and domains custody, monitoring
  ([PT] tasks in 11b).

Each task names its files. Shared files (ADRs, `.ai/**`, `CLAUDE.md`, env examples) go in small separate PRs
(`docs/handoff/parallel-work.md`).

## 12. Dependencies

Task dependencies are in `data/tasks.csv` (generated). Each task's `Dependencies` field also names its DEC/CF/Q
blockers. The people-side dependencies are grouped in [20](20-open-questions.md) §1.

## 13. Priorities

- **P0 (94 features):** everything the unchanged legacy Mini App and the old bot need on day one.
- **P1 (29):** parity before the new frontends.
- **P2/P3:** later.

Inside a milestone, take tasks in the order listed in its roadmap.

## 14. Quality checks

[15](15-testing-strategy.md) covers the layers and the parity gate.

- **Per PR:** `make ci-backend`, `make ci-frontend` and the migration consistency scripts:
  ```bash
  python3 scripts/migration/collect_ids.py --check
  python3 scripts/migration/build_open_questions.py
  python3 scripts/migration/task_graph.py --check
  ```
- **Per feature:** the 10-condition parity gate.
- **Before S2:**
  - the legacy Mini App running against HOMI on staging (reference-client runs);
  - the bot conversation kit, including legacy `callback_data`;
  - the public-URL regression suite;
  - migration validation;
  - the security suite.

## 15. Release conditions

[18](18-release-and-rollback.md) has the stages and the go/no-go criteria:

- **S0 → S1:** freeze in force, custody plan and legal basis signed, staging ready.
- **S1 exit:** the parity gate passed in two rehearsals (R2, R3).
- **S2:** in-window GO, then 72 h of error budgets.

## 16. Rollback strategy

[18](18-release-and-rollback.md) §7–§8:

- **S2 before the point of no return:** switch the webhook and DNS back to legacy, with the rotated token handed
  back only on rollback (DEC-05).
- **S2 after the point of no return:** fix forward within 72 h. Data written to HOMI is exported for manual
  re-application. There is no reverse sync (DEC-18).
- **S4:** swap the legacy files back while the legacy surface lives.
- **What cannot be rolled back:** sent Telegram messages.

## 17. Risks

The full list is [19](19-risk-register.md). The highest:

- RK-01 — hidden server behaviour is lost.
- RK-02 — data migration is late or blocked.
- RK-06 — the legacy client crashes on small contract deviations.
- RK-09 — the feed goes stale after S2 (acquisition undecided).
- RK-08 — SEO traffic is lost.
- RK-11 — personal-data exposure.

## 18. Unknowns

[20](20-open-questions.md) has 235 questions. The legacy team's own 17 open questions (about.md §11) are mapped
to them in [23](23-coverage-audit.md) §5. The ones that block work are grouped by who can answer them, in section 1
of that document.

## 19. Changes to `HANDOFF.md` §4

Proposal from [10](10-target-architecture.md) §9, for the first developer's review. Not applied yet.

- **Stay, with additions:** T1 (webhook), T2 (intake), T4 (Phase 3 close), T6 (Telegram sign-in).
- **Stay as they are:** T3 and T5.
- **Superseded:** T7 (domain modules) by M1–M7 of this plan.
- **Split:** T8 (frontend) into SEO pages, Mini App and ARM.
- **New:** the legacy surface, the data migration, the cut-over, and the ADR batch.

## 20. Next concrete task

**KV-BE-002 — Media ownership fix** ([task file](tasks/backend/KV-BE-002-media-ownership-fix.md)).

- **Why first:**
  - It is a live security defect (SEC-026/027) in HOMI code that the migration reuses: listing photos will share
    media objects.
  - It has no dependencies or decisions.
  - It is one session in size (M) and exercises the full development loop: tests first, migration, policy, Pint,
    PHPStan, PR.
- **Goal.** A media file can be read or deleted only by an actor holding a reference to it. Foreign files look the
  same as unknown ones (`404`). Identical bytes uploaded twice are deleted per reference. Users and sources never
  collide.
- **Dependencies:** none.
- **Files:**
  - new: `media_file_references` migration, `MediaFileReference` model and factory, `MediaFilePolicy`,
    `tests/Feature/Media/MediaOwnershipTest.php`;
  - changed: `MediaFile`, `MediaController`, `PresignController`, `AppServiceProvider`.
- **Actions.**
  1. Write the failing tests.
  2. Add the reference table with a backfill.
  3. Attach owners on upload and register, and check upload prefixes.
  4. Add the policy and map a refusal to 404.
  5. Make delete reference-counted in a transaction.
- **Tests.**
  - Another user gets 404 on show and delete.
  - Shared bytes are deleted per reference.
  - The user/source prefix collision is refused.
  - The existing 28 media cases stay green.
- **Definition of done:** `make ci-backend` green, the PR reviewed by the first developer, and SEC-026/027 marked
  fixed in 16.

**In parallel, the same day (no code):**

- Send the M0 ADR batch for review: KV-BE-001 (legacy surface), KV-DB-004 (numbers, cursors, money), KV-DB-005
  (PostGIS) and KV-BE-120 (acquisition and LLM).
- Send the product owner the requests from 20 §1.1: dump and schema, freeze date, legal basis, bot and domain
  custody.
- Start KV-QA-001 (PostgreSQL test database) and KV-TG-001 (webhook authenticity, the beginning of HANDOFF T1).
