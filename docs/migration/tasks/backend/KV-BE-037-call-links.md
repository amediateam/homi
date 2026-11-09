# KV-BE-037 — Call links: API-009 and RES-005 `/call/<token>`

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend (track: development); nginx log format for `/call/*` **[PT]** |
| Complexity | M |
| Feature IDs | F-CONTACT-001, F-MEDIA-003 |
| Dependencies | KV-BE-034, KV-BE-035, KV-BE-005 (and the `legacy-call` / `legacy-call-page` limiters of KV-BE-010; CF-013 option A) |

## Goal

A user can call a listing's author from any platform: `GET /api/listings/:id/call` issues a fresh signed call link
valid for at least ten minutes, and `GET /call/<token>` on the Mini App origin renders a minimal no-JavaScript page with
a `tel:` link — bound to one listing and one requesting user, never exposing the phone in the URL.

## Legacy reference

- API-009 (`08` §2): `$KVADRO_ROOT/docs/api.md:112`, `:610-624`; `$KVADRO_ROOT/docs/about.md:237-241`.
- Client: `$KVADRO_ROOT/demo/app/src/lib/api/listings.js:23`, `$KVADRO_ROOT/demo/app/src/features/listing/hooks/useListingContact.js:9-10`
  (TTL 10 min, refresh at 8 min), `:24-52`, `:59` (URL resolved against the origin, `openLink`), `:62-72`.
- RES-005 (`08` §3): `$KVADRO_ROOT/docs/about.md:239-240`, `:303`, `:454` (signing secret);
  `$KVADRO_ROOT/demo/app/src/lib/telegram/links.js:14-40` (Android `tel:` with fallback to the page).
- Rules: BR-API-112, BR-API-113, BR-API-114, BR-API-116; LB-API-016, LB-API-045, LB-APP-028; SEC-015; Q-API-042.

## Implementation

1. Read `.ai/agents/security-reviewer.md` and `.claude/skills/laravel-owasp-security/` (capability URLs, headers).
2. `php artisan make:class Services/Listings/CallLinkService --no-interaction`:
   `issue(User, Listing): CallLink` and `verify(string $token): ?CallLinkClaims`. Token =
   base64url(`{"n":<number>,"u":<user id>,"x":<expiry unix>}`) + `.` + base64url(HMAC-SHA256(`CALL_LINK_SIGNING_KEY`,
   payload)); verification with `hash_equals`, previous key accepted during rotation (`CALL_LINK_SIGNING_KEY_PREVIOUS`),
   expiry = issue time + `CALL_LINK_TTL` (600 s) and accepted until `x + 60 s` skew. Stateless (no table, ENT-038).
3. `issue()` calls `ContactDisclosure` (KV-BE-035): suppressed → no link (`null` in details, `404` on API-009); allowed →
   counts the listing.
4. `php artisan make:controller Legacy/ListingContactController --invokable --no-interaction`;
   `GET api/listings/{id}/call` with `auth:tma`, `legacy.access`, `throttle:legacy-call` (30/h); owner-agnostic but
   bound to the requester in the token; listing without phone, unknown, purged → `404 {"detail":"Not Found"}`.
5. `php artisan make:controller Legacy/CallPageController --invokable --no-interaction`; `GET call/{token}` in
   `routes/legacy.php` without prefix, `auth` or gate (external browser, no `initData`), host-bound to
   `LEGACY_APP_HOSTS`, `throttle:legacy-call-page` (IP 30/min). Blade view `resources/views/legacy/call.blade.php`
   (plain Blade, not Inertia — ADR-0002 is respected because it is not part of the frozen SPA): listing title, formatted
   phone and a `tel:+998…` link; no scripts, no external assets, inline CSS only.
6. Checks on every request: signature, expiry, listing exists by `n`, still has a phone, not purged or taken down.
   Expired → `410` with a localised expiry page («Ссылка устарела — откройте объявление в приложении ещё раз»; locale
   from the token's user settings) — `410` because the capability existed and is gone, intermediaries never cache it,
   and the external browser shows the page body either way. Bad signature, unknown listing, purged → `404` page.
7. Headers on both pages: `X-Robots-Tag: noindex`, `Cache-Control: no-store`, `Referrer-Policy: no-referrer`,
   `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'`, `X-Content-Type-Options: nosniff`.
8. `ListingDetailsSerializer` (KV-BE-034) calls `issue()` for `call_url` whenever it emits `phone`.
9. **[PT]** nginx access log for `/call/*` drops the token segment (SEC-REQ-026, SEC-REQ-047); new env keys
   `CALL_LINK_SIGNING_KEY`, `CALL_LINK_SIGNING_KEY_PREVIOUS`, `CALL_LINK_TTL` announced in the PR.

## Files

- `backend/app/Services/Listings/CallLinkService.php`, `backend/app/Domain/Listings/CallLinkClaims.php` (new)
- `backend/app/Http/Controllers/Legacy/{ListingContactController,CallPageController}.php` (new)
- `backend/resources/views/legacy/call.blade.php`, `backend/resources/views/legacy/call-expired.blade.php` (new)
- `backend/lang/{ru,uz,en}/call.php`; `backend/routes/legacy.php`; `backend/config/contacts.php` (TTL, keys)
- `backend/tests/Feature/LegacyApi/Api009CallLinkTest.php`, `backend/tests/Feature/LegacyApi/Res005CallPageTest.php` (new)

## API contract

- API-009: `GET /api/listings/<number>/call` → `200 {"url": "/call/<token>"}` (relative; the client resolves it against
  the Mini App origin). Errors: `404 {"detail":"Not Found"}` (no phone, unknown, purged, quota-suppressed), `401`,
  `403 <reason>`, `429 {"detail":"rate_limited"}`; the client ignores refresh errors and opens the old link on tap.
- RES-005: `GET /call/<token>` → `200 text/html` (call page) | `410 text/html` (expired) | `404 text/html` (invalid);
  headers as in step 7. The token never contains the phone.

## Business rules

- Kept: BR-API-112 (signed temporary page, ≥ 10 min validity, client refresh at 8 min works), BR-API-113 (`phone` ⇒
  `call_url`), BR-API-114 (Android `tel:` fallback reaches this page), BR-API-116 (phone format on the page).
- Defect fixes `APPROVED`: LB-API-016 (`call_url` whenever `phone`), LB-API-045 (`expires_at` returned by v1 — the
  legacy body stays `{url}`; the v1 field is M9).
- Q-API-042 spec-tested: links are bound to the requester and reusable within the TTL (not single-use).

## Acceptance criteria

- A fresh link opens the call page with a working `tel:` link for 10 minutes (frozen clock: valid at +600 s and +659 s,
  expired at +661 s).
- A token for listing A never shows listing B; an altered payload or signature → `404`; a token signed with the
  previous key works during rotation.
- The response headers match step 7 exactly; the page contains no `<script>` and no external URL.
- Issuing a link counts towards the requester's quota (SEC-REQ-028).

## Tests

- `Api009CallLinkTest`: `returns_relative_call_url`, `refresh_returns_new_working_url`, `listing_without_phone_404`,
  `unknown_id_404`, `quota_suppressed_404`, `issuance_counts_towards_quota`, auth/access dataset,
  `limiter_31st_call_per_hour_is_429`.
- `Res005CallPageTest`: `fresh_token_renders_tel_link`, `expired_token_renders_410_expiry_page` (frozen clock),
  `token_for_listing_a_cannot_show_b` (`15` §3.1 #14), `tampered_signature_404`, `previous_key_accepted`,
  `purged_listing_404_even_with_valid_token`, `headers_match_sec_req_026`, `page_has_no_script_or_external_url`,
  `phone_not_in_url`, `served_only_on_legacy_app_host`, `limiter_31st_page_per_minute_is_429`.

## Edge cases

- Token issued for a user who was erased afterwards → `404` (user id in the token no longer exists).
- Listing taken down after issue → `404` immediately (status checked per request).
- Clock skew between servers: the 60 s skew window.
- `contact_paid: true` listings still get a call page (Q-API-043 — no paid feature known).

## Security

- SEC-REQ-026 (the requirement implemented here), SEC-REQ-028 (quota), SEC-REQ-033 (headers), SEC-REQ-034 (separate
  signing key per environment), SEC-REQ-047 (token not logged **[PT]**), SEC-REQ-014 (token bound to the requester).

## Definition of done

Tests green (`make ci-backend`), parity gate items ticked (15 §4) for F-CONTACT-001 and F-MEDIA-003, the nginx log note
handed to the production track, docs and the feature rows in 09 updated, PR reviewed by the other developer.
