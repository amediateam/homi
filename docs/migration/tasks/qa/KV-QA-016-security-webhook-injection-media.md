# KV-QA-016 — Security suite 2: webhook, bot input, injection, media and call URLs

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | QA (track: development); review by the `security-reviewer` agent and the other developer |
| Complexity | L |
| Feature IDs | F-BOT-012, F-BOT-013, F-OWNER-001, F-MAP-001, F-MEDIA-001, F-MEDIA-003, F-ANALYTICS-001, F-LANDING-007, F-SEO-006, F-PIPELINE-002, F-LISTING-005, F-DELIVERY-002, F-OWNER-003 |
| Dependencies | KV-QA-003, KV-QA-008, KV-QA-009; T1 (webhook pipeline); media and call routes (CF-012); AI module for the LLM cases |

## Goal

Forged webhook calls, duplicate updates, forged callbacks and contacts, injection payloads in every output sink,
malicious files and tampered capability URLs are all covered by tests that expect the behaviour of `16` §4. Since the
owner-cabinet plan it also covers the owner photo uploads (re-encoding, metadata, size and count caps), built by WP-84.

## Legacy reference

- `16` §5.3 (webhook forgery and bot input), §5.5 (injection payloads), §5.6 (file and media abuse), §5.4 (media and
  call replay).
- Requirements: SEC-REQ-008 … SEC-REQ-011, SEC-REQ-013, SEC-REQ-017 … SEC-REQ-026, SEC-REQ-029, SEC-REQ-042,
  SEC-REQ-043.
- Fixes: LB-API-008 (map labels), LB-API-023 (uniform media `404`) — defect fixes in `09` §4.3.
- HOMI today: `backend/app/Http/Middleware/VerifyTelegramSecretToken.php`, `backend/config/telegram.php:34` (1 MB),
  `backend/tests/Feature/Media/HashedUploaderTest.php` (existing upload cases).
- Cases: `15` §3.3, §3.8.

## Implementation

1. Read `.ai/agents/security-reviewer.md`, `16` §4.2, §4.4, §4.5, §5.
2. `backend/tests/Feature/Security/WebhookAuthenticityTest.php`: no header, wrong secret, another environment's secret,
   empty configured secret → `403` and no `telegram_updates` row; correct secret on a non-hook host → `404`; 2 MB body
   → `413` before parsing; non-JSON content type refused.
3. `backend/tests/Feature/Security/UpdateIdempotencyTest.php`: same update twice in sequence → one row, one job, one
   effect; same `update_id` for another `bot_id` → processed; a throwing handler → `200`, row `failed`, no duplicate
   effect. The concurrent variant lives in `Feature/Pgsql/Concurrency/` with `Burst` (10 parallel posts).
4. `backend/tests/Feature/Security/CallbackForgeryTest.php` and `OwnerContactTest.php`: another user's radar id,
   malformed bytes, 65 bytes, every known legacy prefix (after Q-BOT-017) → TXT-BOT-039, no state change; forwarded
   contact, contact without `user_id`, contact in a group → refused; `/ping` from a non-admin shows no versions.
5. `backend/tests/Fixtures/Security/payloads.json`: synthetic corpus — `<img src=x onerror=…>`,
   `x" onmouseover="…`, `</script><script>…`, `<b>`, `</blockquote>`, `&amp;`, `<a href="tg://…">`, a 5 000-character
   text, `=HYPERLINK(…)`, `+cmd`, `@SUM(…)`, `' OR 1=1--`, a 41-vertex polygon, `NaN` coordinates, `limit=100000`,
   CRLF, 100-level JSON nesting, `#tgWebAppData=` in `source`, prompt-injection lines (SEC-REQ-043), `javascript:`,
   `http://` and foreign-host URLs.
6. `backend/tests/Feature/Security/InjectionCorpusTest.php`: each payload through each sink of `16` §5.5 — map `label`
   and `tone`, bot cards and digests (through `FakeBotApi` validation), CSV exports, filters (`422` or normalised,
   never `500`), `/api/events` (scrubbed, bounded), server-emitted URLs (absent), `/start` payloads (not stored);
   SEO JSON-LD and titles once the SEO renderer exists; LLM extraction and translation against the AI fake once the AI
   module exists (`todo` until then).
7. Extend `backend/tests/Feature/Media/HashedUploaderTest.php` with polyglot JPEG+HTML, SVG, HTML renamed `.jpg`,
   pixel flood (50 000 × 50 000), GPS EXIF stripping; add `PhotoFetchSsrfTest.php` for collector photo URLs
   (`http://`, `127.0.0.1`, `169.254.169.254`, redirect to private, DNS to `10.0.0.0/8`, slow and huge bodies) with
   faked DNS/HTTP.
8. `backend/tests/Feature/Security/LegacyMediaUrlTest.php` (SEC-REQ-024: valid, altered `s`, other `n`, other number,
   past `e`, `e` > 48 h ahead, missing `s` → `404`, taken-down listing → `404`; headers) and `CallPageTest.php`
   (SEC-REQ-026: fresh, expired, other listing; `noindex`, `no-store`, `no-referrer`, CSP `default-src 'none'`).
9. `backend/tests/Feature/Security/OutboundPacingTest.php`: `FakeBotApi` answers `429 retry_after=3` → nothing sent to
   that chat for 3 s (frozen clock), no duplicate (SEC-REQ-029); `TokenRedactionTest.php`: a forced transport error
   produces log and Telescope entries without the token (SEC-REQ-013).

## Files

- `backend/tests/Feature/Security/{WebhookAuthenticityTest,UpdateIdempotencyTest,CallbackForgeryTest,OwnerContactTest,InjectionCorpusTest,PhotoFetchSsrfTest,LegacyMediaUrlTest,CallPageTest,OutboundPacingTest,TokenRedactionTest}.php` (new)
- `backend/tests/Feature/Pgsql/Concurrency/UpdateIdempotencyBurstTest.php` (new)
- `backend/tests/Fixtures/Security/payloads.json` (new)
- `backend/tests/Feature/Media/HashedUploaderTest.php` (extended)

## API contract

Webhook: `POST /telegram/webhook` with `X-Telegram-Bot-Api-Secret-Token`; media `/media/{number}/{n}(.s).jpg?e=&s=`;
call `/call/{token}`; events `POST /api/events`; map `GET /api/map`.

## Business rules

SEC-REQ rules as listed; BR-API-055 and BR-API-152 (media signing and UTC expiry); BR-BOT-081 (own contact only).

## Acceptance criteria

- Every case of `16` §5.3, §5.5, §5.6 is a test (real or `todo` naming its blocker).
- No payload ever produces a `5xx` or appears unescaped in an output.
- The existing 28 media cases stay green.

## Tests

As listed.

## Edge cases

- Secret rotation: old and new secret both accepted for at most 5 minutes (SEC-REQ-008), with a frozen clock.
- Truncation of bot texts never splits an entity or tag (SEC-REQ-020).
- Re-posted old `update_id` after pruning → no state change (`16` §5.4).

## Security

Payloads are synthetic and inert outside the tests; no real URLs of third parties besides `example` hosts.

## Definition of done

Tests green (`make ci-backend`, `make ci-backend-pgsql`), parity gate items ticked (15 §4), docs and the feature rows
in 09 updated, PR reviewed by the other developer.
