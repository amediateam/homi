# KV-TG-046 — `/owner`: share the number and verify

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend — Telegram bot (track: development) |
| Complexity | M |
| Feature IDs | F-OWNER-001, F-OWNER-002, F-OWNER-004 |
| Dependencies | KV-TG-003 (contact phone replaced by keyed hashes before storage), KV-TG-006, KV-TG-012 (state kind `owner`), KV-TG-010; owner-verification service and badge matching of F-OWNER-002 (`owner_verifications` in KV-DB-010, listing author HMAC in KV-DB-008); DEV-011 (`PROPOSED`), DEC-29; Q-BOT-008, Q-BOT-037, Q-BOT-042 |

## Goal

An unverified user sends `/owner`, reads what the verification does, shares **their own** number with the reply
keyboard button, and gets the outcome: verified (with or without matching listings) or refused. Only a keyed HMAC of the
E.164 number and the date are stored (DEV-011); a foreign or forwarded contact is refused; an old `/owner` reply keyboard
left in a chat still works safely. Since the owner-cabinet plan the bot also takes the contact of the cabinet's phone
window and stores it with the draft (DEC-72), built by WP-88.

## Legacy reference

- Steps: BOT-018 (branch on verification state), BOT-075 (intro + reply keyboard), BOT-076 (`Отмена` arrives as text),
  BOT-077 (contact received); state machine `04` §3.15; compatibility `04` §6.3 item 4.
- Buttons: BTN-073 (`📱 Поделиться номером`, `request_contact`), BTN-074 (`Отмена`, reply text).
- Texts: TXT-BOT-076 (intro, `$KVADRO_ROOT/docs/telegram-bot.md:818-825`), TXT-BOT-077 (declined), TXT-BOT-078
  (verified, no listings), TXT-BOT-081 (listings found / refusals — never observed).
- Rules: BR-BOT-005 (the only reply keyboard), BR-BOT-081, BR-BOT-082 (≥ 3 flats or realtor number → no badge),
  BR-BOT-083 (badge within minutes), BR-API-107, BR-DATA-005.
- Defects and decisions: LB-BOT-029 (unkeyed hash reversible), LB-DATA-005, LB-API-044 → DEV-011; SEC-009 (contact
  ownership unknown).

## Implementation

1. Read `.ai/agents/telegram-bot-engineer.md` rule 11, `.ai/agents/security-reviewer.md`, `16` §4.2 (SEC-REQ-011) and
   §4.9 (SEC-REQ-036, SEC-REQ-037). Tests first (`php artisan make:test --pest Bot/OwnerVerifyTest`).
2. `php artisan make:class Telegram/Handlers/OwnerCommand`: verified users → KV-TG-047; otherwise send TXT-BOT-076
   with a reply keyboard `[📱 Поделиться номером (request_contact)] / [Отмена]`, `one_time_keyboard`,
   `resize_keyboard`; store conversation state kind `owner` (TTL from KV-TG-012).
3. `Telegram/Handlers/ContactMessage` (routed by KV-TG-006 for every `message.contact`, with or without state):
   - refuse unless the chat is private and `contact.user_id` is present and equals `from.id` (SEC-REQ-011); a refusal
     answers `bot.owner.not_own_contact` (new text, part of DEV-011 wording) and stores nothing;
   - read `phone_hmac` (and, during the transition window of DEV-011 / DEC-29, the legacy-scheme hash) from the redacted
     update produced by KV-TG-003 — the handler never sees the raw number;
   - call the owner-verification service (F-OWNER-002): upsert `owner_verifications (user_id, phone_hmac, verified_at)`
     and get the outcome: `verified_no_listings`, `verified_with_listings(n)`, `refused_many_flats`,
     `refused_realtor` (BR-BOT-082);
   - reply TXT-BOT-078 for the first outcome; the other outcomes use TXT-BOT-081 keys
     (`bot.owner.verified_with_listings`, `bot.owner.refused_many_flats`, `bot.owner.refused_realtor`), written here and
     approved by the product owner because the legacy texts were never captured (Q-BOT-008);
   - remove the reply keyboard in the same reply (`remove_keyboard`, proposal for Q-BOT-037) and clear the state.
4. `Отмена` as text while the state is `owner` → TXT-BOT-077, keyboard removed, state cleared (BOT-076). Any other text
   while the state is `owner` leaves the state and goes to normal handling (free text, KV-TG-038).
5. A contact arriving without an `owner` state (old legacy reply keyboard, `04` §6.3 item 4) follows step 3 unchanged.
6. Badge propagation (BR-BOT-083: the badge appears when a matching listing arrives) is the listings side of F-OWNER-002;
   this task only records the verification and reports the immediate outcome.
7. Wording of TXT-BOT-076 changes from «храним не сам номер, а его хэш» to the DEV-011 wording once approved (keyed
   hash); until then the legacy text stays.

## Files

- `backend/app/Telegram/Handlers/OwnerCommand.php`, `backend/app/Telegram/Handlers/ContactMessage.php` (new)
- `backend/lang/{ru,uz,en}/bot.php` (`owner.*` keys)
- `backend/tests/Feature/Bot/OwnerVerifyTest.php` (new), `backend/tests/Fixtures/Bot/transcripts/owner-verify.json` (new)

## API contract

Bot API: `sendMessage` with `ReplyKeyboardMarkup` (`request_contact: true`) and with `ReplyKeyboardRemove`. Inbound:
`message.contact {phone_number, user_id?}` — stored only in redacted form (KV-TG-003). The Mini App reads
`owner_verified` / badges through the legacy serializers (F-OWNER-002), unchanged.

## Business rules

- Kept: BR-BOT-005, BR-BOT-081, BR-BOT-082, BR-BOT-083, BR-API-107, BR-DATA-005.
- Deviation DEV-011 (`PROPOSED`, developer + security-reviewer + product owner for the wording): keyed HMAC; legacy
  hashes only for the DEC-29 window; re-verification campaign via KV-TG-055 / KV-DB-030 (`14` §8).
- Security-driven behaviour without DEV: a contact that is not the sender's own is refused (SEC-REQ-011, SEC-009).

## Acceptance criteria

- After a successful share the database holds `phone_hmac` and `verified_at` only; no table, payload, log or job
  contains the phone number (searched for the synthetic `+998000000001` in every column and in captured logs).
- Forwarded contacts, contacts without `user_id`, contacts of another user and contacts in a group are refused with
  nothing stored.
- `/owner` → `Отмена` restores the normal chat (reply keyboard removed).
- An old reply-keyboard contact without state verifies the sender when it is their own.

## Tests

| # | Conversation (KV-QA-009 DSL, KV-QA-003 `UpdateFactory::contact`) | Expected |
| - | ---------------------------------------------------------------- | -------- |
| 1 | `send('/owner')` (not verified) | TXT-BOT-076 with reply keyboard `📱 Поделиться номером` / `Отмена` |
| 2 | → `contact(userId: A, phone: '+998000000001')`, no listing with that HMAC | TXT-BOT-078; `remove_keyboard`; one `owner_verifications` row |
| 3 | → own contact whose HMAC matches 2 listings | `bot.owner.verified_with_listings` with `n=2` |
| 4 | → own contact matching listings of 3 different flats | `bot.owner.refused_many_flats`; no badge |
| 5 | → own contact marked as a realtor's | `bot.owner.refused_realtor` |
| 6 | → `forwardedContact()` (other `user_id`) | `bot.owner.not_own_contact`; nothing stored |
| 7 | → contact without `user_id` | refused as #6 |
| 8 | `send('/owner')` → text `Отмена` | TXT-BOT-077, keyboard removed, state cleared |
| 9 | own contact with no `owner` state (old keyboard) | handled as #2 |
| 10 | `send('/owner')` → text `двушка в Юнусабаде` | state cleared; free-text flow of KV-TG-038 |
| 11 | contact update replayed (same `update_id`) | one row, one reply (SEC-REQ-009) |
| 12 | after #2, `telegram_updates` row of the contact | contains no phone, name or text (SEC-REQ-037) |

## Edge cases

- Telegram sends `phone_number` with or without `+`; normalisation to E.164 happens in the KV-TG-003 redactor, so the
  same number always produces the same HMAC as listing authors (one pepper, `PHONE_HMAC_PEPPER`).
- Re-sharing an already verified number refreshes `verified_at`; sharing a different own number (SIM change) replaces
  the previous HMAC.
- A user who erased their data (KV-TG-049) and re-verifies starts from scratch.
- Q-BOT-042 unanswered: no legacy hash is computed; the transition window is empty and every migrated owner is asked to
  re-verify (DEC-29).

## Security

- SEC-REQ-011 (own contact, private chat), SEC-REQ-036 (HMAC with a per-environment pepper), SEC-REQ-037 (redaction
  before storage), SEC-REQ-045 (≤ 2-flat rule and contact check before «Хозяин ✓»), SEC-REQ-047 (no phones in logs).
- Review by the `security-reviewer` agent is mandatory (phones, consent, labels on people).

## Definition of done

Tests green (`make ci-backend`), transcript `owner-verify.json` green, parity-gate cells of F-OWNER-001 updated (DEV-011
and DEC-29 state recorded), `09` rows F-OWNER-001 and F-OWNER-002 updated, PR reviewed by the other developer and the
`security-reviewer` agent.
