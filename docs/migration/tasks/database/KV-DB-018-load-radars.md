# KV-DB-018 — Load radars and hide rules

| Field | Value |
| ----- | ----- |
| Status | BLOCKED (legacy schema) |
| Owner | Backend (track: development) |
| Complexity | L |
| Feature IDs | F-RADAR-001, F-RADAR-002, F-RADAR-003, F-RADAR-004, F-RADAR-005, F-RADAR-006, F-HIDE-004, F-FILTER-001 |
| Dependencies | KV-DB-009, KV-DB-015, KV-BE-016 |

## Goal

Every legacy radar is in HOMI's `radars` with its legacy id preserved as `number`, its filters normalised to the
canonical 25-key object (`filters_v1`) with the structured matching columns and the canonical `filters_hash`, twins
handled per the decided rule, and its hide rules in `radar_hide_rules` — so V-SUM-4 and V-RI-3 pass and the per-rule
change volumes are reported for review before anything user-visible changes.

## Legacy reference

- ENT-008, ENT-009 (`06` §2.2); scope `14` §2 (radars mandatory, hide rules migrate); ids `14` §3 (radar `number` =
  legacy value when numeric, non-numeric → new `number` + `legacy_id_map`; merged twins → map to survivor); load order
  `14` §7.3 step 5.
- Rules `14` §4.2 rows Radar (nine rows) and Hide rule; `14` §6.2 V-SUM-4, §6.3 V-RI-3, §6.6 change budget.
- `08` §1.7 (`SearchFilters` 25 keys, default object), §1.8 `Subscription`; `$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:46-54`
  (`zone` → `zones` on 2026-11-06).
- Questions: Q-DATA-011, Q-DATA-012, Q-DATA-015, Q-DATA-041, Q-API-013, Q-API-014, Q-BOT-017.
- Defects: LB-DATA-002, LB-DATA-003, LB-DATA-004, LB-DATA-006, LB-DATA-007, LB-DATA-011, LB-DATA-017; LB-API-025,
  LB-API-028, LB-API-037; LB-APP-043.

## Implementation

1. Read `14` §4.2, `06` §4.2 row `radars`, `.ai/agents/postgis-geo-engineer.md` (rules 5, 15 polygons) and the
   `SearchFilters` API of KV-BE-016; replace the `<legacy_…>` placeholders.
2. `make:class Services/Migration/Loaders/RadarLoader --no-interaction`; for each staged radar build the raw filter
   array, then apply, in order, each rule writing a `migration_changes` row when it changes something:
   a. `zone: X` → `zones: [X]` merged with any `zones`, canonical order `center`, `near_center`; drop `zone` (LB-DATA-004).
   b. Fill the 25-key schema with defaults (`types: ['apartment']`, arrays `[]`, booleans `false`, scalars `null`,
      `owner: 'any'`) (BR-DATA-009, LB-API-005).
   c. `posted_days` → `null` only when the run flag `radar.drop_posted_days` is on (DEV-005 `PROPOSED`, Q-API-014);
      otherwise kept and flagged.
   d. Remove `types` invalid for the deal (empty → `['apartment']`); `tenant` on `rent_daily` per the flag
      `radar.tenant_daily_rule` (DEV-017 `PROPOSED`); `pets` and `pets_only` both true → keep `pets_only`.
   e. Several geography modes → keep `polygon`, else `zones`, else `districts`; `area_*`/`market` on rent and
      `appliances` on sale → `null`/`[]`; `min > max` → swap (flag `radar.swap_inverted_ranges`, DEV-025 `PROPOSED`).
   Steps d–e are the shared normaliser `SearchFilters::fromStored()` (KV-BE-016) run with the migration profile, so the
   loader and the live API use one rule set (DEV-004 `PROPOSED`: every applied change counted).
3. Price bounds: integer USD → `price_min`/`price_max` in cents with `price_currency = 'USD'`; `filters_v1` keeps whole
   dollars; implausible bounds (rent > 20 000, daily > 1 000) flagged, not changed (LB-DATA-002).
4. Polygon `[[lat, lon], …]` → closed `geography(Polygon, 4326)` ring in `(lon lat)` order; `ST_IsValid` false →
   `ST_ConvexHull` + change row.
5. Codes (`city`, `districts`, `renovation`, `appliances`) resolved through `dictionary_code_aliases` (KV-DB-015) into
   `city_id`, `district_ids`; unresolved → run error.
6. `filters_hash` = `SearchFilters::canonicalHash()` (SHA-256 of canonical JSON without `posted_days`, keys and arrays
   sorted — same canonicalisation as the client's `filtersKey`, BR-APP-012).
7. Twins (same user, same hash): with the run flag `radar.merge_twins` on (DEV-009, LB-DATA-011 `PROPOSED`), survivor =
   oldest id; `active` if any twin was; mode of the survivor; hide rules and later delivery records unioned; twin ids →
   `legacy_id_map` pointing at the survivor. With the flag off, the loader stops on the unique `(user_id, filters_hash)`
   constraint and reports every twin pair — the developer must decide before R1.
8. `number` = legacy id when numeric; non-numeric → next sequence value + map row. `entry` copied; `relaxed` →
   `relax_code` (analytics only, LB-DATA-017); `active`, `mode`, timestamps copied.
9. `make:class Services/Migration/Loaders/RadarHideRuleLoader`: channel → `source_channels.id` by handle/id; district →
   `districts.id` via aliases; author → `listing_authors.id`; unresolvable → raw value kept, null FK, reported
   (LB-DATA-006; user-wide scope DEV-034 is not applied by the migration).
10. After the final delta: `setval('radars_number_seq', max(number) + :radar_number_gap, false)` (V-RI-9).

## Files

- `backend/app/Services/Migration/Loaders/{RadarLoader,RadarHideRuleLoader}.php`
- `backend/tests/Feature/Migration/Radars/*Test.php`, `backend/tests/Fixtures/Migration/stage_radars.sql`

## API contract

For a migrated user, API-018 `GET /api/subscriptions` returns each radar with `id` = the legacy number (JSON
integer), `active`, `mode` (`instant` / `digest`), `filters` with exactly 25 keys and arrays never `null`, price bounds as
USD integers, and `hidden` = the count of hide-rule suppressions (BR-API-091); `PUT`/`PATCH`/`DELETE
/api/subscriptions/:id` from an old session addressed by a merged twin's id resolves through `legacy_id_map` (DEV-009
compatibility note) or answers `404` (`06` LB-DATA-011).

## Business rules

- Kept: BR-DATA-009 (25 keys), BR-DATA-010 (limit; users above 10 radars are reported, not trimmed — Q-DATA-015),
  BR-DATA-011 (consistency, via the normaliser), BR-DATA-012 (active/paused, instant/digest), BR-API-091 (`hidden`).
- Defect fixes (`APPROVED`): LB-DATA-004 (`zone` → `zones`), LB-DATA-017 (`relax_code` analytics only), LB-API-005.
- `PROPOSED` (run-config flags, volumes reported, never silently applied): DEV-004, DEV-005, DEV-009 / LB-DATA-011,
  DEV-017 / LB-DATA-007, DEV-025; DEV-006 (bounds in entered currency) does not change migrated data — they are USD.

## Acceptance criteria

- V-SUM-4 (number, hash, active, mode) equal between the expected transform of `legacy_stage` and HOMI; V-RI-3 returns
  zero (every `filters_v1` has 25 keys, every code resolves).
- Every rule application has a `migration_changes` row; the report lists the count per rule and flag; with every
  `PROPOSED` flag off, the only changes are the `APPROVED` fixes.
- `unique (user_id, filters_hash)` holds after load (twins merged or the run stopped with the twin list).
- A re-run writes zero rows; V-RI-9 true for `radars_number_seq` after the sequence step.

## Tests

`backend/tests/Feature/Migration/Radars/` (`pgsql` group with PostGIS, synthetic stage):
- `ZoneToZonesTest` — `{"zone": "center"}` → `zones: ["center"]`, no `zone` key, one change row.
- `TwentyFiveKeysTest` — a 7-key legacy filter → 25 keys with the documented defaults.
- `DealConsistencyTest` dataset: `land` in `rent_long` types removed; `pets` + `pets_only` → `pets_only`; `area_min` on
  rent → `null`; polygon + districts → polygon kept.
- `ProposedFlagsTest` — with `radar.drop_posted_days` off, `posted_days: 3` stays and is flagged; on, it becomes `null`
  with a change row (`->todo('DEV-005 PROPOSED')` for the user-visible assertion).
- `PolygonTest` — valid ring closed in `(lon lat)` order; self-intersecting → convex hull + change row.
- `CanonicalHashTest` — key order and array order do not change the hash; `posted_days` does not either.
- `TwinMergeTest` — flag on: survivor = oldest, `active` if any twin active, map row for the twin; flag off: run stops
  and reports the pair.
- `HideRuleTest` — channel, district, author rules resolved; an unknown channel kept raw with null FK and reported.
- `RadarsRerunTest` — zero writes; V-SUM-4 identical.

## Edge cases

- Non-numeric legacy radar ids (Q-DATA-022/Q-DATA-041): new `number`, old id in the map; old bot callbacks embedding
  them reach the catch-all unless Q-BOT-017 shows the grammar.
- Users with more than 10 radars (Q-DATA-015): all loaded; the limit applies to new creations only.
- Radars whose city or every district became unresolvable: run error, never a silent widening to the whole city.
- Polygons with fewer than 3 distinct vertices: excluded with reason `invalid` and reported per user count.

## Security

- SEC-REQ-017 (one normaliser for every writer), SEC-REQ-015 (uniqueness by hash), SEC-REQ-041 (handling).
- Reports contain radar numbers and counts only — no Telegram ids, no filter contents tied to a person.

## Definition of done

Tests green (`make ci-backend` / `make ci-frontend`), parity gate items ticked (15 §parity gate), docs and the feature
row in 09 updated, PR reviewed by the other developer. In addition: R0 run on the masked sample green, the change-rule
report reviewed by the developer (the `14` §6.6 change budget), `06`/`14` updated with the confirmed facts
(Q-DATA-011, Q-DATA-012 closed).
