# 24 — Three-wave migration strategy

Conventions: [`README.md`](README.md). Status: **`PROPOSED`** — the developer's direction of 2026-11-14, binding once
the ADR of section 9 is accepted. This document **amends** the order of work in
[`21-development-master-plan.md`](21-development-master-plan.md) §5–§6, the stages of
[`18-release-and-rollback.md`](18-release-and-rollback.md) §2 and two rules of
[`22-agent-handoff.md`](22-agent-handoff.md) §1 and §4. The audit (01–09), the target architecture (10), the tasks
and the registers stay valid; section 7 says what moves. The detailed plan of the first wave is
[`25-wave-1-frontend-plan.md`](25-wave-1-frontend-plan.md).

## 1. What changed

Developer's direction, 2026-11-14: «Разработку разделим на три волны. Основной принцип — постепенный переход на
новую архитектуру без остановки работающего сайта и нарушения существующей функциональности.»

| | Plan of 2026-11-09 (21 §5, "compatibility first") | Three waves |
| - | ------------------------------------------------- | ----------- |
| First | HOMI backend and bot serve the **unchanged legacy Mini App** on staging (S1) | The **Mini App is ported to Next.js** and talks to the **legacy production backend** through a proxy |
| Switch | One cut-over of data, bot and both hosts (S2), with a point of no return | The API moves **route by route** behind a gateway; each route can go back |
| Last | New frontends (S4) | Remaining routes, the bot, decommissioning |
| Oracle for parity | The legacy client run against the new backend | The legacy client **and** the legacy backend, compared with the new client and, route by route, the new backend |

Principles, as given:

1. **Zero downtime.** No step stops the running product.
2. **Backward compatibility.** Every existing function keeps working at every step.
3. **Incremental migration.** Small independent parts.
4. **Rollback.** Any API route can be returned to the legacy backend quickly.
5. **One API layer.** The frontend does not know which backend answers.

Unchanged from 21 §5: legacy defects are fixed, not copied (with the Wave 1 rule of DEC-36); the data is migrated,
not re-read; a feature is "migrated" only after its parity gate (15 §4).

## 2. The waves

| Wave | Content | Result | Exit |
| ---- | ------- | ------ | ---- |
| **1. Frontend** | Port the Mini App from `$KVADRO_ROOT/demo/app` to `frontend/app` (Next.js 16.4), 1:1 in interface and behaviour. Every request goes through the gateway to the legacy backend. Built and tested on HOMI hosts, apart from the running product | A working copy of today's Mini App on Next.js that uses the legacy API | Parity evidence on every screen (25 §9), device pass, then the client switch with a tested way back (25 §10, stage W1-9) |
| **2. Backend, route by route** | For each API route: build it on HOMI's legacy compatibility surface (CF-001), prove it against the legacy answer, switch the route in the gateway, keep the rest on legacy | Both backends run side by side; the share served by HOMI grows | Every route the product needs is served by HOMI, each after its own check |
| **3. Full switch** | Move the remaining traffic and the bot, remove the dependency on the legacy API, regression and integration tests, performance, security, stability, decommission legacy | One architecture | The checks of 18 §11 and the legacy copies destroyed |

Only Wave 1 is planned in detail now. Sections 5 and 6 outline Waves 2 and 3 far enough to show that the Wave 1
choices do not have to be redone, and to name what must be answered before Wave 2 can be planned.

## 3. One API layer: the gateway

**What the browser does.** The legacy client calls relative paths on its own origin: `/api/*`, `/media/*`,
`/tiles/*` and `/call/*` (BR-API-001; `$KVADRO_ROOT/demo/app/vite.config.js:51-64`,
`$KVADRO_ROOT/demo/app/src/lib/api/client.js:74-86`). The new client keeps exactly that. It never holds a backend
address, so no client release is needed to move a route.

**What the gateway does.** One table maps *method + path pattern → upstream*. The default upstream is legacy. A route
moves to HOMI by one line in the table and a graceful reload; it moves back the same way.

| Property | Rule |
| -------- | ---- |
| Unit of switching | One method and path pattern (for example `GET /api/cities`), never "the API" |
| Default | Legacy, for anything the table does not name — including routes legacy adds later |
| Cohorts | A request can be forced to one upstream by a header or cookie that only testers have; on production the value is a secret. Used to try a route before everyone gets it |
| Evidence | A response header names the upstream that answered, and the access log records it; the log never stores `Authorization` (SEC-REQ-047) |
| Shadow (Wave 2) | For read routes the gateway can copy a request to the other upstream and discard the answer, so answers can be compared before a switch |
| Scope | Routing only. No translation of shapes: CF-001 already rejected a translating proxy, and HOMI implements the legacy shapes itself |

**Where it lives.** Two candidates, both `PROPOSED` (DEC-35):

| Option | How | For | Against |
| ------ | --- | --- | ------- |
| **H — HOMI nginx** on the Mini App origin | `location` blocks for the four prefixes; a `map` on method and path picks the upstream; the table is a generated include | Fully in the team's hands; the same shape locally, on staging and on production; nginx already fronts every HOMI app (ADR-0013); reload is graceful | Every user request to legacy then arrives from one HOMI address: unknown legacy rate limits and edge rules (Q-API-059); HOMI servers carry real users' `initData` and personal data before Wave 2 (Q-SEC-021, SEC-005) |
| **E — the edge** in front of `app.kvadro.app` | Path rules of the existing edge send the page and its static files to HOMI and leave the four prefixes on the legacy origin; later single paths go to HOMI | Users keep the address every old bot button already carries (`04-telegram-bot-audit.md:108-109`); legacy still sees real client addresses; no personal data crosses HOMI servers in Wave 1 | Needs the edge account or the operator's cooperation (Q-SEC-001, DEC-16, Q-SYS-009); not available for local or staging hosts |

The host name matters as much as the place. Client settings live in `localStorage`, which belongs to an origin, and
every old bot message carries the old address. A production client on `app.kvadro.app` (through E, or through H
after a DNS change) keeps both; a client on a HOMI host name keeps neither (25 §5.5, §10).

Recommendation: build **H** in Wave 1, because local and staging need it in any case, and choose between H and E for
production at the switch (stage W1-9), when the custody questions are answered.

**Why not inside Next.js.** Next can proxy with `rewrites` to an external URL, with `NextResponse.rewrite` in
`proxy.ts`, or with a catch-all Route Handler
(`frontend/app/node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/rewrites.md:328-396`,
`…/01-app/02-guides/backend-for-frontend.md:443-505`, `:684-771`). All three put the Node process in the path of
every API call, photo and map tile, and make a route switch a change of the application rather than of a table.
`proxy.ts` also buffers request bodies (`…/05-config/01-next-config-js/proxyClientMaxBodySize.md`). The gateway is
therefore kept out of the app; `proxy.ts` stays free for the CSP nonce (KV-FE-033).

**What contract flows through it.** The legacy contract of 08, unchanged, for all of Waves 1 and 2 (FD-2, option A).
HOMI implements each route on its legacy compatibility surface, so a switch is invisible to the client. Moving the
client to `/api/v1` (ADR-0007) is a separate, later step behind the same typed client port (25 §3.5).

## 4. Wave 1 in one paragraph

Port the recovered Mini App sources module by module into TypeScript inside a client-rendered route group of
`frontend/app`, keep its structure, CSS, texts, storage keys and analytics names, and prove parity with a run that
drives the legacy production build and the new build through the same fake Telegram and the same mocked API. The
existing 87 frontend tasks of milestones FE-0, FE-1, FE-2 and FE-5 (12) are the specification; their 38 backend
prerequisites are replaced by the legacy API. Details, inventory, proxy, sequence and exit criteria: 25.

## 5. Wave 2 in outline

**Unit of work per route.**

1. Implement the route on HOMI's legacy surface (the KV-BE tasks of M0–M4 and M7 in 11 and 11a stay the specification).
2. Contract tests and golden fixtures (15 §2.1, §2.4).
3. Shadow comparison against legacy answers for read routes; scripted comparison on a test account for write routes.
4. Switch for the tester cohort, then for everyone; watch error budgets.
5. Remove the legacy entry after a soak period. Rollback at any time before that: one line in the table.

**The open problem: routes share data.** A route can only move when HOMI holds the data it reads and writes, and
when the side that did not move still sees the same data. No document of this plan covers that state; the existing
plan has one cut-over with a freeze (14 §7.6, 18 §6) and rules out a reverse sync (DEC-18).

| Group | Routes | What moving them needs |
| ----- | ------ | ---------------------- |
| No shared state | `/api/bot`; the event journal and CSP reports if both sides may receive them; static tiles | Nothing from legacy. These can move first and prove the gateway |
| Shared listing data | cities, feed, count, flow, map, listing, call, translate, photos (API-002, API-004 … API-010, RES-001, RES-002) | The same listings, numbers, statuses and medians in HOMI, kept current: a legacy dump plus a continuous feed, or HOMI's own ingestion at parity (M6) |
| Per-user state | meta with the profile and the access gate (API-001); favourites, hidden, blocked authors, history, settings, radars, votes, surveys (API-011 … API-016, API-018 … API-033) | The user's rows in HOMI **and** agreement with the bot, which reads and writes the same favourites and radars and delivers radar cards from the legacy database |
| The bot | all updates | Cannot be split: one bot has one webhook (`01-legacy-system-map.md:107-109`). It moves in one step, together with radar delivery |

Options for the data strategy (DEC-39), to be worked out in the Wave 2 plan:

- **D1 — shared database.** HOMI's legacy surface reads and writes the legacy PostgreSQL directly. Route-by-route
  switching and rollback then work as described, including writes. Needs database access and the schema.
- **D2 — replication and per-domain switches.** Legacy data flows one way into HOMI; reads move route by route; the
  writes of one domain (for example favourites) move together in one small cut-over. Rollback of a write domain
  needs a replay or is a one-way door.
- **D3 — stateless routes only** until the single cut-over of the old plan. This is what remains if no access to
  legacy data is granted.

All three wait for answers the plan has been asking for since 2026-11-09: the legacy source, schema, a data sample
and an access path (Q-SYS-001, Q-SYS-002, Q-DATA-001 … Q-DATA-005). **Without them Wave 2 stops after the first
group** (RK-24).

**Authentication.** A route served by HOMI must accept the `initData` that `@KvadroAppBot` signs. Today's plan gives
HOMI the bot token only at the single cut-over and rotates it there (DEC-05, SEC-REQ-012). Wave 2 needs either the
token on HOMI servers earlier, shared with the legacy operator for the whole wave, or a validation that needs no
token (Q-API-061).

**Rollback of writes.** Returning a write route to legacy loses what HOMI stored meanwhile unless D1 is chosen or the
writes are replayed. DEC-18 ("no reverse sync") has to be revisited with DEC-39.

## 6. Wave 3 in outline

The remaining routes and resources, the bot webhook with the token rotation, the DNS and edge of both kvadro hosts,
landing and SEO pages if DEC-38 left them on legacy, then the regression, performance and security passes and the
decommissioning records. This is what remains of stages S2, S3 and S5 of 18 once Waves 1 and 2 have taken their
parts; the runbooks of 18 §6–§11 apply to the pieces that are still single switches.

## 7. How this maps onto the existing plan

| Existing element | Under three waves |
| ---------------- | ----------------- |
| 21 §5 item 1–2 ("compatibility first", "one change at a time: backend at S2, frontends at S4") | Replaced by section 2. "One change at a time" becomes "one route at a time" |
| 21 §6 milestone M9, frontend milestones FE-0, FE-1, FE-2, FE-5 (Mini App part, 87 tasks) | **Wave 1**, moved to the front |
| Milestones M0–M4 and M7 (legacy surface, per-user API, radars, landing data) | **Wave 2**, delivered route by route instead of all before S1 |
| M5 (bot), M6 (ingestion), M8 (data migration) | Wave 2 and 3; their order follows DEC-39 |
| FE-3 (SEO, landing), FE-4 (ARM) | Not in Wave 1 (DEC-38); planned separately |
| Stage S1 (legacy client against HOMI on staging) | Kept as a **method**: the per-route check of Wave 2 runs the legacy client and the new client against the route |
| Stage S2 (single cut-over) | Split: API routes move in Wave 2; the bot, the token and DNS remain single switches in Wave 3 |
| Stage S4 (new frontends) | Becomes the Wave 1 switch (25 §10, W1-9) |
| CF-011, "the original legacy build is served unchanged in S1–S3" | The new client replaces it at the Wave 1 switch; the original build stays the rollback target and the parity reference |
| DEC-06 / FD-1 (Next route group or Vite SPA) | Answered by the direction: Next.js. The browser-floor gate stays (RK-07, KV-FE-001, KV-FE-002) and is now on the critical path |
| FD-2 (transport) | Option A confirmed: the legacy `/api/*` with `tma` on the same origin |
| 22 §4 "Never call the production API" and 15 §"Production" | Amended by DEC-33 for the `live` mode of 25 §6; tests, CI and agents still never call production |
| KV-FE-038 and SEC-REQ-034 ("no production `initData` locally") | Amended by DEC-33: allowed for an owner-approved test account, held by a developer, never stored in the repository or shown to an agent |
| The 38 backend prerequisites in the Wave 1 frontend tasks (`data/tasks.csv`) | Satisfied by the legacy API through the gateway and by contract mocks; the `Dependencies` cells are updated when the tasks are picked up (25 §11) |
| 21 §20 next task (KV-BE-002, Media ownership) | Still worth doing on its own: it is a defect in HOMI's own code (KI-25). It is no longer the first step of the migration; the first step is stage W1-0 |
| DEC-05 (rotate the token at S2), DEC-18 (no reverse sync) | Revisit in the Wave 2 plan (section 5) |
| `HANDOFF.md` §4: T8 (frontend foundation) | Moves forward as the base of Wave 1; T5 (generated client) is not needed for Wave 1. Change by a separate shared-file PR |

## 8. New decisions, questions and risks

All `PROPOSED`. "Who decides" follows 10 §8.

### 8.1 Decisions

| ID | Decision | Options | Recommendation | Who decides | Blocks |
| -- | -------- | ------- | -------------- | ----------- | ------ |
| DEC-31 | Order of the migration | A: compatibility first (21 §5) / B: three waves | B — given by the developer on 2026-11-14; recorded by the ADR of section 9 | developer (given), first developer (ADR review), product owner (informed: users see a new client earlier) | everything below; 21 §5–§6, 18 §2 |
| DEC-32 | Porting mode of Wave 1 | A: port the recovered sources module by module into TypeScript, same structure and CSS / B: re-implement each screen from the audit on new primitives, as the FE-1 and FE-2 task texts were first written | A; the refactors of B after the Wave 1 exit, protected by the parity run (25 §8) | developer | stages W1-1 … W1-7 |
| DEC-33 | Use of the legacy production API from development and staging | none (mocks only) / read-only under the rules of 15 §1.6 / reads plus writes on owner-approved test accounts | reads plus test-account writes, in `live` mode only, under 25 §6.3; CI and agents stay on mocks | product owner (their production), developer, first developer | live checks, W1-8, W1-9 |
| DEC-34 | How the new client is opened inside Telegram with production-signed `initData` before the switch | A: a second Mini App with a direct link on `@KvadroAppBot`, pointing at the preview host / B: a per-chat menu button for a test cohort / C: browser emulator only | A for testers, B for the canary | product owner and the holder of the bot's owner account (Q-SEC-001) | device pass (W1-8), W1-9 |
| DEC-35 | Where the production gateway lives | H: HOMI nginx / E: the edge in front of `app.kvadro.app` (section 3) | build H in Wave 1; choose for production at W1-9 from the answers to Q-SYS-009, Q-API-059 and Q-SEC-021 | first developer, product owner (custody) | W1-9, all of Wave 2 |
| DEC-36 | Legacy client defects during Wave 1 | A: port everything as it is / B: fix crash- and security-class defects that leave intended behaviour unchanged, keep every `DEV` flag off / C: apply all `LB` fixes as 12 planned | B, with the list agreed in W1-0 (25 §8.3) | developer | W1-1 … W1-7; the expected-difference list of the parity run |
| DEC-37 | Legacy Mini App releases during and after Wave 1 | A: port every legacy release until the switch, then freeze legacy client releases / B: freeze now | A (25 §8.4) | product owner, developer | the Wave 1 exit date |
| DEC-38 | Landing and SEO pages in Wave 1 | A: stay on legacy; planned as their own step / B: port in parallel | A — the SEO pages are rendered from the legacy database (RES-017), so there is no API to proxy to | product owner, developer | FE-3 |
| DEC-39 | Data strategy of Wave 2 | D1 shared database / D2 replication plus per-domain write switches / D3 stateless routes only (section 5) | decide in the Wave 2 plan; needs Q-SYS-001, Q-SYS-002 and Q-DATA-001 … Q-DATA-005 | product owner, first developer | Wave 2 beyond the routes without shared state |

### 8.2 Questions

| ID | Question | Check that closes it | Who can answer |
| -- | -------- | -------------------- | -------------- |
| `Q-SYS-009` | Who operates the legacy backend, its edge and the bot's owner account today, and will they add a test launch path (DEC-34), state the limits of Q-API-059, and agree on edge rules or an origin host name for the gateway (DEC-35)? `UNVERIFIED` | A named contact and a written answer | Product owner |
| `Q-API-059` | Does the legacy edge or backend accept the whole user base arriving from one server address? Rate limits and their key are unknown (Q-API-001); whether a forwarded client address is trusted is not stated anywhere. `UNVERIFIED` | The operator's answer; then a measured ramp through the staging gateway, with approval | Legacy operator |
| `Q-API-060` | Does any legacy route depend on `Origin`, `Referer` or `Host`? The legacy dev proxy rewrites only `Host` (`$KVADRO_ROOT/demo/app/vite.config.js:51-64`) and the legacy README describes development against production; neither was run by us. `UNVERIFIED` | One read and one test-account write through the local gateway (needs DEC-33) | Developer |
| `Q-API-061` | Can HOMI validate production `initData` without holding the bot token (Telegram's validation for third parties with the `signature` field)? `UNVERIFIED` | Telegram's Mini Apps documentation and a test with a dev bot | Developer (Wave 2 plan) |
| `Q-APP-023` | Does the CSS pipeline of `frontend/app` (the Tailwind loader for every `*.css`, `frontend/app/next.config.ts`) leave the legacy global CSS unchanged in effect at the chosen browser floor? `UNVERIFIED` | Computed-style comparison of key elements in the KV-FE-002 spike | Developer |
| `Q-APP-024` | Which legacy release is the port baseline? The audit describes `index-plF_TOcT.js` (`08-api-inventory.md:11-12`); the legacy tree has since synced `index-Dbpp463V.js` and `index-BNLZFfL0.js` (`$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:5`, `$KVADRO_ROOT/demo/app/docs/releases/`). `CONFIRMED` drift | Re-baseline 03 and 08 in stage W1-0 and pin the release | Developer |
| `Q-SEC-021` | With gateway option H, do HOMI servers become a processor of real users' personal data during Wave 1, so that the legal basis of DEC-13 is needed before the Wave 1 switch rather than before the data migration? `UNVERIFIED` | Lawyer's note | Product owner |

### 8.3 Risks

| ID | Risk | L | I | Area | Mitigation | Owner | Linked |
| -- | ---- | - | - | ---- | ---------- | ----- | ------ |
| RK-24 | **Wave 2 stalls after the stateless routes.** Routes share data with each other and with the bot; the legacy database and source are not available | H | H | data, backend | Ask now for database access, schema and source; choose the data strategy before planning Wave 2; keep the single cut-over of 18 as the fallback | product owner; first developer | DEC-39, Q-SYS-001, Q-SYS-002, RK-02 |
| RK-25 | **The legacy edge or backend throttles or blocks the gateway**, because all users arrive from one address | M | H | infrastructure | Ask the operator first; ramp on staging; keep option E, where clients reach legacy directly | first developer | DEC-35, Q-API-059, SEC-017 |
| RK-26 | **The target moves during the port.** The legacy client ships a release every one to three days, and the contract with it | H | M | frontend | Pin a baseline, port each release from its sync report within an agreed time, freeze legacy client releases at the switch | developer; product owner | DEC-37, Q-APP-024, RK-05 |
| RK-27 | **Development traffic changes production data or analytics** | M | M | security, data | `live` mode only on test accounts, analytics and the event journal suppressed outside production, mocks for CI and agents | developer | DEC-33, 25 §6.3 |
| RK-28 | **The launch path, the canary and the switch depend on the bot's owner**, whom the team does not control | M | H | release | Ask in W1-0; until then test in the emulator and in Telegram Web with a pasted launch link | product owner | DEC-34, Q-SYS-009, Q-SEC-001 |

Risks of 19 that change weight: RK-07 (old WebViews) moves onto the critical path of Wave 1; RK-01 (hidden server
behaviour) and RK-09 (stale feed) are relieved for as long as legacy serves the routes; RK-06 changes its subject,
because the client that must not crash is now the new one.

## 9. What happens next

1. Review of this document and of 25 by both developers.
2. An ADR "Three-wave migration of kvadro²" (next free number, 0016 today) that records DEC-31 and DEC-35 and amends
   ADR-0013 for the client-rendered Mini App route group (KV-FE-003). Shared file: its own small PR.
3. Answers to DEC-32 … DEC-38; the requests to the product owner of Q-SYS-009 and DEC-34 go out at once, because
   they have the longest lead time.
4. Stage W1-0 of 25 starts. Three of its items need no decision: the re-baseline (Q-APP-024), the dependency request
   (KV-FE-005) and the spike (KV-FE-002).
5. The Wave 2 plan is written when the prerequisites of DEC-39 are known.
