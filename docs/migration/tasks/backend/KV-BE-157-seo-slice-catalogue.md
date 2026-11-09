# KV-BE-157 — SEO slice catalogue and slice aggregates

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend (track: development) |
| Complexity | L |
| Feature IDs | F-SEO-001, F-SEO-002, F-SEO-005, F-SEO-008 |
| Dependencies | KV-DB-011 (`seo_slices`), KV-BE-015 (gazetteer, slugs), KV-BE-139 (district and city medians); KV-DB-006 / KV-DB-034 (places); DEC-30, Q-SEO-002, Q-SEO-008, Q-SEO-016, Q-SEO-001 |

## Goal

One language-independent catalogue lists every SEO slice the legacy site serves (336 per language: section × city ×
district | quarter | station | by-owner × rooms, plus the hubs and the special pages), and an hourly job materialises
each slice's numbers — active listings, new in 7 days, owner listings, usual prices per room count with «по N из M»,
price per m² for sale and new builds — with an indexability flag, a data-based `lastmod` and one snapshot id shared by
all three languages.

## Legacy reference

- `03b` §2.1 (inventory: 1 008 pages, 336 per language, per-type counts and which districts have pages), §2.2 (address
  scheme and service-slug translations), LND-040 … LND-051, LND-058; §2.5 items 1, 2 and 4 (backend needs);
  `$KVADRO_ROOT/docs/seo-pages.md:44-145`, `:263-287` (calculations).
- RES-017, RES-019; ENT-055 (computed per request with a 5-minute CDN cache, probably — Q-DATA-046).
- Rules: BR-API-136, BR-SEO-001 (prefixes and slugs), BR-SEO-002 (place slugs, language-neutral), BR-SEO-003 (rooms
  slugs; rent 1–3, sale and new builds 1–4), BR-SEO-005 (which slices exist), BR-SEO-006 and BR-SEO-035 (threshold:
  ≤ 9 noindex, ≥ 11 indexed, cut-off 10 unverified), BR-SEO-010 (counters), BR-SEO-011 (usual price = district
  median, `n из m`), BR-SEO-016 (sale and new-builds statistics), BR-SEO-036 (a shrinking slice stays `200` +
  `noindex`), BR-DATA-037.
- Defects: LB-SEO-003 (languages disagreed on numbers — one snapshot), LB-SEO-010 (`Last-Modified` = render time —
  data time instead), LB-SEO-002 (plural agreement; the data carries counts, the frontend pluralises).
- Open: Q-SEO-001 (full page set), Q-SEO-002 (exact cut-off), Q-SEO-008 (existence rule), Q-SEO-016 (date basis of
  «новых за 7 дней»), Q-SEO-020 (Tashkent region districts vs towns), DEC-30 (threshold policy), DEC-15 (S2 scope).

## Implementation

1. Read `.claude/skills/programmatic-seo/` (slice design), `.claude/skills/laravel-database-optimization/`, the
   KV-DB-011 task (`seo_slices`) and the KV-BE-139 task (`market_medians`).
2. `config/seo.php`: service-slug table per language (`arenda|ijara|rent`, `prodazha|sotuv|sale`,
   `novostrojki|novostroyka|new-builds`, `N-komnatnye|N-xonali|N-room`, `bez-posrednikov|maklersiz|by-owner`,
   `indeks|indeks|index`, `metodika|metodika|methodology`, `ceny|narxlar|prices`, `metro` in all three — Q-SEO-010),
   rooms ranges per section, `index_threshold` = 10 (DEC-30; Q-SEO-002), `new_window_days` = 7.
3. Additive migration on `seo_slices` (`php artisan make:migration add_catalogue_columns_to_seo_slices_table
   --no-interaction`): `slice_key varchar(160) unique` (canonical, language-free, e.g. `rent/tashkent/yunusobod/r2`),
   `kind` (`hub`, `city`, `city_rooms`, `district`, `district_rooms`, `quarter`, `metro_hub`, `metro_station`,
   `owners_city`, `owners_district`, `rent_index`, `methodology`, `sale_prices`), `owners_count int`, `stats jsonb`
   (per-rooms medians and `n`/`m`, per-m² values, district tables — the shape is documented in the PR and pinned by a
   test), `exists_since timestamptz`, `content_hash char(64)`, `lastmod_at timestamptz`.
4. `php artisan make:class Services/PublicData/SeoSliceCatalogue --no-interaction`: builds the slice set from the
   gazetteer: the three hubs; six cities × three sections; city + rooms; districts with pages per BR-SEO-005 (12 in
   Tashkent; Tashkent region `chirchiq`, `olmaliq`, `zangiota` for rent, `qibray`, `toshkent-tumani` for sale and new
   builds — Q-SEO-020; none for the four other cities); district + rooms; 45 quarters (rent, Tashkent, nested under
   the hokimiyat district); the metro hub and 35 stations; by-owner city and the by-owner districts; index,
   methodology, sale prices. A seeded list of the legacy slice keys (`database/seeders/SeoLegacySliceSeeder.php`,
   generated from the slug scheme and the KV-QA-014 URL list, marked `spec` until the Q-SEO-001 crawl) guarantees that
   every legacy URL keeps a slice.
5. Existence rule (spec until Q-SEO-008): a slice exists if it is in the legacy seed or if its `listings_count` has
   reached the threshold once; an existing slice never disappears (`exists_since` kept; thin → `indexable = false`,
   BR-SEO-036). A gazetteer combination that never had data and is not in the seed does not exist (the frontend
   answers the localised `404`, BR-SEO-004).
6. `php artisan make:class Services/PublicData/SeoSliceAggregator --no-interaction` — per slice, in one pass of
   grouped queries (no N+1): `listings_count` (active listings of the slice's deal, place and rooms),
   `new_7d` (first seen within the last 7 × 24 h — Q-SEO-016; DEV-014 `PROPOSED` would use Tashkent calendar days),
   `owners_count` (explicit owner mark: owner wording or the channel hashtag, BR-SEO-010), medians per room count from
   `market_medians` (scope district or city, 60-day window, `n ≥ 8`, else `null` rendered «—»; `n` used and `m` total
   for «по N из M», BR-SEO-011), sale and new builds: price and price per m² with the sale exclusions of BR-SEO-016
   (new build = `market = new` from the text or the channel's new-build flag); the district × rooms table for city
   pages (cells `null` under 8). Index, methodology and sale-price slices carry no counters here (KV-BE-161).
7. Snapshot: `seo:refresh` (`php artisan make:command PublicData/RefreshSeoSlices --no-interaction`) runs hourly after
   the median job (`10` §4.11), writes all slices with one `data_snapshot_id` (ULID) per run; `content_hash` =
   SHA-256 of the visible aggregates plus the card id lists of KV-BE-160; `lastmod_at` changes only when the hash
   changes (LB-SEO-010; Q-SEO-003 for the legacy semantics); `indexable = listings_count ≥ index_threshold`.
8. Cache flush: the refresh bumps a `seo:snapshot` cache key so the public API (KV-BE-159) serves the new snapshot to
   all three languages at once (LB-SEO-003).

## Files

- `backend/database/migrations/<date>_add_catalogue_columns_to_seo_slices_table.php` (new)
- `backend/app/Services/PublicData/{SeoSliceCatalogue,SeoSliceAggregator}.php`, `backend/app/Domain/PublicData/SliceKey.php`,
  `backend/app/Enums/PublicData/SliceKind.php` (new)
- `backend/app/Console/Commands/PublicData/RefreshSeoSlices.php`; `backend/config/seo.php`;
  `backend/database/seeders/SeoLegacySliceSeeder.php` (new); `backend/routes/console.php`
- `backend/tests/Feature/PublicData/{SeoSliceCatalogueTest,SeoSliceAggregatorTest}.php`,
  `backend/tests/Unit/PublicData/SliceKeyTest.php` (new)

## API contract

n/a — read by the public statistics API (KV-BE-159), the sitemap data (KV-BE-163) and the interlinking (KV-BE-164).
`SliceKey::fromPath(lang, path)` and `SliceKey::toPath(lang)` are the only translators between URLs and keys.

## Business rules

- Kept: BR-API-136, BR-SEO-001 … BR-SEO-003, BR-SEO-005, BR-SEO-010, BR-SEO-011, BR-SEO-016, BR-SEO-036,
  BR-DATA-037; threshold 10 per DEC-30 (BR-SEO-035 unverified, Q-SEO-002).
- Defect fixes `APPROVED`: LB-SEO-003 (one snapshot), LB-SEO-010 (data-based `lastmod`).
- DEV-014 `PROPOSED` (Tashkent calendar days for «новых за 7 дней») behind `seo.new_window_mode`; test
  `->todo('DEV-014 PROPOSED')`. DEV-050 (thin pages and interlinking) is KV-BE-164.

## Acceptance criteria

- The catalogue yields 336 slices (counts per type as in `03b` §2.1) on the gazetteer seed; every legacy slice key of
  the seed round-trips `toPath()` → `fromPath()` in all three languages.
- A slice with 9 listings is `indexable = false`, with 10 `true` (configurable), with 11 `true`.
- A slice dropping from 12 to 3 listings still exists, `indexable = false`, `exists_since` unchanged.
- Two refreshes without data changes keep `lastmod_at` and `content_hash`; one new listing in the slice changes both.
- All slices of one run share one `data_snapshot_id`.

## Tests

- `SliceKeyTest` (unit): dataset of the legacy examples (`/arenda/tashkent/yunusobod/2-komnatnye/` =
  `/uz/ijara/tashkent/yunusobod/2-xonali/` = `/en/rent/tashkent/yunusobod/2-room/`), `4-komnatnye` under rent is not a
  key (BR-SEO-003), upper-case and foreign-language slugs are not keys.
- `SeoSliceCatalogueTest`: `catalogue_has_336_slices_by_type`, `regional_cities_have_no_district_slices`,
  `tashkent_region_districts_per_section`, `quarters_only_rent_tashkent_45`, `seeded_legacy_slices_always_exist`,
  `slice_reaching_threshold_once_keeps_existing`.
- `SeoSliceAggregatorTest`: `threshold_boundary_9_10_11`, `shrinking_slice_stays_and_becomes_noindex`,
  `new_7d_boundary_at_7x24h_plus_minus_1s`, `new_7d_at_tashkent_midnight_19_utc` (rolling, not calendar),
  `owners_count_counts_text_and_hashtag_marks`, `median_null_under_8_listings`, `n_of_m_matches_market_medians`,
  `sale_excludes_down_payments_and_outliers`, `new_builds_by_text_or_channel_flag`,
  `one_snapshot_id_per_run`, `lastmod_stable_without_change`, `lastmod_changes_with_new_listing`,
  `no_n_plus_one_queries` (query count bounded), `->todo('DEV-014 PROPOSED')`.
- `pgsql` group: the refresh over the KV-QA-005 coverage dataset finishes within the hourly budget (timing recorded
  for KV-QA-020).

## Edge cases

- A district whose name changes in the gazetteer: the slug stays (language-neutral) and the key is unchanged.
- Small samples: medians under 8 → `null`; never a median from 1–7 listings on a public page.
- Takedown or withdrawal between refreshes: counts lag by at most an hour; cards are filtered live (KV-BE-160).
- Refresh overlap: `withoutOverlapping`; a crashed run leaves the previous snapshot intact (new snapshot rows written
  in a transaction, then the snapshot key switched).
- Quarter membership depends on the quarter named in the text (BR-SEO-021, Q-SEO-006): slices count `quarter_id`
  as resolved by the geo pipeline (M6).

## Security

- SEC-REQ-021 (all strings rendered as text by the landing; names come from the gazetteer, not from listing texts),
  SEC-REQ-040 (taken-down listings never counted after the next refresh), no personal data in `seo_slices`.

## Definition of done

Tests green (`make ci-backend`, `pgsql` group), parity gate items ticked (`15` §4) for the data parts of F-SEO-001,
F-SEO-002, F-SEO-005 and F-SEO-008, docs and the feature rows in `09` updated, PR reviewed by the other developer.
