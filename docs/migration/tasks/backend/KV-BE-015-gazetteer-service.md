# KV-BE-015 — Gazetteer service and dictionary code resolution

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend (track: development) |
| Complexity | M |
| Feature IDs | F-PIPELINE-004, F-FILTER-004, F-ONBOARD-001 |
| Dependencies | KV-DB-006, KV-DB-034, KV-BE-014; questions Q-API-012, Q-API-026, Q-DATA-028…030 |

## Goal

One read-side service answers every dictionary question of the legacy surface, the bot and later the pipeline: it
resolves any observed legacy spelling (API code, landing code, SEO slug) to one dictionary row, emits the legacy API
code unchanged on output, returns localised names with `ru` fallback, and serves the directory blocks of `GET /api/meta`
from a cache.

## Legacy reference

- `meta` directories: `cities: CityMeta[]` (`code`, `name`, `center: [lat, lon]`, `zoom?` (`< 11` = region), `metro`,
  `median`, `districts[]`, `zones[]`), top-level `districts`, `zones`, `renovations: Record<deal, {code, name}[]>`,
  `appliances`, `locales` (`08` API-001; `$KVADRO_ROOT/docs/api.md:423-463`; mock `$KVADRO_ROOT/demo/app/tools/parity/mocks.mjs:65-73`).
- Six cities/regions (OPQ-3 in `10` §1.14; `$KVADRO_ROOT/docs/about.md:50`); district slugs and quarters
  (`$KVADRO_ROOT/docs/seo-pages.md:65-129`); zones `center`, `near_center` for Tashkent (BR-API-037).
- Code spellings differ: landing `mirzo_ulugbek` vs SEO `mirzo-ulugbek` (LB-DATA-001, `06` §5.1); Q-API-012 (code
  formats, reaction to unknown codes).
- `zoom < 11` marks a region, not a city (LB-API-051; Q-API-026); `cities` empty → Tashkent from top-level
  `districts`/`zones` (`08` API-001).
- Names as plain text without markup (BR-DATA-029); English exonyms Tashkent, Andijan, Kokand, Fergana (LB-BOT-013,
  LB-LND-011 fixes).

## Implementation

1. Read `.claude/skills/laravel-database-optimization/` (caching), `.ai/agents/postgis-geo-engineer.md` (dictionary
   conventions) and the KV-DB-006 / KV-DB-034 table definitions.
2. `php artisan make:enum --no-interaction Geo/Dictionary` — City, District, Zone, Quarter, MetroStation, Place,
   Renovation, Appliance (values equal to `dictionary_code_aliases.dictionary`).
3. `php artisan make:class --no-interaction Services/Geo/Gazetteer` with read-only methods (§API contract). Resolution
   order: canonical `code` → `dictionary_code_aliases` (case-insensitive for SEO slugs, `_`/`-` folded) → not found.
4. Readonly DTOs via `make:class`: `App\Domain\Geo\CityEntry`, `DictionaryEntry` (id, canonical code, legacy code,
   slug, names by locale, city id, flags).
5. Cache: one Redis key per (dictionary, locale), 1 h TTL, plus a version key bumped by the KV-DB-006/KV-DB-034 seeders
   and by `php artisan geo:cache-clear` (`make:command`) — `10` §4.16.
6. `Gazetteer::metaDirectories(LocaleCode)` builds exactly the arrays `MetaService` (KV-BE-029) emits: `cities` with
   their `districts` and `zones`, top-level `districts`/`zones` of Tashkent, `renovations` keyed by legacy deal,
   `appliances`, `locales` (`{code: 'uz_Latn', name}` via `LocaleCode::toLegacy()`).
7. Unit/feature tests on the seeded data (factories for edge cases).

## Files

- `backend/app/Enums/Geo/Dictionary.php`
- `backend/app/Services/Geo/Gazetteer.php`, `backend/app/Domain/Geo/{CityEntry,DictionaryEntry}.php`
- `backend/app/Console/Commands/GeoCacheClear.php`
- `backend/tests/Feature/Geo/GazetteerTest.php`, `backend/tests/Feature/Geo/GazetteerCacheTest.php`

## API contract

Internal:

```php
Gazetteer::city(string $codeOrAlias): ?CityEntry
Gazetteer::resolve(Dictionary $d, string $codeOrAlias, ?int $cityId = null): ?DictionaryEntry
Gazetteer::resolveMany(Dictionary $d, list<string> $codes, ?int $cityId = null): array{found: list<DictionaryEntry>, unknown: list<string>}
Gazetteer::legacyCode(Dictionary $d, int $id): string           // the API code the legacy meta carried
Gazetteer::name(Dictionary $d, int $id, LocaleCode $locale): string // ru fallback, plain text
Gazetteer::metaDirectories(LocaleCode $locale): array            // shape of the MetaResponse directory keys (08 API-001)
Gazetteer::cityMeta(LocaleCode $locale): list<array{code: string, name: string, center: array{0: float, 1: float}, zoom?: int, metro: bool, median: bool, districts: list<array{code: string, name: string}>, zones: list<array{code: string, name: string}>}>
```

No legacy route of its own; consumed by KV-BE-016, KV-BE-029, KV-BE-030 and the bot (M5).

## Business rules

- Kept: BR-API-037 (zones), BR-DATA-029 (plain names), BR-DATA-035 (city scope; matching is M4), BR-API-143 (locale
  codes in `locales`).
- Defect fixes (`APPROVED`): LB-DATA-001 (one canonical code + aliases; legacy routes emit the legacy API code),
  LB-API-051 (`zoom < 11` kept on legacy output; explicit `kind` only in v1), LB-LND-011 / LB-BOT-013 (one EN naming
  convention from the dictionary).
- DEV-015 (`PROPOSED`): the whole-city label comes from the city dictionary; the label itself is built in the bot (M5).

## Acceptance criteria

- Every alias seeded by KV-DB-006/KV-DB-034 resolves to its row, and `legacyCode()` returns the code the legacy `meta`
  carried — byte-identical (`mirzo_ulugbek` or whichever spelling the API used, per the seed's `legacy_api` marker).
- Unknown codes are reported in `unknown`, never thrown; the caller decides `422` (SEC-REQ-017).
- `metaDirectories()` returns arrays (never `null`) with `zoom < 11` for the region entry and `uz_Latn` as the locale
  code; names fall back to `ru` when a translation is missing.
- A second call within the TTL issues zero SQL queries; a seeder run invalidates the cache.

## Tests

- `GazetteerTest`: dataset of (dictionary, alias) → canonical code for API code, landing code, SEO slug, mixed case;
  `resolveMany` with one unknown; `legacyCode` round trip; `name()` in `ru`, `uz`, `en` and the `ru` fallback;
  district resolution scoped by city (same slug in two cities); names containing `<`/`&` in a factory row are stored
  plain and returned plain.
- `GazetteerCacheTest`: query count 0 on the second call (`DB::listen`), cache bumped by `geo:cache-clear` and by the
  seeder.
- Contract: the KV-QA-002 `CityMeta` model shape matches `cityMeta()` output (shape mode).
- Enum safety: every `zones`, `renovations` and `appliances` code emitted ⊆ the KV-QA-007 key list (`todo` until it
  exists).

## Edge cases

- Region entries (Tashkent region) share districts with no metro; `metro: false`, `median` per KV-DB-006 seed.
- Cities without zones return `zones: []` (sort `center` hidden by the client, BR-API-024).
- An alias pointing to a deleted dictionary row is a seed error (fails the seeder test), not a runtime null.
- Uzbek apostrophes `ʻ`/`ʼ` in names are normalised by the seed (`14` §4.1 "Text"), not by the service.

## Security

- Input codes reach SQL only as bindings; the alias lookup is a key lookup, never a `LIKE` with user input
  (SEC-REQ-017).
- Names are emitted as plain text; JSON-LD or HTML escaping stays with the renderers (SEC-REQ-018, SEC-REQ-021).

## Definition of done

Tests green (`make ci-backend`), parity gate items ticked (15 §4), docs and the feature row in 09 updated, PR
reviewed by the other developer. Pint and PHPStan level 7 clean; the cache key names and TTL are noted in
`docs/architecture/overview.md` (Geo module) in the same PR.
