# KV-TG-011 — Versioned `callback_data` codec and the «Форма устарела» catch-all

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend — Telegram bot (track: development) |
| Complexity | M |
| Feature IDs | F-BOT-013 |
| Dependencies | KV-TG-006 (router), KV-TG-008 (TXT-BOT-039 text), KV-TG-010 (replies, keyboard length check); public numbers of CF-003 (listings, radars); Q-BOT-017 (legacy grammar — decoded later by KV-TG-058) |

## Goal

Every inline button the new bot sends carries `callback_data` in one versioned, strictly parsed grammar of at most 64
bytes. Everything the codec cannot decode — legacy buttons from before the cut-over, forged or truncated data, unknown
actions, objects that do not belong to the presser — gets the legacy alert «Форма устарела — начните заново: /new», loses
its keyboard where that makes sense, and changes nothing.

## Legacy reference

- Outdated buttons: BOT-023, BR-BOT-009, TXT-BOT-039 (`tb:172–173`, `tb:179–180`), state machine `04` §3.17.
- Old card copies keep working against the server state: BOT-024, BR-BOT-010 (`tb:180–181`, `tb:670–672`).
- Cut-over requirements: `04` §6.3 items 1, 2 and 9 (catch-all, card-specific fallback as a proposal, version prefix,
  64 bytes); legacy grammar unknown (Q-BOT-017, Q-DATA-041); ENT-012, ENT-059.
- Migration policy (`README.md`): old bot buttons must keep working or answer "form outdated"; F-BOT-013 in `09` §3.21.

## Implementation

1. Read `16` §4.2 (SEC-REQ-011) and `.ai/agents/telegram-bot-engineer.md` rule 7. Tests first
   (`php artisan make:test --pest --unit Telegram/CallbackCodecTest`, `Bot/StaleCallbackTest`).
2. Grammar `k1:<action>[:<arg>]{0,4}`; action `[a-z]{2,4}`; each arg `[A-Za-z0-9_-]{1,20}`; total ≤ 64 bytes; numbers
   (listing `number`, radar `number`, dictionary ids) in base36. Regex check before any split.
3. `php artisan make:class Telegram/Callbacks/CallbackPayload` (action + args) and `Telegram/Callbacks/CallbackCodec`
   (`encode()`, `decode(): ?CallbackPayload`, base36 helpers). Action codes registered by handlers (see the registry in
   `docs/infrastructure/telegram-webhook.md`): `lg`, `nw`, `wz`, `ln`, `cd`, `sb`, `fp`, `st`, `ow`, `pv`, `tp`; a test
   fails when two handlers claim one code.
4. `php artisan make:class Telegram/Handlers/StaleCallbackHandler`: `Alert(TXT-BOT-039)` + `EditKeyboard(null)` on the
   pressed message (removal failures ignored). Used for: decode failure, unknown action, a `k2:` or later version, a
   wizard `sid` that is not the current one (KV-TG-012), an object not found through the actor's relations.
5. Handlers never trust ids from callbacks: radars via `$user->radars()->where('number', …)`, cards via the public listing
   number resolver; "not found" and "not yours" look the same (SEC-REQ-014).
6. Card callbacks carry the intended target state (`fv:1` / `fv:0`), so pressing an old copy applies that state and
   re-renders the pressed copy from the server (BR-BOT-010, fix of LB-BOT-007 in KV-TG-024).
7. Legacy decoding hook: `LegacyCallbackDecoder` interface with a null implementation; KV-TG-058 provides the real one
   once Q-BOT-017 is answered. The router tries it before the stale handler.
8. The card-specific fallback for undecodable legacy card buttons (`04` §6.3 item 2, an alert pointing to the Mini App)
   is a proposal without a DEV row; this task uses TXT-BOT-039 for all cases and notes the proposal for the developer.

## Files

- `backend/app/Telegram/Callbacks/{CallbackCodec,CallbackPayload,LegacyCallbackDecoder,NullLegacyCallbackDecoder}.php` (new)
- `backend/app/Telegram/Handlers/StaleCallbackHandler.php` (new)
- `backend/tests/Unit/Telegram/CallbackCodecTest.php`, `backend/tests/Feature/Bot/StaleCallbackTest.php` (new)
- `docs/infrastructure/telegram-webhook.md` (section "callback_data registry")

## API contract

`callback_data` grammar above; answer to an undecodable callback: `answerCallbackQuery {text: TXT-BOT-039, show_alert:
true}` then `editMessageReplyMarkup {reply_markup: {}}` on the pressed message.

## Business rules

- Kept: BR-BOT-009 (alert + keyboard removed for outdated forms), BR-BOT-010 (old card copies act on current state).
- Applied fix without a DEV: version prefix and ≤ 64 bytes (`04` §6.3 item 9); legacy buttons reach the catch-all
  (`09` §4 note on LB-BOT fixes).

## Acceptance criteria

- Every payload produced by any registered handler round-trips through `decode(encode())` and is ≤ 64 bytes (property
  test over all actions with maximal args).
- Malformed, 65-byte, unknown-action, future-version and foreign-object callbacks produce the alert and no database
  write (`DB::listen` asserts no `insert`/`update`/`delete`).
- A legacy-looking payload goes to the decoder first and, with the null decoder, to the alert.

## Tests

| # | Conversation / input | Expected |
| - | -------------------- | -------- |
| 1 | `conversation(user: 'A')->pressData('garbage')` on a card message | alert `Форма устарела — начните заново: /new`, keyboard removed, no write |
| 2 | 65-byte `callback_data` | same as 1 |
| 3 | `k1:zz:1` (unknown action) | same as 1 |
| 4 | `k2:sb:a1:ps` (future version) | same as 1 |
| 5 | user A presses `k1:sb:<B's radar>:ps` (forged) | same as 1; B's radar unchanged |
| 6 | user A presses `k1:cd:<listing>:fv:1` on an old copy | favourite set, only that copy re-rendered (BOT-024) |
| 7 | callback whose message was deleted | alert shown, keyboard removal error ignored |
| 8 | `answerCallbackQuery` fails with `QueryTooOld` (queue lag) | no retry loop, row `done` |

## Edge cases

- Callback answers must arrive within Telegram's window; under queue lag the alert can be lost — the keyboard edit still
  happens.
- A `callback_query` without `message` (inline mode) cannot occur: inline mode is off (BOT-008); ignored.
- The same stale button pressed many times: each press answered; rate limits of KV-TG-006 apply.

## Security

- SEC-REQ-011 (strict grammar, opaque ids, catch-all with no state change), SEC-REQ-014 (targets through the actor's
  relations), SEC-REQ-015 (idempotent target-state callbacks).
- KV-QA-016 holds the full forged-callback suite.

## Definition of done

Tests green (`make ci-backend`), the registry documented, F-BOT-013 parity-gate row updated (G7 negative cases), PR
reviewed by the other developer and the `security-reviewer` agent.
