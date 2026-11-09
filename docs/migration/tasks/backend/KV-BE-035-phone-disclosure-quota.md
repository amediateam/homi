# KV-BE-035 — Phone-disclosure quota

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend (track: development) |
| Complexity | S |
| Feature IDs | F-CONTACT-001, F-LISTING-001 |
| Dependencies | KV-BE-007, KV-DB-007 (thresholds: DEC-19 / Q-SEC-003) |

## Goal

`ContactDisclosure` limits how many distinct listings' phone numbers one user receives per Tashkent day: under the soft
threshold everything is returned; above it the legacy surface returns the same shape with `phone`, `phone_display` and
`call_url` set to `null`; above the hard threshold the account is flagged for review.

## Legacy reference

- Phones exposed by the legacy contract: `08` §1.8 `ListingDetails.phone`, `phone_display`, `call_url`
  (`$KVADRO_ROOT/docs/api.md:316-317`, `:351-353`); call links `$KVADRO_ROOT/docs/about.md:237-241`.
- Client behaviour with `phone: null`: «Позвонить» hidden, number buttons in the text not linked
  (`$KVADRO_ROOT/demo/app/src/features/listing/hooks/useListingContact.js:62-73`).
- Findings and requirements: SEC-002, SEC-003, SEC-015; SEC-REQ-028 (`16` §4.6); LB-API-030 → DEV-007; Q-SEC-003; DEC-19.

## Implementation

1. Read `.ai/agents/security-reviewer.md` and `.claude/skills/laravel-owasp-security/`.
2. `php artisan make:class Services/Listings/ContactDisclosure --no-interaction` with
   `decide(User, Listing): ContactDecision` (`Allow`, `Suppress`) and `record(User, Listing)`.
3. Counter: Redis set `contact:{user_id}:{Y-m-d Asia/Tashkent}` of listing numbers with TTL until the end of the Tashkent
   day + 1 h; distinct numbers only (re-opening the same listing does not count again).
4. Thresholds in `config/contacts.php`: `soft_limit` and `hard_limit` (env `CONTACT_SOFT_LIMIT`, `CONTACT_HARD_LIMIT`),
   both `PROPOSED` values pending DEC-19; `null` = disabled. A number already disclosed today is always allowed again.
5. Hard threshold: set `access_grants.flagged_at` and `flag_reason = 'contact_quota'` once (KV-DB-007), log at `warning`
   with the internal user id only, and raise `ContactQuotaExceeded` (for the monitoring alert of SEC-REQ-048); blocking is
   an operator action (KV-BE-011), never automatic.
6. Callers: `ListingDetailsService` (KV-BE-034/036) asks `decide()` before emitting the three keys and `record()` when it
   emits a phone; `CallLinkService` (KV-BE-037) counts issued call links the same way.
7. Sequential walk heuristic (optional, behind config): more than N consecutive numbers in a minute raises the same event.

## Files

- `backend/app/Services/Listings/ContactDisclosure.php`, `backend/app/Domain/Listings/ContactDecision.php` (new)
- `backend/app/Events/Listings/ContactQuotaExceeded.php` (new)
- `backend/config/contacts.php` (new)
- `backend/tests/Feature/Listings/ContactDisclosureTest.php` (new)

## API contract

No endpoint of its own. Effect on API-008 and API-009: above the soft threshold `GET /api/listings/:id` keeps every key
and type but `phone`, `phone_display`, `call_url` are `null` together (BR-API-113 stays true: no `phone` without
`call_url`); `GET /api/listings/:id/call` answers `404 {"detail":"Not Found"}` (spec — the client ignores refresh errors
and keeps the old link). Nothing else changes.

## Business rules

- Kept: BR-API-113 (`phone` ⇒ `call_url`; suppression nulls both), BR-API-116 (format unchanged when allowed).
- DEV-007 `PROPOSED`: the legacy surface keeps returning phones during the transition (quota-limited); v1 never returns
  raw phones — v1 part not in this task.
- Thresholds are a product decision (DEC-19); until decided, configuration defaults are documented as `PROPOSED` and
  production starts with them disabled or high (record the choice in the PR).

## Acceptance criteria

- With test thresholds soft 3 / hard 5 (`16` §4.6 acceptance): listings 1–3 return phones, the 4th returns the three keys
  as `null`, the 6th flags the user; re-opening listing 1 still returns its phone.
- The counter resets at 00:00 Asia/Tashkent (19:00 UTC), not at UTC midnight.
- Normal browsing fixtures (KV-QA-005 profile) stay under both thresholds.

## Tests

`backend/tests/Feature/Listings/ContactDisclosureTest.php` (array cache in tests, frozen clock):

- `soft_threshold_nulls_phone_display_and_call_url_together`; `hard_threshold_flags_user_once`.
- `same_listing_counts_once_per_day`; `counter_resets_at_tashkent_midnight` (`travelTo` 18:59:59 / 19:00:00 UTC).
- `disabled_when_thresholds_null`; `two_users_have_separate_counters`.
- `call_link_issuance_counts_towards_quota` (with KV-BE-037).
- `flag_log_contains_no_phone_or_telegram_id` (log capture, SEC-REQ-047).
- `->todo('DEV-007 PROPOSED')` (v1 never returns raw phones).

## Edge cases

- Listing without a phone: never counted.
- `blocked` user never reaches the service (gate of KV-BE-009).
- Redis unavailable: fail closed for disclosure (suppress) and log once; never `500` on the listing screen.

## Security

- SEC-REQ-028 (the requirement implemented here), SEC-REQ-014 (counter per requester), SEC-REQ-036 (phones not logged),
  SEC-REQ-048 (alert hook). Thresholds and walk detection reduce harvesting by id iteration (SEC-002, SEC-003).

## Definition of done

Tests green (`make ci-backend`), parity gate items ticked (15 §4) for the quota rows of F-CONTACT-001, DEC-19 recorded in
the PR (decided values or the disabled default), docs and the feature rows in 09 updated, PR reviewed by the other
developer; the new env keys announced in the PR.
