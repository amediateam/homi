# KV-TG-054 — «Объявление снято» edits of delivered cards

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend — Telegram bot (track: development) |
| Complexity | M |
| Feature IDs | F-DELIVERY-006 |
| Dependencies | KV-TG-051 and KV-TG-053 (delivered-card log rows with `chat_id` + `message_id`), KV-TG-050 (pacer), KV-TG-022 (card renderer), KV-TG-013 (placeholder image); `ListingWithdrawn` of the listings module (F-PIPELINE-006) incl. takedowns of F-ADMIN-002; backend radar lifecycle listeners of F-DELIVERY-006 (`DeliveredMessages::forListing`, pending items dropped) and merge re-pointing of the delivered set (F-DELIVERY-005); migrated log KV-DB-019 (`14` §8); Q-BOT-031 |

## Goal

When a listing is withdrawn (rented, sold, deleted at the source) or taken down at the author's request, every card the
bot ever sent for it — radar pushes, starter lists, digests rows, cards opened by number, from `/fav` or by deep link,
including cards migrated from legacy — is edited to «Объявление снято», its buttons removed and, on a takedown, its
personal data (phone, original text, photos) taken out of the message.

## Legacy reference

- Behaviour promised in `/privacy` and never observed: BOT-062, TXT-BOT-047 (exact text unknown),
  `$KVADRO_ROOT/docs/telegram-bot.md:862`, `:867-869`; outbound table `04` §5 row BOT-062.
- Rules: BR-BOT-092 (takedown → cards edited), BR-API-066 (withdrawn → cards edited), BR-API-068 (author request:
  removed everywhere incl. alerts), BR-DATA-016 (every sent card addressable by `(chat_id, message_id)`); entity ENT-010.
- Requirement SEC-REQ-040 (takedowns reach alerts and delivered cards within an SLA, Q-SEC-007); event table `10` §4.12
  (`ListingWithdrawn` → Delivery `EditCardWithdrawn`; `ListingsMerged` → Delivery re-points the delivered log).
- Open: Q-BOT-031 (text, buttons, triggers), Q-DATA-013.

## Implementation

1. Read `10` §4.12, `16` §4.9 (SEC-REQ-040) and the listings task that raises `ListingWithdrawn`. Tests first
   (`php artisan make:test --pest Delivery/WithdrawnCardEditTest`).
2. `php artisan make:listener Delivery/FanOutWithdrawnEdits --event=…ListingWithdrawn` (queued on `notifications`):
   iterate the backend's `DeliveredMessages::forListing($listing)` (rows with `state='sent'` for the listing and its
   aliases) in chunks of 500 and dispatch one `EditCardWithdrawn` per message (paced, KV-TG-050). Event payload carries
   `cause` (`rented`, `sold`, `deleted`, `takedown`). Dropping the listing's pending deliveries is the backend
   listener's job, not this task's.
3. `php artisan make:job Delivery/EditCardWithdrawn`:
   - card messages (`origin` ≠ `digest`): photo card → `editMessageCaption`, text card → `editMessageText`; new body =
     the card title line + `bot.card.withdrawn` (the text for TXT-BOT-047, spec «🚫 Объявление снято», approved with
     the product owner); `reply_markup` empty (no stale actions);
   - on `takedown` the edit also drops the media: photo cards are edited with `editMessageMedia` to a neutral
     placeholder image from the asset registry (KV-TG-013) or, if that fails, deleted when Telegram allows it; the
     original post text and phone never remain in the message;
   - digest messages (`origin='digest'`): re-render the digest from its logged rows with the withdrawn row replaced by
     `<n>. bot.digest.row_withdrawn` and its number button removed (one edit per digest message, coalesced when
     several rows of one digest are withdrawn within a minute);
   - outcome → `state='edited_withdrawn'` + `edited_at` (state name of the backend listener task, so a replay edits
     once); `400 message is not modified` → same; `400 message can't be edited` / `message to edit not found` →
     `state='edit_failed'`, counted, no retry; `403` → `ChatUnreachable`.
4. Merged listings: the delivered set re-points `bot_listing_messages` of merged ids to the survivor inside the merge
   transaction (backend, F-DELIVERY-005); `DeliveredMessages::forListing` also follows aliases, so this task needs no
   merge listener.
5. Idempotency: a second `ListingWithdrawn` for the same listing finds no `sent` rows and does nothing. A listing that
   becomes active again does not revert edited cards (proposal; Q-BOT-031).
6. Card buttons pressed on a copy whose edit failed resolve the listing through the server state: an inactive listing
   answers `bot.card.withdrawn_toast` and removes the keyboard (in the card callback handler of KV-TG-024).

## Files

- `backend/app/Listeners/Delivery/FanOutWithdrawnEdits.php`, `backend/app/Jobs/Delivery/EditCardWithdrawn.php`,
  `backend/app/Services/Delivery/CardEditor.php` (new)
- `backend/lang/{ru,uz,en}/bot.php` (`card.withdrawn`, `card.withdrawn_toast`, `digest.row_withdrawn`)
- `backend/tests/Feature/Delivery/WithdrawnCardEditTest.php` (new), spec transcript `card-withdrawn.json`

## API contract

Bot API: `editMessageCaption`, `editMessageText`, `editMessageMedia`, `editMessageReplyMarkup`, `deleteMessage` (only
for takedowns when the media edit fails). No HTTP endpoint.

## Business rules

- Kept: BR-BOT-092, BR-API-066, BR-API-068, BR-DATA-016.
- Spec-tested (Q-BOT-031): text, removed buttons, digest-row handling, no revert on reactivation.
- No DEV.

## Acceptance criteria

- After `ListingWithdrawn`, every `sent` log row of the listing ends `edited_withdrawn`, `edit_failed` or
  `unreachable`; none stays `sent`.
- After a takedown, no edited message contains the phone, the original text or the original photo (fake Bot API
  payload inspection).
- Edits are paced (KV-TG-050) and the whole fan-out for 1 000 messages finishes within the takedown SLA (Q-SEC-007,
  starting value 1 hour, PROPOSED).
- Merged listings: a withdrawal of the survivor edits cards sent under the alias too.

## Tests

| # | Case (`FakeBotApi`, queues `sync`) | Expected |
| - | ---------------------------------- | -------- |
| 1 | listing L sent to A (photo card) and B (text card), `ListingWithdrawn(L, rented)` | `editMessageCaption` for A, `editMessageText` for B, both with `bot.card.withdrawn` and empty keyboard |
| 2 | same event again | no Bot API call |
| 3 | L listed as row 2 of A's digest | one `editMessageText` of the digest: row 2 replaced, button `2` removed |
| 4 | L and M of one digest withdrawn within a minute | one coalesced digest edit |
| 5 | `ListingWithdrawn(L, takedown)` on a photo card | `editMessageMedia` to the placeholder; caption without phone or post text |
| 6 | fake answers `400 message can't be edited` | row `edit_failed`, counted, no retry |
| 7 | fake answers `403` | `ChatUnreachable`, row `unreachable` |
| 8 | L merged into S (rows re-pointed by the backend), cards for L logged, then `ListingWithdrawn(S)` | L's cards edited too |
| 9 | 1 000 log rows | paced edits, all rows final; no second edit per message |
| 10 | migrated legacy log row (KV-DB-019) for L | edited like a HOMI-sent card |

## Edge cases

- Very old messages: Telegram's edit-time limits for bot messages are to be verified in rehearsal R2 (`18` §13
  "bot deletion limits"); failures are recorded, never retried in a loop.
- The user deleted the message in their client: `message to edit not found` → `edit_failed`.
- Cards sent by the legacy bot but missing from the migrated log cannot be reached; the count of legacy log rows vs
  legacy sends is a data-validation item (KV-DB-019).
- A withdrawal during a cut-over freeze: edits wait behind the send cap (KV-TG-060).

## Security

- SEC-REQ-040 (author rights, takedown reach), SEC-REQ-025 (photos erasable), SEC-REQ-029 (pacing), SEC-REQ-047 (no
  listing text or phone in logs).

## Definition of done

Tests green (`make ci-backend`), spec transcript green, takedown E2E case of KV-QA-017 / KV-QA-016 covers the bot
edits, parity-gate cells of F-DELIVERY-006 updated (Q-BOT-031 answered by specification, texts approved), `09` row
updated, PR reviewed by the other developer and the `security-reviewer` agent.
