# KV-TG-003 — Update ledger privacy: redaction, encryption, `allowed_updates`, scheduled prune

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend — Telegram bot (track: development) |
| Complexity | M |
| Feature IDs | F-BOT-012, F-PRIVACY-003, F-PRIVACY-004 |
| Dependencies | KV-TG-002; KV-INF-007 (scheduler conventions); CF-019; DEC-12 (retention ADR — sets the final retention values, not the mechanism); DEV-011 and DEC-29 (keyed phone hash, legacy-hash window) |

## Goal

`telegram_updates` never holds a phone number, a name or a username, holds message texts only until the update is
processed, is encrypted at rest with its own key, receives only the update types the bot handles, and is pruned on a
schedule. This closes SEC-030 before any real user writes to a HOMI bot.

## Legacy reference

- Public promises in `/privacy` (TXT-BOT-083, `tb:850–865`): names and contacts are not stored (BR-BOT-085), phrases and
  voice are not stored (BR-BOT-055), the owner number is kept only as a hash (BR-BOT-081), deletion is immediate
  (BR-BOT-094). `04` §3.16, `04` §3.15.
- HOMI: `backend/database/migrations/2026_11_08_171041_create_telegram_updates_table.php` (`payload jsonb`, raw),
  `backend/config/telegram.php:26-32` (`allowed_updates` includes `edited_message`, `chat_member`),
  `backend/app/Models/TelegramUpdate.php:50-56` (Prunable, never scheduled), `backend/routes/console.php`.
- Findings and requirements: SEC-030, SEC-REQ-036, SEC-REQ-037, SEC-REQ-038, SEC-REQ-039; CF-019 option A; `10` §7 row
  "Telegram webhook stub"; ENT-019 target `owner_verifications.phone_hmac` (`06` §4.2).

## Implementation

1. Read `.ai/agents/security-reviewer.md`, `16` §4.9, `10` §3.19. Tests first
   (`php artisan make:test --pest Bot/UpdateLedgerPrivacyTest`).
2. `php artisan make:class Telegram/Updates/UpdateRedactor` with two methods:
   - `beforeStore(array $update): array` — for `message.contact`: normalise `phone_number` to E.164, replace it by
     `phone_hmac` (HMAC-SHA-256 with `PHONE_HMAC_PEPPER`, DEV-011) and, only while the DEC-29 transition window is
     configured, `legacy_phone_hash` computed by a pluggable legacy algorithm (unknown until Q-BOT-042 closes; disabled
     by default); keep `contact.user_id`; drop `contact.first_name`, `last_name`, `vcard`. For `from`, `chat`,
     `my_chat_member.from`, `callback_query.from`: drop `first_name`, `last_name`, `username`, keep `id`,
     `language_code`, `is_premium` and add `has_username: bool` (BR-API-007, SEC-REQ-036).
   - `afterProcessing(array $update): array` — remove `text`, `caption`, `entities`, `caption_entities`, `voice`,
     `audio`, `contact`, `location`, `venue`, `reply_to_message`, `photo`, `document`, `sticker` from every message
     object; keep ids, type, dates.
3. Controller (KV-TG-002) calls `beforeStore()` before `insertOrIgnore`; the job calls `afterProcessing()` and saves
   when the row becomes `done`. Failed rows keep the (already redacted, encrypted) payload until the retention prune.
4. Encryption at rest: `php artisan make:cast EncryptedJsonPayload` using a dedicated `Illuminate\Encryption\Encrypter`
   built from `TELEGRAM_UPDATES_ENCRYPTION_KEY` (not `APP_KEY`, `17` §4). `php artisan make:migration
   change_payload_to_text_on_telegram_updates_table` (`jsonb` → `text`; no production rows exist, flagged in the PR).
5. `config/telegram.php`: `allowed_updates` = `message`, `callback_query`, `my_chat_member` (SEC-REQ-037); the
   webhook command (KV-TG-005) and the server-side `setWebhook` (KV-INF-017, KV-INF-031) read this list.
6. `routes/console.php`: `Schedule::command('model:prune', ['--model' => [TelegramUpdate::class]])->daily()
   ->onOneServer()->withoutOverlapping()` (conventions of KV-INF-007). Retention stays
   `TELEGRAM_UPDATES_RETENTION_DAYS` (default 14, SEC-REQ-038) until DEC-12 says otherwise.
7. `TelegramUpdate::scopeForChat(int $chatId)` for the erasure procedure (KV-TG-049, SEC-REQ-039).
8. Add `TELEGRAM_UPDATES_ENCRYPTION_KEY`, `PHONE_HMAC_PEPPER`, `TELEGRAM_UPDATES_RETENTION_DAYS` to
   `backend/.env.example` (blank or default) and announce them (KV-INF-003 updates `environments.md`).

## Files

- `backend/app/Telegram/Updates/UpdateRedactor.php`, `backend/app/Casts/EncryptedJsonPayload.php` (new)
- `backend/database/migrations/<date>_change_payload_to_text_on_telegram_updates_table.php` (new)
- `backend/app/Models/TelegramUpdate.php`, `backend/app/Http/Controllers/Webhooks/TelegramWebhookController.php`,
  `backend/app/Jobs/Telegram/ProcessTelegramUpdateJob.php`, `backend/config/telegram.php`, `backend/routes/console.php`,
  `backend/.env.example` (changed)
- `backend/tests/Feature/Bot/UpdateLedgerPrivacyTest.php`, `backend/tests/Unit/Telegram/UpdateRedactorTest.php` (new)

## API contract

No change to the webhook responses of KV-TG-002. Stored shape (decrypted) of a contact message:
`message.contact = {"user_id": <id>, "phone_hmac": "<hex>", "legacy_phone_hash": "<hex>|null"}`; `from` without names.

## Business rules

- Kept promises: BR-BOT-055, BR-BOT-081, BR-BOT-085, BR-BOT-088 (masking happens in the LLM gateway; nothing raw is
  kept here), BR-BOT-094 (the ledger is in the erasure scope).
- DEV-011 (`PROPOSED`): keyed HMAC for owner phones; the legacy hash is computed only inside the DEC-29 window.
- No user-visible change.

## Acceptance criteria

- After a `/owner` contact update is stored and processed, a raw `SELECT payload` decrypts to a document with no digit
  sequence of the phone, no name and no username (SEC-REQ-037 acceptance).
- The raw column value is ciphertext; decrypting with `APP_KEY` fails.
- A processed text message keeps no `text`; a failed one keeps its encrypted payload until the prune.
- `schedule:list` shows the prune; with the clock 15 days ahead the prune deletes the rows.
- `getWebhookInfo` on the dev bot after `telegram:webhook set` lists exactly the three update types.

## Tests

| # | Case | Expected |
| - | ---- | -------- |
| 1 | `UpdateFactory::contact(userId: A, phone: '+998000000001')` stored | payload has `phone_hmac`, no `phone_number`, no `first_name` |
| 2 | same contact with spaces and without `+` | same `phone_hmac` (normalisation) |
| 3 | `from` with `username` | stored `has_username: true`, no `username` key |
| 4 | text message processed | `text` absent afterwards, `update_id` and `date` kept |
| 5 | text message whose handler fails 3 times | row `failed`, payload still encrypted, text still present until prune |
| 6 | raw column read with `DB::table()` | not valid JSON; decrypt with the ledger key works, with `APP_KEY` throws |
| 7 | `travelTo(now()->addDays(15))` + `artisan('schedule:run')` | rows older than 14 days gone, newer kept |
| 8 | DEC-29 window not configured | `legacy_phone_hash` is `null` |
| 9 | `chat_member` update | 200, not stored (removed from `allowed_updates`) |

## Edge cases

- A contact shared by another person (forwarded or picked from the address book) is still hashed; the owner handler
  refuses it later (KV-TG-046) — the raw number is never stored either way.
- Key rotation of `TELEGRAM_UPDATES_ENCRYPTION_KEY`: rows older than the retention are gone within 14 days, so rotation
  = new key + accept that failed rows from before the rotation cannot be inspected (documented; production track).
- `chat_id` stays in clear text for ordering and erasure; in private chats it equals the Telegram user id (personal
  data, covered by the retention and the erasure scope).

## Security

- SEC-030, SEC-REQ-036, SEC-REQ-037, SEC-REQ-038, SEC-REQ-039 (scope hook), SEC-REQ-034 (two new secrets ≥ 32 bytes,
  checked by KV-INF-004).
- Review by the `security-reviewer` agent before merge (phones, retention).

## Definition of done

Tests green (`make ci-backend`), SEC-REQ-037 acceptance recorded in the F-PRIVACY-004 and F-BOT-012 parity-gate rows,
`docs/infrastructure/telegram-webhook.md` "Stored data" section written, new env keys announced, PR reviewed by the
other developer and the `security-reviewer` agent.
