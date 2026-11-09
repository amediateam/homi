# KV-BE-017 — Legacy filter query parsing and form-request base

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend (track: development) |
| Complexity | M |
| Feature IDs | F-FILTER-001, F-COMPAT-001 |
| Dependencies | KV-BE-016, KV-BE-005; questions Q-API-007, Q-API-008, Q-API-012 |

## Goal

The four search endpoints of the legacy surface (feed, count, flow, map) read the query string exactly as the legacy
client builds it with `URLSearchParams` — repeated keys, `+` for spaces, the literal string `undefined` — turn it into
one `SearchFilters` through the shared normaliser, and answer every rejection as `422 {"detail": "invalid_<field>"}`,
never `500`.

## Legacy reference

- Query construction and key order: `$KVADRO_ROOT/demo/app/src/lib/api/feed.js:10-66` (`buildFilterParams`), feed-only
  `limit=20`, `sort`, `cursor` at `feed.js:75-85`; table in `08` §1.7.
- Repeated keys must all apply (BR-API-025: `types`, `districts`, `renovation`, `appliances`, `zones`); booleans sent
  only as `=true`, `furnished` tri-state (BR-API-026); `city`, `deal`, `owner` always present (BR-API-027); a missing
  scalar is sent as the string `undefined` and a missing array throws client-side (`08` §1.7, LB-API-005).
- `polygon` serialised `lat,lon;lat,lon;…`, 3–40 vertices, 5 decimals (BR-API-034; `$KVADRO_ROOT/demo/app/src/lib/geo/polygon.js:235`).
- Legacy validation: invalid `deal` → `422` Pydantic body (`$KVADRO_ROOT/docs/telegram-bot.md:977`; BR-API-018); the
  client reads `detail` only when it is a string (`$KVADRO_ROOT/demo/app/src/lib/api/client.js:87-97`), so the
  `invalid_<field>` string is compatible (LB-API-022, `10` §4.7).
- Limits of other parameters unknown (Q-API-007); cursor semantics and maximum `limit` unknown (Q-API-008).

## Implementation

1. Read `.claude/skills/laravel-best-practices/` (form requests), `08` §1.7 and the KV-BE-005 renderer contract.
2. `php artisan make:class --no-interaction Http/Requests/Legacy/LegacyQueryString` — parses
   `$request->server('QUERY_STRING')` itself (PHP's `$_GET` keeps only the last value of a repeated key without `[]`):
   split on `&`, split each pair on the first `=`, `urldecode` both sides (`+` → space), keep repeats as lists in
   arrival order; ignore empty keys; total length capped at 8 KB (SEC-REQ-017).
3. `php artisan make:request --no-interaction Legacy/LegacyFilterRequest` (abstract base): `authorize()` returns true
   (auth and gate are middleware); `filters(): SearchFilters` builds the raw array from `LegacyQueryString`:
   - list keys (`types`, `districts`, `renovation`, `appliances`, `zones`) → all values; legacy `zone` passed through
     (mapped by the normaliser);
   - scalar keys: the literal `undefined` or an empty value → absent, except `deal` (required → `invalid_deal`);
   - booleans `near_metro`, `below_median`, `floor_not_first`, `floor_not_last`, `pets`, `pets_only`: `true`/`1` →
     true, `false`/`0`/absent → false, anything else → `invalid_<key>`; `furnished`: `true`, `false` or absent (null);
   - numbers: decimal digits only (`rooms_min=-1`, `1e3`, `12abc` → `invalid_<key>`);
   - `polygon`: `lat,lon` pairs separated by `;` → floats; malformed → `invalid_polygon`;
   - calls `SearchFiltersNormaliser::normalise($raw, NormaliseContext::legacy())`; `FilterRejected` →
     `LegacyValidationException("invalid_{$field}")`.
4. Paging parameters in the same base, used only by subclasses that declare them: `limit` (integer; `< 1` →
   `invalid_limit`; `> 50` clamped to 50 — SEC-REQ-017, spec-tested), `sort` (`Search\Sort`; unknown → `invalid_sort`;
   `new` accepted although the client never sends it), `cursor` (≤ 512 chars of base64url; content validated by
   KV-BE-031).
5. Override `failedValidation()` so any rule failure raises `LegacyValidationException` with the first failing field;
   never the ADR-0007 envelope.
6. Concrete subclasses are created by the endpoint tasks (KV-BE-031 `FeedRequest`, KV-BE-032 `FeedCountRequest` /
   `FeedFlowRequest`, KV-BE-033 `MapRequest`); this task adds a test-only route using the base to prove the parser.

## Files

- `backend/app/Http/Requests/Legacy/LegacyQueryString.php`
- `backend/app/Http/Requests/Legacy/LegacyFilterRequest.php`
- `backend/tests/Feature/LegacyApi/LegacyFilterQueryTest.php` (test-only route under `/api/__selftest/filters`, the
  prefix reserved by KV-QA-004)
- `backend/tests/Unit/Http/LegacyQueryStringTest.php`

## API contract

Query of `GET /api/feed|feed/count|feed/flow|map` (`08` §1.7), e.g.
`city=tashkent&deal=rent_long&owner=any&types=apartment&types=house&rooms_min=2&price_max=600&near_metro=true&zones=center&zones=near_center&limit=20`.
Errors: `422 {"detail": "invalid_<field>"}` with `<field>` one of the 25 keys or `limit`, `sort`, `cursor`; body is
JSON, `Content-Type: application/json`, `Cache-Control: private, no-store`. Internal:

```php
abstract class LegacyFilterRequest extends FormRequest {
    public function filters(): SearchFilters;          // throws LegacyValidationException
    public function limit(int $default = 20): int;
    public function sort(): Sort;                       // Sort::New when absent
    public function cursor(): ?string;
}
```

## Business rules

- Kept: BR-API-025, BR-API-026, BR-API-027, BR-API-034, BR-API-018 (literal validation → `422`).
- Defect fixes (`APPROVED`): LB-API-022 (string `detail` in `422`), LB-API-028 (`zone=` still accepted), LB-API-005
  (`undefined` handled, never a crash).
- `PROPOSED` rules stay in the normaliser (KV-BE-016): DEV-004, DEV-017, DEV-025.

## Acceptance criteria

- `types=apartment&types=house` yields both types; `zones=center&zones=near_center` both zones (not last-wins).
- `deal=undefined` → `422 {"detail":"invalid_deal"}`; `rooms_min=undefined` → treated as absent; `owner=undefined` →
  `any`.
- `near_metro=true` applied, absent not applied, `furnished=false` applied (tri-state).
- The Q-API-007 probe set (`deal=x`, `limit=0`, `limit=1000`, `rooms_min=-1`, `area_min=0`, 2- and 41-vertex polygons,
  unknown district, SQL-like strings, a 10 KB query) never yields `500`; every rejection is a JSON string `detail`.
- `+` in a value decodes to a space; `%2B` to `+`.

## Tests

- Unit `LegacyQueryStringTest`: repeated keys, order kept, `+` and `%20`, empty pairs, missing `=`, 8 KB cap.
- Feature `LegacyFilterQueryTest` (dataset per row of `08` §1.7): each list key repeated; each boolean `true`/`false`/
  `1`/`yes`; `furnished` three states; `undefined` per key; polygon 3 and 40 vertices, 2 and 41, malformed pairs;
  `limit` 0/1/20/50/1000; `sort` each value and `foo`; `cursor` too long; probe set above with
  `assertLegacyError(422, …)` from KV-QA-004.
- Contract: the request strings of the parity mocks (`$KVADRO_ROOT/demo/app/tools/parity/mocks-filters.mjs:32`) parse
  to the same normalised filters as the equivalent arrays (spec-tested).

## Edge cases

- Keys with `[]` (`types[]=apartment`) are not sent by the legacy client; they are treated as unknown keys and dropped.
- The prefetch path sends the same URL string as later calls; parsing must not depend on key order.
- A cursor given to `count`, `flow` or `map` is ignored (only the feed declares paging parameters).
- `city` absent → `tashkent` (client fallback) for the legacy surface only.

## Security

- SEC-REQ-017: bounded query size, closed enums, numeric parsing without `intval` coercion of junk, polygon validity.
- No query value is logged; the request id is (SEC-REQ-047).
- `initData` is never accepted from the query (SEC-REQ-003): `tgWebAppData` in the query is an unknown key and dropped.

## Definition of done

Tests green (`make ci-backend`), parity gate items ticked (15 §4), docs and the feature row in 09 updated, PR
reviewed by the other developer. Pint and PHPStan level 7 clean; the `invalid_<field>` code list is added to the
legacy OpenAPI document (KV-BE-012) in the same PR or noted for it.
