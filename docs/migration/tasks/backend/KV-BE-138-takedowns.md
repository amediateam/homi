# KV-BE-138 — Takedowns and the phone opt-out list

| Field | Value |
| ----- | ----- |
| Status | TODO (SLA value BLOCKED by Q-SEC-007) |
| Owner | Backend (track: development); handling of real requests is an operator task **[PT]** |
| Complexity | M |
| Feature IDs | F-ADMIN-002, F-PIPELINE-006 |
| Dependencies | KV-BE-137, KV-DB-032 (`takedown_requests`), KV-BE-026 (`ListingPhotoStore::erase`), KV-BE-126 (channel opt-out); Q-SEC-007 |

## Goal

An author's request removes their listing (by post link, listing number or phone) from every surface at once and keeps
it gone: the listing becomes `taken_down`, its photos and landing snapshots are erased, delivered cards are queued for
the «Объявление снято» edit, and a phone opt-out (stored only as an HMAC) refuses future posts with that number at
intake — operated by commands now and by ARM later.

## Legacy reference

- BR-API-068 / BR-BOT-092 (on an author's request — support bot or e-mail — the listing leaves feed, map, site and
  alerts; sent cards are edited), BR-DATA-022 (taken-down listings never reappear), BR-API-043 (channel opt-outs —
  KV-BE-126), LB-API-054 / LB-DATA-016 (landing snapshots must be reached too), ENT-037,
  `$KVADRO_ROOT/docs/about.md:184-185`, `$KVADRO_ROOT/demo/landing/site/privacy.html:73`.
- SEC-REQ-040 (takedown by post link or phone through support and ARM; removal from feed, map, SEO, landing data,
  alerts, photos and snapshots within an SLA; phone opt-out list (HMAC) stops re-ingestion; E2E acceptance), Q-SEC-007
  (SLA and legal basis), GAP-023, GAP-026 (support bot out of scope until DEC-21).

## Implementation

1. Read `.ai/agents/security-reviewer.md`, KV-DB-032, KV-BE-026, KV-BE-137. Tests first.
2. Migration `create_phone_opt_outs_table` (`php artisan make:model PhoneOptOut -m --no-interaction`): `phone_hmac
   bytea` PK, `created_at`, `via`, `takedown_request_id` — no phone in any other form.
3. `php artisan make:class Services/Listings/TakedownService --no-interaction`:
   - `byPostUrl(string $url, string $via)` — parses `https://t.me/<handle>/<post>` → publication → listing;
   - `byNumber(int $number, string $via)` — through `ListingNumberResolver` (aliases resolve to the survivor);
   - `byPhone(string $e164, string $via, bool $optOut = true)` — HMAC → author → every listing of the author; with
     `optOut` the HMAC goes into `phone_opt_outs`;
   - each call writes `takedown_requests` (scope, target, `requested_via`, `requested_at`), then per listing in one
     transaction `ListingStatusMachine::transition(taken_down, Takedown, actor)`, then `processed_at`;
   - after commit: `ListingWithdrawn` (status `taken_down`) → delivered-card edits (telegram track `11b` M5.8,
     F-DELIVERY-006), radar pending items dropped (KV-BE-111), `ListingTakenDown` → Media `ListingPhotoStore::erase()`
     (all photos), landing snapshot removal (KV-BE-156), SEO/landing data invalidation (M7), edge purge request.
4. Intake guard: `IntakeAcceptService` (KV-BE-122) and `ListingIngestService` (KV-BE-134) check `phone_opt_outs` for
   every extracted phone; a match → record stored `rejected: phone_opted_out`, nothing published.
5. Commands until ARM: `php artisan make:command Listings/Takedown --no-interaction` → `listings:takedown
   {--post-url=} {--number=} {--phone=} --via=support|email|arm [--no-opt-out]`, prints affected numbers only;
   `listings:takedowns --pending`. Audit line per action (actor name, never a Telegram id).
6. SLA metric: time from `requested_at` to `processed_at` exported for the monitor (`17` §12); the SLA value is
   recorded when Q-SEC-007 is answered.

## Files

- `backend/app/Services/Listings/TakedownService.php`, `backend/app/Events/Listings/ListingTakenDown.php`,
  `backend/app/Listeners/Media/ErasePhotosOnTakedown.php`, `backend/app/Models/PhoneOptOut.php`,
  `backend/app/Console/Commands/Listings/{Takedown,ListTakedowns}.php` (new); migration `create_phone_opt_outs_table`
- `backend/tests/Feature/Listings/TakedownServiceTest.php`, `backend/tests/Feature/Listings/TakedownEndToEndTest.php` (new)

## API contract

n/a (commands; ARM endpoints later, GAP-023). After a takedown: API-008 for the number → `404 {"detail":"Not Found"}`;
`/media/<number>/<n>.jpg` → `404` at once (status checked per request, SEC-REQ-024).

## Business rules

- BR-API-068, BR-BOT-092, BR-DATA-022, LB-API-054 fix (snapshots purged, `09` §4.3 policy), SEC-REQ-040.

## Acceptance criteria

- E2E (SEC-REQ-040): after `listings:takedown --phone=<synthetic>` the author's listings are absent from feed, count,
  map, radar matching, SEO slice data and landing data; their `/media` URLs answer `404`; their photos' objects are
  deleted when unreferenced; the next intake post with that phone is rejected.
- Processing the same takedown twice changes nothing the second time (`15` §3.5 #7 — no second edit event).
- The database holds the opted-out phone only as an HMAC.

## Tests

- `TakedownServiceTest`: `by_post_url_resolves_publication`, `by_alias_number_takes_down_survivor`,
  `by_phone_takes_down_all_author_listings_and_opts_out`, `no_opt_out_flag_respected`, `second_takedown_is_noop`,
  `request_row_written_and_processed`, `phone_stored_only_as_hmac` (DB scan).
- `TakedownEndToEndTest`: `listing_disappears_from_every_surface` (feed, count, map, radar predicate, SEO slice
  builder, landing builder fakes), `media_url_404_immediately`, `photos_erased_when_unreferenced`,
  `next_intake_with_phone_rejected`, `merged_listing_takedown_cannot_resurface_through_unmerge`.

## Edge cases

- Phone shared by an agency with many flats: `byPhone` takes down all of them — the command prints the count and asks
  for `--confirm` above 10 listings.
- Request for a listing already purged after 90 days: recorded, nothing else to do.
- Takedown of a listing that is part of a pending merge review: the candidate is marked `superseded`.
- A channel-level request: handled by `channels:opt-out` (KV-BE-126), which uses the same service per listing.

## Security

- SEC-REQ-040, SEC-REQ-024 (status checked on every `/media` request), SEC-REQ-025 (erasure-compatible photos),
  SEC-REQ-036 (HMAC only), SEC-REQ-046 (future ARM roles), SEC-REQ-047 (commands log numbers, never phones).

## Definition of done

Tests green (`make ci-backend`), the operator procedure written in `docs/api/intake.md` (operations) until ARM,
`09` rows F-ADMIN-002 and F-PIPELINE-006 updated, PR reviewed by the other developer.
