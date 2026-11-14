# WP-48 — Stubs off: contract tests across drivers, flags to real sources

| Field | Value |
| ----- | ----- |
| Stage | C |
| Status | TODO |
| Depends on | WP-41 … WP-47 |
| Size | about 1 500 changed lines (mostly tests), M; the switching itself is operations, not code |
| Behaviour reference | `25` §4.3, §4.4, §4.5 (contract tests), §9 (contract layer, checks inside Telegram), §14 item 2; `24` §3 (rollback by flag), §5 (order of methods), §8.3 (RK-25 … RK-28); WP-10 (rules, commands, audit table), WP-11 … WP-13 (the shapes), WP-41 and WP-42 (golden fixtures) |
| Needs from the production track | This package is done together with that track. 1. Before anything: the service key is installed and `php artisan legacy:ping` succeeds (WP-41); the media location serves a legacy photo (WP-42). 2. Run the `sources:*` commands of "Design, part B" on staging and then on production, at the steps this specification names, or agree in writing on how the development track may run them. 3. After the defaults PR is deployed: server env `SOURCES_ALLOW_STUB=false` on staging, then on production; `RADAR_MATCHING_ENABLED` stays `false` (WP-57 switches it on). 4. Watch Horizon and Pulse during each soak and say stop if the legacy host or the API host suffers |

## Goal

No method of the Mini App answers from a stub on staging or production: listing data comes from legacy, personal
data and radars from HOMI's own code, and `meta.source` says so on every answer. Tests prove that the drivers of a
method return the same schema, so switching a flag cannot change what the frontend receives. The "demo data" marker
can no longer appear for a real user.

## Scope

In: contract tests across drivers and against the OpenAPI file; a source-honesty test; the switching procedure for
the nine features of reference and listing data, on staging and then production; the change of configured defaults;
forbidding stubs on the servers; the checks inside Telegram; the records. Radar matching is not switched on here
(WP-57 does that, when a sender exists).

Out: the two landing features (`source.landing.live`, `source.landing.pins`) — WP-60 binds their legacy driver and
switches them; until then they answer `503 source_unavailable` on servers where stubs are forbidden, and nothing
deployed calls them. The bot (stage D). Native drivers for listing data (Wave 2).

If the service key does not exist yet (RK-28): do part A, set the status to `WAITING (service key)` and let the
queue continue with stage D. Part B starts when the key arrives.

## Decisions that bind this package

- A method goes back to its previous driver by its flag, without a deploy (`24` §3); every change is logged with who
  and why (`25` §4.3).
- Contract tests: stub, legacy and native drivers return the same schema (`25` §9); a recorded legacy answer that no
  longer fits must fail a test (RK-26).
- Every merge is deployed to staging and production and checked inside Telegram there (DEC-45); there is no
  deadline, so every step may wait as long as it needs.
- Stub data must never look real to a user (RK-27): while any method is on a stub the marker shows; when none is,
  stubs are forbidden on the servers.
- Order of methods (`24` §5): reference data and cities; then feed, count, flow and map together, because they must
  agree; then the card with contact and translation.

## Design

### Part A — contract tests (no key needed)

All in `backend/tests/Feature/Contract/`, run by `make ci-backend`; every file prevents stray HTTP requests and uses
`LegacyFakeServer`.

1. **`DriverParityTest`.** A dataset of feature, route and request samples:

   | Feature | Route | Samples |
   | ------- | ----- | ------- |
   | `source.reference`, `source.cities` | `GET /reference`, `GET /cities` | `ru`, `uz`, `en` |
   | `source.listings.feed` | `GET /listings` | default filters; page 2; an empty result |
   | `source.listings.count`, `.flow`, `.map` | the three reads | default filters; a narrow filter with flow options |
   | `source.listings.card` | `GET /listings/{number}` | one card per deal and type fixture; `preview=1`; a merged number; an unknown number |
   | `source.listings.contact`, `.translation` | the two `POST` methods | a listing with a phone; link-only; `uz`; `en` |

   For each sample the request runs once per driver that is bound for the capability (`stub` and `legacy` now;
   `native` joins by itself when Wave 2 binds it). Assertions: equal status; `meta.source` equals the driver;
   `JsonShape::of($data)` (WP-10) is equal across drivers — same keys at every depth, same types, where `null` is
   compatible with any type and an array's shape is the union of its elements' shapes.
2. **`OpenApiConformanceTest`.** For each of the 38 methods of `25` §4.2: call it (native methods against real code
   with factories; flagged methods once per bound driver) and validate the answer against its schema in
   `docs/api/openapi.json` with `Tests\Support\OpenApiSchema` — a small validator written here (types, `required`,
   `enum`, `nullable`, `$ref`, arrays, nested objects; no formats). No new dependency. Error answers are validated
   against the shared error schema, one sample per code used by the method.
3. **`SourceHonestyTest`.** Native-only methods answer `native`. With `sources.allow_stub` false: `sources:set …
   stub` is refused; a stored rule that names `stub` and a `stub` default both lead to `503 source_unavailable`,
   never to a stub answer; a walk over every `GET` method of the table finds no `meta.source = stub`.
4. **`StubIsolationTest`.** `StubResponder` is referenced only by `NativeStubs` and the stub drivers (a scan of
   `backend/app`); the boot check refuses `sources.native_stubs` outside `local` and `testing`, and
   `legacy.fake` in production; no controller class contains a fixture name.
5. **`ServerDefaultsTest`** (added with the defaults change of part B): for `staging` and `production` no feature of
   reference or listing data has the default `stub`.

A failure of `DriverParityTest` is fixed in the translator or the stub fixture, never by loosening the comparison;
if the contract itself was wrong, fix the specification of WP-11 … WP-13 in the same PR (queue rule 6).

### Part B — switching, staging first, then production

Preconditions, all ticked in the PR before the first command: WP-41 … WP-47 are merged and deployed; part A is green
on `main`; `legacy:ping` succeeds on the server; a photo address from a legacy card loads through the media host;
`php artisan sources:check` exits 0; the operator's answers on limits are applied to `LEGACY_RATE_PER_SECOND` and
`RADAR_POLL_BUDGET_PER_MINUTE` (or the defaults are kept on purpose).

Groups, switched in this order, each group completely before the next:

| Group | Features |
| ----- | -------- |
| 1 | `source.reference`, `source.cities` |
| 2 | `source.listings.feed`, `source.listings.count`, `source.listings.flow`, `source.listings.map` |
| 3 | `source.listings.card`, `source.listings.contact`, `source.listings.translation` |

Steps per group and environment (`<f>` stands for each feature of the group, `<who>` for the person running it):

| Step | Command | Then |
| ---- | ------- | ---- |
| a. Named users | `php artisan sources:set <f> legacy --user=<id> --user=<id> --by=<who> --reason="WP-48 canary"` with the ids of the two developers' accounts | those accounts run the checklist of part D; everyone else still sees stubs with the marker |
| b. A share (production only) | `php artisan sources:set <f> legacy --share=10 --by=<who> --reason="WP-48 10%"`, later `--share=50` | at least two hours each; watch the signals below |
| c. Everyone | `php artisan sources:set <f> legacy --by=<who> --reason="WP-48 everyone"`, then `php artisan sources:reset <f> --share --user=<id> --user=<id> --by=<who> --reason="WP-48 cleanup"` | soak: 24 hours on staging, 7 days on production after the last group |
| Rollback, at any step | `php artisan sources:reset <f> --all --by=<who> --reason="<what was seen>"` | the feature is back on its default at the next request; write what was seen into "Handoff" |

Signals to watch during a share and a soak: the rate of `503 source_unavailable`; breaker state changes and
"legacy refused the service key" in the log; limiter refusals of the legacy client; latency of outgoing requests in
Pulse; the `critical` and `error` lines of `LegacyContractError`. A contract error means legacy changed: roll the
group back, record the release (`25` §8) and fix the translator first.

After group 3 has soaked on production:

1. A PR changes `config/sources.php`: the default of the nine features becomes `legacy` for `staging` and
   `production` (`local` and `testing` stay `stub`); `ServerDefaultsTest` is added; `docs/api/README.md` gets the
   driver of every method.
2. After its deploy: `php artisan sources:reset <f> --all …` for the nine features, staging then production, so the
   configured default is what runs and no override is left. `sources:list` must show empty rules.
3. The production track sets `SOURCES_ALLOW_STUB=false` (staging, then production) and runs `sources:check`. It
   exits 0: the command looks only at whether the resolved driver is bound (WP-10), so the two landing features,
   whose default is still a bound but now forbidden `stub`, do not fail it; they answer `503` until WP-60.
4. `RADAR_MATCHING_ENABLED` stays `false`. Matching is switched on by the bot's sending package (WP-57), when a
   sender exists; switching it on here would only build a backlog nobody can send.

From step 3 on, a rollback of a listing feature no longer shows stub data: the user sees the "could not load" state
(`503 source_unavailable`) until legacy is back. That is intended.

### Part C — the "demo data" marker

The marker of the Mini App shows whenever an answer carries `meta.source = stub` (stage B). It disappears because
its condition can no longer be true on the servers:

- flagged methods: defaults are `legacy`, no override is stored, and `allow_stub` is false;
- native-only methods: real code answers `native`; the stub answers of `NativeStubs` exist only with
  `SOURCES_NATIVE_STUBS=true`, which the boot check allows in `local` and `testing` alone.

The marker component stays in the code: local development and the end-to-end suite still run on stubs, and there it
must keep showing. Nothing in the frontend changes in this package. If the bot's welcome text names demo sections
(RK-27), that sentence is removed in the bot package that owns the text; note it in "Handoff" for stage D.

### Part D — what to check inside Telegram

Run with a developer account in step a, and again after step c, on staging and then production, in the iOS, Android,
Desktop and Web clients; on Web once with third-party cookies blocked (header mode).

| Area | Check |
| ---- | ----- |
| Marker | no "demo data" marker on any screen that uses a switched method; it is still shown where a later group is on stubs |
| Reference | city picker lists real cities; filters show districts, zones, renovations and appliances; names follow the language in `ru`, `uz`, `en` |
| Feed | real listings with photos (loaded from HOMI's media host), prices, badges; scrolling loads further pages to the end; pull-to-refresh |
| Filters | the live count changes with the filters; the flow line appears; a narrow filter shows widen options |
| Map | points appear and agree with the feed count; the lasso narrows them; the selection card opens |
| Card | opens from the feed, the map and a `startapp=l_<number>` link; photos viewer; market block; price history; original text; a removed listing shows "could not load" |
| Contact | «Позвонить» opens the dialer or the call page; «Написать» opens the link; after ten minutes the link still works (it was refreshed) |
| Translation | in `uz` and `en` the original text translates and toggles back; in `ru` the button is absent |
| Share | Telegram's share sheet opens; the shared message opens the listing in HOMI's Mini App |
| Overlay | a favourite set on the card shows on the feed; a hidden listing leaves feed and map and returns on undo; a blocked author's listings leave; "viewed" eyes appear |
| Personal | favourites, history and «Скрытое» survive a relaunch |
| Radars | create from the filters; the tab shows previews of real listings; pause, resume, edit, delete. Outbox rows for new listings are not checked here: matching stays off until WP-57 |
| Failure | with the group rolled back for the tester's account only (`--user`), the marker returns for that account |

Screenshots of the feed, a card and the radar tab from each client go into the PR.

### Records

- `docs/migration/wave-1/README.md`: status of this package; `docs/api/README.md`: driver per method.
- "Handoff" of this file: one line per executed step — date, environment, group, step, who, result. The detail is in
  the table `source_flag_changes`.
- `.ai/memory/current-state.md` (development sections): which methods run on which driver.

## Files

- `backend/tests/Feature/Contract/{DriverParityTest,OpenApiConformanceTest,SourceHonestyTest,StubIsolationTest,ServerDefaultsTest}.php`
- `backend/tests/Support/OpenApiSchema.php`; `backend/tests/Support/JsonShape.php` (extended if a case needs it)
- `backend/config/sources.php` (defaults, in the second PR)
- `docs/api/README.md`; `docs/migration/wave-1/README.md`; this file's "Handoff"
- No frontend file. No migration.

## Steps

1. Part A tests, one file per commit; fix whatever they uncover in translators or fixtures. Merge and deploy (PR 1).
2. Tick the preconditions with the production track. If the key is missing, stop here with `WAITING (service key)`.
3. Staging: groups 1, 2, 3 through steps a and c; run part D after each group; soak 24 hours after group 3.
4. Production: groups 1, 2, 3 through steps a, b and c; part D after each group; soak 7 days after group 3.
5. The defaults PR (PR 2), its deploy, the resets, `SOURCES_ALLOW_STUB=false`.
6. Final part D run on production; records; `save-session`.

## Behaviour to reproduce

- Switching a driver is invisible to the frontend except for the data itself and the marker.
- A user keeps one driver per feature while a share rule is unchanged; nobody flips between stub and legacy from
  request to request.
- Personal data is never lost by a switch or a rollback: it lives in HOMI whatever the listing source is (`24` §3).
- Feed, count and map agree before the overlay — which is why group 2 moves as one.

## Tests

- The five contract test files of part A, with the datasets given there.
- Selector regression from WP-10 rerun with real features: a `--user` rule affects only that user; `--share=10`
  reaches about a tenth of 1 000 synthetic users and is stable per user; `sources:reset --all` returns the default.
- A scripted dry run in a feature test: apply steps a, b, c and the rollback to one feature and assert
  `meta.source` for three users after each command, and one audit row per command with actor and reason.
- Frontend suite (unchanged): green in stub mode — it proves that the marker still shows where stubs answer.

## Acceptance checklist

- [ ] `DriverParityTest`, `OpenApiConformanceTest`, `SourceHonestyTest` and `StubIsolationTest` are green on `main`.
- [ ] On staging and on production the nine features run on `legacy` by configured default, with empty stored rules.
- [ ] Every flag change of this package has a row in `source_flag_changes` with who and why, and a line in "Handoff".
- [ ] `SOURCES_ALLOW_STUB=false` is set on staging and production; `sources:check` exits 0 there.
- [ ] No answer of a Mini App method on production carries `meta.source = stub`; native-only methods answer `native`.
- [ ] The "demo data" marker is not shown on any screen in any of the four Telegram clients on production.
- [ ] `RADAR_MATCHING_ENABLED` is still `false` on production (the bot's sending package, WP-57, switches it on).
- [ ] The checklist of part D was run on iOS, Android, Desktop and Web, in cookie mode and header mode, with
      screenshots in the PR, and the reviewer signed it.
- [ ] `docs/api/README.md` and the queue reflect the new state; the landing features are named as still pending
      (WP-60).

## Handoff

Empty.
