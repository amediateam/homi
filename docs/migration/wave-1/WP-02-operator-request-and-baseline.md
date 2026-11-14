# WP-02 — Operator request and legacy baseline pin

| Field | Value |
| ----- | ----- |
| Stage | 0 |
| Status | TODO |
| Depends on | — (the guard key of WP-01 step 1 should be merged before the legacy tree is read) |
| Size | about 1 200 changed lines, documentation and registers only, M |
| Behaviour reference | `24` §8.2 (Q-SYS-009, Q-API-059, Q-API-060, Q-API-062, Q-API-063, Q-APP-024), §8.3 (RK-25, RK-26, RK-28); `25` §4.5, §8; `README.md` (evidence rules, identifier scheme); `08` header and §1; `03` header; legacy `$KVADRO_ROOT/demo/app/docs/CHANGELOG.md` and `$KVADRO_ROOT/demo/app/docs/releases/` (read-only) |
| Needs from the production track | The outbound addresses of the staging and production API hosts, handed to the operator directly for an allow-list (never committed). Nothing else |

## Goal

Two things exist. First, the written request to the legacy operator has been sent and logged, so the longest wait of
Wave 1 starts on day one. Second, the audit describes one named legacy release — the baseline — and every later
legacy release has a place to be recorded.

## Scope

In: the request text below, its sending through the product owner, a log of the request and of the answers; the
baseline record; updates of `03`, `08`, `04` and the registers up to the pinned release; the three register scripts.

Out: any call to legacy (DEC-33); any code; the legacy driver (WP-41) and the contact method (WP-43), which carry
their own defaults and do not wait for the answers; the Wave 2 dump import.

The package is `DONE` when the request is sent and the baseline is merged. It does not wait for the answers. When
they arrive, whoever holds the relay records them (step 5) and updates the specifications they touch.

## Decisions that bind this package

- Legacy supplies shared listing data through a service key the operator adds (DEC-42); the operator also gives a
  dump and a schema (DEC-39). Both are requests to an outside party, so they go out at once (`24` §9 item 3).
- People, tests, CI and agents never call legacy (DEC-33). The request asks for facts in writing; nobody "tries" the
  production API to find out.
- Legacy releases are followed until HOMI no longer reads legacy (DEC-37); the baseline is pinned first (`25` §8).
- The legacy tree is read-only and its code is never copied (DEC-32, `25` §2 rule 3).
- Evidence rules of `README.md`: every changed audit row cites `path:line`; identifiers are never renumbered; no
  secrets, real phone numbers or personal data in any document.

## Design

### Part A — the request

Who sends it: the product owner, to the operator's contact (Q-SYS-009: the product owner knows the contact). The
developer hands over the text below and records the date. Answers are expected in writing.

```text
Subject: HOMI — service access to the listing API, limits, dump and schema

Hello,

HOMI is launching its own bot and Mini App. Until HOMI collects listings itself, our servers will read
listing data from your API and show it to HOMI users. HOMI users, their favourites, radars and settings
live only in HOMI; we do not need any user data from you. Please answer the points below in writing.

1. Contact. Who is the technical contact for this integration, on which channel, and what response
   time can we expect? How will you tell us about API changes and planned maintenance (a changelog,
   a message, how long in advance)?

2. Service key. We ask for a read-only key for server-to-server calls, one for our staging and one
   for our production environment.
   a. How is the key sent: header name and value format?
   b. Which routes does it open? We need: GET /api/meta (directories only), GET /api/cities,
      GET /api/feed, GET /api/feed/count, GET /api/feed/flow, GET /api/feed/new, GET /api/map,
      GET /api/listings/:id (also with preview=1), GET /api/listings/:id/call,
      POST /api/listings/:id/translate.
   c. Does a service-key request need any user identity (for example a Telegram user id)? We would
      prefer that it does not.
   d. Do you restrict by source address? We will give you our outbound addresses separately.
   e. How is a key rotated or revoked?

3. Limits. Which limits apply to the key: requests per second, burst, per day? What does the API
   answer above the limit (status, Retry-After)? Our expected load: every search and card view of a
   HOMI user (cached where possible) plus a background poll of the newest listings, about once every
   five minutes per distinct saved search.

4. Language and currency. Your API formats many strings on the server (price, title, age, labels).
   How does a service-key request choose the language (ru, uz_Latn, en) and the currency (USD, UZS)?
   Which per-user fields (favorite, viewed) does such a request return?

5. Raw values. Can listing previews and cards under the service key carry raw values next to the
   formatted strings: price in USD, publication time, deal, property type, district code?

6. Source and author. Can previews and cards carry (a) the source channel and post id of the
   listing and (b) a stable opaque key of the author (the same for all listings of one phone or one
   channel)? We use (a) to keep users' favourites when we move to our own listings and (b) for
   "block this author".

7. Contact. For "Call", can the card under the service key return the phone number, or only a call
   link? If a link: how long is it valid and may it be opened by any user?

8. Translation. How does POST /api/listings/:id/translate choose the target language under the
   service key?

9. Batch read. Is there, or can there be, a read of several previews by listing ids in one request?
   If not: is it acceptable that we read up to 20 cards in parallel?

10. Photos. Listing photo addresses are signed. May our media host fetch and cache them (for how
    long), and do you restrict by Referer or address?

11. Landing data. May we read the public data files of your landing (data/live.json,
    data/pins-rent.json, data/pins-sale.json and the photo snapshots)? When are they rewritten?

12. Dump and schema. In which format and through which channel will you deliver the database dump
    and the schema description, by which date, and can it be refreshed later? Please exclude your
    users' personal data, or tell us which tables contain it.

13. Later. When HOMI no longer reads your API, we will ask you to announce the move in your bot.
    No action now; we only ask whether that is possible.

Please include dates for points 2 and 12. Thank you.
```

The log lives in a new file `docs/migration/decisions/<date>-operator-request.md`: the date sent, by whom, the text as
sent (a link to this section if unchanged), and a table "point → answer → date → which question it closes → which
specification changes". No key, address or contact detail is written there; a value is named, never copied.

How each answer is used:

| Point | Closes | Consumer | Default built without the answer |
| ----- | ------ | -------- | -------------------------------- |
| 1, 2e | Q-SYS-009 | `24` §8.2; WP-71 runbook | none needed |
| 2a–2d | Q-API-060 | WP-41 `config/legacy.php` | header name and value prefix are configuration; no user identity is sent |
| 3 | Q-API-059 | WP-41 limiter, WP-46 poll budget | 5 requests per second, poll every 300 s, both configuration |
| 4, 5, 8 | Q-API-062 | WP-41, WP-42 translators, WP-43 translation | `Accept-Language` with `uz_Latn`; raw values nullable in the contract; HOMI formats what legacy cannot |
| 6 | Q-API-063 | WP-42 `listing_refs`, WP-44 blocked authors | channel and post parsed from the card's source link; author key derived by HOMI from the card |
| 7 | Q-API-062 | WP-43 | both variants are specified there |
| 9 | RK-25 | WP-42 `previews()` | parallel card reads, at most five at a time, each cached |
| 10 | — | WP-42 photo proxy | cache 24 h, no `Referer` sent |
| 11 | — | WP-60 | files read without a key, cached 30 min |
| 12 | DEC-39 | Wave 2 plan | none in Wave 1 |

### Part B — the baseline

**The pin.** The baseline is the newest release listed in `$KVADRO_ROOT/demo/app/docs/CHANGELOG.md` on the day this
package starts. Record it in a new file `docs/migration/wave-1/baseline.md`:

| Field | Content |
| ----- | ------- |
| Baseline release | bundle file name as the changelog names it, and its date |
| Legacy checkout | SVN revision from `svn info` (read-only command) |
| Releases covered since the audit | one row per release after `index-plF_TOcT.js`: name, date, sync report file, summary of changes |
| Intake log | empty table: release → date read → audit rows changed → specifications changed → queue row |

**What to bring up to the pin.** Read the sync report of every release after the audited one. `25` §8 already names
four gaps; treat them as the minimum, not the list:

| Change in legacy | Audit update | Specification update |
| ---------------- | ------------ | -------------------- |
| Report sheet gained a detail step with a `detail` field | `03` SCR-023 (states, texts, interaction); `08` API-016 input and tests; `data/screens.json`, `data/api-inventory.json`; a feature row in `09` and `data/features.csv` if it is a new capability | WP-13 (`POST /listings/{number}/reports`), WP-44, the listing-screen package |
| `price_kind: business` and its label | `08` §1.8 `ListingPreview.price_kind`; `03` SCR-007 and SCR-018 texts; i18n key count in `03` §3.1 | WP-12 (`price.kind`), WP-42 translator |
| Badge order on cards | `03` §4 rule BR-APP-026 (edit the row in place, add the evidence line) and `07` where the rule is compiled | the feed package |
| No-access text | `03` SCR-003 texts; `08` API-001 errors if the wording there changed | the gates package |

Rules for the edits:

- Identifiers are stable. A changed rule keeps its identifier and gains new evidence; a new rule, screen state or
  defect gets the next free number of its prefix. Removed behaviour is marked `DEPRECATED_CANDIDATE`, never deleted.
- Update the header lines that name the audited release: `08` "Legacy state", `03` header, `README.md` status line
  ("the audit describes release …").
- `04` (bot) and `05` (Telegram layer) are changed only if a sync report mentions them; otherwise write one line in
  `baseline.md`: "no bot or SDK change between the two releases, per the sync reports".
- The 472-key count of `25` §1 is re-counted from `$KVADRO_ROOT/demo/app/src/i18n/locales/` and corrected in `03`
  §3.1 if it moved.
- In `24` §8.2 the row of Q-APP-024 gets its answer (the pinned release) and the label `CONFIRMED`.

**Verification with the register scripts.** Run from the repository root, in this order, and commit what they
regenerate:

| Command | Regenerates | Must hold |
| ------- | ----------- | --------- |
| `python3 scripts/migration/collect_ids.py` then the same with `--check` | `docs/migration/data/ids.csv` | exit 0: no identifier defined twice, none referenced without a definition |
| `python3 scripts/migration/build_open_questions.py` | the generated block of `20-open-questions.md` | Q-APP-024 appears as answered; the diff contains only expected rows |
| `python3 scripts/migration/task_graph.py --check` | `data/tasks.csv` and the generated block of `13-dependency-graph.md` | exit 0: no broken reference, no cycle |

The hand-maintained registers (`data/api-inventory.json`, `data/screens.json`, `data/bot-handlers.json`,
`data/features.csv`, `data/public-urls.json`) are edited by hand next to their documents; check each with
`python3 -m json.tool <file> > /dev/null` (or a CSV column count) after editing.

## Files

- `docs/migration/decisions/<date>-operator-request.md` (new)
- `docs/migration/wave-1/baseline.md` (new)
- `docs/migration/03-legacy-frontend-audit.md`, `08-api-inventory.md`, `07-business-rules.md`,
  `09-feature-parity-matrix.md`, `24-three-wave-strategy.md` (§8.2 rows), `README.md` (status line); `04` and `05`
  only if a sync report requires it
- `docs/migration/data/api-inventory.json`, `screens.json`, `features.csv` (by hand); `ids.csv`, `tasks.csv`,
  `20-open-questions.md`, `13-dependency-graph.md` (generated)
- `docs/migration/wave-1/WP-12-…`, `WP-13-…`, `WP-42-…`, `WP-44-…` where the baseline changes a contract
- `docs/migration/wave-1/README.md` (status)

## Steps

1. Hand the request text to the product owner. Create the request log with the date and "sent by". If the product
   owner changes the text, paste the sent version into the log.
2. Ask the production track for the outbound addresses of the two API hosts to be given to the operator; note in the
   log that this was done, not the addresses.
3. Read the legacy changelog and the sync reports after `index-plF_TOcT.js` (read-only: `rg`, `sed -n`, `svn info`).
   Write `baseline.md` with the pin and one row per release.
4. Update the audit and the registers per the table above, one legacy change per commit, then run the three scripts
   and commit the regenerated files.
5. Update the affected Wave 1 specifications in the same PR and list them in the PR description (queue rule 6).
6. When answers arrive (any time later): fill the log table, update the rows of `24` §8.2, change the defaults in
   the consuming specifications if the answer differs, and add a queue row if code must change.

## Behaviour to reproduce

None; this package changes documents. What it must not do:

- It must not describe behaviour that was not read in the legacy tree or in a sync report. A statement taken from a
  sync report alone is `DOCUMENTED_ONLY`; one seen in the recovered client code is `CONFIRMED`.
- It must not copy legacy code, keys, production values or real listing data into the audit or the fixtures.

## Tests

- The three scripts exit 0 and their generated files are committed.
- `rg -n "plF_TOcT" docs/migration` shows the old release name only in history sentences and in `baseline.md`.
- Every changed audit row has a `path:line` evidence reference into the legacy tree or a sync report.
- The request log contains no secret, address, phone number or personal contact detail (`rg -n "@|\+998|https?://"`
  on the file returns only public route names).

## Acceptance checklist

- [ ] The request was sent; the log file records the date, the sender and the text.
- [ ] The production track was asked for the outbound addresses.
- [ ] `baseline.md` names the pinned release, the SVN revision and every release between the audit and the pin.
- [ ] `03` and `08` describe the pinned release, including the report detail step, `price_kind: business`, the badge
      order and the no-access text.
- [ ] Q-APP-024 is answered in `24` §8.2.
- [ ] `collect_ids.py --check` and `task_graph.py --check` exit 0; generated files are committed.
- [ ] The Wave 1 specifications touched by the baseline are updated in this PR and listed in its description.
- [ ] The other developer reviewed the PR.

## Handoff

Empty.
