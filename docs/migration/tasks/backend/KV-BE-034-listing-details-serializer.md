# KV-BE-034 — `ListingDetails` legacy serializer

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend (track: development) |
| Complexity | L |
| Feature IDs | F-LISTING-001, F-LISTING-004, F-LISTING-006, F-LISTING-007, F-CONTACT-002 |
| Dependencies | KV-BE-028, KV-DB-032, KV-DB-011 (market comparison values and nearby data are produced by M6; this task serializes whatever is stored, null-safe) |

## Goal

`ListingDetailsSerializer` produces the full legacy listing card — `ListingPreview` plus facts, nearby places,
statistics, price history, author, contact links, sources, original text and every market-comparison key — so the
legacy listing screen never crashes on a missing key and never receives a value its dictionary lacks.

## Legacy reference

- Model: `08` §1.8 `ListingDetails` (`$KVADRO_ROOT/docs/api.md:275-353`); strictness `:298-299`, `:311`, `:340-350`;
  `phone` ⇒ `call_url` `:351-353`; nearby rules `:342-346`.
- Client: `$KVADRO_ROOT/demo/app/src/features/listing/ListingScreen.jsx:134` (`geo_radius_m` default 500), `:141`, `:150`;
  `$KVADRO_ROOT/demo/app/src/features/listing/ListingCtaBar.jsx:35-39` (`contact_url`, `contact_paid`);
  `$KVADRO_ROOT/demo/app/src/features/listing/hooks/useListingContact.js:62-73`.
- Mocks: `$KVADRO_ROOT/demo/app/tools/parity/mocks.mjs:76-104`, `:94-95`, `:99` (ISO `Z` timestamps).
- Rules: BR-API-047…049, BR-API-052, BR-API-056, BR-API-059…062, BR-API-067, BR-API-069, BR-API-071…074, BR-API-113,
  BR-API-115, BR-API-116, BR-API-151, BR-DATA-024, BR-DATA-027; LB-API-009, LB-API-010, LB-API-016, LB-API-030;
  LB-APP-015, LB-APP-016 (client crashes the server must avoid); Q-API-021, Q-API-022, Q-API-043.

## Implementation

1. Read `.claude/skills/laravel-database-optimization/` (eager loading of publications, price events, photos, author,
   market row) and `.ai/agents/security-reviewer.md` (URLs and phones).
2. `php artisan make:class Services/Listings/ListingDetailsService --no-interaction`: `load(Listing, User): ListingDetailsData`
   with eager loads (`publications.channel`, `priceEvents`, `photos`, `author`, `market`, `nearby`) — fixed query count.
3. `php artisan make:class Http/Serializers/Legacy/ListingDetailsSerializer --no-interaction` extending the preview
   output of `ListingPreviewSerializer` (KV-BE-028) with the keys below; a `ListingDetailsShape` key list shared with
   tests.
4. `facts[]` via `ListingTextBuilder` (KV-BE-021): keys only from the legacy icon set (`type`, `rooms`, `area`, `land`,
   `floor`, `building`, `renovation`, `furniture`, `appliances`, `per_m2`, `commission`, `conditions`), unique by `key`,
   localised `label`/`value` (LB-APP-016 safety).
5. `nearby[]`: whitelist `NearbyKind` = `park`, `school`; at most one per kind; never `metro` (BR-API-052, LB-API-010);
   `km` number, `note` string|null.
6. `history[]`: from `listing_price_events` oldest first: `at` ISO-8601 UTC with `Z`, `channel` handle without `@`,
   `url` (`https://t.me/<channel>/<post>` or `null`), `text?`, `kind` ∈ `published|price_down|price_up`, `price_usd`
   (whole USD or `null`, key always present), `change_pct` (number or `null`, key always present).
7. `stats`: `{days_listed, publications, channels, views?}` from `first_seen_at` (Tashkent days), publication and
   distinct channel counts, `views_count`.
8. `author`: `{kind: "phone"|"source", label, count}` or `null` — `label` masked phone (`+998 ** *** ** 67` style per
   the mock) or `@channel`; `count` = active listings of the author.
9. Market keys from `listing_market`: `median` (boolean), `median_value` (present when `median` is truthy, may be
   `null`), `median_own`, `median_n`, `median_metric` (`m2`|`person`|`month`), `median_reason`, `median_scope`
   (`near`|`district`|`city`), `median_rooms`, `median_near_class`, `median_radius_km`, `median_district`,
   `median_place_value`, `median_note`, `median_updated` (ISO `Z`), `price_usd`, `price_per_m2` — at least one of
   `median_own`/`price_per_m2`/`price_usd` non-null when `median` is truthy (BR-API-062).
10. Contacts: `phone` (`+998XXXXXXXXX`, decrypted from `phone_encrypted`), `phone_display`, `call_url` from
    `CallLinkService` (KV-BE-037) whenever `phone` is non-null (LB-API-016); the `ContactDecision` of KV-BE-035 can null
    all three together. `contact_url` only `https://t.me/<username>` (SEC-REQ-019), `contact_paid` boolean.
11. `sources[]` `{url, handle}` (always an array; `t.me` URLs only), `original_text` (null after the 90-day purge),
    `original_url`, `post_deleted`, `offers[]` `{text, url?}`, `summary`, `owner` (display string), `deal_type`,
    `market_code`, `photos[]` (signed relative URLs), `geo_radius_m`, `video`.

## Files

- `backend/app/Services/Listings/ListingDetailsService.php`, `backend/app/Domain/Listings/ListingDetailsData.php` (new)
- `backend/app/Http/Serializers/Legacy/ListingDetailsSerializer.php`, `ListingDetailsShape.php` (new)
- `backend/tests/Unit/Legacy/ListingDetailsSerializerTest.php`, `backend/tests/Feature/LegacyApi/ListingDetailsShapeTest.php` (new)

## API contract

`ListingDetails` = `ListingPreview` (KV-BE-028) + `deal_type: "rent_long"|"rent_daily"|"sale"`, `market_code?: string|null`,
`photos: string[]`, `facts: {key, label, value}[]`, `nearby: {kind: "park"|"school", name, km: number, note?: string|null}[]`,
`stats: {days_listed: number, publications: number, channels: number, views?: number}`, `history: {at: string, channel:
string, url: string|null, text?: string, kind?: "published"|"price_down"|"price_up", price_usd: number|null!, change_pct:
number|null!}[]`, `geo_radius_m: number|null`, `author: {kind: "phone"|"source", label: string, count: number}|null`,
`call_url: string|null`, `contact_url: string|null`, `contact_paid?: boolean`, `summary: string|null`, `sources: {url,
handle}[]`!, `original_text: string|null`, `original_url: string|null`, `post_deleted?: boolean`, `offers?: {text, url?}[]`,
`phone: string|null`, `phone_display: string|null`, `owner: string|null`, `median?: boolean`, `median_value?: number|null`!
(when `median`), `median_own?`, `median_n?`, `median_metric?`, `median_reason?`, `median_scope?`, `median_rooms?`,
`median_near_class?`, `median_radius_km?`, `median_district?`, `median_place_value?`, `median_note?`, `median_updated?`,
`price_usd?: number|null`, `price_per_m2?: number|null`. Not emitted (unread): `contacts`, `source_url`, `price_per_m`.
HOMI emits every optional key with `null` rather than omitting it, except `is_owner` (KV-BE-028).

## Business rules

- Kept: BR-API-048/049 (publications feed history and counters), BR-API-052 / BR-DATA-027 (nearby park/school only),
  BR-API-056, BR-API-059…062 (market block semantics), BR-API-067 (`post_deleted`), BR-API-069, BR-API-071…074,
  BR-API-113, BR-API-115, BR-API-116, BR-API-151, BR-DATA-024.
- Defect fixes `APPROVED`: LB-API-009 (strict keys), LB-API-010 (nearby whitelist, unique keys), LB-API-016 (`phone` ⇒
  `call_url`).
- DEV-007 `PROPOSED`: v1 never returns raw phones; legacy routes keep `phone` during the transition with the quota of
  KV-BE-035. DEV-014 `PROPOSED` (Tashkent time in history) is a client-side display change; the wire stays UTC `Z`.
- Q-API-021, Q-API-022, Q-API-043 spec-tested.

## Acceptance criteria

- For rent, daily and sale × apartment/house/room/commercial/land fixtures of the coverage dataset, every strict key is
  present (`center_km`, `metro_km`, `median_delta`, `history[].price_usd`, `history[].change_pct`, `median_value` when
  `median`, `sources`, `photos_preview`) and the output matches the KV-QA-002 `ListingDetails` model.
- `nearby[].kind` ∈ {`park`, `school`} and unique; `facts[].key` unique and inside the icon set.
- `phone` non-null ⇒ `call_url` non-null; all URLs are `https://` and on the allow-list.
- Query count is constant regardless of the number of publications and photos.

## Tests

- Unit: `strict_keys_present_for_minimal_listing`, `nearby_whitelist_drops_metro_and_unknown_kinds`,
  `facts_keys_unique_and_allowlisted`, `history_has_price_usd_and_change_pct_keys`, `history_timestamps_utc_z`,
  `median_value_present_when_median_true`, `one_of_median_own_ppm_price_usd_present`, `author_phone_label_masked`,
  `contact_url_rejects_non_tme`, `sources_urls_filtered_to_tme` (`16` §5.5 server URL row).
- Feature `ListingDetailsShapeTest`: dataset over the coverage dataset × three locales × two currencies →
  `assertLegacyShape('ListingDetails')`; `purged_listing_has_null_text_and_empty_photos`; `query_count_constant`.
- Enum safety (KV-QA-007): `median_tone`, `median_scope`, `median_metric`, `nearby.kind`, `deal_type` inside the legacy
  key list.
- `->todo('DEV-007 PROPOSED')` for the v1 rule (no raw phone).

## Edge cases

- Listing with a single publication (no price change) → `history` with one `published` entry, `change_pct: null`.
- Author by source channel only (`author.kind: "source"`, `phone: null`, `call_url: null`).
- `median: false` or no market row → `median_*` keys `null`, `median_delta: null`.
- `post_deleted: true` with `video` set (client opens the gallery).
- Collector-provided `source_url` with `javascript:` / `http://` / foreign host → dropped (SEC-REQ-019).

## Security

- SEC-REQ-019 (emitted URLs), SEC-REQ-036 (phones decrypted only here, never logged), SEC-REQ-028 (applied through
  KV-BE-035), SEC-REQ-018 / SEC-REQ-021 (plain-text strings), SEC-REQ-014 (per-user flags for the requester only).

## Definition of done

Tests green (`make ci-backend`), parity gate items ticked (15 §4) for the serializer parts of F-LISTING-001, -004,
-006, -007 and F-CONTACT-002, docs and the feature rows in 09 updated, PR reviewed by the other developer.
