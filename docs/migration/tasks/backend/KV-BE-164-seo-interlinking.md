# KV-BE-164 — Interlinking blocks data

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend (track: development) |
| Complexity | S |
| Feature IDs | F-SEO-011 |
| Dependencies | KV-BE-157 (catalogue, counts, `indexable`); KV-BE-158 (neighbouring quarters and stations); DEV-050 (`PROPOSED`), Q-SEO-017 |

## Goal

Every SEO slice carries its link blocks as data — other room counts of the place, the other districts, the
district's quarters, nearby stations, the other sections of the same place, all cities, and the by-owner page — each
link with its target's current listing count, so the landing app renders the legacy interlinking from one snapshot.

## Legacy reference

- LND-064 (`03b` lines 1062-1067), LND-041 (owners link on the city page), LND-042 … LND-051 (per-type link lists);
  `$KVADRO_ROOT/docs/seo-pages.md:144-145`.
- Rules: BR-SEO-030 (neighbours: rooms, districts, quarters, stations, the other section of the same place, all
  cities; link texts carry the current listing count; city page «N — от хозяев без риелтора» → by-owner page).
- Decision: LB-SEO-012 (thin pages linked from indexable ones, coverage 94 of ~450 pages) → DEV-050 `PROPOSED` (link
  only to indexable slices); Q-SEO-017 (Search Console coverage).

## Implementation

1. Read the KV-BE-157 and KV-BE-158 tasks.
2. `php artisan make:class Services/PublicData/InterlinkService --no-interaction`: `links(SliceKey $key): array` —
   groups in legacy order per slice kind (`03b` LND-042 … LND-051):
   - `rooms`: the same place and section with each room count of the section's range (rent 1–3, sale and new builds
     1–4, BR-SEO-003);
   - `districts`: the other districts of the city that have slices in this section (city, district and rooms pages
     keep the room count where the target exists);
   - `quarters`: the district's quarters (rent, Tashkent);
   - `stations`: stations within `seo.link_station_radius_m` (default 2 000) of the district's or quarter's centre,
     or the neighbouring stations of KV-BE-158 on station pages;
   - `sections`: the same place in the other sections (rent ↔ sale ↔ new builds) with per-room counts where the legacy
     page shows them;
   - `cities`: all six cities of the section;
   - `owners`: the by-owner slice of the city or district when it exists, with its count.
   Each link = `{slice_key, count, indexable}`; the frontend builds the localised text and URL (`SliceKey::toPath`).
3. Policy flag `seo.link_only_indexable` (default `false` = legacy behaviour: link every existing slice). With DEV-050
   approved the flag turns on and thin targets are omitted.
4. Computed in the KV-BE-157 refresh (part of the slice `content_hash`, so `lastmod` follows link-count changes) and
   stored in `seo_slices.stats.links`.

## Files

- `backend/app/Services/PublicData/InterlinkService.php` (new); `backend/app/Services/PublicData/SeoSliceAggregator.php`
  (call); `backend/config/seo.php` (`link_only_indexable`, `link_station_radius_m`)
- `backend/tests/Feature/PublicData/InterlinkServiceTest.php` (new)

## API contract

Inside `GET /api/v1/public/seo/slices/{key}` (KV-BE-159): `links {rooms[], districts[], quarters[], stations[],
sections[], cities[], owners|null}`, each item `{slice_key, count, indexable}`.

## Business rules

- Kept: BR-SEO-030 (groups and counts).
- DEV-050 `PROPOSED` behind `seo.link_only_indexable`; test `->todo('DEV-050 PROPOSED')`.

## Acceptance criteria

- Every link targets an existing slice; counts equal the target slice's `listings_count` of the same snapshot.
- A rent district page links rooms 1–3 only; a sale district page links rooms 1–4.
- With the flag off, thin targets are linked (`indexable: false`); with it on, they are omitted.
- The city page has the owners link with its count when the by-owner slice exists.

## Tests

- `InterlinkServiceTest`: `rooms_group_follows_section_range`, `districts_group_excludes_self`,
  `quarters_only_on_rent_tashkent_districts`, `stations_within_radius` (`pgsql`), `sections_cross_links_same_place`,
  `cities_group_has_six`, `owners_link_on_city_page`, `counts_equal_target_snapshot_counts`,
  `thin_targets_linked_when_flag_off`, `->todo('DEV-050 PROPOSED')`.

## Edge cases

- A target slice that exists only through the legacy seed and has zero listings: linked with `count: 0` when the flag
  is off (legacy), omitted when on.
- Regional cities without districts: no `districts` group; `rooms` and `sections` only (LND-044).
- Link-count changes alone change the slice's `content_hash` and `lastmod`; this is intended (visible data).

## Security

- Public aggregates only; SEC-REQ-021 for rendering.

## Definition of done

Tests green (`make ci-backend`), parity gate items ticked (`15` §4) for the data part of F-SEO-011, docs and the feature
row in `09` updated, PR reviewed by the other developer.
