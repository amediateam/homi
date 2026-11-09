# KV-BE-159 — Public statistics API for the landing app

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend (track: development) |
| Complexity | M |
| Feature IDs | F-SEO-001, F-SEO-002, F-SEO-003, F-SEO-004, F-SEO-005, F-SEO-009, F-SEO-012 |
| Dependencies | KV-BE-157, KV-BE-158, KV-BE-160, KV-BE-164; CF-010, DEC-15, DEC-14; related: KV-BE-161 and KV-BE-163 read the index and sitemap through it |
## Goal

The `frontend/landing` SEO renderer (CF-010) gets everything it needs for the 1 008 pages from one read-only `/api/v1`
surface: the place dictionary with names, cases and slugs, path resolution (slice, canonical and alternates, index
flag, 404 data), the slice payload (counters, medians, place statistics, cards per sort, links, bot payload), the index
series, the methodology numbers and the sitemap entries — all from one data snapshot, with `ETag` and `Last-Modified`
taken from the data so the pages can send truthful caching headers.

## Legacy reference

- `03b` §2.5 (the legacy team's list of backend inputs for a Next SEO renderer, items 1–7), LND-041 (common frame),
  LND-055 (404), LND-057 (head), LND-059 (headers); RES-017; `$KVADRO_ROOT/docs/seo-pages.md:392-420`.
- Rules: BR-SEO-001 … BR-SEO-005 (URL scheme, slugs, routing), BR-SEO-007 and BR-SEO-009 (head and templates — the
  frontend renders them from this data), BR-SEO-025 (bot payload grammar), BR-SEO-027 (CDN 5 minutes), BR-SEO-029
  (methodology statements kept true), BR-SEO-032 (404 links), BR-API-136.
- Defects: LB-SEO-003 (one snapshot), LB-SEO-010 (data-based `Last-Modified`), LB-SEO-011 (ad-hoc payloads → DEV-049).
- DEVs: DEV-045 (`?page=N` → 301), DEV-047 (mixed case → 301), DEV-048 (foreign slugs → 301), DEV-049 (formal payload
  grammar) — all `PROPOSED`.
- Open: Q-SEO-004 (uz/en templates — frontend), Q-SEO-010 (`metro` slug), Q-SEO-011, Q-SEO-021 (dynamic methodology
  numbers), Q-API-049 (`/api/landing/*` — not implemented).

## Implementation

1. Read `.claude/skills/scramble-development/` (v1 resources and the OpenAPI export), ADR-0007 (envelope),
   ADR-0003 (tokens), `.claude/skills/laravel-best-practices/` (resources, caching).
2. Access: the landing app calls the backend server-to-server with a Sanctum token of a dedicated service user,
   ability `public-data:read`, issued by `php artisan public-data:token` (`php artisan make:command
   PublicData/IssuePublicDataToken --no-interaction`), one token per environment, never shipped to browsers;
   `throttle:public-data` (600/min per token). No anonymous v1 route (ADR-0003).
3. Routes `routes/api.php` under `v1/public` → `App\Http\Controllers\Api\V1\PublicData\*` (envelope responses through
   `ApiController`), each a thin call into `App\Services\PublicData\*`:
   - `GET places?lang=ru|uz|en` — cities, districts, quarters, metro stations, ЖК used by the pages: `key`, `slug`,
     `name` and the grammatical cases needed by the templates (from the gazetteer `name jsonb` + cases), coordinates,
     simplified district boundaries (GeoJSON, `ST_SimplifyPreserveTopology`) for the index map.
   - `GET seo/resolve?lang=&path=` — `{slice_key, kind, canonical, alternates {ru, uz, en, x-default}, indexable,
     noindex_reason (thin|sorted|null), redirect (null unless a PROPOSED DEV flag is on)}`; unknown path → `404` in the
     envelope with `data.links` (rent hub, index, methodology in that language, BR-SEO-032). Case and language checks
     per BR-SEO-004 (other case → not found; slug of another language → not found); DEV-045, DEV-047, DEV-048
     redirects behind `seo.redirect_*` flags (default off).
   - `GET seo/slices/{slice_key}?lang=&sort=new|cheap|expensive|below` — counters, medians, `stats` (KV-BE-157,
     KV-BE-158), up to 24 cards for the sort (KV-BE-160), links (KV-BE-164), `bot_payload` (step 4), `snapshot_id`,
     `lastmod`. A `sort` other than `new` sets `noindex_reason = sorted`.
   - `GET seo/methodology` — the numbers the methodology text states (active channels count from `source_channels`,
     coverage start 2026-10-01, the 90-day and 60-day windows from config) so the page cannot drift from the pipeline
     (BR-SEO-029, Q-SEO-021).
   - `GET stats/rent-index`, `GET stats/sale-prices` — the series of KV-BE-161; `GET seo/sitemap` — KV-BE-163.
4. Bot payload per slice and language (BR-SEO-025): `s_seo[_uz|_en][_<slice tag>]` with the legacy tags (`s_seo`,
   `s_seo_<city>`, `s_seo_<city>_<district>`, `…_<N>k`, `s_seo_kv_<district>-<quarter>`, `s_seo_metro`,
   `s_seo_<city>[_<district>]_owners`, `s_seo_index`, `s_seo_method`, `s_seo_sale…`, `s_seo_sale_prices`,
   `s_seo_new…`); validated to ≤ 49 characters (room for `--v<visit>` within 64 bytes, BR-LND-003); DEV-049 grammar
   behind `seo.payload_grammar = v2` (default `legacy`).
5. Caching: every response carries `ETag` = hash of (`snapshot_id`, lang, sort, path) and `Last-Modified` =
   `lastmod_at` (LB-SEO-010); conditional requests answer `304`; Redis cache per key until the snapshot changes. The
   landing sets the page headers of BR-SEO-027 (frontend track) from these values.
6. Resources in `app/Http/Resources/Api/V1/PublicData/*`; Scramble documents them (T3 export); contract tests pin the
   shapes the frontend mocks.

## Files

- `backend/app/Http/Controllers/Api/V1/PublicData/{PlaceController,SeoResolveController,SeoSliceController,MethodologyController,StatsSeriesController,SitemapController}.php`
- `backend/app/Http/Resources/Api/V1/PublicData/*.php`; `backend/app/Services/PublicData/{SeoResolver,BotPayloadBuilder}.php`
- `backend/app/Console/Commands/PublicData/IssuePublicDataToken.php`; `backend/routes/api.php`; limiter registration
- `backend/tests/Feature/PublicData/{PublicPlacesApiTest,SeoResolveApiTest,SeoSliceApiTest,BotPayloadBuilderTest}.php`

## API contract

`/api/v1/public/*`, `Authorization: Bearer <token with public-data:read>`, ADR-0007 envelope
`{success, data, meta}`; errors `{success: false, message, code}` with `401`, `403` (wrong ability), `404`
(unknown path or slice, with `data.links` for the 404 page), `422` (bad `lang` or `sort`), `429`. Headers `ETag`,
`Last-Modified`, `Cache-Control: private, max-age=60` (server-to-server; the CDN caches the rendered pages, not the
API).

## Business rules

- Kept: BR-SEO-001 … BR-SEO-005, BR-SEO-025, BR-SEO-029, BR-SEO-032, BR-API-136; data for BR-SEO-007, BR-SEO-009,
  BR-SEO-027.
- Defect fixes `APPROVED`: LB-SEO-003, LB-SEO-010.
- DEV-045, DEV-047, DEV-048, DEV-049 `PROPOSED` behind flags; tests `->todo('DEV-045 PROPOSED')`, `…DEV-047…`,
  `…DEV-048…`, `…DEV-049…`.
- DEC-14: no public listing pages — the API exposes cards inside slices only, never a listing endpoint.

## Acceptance criteria

- Every slice key of the KV-BE-157 catalogue resolves in all three languages and round-trips to its canonical path;
  every legacy URL of the KV-QA-014 generated list resolves (or is a documented 404 type of BR-SEO-004).
- A slice response for `ru`, `uz` and `en` carries the same numbers and the same `snapshot_id`.
- A repeated request with `If-None-Match` answers `304`; `Last-Modified` equals the slice's `lastmod_at`.
- Every bot payload matches BR-SEO-025 and is ≤ 49 characters.
- No phone, listing text or address appears in any response.

## Tests

- `PublicPlacesApiTest`: `names_and_cases_per_language`, `slugs_language_neutral`, `boundaries_simplified_geojson`,
  `requires_public_data_ability` (`403` with another ability, `401` without token).
- `SeoResolveApiTest`: dataset of legacy URL examples per type and language; `uppercase_path_is_404`,
  `foreign_language_slug_is_404`, `rent_4_rooms_is_404`, `unknown_district_is_404_with_links`,
  `thin_slice_resolves_with_noindex_thin`, `sort_param_gives_noindex_sorted`, `page_param_ignored`,
  `->todo('DEV-045 PROPOSED')`, `->todo('DEV-047 PROPOSED')`, `->todo('DEV-048 PROPOSED')`.
- `SeoSliceApiTest`: `same_numbers_and_snapshot_across_languages`, `etag_304_round_trip`,
  `last_modified_is_slice_lastmod`, `cards_at_most_24_per_sort`, `no_pii_in_payload` (phone pattern scan),
  `methodology_numbers_from_config_and_channels`.
- `BotPayloadBuilderTest` (unit): every slice kind × language matches the BR-SEO-025 table examples
  (`s_seo_uz_tashkent_yunusobod`, `s_seo_en_sale_tashkent`, `s_seo_uz_kv_yunusobod-minor`), length ≤ 49,
  `->todo('DEV-049 PROPOSED')`.

## Edge cases

- Snapshot switch between two requests of one page render (ru then uz): the frontend passes `snapshot_id`; the API
  answers the requested snapshot while it is the current or the previous one (two snapshots kept).
- A slice key that existed and then lost all listings: resolves (`indexable = false`), never `404` (BR-SEO-036).
- Tashkent region towns (`chirchiq`) under `tashkent-region`: keys per Q-SEO-020; payload `s_seo_tashkent-region_chirchiq`.
- Very long quarter slugs: payload validation fails the build of that slice's payload (logged) and falls back to the
  parent tag rather than exceeding 49 characters.

## Security

- SEC-REQ-004 (token ability, v1 only), SEC-REQ-027 (limiter), SEC-REQ-021 (no HTML in data; JSON-LD is built by the
  frontend from these values), SEC-REQ-032 (no browser CORS — server-to-server only), no personal data.

## Definition of done

Tests green (`make ci-backend`), OpenAPI export updated (T3), parity gate items ticked (`15` §4) for the data parts of
F-SEO-001 … F-SEO-005, F-SEO-009 and F-SEO-012, docs (`docs/api/` note for the landing app) and the feature rows in
`09` updated, PR reviewed by the other developer.
