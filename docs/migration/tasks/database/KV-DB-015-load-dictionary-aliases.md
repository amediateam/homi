# KV-DB-015 — Load dictionaries mapping

| Field | Value |
| ----- | ----- |
| Status | BLOCKED (legacy schema) |
| Owner | Backend (track: development) |
| Complexity | M |
| Feature IDs | F-PIPELINE-004, F-FILTER-001, F-FILTER-004, F-ONBOARD-001, F-SEO-001 |
| Dependencies | KV-DB-006, KV-DB-013 |

## Goal

`dictionary_code_aliases` holds every spelling of every city, district, zone, quarter, metro station, place,
renovation and appliance code that legacy data, the legacy `meta` directories, the landing data and the SEO slugs ever
used, each pointing at one HOMI dictionary row; on R1 zero codes in migrated radars, listings, settings and hide rules
are unresolvable, and the legacy surface still emits the exact legacy API code.

## Legacy reference

- ENT-042 … ENT-050, ENT-053 (`06` §2.6); scope `14` §2 (rebuild + migrate legacy codes as aliases; places from the
  legacy gazetteer if exportable); load order `14` §7.3 step 1.
- Rules `14` §4.1 "Codes" (unresolvable code = run error, never dropped) and §4.2 "Dictionaries" (names in three languages
  from legacy tables or `GET /api/meta` captured with a test account in `ru`, `uz_Latn`, `en`; SEO slugs from
  `$KVADRO_ROOT/docs/seo-pages.md`).
- LB-DATA-001 (codes in several spellings: landing `mirzo_ulugbek`, SEO `mirzo-ulugbek`), LB-DATA-008 (`pt:` place keys),
  LB-SEO-007 (quarter names by script); Q-DATA-028 … Q-DATA-030, Q-API-012, Q-API-026, Q-BOT-044.
- Landing data codes: `$KVADRO_ROOT/demo/landing/tools/parity/fixtures/data/*.json`; SEO slugs: `$KVADRO_ROOT/docs/seo-pages.md:65-129`.

## Implementation

1. Read `14` §4, `06` §4.2 row `cities … appliance_types`, `.ai/agents/postgis-geo-engineer.md` (gazetteer rules) and the
   KV-DB-006 / KV-DB-034 seeders (they own the canonical rows; this task adds the legacy spellings and fills gaps).
2. `make:class Services/Migration/Loaders/DictionaryAliasLoader --no-interaction`: for each legacy dictionary table,
   resolve each legacy code to a canonical row by (a) exact canonical code, (b) slug, (c) normalised form (lower case,
   `-`/`_` unified, Uzbek apostrophes canonicalised); insert `dictionary_code_aliases(dictionary, alias, target_id,
   source)` with `source ∈ legacy_db | legacy_meta | landing | seo_slug | bot`; conflict key `(dictionary, alias)`.
3. Codes found in legacy data but absent from the canonical seed: a new canonical row is **not** invented
   automatically — the loader writes it to the run report as `unresolved`; the developer adds the row to the KV-DB-006 /
   KV-DB-034 seed or maps it by hand in `backend/database/data/legacy-alias-overrides.php`, then re-runs.
4. Names: where the legacy tables carry names in three languages, compare them with the seed names and report
   differences (no overwrite of `name jsonb` without review — LB-LND-011 one place dictionary).
5. Places (`pt:<lat>:<lon>` keys, LB-DATA-008): map each to a `places` row by coordinate match within a tolerance;
   unmatched → report; the landing generator (M7) keeps mapping back to the `pt:` string while the legacy landing runs.
6. Scan every code-bearing column of `legacy_stage` (radar filters `city`, `districts`, `zones`, `renovation`,
   `appliances`; listing location codes; settings `city`; hide-rule districts) and assert each resolves — the result is
   the "zero unresolvable codes" check.
7. Register the loader first in `LoaderRegistry` (`14` §7.3 step 1); run on R0 and attach the unresolved list.

## Files

- `backend/app/Services/Migration/Loaders/DictionaryAliasLoader.php`
- `backend/database/data/legacy-alias-overrides.php` (reviewed manual mappings; codes only)
- `backend/tests/Feature/Migration/Dictionaries/*Test.php`, `backend/tests/Fixtures/Migration/stage_dictionaries.sql`

## API contract

Legacy routes keep emitting the legacy API codes (`14` §4.1 "Codes"; LB-DATA-001 compatibility): `meta.cities[].code`,
`meta.districts[].code`, `meta.zones[].code`, `renovations`, `appliances` (API-001), `CityStats.code` (API-002),
`Subscription.filters` codes (API-018) — byte-equal to what the legacy `meta` capture shows for the same locale.

## Business rules

- Kept: BR-DATA-035 (listings without a recognisable place never match zone/district radars), BR-DATA-029 (names are
  plain text without markup), BR-API-037 (zones `center`, `near_center` for Tashkent).
- Defect fixes (`APPROVED`): LB-DATA-001 (one canonical code + aliases), LB-DATA-008 (places get ids), LB-SEO-007
  (names per script in the dictionary).

## Acceptance criteria

- On R0 (and later R1) the scan of step 6 reports zero unresolvable codes; the run fails otherwise.
- Every alias resolves to exactly one row; no alias equals another dictionary's canonical code in a way that makes a
  lookup ambiguous within one dictionary.
- The `Gazetteer` (KV-BE-015) given any alias returns the canonical row and emits the legacy API code on legacy routes.
- A re-run writes zero rows.

## Tests

`backend/tests/Feature/Migration/Dictionaries/` (`pgsql` group, synthetic stage):
- `AliasResolutionTest` dataset: `mirzo_ulugbek`, `mirzo-ulugbek`, `Mirzo-Ulugbek`, `mirzo ulug'bek` → one district;
  `center` / `near_center` zones; a renovation code per deal.
- `UnresolvedCodeFailsRunTest` — a radar with district `atlantis` → run status `failed`, report lists the code, nothing
  silently dropped.
- `OverrideMappingTest` — an entry in `legacy-alias-overrides.php` resolves the code on re-run.
- `PlacePointKeyTest` — `pt:41.31100:69.27950` maps to the nearest place within tolerance; outside tolerance → reported.
- `LegacyCodeOutputTest` — a district loaded via alias is emitted with the legacy API code by the `Gazetteer`.
- `DictionaryRerunTest` — zero writes on the second run.

## Edge cases

- One legacy code used for two different places in two cities (same district name): aliases are scoped by city for
  districts and quarters.
- Regions vs cities (`CityMeta.zoom < 11`, LB-API-051, Q-API-026): the region flag comes from the seed, not from aliases.
- Mixed-script spellings (Cyrillic and Latin Uzbek) in legacy data: both stored as aliases.
- SEO slugs that changed over time: all of them stay aliases (public links depend on them, `03b` §2.2).

## Security

- Labels stripped of markup and entities at load (`14` §4.1 "Labels", SEC-REQ-018, BR-DATA-029).
- No personal data in dictionaries; reports list codes only.
- SEC-REQ-041 sanitised-marker guard inherited from the framework.

## Definition of done

Tests green (`make ci-backend` / `make ci-frontend`), parity gate items ticked (15 §parity gate), docs and the feature
row in 09 updated, PR reviewed by the other developer. In addition: R0 run with zero unresolved codes, the alias report
reviewed by the developer, `06` §2.6 updated with the confirmed code formats (Q-DATA-029 closed).
