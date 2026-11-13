# 18 — Release, cut-over and rollback

Part of the kvadro² → HOMI migration audit (rules, labels and ID scheme: [`README.md`](README.md)). Architecture:
[`10-target-architecture.md`](10-target-architecture.md) (decisions `DEC-NN` in §8). Environments, bots, hosts and the
production-track checklist: [`17-infrastructure-and-deployment.md`](17-infrastructure-and-deployment.md). The data
part of the cut-over (load order, validation, freeze window, point of no return) is defined in
[`14-data-migration-plan.md`](14-data-migration-plan.md) §6–§7; this document wraps it into the whole release.

- **Status:** design, 2026-11-09. Every step, threshold and duration is `PROPOSED`. Production steps are
  *production track — first developer approves* (**[PT]**), and every production webhook change needs explicit human
  approval (ADR-0011).
- **Basis:** the legacy team's recommended order (`$KVADRO_ROOT/docs/about.md` §8.4, a 🔶 recommendation): first a new
  backend with the same API under the unchanged legacy Mini App, then the bot webhook and DNS switch, and only then a
  new frontend — so backend and frontend change separately and a regression is easy to place.

## 1. Principles

1. **One side changes at a time.** S2 replaces the backend, the bot receiver and the hosting behind unchanged clients
   (legacy Mini App and landing files byte-identical). New frontends come at S4, the brand at S6.
2. **Everything is rehearsed on staging first** with migrated data, the staging bot and the same artefacts.
3. **One explicit point of no return** — the first user-visible write processed by HOMI (`14` §7.7). Before it,
   rollback is a re-point; after it, the default is fix-forward.
4. **No silent loss.** Whatever cannot be rolled back is listed (§8.3) and accepted by the product owner before S2.
5. **Old clients keep working** through S5: the legacy surface stays until the sunset rule of `10` §3.2 is met.

## 2. Stages

| Stage | Goal | What users notice | Entry | Exit (go/no-go) | Rollback | Owner |
| ----- | ---- | ----------------- | ----- | --------------- | -------- | ----- |
| **S0** Prepare | custody, freeze, environments, legal basis | nothing | — | §3 freeze in force; custody plan signed (Q-SEC-001, DEC-05); legal basis written (DEC-13); staging up (`17` §15 items 1–9) | — | product owner, first developer |
| **S1** Backend parity on staging | HOMI backend + bot serve the unchanged legacy clients with migrated data | nothing (staging only) | S0 | §5.1 parity gate passed twice (R2, R3) | none needed | developer; first developer for staging |
| **S2** Production cut-over | data load, bot webhook to HOMI with token rotation, DNS of `app.kvadro.app` and `kvadro.app` to HOMI | a maintenance window; one Mini App reopen | S1 exit; approvals of §5.1 | §5.2 in-window GO, then the error budgets of §5.4 for 72 h | §8.1 before the point of no return, §8.2 after | first developer executes; developer on the data and app side; product owner decides GO |
| **S3** Stabilise, decommission legacy | close the rollback window, destroy legacy copies | nothing | S2 + 72 h within budgets | §11 records complete | none after decommissioning | first developer; product owner |
| **S4** New HOMI frontends | HOMI Mini App (DEC-06) and the re-implemented landing replace the legacy files | new UI, same links | S3; new apps pass their parity runs | canary budgets of §12.1 | swap the files back while the legacy surface lives | developer; first developer (hosting) |
| **S5** Sunset of the legacy surface | remove legacy routes and artefacts | nothing | sunset rule (`10` §3.2) | legacy route traffic stays below threshold after removal | redeploy the previous release | developer |
| **S6** Brand move (optional, DEC-04) | move public hosts to the new brand with redirects | new domain | product owner decision | §12.3 | revert redirects | product owner; first developer |

## 3. Contract freeze (S0, DEC-01)

Proposed at **T−14 days** (`14` §7.6), agreed by the product owner and the developer (Q-SYS-005).

| Frozen item | Frozen as | Evidence kept |
| ----------- | --------- | ------------- |
| Legacy Mini App build | the production bundle served on the freeze date, by file hash (the audit used release `index-plF_TOcT.js`, `02` header) | SHA-256 manifest of every served file, including lazy chunks |
| Mini App ↔ API contract | `docs/api/kvadro-legacy.openapi.yaml` v1.0 built from `08` (CF-020) | spec version + `$KVADRO_ROOT/docs/api.md` "Состояние на" date |
| Landing files | the mirror served on the freeze date | SHA-256 manifest; the captured CSP header |
| SEO pages | a crawl of every sitemap URL, both CSVs and their assets (Q-SEO-001) | archive with status, headers and bodies |
| Bot texts, buttons, commands, descriptions | `04` as of the freeze; BotFather screenshots per language | `getMyCommands` / `getMyDescription` output per language, taken by the bot owner |
| Legacy database schema | the DDL of the final dump format (`14` P6) | DDL file with its hash |

**Change after the freeze.** The legacy team does not ship Mini App, API or schema changes. If an urgent production
release is unavoidable, it is synced into the recovery repository by the legacy team (`/sync_frontend_app`,
`/sync_frontend_landing`), the spec gets a minor version, HOMI implements it, and the affected parity scenarios and
rehearsal steps are re-run before S2. A breaking change (like `zone` → `zones`, `08` §1.7) moves the S2 date.

## 4. Rehearsals on staging (S1)

R0–R3 are defined in `14` §7.4 (data). The release adds:

| Rehearsal | Adds to the data rehearsal | Exit |
| --------- | -------------------------- | ---- |
| R1 | the legacy Mini App artefacts served from `kvadro-app.staging.homi.uz` against the HOMI legacy surface, opened from the staging bot; the landing mirror on `kvadro.staging.homi.uz` | smoke scenarios pass; timings recorded |
| R2 | the full **switch rehearsal** with the staging bot: §6 steps in order, including `deleteWebhook`, BotFather `/revoke`, `setWebhook` with `drop_pending_updates=false`, buffered updates with the queue paused, the DNS step simulated by switching the staging aliases, and a **rollback before the point of no return** (§8.1) | every step timed; buffered updates processed exactly once; confirms whether updates queued at Telegram survive a token revocation (`UNVERIFIED` — decides the order of §6 step T0.3) |
| R3 (dress) | the same as R2 without the rollback, with the final runbook and the people who will run S2 | total freeze window ≤ 80 % of the budget (`14` §7.4) |

The parity runs (legacy Mini App scenarios, landing scenarios, SEO crawl comparison) run against staging after R2 and
R3 with migrated data.

## 5. Go/no-go criteria

### 5.1 S1 exit — production cut-over may be scheduled

All must hold; the developer prepares the evidence, the product owner and the first developer sign it.

| Area | Criterion |
| ---- | --------- |
| Contract | 100 % of legacy contract tests green against the frozen spec (all 34 API methods; media, call, CSP-report and bot-info resources) |
| Mini App parity | every legacy Mini App parity scenario passes against HOMI staging with the frozen artefacts and migrated data; zero CSP violation reports during the runs (SEC-REQ-030) |
| Landing and SEO | landing parity scenarios pass with HOMI-generated data files; the SEO crawl comparison: identical status, canonical, hreflang, robots and sitemap set for all 1 008 pages, content differences only where a recorded DEV entry explains them, CSV columns identical — or DEC-15's contingency accepted |
| Bot | every bot scenario of `04` §2–§3 checked on the staging bot; legacy `callback_data` answered by the catch-all with no state change; outbound pushes, digests and quiet hours verified with time-travel tests and on the staging bot; delivery pacing test passes (SEC-REQ-029) |
| Data | all zero-tolerance checks of `14` §6.6 on R2 and R3; re-send dry-run returns zero rows |
| Security | the test plan of `16` §5 passes; secret inventory check (SEC-REQ-034) per environment; Media ownership fix merged (`10` §7) |
| Performance | p95 server time within `10` §5.12 at twice the measured legacy peak request rate; ingestion keeps up with the measured daily volume; a digest fan-out for all migrated radars finishes within 10 minutes |
| Operations | alerts of `17` §12 firing in a test; restore drill passed within 7 days; deploy and release rollback tested; on-call rota for 72 h agreed |
| Decisions | ADRs of `10` §3.1 accepted; DEC-01, 02, 03, 05, 09, 10, 11, 12, 13, 15, 16, 17, 18, 25, 26 answered |

### 5.2 S2 — in-window GO

Inside the freeze window, after the final delta load (`14` §7.6):

- the fast validation subset passes (`14` §6: counts, fingerprints, referential integrity, re-send dry-run);
- `getWebhookInfo` shows the HOMI URL, no `last_error_date`, and the pending count falling once the queue runs;
- smoke tests on production with an owner-approved test account (never a real user's data): the Mini App opens from the
  bot and `GET /api/meta` answers `200` with `initData` signed by the **new** token; feed, listing, a signed photo, a call
  link, radar create and delete; a bot `/start`, `/subs`, a card button; landing pages, three SEO pages per language,
  `sitemap.xml`, both CSVs;
- no `5xx` in the smoke tests; Horizon queues healthy.

Any failure before the point of no return → rollback §8.1.

### 5.3 SEO contingency (DEC-15)

If everything except the SEO gate passes, the product owner may approve S2 with SEO paths of `kvadro.app` proxied by
HOMI's nginx to the legacy origin (read-only, frozen data) for at most 14 days **[PT]**, provided the legacy origin stays
reachable and the legacy operator agrees. During that time the legacy pages show frozen prices; the landing data files
come from HOMI. Decommissioning (S3) waits until the HOMI SEO pages pass the gate.

### 5.4 Error budgets after S2 (72-hour window)

| Signal | Budget | Action when exceeded |
| ------ | ------ | -------------------- |
| Legacy surface `5xx` | ≤ 0.5 % of requests per hour; no endpoint > 2 % | stop deliveries if related; fix-forward; rollback decision if not fixed in 2 h |
| Latency | p95 ≤ 2× the staging baseline per endpoint | investigate; scale workers |
| `401` | a spike right after T0 (token rotation invalidates open sessions), back to baseline within 2 h | if it stays: verifier or token mismatch → priority incident |
| Webhook | zero non-2xx answers; pending count < 100 after the backlog is drained | priority incident |
| Delivery | non-`403` failures ≤ 1 %; **zero** re-sends of cards delivered before the switch | re-sends: pause the `notifications` queue at once (send cap 0) |
| Data integrity | daily validation re-run (`14` §7.6, GO + 24 h) clean | stop writes on the affected module; fix-forward |
| Ingestion | new listings appear within the legacy freshness target | collector incident; users see fewer new listings, no data loss |

## 6. S2 runbook

Times are relative to T0. Owners: **PO** product owner, **PT** first developer (production track), **DEV** developer,
**LO** legacy operator. The final runbook with exact commands is KV-DB-026 (`14` §8) plus the bot and DNS steps below;
it is dry-run in R2 and R3.

| When | Step | Owner |
| ---- | ---- | ----- |
| T−14 d | contract freeze (§3); maintenance window agreed with LO | PO, DEV |
| T−7 d | R3 passed; §5.1 signed; communication plan started (§9) | DEV, PT, PO |
| T−72 h | certificates for `kvadro.app` and `app.kvadro.app` installed on HOMI (`17` §3.3); vhosts tested with a hosts-file override from an allowed machine | PT |
| T−48 h | DNS: lower the TTL of the kvadro records to 60 s (not needed for proxied Cloudflare records, where the switch is an origin change); edge cache rules for the HOMI origin prepared (`17` §7) | PT |
| T−24 h | bulk load of historical data from a fresh dump (`legacy_watermark = W1`); media bulk copy completed; R3-style validation | DEV, PT |
| T−3 h | announcement through the legacy bot (§9); support team briefed | LO, PO |
| T−30 min | HOMI production: `telegram` queue **paused**, radar delivery off (send cap 0), legacy-surface mutations in maintenance mode, webhook route live on `hook.homi.uz` with the new secret; dashboards open | PT, DEV |
| **T0.1** | LO stops the legacy bot receiver: `deleteWebhook` with `drop_pending_updates=false` (or stops polling) — updates now wait at Telegram | LO |
| **T0.2** | LO freezes legacy writes: API mutations answer an error, legacy jobs stopped (channel reading, matching, digests, purges, landing jobs) | LO |
| **T0.3** | bot owner in BotFather: `/revoke` → new token → production vault → HOMI production `.env` (`TELEGRAM_BOT_TOKEN`), `php artisan config:cache`, `horizon:terminate` (SEC-REQ-012). *If R2 showed that queued updates are lost on revocation, T0.3 moves before T0.1 and the gap between the steps is kept under a minute* | PO (bot owner), PT |
| **T0.4** | from the production server: `setWebhook` — URL `https://hook.homi.uz/telegram/webhook`, `secret_token`, `allowed_updates` = `message`, `callback_query`, `my_chat_member`, `max_connections` as configured, `drop_pending_updates=false` (DEC-17) | PT |
| T0.5 | `getWebhookInfo` check; buffered updates arrive in `telegram_updates` (contacts redacted before storage) while the queue stays paused | PT, DEV |
| T0 + 2 min | final delta extract after the legacy jobs stopped; load; erasure replay (`14` §7.6, §7.9) | DEV, PT |
| T0 + ≤ 45 min | fast validation subset; **go/no-go** (§5.2 data part) | DEV, PO |
| GO | DNS / edge: `app.kvadro.app` and `kvadro.app` to HOMI; edge cache purge for both zones | PT |
| GO + 2 min | smoke tests (§5.2) | DEV |
| **GO + 5 min — point of no return** | un-pause the `telegram` queue (buffered updates processed in order); open legacy-surface mutations | PT, DEV |
| GO + 10 min | radar delivery on with a send cap; watch sends per minute against the legacy rate | DEV |
| GO + 30 min | BotFather and Bot API checks: Main Mini App URL and menu button still `https://app.kvadro.app/`; descriptions and commands per language unchanged (`getMyCommands` per `language_code`); privacy URL; inline off. No profile change is made at S2 | PT, PO |
| GO + 1 h | delivery cap raised to the normal pacing; end of maintenance message (§9) | DEV, PO |
| GO + 24 h | full validation suite on live data; rollback-window review | DEV |
| GO + 72 h | close the rollback window (§7) → S3 | PO |

BotFather settings do **not** change at S2, because HOMI serves the same hosts (CF-008 option A). They change only at
S4 (if the new Mini App gets another URL) and at S6.

## 7. Point of no return

Per `14` §7.7: the first user-visible write processed by HOMI — un-pausing the `telegram` queue or accepting the first
mutation on the legacy surface (GO + 5 min). Two more one-way doors exist and are taken knowingly:

- **Token rotation (T0.3)** is irreversible: the old token is dead. A rollback hands the new token to the legacy
  operator through the vault, or rotates again (DEC-05).
- **Legacy decommissioning (S3)** destroys the legacy database and copies; after it, rollback to legacy is impossible.

The rollback window between the point of no return and S3 is proposed at **72 hours** (DEC-18).

## 8. Rollback

### 8.1 S2 before the point of no return

Trigger: any failed check before GO + 5 min.

1. HOMI: keep the `telegram` queue paused; export the list of buffered updates (ids and types only) for the legacy
   operator, because Telegram already delivered them to HOMI.
2. DNS / edge back to the legacy origin (if already switched); purge the edge cache.
3. `setWebhook` back to the legacy receiver with the **new** token handed to the legacy operator through the vault
   (the old token is dead after T0.3), `drop_pending_updates=false`.
4. Legacy unfrozen (mutations, jobs).
5. HOMI production tables truncated before the next attempt; the attempt is recorded.

Expected impact: the freeze window; users who wrote to the bot during the window may have to repeat the action.

### 8.2 S2 after the point of no return (within 72 h)

Triggers: budgets of §5.4 broken and not fixable within 2 hours, data corruption, mass re-sends.

1. Stop the damage first: send cap 0 (pause `notifications`), legacy-surface mutations in maintenance if data is at
   risk.
2. Decide: **fix-forward (default)** or rollback — product owner with the first developer.
3. Rollback = the §8.1 steps, plus an export of every HOMI-side write since the point of no return (radars, settings,
   favourites, hidden listings, blocked authors, votes, found answers, owner verifications, erasure requests, delivered
   cards) as a report for the legacy operator (`14` §7.8).

### 8.3 What cannot be rolled back

| Effect | Why | Handling (proposal; DEC-18) |
| ------ | --- | --------------------------- |
| Messages HOMI sent (cards, digests, notices, broadcasts) | Telegram messages cannot be unsent; deletion by the bot is limited by Bot API rules (to verify) | accepted; the export of delivered cards lets legacy avoid re-sending them if it can import them — otherwise users may get duplicates |
| User data written to the HOMI database after the point of no return | the legacy backend source is not available and its import path is unknown (`14` §7.8), so a reverse sync cannot be built | **no reverse sync**: an export report for manual re-application; whatever is not re-applied is lost. The product owner accepts this before S2 |
| Erasure requests processed by HOMI | a privacy obligation | **must** be replayed on legacy after a rollback — not optional |
| Token rotation | irreversible by design (SEC-REQ-012) | new token handed over or rotated again |
| Per-chat state HOMI changed at Telegram (commands, menu buttons, reactions, edited cards) | lives at Telegram | HOMI changes none of it at S2 except card edits; edits stay |
| PostHog events sent by HOMI | external | harmless; same project and distinct ids |
| Edge and search caches | external | purge the edge; search engines saw the same URLs |

### 8.4 Later stages

- **S3:** no rollback to legacy after decommissioning; HOMI releases roll back to the previous release directory
  (`17` §11).
- **S4:** swap the served files back to the legacy artefacts (nginx root or BotFather URL, §12.1) — cheap while the
  legacy surface lives, which is why S5 waits.
- **S5:** redeploy the release before the removal; the legacy artefacts can be restored from their manifest.
- **S6:** remove the redirects; search signals recover slowly, so S6 is decided with that cost in mind.

## 9. Communication

| Audience | When | Channel | Content (ru, uz, en) |
| -------- | ---- | ------- | -------------------- |
| Users | T−3 d and T−3 h | legacy bot «Новости сервиса» broadcast to users who did not opt out (BOT-084), sent by the legacy operator | maintenance window, nothing to do, radars keep working |
| Users | T0 … GO + 1 h | legacy Mini App mutations answer «Не получилось сохранить» during the freeze (`14` §7.6); the bot is silent until the queue runs | — |
| Users | GO + 1 h | HOMI bot broadcast, only if the window was longer than announced | end of maintenance; "reopen the app if it shows an error" |
| Support (`@KvadroSupportBot` staff) | T−7 d, T−3 h | team chat | what users may see (one reopen, a short silence of the bot), how to escalate |
| Legacy operator | from S0 | agreed channel | runbook steps T0.1–T0.3, rollback duties, decommissioning |
| Collector owner (`telegram.uz`) | S0, if CF-007 A/C applies | agreed channel | source switch dates |
| Team | throughout | operations chat | status per runbook step; incident updates every 30 min |

Templates are written and translated before R3; incident messages never include personal data.

## 10. Monitoring window after S2

| Period | Mode |
| ------ | ---- |
| GO … GO + 4 h | war room: developer and first developer online, dashboards of `17` §12 open, every runbook step logged |
| GO + 4 h … GO + 72 h | heightened on-call (both developers, response within 15 minutes for priority alerts); daily integrity checks; a short status note per day to the product owner |
| GO + 72 h | rollback-window review → S3 or extension (product owner) |
| GO + 14 d | post-cut-over review: budgets, incidents, DEV entries confirmed, open questions closed |

Watch especially: re-sends of old cards, `401` decay after the token rotation, webhook health, digest runs at the first
digest hour after GO, quiet-hours release the next morning, the first 90-day purge run, ingestion freshness, contact
quota trips.

## 11. Decommissioning the legacy system (S3)

1. Legacy backend and bot receiver stopped by the legacy operator; the legacy origin no longer answers (after the SEO
   contingency ends, if used).
2. Legacy database, the final dump, rehearsal databases, the import database, transfer buckets and media copies
   destroyed; the destruction recorded with dates (`14` §7.9, KV-DB-031). Legacy backups age out (~2 weeks) — the
   legacy operator confirms (Q-DATA-044, Q-SEC-011).
3. Secrets held by the legacy operator rotated or revoked: LLM key, PostHog personal key, Cloudflare tokens, registrar
   and DNS access moved (Q-SEC-001).
4. Legacy owner hashes expire at the end of their own window (`14` §7.9, KV-DB-030).
5. `@KvadroSupportBot`: migrated, kept by the legacy operator or retired (DEC-21).
6. Records kept: the frozen spec, the artefact manifests, the SEO archive (as the parity baseline for later changes).

## 12. Later stages

### 12.1 S4 — new HOMI frontends

- **Mini App canary:** the new Mini App is served on the same origin under a separate path (or a sub-host), opened for
  a test cohort through per-chat menu buttons (`setChatMenuButton` for chosen users) and `web_app` buttons in their new
  messages; everyone else keeps the legacy files. Budgets: startup no worse than legacy p75 (`10` §5.12), crash rate
  (error-boundary reports per session) no worse than legacy, no rise in support requests.
- **Full switch:** the origin root serves the new app (old `web_app` buttons pointing at the root then open it); the
  BotFather Main Mini App URL changes only if the URL changes. `kv-*` client keys are kept, so users keep their client
  settings (`03` §3.2).
- **Rollback:** swap the root back to the legacy files; the legacy surface is still there.
- **Landing:** the re-implemented landing replaces the mirror after its parity run; the SEO pages are already HOMI's.

### 12.2 S5 — sunset of the legacy surface

When the rule of `10` §3.2 holds: remove `routes/legacy.php`, the `tma` guard, the legacy serializers and renderer,
the legacy limiters and the artefact directories; keep the `/media` and `/call` routes as long as the new clients use
the same URL shapes. Old bot messages keep working because their `web_app` URLs open the new app and their callbacks
go through the versioned codec and the catch-all.

### 12.3 S6 — brand move (only after DEC-04)

Path-for-path `301` from every `kvadro.app` URL with the query string for ≥ 12 months, new sitemap and Search Console
change of address (`03b` §6.1); `app.kvadro.app` keeps serving or redirecting (test that `tgWebAppData` survives the
redirect inside Telegram WebViews first); the bot username stays unless the product owner accepts that every
`t.me/KvadroAppBot` link breaks. Gate: no drop in organic sessions beyond the agreed tolerance after 4 weeks, every
`301` returns the mapped page.

## 13. Dependencies and open items

- Decisions: DEC-01, 02, 03, 04, 05, 06, 12, 13, 15, 16, 17, 18, 21, 25, 26 (`10` §8).
- Questions: custody and transfer (Q-SEC-001), freeze date (Q-SYS-005), pending updates (Q-SEC-017), backups and
  destruction (Q-SEC-011, Q-DATA-044), CSP header capture (Q-APP-016), SEO archive (Q-SEO-001), outbound bot behaviour
  that was never observed (`04` §5 — needs a capture on a test account or a specification from the owner before §5.1
  can be signed).
- To verify in R2: pending updates across a token revocation; bot deletion limits for sent messages; redirect
  behaviour inside Telegram WebViews (only for S6).
