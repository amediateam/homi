# KV-BE-028 — `ListingPreview` legacy serializer

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend (track: development) |
| Complexity | M |
| Feature IDs | F-FEED-001, F-LOCALE-003, F-OWNER-002 |
| Dependencies | KV-BE-020, KV-BE-021, KV-BE-025, KV-BE-026 (and the personal-list tables of KV-DB-010 for `favorite` / `viewed`; KV-QA-002 model `ListingPreview`; KV-QA-007 enum key list) |

## Goal

One serializer turns a page of listings plus the requesting user into the exact legacy `ListingPreview` array shape used
by feed, favourites, history, «Скрытое», radar previews and `?preview=1`: every strict key present, ids as JSON
integers, server-formatted strings in the user's locale and currency, enum values the legacy client knows.

## Legacy reference

- Model: `08` §1.8 `ListingPreview` (`$KVADRO_ROOT/docs/api.md:227-273`); strictness `$KVADRO_ROOT/docs/api.md:245-246`,
  `:261`, `:1083-1086`.
- Client reads: `$KVADRO_ROOT/demo/app/src/features/feed/useInfiniteFeed.js:37-42` (de-duplication by `id` with `===`),
  `$KVADRO_ROOT/demo/app/src/main.jsx:26-33` (`photos_preview[0]` preload), `$KVADRO_ROOT/demo/app/src/lib/images.js:9-14`
  (thumbnail derivation from the relative URL), `$KVADRO_ROOT/demo/app/src/features/listing/ListingScreen.jsx:150`
  (`video` truthy flag).
- Parity mock shapes: `$KVADRO_ROOT/demo/app/tools/parity/mocks.mjs:76-104`.
- Rules: BR-API-071…074, BR-API-111, BR-API-154, BR-API-156, BR-API-056; LB-API-006, LB-API-009, LB-API-011,
  LB-API-029, LB-API-031; C-09 (badge priority, code wins).

## Implementation

1. Read `.claude/skills/laravel-database-optimization/` (N+1, eager loading) and `.claude/skills/testing-best-practices/`.
2. `php artisan make:class Http/Serializers/Legacy/ListingPreviewSerializer --no-interaction`; method
   `serializeMany(Collection $listings, User $user, LocaleCode $locale, Currency $currency): array` and `serialize()`.
3. Batch per-user flags with two queries per page: favourites (`favorites`) and views (`listing_views`) for the page's
   listing ids; never one query per item.
4. Strings through the display services: `title` / `short_title` / `status_text` / `market` / `age` / `district_name`
   via `ListingTextBuilder` and `TimeFormatter` (KV-BE-021); `price` via `PriceStringFormatter` (KV-BE-020) in the
   user's currency (`price_kind: "down_payment"` kept).
5. Photos: `photos_preview` = up to N relative URLs `/media/{number}/{n}.jpg?e=&s=` from `SignedPhotoUrl` (KV-BE-026),
   always an array; `photos_count`, `cover` (first photo); thumbnails are derived by the client (`.s.jpg`).
6. Badges: `is_owner` and `owner_verified` from `OwnerBadgeResolver` (KV-BE-025); `is_owner` omitted when the owner status
   is unknown.
7. Market fields from `listing_market` (KV-DB-011): `median_delta` (fraction, `null` when absent — key always present),
   `median_tone` mapped through `MedianTone` (unknown → `null`, never a new code, LB-API-006).
8. Distances `metro_km`, `center_km` as numbers rounded to 0.1 or `null` (keys always present); `metro`, `landmark`,
   `place` from the gazetteer names in the user's locale.
9. Output contract enforced by a `ListingPreviewShape` constant shared with tests (list of keys, strict flags).

## Files

- `backend/app/Http/Serializers/Legacy/ListingPreviewSerializer.php` (new)
- `backend/app/Http/Serializers/Legacy/ListingPreviewShape.php` (new; key list)
- `backend/tests/Unit/Legacy/ListingPreviewSerializerTest.php`, `backend/tests/Feature/LegacyApi/ListingPreviewShapeTest.php` (new)

## API contract

`ListingPreview` (`08` §1.8; `!` = always present):
`id: number`! (listing `number`, JSON integer < 2^53), `title: string`, `short_title?: string`, `price: string|null`
(parts ` · `, `(…)` in part 1, period from the first `/`), `price_kind: "down_payment"|null`, `favorite: boolean`!,
`viewed?: boolean`, `district_name: string|null`, `place?: string`, `landmark: string|null`, `metro: string|null`,
`metro_km: number|null`!, `center_km: number|null`!, `area_total: number|null`, `floor: number|null`,
`floors_total: number|null`, `rooms: number|null`, `pets_ok: boolean`, `is_owner?: boolean`, `owner_verified?: boolean`,
`photos_preview: string[]`!, `photos_count?: number`, `cover?: string`, `video: true|null`, `age: string|null`
(`<prefix> · <when>`), `status_text: string|null`, `market: string|null`, `median_delta: number|null`!,
`median_tone: "good"|"check"|"suspicious"|"same"|"mixed"|"no_repair"|null`, `lat: number|null`, `lon: number|null`.
Fields the client never reads (`usd`, `photos_total`, `tone`, `label`, `priced`) are not emitted.

## Business rules

- Kept: BR-API-071 (price string), BR-API-072 (`title` / `age` separators), BR-API-073 (`market` label), BR-API-074
  (strings rendered as received), BR-API-111 with C-09 (badge data; the client orders badges), BR-API-154 (USD numbers
  stay USD), BR-API-156 (`down_payment`), BR-API-056 (`video` truthy flag only).
- Defect fixes `APPROVED`: LB-API-009 (strict keys), LB-API-011 (integer ids), LB-API-006 (enum safety), LB-API-031
  (relative signed URLs with a `.s.jpg` sibling).
- DEV-019 (one distance formatter) `PROPOSED` — legacy rounding kept by default, new rule behind config, test
  `->todo('DEV-019 PROPOSED')`.

## Acceptance criteria

- For every listing of the KV-QA-005 coverage dataset the output matches the KV-QA-002 `ListingPreview` model in
  `shape` mode; strict keys present with `null` / `[]` where data is missing.
- `id` is a JSON integer; `photos_preview` is an array (possibly empty) of relative URLs matching
  `^/media/\d+/\d+\.jpg\?e=\d+&s=[0-9a-f]{32}$`.
- A page of 20 previews costs a constant number of queries (no N+1).
- No emitted enum value is missing from the legacy key list (KV-QA-007).

## Tests

- Unit `ListingPreviewSerializerTest`: `strict_keys_present_when_data_missing`, `id_is_integer`,
  `photos_preview_empty_array_without_photos`, `down_payment_price_kind`, `unknown_tone_becomes_null`,
  `is_owner_omitted_when_unknown`, `uzs_user_gets_sum_price_string` (KV-QA-006 fixture), `uz_locale_strings`.
- Feature `ListingPreviewShapeTest`: dataset over the coverage dataset × `ru`/`uz`/`en` × `USD`/`UZS` →
  `assertLegacyShape('ListingPreview')`; `favorite_and_viewed_flags_are_per_user` (users A and B);
  `query_count_is_constant_for_20_items`.
- Enum safety: `emitted_codes_are_in_legacy_i18n_keys` (KV-QA-007).
- `->todo('DEV-019 PROPOSED')` for the unified distance rule.

## Edge cases

- Listing without coordinates (`lat`/`lon` `null`) and without metro (`metro_km` `null`).
- Withdrawn listing within 90 days: `status_text` set, photos still signed; PII-purged: `photos_preview: []`.
- `rooms: 0` (studio), `area_total` with decimals, `floor` > `floors_total` from bad data (emitted as stored).
- Video flag on a listing with `post_deleted`.

## Security

- SEC-REQ-018 / SEC-REQ-021: strings carry no markup or entities (labels from the gazetteer are plain text, BR-DATA-029).
- SEC-REQ-014: per-user flags only for the requesting user. No phone or author data in previews (SEC-REQ-036).

## Definition of done

Tests green (`make ci-backend`), parity gate items ticked (15 §4) for the preview part of F-FEED-001 and F-OWNER-002,
docs and the feature rows in 09 updated, PR reviewed by the other developer.
