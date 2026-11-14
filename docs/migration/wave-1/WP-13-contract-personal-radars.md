# WP-13 — Contract: personal lists, reports, surveys, radars, landing

| Field | Value |
| ----- | ----- |
| Stage | A |
| Status | TODO |
| Depends on | WP-12 |
| Size | about 2 800 changed lines without generated files and fixtures, L |
| Behaviour reference | `25` §4.2, §5, §7; `08` rows of API-011 … API-016, API-018 … API-023, API-026 … API-033 and RES-010 … RES-013, §1.8 (`Subscription`, `SubscriptionMutationResult`); `02` BR-API-086, BR-API-101, Q-API-064; `03` §4 (BR-APP-036 … BR-APP-049, BR-APP-063, BR-APP-073); `15` §3.1, §3.4; tasks `tasks/backend/KV-BE-038-…` … `KV-BE-044-…`, `KV-BE-100-…` … `KV-BE-106-…`, `KV-BE-154-…`, `KV-BE-155-…` (rules only) |
| Needs from the production track | nothing |

## Goal

The remaining methods of `25` §4.2 exist as stub routes with final shapes: favourites, history, hidden listings,
blocked authors, the hidden list, reports, the two survey methods, the six radar methods and the two landing methods.
With WP-11 and WP-12 the whole `/api/v1` surface of Wave 1 is fixed, exported and typed.

## Scope

In: routes, requests, resources, fixtures and stub controllers for the methods below; `LandingSource` with its stub
driver and the features `source.landing.live` and `source.landing.pins`.

Out: tables, services, policies and real behaviour (WP-44 personal lists, WP-45 radars, WP-60 landing data). The stub
controllers are stateless: a write validates and answers, a later read returns the same fixture.

## Decisions that bind this package

- Personal data and radars are native from the start (DEC-42, DEC-43): these methods have no feature; they answer
  from fixtures now and from HOMI's tables after stage C, with `meta.source` telling which.
- Explicit `PUT` and `DELETE` replace the legacy favourite toggle, so a repeated request cannot flip the state
  (`25` §4.2).
- Radars and blocked-author entries have HOMI's own identifiers (ULID strings); listings keep their number.
- Reports and votes are stored and applied in HOMI only (DEC-48).
- Brand (DEC-40): the survey answer legacy calls `kvadro` is `homi` here.
- A foreign identifier answers exactly like an unknown one: `404 not_found` (SEC-REQ-014).
- Favourites and history are paged by 20 with the cursor of the feed (DEC-53). This is the paging part of DEV-003,
  on by decision and without a flag; a cap on the length of the history is not introduced.
- Radars cannot be created or changed while `config('radar.creation_enabled')` is false (DEC-51; the key of WP-11,
  reported by `GET /reference` as `radars_enabled`). The switch is HOMI's configuration, not a property of a
  driver, so the stub controllers of this package obey it exactly as the real code of WP-45 will.

## Design

All paths are under `/api/v1`. Unless a row says otherwise: bearer, `app:read` for `GET`, `app:write` for the rest.
`success` and `meta.source` are left out of the examples; a `204` has no body. Common errors: `401 unauthenticated`,
`403 access_denied`, `422 validation_failed`, `429 rate_limited`. `{number}` is a positive integer; a malformed or
unknown number is `404 not_found`. "Preview" is the listing preview object of WP-12.

### Favourites and history — legacy: API-029, API-011, API-030, API-031

| Method | Answer | Notes |
| ------ | ------ | ----- |
| `GET /favorites` | `200`, `data`: previews, newest first; `meta.next_cursor` | the cursor paging of the feed (WP-12): query `cursor` (opaque string, at most 512 characters) and `limit` (1 … 50, default 20); pages hold at most `limit` items and may hold fewer; `null` ends the list. Every item has `favorite: true` |
| `PUT /favorites/{number}` | `200 {"data": {"favorite": true}}` | idempotent; `503 source_unavailable` when the listing cannot be checked and is not known locally |
| `DELETE /favorites/{number}` | `200 {"data": {"favorite": false}}` | idempotent; never `404` for a listing that was not a favourite |
| `GET /history` | `200`, previews by last view, newest first; `meta.next_cursor` | the same paging. Items carry `viewed: true` |
| `DELETE /history` | `204` | clears the whole history; idempotent |

Changed against legacy: the toggle `POST …/favorite` became `PUT` and `DELETE`; and both lists are paged by 20
with a cursor, like the feed (DEC-53) — legacy returns each list whole in one answer with `next_cursor: null`. The
length of the history is not capped (that part of DEV-003 is undecided). The stub cuts its pages from the fixture
with the cursor form of the stub feed (`s1.<offset>`); a cursor that does not decode ends the list quietly (empty
`data`, `null` cursor), as on the feed (WP-42). Withdrawn listings stay in the lists with `status_text`, listings
the source no longer knows are left out. Scenarios: `empty` for both lists.

### Hidden listings, blocked authors, the hidden list — legacy: API-012 … API-015, API-026 … API-028

| Method | Answer | Notes |
| ------ | ------ | ----- |
| `PUT /hidden/listings/{number}` | `204` | idempotent |
| `DELETE /hidden/listings/{number}` | `204` | idempotent; also the undo after a `fraud` report |
| `PUT /listings/{number}/blocked-author` | `200`, body below | blocks the author of that listing; idempotent (same body); `404 not_found` when the listing has no author |
| `DELETE /listings/{number}/blocked-author` | `204` | undo by listing; idempotent |
| `GET /hidden` | `200`, body below | both arrays always present |
| `DELETE /hidden/authors/{id}` | `204` | `{id}` is the entry id; a second call or a foreign id → `404 not_found` |
| `DELETE /hidden` | `204` | clears hidden listings and blocked authors of the caller |

```json
{"data": {"id": "01JD0000000000000000000011", "kind": "phone", "label": "+998 ** *** ** 67", "count": 3,
          "listing_numbers": [100012, 100020, 100031]}}
{"data": {"listings": [{"…": "preview"}],
          "authors": [{"id": "01JD0000000000000000000011", "kind": "phone", "label": "+998 ** *** ** 67", "count": 3}]}}
```

`kind` is `phone` or `source`; `label` is plain text (a phone masked to its last two digits, or `@channel`);
`listing_numbers` are the author's listings HOMI knows, to hide at once on the client, and may omit the listing
asked for; `count` drives the hint "hides N listings" from 20 up (BR-APP-037). Changed: `POST` became `PUT`;
`listing_ids` became `listing_numbers`; entry ids are ULID strings; `DELETE /hidden/{id}` became
`DELETE /hidden/authors/{id}`. Scenario: `empty` for `GET /hidden`.

### Reports — legacy: API-016

`POST /listings/{number}/reports`

| Body field | Type | Rule |
| ---------- | ---- | ---- |
| `reason` | string | required; `rented`, `agent`, `wrong_data`, `fraud` |
| `detail` | string | optional; `price`, `rooms`, `place`, `photos`, `other`; allowed only with `reason: wrong_data` |

The detail comes from the third step of the report sheet (SCR-023, BR-APP-036): the Mini App sends `wrong_data`
only with a `detail`, and the other reasons without one (BR-API-101). The server still accepts `wrong_data` without
`detail`, as legacy must for older bundles. A `detail` with another reason, or an unknown code, is `422` with
`detail` in `errors`. Q-API-064 asks what legacy does with the detail; HOMI's reports are its own (DEC-48), so here
the detail is stored for review and changes nothing: `wrong_data` answers `hidden: false` with or without it.

Answer `200 {"data": {"hidden": true}}` for every reason, never `204` (fix of LB-API-015). `hidden` is `true` for
`rented` and `fraud` (the listing is hidden for the reporter; `fraud` can be undone through
`DELETE /hidden/listings/{number}`), `false` for the other two. A repeat with the same reason is counted once and
answers the same, whatever its `detail`. Changed against legacy: `POST …/report` became `POST …/reports`; the body
and the codes are the legacy ones. Stub: `hidden` follows the reason.

### Surveys — legacy: API-032, API-033

| Method | Body | Answer |
| ------ | ---- | ------ |
| `POST /surveys/found` | `answer`: `homi`, `elsewhere`, `searching`, `stopped`; `trigger`: `pause`, `delete` — both required | `204` |
| `POST /surveys/found/where` | `where`: `telegram`, `olx`, `site`, `agent`, `friends`, `street`, `other` — required | `204` |

Extra keys are ignored; an unknown value is `422`.

### Radars — legacy: API-018 … API-023

The radar object:

```json
{"id": "01JD0000000000000000000001", "active": true, "mode": "instant", "hidden": 0,
 "created_at": "2026-11-10T06:00:00+00:00", "filters": {"…": "the 25-key filters object of WP-12"},
 "preview": {"items": [{"…": "preview"}], "count": 34, "flow": {"week": 21, "days": 7}}}
```

`mode` is `instant` or `digest`; `hidden` is the number of listings the radar's hide rules suppress; `filters`
always has all 25 keys with valid `types` for the `deal`; `preview` is present only when asked for and is `null` when
it could not be computed (`items` at most 5, `count` and `flow` may be `null`).

**The switch (DEC-51).** While `config('radar.creation_enabled')` is false — the default; staging and production
stay there until the bot's sending package switches it on (WP-57) — `POST /radars`, `PUT /radars/{id}`,
`PATCH /radars/{id}` and `POST /radars/{id}/relax` answer `403 radars_disabled` and change nothing;
`GET /radars` answers `200` with `data: []`, with and without `include=previews`; `DELETE /radars/{id}` works as
described below. The route middleware `App\Http\Middleware\EnsureRadarsEnabled` on the four write routes throws
`App\Exceptions\Radar\RadarsDisabled` (an `ApiException` of WP-10: 403, `radars_disabled`) after authentication
(and, from WP-40 on, the access gate) and before validation or any lookup of the radar. The stub controllers sit
behind the same middleware and answer the empty list themselves: with the switch off no fixture and no scenario
is used.

| Method | Request | Answer |
| ------ | ------- | ------ |
| `GET /radars` | query `include=previews` (optional) | `200`, `data`: radar objects in creation order; `[]` when there are none and while the switch is off |
| `POST /radars` | `filters` (object, required, normalised by the filter rules of WP-12), `entry` (required: `filters`, `empty`, `few`, `prompt`, `feed`, `return`), `relaxed` (optional, `[a-z_]{1,32}`) | `201` (created) or `200` (existing or reactivated) with the mutation result |
| `PUT /radars/{id}` | `filters` (required), `relaxed` (optional) | `200`, mutation result; replaces the filters, keeps `active` |
| `PATCH /radars/{id}` | exactly one of `active` (boolean), `mode` (`instant`, `digest`), `unhide` (`true`) | `200 {"data": {"radar": {…}, "starter": 2, "ask_found": false}}`; `starter` only for `active: true`, `ask_found` only for `active: false` |
| `DELETE /radars/{id}` | — | `200 {"data": {"ask_found": false}}`; a second call → `404 not_found` |
| `POST /radars/{id}/relax` | `code` (required, a code from `options`) | `200 {"data": {"radar": {…}, "starter": 3}}` |

The mutation result of `POST` and `PUT`:

```json
{"data": {"radar": {"…": "radar object"}, "kind": "created", "starter": 0,
          "options": [{"code": "price_more", "label": "до $700", "rate": "≈5 в день", "count": 12}],
          "relaxed": [{"text": "обычно 2 в день"}]}}
```

- `kind`: `created`, `existing` (an active radar with the same filters exists; nothing was written — the client
  shows "already on"), `reactivated` (a paused one was switched on), `updated`.
- `starter` is the number of matching listings sent to the chat now; `options` and `relaxed` are always arrays;
  `options` is filled only when `starter` is 0.
- "The same filters" ignores `posted_days` and the order of keys and arrays (BR-APP-012).

Radar errors, each with its own code so the client can tell them apart (fix of LB-API-033):

| Status and code | When |
| --------------- | ---- |
| `403 radars_disabled` | the switch is off (above): every `POST`, `PUT`, `PATCH` and relax, whatever its body; never `GET` or `DELETE` |
| `409 no_chat` | the bot cannot write to the user; checked before any write on `POST`, `PUT`, `PATCH {active: true}` and relax; nothing is changed |
| `409 radar_limit` | creating or switching on would exceed `limits.radars` of `GET /reference`; `message` names the limit |
| `409 radar_duplicate` | `PUT` or relax would make the radar equal to another radar of the user |
| `422 validation_failed` | bad filters (`errors.filters.<key>`), bad `entry`, a `PATCH` body with no or several keys, `unhide: false`, unknown `code` |
| `404 not_found` | unknown or foreign `{id}` |

Changed against legacy: `subscriptions` became `radars`; ids are ULID strings; `hidden` kept its name;
`subscription` in results became `radar`; create-or-reactivate moved from the client to the server and reports its
outcome in `kind`; `DELETE` always answers JSON; previews are part of the list on request instead of three requests
per radar (fix of LB-API-038); `403 radars_disabled` and the empty list of the switched-off state are new (legacy
has no such switch). Scenarios: `empty` (list); `no_chat`, `radar_limit`, `radar_duplicate` (writes);
`existing`, `starter` (create with `starter: 3`), `few` (create with options), `ask_found` (pause and delete: the
stub sets `ask_found: true` in the answer, no extra fixture).

### Landing — legacy: the public data files (RES-010 … RES-013)

Public, no token, cacheable; display names follow `Accept-Language`.

| Method | Query | Answer |
| ------ | ----- | ------ |
| `GET /landing/live` | — | body below |
| `GET /landing/pins` | `deal`: `rent` (default) or `sale` | body below |

```json
{"data": {"now": "2026-11-14T09:00:00+00:00", "generated_at": "2026-11-14T08:45:00+00:00", "day": 148, "week": 1012,
          "latest": [{"number": 100012, "rooms": 2, "price_usd": 600, "delta_pct": -12, "tone": "good",
                      "district": {"code": "yunusabad", "name": "Юнусабадский"}, "area": 54,
                      "seen_at": "2026-11-14T08:40:00+00:00", "link": "https://t.me/homi_stub_bot?startapp=l_100012-web"}],
          "sheet": {"all": {"count": 4120, "per_day": 148.0}, "demo": {"count": 310, "per_day": 11.5}}}}
{"data": {"generated_at": "2026-11-14T08:45:00+00:00", "bargains_week": 37,
          "pins": [{"number": 100012, "x": 41.2, "y": 63.5, "rooms": 2, "price_usd": 600, "delta_pct": -12, "tone": "good",
                    "area": 54, "floor": 3, "floors_total": 9, "district": {"code": "yunusabad", "name": "Юнусабадский"},
                    "point": "Мегапланет", "photo_url": "https://cdn.homi.loc/stub/100012/1.jpg?e=0&s=stub",
                    "link": "https://t.me/homi_stub_bot?startapp=l_100012-web", "age_min": 35, "is_owner": true,
                    "in_all": true, "in_rooms": true}],
          "medians": [{"district_code": "yunusabad", "rooms": 2, "median_usd": 680, "n": 14}]}}
```

`x` and `y` are percentages on the landing's static map image; `tone` may be `null`; `is_owner` is `true`, `false`
or `null`; `bargains_week` is `null` for `sale`; `medians` is `[]` for `sale`; `link` points at HOMI's bot (brand).
The answers carry no phone, no listing text and no author. Changed: two files by deal became one method with a
parameter; `id` became `number`; `delta` became `delta_pct`; `district` and `district_code` became one object;
`photo` became an absolute `photo_url`; the unused `dots` and `since` are dropped; `generated_at` is new.

### Server classes

- Data objects: `LandingLive`, `LandingPins` (in `App\Services\Sources\Data`); `LandingSource` gains `live()` and
  `pins()`; `StubLandingSource`; the two features with default `stub`.
- Stub controllers on `StubResponder` (WP-11) for every native-only method; each validates through its final form
  request, so the validation rules do not change in stage C.
- Radar bodies reuse `SearchFiltersNormaliser` with `forRadar: true`.
- `EnsureRadarsEnabled` and `RadarsDisabled` (the switch above); the middleware is attached by class to the four
  radar write routes and stays there when WP-45 gives the controllers their real bodies.
- Routes named `api.v1.favorites.*`, `history.*`, `hidden.*`, `listings.blocked-author.*`, `listings.reports.store`,
  `surveys.found.*`, `radars.*`, `landing.*`; `{id}` is constrained with `whereUlid`.

## Files

- `backend/app/Http/Controllers/Api/V1/Personal/{FavoriteController,HistoryController,HiddenListingController,BlockedAuthorController,HiddenController,ReportController,FoundSurveyController}.php`
- `backend/app/Http/Controllers/Api/V1/Radars/{RadarController,RadarRelaxController}.php`,
  `backend/app/Http/Controllers/Api/V1/Landing/{LandingLiveController,LandingPinsController}.php`
- `backend/app/Http/Requests/Api/V1/Personal/{StoreReportRequest,StoreFoundAnswerRequest,StoreFoundWhereRequest,ListPersonalRequest}.php`,
  `backend/app/Http/Requests/Api/V1/Radars/{ListRadarsRequest,StoreRadarRequest,UpdateRadarRequest,PatchRadarRequest,RelaxRadarRequest}.php`,
  `backend/app/Http/Requests/Api/V1/Landing/LandingPinsRequest.php`
- `backend/app/Http/Resources/Api/V1/{FavoriteStateResource,BlockedAuthorResource,BlockedAuthorResultResource,HiddenOverviewResource,ReportResultResource,RadarResource,RadarMutationResource,RadarPatchResource,LandingLiveResource,LandingPinsResource}.php`
- `backend/app/Services/Sources/Data/{LandingLive,LandingPins}.php`, `backend/app/Services/Sources/Stub/StubLandingSource.php`,
  `backend/app/Services/Sources/Contracts/LandingSource.php`, `backend/config/sources.php`
- `backend/routes/api.php`; `backend/app/Http/Middleware/EnsureRadarsEnabled.php`,
  `backend/app/Exceptions/Radar/RadarsDisabled.php`
- `backend/resources/fixtures/v1/favorites/{default,empty}.json`, `history/{default,empty}.json` (`default` holds
  25 entries each, so a second page exists),
  `hidden/{default,empty,blocked_author}.json`, `radars/{list,list.previews,empty,created,existing,starter,few,patched,relaxed}.json`,
  `landing/{live,pins.rent,pins.sale}.json`
- `backend/tests/Feature/Api/V1/Personal/*ContractTest.php`, `Radars/*ContractTest.php`, `Landing/*ContractTest.php`
- `docs/api/openapi.json`, `frontend/packages/types/src/generated/api.ts`, `docs/api/README.md` (the method table)

## Steps

1. Read the legacy rows named above and the rule sections of the task files; take no routes or serializers from them.
2. Tests first per group: favourites and history; hidden and blocked authors; reports and surveys; radars; landing.
3. Favourites and history controllers with `ListPersonalRequest` (cursor, limit), the page cut of the stub, and
   fixtures of 25 entries each that reuse catalogue numbers of WP-12 (its catalogue has 45).
4. Hidden, blocked author and the hidden list.
5. Reports and the two survey methods.
6. Radar requests, resources and the stub controller; the fixtures cover three radars (one paused, one digest, one
   with `hidden: 3`) and the scenario bodies. `RadarsDisabled`, `EnsureRadarsEnabled` on the four write routes, the
   empty list of the switched-off state.
7. `LandingSource`, the stub driver, the two public routes.
8. Export OpenAPI, generate types; check in the generated file that the radar item, the mutation result and the
   error codes are typed. Add the full method table of `25` §4.2 with route names to `docs/api/README.md`.
9. Pint, PHPStan, both CI gates.

## Behaviour to reproduce

- Favourite: the answer is the source of truth for the heart (BR-APP-039); an error rolls the optimistic state back.
- Favourites and history load 20 at a time and continue on scroll. Legacy returns the whole list at once
  (BR-API-023); HOMI pages them by decision (DEC-53).
- Hide, block and `fraud` have undo; `rented` has none (BR-APP-036); the `agent` reason is not offered by the client
  when the card says `is_owner: false`, but the server accepts it.
- `entry` says where a radar was turned on and is kept for statistics only (BR-API-086): `filters` (filters sheet),
  `empty` (new-radar sheet from «+» or the empty radar tab), `few` (few-results note), `prompt` (follow nudge) and,
  since legacy release `index-DY_DH7h-.js`, `feed` (the radar card in the feed, SCR-047) and `return` (the return
  banner, SCR-046) — sent directly for custom filters, or by the new-radar sheet opened from them (BR-APP-073).
- Radar on: an identical active radar answers `existing`; an identical paused one is reactivated (BR-APP-041);
  `starter`, `options` and `relaxed` drive the three toasts; the "widen" action sends the option's `code` to relax
  (BR-APP-042).
- `no_chat` is reported before anything is written, so the client's single repeat after the user grants write access
  creates exactly one radar (`15` §3.4 row 2).
- Pause and delete may ask for the survey through `ask_found` (BR-APP-048, BR-APP-049).
- Radar previews: at most five newest items, the count and the flow per radar (BR-APP-063).
- Legacy lets a user create a radar at any time. In HOMI every radar write is refused with `radars_disabled` and the
  list is empty until the switch is on (DEC-51); deleting stays possible, so nothing can be left behind.

## Tests

- Favourites: `PUT` twice → `true` twice; `DELETE` twice → `false` twice; list key set, `favorite: true` on every
  item; the first answer has 20 items and a cursor, following it gives the other 5 and `null`, 25 distinct numbers
  in all; `limit=5` → 5 items; `limit=0` and `limit=51` → `422`; a cursor that does not decode → an empty page with
  `null`; `abc` and `0` as number → `404`.
- History: list shape; the same page walk; `DELETE` → `204` twice.
- Hidden: `PUT` and `DELETE` → `204`, repeatable; blocked author body with `listing_numbers` as integers; `GET
  /hidden` with both arrays in `default` and `empty`; `DELETE /hidden/authors/{id}` with a non-ULID → `404`.
- Reports: dataset of four reasons → `200` with `hidden` as specified; `wrong_data` with each of the five details
  and without one → `200`, `hidden: false`; `reason: "spam"`, missing body, `detail: "floor"`, `detail` with
  `rented`, `agent` or `fraud` → `422` with the field named; `detail: null` counts as absent.
- Surveys: 4 × 2 answers and 7 places → `204`; unknown values → `422`; extra keys accepted.
- Radars: list with and without `include=previews`; create → `201` with the exact key set and a 25-key `filters`;
  each of the six `entry` values accepted, `entry: "banner"` and a missing `entry` → `422`;
  each scenario gives its status and code; `PATCH` with `{}`, two keys, `mode: "weekly"`, `unhide: false` → `422`;
  `DELETE` → `200` with `ask_found`; relax with an unknown code → `422`.
- Radars with `radar.creation_enabled` off (set through `config()` in the test; `phpunit.xml` keeps it on for
  every other case): `POST`, `PUT`, each of the three `PATCH` bodies and relax → `403` with code `radars_disabled`,
  also with an invalid body and with a write scenario in the header; `GET /radars` → `[]` with and without
  `include=previews`; `DELETE` → `200`; without a token still `401`.
- Landing: both methods without a token; `deal=sale` → `bargains_week: null`, `medians: []`; `deal=x` → `422`; no key
  named `phone`, `text` or `author` anywhere in the answers.
- Contract: every method of `25` §4.2 is a path in `docs/api/openapi.json` (a test compares the route list with a
  hard-coded table of the 39 method–path pairs); `pnpm types:check` is clean.

## Acceptance checklist

- [ ] Every method of this package answers as specified with `meta.source = stub`, or `204`.
- [ ] Favourites use `PUT` and `DELETE` and are idempotent; favourites and history page by 20 and end with
      `meta.next_cursor: null`.
- [ ] Radar writes distinguish `no_chat`, `radar_limit` and `radar_duplicate` by code; the result carries `kind`.
- [ ] `POST /radars` accepts the six `entry` values, `feed` and `return` included; reports accept `detail` only as
      one of the five codes and only with `wrong_data`.
- [ ] With `radar.creation_enabled` off every radar write answers `403 radars_disabled`, the list is empty and
      `DELETE` still works; with it on the methods behave as specified.
- [ ] `GET /radars?include=previews` returns the preview object; without the parameter the key is absent.
- [ ] The landing methods are public and contain no personal data.
- [ ] The route list equals the method table of `25` §4.2; OpenAPI and types are regenerated; both CI gates are green.
- [ ] `docs/api/README.md` lists every method with its route name and its Wave 1 driver.
- [ ] Deployed to staging and production; there `RADAR_CREATION_ENABLED` is unset, so `GET /radars` answers `[]`
      and `POST /radars` answers `403 radars_disabled`.

## Handoff

Empty.
