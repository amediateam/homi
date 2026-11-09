# KV-QA-002 — Golden fixtures and model shapes from 08 and the parity mocks

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | QA (track: development) |
| Complexity | L |
| Feature IDs | F-COMPAT-001, and every feature of `09` §3 with a non-empty `api_dependencies` cell (F-ONBOARD-001, F-FEED-001, F-FILTER-001 … F-FILTER-007, F-MAP-001, F-MAP-003, F-LISTING-001, F-LISTING-005, F-CONTACT-001, F-SHARE-001, F-FAV-001, F-HISTORY-001, F-HIDE-001 … F-HIDE-003, F-REPORT-001, F-RADAR-001 … F-RADAR-006, F-RADAR-008, F-SETTINGS-001, F-DELIVERY-007, F-ANALYTICS-001) |
| Dependencies | none |

## Goal

Every legacy endpoint API-001 … API-034 has golden fixtures in the record format of `15` §1.2, every shared response
model is described field by field with its strictness, and a self-test proves that the fixtures agree with the models.
The shape matcher written here is reused by the contract harness (KV-QA-004).

## Legacy reference

- Contract: `08` §1.3–§1.8 and the 34 rows of §2 (fields "Response", "Errors", "Tests");
  `$KVADRO_ROOT/docs/api.md` §3–§4 (literal schemas).
- Filter model: `$KVADRO_ROOT/demo/app/src/features/filters/model.js:12-39` (25 keys).
- Shapes and positive values: `$KVADRO_ROOT/demo/app/tools/parity/mocks.mjs:57-131`,
  `$KVADRO_ROOT/demo/app/tools/parity/mocks-filters.mjs`.
- Client strictness: LB-API-005, LB-API-009, LB-API-010, LB-API-011, LB-API-012, LB-API-014.
- Fix decisions: `09` §4.2 (DEV rows) and §4.3 (defect fixes, for example LB-API-015: report always `200 {"hidden"}`).
- Legacy client dictionaries: `$KVADRO_ROOT/demo/app/src/i18n/locales/{ru,uz_Latn,en}.js`.

## Implementation

1. Read `08` §1 completely and `15` §1.2–§1.5, §2.1, §2.4.
2. Write one model file per shared model in `backend/tests/Fixtures/Legacy/models/`: `ListingPreview`,
   `ListingDetails`, `FeedPage`, `SearchFilters`, `Subscription`, `SubscriptionMutationResult`, `MetaResponse`,
   `CityMeta`, `CityStats`, `SettingsResponse`, `HiddenResponse`, `MapResponse`, `FlowResponse`, `ErrorDetail`.
   Per field: `type`, `nullable`, `strict` (the `!` of `08` §1.8), `enum` where documented, `evidence`. Fields the
   client never reads (`08` §1.8, last paragraph) are listed as `unread`.
3. Write `backend/tests/Support/LegacyApi/ShapeMatcher.php` (no new dependency): checks key presence for strict
   fields, JSON types (integer vs float vs string), `null` only where nullable, arrays never `null`, enums, recursive
   models; reports every violation, not only the first.
4. For each endpoint create `backend/tests/Fixtures/Legacy/api/API-NNN/` with at least the positive case and one file
   per documented error status, in the `15` §1.2 format, `source` = `contract` or `mock`. Add the cases named in the
   `08` "Tests" field when they need no server knowledge (for example `next_cursor` on the last page).
5. Where `09` §4 applies, fill `new.deviation` (`DEV-NNN` with `state: PROPOSED`) or mark the case as a defect fix
   (`"fix": "LB-…"`), so the harness knows what to expect (`15` §1.4).
6. Sanitise everything copied from the mocks: phone values `+998000000000` / `+998 00 000 00 00`, author labels
   `+998 00 ••• •• 00`, channel handles `example_channel`, post links `https://t.me/example_channel/1`, photo URLs
   `/media/1/10.jpg?e=0&s=` + 32 zeros.
7. Write `backend/tests/Fixtures/Legacy/index.json`: endpoint → method, path, fixture files, models.
8. Write `scripts/qa/extract_legacy_i18n_keys.py` (Python standard library, read-only on the legacy tree) and commit
   its output `backend/tests/Fixtures/Legacy/legacy-i18n-keys.json` (key paths per locale; no values needed).
9. Write `backend/tests/Unit/Legacy/FixturesTest.php`: every fixture validates against its model; API-001 … API-034
   each have ≥ 1 fixture (compared with `docs/migration/data/api-inventory.json`); every fixture has `evidence`; a PII
   scan finds no phone outside the `+998 00` placeholder, no `hash=`, `auth_date=` or `tgWebAppData`.

## Files

- `backend/tests/Fixtures/Legacy/models/*.json` (14, new)
- `backend/tests/Fixtures/Legacy/api/API-001/` … `API-034/` (new)
- `backend/tests/Fixtures/Legacy/index.json`, `legacy-i18n-keys.json` (new)
- `backend/tests/Support/LegacyApi/ShapeMatcher.php` (new)
- `backend/tests/Unit/Legacy/FixturesTest.php`, `ShapeMatcherTest.php` (new)
- `scripts/qa/extract_legacy_i18n_keys.py` (new)

## API contract

The fixtures are the contract in executable form: methods, paths, statuses, bodies and error bodies of API-001 …
API-034 exactly as `08` §2 describes them.

## Business rules

Keep: BR-API-017 (`{detail}` errors), BR-API-020 (no empty `200`), BR-API-021 (`409 no_chat`), BR-API-022 and
BR-API-023 (`next_cursor`), BR-API-151 (UTC `Z`), BR-API-154 (USD values). Apply: the defect fixes of `09` §4.3 that
touch response shapes (LB-API-003, LB-API-004, LB-API-005, LB-API-007, LB-API-009, LB-API-010, LB-API-014,
LB-API-015); DEV rows stay `PROPOSED`.

## Acceptance criteria

- 34 of 34 endpoints have fixtures; 14 models exist; every `!` field of `08` §1.8 is `strict: true`.
- `SearchFilters` has exactly the 25 keys of `08` §1.7.
- `FixturesTest` and `ShapeMatcherTest` are green on SQLite.
- The PII scan passes; every fixture names its evidence.

## Tests

- `ShapeMatcherTest`: a missing strict key, a string id, a float id, a `null` array, an unknown enum value and an extra
  unread key each produce the expected result (fail, fail, fail, fail, fail, pass with a note).
- `FixturesTest` as in step 9.

## Edge cases

- `08` allows `id: number|string` for subscriptions and map points; the model follows `08`, the listing id stays
  integer-only (LB-API-011).
- `median_metric` is `m2 | person | other` in the docs and `unit` in the mocks (`08` §4.3 item 5): both allowed.
- `GET /api/bot` has no auth; its fixtures carry `auth: none`.
- `POST /api/events` fixtures cover both producers (boot script and app) and an unknown event name.

## Security

No real data; the PII scan is part of the test (`15` §1.7). Fixtures never contain `initData`, tokens or secrets.

## Definition of done

Tests green (`make ci-backend`), parity gate items ticked (15 §4), docs and the feature rows in 09 updated (fixture
paths in the acceptance tests where useful), PR reviewed by the other developer.
