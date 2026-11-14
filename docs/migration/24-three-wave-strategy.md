# 24 — Three-wave migration strategy

Conventions: [`README.md`](README.md). Status: **decided by the developer on 2026-11-14** (the three-wave direction
and the answer round recorded in [`decisions/2026-11-14-developer-answers.md`](decisions/2026-11-14-developer-answers.md));
`PROPOSED` towards the first developer until the ADRs of section 9 are accepted. This document **replaces** the
order of work in [`21-development-master-plan.md`](21-development-master-plan.md) §5–§6 and the release stages of
[`18-release-and-rollback.md`](18-release-and-rollback.md) §2. The audit (01–09) stays the description of what the
product does. The plan of the first wave is [`25-wave-1-plan.md`](25-wave-1-plan.md); its work queue is
[`wave-1/README.md`](wave-1/README.md).

## 1. What changed

Two steps on the same day.

1. **The direction.** «Разработку разделим на три волны. Основной принцип — постепенный переход на новую
   архитектуру без остановки работающего сайта и нарушения существующей функциональности.» Frontend first, then the
   API method by method, then the full switch.
2. **The answer round.** HOMI does not take over the legacy bot and hosts. It ships a **new, permanent product**
   under its own bot and brand, and uses legacy only as a source of listings until it has its own.

| | Plan of 2026-11-09 (21 §5) | Now |
| - | -------------------------- | --- |
| Product | The same bot, hosts and users, moved onto HOMI | A new bot, HOMI hosts, HOMI's own users; legacy keeps running beside it |
| First deliverable | HOMI backend serving the unchanged legacy Mini App | The whole new product at functional parity, with listings read from legacy |
| Client | Legacy Mini App until the last stage | A Mini App rebuilt on Next.js from the start |
| Contract | Legacy `/api/*` on a compatibility surface | `/api/v1` only; legacy shapes never reach the frontend |
| Switch | One cut-over of data, bot and DNS with a point of no return | A flag per API method: stub → legacy → own code, each reversible |
| Users' data | Migrated from the legacy database | Not migrated; users start empty in the new bot |

Principles, as given: zero downtime; backward compatibility; incremental migration; rollback of any API route; one
API layer so that the frontend does not know which backend answers.

Unchanged from 21 §5: legacy defects are fixed, not copied; nothing counts as done without evidence (section 7 says
what replaces the parity gate).

## 2. The product and the waves

**The new product.**

| Part | Where | Notes |
| ---- | ----- | ----- |
| Bot | HOMI's own bot per environment (dev, staging, production already exist, `10` §1.2) | Signs `initData`; HOMI holds its token |
| Mini App | `frontend/app` → `app.homi.loc`, `app.staging.homi.uz`, `app.homi.uz` | Brand HOMI, same interface as legacy (DEC-40) |
| Landing | `frontend/landing` → `homi.uz` | Full landing without the SEO pages (DEC-38) |
| API | `backend/` → `api.*`, `/api/v1` | The only interface of the frontend and the bot's Mini App |
| Webhook | `hook.*` | Updates of HOMI's bot only |

**Legacy** stays as it is: `@KvadroAppBot`, `app.kvadro.app`, `kvadro.app` and the operator's backend. HOMI does not
serve its users, does not hold its bot token and does not touch its hosts. At the end the old bot announces the move
and the operator closes it.

| Wave | Content | Result | Exit |
| ---- | ------- | ------ | ---- |
| **1. The new product on legacy listings** | Contract stubs, then the Mini App, then the API, then the bot, then the landing (in this order, DEC-45). Personal data, radars and the bot are HOMI's own code; listings, map points, cards, contacts and photos come from legacy through a service key | A complete product a user of the legacy bot would recognise function by function | The functional checklist of every screen and bot scenario passes on production with no method left on a stub (25 §9) |
| **2. Own listings, method by method** | Listings arrive from the `telegram.uz` collector through HOMI's intake (DEC-39). Each shared-data method moves from the legacy driver to HOMI's own code behind its flag, a cohort first | Legacy answers fewer and fewer methods | No method reads legacy |
| **3. Full switch** | The service key is retired; SEO pages and the admin panel are built on HOMI's data; regression, performance and security passes; the old bot announces the move and is closed by its operator | One architecture | Legacy is no longer called by anything |

## 3. One API layer: `/api/v1` with a source per method

**What the frontend and the bot see.** Only `/api/v1` in the HOMI envelope (ADR-0007) with HOMI's own session
(ADR-0003). No legacy path, error shape or credential leaves the backend.

**What the backend does.** Every capability sits behind an interface with up to three drivers. A Pennant feature per
method names the driver; changing it needs no deploy and can be scoped to a cohort of users.

| Driver | Answers with | Used |
| ------ | ------------ | ---- |
| `stub` | Fixtures that satisfy the contract | From the first day, so the frontend can be built; removed method by method |
| `legacy` | The legacy API, called with the operator's service key and translated to the v1 shape | Shared listing data during Waves 1 and 2 |
| `native` | HOMI's own tables and services | Personal data and radars from Wave 1; listing data from Wave 2 |

| Data | Methods | Wave 1 driver | After Wave 2 |
| ---- | ------- | ------------- | ------------ |
| Identity, profile, settings, access | sign-in, me, settings | native | native |
| Personal lists | favourites, history, hidden, blocked authors, reports, surveys | native | native |
| Radars | CRUD, relax, matching, delivery | native (matching reads the listing source) | native |
| Reference data | directories, cities, rates, tiles | legacy, cached | native |
| Listings | feed, count, flow, map, card, contact, translation, photos | legacy with HOMI's per-user overlay | native |
| Bot | every update | native | native |
| Landing data | live numbers, pins, snapshots | legacy | native |

**How the principles are met.**

- *Rollback:* a method goes back to its previous driver by its flag. Personal data never leaves HOMI, so no write is
  lost when a listing method goes back to legacy.
- *One layer:* the frontend is built once on the final contract. A driver change is invisible to it.
- *Zero downtime:* legacy is not touched; HOMI's own switch is a flag.

**What this costs.** CF-001 rejected a translating layer because it "duplicates validation and still needs every
legacy rule" (`10-target-architecture.md:417-419`). The decision of 2026-11-14 accepts that cost for the shared-data
group only — about a dozen methods — because the personal methods are native and need no translation.

## 4. Wave 1 in one paragraph

Fix the `/api/v1` contract as Laravel stub routes that export OpenAPI and generated TypeScript types. Build the whole
Mini App on those stubs: App Router with a route per screen, locale in the address, server rendering through a
session cookie with a header fallback, Tailwind tokens and shadcn/ui components. Replace the stubs: sign-in, personal
data and radars as HOMI's own code, listing data through a legacy adapter. Build the bot at full parity, then the
landing. Every merge is deployed to staging and production. Details: 25.

## 5. Wave 2 in outline

**Unit of work per method.** Implement the native driver → contract tests against the same fixtures as the stub and
the legacy driver → run native and legacy side by side for a cohort and compare answers → switch the flag for
everyone → remove the legacy driver after a soak period.

**Prerequisites.**

- The `telegram.uz` collector pushes listings into HOMI's intake. Today it pushes nothing and offers a pull API only
  (AM-44, `.ai/memory/current-state.md`); its owner and the first developer have to agree (DEC-02).
- The processing chain of 11a (intake, extraction, normalisation, geo, deduplication, statuses, medians) exists in
  HOMI, because the listing methods need its output.
- **Identity.** HOMI users' favourites, history, hidden items and radar deliveries point at legacy listing numbers.
  Native listings will have other identities. A mapping by source channel and post is needed, which is why Wave 1
  stores both from the first day (Q-API-063). The operator's dump and schema help to build and check it (DEC-39).

**Order.** Reference data and cities first, then feed, count, flow and map together (they must agree with each
other), then the card with contact and translation, then photos, then the landing data.

## 6. Wave 3 in outline

Every method native; the service key and the legacy drivers removed; SEO pages (the FE-3 tasks) and the admin panel
(FE-4) built on HOMI's own data; regression, performance and security passes; the announcement in the old bot. Closing
the old bot and its backend is the operator's act.

## 7. How this maps onto the existing plan

| Existing element | Now |
| ---------------- | --- |
| 21 §5 "compatibility first", §6 milestones, §20 next task | Replaced by sections 2–6 and by the queue in `wave-1/README.md`. KV-BE-002 is the first item of that queue |
| The legacy compatibility surface (CF-001, CF-002) and its tasks (legacy route group, `tma` guard, legacy serializers, legacy OpenAPI) | **Not built.** No legacy client talks to HOMI. The business rules those tasks cite still define the behaviour of the v1 methods |
| Hosts and bot identity (CF-008, CF-009), the cut-over tasks KV-INF-014, KV-INF-029, KV-INF-031, KV-INF-032, KV-TG-057, KV-TG-058, KV-TG-060 | **Not needed.** HOMI does not take over the legacy hosts, bot or old messages |
| Mini App rendering (CF-011, DEC-06, FD-1 … FD-3) | Answered by DEC-44 |
| Transport (FD-2) | Answered by DEC-41: `/api/v1`, not the legacy contract |
| Data migration (14, milestone M8, most KV-DB tasks) | **Not done.** Users' data is not moved (DEC-40). The dump serves Wave 2 as an archive and a reference |
| Backend milestones M0–M4 | Their rules feed the Wave 1 work packages: personal data and radars as native code, listing reads as the legacy adapter |
| M5 bot (KV-TG tasks) | Wave 1, full parity (DEC-43) |
| M6 ingestion | Wave 2, with `telegram.uz` as the source instead of an in-repo reader (KV-BE-125 is not planned; KV-BE-121 … KV-BE-124 and KV-BE-143 are) |
| M7 landing data and analytics | Landing data and the action log in Wave 1; SEO aggregates in Wave 3 |
| Frontend milestones | FE-1 and FE-2 are the behaviour reference of the Wave 1 screens; FE-3b landing is in Wave 1; FE-3a SEO in Wave 3; FE-4 ARM after Wave 1 |
| 15, reference-client runs against HOMI | Not applicable: the legacy client never runs against HOMI. The golden fixtures of 08 become the contract tests of the legacy adapter |
| 15 §4, the parity gate | Replaced for Wave 1 by the functional checklist per screen and per bot scenario (DEC-46, 25 §9) |
| 18, stages S0–S6, freeze, point of no return, rollback window | Replaced by continuous deployment to staging and production and by per-method flags |
| DEC-01, DEC-05, DEC-07, DEC-15 … DEC-18, DEC-24, DEC-29 | No longer needed |
| DEC-02, DEC-04, DEC-06, DEC-23, DEC-25, DEC-26 | Answered: `telegram.uz`; brand HOMI; DEC-44; DEC-49; open access; own PostHog projects |
| DEC-08, DEC-12, DEC-19, DEC-20 | **Still open and needed inside Wave 1:** the landing's CSP (DEC-08); retention periods (DEC-12); the thresholds of the phone-disclosure quota and the cap on instant cards (DEC-19, DEC-20). Each affected package builds a configurable default and names the decision. DEC-03 (language model) and DEC-21 (support bot) are answered by DEC-55 and DEC-56 |
| DEC-13 (legal basis for personal data) | **Still open and now earlier:** HOMI collects its own users' personal data from the first production deploy (Q-SEC-021) |
| 22 §4 "Never call the production API" | Stands for people, tests, CI and agents. Only HOMI's servers call legacy, with the service key |
| `HANDOFF.md` §4 | T3 (OpenAPI) and T5 (generated client) open Wave 1; T6 (sign-in), T8 (frontend) and T1 (webhook) are inside it; T2 (intake) is Wave 2. Change by a separate shared-file PR |
| `docs/handoff/parallel-work.md` §2, PR size | For Wave 1: one PR per work package, reviewed before merge (DEC-45). Change by a separate shared-file PR |

## 8. Decisions, questions and risks

### 8.1 Decisions

All answered by the developer on 2026-11-14 unless the row says otherwise (DEC-50 … DEC-56 in a second round the
same day, after the verification of the specifications). Verbatim answers:
`decisions/2026-11-14-developer-answers.md`.

| ID | Decision | Answer | Still needs | Shapes |
| -- | -------- | ------ | ----------- | ------ |
| DEC-31 | Order of the migration | Three waves as in section 2 | First developer: ADR review | everything |
| DEC-32 | How the Mini App is moved | Rebuilt from the audit; the recovered legacy code is read as a reference, never copied | — | 25 §3 |
| DEC-33 | Access of people and tools to legacy production | None. Development, tests, CI and agents use stubs; only HOMI servers call legacy with the service key | — | 25 §4 |
| DEC-34 | A launch path on the legacy bot | Not needed: the product has its own bot | — | — |
| DEC-35 | Where the per-method switch lives | In Laravel: a source driver per method, selected by a Pennant feature | First developer: ADR review | section 3 |
| DEC-36 | Legacy client defects | Every `LB` item that is a plain fix is made; every behaviour change — each `DEV` row, including the `LB` items that `09` §4.2 turns into `DEV` rows — is written behind a flag that is off | — | all work packages |
| DEC-37 | Legacy releases during the work | Followed until HOMI no longer depends on legacy: each release is read from its sync report and becomes a queue item | — | 25 §8 |
| DEC-38 | Landing and SEO | Full landing on `homi.uz` in Wave 1; SEO pages in Wave 3 | — | 25 §7 |
| DEC-39 | Data from legacy and listings after legacy | The operator gives a dump and a schema; listings after legacy come from `telegram.uz` | Collector's owner and first developer (DEC-02) | section 5 |
| DEC-40 | Bot, brand and users | A new permanent product under HOMI's bot and brand; the old bot stays on legacy; no user data is moved | Product owner: informed | section 2 |
| DEC-41 | Contract | `/api/v1` from the first day; fixed as Laravel stub routes → OpenAPI → generated types | — | 25 §4 |
| DEC-42 | What legacy supplies | Shared listing data only, live, through a service key the operator adds | Operator (Q-SYS-009) | section 3 |
| DEC-43 | Scope of Wave 1 | Radars with delivery and the bot at full parity are in; the admin panel is out; access is open to everyone | — | 25 §2 |
| DEC-44 | Frontend architecture | App Router with a route per screen; server rendering through a session cookie with a header fallback for Telegram Web; next-intl with the locale in the address; Tailwind 4 with tokens; shadcn/ui and Radix; both map engines; the Next.js default browser floor with an update screen | First developer: ADR review (amends ADR-0013) | 25 §3 |
| DEC-45 | Process | One queue worked in relay by two full-stack developers with agents; order: stubs → frontend → API → bot → landing; one PR per work package, reviewed before merge; every merge deployed to staging and production; checks inside Telegram on those environments; no deadline; KV-BE-002 first | First developer: agrees to the PR size rule and the deploy cadence | `wave-1/README.md` |
| DEC-46 | Proof of "1:1" | Functional parity: the same screens, texts and scenarios; small visual differences are accepted | — | 25 §9 |
| DEC-47 | Analytics | HOMI's own action log and its own PostHog projects per environment | PostHog account and keys | 25 §3.9 |
| DEC-48 | Reports and votes | Stored and applied in HOMI only | — | 25 §5 |
| DEC-49 | Dependencies | Approved as one batch: the map packages, `posthog-js`, `lucide-react`, the test tools, `openapi-typescript`, next-intl, shadcn/ui with Radix | First developer: confirms in the install PR (`docs/handoff/parallel-work.md` §4) | 25 §10 |
| DEC-50 | Stub data on production | A visible "demo data" marker on every screen that still answers from a stub | — | 25 §4.4 |
| DEC-51 | Radars before delivery | Creating and changing radars is switched off (`RADAR_CREATION_ENABLED`) until the bot's sending package is live; the radar tab and the bot say "soon" | Production track: sets the switch after the deploy of WP-57 | 25 §4.2, §5; WP-11, WP-13, WP-30, WP-45, WP-51, WP-57 |
| DEC-52 | The author's phone number | Never sent with the card; masked in texts; given by the counted contact method after a tap. A deliberate difference from legacy (the variant of DEV-007 "after a tap") | Thresholds of the disclosure quota (DEC-19) | 25 §4.1, §4.2; WP-12, WP-26, WP-43, WP-53 |
| DEC-53 | Favourites and history | Paged by 20 with a cursor, like the feed (the paging part of DEV-003; no cap on history) | — | 25 §4.1; WP-13, WP-29, WP-44 |
| DEC-54 | The whole-city label | «{city} целиком», built from the city dictionary, in the Mini App and the bot (DEV-015, this wording) | Proofreading of the uz and en wording (Q-BOT-014) | WP-22, WP-51, WP-54 |
| DEC-55 | Language model for the bot's free-text and voice queries | No fixed vendor: provider and model come from configuration and the team switches them; without a configured provider the bot answers the wizard hint. Answers DEC-03 | Accounts and keys of the providers the team wants to use | 25 §6, WP-55 |
| DEC-56 | Support | HOMI's own support bot; it relays between a user and the private chats of the operators. Answers DEC-21 | Production track: a support bot per environment in BotFather, its token and webhook; the operators' Telegram ids | 25 §6, WP-59 |

### 8.2 Questions

| ID | Question | Check that closes it | Who can answer |
| -- | -------- | -------------------- | -------------- |
| `Q-SYS-009` | Who is the operator's contact, and by when will the operator deliver the service key, the dump and the schema, and later the announcement in the old bot? `UNVERIFIED` | A named contact and dates in writing | Product owner |
| `Q-API-059` | Which limits apply to the service key? Legacy rate limits are unknown (Q-API-001), and HOMI will add load of its own: every user's search plus the radar matcher's polling. `UNVERIFIED` | The operator's numbers; a measured ramp on staging | Operator |
| `Q-API-060` | The service-key contract: header name, which routes it opens, whether it replaces the user's identity entirely. `UNVERIFIED` | The operator's specification; contract tests of the legacy driver | Operator |
| `Q-API-061` | Can production `initData` of the legacy bot be validated without its token? `DEPRECATED_CANDIDATE`: not needed, HOMI has its own bot (DEC-40) | — | — |
| `Q-API-062` | Legacy formats many strings on the server per user locale and currency (CF-017). How does a service-key request choose locale and currency, and which per-user fields (`favorite`, `viewed`) does it still return? `UNVERIFIED` | The operator's specification; if raw values are not available, HOMI formats from what it gets and the gap is listed per field | Operator |
| `Q-API-063` | How does a legacy listing number map to a listing from `telegram.uz`? Candidate key: source channel and post (the legacy deep link carries both, TMA-011). `UNVERIFIED` | A join on the dump once it arrives | Developer (Wave 2 plan) |
| `Q-APP-023` | Effect of the CSS pipeline on copied legacy CSS. `DEPRECATED_CANDIDATE`: the legacy CSS is not copied (DEC-44) | — | — |
| `Q-APP-024` | Which legacy release is the behaviour baseline? The audit describes `index-plF_TOcT.js` (`08-api-inventory.md:11-12`); the legacy tree has since synced `index-Dbpp463V.js` and `index-BNLZFfL0.js` (`$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:5`). `CONFIRMED` drift | Re-baseline 03 and 08 in the first stage of the queue and pin the release | Developer |
| `Q-APP-025` | Who supplies HOMI's own artwork — logo, favicon, mascots, the celebration image, the bot's stickers and welcome picture, the static map image the landing draws its pins on — and when? Legacy artwork is not copied (DEC-32, DEC-40); the work packages use neutral placeholders until it arrives. `UNVERIFIED` | Files handed to the developers; the brand layer and the bot's asset registry updated | Product owner |
| `Q-SEC-021` | HOMI collects personal data of its own users (Telegram identity, search history, phone when an owner verifies) from the first production deploy, and shows phones and photos taken from legacy. Which legal basis, policy text and hosting statement are needed before real users arrive (DEC-13, Q-SYS-008)? `UNVERIFIED` | Lawyer's note; the privacy page of the landing | Product owner |

### 8.3 Risks

| ID | Risk | L | I | Area | Mitigation | Owner | Linked |
| -- | ---- | - | - | ---- | ---------- | ----- | ------ |
| RK-24 | **Wave 2 stalls.** The collector does not push into HOMI yet, the processing chain is large, and listing identities change | H | H | data, backend | Agree with the collector's owner during Wave 1; store channel and post with every personal reference from day one; keep the legacy driver until each method is proven | first developer; developer | DEC-39, Q-API-063, AM-44 |
| RK-25 | **Legacy throttles or blocks the service key** under user traffic and radar polling | M | H | backend | Ask for limits first; cache reference data; group radar polls by identical filters; back off and serve the last good answer | developer | Q-API-059, DEC-42 |
| RK-26 | **The behaviour baseline moves.** The legacy client and its API change every one to three days | H | M | all | Pin a baseline; each legacy release becomes a queue item; the legacy driver has contract tests that fail when the legacy shape changes | developer | DEC-37, Q-APP-024, RK-05 |
| RK-27 | **Stub data is visible to real users on production**, because every merge is deployed and access is open | H | M | product | A visible "demo data" marker driven by the driver flag (confirmed by DEC-50); stub sections are named in the bot's welcome text until they are real | developer | DEC-43, DEC-45, DEC-50 |
| RK-28 | **The service key arrives late or never.** It is a change in legacy, and the operator offered only a dump and a schema | M | H | backend | The frontend and every native part do not wait for it; the listing methods stay on stubs; the fallback is importing dumps into HOMI | product owner | DEC-42, Q-SYS-009, Q-API-060 |
| RK-29 | **Wave 1 is a whole product**: 45 screens, the v1 surface, radars with delivery, 84 bot handlers and the landing, built by two developers in relay | H | M | plan | One ordered queue, one work package per PR, a handoff after every stop; no date pressure (DEC-45) | developer | `wave-1/README.md` |
| RK-30 | **The cookie session fails inside frames** (Telegram Web), or the two session modes drift apart | M | M | frontend | One screen code path with optional server-fetched data; both modes in the end-to-end suite; checked on staging in three browsers | developer | DEC-44, 25 §3.4 |
| RK-31 | **"Functional parity" is judged differently by different people** | M | M | acceptance | A written checklist per screen and per bot scenario, taken from the audit, signed in the PR | developer | DEC-46, 25 §9 |

| RK-32 | **Radars exist before anything delivers them.** The radar package is in stage C and the bot's sending package in stage D, while every merge reaches production and access is open: a user can create a radar that sends nothing | H | M | product | Decided (DEC-51): creating and changing radars is switched off on the servers until the sending package is deployed; the radar tab and the bot say "soon"; one switch turns it on together with matching | developer | DEC-43, DEC-45, DEC-51 |

Risks of 19 that change: RK-02 (data migration), RK-03, RK-04, RK-06 and RK-19 no longer apply; RK-07 (old WebViews)
is accepted by DEC-44; RK-11 (personal data) grows, because HOMI now has users of its own from the first deploy.

## 9. What happens next

1. Review of this document, of 25 and of the queue by both developers (PR #25).
2. ADRs, each as its own small PR, written in the first stage of the queue: the new product and the three waves
   (DEC-31, DEC-40); the v1 facade with source drivers (DEC-35, DEC-41, DEC-42); the Mini App architecture (DEC-44,
   amends ADR-0013); the frontend UI stack (Tailwind tokens, shadcn/ui, next-intl). Next free numbers: 0016–0019.
3. The request to the operator goes out at once: contact, service key and its contract, limits, dump and schema
   (Q-SYS-009, Q-API-059, Q-API-060, Q-API-062).
4. The queue starts with KV-BE-002 (`wave-1/README.md`). It has 45 work packages since DEC-56 added the support bot.
5. The Wave 2 plan is written when the collector's owner has answered and the dump has arrived.
