# KV-BE-012 — Legacy OpenAPI document, part 1

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend (track: development) |
| Complexity | M |
| Feature IDs | F-COMPAT-001 |
| Dependencies | KV-BE-001 |

## Goal

A hand-written OpenAPI 3.1 document `docs/api/kvadro-legacy.openapi.yaml` describes the legacy surface as `08` fixes it:
the shared models with every strictly-read key marked `required` (nullable where `08` allows `null`), the common error
body, the `FilterQuery` parameters, and the read-path endpoints API-001…API-010 plus RES-001, RES-002 and RES-005. It is
the frozen contract M2 is built and reviewed against; it is never fed to the generated TypeScript client.

## Legacy reference

- Contract source: `08` §1.1–§1.8 and rows API-001…API-010, RES-001, RES-002, RES-005; literal schemas in
  `$KVADRO_ROOT/docs/api.md` §3–§4 (e.g. `MetaResponse` `api.md:423-452`, `CityMeta` `:454-463`, `CityStats`
  `:472-485`, `ListingPreview` `:227-273`, `ListingDetails` `:275-353`, `FeedPage` `:355-366`); query building
  `$KVADRO_ROOT/demo/app/src/lib/api/feed.js:10-66`; strictness reasons LB-API-005, LB-API-009, LB-API-011, LB-API-012.
- No legacy spec is published (`$KVADRO_ROOT/demo/app/docs/RECOVERY.md:16`); legacy wants it fixed before
  implementation (`$KVADRO_ROOT/docs/about.md:404`).
- Decision CF-020 A (`10` §3.20); machine-readable twin `docs/migration/data/api-inventory.json`; golden fixtures and
  model descriptions of KV-QA-002 (`backend/tests/Fixtures/Legacy/models/`) must agree with this document.

## Implementation

1. Read `08` §1 completely, `15` §2.1 and §2.4, and `.claude/skills/scramble-development/` (only to keep the legacy
   document out of Scramble: `backend/config/scramble.php:23` stays `api/v1`).
2. Create `docs/api/kvadro-legacy.openapi.yaml` (`openapi: 3.1.0`, `info.title: kvadro² legacy surface (frozen)`,
   `info.version` = contract freeze date or `draft`, `servers: [{url: https://app.kvadro.app}]`, a description pointing
   to the ADR of KV-BE-001 and to `08`).
3. `components.securitySchemes.tma`: `type: apiKey, in: header, name: Authorization` with the description
   "`tma <initData>`, verified per SEC-REQ-001"; global `security: [tma: []]`, overridden to `[]` on API-003 and the RES
   paths.
4. `components.schemas`: `Error` (`{detail: string}`, required), `ListingPreview` (every field of `08` §1.8, required =
   the `!` keys: `id` integer, `favorite`, `photos_preview` array, `metro_km`, `center_km`, `median_delta` nullable
   numbers; enums for `price_kind`, `median_tone`), `ListingDetails` (`allOf` ListingPreview + its fields; required:
   `sources`, `history[].price_usd`, `history[].change_pct`, `nearby[].kind` enum `park|school`, `facts[]` with
   `key/label/value`), `FeedPage` (`items`, `next_cursor` required nullable), `SearchFilters` (exactly 25 properties,
   `additionalProperties: false`, all required except `zones` on input), `MetaResponse`, `CityMeta`, `CityStats`
   (`counts` with the three deal keys required), `FlowResponse`, `MapResponse`, `CountResponse`, `CallLink`
   (`{url}`), `TranslateResponse` (`{text}`).
5. `components.parameters`: one parameter per `FilterQuery` key of `08` §1.7 with `style: form, explode: true` for the
   repeated keys (`types`, `districts`, `renovation`, `appliances`, `zones`), booleans as `enum: ["true"]` where only
   `=true` is sent, `polygon` as a pattern string; feed-only `limit`, `sort`, `cursor`.
6. Paths API-001…API-010 with every status of their "Response" and "Errors" fields (e.g. API-001: `200`, `401`, `403`
   with `detail` enum `private|invite|full|blocked|join`, `429`, `500`; API-008: `200`, `404`, `422`; `?preview=1`
   response = `ListingPreview`), and RES-001/RES-002 (`image/jpeg`, `404`), RES-005 (`text/html`, expiry page). Each
   operation carries `x-legacy-id: API-NNN` and `x-evidence` with the `08` anchor.
7. Add a lint test (no new dependency): `backend/tests/Unit/Docs/LegacyOpenApiDocumentTest.php` parses the YAML with
   `Symfony\Component\Yaml\Yaml` — present today only transitively (required by `laravel/ai` in `composer.lock`);
   declaring it as a direct dev requirement is "PROPOSED — needs first developer approval (dependency change)"; if that
   is refused, keep the document as JSON (`.openapi.json`) and parse it with `json_decode`. The test checks: every
   `$ref` resolves, every `x-legacy-id` of part 1 is present, `SearchFilters` has 25 properties, required lists match
   the strict keys of `08` §1.8.
8. Pint (for the test), PHPStan, tests.

## Files

- `docs/api/kvadro-legacy.openapi.yaml` (new)
- `backend/tests/Unit/Docs/LegacyOpenApiDocumentTest.php` (new)
- `docs/api/README.md` or `docs/api/kvadro-legacy.md` (one paragraph: what the document is, that it is hand-written and
  frozen)

## API contract

This task writes the contract of API-001…API-010, RES-001, RES-002, RES-005 exactly as `08` states it, including:
`GET /api/meta` → `MetaResponse` (`locale` `ru|uz_Latn|en`, `locale_chosen`, `currency` `USD|UZS`, `usd_uzs`, `theme`
`auto|light|dark`, `city`, `city_chosen?`, `analytics` nullable object, `max_subscriptions?`, `bot_username`, `tiles`,
`new_features?`, `cities?`, `districts`, `zones`, `renovations`, `appliances`, `price_presets`, `locales`);
`GET /api/cities` → `CityStats[]`; `GET /api/bot` → `{username: string, support: string|null}` without auth;
`GET /api/feed` → `FeedPage`; `/api/feed/count` → `{count}`; `/api/feed/flow` → `{week, days (≥ 1), options?[{code,
label, rate, filters}]}`; `/api/map` → `{points[{id, lat, lon, label, tone?, priced?, usd?}], total?}`;
`/api/listings/:id` → `ListingDetails`; `/call` → `{url}`; `translate` → `{text}`; errors `{"detail": string}`.

## Business rules

Documents BR-API-017…024, BR-API-039…041, BR-API-048, BR-API-071…074, BR-API-112, BR-API-113, BR-API-143, BR-API-151,
BR-API-154 and the strictness defect fixes LB-API-004, LB-API-005, LB-API-009, LB-API-011, LB-API-012, LB-API-016,
LB-API-023 (uniform `404` on `/media`). DEV rows are not encoded as contract changes; where a `PROPOSED` DEV would alter
a response (DEV-007 phones), the document keeps the legacy shape and notes the DEV id in `description`.

## Acceptance criteria

- The document parses; every `$ref` resolves; API-001…API-010, RES-001, RES-002, RES-005 are present with every status
  code from their `08` rows.
- Required lists equal the strict keys of `08` §1.8; `SearchFilters` has exactly 25 properties.
- The KV-QA-002 model files and this document agree (a reviewer cross-check in the PR, or a test if KV-QA-002 is
  merged first).
- Scramble still documents only `api/v1`.

## Tests

`backend/tests/Unit/Docs/LegacyOpenApiDocumentTest.php`:
- `it('parses and resolves every reference')`.
- `it('documents every part-1 endpoint with its x-legacy-id')` (dataset API-001…API-010, RES-001, RES-002, RES-005).
- `it('marks the strict ListingPreview keys as required')`, `it('defines SearchFilters with exactly 25 properties')`.
- `it('limits the 403 detail of api/meta to the five reasons')`.
- `it('declares no security on api/bot and the media paths')`.

## Edge cases

- `Subscription.id` is `number|string` in legacy (`08` §1.8) — part 2 types it `integer` for HOMI output (CF-003) and
  documents the legacy union in `description`.
- `median_metric` values (`m2`, `person`, others) and `median_scope` are open strings with documented known values,
  not closed enums (closing them would reject legitimate legacy values).
- The map `label` must be documented as plain text with a pattern excluding `<`, `>`, `&`, quotes (SEC-REQ-018).

## Security

SEC-REQ-018 (label pattern), SEC-REQ-019 (`call_url`, `contact_url` documented as `https://` / relative only),
SEC-REQ-005 (`/api/bot` anonymous); no example contains real `initData`, phones or ids — synthetic placeholders only
(`+998000000000`).

## Definition of done

Tests green (`make ci-backend`), parity gate items ticked (15 §4), docs and the feature row in 09 updated, PR reviewed
by the other developer. Additionally: document committed with `info.version: draft` until DEC-01 sets the freeze date;
`10` CF-020 row points at the file.
