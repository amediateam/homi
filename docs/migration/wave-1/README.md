# Wave 1 — work queue

Plan: [`../25-wave-1-plan.md`](../25-wave-1-plan.md). Strategy and decisions:
[`../24-three-wave-strategy.md`](../24-three-wave-strategy.md). Conventions: [`../README.md`](../README.md).

This file is the **single ordered queue** of Wave 1. Two full-stack developers, each with agents, work it in relay:
whoever holds the relay takes the first package that is not `DONE` and continues exactly where the other stopped
(DEC-45). There is no split by stack and no second queue.

## State of the specifications (2026-11-14)

All 45 specifications are written (about 18 400 lines). They were drafted by subagents from the audit and the
earlier task files, and then verified in a second pass. WP-59 (support bot, DEC-56) was added afterwards by the main
session, and the decisions DEC-50 … DEC-55 of the second answer round were carried into the specifications they
touch; neither went through the verification pass.

**Verification pass (2026-11-14).** Every specification was read in full against four things: the repository as it
is today (files, classes, signatures, routes, config and env keys, tables, CI, generator commands), the other
specifications (every name one package uses from another), `25` with the developer's answers, and whether each step
can be executed as written. About 220 corrections were made. Typical ones: a property name that PHP refuses, a
validation pattern that rejected the new format, exception classes the framework converts before the renderer sees
them, a test helper designed twice, a method or config key used under a name its owner does not define, a test
that cannot observe what it asserts. WP-00 … WP-03 were checked by the main session; the other 40 by three agents,
whose claims the main session sampled against the code (26 sampled, 26 confirmed).

Checked by script on all 45 files: the template (field table and ten sections, in order); `collect_ids.py --check`
exits 0; the v1 methods named against the table of `25` §4.2; every repository path named — it exists or a package
creates it.

**What the pass did not cover.** Nothing was executed: no step of any package was run. Not compared line by line:
interface texts, bot texts, constants and thresholds against the audit (`03`, `04`, `05`, `09`, `16`) — the
coverage totals are the authors' own (45 of 45 screens, 69 of 69 client rules, 47 of 47 client defects, 84 of 84
bot handlers, 76 of 76 buttons, 88 of 88 texts). Not confirmable before WP-03 installs them: the behaviour of
next-intl, shadcn/ui and Radix, the map libraries, PostHog, Vitest and Playwright; such statements are worded
"verify in the installed documentation". Telegram Bot API facts are worded "verify against the Bot API
documentation". Three Next.js points are marked the same way in WP-20 (interception inside a route group, slot
catch-alls beside `[locale]/[...rest]`, `notFound()` in the root layout).

So a specification is a checked starting point, not a proof. When it disagrees with `25`, with the audit or with
the code, those win, and the specification is corrected in the same PR (rule 6 below).

## How to work the queue

1. **Take the first package that is not `DONE`.** Do not skip ahead. A package marked `WAITING` names what it waits
   for; work then continues with the next package only if that package does not list the waiting one under
   "Depends on".
2. **Read** `25` once, then the package's specification, then only the audit sections the specification cites.
3. **One package = one branch = one PR**, about 1 500–3 000 changed lines without generated files, reviewed by the
   other developer before merge (DEC-45). Branch name: `feat/wp-<number>-<slug>`.
4. **If you stop before the package is done,** push the branch, fill "Handoff" at the end of the specification
   (what is finished, what is half-done, the next concrete step, any decision you took), set the status to
   `IN_PROGRESS (<branch>)`, and run the `save-session` skill. The other developer continues on the same branch.
5. **When the package is done:** tick its acceptance checklist in the PR, merge after review, deploy to staging and
   production with the production track, check inside Telegram where the package says so, set the status to `DONE`
   here, and update the session handoff.
6. **If something in a specification is wrong or missing,** fix the specification in the same PR and say so in the
   PR description. Do not work around it silently.
7. **A new legacy release** (`$KVADRO_ROOT/demo/app/docs/CHANGELOG.md`) becomes a row at the top of the remaining
   queue: update the audit, the affected specifications, the stub fixtures and the legacy translator (`25` §8).

Statuses: `TODO`, `IN_PROGRESS (<branch>)`, `WAITING (<what for>)`, `REVIEW`, `DONE`.

## Stage 0 — Start

| Package | Title | Depends on | Status |
| ------- | ----- | ---------- | ------ |
| [WP-00](WP-00-media-ownership-fix.md) | Media ownership fix | — | WAITING (PR #27 merged; production track: the two counts, approval of the migration on production, deploy, a foreign id answers `404` on staging) |
| [WP-01](WP-01-adrs-and-shared-files.md) | ADRs and shared-file updates | — | WAITING (all eight PRs merged; the first developer accepts ADR-0016 … ADR-0019 and answers the PR-size and deploy questions of #30) |
| [WP-02](WP-02-operator-request-and-baseline.md) | Operator request and legacy baseline pin | — | WAITING (PR #37 merged; the request to the operator is sent) |
| [WP-03](WP-03-dependencies-and-test-tooling.md) | Dependencies and test tooling | WP-00, WP-01 | WAITING (merged in #39; deploy with the production track) |

## Stage A — Contract

| Package | Title | Depends on | Status |
| ------- | ----- | ---------- | ------ |
| [WP-10](WP-10-api-framework.md) | API v1 framework: source drivers, flags, stubs, OpenAPI, generated types | WP-03 | WAITING (merged in #42; production track: migration approval, deploy, `/docs/api` in nginx basic auth, `sources:list` on staging) |
| [WP-11](WP-11-contract-session-reference.md) | Contract: session, me, settings, reference, cities, events | WP-10 | WAITING (merged in #45; production track: `TELEGRAM_SUPPORT_USERNAME`, deploy, staging check of `GET /reference` without a token and of sign-in → `GET /me`) |
| [WP-12](WP-12-contract-listings.md) | Contract: listings, map, card, contact, translation, share | WP-11 | WAITING (merged in #48; production track: deploy, `sources:publish-stub-media` on staging and production, one fixture photo from the CDN host) |
| [WP-13](WP-13-contract-personal-radars.md) | Contract: personal lists, reports, surveys, radars, landing | WP-12 | WAITING (merged in #50; production track: deploy, staging check of `GET /radars` → `[]` and `POST /radars` → `403 radars_disabled`) |

## Stage B — Mini App on stubs

| Package | Title | Depends on | Status |
| ------- | ----- | ---------- | ------ |
| [WP-20](WP-20-app-foundation.md) | App foundation: routes, localisation, tokens, themes, brand, base components | WP-13 | WAITING (merged in #52; production track: deploy, then staging and production serve the placeholder app) |
| [WP-21](WP-21-telegram-and-session.md) | Telegram layer and session | WP-20 | WAITING (merged in #55, shared files #54; production track: the request in the Handoff, then steps 11–12 — staging in report-only mode, the checks inside Telegram, production) |
| [WP-22](WP-22-data-layer.md) | Data layer, formatters and the filter model | WP-21 | WAITING (merged in #61; production track: deploy, with the `API_URL` of WP-21) |
| [WP-23](WP-23-gates-and-shell.md) | Gates and shell | WP-22 | WAITING (merged in #68; production track: the regular deploy; then the manual checks inside Telegram on staging) |
| [WP-24](WP-24-feed.md) | Feed and listing card | WP-23 | WAITING (merged in #71 on 2026-11-17; production track: the photo check of the header, then the regular deploy; then the manual checks inside Telegram on staging) |
| [WP-25](WP-25-filters.md) | Filters, quick filter, sort, city | WP-24 | WAITING (merged in #79 on 2026-11-17; production track: the regular deploy; then the manual checks inside Telegram on staging) |
| [WP-26](WP-26-listing.md) | Listing screen | WP-24 | WAITING (merged in #81 on 2026-11-17; production track: the regular deploy; then the manual checks inside Telegram on staging) |
| [WP-27](WP-27-map-gl.md) | Map: MapLibre GL engine | WP-25 | REVIEW (#83) |
| [WP-28](WP-28-map-leaflet-lasso.md) | Map: Leaflet engine, lasso, spot map | WP-27 | REVIEW (#84, stacked on #83) |
| [WP-29](WP-29-saved.md) | Favourites and history | WP-26 | REVIEW (#85) |
| [WP-30](WP-30-radars.md) | Radars | WP-25, WP-26 | REVIEW (#86) |
| [Intake `index-BnFvC-Ft`](baseline.md#intake-log) | Legacy release intake (rule 7): the card style of the bot's listing cards — audit, specifications, the contract on stubs (`card_style`, `POST /settings/card-sample`), fixtures, the `legacy` catalogue | — | REVIEW (this PR) |
| [WP-31](WP-31-settings.md) | Settings and nudges | WP-23, intake `index-BnFvC-Ft` | TODO |
| [WP-32](WP-32-analytics-errors.md) | Analytics and error reporting | WP-23 | TODO |
| [WP-33](WP-33-frontend-acceptance.md) | Frontend acceptance on stubs | WP-24 … WP-32 | TODO |

## Stage C — API

| Package | Title | Depends on | Status |
| ------- | ----- | ---------- | ------ |
| [WP-40](WP-40-identity.md) | Sign-in, users, settings, access gate, limits | WP-33 | TODO |
| [WP-41](WP-41-legacy-driver.md) | Legacy driver core, reference data and cities | WP-40 | TODO |
| [WP-42](WP-42-listings-legacy.md) | Listings through legacy: feed, count, flow, map, card, overlay, photos | WP-41 | TODO |
| [WP-43](WP-43-contact-translation-share.md) | Contact, translation, share | WP-42 | TODO |
| [WP-44](WP-44-personal-lists.md) | Personal lists, reports, surveys | WP-40 | TODO |
| [WP-45](WP-45-radars-service.md) | Radars: service, limits, relax, previews | WP-42, WP-44 | TODO |
| [WP-46](WP-46-radar-matching.md) | Radar matching and delivery planning | WP-45 | TODO |
| [WP-47](WP-47-action-log.md) | Action log, server-side analytics, retention, erasure | WP-44 | TODO |
| [WP-48](WP-48-stubs-off.md) | Stubs off: contract tests across drivers, flags to real sources | WP-41 … WP-47 | TODO |

## Stage D — Bot

| Package | Title | Depends on | Status |
| ------- | ----- | ---------- | ------ |
| [WP-50](WP-50-bot-webhook-client.md) | Webhook, update ledger, Bot API client | WP-40, WP-43 | TODO |
| [WP-51](WP-51-bot-core.md) | Router, locale, texts, reply conventions, callbacks, state, assets | WP-50 | TODO |
| [WP-52](WP-52-bot-start-commands.md) | Start, commands, language, reachability | WP-51 | TODO |
| [WP-53](WP-53-bot-cards.md) | Listing cards and card actions | WP-52, WP-42, WP-43, WP-44, WP-45 | TODO |
| [WP-54](WP-54-bot-radar-wizard.md) | Radar wizard | WP-53, WP-45 | TODO |
| [WP-55](WP-55-bot-radar-screens.md) | Free text and voice, poll, radar list and card, edit | WP-54 | TODO |
| [WP-56](WP-56-bot-settings-owner-privacy.md) | Settings, owner verification, privacy, erasure | WP-52, WP-47 | TODO |
| [WP-57](WP-57-bot-sending.md) | Sending: pacing, outbox, quiet hours, digest, withdrawn cards, broadcasts | WP-53, WP-46 | TODO |
| [WP-58](WP-58-bot-profile-tests.md) | Bot profile as code, action log, conversation tests, pass inside Telegram | WP-52 … WP-57 | TODO |
| [WP-59](WP-59-support-bot.md) | Support bot: a second bot that relays between a person and the operators' private chats | WP-58 | TODO |

## Stage E — Landing

| Package | Title | Depends on | Status |
| ------- | ----- | ---------- | ------ |
| [WP-60](WP-60-landing-data.md) | Landing data | WP-41 | TODO |
| [WP-61](WP-61-landing-pages.md) | Landing pages | WP-60, WP-20 | TODO |

## Stage F — Launch

| Package | Title | Depends on | Status |
| ------- | ----- | ---------- | ------ |
| [WP-70](WP-70-hardening.md) | Hardening: security, performance, monitoring, legal texts | WP-48, WP-58, WP-61 | TODO |
| [WP-71](WP-71-launch.md) | Launch and watch | WP-70 | TODO |

## Specification template

Every `WP-NN-<slug>.md` has these sections, in this order:

```markdown
# WP-NN — <title>

| Field | Value |
| ----- | ----- |
| Stage | 0 / A / B / C / D / E / F |
| Status | TODO |
| Depends on | WP-… |
| Size | expected changed lines, and S / M / L |
| Behaviour reference | audit sections and the earlier task files that describe the behaviour |
| Needs from the production track | server-side actions, or "nothing" |

## Goal
What exists when the package is done, in two or three sentences.

## Scope
In: … Out: … (with the package that covers what is out).

## Decisions that bind this package
The DEC rows and the sections of 25 that apply, each with its consequence here.

## Design
Interfaces, routes, tables, components — concrete names. Request and response shapes for API packages.

## Files
New and changed files in this repository.

## Steps
Numbered, in order, each small enough to finish and commit.

## Behaviour to reproduce
States, texts, rules, limits and defects to fix, with their audit IDs.

## Tests
The concrete cases per layer of 25 §9.

## Acceptance checklist
Checkable statements; the functional checklist for user-visible packages.

## Handoff
Empty until someone stops midway or finishes: what is done, what is half-done, the next concrete step.
```

Rules for writing specifications: English; no machine paths, secrets or personal data; an audit identifier
(`SCR-…`, `API-…`, `KV-…`) never starts a table row, a heading or a bold list item, because the identifier check
would read it as a second definition (`scripts/migration/collect_ids.py`).
