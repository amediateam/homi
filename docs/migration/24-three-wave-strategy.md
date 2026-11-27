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
| **1. The new product on legacy listings** | Contract stubs, then the Mini App, then the API, then the bot, then the landing (in this order, DEC-45). Personal data, radars and the bot are HOMI's own code; listings, map points, cards, contacts and photos come from legacy through a service key; listings that HOMI's own owners place through the cabinet are HOMI's own data from Wave 1 on and are shown beside the legacy listings (DEC-69, DEC-70) | A complete product a user of the legacy bot would recognise function by function | The functional checklist of every screen and bot scenario passes on production with no method left on a stub (25 §9) |
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
| Listings | feed, count, flow, map, card, contact, translation, photos | legacy with HOMI's per-user overlay, plus HOMI's owner listings merged in (DEC-70) | native |
| Owner listings and contact requests | the owner cabinet (`/owner/*`), `POST /listings/{number}/contact-request` | native (a request on a legacy `gate` listing: relayed through legacy, DEC-71) | native |
| Bot | every update | native | native |
| Landing data | live numbers, pins, snapshots | legacy | native |

**Owner listings are not a fourth driver.** `meta.source` names one driver per answer. HOMI's owner listings are
merged into the answer of whatever driver serves the shared part, the way the per-user overlay is applied to every
driver (WP-86). Each item says where it comes from (`origin`). Moving a listing method back to another driver leaves
the native part as it is.

**How the principles are met.**

- *Rollback:* a method goes back to its previous driver by its flag. Personal data never leaves HOMI, so no write is
  lost when a listing method goes back to legacy. Owner listings never leave HOMI either.
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
  HOMI's owner listings already carry HOMI numbers from a range legacy never uses (WP-80); they need no mapping.

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
| DEC-13 (legal basis for personal data) | **Still open and now earlier:** HOMI collects its own users' personal data from the first production deploy (Q-SEC-021) — and with the owner cabinet also owners' numbers in plain text, photos, true locations and requests (DEC-69, DEC-72) |
| 22 §4 "Never call the production API" | Stands for people, tests, CI and agents. Only HOMI's servers call legacy, with the service key |
| `HANDOFF.md` §4 | T3 (OpenAPI) and T5 (generated client) open Wave 1; T6 (sign-in), T8 (frontend) and T1 (webhook) are inside it; T2 (intake) is Wave 2. Change by a separate shared-file PR |
| `docs/handoff/parallel-work.md` §2, PR size | For Wave 1: one PR per work package, reviewed before merge (DEC-45). Change by a separate shared-file PR |

## 8. Decisions, questions and risks

### 8.1 Decisions

All answered by the developer on 2026-11-14 unless the row says otherwise (DEC-50 … DEC-56 in a second round the
same day, after the verification of the specifications). Verbatim answers:
`decisions/2026-11-14-developer-answers.md`; DEC-57 on 2026-11-19, `decisions/2026-11-19-developer-answers.md`;
DEC-58 … DEC-68 on 2026-11-19, in the round of the intake of `index-CIa0Ldj2.js` (same file); DEC-69 … DEC-80 on
2026-11-19, DEC-81 on 2026-11-20 and DEC-82 … DEC-88 on 2026-11-20 after PR #91, in the rounds of the owner-cabinet
plan (same file); DEC-89 … DEC-94 on 2026-11-20, in the round of the intake of `index-YX9bFVws.js`
(`decisions/2026-11-20-developer-answers.md`); DEC-95 … DEC-97 on 2026-11-20, in the round of the intake of the
legacy landing (`decisions/2026-11-20-landing-answers.md`); DEC-98 and DEC-99 on 2026-11-21, asked by WP-32 and
WP-81 (`decisions/2026-11-21-developer-answers.md`); DEC-100 … DEC-102 on 2026-11-22, asked by WP-33 and at the
handoff of the development track (`decisions/2026-11-22-developer-answers.md`); DEC-103 on 2026-11-23, asked by part 4
of WP-33 (`decisions/2026-11-23-developer-answers.md`); DEC-104 … DEC-108 on 2026-11-26, asked by WP-40, and DEC-109 on
the same day, on how two development sessions share the queue (`decisions/2026-11-26-developer-answers.md`); DEC-110
on 2026-11-27, asked by WP-42, and DEC-111 the same day, asked by WP-43 (`decisions/2026-11-27-developer-answers.md`).

| ID | Decision | Answer | Still needs | Shapes |
| -- | -------- | ------ | ----------- | ------ |
| DEC-31 | Order of the migration | Three waves as in section 2 | First developer: ADR review | everything |
| DEC-32 | How the Mini App is moved | Rebuilt from the audit; the recovered legacy code is read as a reference, never copied | — | 25 §3 |
| DEC-33 | Access of people and tools to legacy production | None. Development, tests, CI and agents use stubs; only HOMI servers call legacy with the service key | — | 25 §4 |
| DEC-34 | A launch path on the legacy bot | Not needed: the product has its own bot | — | — |
| DEC-35 | Where the per-method switch lives | In Laravel: a source driver per method, selected by a Pennant feature | First developer: ADR review | section 3 |
| DEC-36 | Legacy client defects | Every `LB` item that is a plain fix is made; every behaviour change — each `DEV` row, including the `LB` items that `09` §4.2 turns into `DEV` rows — is written behind a flag that is off. Amended on 2026-11-19 (DEC-58): the flag of a behaviour that the pinned legacy release itself has is on by default | — | all work packages |
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
| DEC-53 | Favourites and history | Paged by 20 with a cursor, like the feed (the paging part of DEV-003; no cap on history). Since legacy release `index-CIa0Ldj2.js` favourites are paged in legacy too; history is not | — | 25 §4.1; WP-13, WP-29, WP-44 |
| DEC-54 | The whole-city label | «{city} целиком», built from the city dictionary, in the Mini App and the bot (DEV-015, this wording) | Proofreading of the uz and en wording (Q-BOT-014) | WP-22, WP-51, WP-54 |
| DEC-55 | Language model for the bot's free-text and voice queries | No fixed vendor: provider and model come from configuration and the team switches them; without a configured provider the bot answers the wizard hint. Answers DEC-03 | Accounts and keys of the providers the team wants to use | 25 §6, WP-55 |
| DEC-56 | Support | HOMI's own support bot; it relays between a user and the private chats of the operators. Answers DEC-21 | Production track: a support bot per environment in BotFather, its token and webhook; the operators' Telegram ids | 25 §6, WP-59 |
| DEC-57 | Card styles of the bot's listing cards (2026-11-19) | Both styles ship in Wave 1: `classic` and `rich`, with `rich` built from the legacy mock-ups (`03` SCR-048). No «Новое» pill: HOMI does not announce `cards`, so `GET /reference` keeps `features: ["pets"]` and the legacy driver does not pass the code on | The operator's answers to Q-API-067 and Q-BOT-046, asked in parallel | `25` §4.2; WP-11, WP-31, WP-40, WP-41, WP-53, WP-57 |
| DEC-58 | Deviations that legacy adopted in `index-CIa0Ldj2.js` (2026-11-19) | The flags stay, with both branches tested; their defaults become on: the failure toast (DEV-016, the error half), history dates in Asia/Tashkent (DEV-014), the undo of «Уже сдано» (DEV-051), «С животными» only for long-term rent (DEV-017, the pets half) and the realtor-vote toast by `agent_marked` (DEV-010, the toast half). A half that legacy did not adopt keeps a flag of its own, off; this split of DEV-010, DEV-016 and DEV-017 into two flags each, and the names of the three new flags, are the integrator's reading of «флаги оставить». Amends DEC-36 for these: a flag's default follows the pinned release | — | `09` §4.2; `25` §2; WP-23, WP-25, WP-26, WP-30, WP-31, WP-33, WP-34, WP-35 |
| DEC-59 | Daily limit on opening listings (2026-11-19) | The screen «Лимит на сегодня» is built; the contract marks the case as `429 rate_limited` with `reason: "daily"`; HOMI gets its own per-user daily cap on opening listings; the legacy driver turns legacy's `429 too many today` into the same answer | The operator on whether legacy counts per service key (`02` Q-API-080, RK-25); the threshold of HOMI's cap is answered by DEC-104, DEC-105 and DEC-107 (Q-API-085, built by WP-40) | `25` §4.1, §4.5; WP-10, WP-12, WP-26, WP-36, WP-40, WP-41, WP-42 |
| DEC-60 | The `paused` state (2026-11-19) | The sixth access reason `paused` and its screen exist now; the server switch that pauses the product is specified in WP-40 and is off by default | Production track: sets the switch if a pause is ever needed | WP-11, WP-23, WP-36, WP-40, WP-41 |
| DEC-61 | Launch link `?radar=<id>` (2026-11-19) | Specified now, built with the bot packages: the bot's link builder and its button, and the Mini App's reading of the link, in one piece of work. Not part of the catch-up packages | `04` Q-BOT-050: does the legacy bot send such links, and from which message | WP-21, WP-30, WP-52, WP-55, WP-57 |
| DEC-62 | «Площадь» for rent (2026-11-19) | A filter of every deal, as in legacy since `index-CIa0Ldj2.js`: the sheet shows the section, the server keeps `area_min` / `area_max` for every deal, and a rent radar may carry an area | The operator: does the legacy server apply the range to rent (`02` Q-API-082) | WP-12, WP-25, WP-35, WP-42, WP-45 |
| DEC-63 | The search feed across tabs (2026-11-19) | Next's route cache stays (it keeps up to three routes); HOMI adds a scroll memory per list key instead of a feed that is always mounted | A measurement on staging of how often the list is lost (Q-APP-030) | WP-23, WP-24, WP-38 |
| DEC-64 | The radar sheet under a listing (2026-11-19) | HOMI keeps its instant re-open instead of legacy's parked mount, and restores the strip's sideways scroll and the sheet's own scroll | — | WP-30, WP-38 |
| DEC-65 | A sale listing opened by a launch link over a rent feed (2026-11-19) | The feed below becomes the sale defaults of the feed's own city when that listing closes (legacy switches it while the listing is open). The developer confirmed the feed's city on 2026-11-20 («Город ленты, как в legacy (Recommended)»); the option first shown had said «in the listing's city» | — | WP-21, WP-26, WP-38 |
| DEC-66 | Collapsed title of daily rent (2026-11-19) | As legacy since `index-CIa0Ldj2.js`: the summary alone, no deal word in front. Amends D-SH-3 of WP-23 | — | WP-23, WP-35 |
| DEC-67 | «Смотрели» after a listing was opened (2026-11-19) | HOMI keeps what it built: the list is re-created once when the user returns to it after opening a listing. A recorded deviation from legacy since `index-CBlEKxdL.js` (DEV-053), on without a flag, like DEC-52 … DEC-54 | — | `09` §4.2; `25` §2; WP-29, WP-33; `wave-1/baseline.md` |
| DEC-68 | What `DELETE /listings/{number}/reports` withdraws (2026-11-19) | Only «Уже сдано»: the caller's `rented` vote and the hidden row it made. Reports with another reason stay. A repeat answers `204` | — | `25` §4.2; WP-13, WP-26, WP-34, WP-44 |
| DEC-69 | The owner cabinet «Сдать квартиру» (2026-11-19) | In Wave 1. The cabinet of legacy release `index-CBlEKxdL.js` is reproduced: the owner side (`03` SCR-049 … SCR-060, `08` API-037 … API-053, `04` BOT-086 … BOT-091) and the seeker side (SCR-061, SCR-062, API-054). Functional parity (DEC-46) applies; the cabinet's own deviations are on by DEC-74 and DEC-80. Not the recommended option, which was Wave 2 | The gates of `25` §5 before real owners use it (DEC-81) | `24` §2, §3; `25` §1, §3.2, §4, §5, §6, §9, §12, §14; WP-80 … WP-89 |
| DEC-70 | Where HOMI owners' listings live (2026-11-19) | In HOMI's own tables (native), shown in the feed, on the map and as cards beside the listings read from legacy: one merge step after the driver of the shared part, numbers from a range legacy never uses. They are the first listing data HOMI owns in Wave 1 | Q-SEC-021 (real owners' data) | `24` §2, §3, §5; `25` §4.1 … §4.5, §5; WP-80, WP-84, WP-86 |
| DEC-71 | A seeker's request on a legacy owner listing in `gate` mode (2026-11-19) | Relayed to the operator through the service key. Planned now (WP-87), the operator asked in parallel (points 14 – 21 of `decisions/2026-11-14-operator-request.md`); until the relay works DEC-75 applies. Not the recommended option (ask the operator and hide such listings meanwhile) | The operator (Q-API-087 … Q-API-089); Q-SEC-021 (the seeker's data passed to the operator) | `25` §4.2, §4.5; WP-80, WP-87 |
| DEC-72 | The owner's phone number (2026-11-19) | Stored in plain text with the owner listing, as legacy does. Shown to the owner himself; given to a seeker only through `ContactService::disclose()` — `POST /listings/{number}/contact` or the bot's «📞 Показать номер» (DEC-52). `/owner` of the bot keeps its keyed hash (DEV-011; not asked). Not the recommended option (the number encrypted with its own key in a separate table) | Q-SEC-021; the security review of WP-70 (`16` SEC-036, SEC-REQ-051) | `25` §4.1, §5, §6; `16` SEC-036; WP-84, WP-88, WP-70 |
| DEC-73 | Moderation of HOMI owners' listings (2026-11-19) | Post-moderation: automatic checks at publish, then the listing is active at once. HOMI's report votes and the operators can take it down later; each publication reaches the operators with a «Снять» button (the answer: «каждая публикация приходит в чат операторов»). *Integrator defaults, listed for the reviewer:* the notice goes to each operator's private chat from HOMI's main bot (default 10); every publication is announced, also the one after a released hold, and at most once an hour per listing a change of an active listing's photos or description (default 25); a positive automatic check or a vote threshold holds the listing for the operators instead of rejecting or withdrawing it (default 26; that the hold waits for an operator is DEC-83) | The operators' Telegram ids (production track, before DEC-81's switch-on) | `25` §5; WP-84, WP-89 |
| DEC-74 | The cabinet's deviations from legacy (2026-11-19) | On by decision, without flags, like DEC-52 … DEC-54 and DEC-67: DEV-054 … DEV-061 (the question numbered them DEV-053 … DEV-060, before DEV-053 went to DEC-67). Amends DEC-36 for these rows. On 2026-11-20 the developer confirmed DEV-060's reading (answer 17, «Только после «нет ответа» (Recommended)»): one new request after no answer (`expired`), not after a decline | — | `09` §4.2; `25` §2; WP-81, WP-82, WP-83, WP-84, WP-85 |
| DEC-75 | A legacy owner listing that hides its number, while the relay does not work (2026-11-19) | Shown in the feed and on the map; its card has no contact action and a neutral bar instead (for example «Хозяин скрыл номер — связаться через HOMI пока нельзя»). Also the answer if the operator refuses the relay | The product owner approves the words | WP-42, WP-80, WP-83 |
| DEC-76 | What an owner sees of a HOMI seeker (2026-11-19) | The seeker's Telegram first name, read from the signed launch data at the time of the request, stored with the request and erased with it; the request sheet says that the owner will see it. The same first name goes to the operator with a relayed request (DEC-71) | Q-SEC-021; the operator's answer to point 15 (Q-API-087) | WP-40, WP-80, WP-83, WP-85, WP-87 |
| DEC-77 | «Проверенный хозяин» on a HOMI owner listing (2026-11-19) | The chip means that the owner confirmed his own number with Telegram. HOMI runs its own realtor check at publish: the limit per phone, the number's keyed hash against the author keys HOMI saw on legacy cards (WP-42), and HOMI's realtor votes (DEC-48); a positive check holds the listing for the operators and never tells the owner why (default 26). The info sheet says what is checked instead of legacy's «этот номер не встречается в объявлениях риелторов». The operator is not asked | The product owner approves the reworded info-sheet text; the review of a rule that labels people (`16` SEC-REQ-045, WP-70) | WP-80, WP-83, WP-84, WP-70 |
| DEC-78 | Market verdict and usual price of HOMI owner listings (2026-11-19) | HOMI harvests the medians of the `comparison` block of the legacy cards it reads (by city, district, rooms and deal) and asks the operator for a median read. Wherever a harvested median exists an owner listing has the verdict, «Не дороже рынка» and the `deal` sort, and the form shows the usual price; sparse at first. Not the recommended option (none until the operator answers) | The operator (Q-API-090) | `25` §5, §9; WP-84, WP-86 |
| DEC-79 | City and district of the place picker (2026-11-19) | From HOMI's own city and district boundaries in PostGIS, loaded from an open source with its attribution (`UNVERIFIED` until checked, Q-DATA-051); the owner types the landmark; no street address. Needs PostGIS in the production database | Production track: PostGIS in `homi_db` before the deploy of WP-84 (`docs/infrastructure/deployment.md:140`); the boundary source (Q-DATA-051) | WP-80, WP-81, WP-84 |
| DEC-80 | Editing a published listing (2026-11-19) | Every save is live at once, as in legacy; the last button of the form reads «Готово», not «Сохранить изменения» (DEV-062, on without a flag) | — | `09` §4.2; WP-81, WP-84 |
| DEC-81 | The cabinet on the servers before it is ready (2026-11-20) | A server switch `OWNER_CABINET_ENABLED`, off by default, like `RADAR_CREATION_ENABLED` (DEC-51). While it is off, creating a draft and publishing are refused, there is no settings group «Сдаю квартиру», and removing, pausing, «Сдано» and answering a request always work. The server's details are the plan's reading, listed for the reviewer: the server also refuses the phone request, resuming a paused listing and every content edit with `403 owner_disabled`, and keeps reads, deleting a draft or a rejected listing, the waitlist, place and demand open; `GET /reference` says `owner_enabled: false`; the Mini App ignores an owner launch. The developer confirmed on 2026-11-20 (answer 15, ««Мои объявления» для хозяев (Recommended)») that the Mini App shows a user who has listings the group with «Мои объявления» alone, so that the actions that always work stay reachable (WP-80, WP-82) | Production track: switches it on after the bot packages (WP-88, WP-89) and the gates of `25` §5; on staging first for WP-89's checks (DEC-88) | `25` §4.2, §5; WP-80, WP-81, WP-82, WP-84, WP-89 |
| DEC-82 | The realtor waitlist (2026-11-20) | `PUT /owner/waitlist` and `me.owner.waitlisted` of `GET /me` stay in the contract; the Mini App offers no entry to the waitlist in Wave 1, since HOMI rejects nobody as a realtor (default 26); whether and where to offer one is decided later. Not the recommended option, which was to take the waitlist out of Wave 1 («Убрать из Wave 1») | The later decision on an entry and on the broadcast «когда откроем» (BOT-091, Q-BOT-049) | WP-80, WP-81, WP-84, WP-88, WP-89 |
| DEC-83 | A hold that no operator acts on (2026-11-20) | A held native listing stays held until an operator decides (`owner:release`, `owner:withdraw`, `owner:deny-phone`); there is no automatic release. The operators get a reminder after 24 h while the hold is undecided | The operators' Telegram ids (as DEC-73) | WP-84, WP-89 |
| DEC-84 | The demand count of the owner form (2026-11-20) | `GET /owner/demand` gives the exact count of matching radars from 5; for 1 … 4 it gives a "few" mark and no number, which the form shows as «несколько человек»; 0 hides the line. A visible change from legacy, which gives the exact count: DEV-063, on by this decision without a flag | The product owner approves the full sentence | `09` §4.2; WP-80, WP-81, WP-84 |
| DEC-85 | A seeker whom an owner closed his requests to (2026-11-20) | After the owner's `reason_agent` or `late`, the seeker's requests on that owner's listings answer `409 request_closed`, the same answer as for a let flat, as legacy answers `closed` (BR-API-181, BR-API-185); he is not told why. Confirms PR #91 | — | WP-80, WP-83, WP-85, WP-70 |
| DEC-86 | «Это риелтор» on HOMI owners' listings in the bot (2026-11-20) | Offered on the bot's card of a native listing as in the Mini App; a vote from the bot counts like the Mini App's, and its threshold holds the listing for the operators (`votes_agent`, default 26). Legacy offers it on every card (BTN-041), so this is parity, not a deviation; DEV-010's rule in the bot, behind `bot.dev010` (off), hides it on `owner_verified` cards and does not apply to native cards (DEC-77) | — | `09` §4.2; WP-53, WP-84, WP-89 |
| DEC-87 | The owner's consent text (2026-11-20) | The consent text of the cabinet — the owner's number kept in plain text and given on «Дать номер», the public photos, the seeker's first name shown to the owner — is approved by the lawyer before the production switch-on of DEC-81, and marked "pending legal review" until then. It is part of the legal gate (Q-SEC-021, `25` §5 gate 1) | The lawyer (Q-SEC-021) | `25` §5; `16` SEC-REQ-050; WP-81, WP-83, WP-84, WP-89, WP-70 |
| DEC-88 | The staging switch-on before the legal gate (2026-11-20) | DEC-81's switch goes on on staging for the checks of WP-89 before the legal gate closes: only staff accounts (`OWNER_CABINET_ALLOWED_IDS`), the written consent of each of them, their data erased after the checks, and the leak protections (`25` §5 gate 5) deployed first. Turns default 22 of the owner-cabinet plan into a decision | Production track: the staff accounts, and the consents and the erasure recorded in WP-89's PR | `25` §5; `16` SEC-REQ-051, SEC-REQ-053; WP-81 … WP-84, WP-88, WP-89 |
| DEC-89 | The owner invitations before the cabinet is on (2026-11-20) | Legacy `index-YX9bFVws.js` invites to the cabinet from the end of the search feed, under the empty search feed and on the listing card (`03` BR-APP-115), and offers «Отправить хозяину» in the «Нашли жильё?» survey (BR-APP-116), with no gate. HOMI shows all of them only while the cabinet is on (`owner_enabled` of `GET /reference`, DEC-81); while it is off nothing of them renders and nothing is requested (DEV-066, LB-APP-088) | — | `03` BR-APP-115, BR-APP-116; `09` DEV-066, F-OWNER-010, F-OWNER-011; WP-82 |
| DEC-90 | The end of the search feed (2026-11-20) | «Это всё по вашему поиску» (`feed.end`) shows at the end of the search feed whenever the feed is loaded to its end with at least one card and no few-results note, also while the cabinet is off; legacy shows it only inside the invitation block (DEV-064, LB-APP-089). With the cabinet on, WP-82 adds the invitation row under it | — | `03` SCR-007, BR-APP-115; `09` DEV-064; WP-39, WP-82 |
| DEC-91 | «Отправить хозяину» without an owners' landing page (2026-11-20) | The survey's landlord block «Съезжаете со старой квартиры?» has two buttons: «Отправить хозяину» shares legacy's text with the link to HOMI's owners' landing page, and a second button shares a HOMI text with the bot link (`start=owner_new`, WP-88). Until the page exists the block has one button, «Отправить хозяину», with the bot link (one button is the answer; that it carries the bot link is the integrator's reading). The second button's label and text are HOMI's own in three languages (DEV-065). The page is added to WP-61; where its content comes from: DEC-97 (*corrected by the landing intake: the legacy landing sync downloads no backend-rendered page, so a sync cannot bring this one*) | — (the landing intake: DEC-97) | `03` BR-APP-116; `05` TMA-048; `09` DEV-065, F-OWNER-011; WP-61, WP-82, WP-88 |
| DEC-92 | Upload progress of the owner's photos (2026-11-20) | As in legacy: a ring with the percent on each uploading tile, the waiting pulse and the 1.5 s tick (`03` BR-APP-119). WP-81 chooses a transport that reports upload progress instead of the Server Action it specified (`03` Q-APP-031) | WP-81: the transport | `03` BR-APP-119, Q-APP-031; WP-81 |
| DEC-93 | The motion of `index-YX9bFVws.js` on built screens (2026-11-20) | Everything is ported: the leave of sheets, sub-pages and toasts, the rolling numbers, the save phases of the radar sheets, the favourite heart and burst, the countdown ring of action toasts, the segmented thumb, the changed curves and the survey's «Поздравляем!» step. One catch-up package, WP-39 (rows 44 – 54 of `wave-1/baseline.md`). Lite graphics follow legacy (the integrator's reading of «Всё»; LB-APP-086 stays a proposal) | — | `03` BR-APP-112 … BR-APP-118, BR-APP-121; WP-39 |
| DEC-94 | When the listing card invites an owner (2026-11-20) | `owner_entry` of the listing card (`owner.entry` in HOMI's contract, WP-80) is true for a listing posted by an owner (not a realtor) that is not the viewer's own, and false while the cabinet is off (that last part is the integrator's reading of DEC-89). The server sets it: WP-80 on stubs, then the per-user overlay of WP-42 on legacy and native cards alike (WP-86 builds the native card). Legacy's own rule is open in legacy's documents (`$KVADRO_ROOT/docs/api.md` §14, question 19, r38) | — | `03` BR-APP-115; `08` the listing card; WP-80, WP-42, WP-86 |
| DEC-95 | The showcase «Квартиры прямо сейчас» of the landing (2026-11-20) | WP-61 builds the whole showcase of legacy landing release `67b3942a8340`: «Снять / Купить», the search form with its phone sheet, the row of the ten freshest listings, the Tashkent districts with counts and the lead line. Legacy leads every link of it to its SEO pages; HOMI has none before Wave 3 (DEC-38), so a card opens the listing in HOMI's Mini App (`startapp=l_<number>-web`, as the live-map pins, WP-60) and the search form and the district links open the Mini App's feed with that filter through a new launch parameter (HOMI's own, DEV-067). The Mini App side is the new package WP-62; the district counts come from `GET /landing/live` → `showcase`, added to the contract on stubs by the landing intake | — | `03b` LND-065, BR-LND-024 … BR-LND-027; `09` DEV-067, F-LANDING-012; WP-60, WP-61, WP-62 |
| DEC-96 | The language of the landing's `/` (2026-11-20) | As legacy since landing release `d9bbbc696337`: `/` without `?lang=` and without a stored choice is Russian; a browser whose languages resolve to uz or en (BR-LND-004's rule) sees the hint bar «Oʻzbek tilida ochish · Open in English» with links to `/uz/` and `/en/`, hidden once a language is chosen in the menu. `?lang=` and a stored choice still lead to `/uz/` or `/en/` (HOMI redirects; legacy translates in the page). The redirect by the browser language is dropped; DEV-038 becomes the default and its flag is removed | — | `03b` LND-067, BR-LND-004, BR-LND-029; `09` DEV-038, F-LANDING-006; WP-61 |
| DEC-97 | Where the owners' page «Сдать квартиру» comes from (2026-11-20) | It waits for legacy until WP-61 starts. Legacy's Mini App links `/sdat-kvartiru/` (uz `/uz/kvartira-ijaraga-berish/`, en `/en/list-your-apartment/`) with `?s=tenant`, but legacy's own backend checklist lists the page as not done and its landing sync never downloads a backend-rendered page. When WP-61 starts: if legacy's page is known (its documents, or the developer brings it), WP-61 describes the page from it; otherwise WP-61 writes HOMI's own page. Until the page exists the survey's landlord block has one button with the bot link (DEC-91) | Landing intake, Q-LND-012 | `03b` LND-068, URL-066, Q-LND-012; `09` F-LANDING-013; WP-61, WP-82 |
| DEC-98 | How the `@analytics` end-to-end run of WP-32 runs in CI (2026-11-21) | As a further step of the existing e2e job, like the `@radars-off` run: the web server builds the app again with a fake PostHog key and an unroutable host the specs answer themselves; no job of its own (Actions minutes). «Внутри текущей e2e (Рекомендуется)» | — | WP-32 |
| DEC-99 | How WP-81, about 8 000 changed lines, is shipped (2026-11-21) | One pull request; the specification's rule that the upload progress goes into a pull request of its own above 3 000 lines is not followed and the deviation is written in its "As built": since DEC-92 the progress transport is the only upload path of the photos. «Один PR, отклонение записать (Рекомендуется)» | — | WP-81 |
| DEC-100 | When the extra end-to-end runs of WP-33 start (2026-11-22) | Only by hand, through `workflow_dispatch` of `frontend-e2e.yml`, with no schedule: the projects of other clients (WebKit/iOS, desktop, Telegram 6.0, the uz/en render, the dark theme) and the performance run. Every PR gets only the cheap checks — the bundle check and the chunk rules of the performance budget (rows 3–6) — as steps of the existing e2e job. «По запросу, без расписания (Рекомендуется)» | — | WP-33 |
| DEC-101 | How header mode runs in CI (2026-11-22) | In every PR, as WP-33's specification asks: the project `miniapp-header` runs every test that does not name its mode (a spec that loops over the two modes names it in the title and runs both in `miniapp-cookie`). Asked twice: the first answer («Полный — вручную, в PR — подмножество») rested on a wrong estimate of the cost, which is about 2 minutes, not a doubling. «Весь набор в каждом PR (Рекомендуется)» | — | WP-33 |
| DEC-102 | When WP-40 starts, given that WP-33 waits for the production track after its part 4 (2026-11-22) | Right after part 4 of WP-33 is merged. WP-40 does not wait for steps 14–17 of WP-33 (staging, the pass inside Telegram), although rule 1 of the queue and "Exit to stage C" make a package wait for the ones it depends on. A defect that the pass finds is fixed ahead of the queue (step 16). «Сразу после части 4 (Рекомендуется)» | — | WP-33, WP-40 |
| DEC-103 | Where the timing limits of WP-33's performance budget (rows 7–9) come from (2026-11-23) | From the first manual `full` run on GitHub's runner, done together with the run before the pass inside Telegram (steps 14–15), not from a run of its own; part 4 is merged with the values of the developer's Mac marked provisional, which the check prints but does not fail, and a small PR writes the runner's values. «Позже, перед шагами 14–15» | the manual run before steps 14–15 | WP-33 |
| DEC-104 | The threshold of HOMI's own daily cap on opening full listing cards (2026-11-26) | 100 a day per user to start. The number is configuration, `config('rate_limits.listing_opens_per_day')` from `RATE_LIMIT_LISTING_OPENS_PER_DAY` (default 100; a value that is not a positive whole number means 100), so the production track changes it without a release; it is measured on staging and production and then tightened. Over it the card answers `429 rate_limited` with `reason: "daily"` and `Retry-After` (DEC-59). With DEC-105 and DEC-107 it answers Q-API-085. «100 в сутки» | The count of listings opened per user per day, measured on staging and production before the value is tightened | WP-40 |
| DEC-105 | Whether the preview form counts in the daily cap (2026-11-26) | It does not: only the full card of `GET /listings/{number}` counts; `?preview=1` (the map selection, the listing layer before the full card) still answers after the cap and stays under the per-minute limiter `v1-listing` (120 a minute) only. «Не считать preview (Рекомендуется)» | — | WP-40 |
| DEC-106 | Whether team accounts pass a pause (2026-11-26) | They do: while `ACCESS_PAUSED` is on (DEC-60), a user with `users.is_team` passes the gate, so the team can check production before the pause is lifted; `blocked` still wins over it, and `is_team` gives no other privilege at the gate (the task `KV-BE-009` made team accounts not special; that stands except for the pause). «Команда проходит паузу (Рекомендуется)» | — | WP-40 |
| DEC-107 | What the daily cap counts (2026-11-26) | Distinct listings: 100 different full cards per user in 24 hours. Re-opening a card already counted in the window (favourites, «Повторить», Back) is free, also after the cap is reached; only a card answered `200` counts, so a missing listing or an error costs nothing. The window is 24 hours, not the calendar day (legacy: «За сутки открыто очень много объявлений», "in the past 24 hours"); as built it is fixed: it starts at the first counted card, lasts 24 hours and does not slide (WP-40 "As built"). «Разные объявления (Рекомендуется)» | — | WP-40 |
| DEC-108 | Whether the end-to-end job runs on backend changes (2026-11-26) | Yes, on the backend's code: `backend/app`, `bootstrap`, `config`, `routes`, `database/migrations`, `resources/fixtures`, `composer.lock` and `.env.example` are paths of `frontend-e2e.yml`'s `pull_request` trigger, because the API the job boots comes from the PR's tree and, since WP-40, its boot checks, stub mode and gate decide whether the app works; a documentation-only PR does not run it. «Да, на код бэкенда (Рекомендуется)» | — | WP-40 |
| DEC-109 | How two development sessions share the queue (2026-11-26) | The first session keeps the queue's order (WP-41 and the rest of stage C's backend); the second takes the package `.ai/memory/session-handoff.md` assigns to it — WP-62 first, frontend only — as an exception to rule 1, and asks the developer for the next one. Its prompt is `docs/handoff/second-developer-prompt.md`; it does not rewrite the session handoff (KI-20), merges `main` into its branch, and numbers as `docs/handoff/parallel-work.md` §5 says after checking the other session's open PRs. «да, обнови промпт под WP-62» | — | WP-41, WP-62, the queue |
| DEC-110 | How long a page of previews may wait for the legacy limiter (2026-11-27) | Up to 4 s for the whole batch (`legacy.previews.max_wait_ms`), an exception to WP-41's 0.5 s for user calls, so a cold page of 20 personal-list cards loads at the default 5 calls a second; a number legacy answered `404` is left out, any other miss makes the call `503 source_unavailable` — no favourite vanishes silently. «Ждать до 4 с, без пропусков (Рекомендуется)» | The operator's real rate (Q-API-059) shortens the wait | WP-42, WP-44 |
| DEC-111 | Where the texts of HOMI's call page live (2026-11-27) | A new folder `backend/lang/` (Laravel's default translation path) with `ru`, `uz`, `en` and `call.php` in each; later server-side texts (bot, mails) go there too | WP-43 |

### 8.2 Questions

| ID | Question | Check that closes it | Who can answer |
| -- | -------- | -------------------- | -------------- |
| `Q-SYS-009` | Who is the operator's contact, and by when will the operator deliver the service key, the dump and the schema, and later the announcement in the old bot? `UNVERIFIED` | A named contact and dates in writing | Product owner |
| `Q-API-059` | Which limits apply to the service key? Legacy rate limits are unknown (Q-API-001), and HOMI will add load of its own: every user's search plus the radar matcher's polling. Legacy release `index-CIa0Ldj2.js` shows a daily cap on opening listings (`02` BR-API-193, Q-API-080): if it counts per service key, all of HOMI's users share it. `UNVERIFIED` | The operator's numbers; a measured ramp on staging | Operator |
| `Q-API-060` | The service-key contract: header name, which routes it opens, whether it replaces the user's identity entirely. `UNVERIFIED` | The operator's specification; contract tests of the legacy driver | Operator |
| `Q-API-061` | Can production `initData` of the legacy bot be validated without its token? `DEPRECATED_CANDIDATE`: not needed, HOMI has its own bot (DEC-40) | — | — |
| `Q-API-062` | Legacy formats many strings on the server per user locale and currency (CF-017). How does a service-key request choose locale and currency, and which per-user fields (`favorite`, `viewed`) does it still return? `UNVERIFIED` | The operator's specification; if raw values are not available, HOMI formats from what it gets and the gap is listed per field | Operator |
| `Q-API-063` | How does a legacy listing number map to a listing from `telegram.uz`? Candidate key: source channel and post (the legacy deep link carries both, TMA-011). `UNVERIFIED` | A join on the dump once it arrives | Developer (Wave 2 plan) |
| `Q-APP-023` | Effect of the CSS pipeline on copied legacy CSS. `DEPRECATED_CANDIDATE`: the legacy CSS is not copied (DEC-44) | — | — |
| `Q-APP-024` | Which legacy release is the behaviour baseline? The audit of 2026-11-09 described `index-plF_TOcT.js` (`08-api-inventory.md:19-20`); three releases followed: `index-Dbpp463V.js`, `index-BNLZFfL0.js` and `index-DY_DH7h-.js` (`$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:5-61`). **Answered by WP-02 on 2026-11-14:** the baseline is `index-DY_DH7h-.js` (`demo/app` at SVN r27), pinned in `wave-1/baseline.md`, and the audit describes it. The intake of 2026-11-19 moved the pin to `index-BnFvC-Ft.js` (SVN r29), and the intake of `index-CBlEKxdL.js` moved it to that release (SVN r31), and the intake of `index-CIa0Ldj2.js` moved it to that release (source at SVN r33). `CONFIRMED` | The pin in `wave-1/baseline.md`; each later release is a row of its intake log | Developer |
| `Q-APP-025` | Who supplies HOMI's own artwork — logo, favicon, mascots, the celebration image, the bot's stickers and welcome picture, the static map image the landing draws its pins on — and when? Legacy artwork is not copied (DEC-32, DEC-40); the work packages use neutral placeholders until it arrives. `UNVERIFIED` | Files handed to the developers; the brand layer and the bot's asset registry updated | Product owner |
| `Q-SEC-021` | HOMI collects personal data of its own users (Telegram identity, search history, the phone hash of an owner who verifies with `/owner`) from the first production deploy, and shows phones and photos taken from legacy. With the owner cabinet (DEC-69) it also stores an owner's number in plain text (DEC-72), the listing's photos and true location, the requests between seekers and owners with the seeker's first name (DEC-76), and passes a seeker's request to the operator (DEC-71). Which legal basis, policy text and hosting statement are needed before real users arrive (DEC-13, Q-SYS-008)? `UNVERIFIED` | Lawyer's note; the privacy page of the landing | Product owner |
| `Q-API-085` | Which threshold does HOMI's own per-user daily cap on opening listings get (DEC-59), and does the preview form count? **Answered on 2026-11-26 (DEC-104, DEC-105, DEC-107), built by WP-40:** 100 different full cards per user in 24 hours, from `RATE_LIMIT_LISTING_OPENS_PER_DAY`; the preview is not counted; a card already counted in the window opens again for free. Legacy's numbers are unknown (`02` Q-API-080). `CONFIRMED` | The value in configuration (DEC-104); the count of listings opened per user per day is measured on staging and production before it is tightened | Developer |
| `Q-API-086` | Which cap and which order does HOMI's own map answer use once the method is no longer a stub (`with_point` larger than the points)? Legacy cuts to "the newest" at an unknown size (`02` Q-API-015). `UNVERIFIED` | WP-42 decides with the legacy answer in hand; until then only the stub scenario `map_cut` and the legacy driver produce a cut answer | Developer |
| `Q-APP-030` | How often does a user lose the loaded search list because Next keeps at most three routes (four tabs and the map), and is the scroll memory per list key enough (DEC-63)? `UNVERIFIED` | A walk over all tabs and the map on staging in a Telegram WebView, and a counter of first-page reads per return, before the pass of WP-33 | Developer |
| `Q-API-087` | May the service key send a seeker's request on a legacy owner listing in `gate` mode (DEC-71): under which per-user identity, with the seeker's Telegram first name (DEC-76), on which legal basis on the operator's side, kept how long, and erased how when a HOMI user deletes his data? `UNVERIFIED` | The operator's written answer to points 14 and 15 of the addendum (`decisions/2026-11-14-operator-request.md`) | Operator |
| `Q-API-088` | How does HOMI learn the owner's answer to a relayed request, and on `given` the number or a call link for that user? Which statuses and which expiry, and may a user ask again after `expired` or `declined`? `UNVERIFIED` | The operator's answer to point 16; a recorded fixture of each status | Operator |
| `Q-API-089` | What does the owner see of a HOMI request; how is an owner who turned out to be a realtor reported; what triggers `blocked` and `harvest`, can they hit the service key as a whole, and are the request limits counted per person or per key? `UNVERIFIED` | The operator's answers to points 17, 18 and 19 | Operator |
| `Q-API-090` | Can the service key read the market medians legacy uses for "below market", by city, district, rooms and deal, with the number of listings and the date of each (DEC-78)? `UNVERIFIED` | The operator's answer to point 22 (b) | Operator |
| `Q-DATA-051` | Which open source of city and district boundaries of Uzbekistan does HOMI load into PostGIS for the place picker (DEC-79), under which licence and attribution, and does each of its districts match exactly one district code of the reference data? `UNVERIFIED` | WP-84 loads the candidate on staging, maps every district code of `GET /reference` to one polygon, and records the licence and the attribution text | Developer |

### 8.3 Risks

| ID | Risk | L | I | Area | Mitigation | Owner | Linked |
| -- | ---- | - | - | ---- | ---------- | ----- | ------ |
| RK-24 | **Wave 2 stalls.** The collector does not push into HOMI yet, the processing chain is large, and listing identities change | H | H | data, backend | Agree with the collector's owner during Wave 1; store channel and post with every personal reference from day one; keep the legacy driver until each method is proven | first developer; developer | DEC-39, Q-API-063, AM-44 |
| RK-25 | **Legacy throttles or blocks the service key** under user traffic and radar polling. Since `index-CIa0Ldj2.js` legacy has a daily cap on opening listings (`429 too many today`) whose counted identity is unknown | M | H | backend | Ask for limits first; cache reference data; group radar polls by identical filters; back off and serve the last good answer. HOMI's own per-user daily cap (DEC-59); the driver turns the legacy answer into `429 rate_limited` with `reason: "daily"` and does not open the breaker for it | developer | Q-API-059, DEC-42, DEC-59, Q-API-080 |
| RK-26 | **The behaviour baseline moves.** The legacy client and its API change every one to three days | H | M | all | Pin a baseline; each legacy release becomes a queue item; the legacy driver has contract tests that fail when the legacy shape changes; built screens that a release changes are listed in `wave-1/baseline.md` ("Built code behind the pin") and closed by catch-up packages (first: WP-34 … WP-38) | developer | DEC-37, Q-APP-024, RK-05 |
| RK-27 | **Stub data is visible to real users on production**, because every merge is deployed and access is open | H | M | product | A visible "demo data" marker driven by the driver flag (confirmed by DEC-50); stub sections are named in the bot's welcome text until they are real | developer | DEC-43, DEC-45, DEC-50 |
| RK-28 | **The service key arrives late or never.** It is a change in legacy, and the operator offered only a dump and a schema | M | H | backend | The frontend and every native part do not wait for it; the listing methods stay on stubs; the fallback is importing dumps into HOMI | product owner | DEC-42, Q-SYS-009, Q-API-060 |
| RK-29 | **Wave 1 is a whole product**: 63 screens, the v1 surface of 59 pairs, radars with delivery, the owner cabinet, 91 bot handlers and the landing, built by two developers in relay | H | M | plan | One ordered queue, one work package per PR, a handoff after every stop; no date pressure (DEC-45) | developer | `wave-1/README.md` |
| RK-30 | **The cookie session fails inside frames** (Telegram Web), or the two session modes drift apart | M | M | frontend | One screen code path with optional server-fetched data; both modes in the end-to-end suite; checked on staging in three browsers | developer | DEC-44, 25 §3.4 |
| RK-31 | **"Functional parity" is judged differently by different people** | M | M | acceptance | A written checklist per screen and per bot scenario, taken from the audit, signed in the PR | developer | DEC-46, 25 §9 |
| RK-32 | **Radars exist before anything delivers them.** The radar package is in stage C and the bot's sending package in stage D, while every merge reaches production and access is open: a user can create a radar that sends nothing | H | M | product | Decided (DEC-51): creating and changing radars is switched off on the servers until the sending package is deployed; the radar tab and the bot say "soon"; one switch turns it on together with matching | developer | DEC-43, DEC-45, DEC-51 |
| RK-33 | **A setting whose second value cannot be reproduced.** The only description of the `rich` card is the legacy Mini App's mock and one sentence of the legacy API docs: a HOMI `rich` card built from them may differ from legacy, or may not show on older Telegram clients | M | M | bot | Accepted by DEC-57: `classic` stays the default; the sample button lets the user check the style before keeping it; Q-BOT-046 and Q-API-067 go to the operator, and WP-53 adjusts `rich` to the answer | developer | DEC-57, Q-BOT-046, Q-API-067 |
| RK-34 | **Real owners' personal data before the legal basis.** Every merge reaches production with open access, and the cabinet stores owners' numbers, photos, true locations and requests | M | H | legal, privacy | DEC-81: the cabinet stays off on the servers until the gates of `25` §5 are closed; the privacy texts change with it (WP-56, WP-61, WP-70) | product owner | Q-SEC-021, DEC-81 |
| RK-35 | **The relay never comes.** The operator refuses a write route or a per-user identity (the first request asked for a read-only key without user identity, WP-02 point 2) | M | M | product | DEC-75 shows such listings with a neutral bar; the relay package waits alone and nothing depends on it | product owner | DEC-71, DEC-75, Q-API-087 |
| RK-36 | **Two sources disagree inside one list.** Sorting and paging mix legacy items with HOMI's; legacy's raw publication time or USD price may be missing (Q-API-083), so the order is approximate; counts add two numbers that are each slightly off | M | M | backend | The merge rules of WP-86; contract tests over mixed pages; the source-honesty test of WP-48 | developer | DEC-70, Q-API-062, Q-API-083 |
| RK-37 | **Realtors and fraudsters use the cabinet.** HOMI knows legacy authors only as the author keys of the cards its users opened, so its realtor check has little to compare with at first | H | M | product, trust | DEC-77: limits per phone and per account, the author keys and HOMI's votes; post-moderation with `held` and `withdrawn` and the operators' «Снять» (DEC-73); a positive check or a vote threshold holds the listing for a human decision with its evidence recorded, never a final rejection by one signal (default 26) | developer, product owner | DEC-73, DEC-77 |
| RK-38 | **Owners' numbers are stored readable.** By DEC-72 the cabinet keeps each owner's number in plain text with the listing, as legacy does: a database leak, a dump or a careless log exposes real numbers, and the database dumps are not encrypted (the developer's decision of 2026-11-13, `docs/infrastructure/backup-recovery.md:19`) | M | H | security | Two code paths read the number (the owner's own view and `ContactService::disclose()`); it never reaches a log, a job payload, the update ledger or analytics; it is erased with the user's data and 90 days after the listing left the feed for good; access to the database and the dumps stays with the production track; the security review of WP-70. WP-70's line "backups … encrypted" contradicts the developer's decision of 2026-11-13 not to encrypt the dumps: the security review of WP-70 resolves it with the production track (`16` SEC-REQ-038). Two earlier decisions predate DEC-72: the link between the application and the database is not encrypted and crosses a public network (`docs/ai/reports/production-notes.md`), and the media buckets are on a MinIO host shared with other projects (`docs/infrastructure/cdn.md`); the production track confirms before the switch-on whether the link is private or `DB_SSLMODE` changes, and the breach runbook (SEC-REQ-048) names both | developer, security reviewer, production track | DEC-72, SEC-036, SEC-REQ-038, SEC-REQ-051 |
| RK-39 | **The cabinet grows Wave 1 by a fifth.** Ten packages, about 24 000 changed lines; the queue goes from 50 to 60 packages | H | M | plan | Placed so that nothing built before it waits for it; the relay waits alone; DEC-45 sets no deadline | developer | DEC-69, DEC-45, RK-29 |

Risks of 19 that change: RK-02 (data migration), RK-03, RK-04, RK-06 and RK-19 no longer apply; RK-07 (old WebViews)
is accepted by DEC-44; RK-11 (personal data) grows, because HOMI now has users of its own from the first deploy.
RK-11 grows again with the owner cabinet: owners' numbers in plain text, photos, true locations and requests (DEC-69,
DEC-72).

## 9. What happens next

1. Review of this document, of 25 and of the queue by both developers (PR #25).
2. ADRs, each as its own small PR, written in the first stage of the queue: the new product and the three waves
   (DEC-31, DEC-40); the v1 facade with source drivers (DEC-35, DEC-41, DEC-42); the Mini App architecture (DEC-44,
   amends ADR-0013); the frontend UI stack (Tailwind tokens, shadcn/ui, next-intl). Next free numbers: 0016–0019.
3. The request to the operator goes out at once: contact, service key and its contract, limits, dump and schema
   (Q-SYS-009, Q-API-059, Q-API-060, Q-API-062). An addendum follows with the owner cabinet
   (`decisions/2026-11-14-operator-request.md`, points 14 – 28).
4. The queue starts with KV-BE-002 (`wave-1/README.md`). It has 45 work packages since DEC-56 added the support bot, 50 since the intake of `index-CIa0Ldj2.js` added the catch-up packages WP-34 … WP-38, 60 since the owner-cabinet plan added WP-80 … WP-89 (DEC-69), and 61 since the intake of `index-YX9bFVws.js` added WP-39 (DEC-93), and 62 since the landing intake added WP-62 (DEC-95).
5. The Wave 2 plan is written when the collector's owner has answered and the dump has arrived.
