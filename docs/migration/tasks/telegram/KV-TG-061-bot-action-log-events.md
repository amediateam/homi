# KV-TG-061 — Bot action log events

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend — Telegram bot (track: development) |
| Complexity | S |
| Feature IDs | F-ANALYTICS-003 |
| Dependencies | KV-TG-006 (router and `BotContext`); the action-log store and event ingest of F-ANALYTICS-003 (backend analytics task, `user_action_log` partitions, whitelist of event names and property keys); retention purge KV-DB-028 (`14` §8) |

## Goal

Every bot interaction leaves one action-log entry — what was pressed or sent and when, never a text — under the internal
user id, through the same ingest the Mini App's `/api/events` uses, queued and never on the reply path. This keeps the
legacy `/privacy` promise ("what was pressed and when, without texts, 180 days") and gives the product the bot funnel.

## Legacy reference

- Promise: BR-BOT-085 (stored per user: … cards received, arrival source and an action log), BR-BOT-086 (action log 180
  days, without texts), BR-API-125, BR-DATA-004; entity ENT-021; text TXT-BOT-083 (`$KVADRO_ROOT/docs/telegram-bot.md:852`).
- Decision LB-DATA-015 (`app_error` carries free text in legacy — fixed by whitelisting props).
- Analytics identity BR-API-126, BR-BOT-090 (PostHog under a random id, never the Telegram id).
- HOMI agent rule 15 (`.ai/agents/telegram-bot-engineer.md`: `bot_started`, `command_received`, `callback_pressed`,
  `radar_created/removed`, `alert_sent/blocked`, `language_switched`; queued, never awaited).

## Implementation

1. Read the backend analytics task of F-ANALYTICS-003 in `docs/migration/tasks/backend/` for the ingest interface and the
   whitelist. Tests first (`php artisan make:test --pest Bot/ActionLogEventsTest`).
2. `php artisan make:class Telegram/Analytics/BotEvents` with typed methods that dispatch the ingest job (queue
   `default`, `afterCommit`), each with a UUIDv7 event id (`Str::uuid7()`), internal user id, event name and whitelisted
   props only:

   | # | Event | Emitted by | Props (whitelist) |
   | - | ----- | ---------- | ----------------- |
   | 1 | `bot_started` | KV-TG-014, KV-TG-015 | `source`, `tag`, `has_visit`, `has_listing` (no raw payload) |
   | 2 | `command_received` | router (KV-TG-006) | `command` (known commands only; unknown → `unknown`) |
   | 3 | `callback_pressed` | codec (KV-TG-011) | `action` code, `outcome` (`ok`, `stale`, `legacy`) — no ids |
   | 4 | `radar_created`, `radar_updated`, `radar_deleted`, `radar_paused`, `radar_resumed` | KV-TG-036, KV-TG-042…044 | `deal`, `mode`, `source` (`wizard`, `free_text`, `voice`) |
   | 5 | `card_opened` | KV-TG-022 | `origin` (`instant`, `digest`, `starter`, `fav`, `number`, `deeplink`), listing `number` |
   | 6 | `card_action` | KV-TG-024…026 | `op` (`fav_on`, `fav_off`, `rented`, `rented_undo`, `agent`, `hide_channel`, `hide_district`) |
   | 7 | `alert_sent`, `alert_blocked` | KV-TG-051, KV-TG-053 | `kind` (`instant`, `digest`) |
   | 8 | `language_switched` | KV-TG-017 | `from`, `to` |
   | 9 | `owner_verified`, `owner_removed` | KV-TG-046, KV-TG-047 | `outcome` (no phone, no hash) |
   | 10 | `found_answered` | KV-TG-040 | `answer`, `where`, `trigger` |
   | 11 | `free_text_parsed` | KV-TG-038, KV-TG-039 | `understood` bool, `kind` (`text`, `voice`) — never the text |

3. No event is written for an erased user (KV-TG-049); the queued job re-checks that the user exists. Updates handled
   during the ordered drain after a pause (KV-TG-060) emit normally, stamped with the update's original receive time
   from the ledger.
4. A Pest architecture test: `App\Telegram\Analytics\BotEvents` is the only place under `app/Telegram` that dispatches
   analytics; props are validated against the whitelist before dispatch (unknown keys dropped, LB-DATA-015).
5. PostHog: the bot does not call PostHog directly; if the analytics task forwards action-log events to PostHog under the
   random distinct id (BR-API-126), bot events follow automatically.

## Files

- `backend/app/Telegram/Analytics/BotEvents.php` (new)
- calls added in the handlers listed in the table (one line each)
- `backend/tests/Feature/Bot/ActionLogEventsTest.php`, `backend/tests/Arch/BotAnalyticsTest.php` (new)

## API contract

Internal only: the ingest of F-ANALYTICS-003 (`EventIngest::record(User $user, string $name, array $props,
CarbonImmutable $at, string $eventId)`, name agreed with the backend task). No Bot API call.

## Business rules

- Kept: BR-BOT-085, BR-BOT-086, BR-API-125, BR-API-126, BR-DATA-004, BR-BOT-090.
- Defect fix LB-DATA-015 (`APPROVED` by policy): no free-text props.

## Acceptance criteria

- Each listed interaction writes exactly one action-log row with the whitelisted props and no text, phone, name,
  username or Telegram id (DB-wide search in the test).
- Event dispatch never delays the reply (the reply is sent before the queued job runs; queue `sync` test uses
  `Queue::fake()` to assert the push only).
- Rows older than 180 days disappear with the partition purge (KV-DB-028, time-travel test there).

## Tests

| # | Conversation | Expected action-log rows |
| - | ------------ | ------------------------ |
| 1 | `send('/start s_web_insta--v0123456789')` | `bot_started {source: web, tag: insta, has_visit: true, has_listing: false}`, `command_received {command: start}` |
| 2 | `send('/foo')` | `command_received {command: unknown}` |
| 3 | wizard to save (`/new` … `✅ Сохранить`) | `callback_pressed` per press with `action: wz`, one `radar_created {deal: rent_long, source: wizard}` |
| 4 | free text `двушка в Юнусабаде до 600$` | `free_text_parsed {understood: true, kind: text}`; no column contains the text |
| 5 | press a stale wizard button | `callback_pressed {action: wz, outcome: stale}` |
| 6 | instant card delivered; `403` on the next one | `alert_sent {kind: instant}`, `alert_blocked {kind: instant}` |
| 7 | `/owner` share own contact | `owner_verified {outcome: verified_no_listings}`; no phone or hash in props |
| 8 | handler passes an unknown prop key | key dropped before dispatch |
| 9 | user erased, then a queued event job runs | no row written |

## Edge cases

- Bursts (digest fan-out): `alert_sent` events are batched per job, one insert per chunk.
- Ingest down: events retry on the queue; the bot reply is unaffected.
- Migrated legacy action log: not migrated (ENT-021 "drop (proposed)"); the HOMI log starts at the cut-over.

## Security

- SEC-REQ-036 (internal id only), SEC-REQ-047 (no texts or ids in logs), SEC-REQ-022 (whitelisted event names and
  keys), SEC-REQ-039 (erasure deletes the user's action log; no events after erasure).

## Definition of done

Tests green (`make ci-backend`), the privacy promise rows 2 and 6 of KV-TG-048 turned from `todo` to passing,
parity-gate cells of F-ANALYTICS-003 (bot part) updated, `09` row updated, PR reviewed by the other developer.
