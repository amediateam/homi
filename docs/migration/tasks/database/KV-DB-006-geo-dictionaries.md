# KV-DB-006 — Geo dictionaries and code aliases

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend (track: development) |
| Complexity | L |
| Feature IDs | F-PIPELINE-004, F-FILTER-001, F-FILTER-004, F-ONBOARD-001, F-ONBOARD-003, F-SEO-001 |
| Dependencies | KV-DB-005; Q-DATA-028…030 |

## Goal

The Geo module's dictionaries exist with seed data: `cities`, `districts`, `city_zones`, `renovation_types`,
`appliance_types` and one `dictionary_code_aliases` table that maps every legacy spelling (API code, landing code,
SEO slug) to a canonical row, so legacy codes resolve on input and the legacy API code comes back out unchanged.

## Legacy reference

- ENT-042 (cities, `06:927-937`), ENT-043 (districts, `06:939-947`), ENT-044 (zones, `06:949-955`), ENT-049
  (renovation, `06:985-988`), ENT-050 (appliances, `06:990-992`), ENT-053 (translatable names, `06:1017-1023`);
  mapping `06` §4.2 (line 1254).
- Six cities/regions: `$KVADRO_ROOT/docs/about.md:50` (Tashkent, Tashkent region, Andijan, Namangan, Kokand,
  Fergana); `CityMeta` fields `code`, `name`, `center`, `zoom` (`< 11` = region, LB-API-051), `metro`, `median`
  (`08` §1.8 API-001; `$KVADRO_ROOT/docs/api.md:454-463`).
- Districts: 79 in the bot (Tashkent 12, region 22, Andijan 15, Namangan 13, Fergana 17, Kokand 0 —
  `$KVADRO_ROOT/docs/telegram-bot.md:351-358`, BR-BOT-026); SEO district pages for Tashkent (12) and Tashkent region
  (5) (`$KVADRO_ROOT/docs/seo-pages.md:65-72`); landing codes `mirzo_ulugbek`, SEO slugs `mirzo-ulugbek`
  (LB-DATA-001).
- Zones `center`, `near_center` (Tashkent only; BR-API-037, BR-BOT-027); renovations per deal
  (`meta.renovations: Record<deal, {code, name}[]>`) and appliances (`$KVADRO_ROOT/docs/api.md:448-449`) — real codes
  unknown, mock codes fabricated (Q-DATA-030).
- Open: Q-DATA-028 (gazetteer export), Q-DATA-029 (code formats), Q-DATA-030 (renovation/appliance codes),
  Q-API-012, Q-API-026.

## Implementation

1. Read `.ai/agents/postgis-geo-engineer.md` (rules 3, 6, 11–13) and KV-DB-005's ADR; reference tables use `bigint`
   identity PKs (rule 3).
2. `php artisan make:model City -mfs --no-interaction`: `code` unique (canonical, = legacy API code once known),
   `slug` unique (SEO), `name jsonb` `{ru, uz, en}` + `name_cases jsonb` (SEO prepositional etc.), `center
   geography(Point,4326)` (pgsql via `DB::statement`; SQLite fallback `center_lat`/`center_lon` decimals — the
   geography column is only added on pgsql and the model reads lat/lon accessors), `zoom smallint`, `is_region`,
   `has_metro`, `has_medians` booleans, `sort smallint`.
3. `php artisan make:model District -mfs --no-interaction`: `city_id` FK, `code`, `slug` nullable, `name jsonb` +
   `name_cases`, `boundary geometry(MultiPolygon,4326)` nullable (pgsql) with GiST created `CONCURRENTLY` in a
   migration with `$withinTransaction = false`; unique `(city_id, code)`.
4. `php artisan make:model CityZone -mfs --no-interaction`: `city_id`, `code` (`center`, `near_center`), `name jsonb`,
   `boundary` nullable; `php artisan make:model RenovationType -mfs` (`code`, `name jsonb`, `deals text[]`/json
   fallback, `sort`); `php artisan make:model ApplianceType -mfs` (`code`, `name jsonb`, `sort`).
5. `php artisan make:model DictionaryCodeAlias -mfs --no-interaction`: `dictionary` (`city`, `district`, `zone`,
   `renovation`, `appliance`, `metro`, `quarter`, `place`), `alias` (exact spelling, case-preserved), `target_id`,
   `source` (`api`, `landing`, `seo`, `bot`, `legacy_db`), unique `(dictionary, alias)`.
6. Migration adding the FK `user_settings.city_id → cities.id` (`NOT VALID` + `VALIDATE` pattern on pgsql, rule 1).
7. Seeders (`GeoDictionarySeeder`, idempotent upserts by `code`): the six cities with names ×3, centres, zooms
   (region `< 11`), `has_metro` (Tashkent only), `has_medians` (Tashkent and Tashkent region per BR-BOT-032 — marked
   `spec`); the districts named in `$KVADRO_ROOT/docs/telegram-bot.md:351-358` and the SEO slugs of
   `$KVADRO_ROOT/docs/seo-pages.md:65-72`; zones; renovation and appliance codes from the legacy directory shapes
   (mock values marked `spec` in a seeder comment until KV-DB-015 reconciles them with the dump); every observed
   spelling as an alias row. Source of each value cited in the seeder data file.
8. Keep seed data in `backend/database/seeders/data/geo/*.php` (arrays), not inline, so KV-DB-015 can diff them.
9. Run Pint, PHPStan, tests; the alias-resolution service itself is KV-BE-015 (this task only provides the table
   and a model scope `DictionaryCodeAlias::resolve($dictionary, $alias)`).

## Files

- `backend/database/migrations/<ts>_create_cities_table.php`, `…_create_districts_table.php`,
  `…_create_city_zones_table.php`, `…_create_renovation_types_table.php`, `…_create_appliance_types_table.php`,
  `…_create_dictionary_code_aliases_table.php`, `…_add_city_fk_to_user_settings.php` (new)
- `backend/app/Models/{City,District,CityZone,RenovationType,ApplianceType,DictionaryCodeAlias}.php`
- `backend/database/factories/*`, `backend/database/seeders/GeoDictionarySeeder.php`,
  `backend/database/seeders/data/geo/{cities,districts,zones,renovations,appliances,aliases}.php`
- `backend/tests/Feature/Database/GeoDictionaryTest.php`, `backend/tests/Feature/Pgsql/GeoDictionaryPgsqlTest.php`

## API contract

n/a for endpoints — the rows must be able to produce `MetaResponse.cities[]` (`code`, `name`, `center: [lat, lon]`,
`zoom`, `metro`, `median`, `districts[]`, `zones[]`), top-level `districts`, `zones`, `renovations` per deal,
`appliances` (`{code, name}` in the profile locale), `CityStats.code` (API-002), `ListingPreview.district_name`, and
the filter codes accepted by `city`, `districts`, `zones`, `renovation`, `appliances` (`08` §1.7).

## Business rules

Keep BR-API-027 (city always present, fallback `tashkent`), BR-API-037 (zones), BR-API-064 (`median: false` hides the
market filter), BR-DATA-029 (names plain text, no markup), BR-DATA-035. Apply LB-DATA-001 and LB-API-051 (defect
fixes, `APPROVED`: one canonical code + aliases; `zoom < 11` kept on legacy routes, explicit `is_region` inside).
DEV-015 (`PROPOSED`, neutral whole-city label) needs a `name` form per city — store `whole_city_label jsonb` nullable
so the decision can be applied without a migration.

## Acceptance criteria

- Six cities, their districts and both Tashkent zones are seeded with names in `ru`, `uz` (Latin), `en`.
- Every alias in the seed data resolves to exactly one row of its dictionary; `mirzo_ulugbek` and `mirzo-ulugbek`
  resolve to the same district.
- Seeding twice changes nothing (idempotent upserts).
- `user_settings.city_id` has a valid FK to `cities`.
- Names contain no `<`, `>`, `&` (BR-DATA-029).

## Tests

- `GeoDictionaryTest`: `it('seeds six cities with three locales')`, `it('marks regions with zoom below 11')`,
  `it('resolves landing and SEO spellings of a district to one row')`, `it('rejects a duplicate alias in one
  dictionary')`, `it('allows the same alias in two dictionaries')`, `it('is idempotent when seeded twice')`,
  `it('has no markup in any seeded name')`.
- `GeoDictionaryPgsqlTest` (`pgsql`): `cities.center` is `geography(Point,4326)`; `districts.boundary` GiST index
  exists and is valid (`pg_index.indisvalid`); FK `user_settings.city_id` validated.

## Edge cases

- Kokand has no districts (Kokand 0 in the bot): `meta.cities[].districts` must be `[]`, never missing.
- A legacy code that collides between dictionaries (`center` zone vs a district code): scoped by `dictionary`.
- Unknown real API codes (Q-DATA-029): canonical `code` may change at R1; aliases keep old spellings resolving.

## Security

Reference data only; no personal data (SEC-REQ-041). Names are rendered as text on every surface (SEC-REQ-021); the
no-markup test protects JSON-LD and bot HTML later.

## Definition of done

Tests green (`make ci-backend`), parity gate items ticked (15 §parity gate), docs and the feature row in 09 updated, PR
reviewed by the other developer. `php artisan migrate:fresh --seed` on PostgreSQL 18 + PostGIS; factories and seeders
for every model; migration review against the postgis-geo-engineer checklist; data-impact note in the PR (new FK on
`user_settings`).
