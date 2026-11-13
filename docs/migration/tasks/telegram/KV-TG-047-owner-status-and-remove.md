# KV-TG-047 — `/owner` when verified: status and removal with confirmation

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend — Telegram bot (track: development) |
| Complexity | S |
| Feature IDs | F-OWNER-001 |
| Dependencies | KV-TG-046; KV-TG-011 (actions `ow:rm`, `ow:rmy`, `ow:rmn`); owner-verification service of F-OWNER-002 (removal clears the badge); DEV-032 (`PROPOSED`) |

## Goal

A verified owner who sends `/owner` sees the status message with `🗑 Убрать номер`; removing the number now asks for a
confirmation (`🗑 Да, убрать` danger · `✖️ Отмена`, DEV-032) and only then deletes the verification and the badge.

## Legacy reference

- Steps: BOT-078 (already verified → TXT-BOT-079 with BTN-075), BOT-079 (removal without confirmation); `04` §3.15.
- Button: BTN-075 (`🗑 Убрать номер`, callback, silent).
- Texts: TXT-BOT-079 (`✅ Ваш номер подтверждён` + paragraph of TXT-BOT-078), TXT-BOT-080 (`Номер убран, метка «номер
  подтверждён» снята. Подтвердить снова — /owner.`), source `$KVADRO_ROOT/docs/telegram-bot.md:833-834`.
- Rule BR-BOT-084 (no confirmation, badge removed); decision LB-BOT-023 → DEV-032.

## Implementation

1. Tests first (`php artisan make:test --pest Bot/OwnerStatusTest`).
2. `OwnerCommand` (KV-TG-046) for a verified user sends TXT-BOT-079 with one inline button `🗑 Убрать номер`
   (`k1:ow:rm`).
3. `php artisan make:class Telegram/Handlers/OwnerRemoveCallback`:
   - `ow:rm` → edit the message to the confirmation `bot.owner.remove_confirm` (new text, DEV-032) with
     `🗑 Да, убрать` (style `danger`, BR-BOT-004 pattern) · `✖️ Отмена`; answer silently;
   - `ow:rmy` → owner-verification service `remove($user)` (deletes the `owner_verifications` row incl. any legacy hash,
     clears «Хозяин · номер подтверждён» on the user's listings); edit the message to TXT-BOT-080 without buttons;
   - `ow:rmn` → back to TXT-BOT-079 with `🗑 Убрать номер`.
4. Without DEV-032 approval, `ow:rm` removes at once (legacy behaviour) — one config switch, the test suite runs both
   variants until the decision.
5. Pressing any of the buttons after the verification is already gone (second device, erased data) → edit to
   TXT-BOT-080 without error (idempotent).

## Files

- `backend/app/Telegram/Handlers/OwnerRemoveCallback.php` (new), `backend/app/Telegram/Handlers/OwnerCommand.php`
  (changed)
- `backend/lang/{ru,uz,en}/bot.php` (`owner.status`, `owner.remove_confirm`, `owner.removed`)
- `backend/tests/Feature/Bot/OwnerStatusTest.php` (new); transcript `owner-remove.json` (new)

## API contract

Bot API: `sendMessage`, `editMessageText` with an inline keyboard, `answerCallbackQuery` without text (silent, `04`
§4.3). No HTTP endpoint.

## Business rules

- Kept: BR-BOT-084 (removal deletes the hash and the badge), BR-BOT-081 (only a hash and date were stored).
- Deviation: DEV-032 (`PROPOSED`) — confirmation before removal.

## Acceptance criteria

- With DEV-032 approved, nothing is deleted before `🗑 Да, убрать`.
- After removal no `owner_verifications` row exists for the user and the Mini App's listing badge for the user's
  listings is gone on the next read.
- `/owner` after removal starts the verification flow of KV-TG-046 again.

## Tests

| # | Conversation | Expected |
| - | ------------ | -------- |
| 1 | verified user, `send('/owner')` | TXT-BOT-079 with `🗑 Убрать номер` |
| 2 | `press('🗑 Убрать номер')` | same message edited to the confirmation; `🗑 Да, убрать` has `style: danger` |
| 3 | `press('✖️ Отмена')` | back to TXT-BOT-079; row still present |
| 4 | `press('🗑 Убрать номер')` → `press('🗑 Да, убрать')` | TXT-BOT-080, no buttons; row deleted |
| 5 | press `🗑 Да, убрать` again on the same message (stale keyboard copy) | TXT-BOT-080 again, no error |
| 6 | forged `k1:ow:rmy` from user B who is not verified | TXT-BOT-080 shown to B; A's row untouched (SEC-REQ-011) |
| 7 | DEV-032 switch off | #2 deletes at once and shows TXT-BOT-080 (legacy parity) |

## Edge cases

- The verification removed from ARM or by erasure while the confirmation is open → #5 behaviour.
- A legacy `/owner` status message with the old `🗑 Убрать номер` button (sent before the cut-over) reaches the stale
  catch-all of KV-TG-011 (DEV-032 compatibility note) and changes nothing.

## Security

- SEC-REQ-011: the action acts only on the sender's own verification; the callback carries no ids.
- SEC-REQ-045: removing the verification removes «Хозяин ✓» everywhere at once.
- No phone data is read or shown.

## Definition of done

Tests green (`make ci-backend`), transcript green, parity-gate cells of F-OWNER-001 updated with the DEV-032 decision,
`09` row F-OWNER-001 updated, PR reviewed by the other developer.
