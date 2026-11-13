# KV-TG-053 — Digest at the user's digest times

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend — Telegram bot (track: development) |
| Complexity | M |
| Feature IDs | F-DELIVERY-003 |
| Dependencies | KV-TG-052 (release sweep and the `DigestDispatcher` seam), KV-TG-050 (pacer), KV-TG-022 (card opened by number, delivered-card log); backend delivery planner (digest slots from `DigestSchedule`, F-DELIVERY-003) and delivered set (`DeliveryLedger`, `DeliveryEligibility`, F-DELIVERY-005); Q-BOT-003 |

## Goal

Radars in digest mode deliver one list message per user and digest slot (09:00, 12:00, 19:00, 20:00 Asia/Tashkent by
preset); the same message carries the morning release after quiet hours. Each row opens the full card on demand, every
listed listing is claimed in the delivered set, and an empty digest is never sent. Slot computation and re-planning are
the backend planner's; this task composes and sends the message.

## Legacy reference

- Outbound step BOT-082 (never observed), text TXT-BOT-087 (format unknown), the radar-card status line
  `📬 Подборкой — список новых объявлений в заданное время (/settings)` (`$KVADRO_ROOT/docs/telegram-bot.md:710-711`),
  settings row `📬 Время подборок` (BTN-069, `04` §3.14).
- Rules: BR-BOT-074 (presets), BR-BOT-078 (digest times per user, digest-mode radars only), BR-BOT-100, BR-BOT-077
  (quiet release is one digest), BR-API-082, BR-API-084, BR-DATA-012, BR-DATA-016.
- Nearest observed list format: the starter list TXT-BOT-035 with number buttons BTN-031 (BOT-052) — reused so the bot
  has one list idiom.
- Open: Q-BOT-003 (format, size cap, empty digest, one digest for all radars or per radar), Q-DATA-014.

## Implementation

1. Read `04` §3.8 (starter list format), KV-QA-006, the backend planner and delivered-set tasks. Tests first
   (`php artisan make:test --pest Delivery/DigestTest`).
2. Bind `DigestDispatcher` (KV-TG-052) to `App\Services\Delivery\QueuedDigestDispatcher`, which dispatches one
   `SendDigest(user, reason, item ids)` on `notifications`.
3. `App\Services\Delivery\DigestComposer` (spec format, `oracle: spec` until Q-BOT-003 is answered):
   - header `bot.digest.header` — «📬 Подборка: N новых» (new text written for TXT-BOT-087, product-owner approval);
     for `reason = quiet_end` the header variant `bot.digest.header_morning`;
   - when the user has several digest radars, rows grouped under the radar title (BR-BOT-065 format);
   - rows as TXT-BOT-035: `<n>. <rooms>-комн. <type> · <district> · <price> · @<channel> · <dd.mm HH:MM>`, newest first,
     price in the user's currency (F-SETTINGS-004), every value escaped (KV-TG-007);
   - number buttons five per row `k1:ln:<listing number>` → the card as a new message (KV-TG-022, origin `number`);
   - cap 30 rows (`delivery.digest_max_rows`, PROPOSED) and never more than fits in 4 096 characters; overflow line
     `bot.digest.more` with a `web_app` button to the Mini App feed (`TELEGRAM_MINIAPP_URL`).
4. `php artisan make:job Delivery/SendDigest` (`PaceTelegramSends`): for each item, `DeliveryEligibility::check` and
   `DeliveryLedger::claim($user, $listing, $radar, CardOrigin::Digest)`; listings that fail either are left out; if no
   listing remains, nothing is sent. Overflow items beyond the cap are claimed too (counted as delivered, no carry-over
   flood). Send the digest, then write one `bot_listing_messages` row per listed listing with `origin='digest'` and the
   digest's `message_id` (so KV-TG-054 can edit the row). A permanent failure (`400`, `403`) releases the claims
   (`DeliveryLedger::release`); `403` raises `ChatUnreachable`.
5. No schedule entries of its own: slots arrive through the every-minute sweep of KV-TG-052 (`release_at` = slot).

## Files

- `backend/app/Services/Delivery/{DigestComposer,QueuedDigestDispatcher}.php`, `backend/app/Jobs/Delivery/SendDigest.php`
  (new); `backend/app/Providers/AppServiceProvider.php` (binding)
- `backend/lang/{ru,uz,en}/bot.php` (`digest.*`)
- `backend/tests/Feature/Delivery/DigestTest.php` (new), spec transcript `digest.json` (KV-QA-009)

## API contract

Bot API `sendMessage` (HTML, inline keyboard of number buttons and one `web_app` button). No HTTP endpoint. Internal:
`DigestDispatcher::dispatchFor()` binding; backend `DeliveryLedger` / `DeliveryEligibility`.

## Business rules

- Kept: BR-BOT-074, BR-BOT-078, BR-BOT-077, BR-BOT-100, BR-API-082, BR-API-084, BR-DATA-012, BR-DATA-016.
- Spec-tested (Q-BOT-003): one digest per user and slot across radars, 30-row cap, empty digest not sent (`09`
  acceptance for F-DELIVERY-003), reuse of the starter-list idiom.
- No DEV; the format is a specification, approved by the product owner with the texts.

## Acceptance criteria

- For each due digest group exactly one message is sent; groups whose listings are all ineligible or already delivered
  send nothing.
- A listed listing is never sent again as a card or in a later digest (claim in the delivered set).
- A digest fan-out for all migrated digest radars (staging volume) finishes within 10 minutes (`18` §5.1).
- Texts and row format match the approved specification in ru, uz, en.

## Tests

| # | Case (frozen clock, Asia/Tashkent, `FakeBotApi`) | Expected |
| - | ------------------------------------------------ | -------- |
| 1 | digest `09,19`, 3 digest items released at 19:00 | one message, 3 rows, buttons `1` `2` `3`; 3 claims; 3 log rows `origin=digest` with the same `message_id` |
| 2 | released group whose 2 listings were already delivered | nothing sent |
| 3 | two digest radars, 2 + 1 items | one message, two radar groups |
| 4 | press `2` on the digest | card of listing 2 as a new message (KV-TG-022), digest unchanged |
| 5 | 45 items | 30 rows + `bot.digest.more` with a `web_app` button; all 45 claimed |
| 6 | a listing withdrawn before the send | left out by eligibility; count adjusted |
| 7 | `reason = quiet_end`, 2 held items | morning header variant, same row format |
| 8 | `SendDigest` handled twice for the same group | second run: claims fail, nothing sent |
| 9 | fake answers `429 retry_after=5` | digest sent after 5 s, once |
| 10 | fake answers `403` | claims released, `ChatUnreachable` |
| 11 | 10 000 due users (performance case, KV-QA-020) | all sent within the pacer rate; finished < 10 min in the staging run |
| 12 | locale `uz`, currency `UZS` | Uzbek texts, prices in soʻm |

## Edge cases

- Instant radars never feed digests except through the quiet release.
- A user who switched a radar from digest to instant with items pending: the planner keeps them as digest items for
  the next slot (no burst of cards).
- Rows with very long district or channel names: the composer stops adding rows before 4 096 characters.

## Security

- SEC-REQ-020 (all row values escaped), SEC-REQ-029 (paced sends), SEC-REQ-047 (counts only in logs), SEC-REQ-019
  (`web_app` URL from config, https).

## Definition of done

Tests green (`make ci-backend`), spec transcript `digest.json` green, digest performance case recorded in KV-QA-020,
parity-gate cells of F-DELIVERY-003 updated (Q-BOT-003 answered by specification, product owner sign-off of the
format), `09` row updated, PR reviewed by the other developer.
