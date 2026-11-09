# KV-BE-025 — Owner badge resolver

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend (track: development) |
| Complexity | S |
| Feature IDs | F-OWNER-002 |
| Dependencies | KV-DB-008, KV-DB-010; decisions DEV-011 (keyed hash, `PROPOSED`), DEC-29; questions Q-API-041, Q-DATA-019 |

## Goal

Previews and details carry the owner signals the legacy client turns into badges — `is_owner` and `owner_verified` —
computed by one batched resolver from the listing's owner status, its author's phone HMAC, the owner verifications and
the realtor rules, with a kill switch, so feed pages, map cards and (M5) bot cards agree.

## Legacy reference

- `ListingPreview.is_owner?: boolean`, `owner_verified?: boolean` (`08` §1.8); badge priority «Проверьте цену» >
  «Хозяин ✓» > «Ниже рынка» > «Хозяин» (BR-API-111) — the code puts «Подозрительно дёшево» first (C-09, BR-APP-026);
  the client picks the badge, the server supplies the fields.
- Verified owners: listings whose phone matches the stored hash get `owner_verified` («Хозяин · номер подтверждён»,
  `$KVADRO_ROOT/demo/app/src/i18n/locales/ru.js:100`) (BR-API-108); not applied when the number appears in listings of
  ≥ 3 different flats or is marked as a realtor's (BR-API-109; `$KVADRO_ROOT/docs/about.md:233-235`).
- "From the owner" = explicit owner statement or channel hashtag `#хозяин`, `#собственник` (BR-API-046, BR-API-035);
  `agent` report not offered when `is_owner: false` (BR-API-105).
- Owner hash: legacy algorithm unknown (Q-API-041, Q-DATA-019); HOMI uses HMAC-SHA-256 over E.164 (DEV-011
  `PROPOSED`); legacy hashes kept only for a transition window (LB-DATA-005, DEC-29, KV-DB-030).
- Detector rules: SEC-REQ-045 (kill switch, audit, neutral wording).

## Implementation

1. Read `.ai/agents/security-reviewer.md` (detectors that label people) and the KV-DB-008/KV-DB-010 schemas
   (`listings.owner_status`, `listing_authors.phone_hmac`, `distinct_flats`, `realtor_mark_at`,
   `owner_verifications.phone_hmac`, `legacy_hash`, `legacy_hash_alg`).
2. `php artisan make:class --no-interaction Services/Listings/OwnerBadgeResolver` with
   `forListings(Collection<int, Listing> $listings): array<string, OwnerBadges>` — one query joining the page's
   authors with `owner_verifications` on `phone_hmac`, plus (only while `config('owner.legacy_hash_alg')` is set and
   the window is open) the transitional match on `legacy_hash` computed by the configured legacy algorithm.
3. `php artisan make:class --no-interaction Domain/Listings/OwnerBadges` (`?bool isOwner`, `bool ownerVerified`).
   Rules: `isOwner` = `true` for `owner_status = owner`, `false` for `agent`, `null` (key omitted) for `unknown`;
   `ownerVerified` = verification match AND `distinct_flats < 3` AND `realtor_mark_at IS NULL`; a verified listing
   reports `isOwner = true`.
4. Kill switch: Pennant feature `owner-badges` (`php artisan pennant:feature --no-interaction OwnerBadges`); when
   inactive both fields are omitted/false for every listing (SEC-REQ-045).
5. Expose to the preview and details serializers (KV-BE-028, KV-BE-034) and to M6 ingestion (owner flags on new
   listings) and M5 cards.

## Files

- `backend/app/Services/Listings/OwnerBadgeResolver.php`, `backend/app/Domain/Listings/OwnerBadges.php`
- `backend/app/Features/OwnerBadges.php`
- `backend/config/owner.php` (`legacy_hash_alg`, `legacy_window_ends_at`)
- `backend/tests/Feature/Listings/OwnerBadgeResolverTest.php`

## API contract

Feeds `is_owner?: boolean` (omitted when unknown) and `owner_verified?: boolean` of `ListingPreview` and
`ListingDetails` (`08` §1.8). Internal:

```php
OwnerBadgeResolver::forListings(Collection $listings): array   // keyed by listing id → OwnerBadges
```

## Business rules

- Kept: BR-API-046, BR-API-105 (via `is_owner: false`), BR-API-108, BR-API-109, BR-API-111 / C-09 (client priority,
  fields consistent), BR-DATA-005.
- DEV-011 (`PROPOSED`): HMAC matching is the target; the transitional legacy-hash match runs only while configured
  (`todo('DEV-011 PROPOSED')` on the window-end behaviour); DEV-010 (`PROPOSED`) changes how realtor marks are set
  (KV-BE-043), not this read rule.

## Acceptance criteria

- Dataset: owner listing with a verified, clean author → `is_owner: true`, `owner_verified: true`; same author with
  3 distinct flats → `owner_verified: false`; with a realtor mark → `false`; agent listing → `is_owner: false`;
  unknown status → `is_owner` key absent.
- A page of 20 listings is resolved with at most two queries.
- With the Pennant feature off, no listing reports `owner_verified: true` and `is_owner` is omitted.
- After the configured legacy window ends, legacy-hash matches stop counting.

## Tests

- `OwnerBadgeResolverTest`: the dataset above (factories for `listing_authors`, `owner_verifications`); query count via
  `DB::listen`; kill switch with `Feature::deactivate()`; legacy-hash window with a frozen clock
  (`todo('DEV-011 PROPOSED')` for the window semantics); phone-less (source) authors never verified.
- Contract hand-off: KV-BE-028 asserts the keys in feed fixtures.

## Edge cases

- Several listings of one author on a page: resolved once.
- A verification removed by the owner (`/owner` «Убрать номер», M5) takes effect on the next request (no cache).
- `distinct_flats` is maintained by ingestion (M6); until then the seed value is used.
- Merged listings take the survivor's author.

## Security

- Phones are never read in clear: matching is on `phone_hmac` only; the transitional legacy hash is never
  brute-forced (SEC-REQ-041, LB-DATA-005).
- SEC-REQ-045: kill switch, no label from a single vote, neutral wording stays in the client.
- No PII in responses beyond two booleans.

## Definition of done

Tests green (`make ci-backend`), parity gate items ticked (15 §4), docs and the feature row in 09 updated, PR
reviewed by the other developer. Pint and PHPStan level 7 clean; the Pennant feature name is listed in the PR for the
production track.
