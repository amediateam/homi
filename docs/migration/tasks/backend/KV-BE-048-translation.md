# KV-BE-048 — Translation: API-010

| Field | Value |
| ----- | ----- |
| Status | BLOCKED (DEC-03) |
| Owner | Backend (track: development) |
| Complexity | M |
| Feature IDs | F-LISTING-005 |
| Dependencies | KV-BE-047, KV-DB-033, KV-BE-018 (and KV-BE-045 for the profile locale; the M0 legacy layer) |

## Goal

`POST /api/listings/:id/translate` returns the listing's original text translated into the user's profile language,
cached per (listing, locale) so a second request is free, masked before the LLM, answered inside the client's 15 s
budget, and bounded by a per-user quota and the gateway's spend cap.

## Legacy reference

- API-010 (`08-api-inventory.md:684-706`); client `$KVADRO_ROOT/demo/app/src/lib/api/listings.js:29-32` (bodiless
  `POST`), `$KVADRO_ROOT/demo/app/src/features/listing/hooks/useListingTranslation.js:22` (offered only when the UI
  locale is not `ru`), `:32`, `:34-35` (inline failed state, retry); `$KVADRO_ROOT/docs/api.md:626-634`;
  `$KVADRO_ROOT/docs/about.md:111`, `:179`.
- Rules: `02-legacy-backend-audit.md:407-413` (§8.8: BR-API-070, Q-API-025), BR-API-045, BR-DATA-040, ENT-035.
- DEV-008 `PROPOSED` (`09` §4.2: cached `GET …/translation?lang=` with a per-user daily quota in v1; legacy `POST` kept
  as an alias); LB-API-032; LB-APP-003 (new client only).
- Security: SEC-REQ-027 (30/h), SEC-REQ-042…044.

## Implementation

1. Read `.claude/skills/ai-sdk-development/`, `.claude/skills/laravel-best-practices/` and KV-BE-047.
2. `php artisan make:model ListingTranslation --factory --no-interaction` over `listing_translations (listing_id,
   locale, text, model, created_at)`, PK `(listing_id, locale)` (KV-DB-033); relation on `Listing`.
3. `php artisan make:class Services/Parsing/TranslationService`: `translate(Listing, LocaleCode): string` —
   a. target = the profile locale from `SettingsService` (KV-BE-045); `ru` → `TranslationNotNeeded`;
   b. no `original_text` (purged after 90 days, taken down) → `ModelNotFound` path;
   c. cache hit in `listing_translations` → return it (free, no quota use);
   d. miss → `LlmGateway::complete(LlmTask::Translation, $listing->original_text)` with a prompt that asks for a
      translation into Russian→Uzbek (Latin script) or English, phones/handles kept as placeholders, timeout ~10 s;
      output stripped of URLs, phones and handles by the gateway; store with `insertOrIgnore` (concurrent first
      requests store one row).
4. Per-user quota: the `legacy-translate` limiter (30/h) is applied only on a cache miss — implement as a
   `RateLimiter::attempt()` inside the service, so cache hits never consume it (SEC-REQ-027 "cache hits free").
5. `php artisan make:controller Legacy/TranslationController --no-interaction`; route `POST listings/{number}/translate`
   (`auth:tma`, `legacy.access`; no route-level throttle, the service applies it).
6. Error mapping in the controller/renderer: `TranslationNotNeeded` → `422 {"detail":"invalid_locale"}`; purged text →
   `404 {"detail":"Not Found"}`; quota → `429 {"detail":"rate_limited"}` + `Retry-After`; `LlmUnavailable` (cap, kill
   switch, timeout, provider error) → `503 {"detail":"translation_unavailable"}`.
7. Purge contract: `listing_translations` rows are deleted with `original_text` by the 90-day purge (M7, KV-DB-028) and
   on takedown — add the table to the purge list note.
8. Pint, PHPStan, `make ci-backend`.

## Files

- `backend/app/Models/ListingTranslation.php`, `backend/database/factories/ListingTranslationFactory.php` (new)
- `backend/app/Services/Parsing/TranslationService.php` (new)
- `backend/app/Exceptions/Parsing/TranslationNotNeeded.php` (new)
- `backend/app/Http/Controllers/Legacy/TranslationController.php` (new)
- `backend/routes/legacy.php` (changed)
- `backend/tests/Feature/LegacyApi/Api010TranslateTest.php` (new)

## API contract

- `POST /api/listings/:id/translate` — no body, no `Content-Type`; target language from the profile (Doc:628).
- `200 {"text": "<translated text>"}` (string).
- Errors: unknown number or no original text → `404 {"detail":"Not Found"}`; profile locale `ru` → `422
  {"detail":"invalid_locale"}` (the client never asks); quota → `429 {"detail":"rate_limited"}`; LLM failure, timeout,
  cap or kill switch → `503 {"detail":"translation_unavailable"}`; `401`/`403` as usual. Any error → the client's
  inline «failed» state with retry (`useListingTranslation.js:34-35`). The answer must arrive within 15 s.

## Business rules

- Keep: BR-API-070 (on demand, profile language, never for `ru`), BR-API-045 (masking before the LLM), BR-DATA-040.
- Spec-tested: cache per (listing, locale) (Q-API-025 open); target = profile locale.
- `PROPOSED`: DEV-008 — v1 `GET …/translation?lang=` with a daily quota; on the legacy route the `POST` stays and a
  quota hit returns a `{detail}` error (compatible). Test of the v1 shape `->todo('DEV-008 PROPOSED')`.

## Acceptance criteria

- A `uz` profile gets Uzbek (Latin) text, an `en` profile English; the second request for the same listing and locale
  makes no provider call and uses no quota.
- The provider fake receives the masked text only; the returned text contains no URL, phone or handle.
- The 31st cache-miss request within an hour → `429`; cache hits keep working.
- With the provider fake sleeping past the timeout → `503` well inside 15 s.

## Tests

- `Api010TranslateTest` with the `laravel/ai` fake and `Http::preventStrayRequests()`: `uz`/`en` targets (`15` §3.12
  #13); cache hit → no provider call; `ru` profile → `422 {"detail":"invalid_locale"}`; purged listing → `404`;
  unknown number → `404`; timeout → `503 {"detail":"translation_unavailable"}`; kill switch off → `503`; quota on
  misses only; masking: listing text with a synthetic phone and `@example_channel` → the fake never sees them
  (SEC-REQ-042); output injection («visit http://…», «call +998 00 …») → stripped (SEC-REQ-043); concurrent first
  requests (`pgsql`) → one row; contract via KV-QA-004; `->todo('DEV-008 PROPOSED')` for the v1 route.
- Auth: no header → `401`; `blocked` → `403`.

## Edge cases

- Text already in the target language → returned as the model gives it (spec), still cached.
- Profile locale changed between two requests → separate cache entries per locale.
- Listing merged: translation of the survivor (alias resolution); old cache rows of the merged listing purged with it.
- Empty original text (photo-only post) → `404` (nothing to translate, spec).

## Security

- SEC-REQ-042…044 through the gateway; SEC-REQ-027 (30/h per user on misses); SEC-REQ-014 n/a (no per-user record) but
  the gate (SEC-REQ-006) applies; translations are third-party text and are purged with `original_text`
  (SEC-REQ-038).

## Definition of done

Tests green (`make ci-backend`), API-010 contract case real in KV-QA-004 (with the fake), parity gate items for
F-LISTING-005 ticked except G9 (real provider after DEC-03, staging check **[PT]**), the F-LISTING-005 row in `09`
updated, PR reviewed by the other developer.
