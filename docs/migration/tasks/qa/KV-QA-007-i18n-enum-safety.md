# KV-QA-007 — i18n completeness and enum-safety tests

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | QA (track: development) |
| Complexity | S |
| Feature IDs | F-LOCALE-001, F-LOCALE-002, F-LOCALE-003, F-LOCALE-004, F-ONBOARD-002, F-SETTINGS-001 |
| Dependencies | KV-QA-002 (`legacy-i18n-keys.json`); CF-006 decision (`uz_Latn` ↔ `uz`); the backend task that creates `backend/lang/{ru,uz,en}` (ADR-0006) |

## Goal

No missing translation can crash anything: server catalogues are complete in three locales, a missing key falls back
to Russian, and every enum value the server can send to the legacy Mini App exists in that client's dictionary.

## Legacy reference

- The legacy client's `t()` throws on a missing key (`$KVADRO_ROOT/demo/app/src/i18n/index.js:118-121`), and keys are
  built from server values (`subs.mode.*`, `type.*`, `market.v3.rooms<N>`): LB-APP-002 (defect fix in the new client,
  `09` §4.3), LB-APP-015, LB-APP-016, LB-API-006.
- Wire code `uz_Latn` (LB-API-048, CF-006, TMA-008); Telegram `language_code` mapping (BOT-026, Q-BOT-035, DEV-020).
- Server display strings per locale and currency (CF-017, F-LOCALE-003); bot texts in three languages (`04` §7,
  Q-BOT-014).

## Implementation

1. Read ADR-0006 and `15` §3.12.
2. `backend/tests/Unit/I18n/CatalogueParityTest.php`: for every file in `backend/lang/ru`, the same file exists in
   `uz` and `en` with the same key set, non-empty values, the same placeholders (`:name`, `{count}`) and complete plural
   forms. Skips with a reason while `backend/lang` does not exist.
3. `backend/tests/Feature/I18n/MissingKeyFallbackTest.php`: a request in `uz` whose string is missing in `uz` gets the
   Russian text, a single warning is logged per key, the status stays `200`.
4. `backend/tests/Unit/I18n/LegacyEnumSafetyTest.php`: a list (in the test) of every enum the legacy surface emits —
   radar `mode`, filter `types` per deal, `deal`, `sort`, `median_rooms`, `median_tone`, `nearby[].kind`, market codes
   — maps each value to the key pattern the legacy client builds; each key must exist in all three locales of
   `legacy-i18n-keys.json`. When the backend enums exist, the list is read from them, so a new enum case fails the test.
5. `backend/tests/Unit/I18n/LocaleMappingTest.php`: `uz_Latn` ↔ `uz` both ways; `PUT /api/settings` values accepted and
   returned as `uz_Latn`; Telegram `language_code` `ru`, `uz`, `uz-UZ`, `en`, `en-GB`, `kk`, missing → locale per the
   rule decided with DEV-020 (cases `todo` until approved).
6. `backend/tests/Unit/I18n/RussianPluralsTest.php`: 1, 2, 5, 11, 12, 14, 21, 22, 25, 101, 111 with the catalogue's
   plural strings.

## Files

- `backend/tests/Unit/I18n/{CatalogueParityTest,LegacyEnumSafetyTest,LocaleMappingTest,RussianPluralsTest}.php` (new)
- `backend/tests/Feature/I18n/MissingKeyFallbackTest.php` (new)

## API contract

`GET /api/meta` → `locale`, `locales[].code` (`ru|uz_Latn|en`); `GET`/`PUT /api/settings` → `locale` (API-001,
API-024, API-025).

## Business rules

Keep the wire codes of LB-API-048 on the legacy surface; apply the LB-APP-002 fallback rule on the server side; DEV-020
as decided.

## Acceptance criteria

- The five tests exist; on a tree without `backend/lang` they skip with a reason and the run is green.
- `LegacyEnumSafetyTest` fails if a value is added to any listed enum without a legacy dictionary key (checked once by
  adding a fake value in a throw-away commit, noted in the PR).

## Tests

As listed.

## Edge cases

- `uz` Cyrillic is not a supported locale (`04` §7); `uz_Cyrl` from Telegram maps to the default, never an error.
- A locale stored in a migrated user row that is not one of the three (data defect) → default, logged once.

## Security

Catalogue strings are not HTML; the bot escapes them at send time (SEC-REQ-020).

## Definition of done

Tests green (`make ci-backend`), parity gate items ticked (15 §4), docs and the feature rows in 09 updated, PR
reviewed by the other developer.
