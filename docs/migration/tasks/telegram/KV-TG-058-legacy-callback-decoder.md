# KV-TG-058 — Legacy `callback_data` decoder for old cards and keyboards

| Field | Value |
| ----- | ----- |
| Status | BLOCKED (Q-BOT-017: the legacy `callback_data` grammar is unknown; needs the legacy handler source or a read-only `reply_markup` dump of a test chat, product owner) |
| Owner | Backend — Telegram bot (track: development) |
| Complexity | M |
| Feature IDs | F-BOT-013 |
| Dependencies | KV-TG-011 (codec and catch-all; the decoder plugs in before the catch-all), KV-TG-024 (card actions), KV-TG-022 (card renderer), KV-TG-027 / KV-TG-037 (open card by number); preserved listing and radar numbers (CF-003, KV-DB-004) and `legacy_id_map` (KV-DB-013, `14` §8); Q-BOT-017, Q-DATA-041 |

## Goal

Buttons on messages sent by the legacy bot keep working after the cut-over where it is safe: the long-lived listing
cards (favourite, rented, realtor, hide, map, photos) and the number buttons of starter lists and `/fav` act on the
current server state and upgrade the pressed message to a HOMI card with versioned callbacks. Every other legacy
button (wizards, `/subs` panels, settings, owner, privacy, polls) keeps answering «Форма устарела — начните заново:
/new» without any state change.

## Legacy reference

- Compatibility requirements `04` §6.3 items 1, 2 and 9; old card copies keep working against the server state
  (BOT-024, BR-BOT-010); outdated wizard buttons (BOT-023, BR-BOT-009, TXT-BOT-039); state machine `04` §3.17.
- Long-lived card buttons: BTN-035 … BTN-048 (card rows, `04` §3.10), BTN-031 (starter list numbers — "keep working
  after the radar is deleted"), BTN-066 (`/fav` list). Defect LB-BOT-007 (stale favourite toggle).
- Entity ENT-059 (every sent message keeps its `callback_data`), ENT-012 (conversation state, not migrated).
- Open: Q-BOT-017 (grammar, which ids it embeds), Q-DATA-041. Test case `15` §3.3 #9 (pre-cut-over callback after the
  ledger was pruned), security test plan `16` §5.3 ("every known legacy prefix").

## Implementation

1. Unblock: the product owner provides the grammar (legacy source) or the bot owner dumps `reply_markup` of a test chat
   with a read-only MTProto user client (`04` Q-BOT-017 check); the result is recorded as a fixture
   `backend/tests/Fixtures/Bot/legacy-callbacks.json` (synthetic ids only) and recorded as the answer to Q-BOT-017.
2. Tests first (`php artisan make:test --pest Bot/LegacyCallbackDecoderTest`), one case per legacy prefix.
3. `php artisan make:class Telegram/Callbacks/LegacyCallbackDecoder` implementing the codec's fallback interface:
   strict regex per legacy action; output a `CallbackPayload` in HOMI terms or `null` (→ catch-all). Mapping:
   - card actions (favourite, rented, rented-undo, realtor, hide submenu, map, photos) → `cd:<number>:<op>`; listing ids
     resolve through the preserved `number` and the alias table (merged listings) — never trusted beyond that;
   - legacy toggles without an intended state: the decoder reads the label of the pressed button from
     `callback_query.message.reply_markup` (`⭐ В избранное` = set, `★ В избранном` = unset; `Уже сдано` / `↩️ Не сдано`)
     so the action is idempotent (LB-BOT-007 fixed for old copies too);
   - number buttons of starter lists and `/fav` → `ln:<number>`;
   - wizard, `/subs`, radar card, edit, settings, owner, privacy, poll and tip callbacks → `null` (catch-all alert and
     keyboard removal, `04` §6.3 item 2; DEV-030, DEV-032, DEV-033, DEV-035 compatibility notes).
4. After a decoded card action the handler answers with the HOMI toast and re-renders the pressed message as a HOMI card
   (KV-TG-022) — new keyboard with `k1:` callbacks, same `message_id` — and logs it in `bot_listing_messages`
   (`origin='legacy_upgrade'`) so later takedown edits reach it.
5. Metric `legacy_callbacks_total{kind=decoded|catch_all}` (KV-INF-011) to decide when the decoder can be removed (S5).

## Files

- `backend/app/Telegram/Callbacks/LegacyCallbackDecoder.php` (new), `backend/app/Telegram/Callbacks/CallbackCodec.php`
  (fallback hook)
- `backend/tests/Fixtures/Bot/legacy-callbacks.json` (new, synthetic), `backend/tests/Feature/Bot/LegacyCallbackDecoderTest.php` (new)

## API contract

Inbound `callback_query.data` in the legacy grammar (≤ 64 bytes, unknown until Q-BOT-017). Outbound:
`answerCallbackQuery` (toast or `show_alert` TXT-BOT-039), `editMessageReplyMarkup` / `editMessageText` /
`editMessageCaption` for the upgraded card.

## Business rules

- Kept: BR-BOT-009, BR-BOT-010, BR-BOT-060 (favourite), BR-BOT-062 (rented), BR-BOT-048 (number buttons work after the
  radar is deleted), BR-BOT-072.
- Applied via the card handlers: DEV-010 (realtor vote semantics), DEV-034 (hide scope) — both `PROPOSED`.
- Defect fix LB-BOT-007 (`APPROVED` by policy) extended to legacy copies.

## Acceptance criteria

- Every legacy prefix in the fixture is either decoded to a HOMI payload or answered by the catch-all with no state
  change; no legacy callback raises an exception.
- A decoded favourite press on an old copy sets or unsets according to the pressed label, never toggles blindly.
- A legacy callback that names another user's radar or an unknown listing changes nothing.
- The upgraded message carries only `k1:` callbacks.

## Tests

| # | Conversation (legacy message fixture in the chat, KV-QA-009 DSL) | Expected |
| - | ---------------------------------------------------------------- | -------- |
| 1 | press legacy `⭐ В избранное` on an old card of listing 51358 (synthetic) | favourite set; toast TXT-BOT-048; message re-rendered with `★ В избранном` and `k1:` callbacks |
| 2 | press legacy `★ В избранном` on a stale copy while the listing is not a favourite | stays unset; toast TXT-BOT-049; no add (LB-BOT-007) |
| 3 | legacy `Уже сдано` | rented vote recorded, card in rented state |
| 4 | legacy starter-list number `3` after the radar was deleted | card of that listing as a new message |
| 5 | legacy wizard button | alert TXT-BOT-039, keyboard removed |
| 6 | legacy `/subs` radar-card button | alert TXT-BOT-039, keyboard removed, radar unchanged |
| 7 | legacy card button of a merged listing | acts on the survivor |
| 8 | legacy card button of a listing withdrawn | toast `bot.card.withdrawn_toast`, keyboard removed (KV-TG-054) |
| 9 | malformed bytes / 65 bytes / legacy prefix with another user's radar id | alert, no state change (SEC-REQ-011) |
| 10 | same legacy callback re-delivered after the update ledger was pruned (`15` §3.3 #9) | idempotent result, no second effect |

## Edge cases

- If Q-BOT-017 shows that legacy callbacks embed only server-side keys (for example a session token) that were not
  migrated, every legacy callback goes to the catch-all and this task is closed as `DROPPED` with that reason; the card
  alert stays TXT-BOT-039.
- Legacy `web_app` and `url` buttons never reach the bot (they open the old URLs, kept working by CF-008 option A).
- Legacy reply keyboards (`/owner`) are handled by KV-TG-046, not here.

## Security

- SEC-REQ-011 (untrusted input, strict grammar, actor-relative resolution), SEC-REQ-014, SEC-REQ-015 (idempotent
  writes). No legacy secret or session data is imported.

## Definition of done

Tests green (`make ci-backend`), legacy-prefix cases of KV-QA-016 green, parity-gate cells of F-BOT-013 updated (Q-BOT-017
closed), `09` row updated, PR reviewed by the other developer and the `security-reviewer` agent.
