# KV-TG-051 — Delivery outbox and instant radar pushes

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend — Telegram bot (track: development) |
| Complexity | M |
| Feature IDs | F-DELIVERY-002, F-DELIVERY-005 |
| Dependencies | KV-TG-050 (pacer), KV-TG-022 (`CardSender`, delivered-card log), KV-TG-021 (reachability); backend delivery services: the planner of F-DELIVERY-002…004 (`DeliveryPlanner`, `DuePendingItems`, event `DeliveryDue`) and the delivered set of F-DELIVERY-005 (`DeliveryLedger::claim` / `release`, `DeliveryEligibility`); radar matching F-DELIVERY-001; schema KV-DB-009 and migrated log KV-DB-019 (`14` §8); Q-BOT-002, Q-BOT-033, Q-API-031 |

## Goal

Pending deliveries of kind `instant` that the backend planner marks as due are sent as listing cards at once: each card
is claimed in the delivered set before it is sent, sent through the pacer, and logged with `chat_id` + `message_id`.
A retry, a duplicate `DeliveryDue`, a worker crash or a migrated delivered log never leads to the same listing reaching
the same user twice. Matching and planning (quiet window, digest slot, `release_at`) are the backend's; this task is the
Telegram send path.

## Legacy reference

- Outbound behaviour: BOT-081 (radar push, never observed), TXT-BOT-086 (= the card TXT-BOT-044, radar name unknown),
  reconstruction of the pipeline `04` §5 and the migration constraint "the delivered-card log must be migrated"
  (`$KVADRO_ROOT/docs/about.md:430`).
- Rules: BR-BOT-100 (instant = one card per listing at once), BR-BOT-101 (exclusions incl. already delivered),
  BR-BOT-007, BR-API-081, BR-API-082, BR-DATA-012, BR-DATA-016; entity ENT-010 (`06` §2), target tables `06` §4.2.
- Open: Q-BOT-002 (format, radar name, silent), Q-BOT-033 (triggers beyond "new"), Q-API-031 (dedup per user or per
  radar), Q-DATA-013.
- Architecture: `10` §4.9 "Delivery: an outbox pattern", §4.10 queue `notifications`; budget "zero re-sends of cards
  delivered before the switch" (`18` §5.4).

## Implementation

1. Read `.claude/skills/laravel-queues/`, `10` §4.9–§4.12 and the backend delivery tasks of F-DELIVERY-001…005 in
   `docs/migration/tasks/backend/` (planner, delivered set, matching). Tests first
   (`php artisan make:test --pest Delivery/InstantDeliveryTest`).
2. `php artisan make:listener Delivery/SendDueInstantItems --event=…DeliveryDue` (queued on `notifications`): loads the
   user's due items through `DuePendingItems::forUser($user, now)` and handles those of kind `instant`; `quiet_hold`
   and `digest` items are left to the release sweep of KV-TG-052. The sweep also calls this handler for instant items
   whose `DeliveryDue` was lost.
3. Per item, in this order:
   - `DeliveryEligibility::check($user, $listing, $radar)` — not eligible (listing inactive, hidden, author blocked,
     hide rule, access blocked, chat unreachable) → `markReleased` without sending, reason counted;
   - `DeliveryLedger::claim($user, $listing, $radar, CardOrigin::Instant)` — `false` (already delivered, also through
     the migrated log or under a merged alias) → `markReleased`, nothing sent;
   - `true` → dispatch `SendRadarCard` (`afterCommit`) and `markReleased` the item.
4. `php artisan make:job Delivery/SendRadarCard` (middleware `PaceTelegramSends`, KV-TG-050): re-check that the user
   still exists; `CardSender::send($user, $listing, origin: 'instant', radar: $radar)` (KV-TG-022) writes
   `bot_listing_messages`. A permanent failure before any message exists (`400` other than "not modified", `403`) calls
   `DeliveryLedger::release($user, $listing)` so a later match can deliver; `403` also raises `ChatUnreachable`
   (KV-TG-021). `429` / `5xx` are released by the pacer and retried; the claim stays.
5. Crash safety (zero re-sends): the claim is taken before the send and is never repeated, so a crash after Telegram
   accepted the card cannot cause a second card (at-most-once). `delivery:reconcile` (scheduled every 10 min) counts
   claims of origin `instant` older than 10 min without a `bot_listing_messages` row and reports the number (metric +
   log, no ids) for investigation; it never re-sends.
6. Card format: the BOT-059 card of KV-TG-022 unchanged (spec oracle); a radar title line only behind
   `delivery.show_radar_title` (default `false`) until Q-BOT-002 is answered. Notification sound on unless Q-BOT-002
   says otherwise.
7. DEC-20 (instant cap per radar per hour) is applied by the backend planner (overflow becomes a digest item); this task
   needs no switch for it.
8. Metrics: `delivery_lag_seconds` from the listing's publish time to the send, `telegram_send_total` via the pacer
   (KV-INF-011).

## Files

- `backend/app/Listeners/Delivery/SendDueInstantItems.php`, `backend/app/Jobs/Delivery/SendRadarCard.php` (new)
- `backend/app/Console/Commands/Delivery/ReconcileDeliveries.php` (new), `backend/routes/console.php` (schedule)
- `backend/tests/Feature/Delivery/InstantDeliveryTest.php`, `backend/tests/Feature/Delivery/DeliveryReconcileTest.php`
  (new)

## API contract

No HTTP endpoint. Bot API through `CardSender` (`sendPhoto` with caption or `sendMessage`). Internal (backend, names
from the backend delivery tasks): `DeliveryDue(user_id)`, `DuePendingItems::forUser()` / `markReleased()`,
`DeliveryEligibility::check(): ?string`, `DeliveryLedger::claim(): bool`, `DeliveryLedger::release()`.

## Business rules

- Kept: BR-BOT-100, BR-BOT-101, BR-BOT-007, BR-API-081, BR-API-082, BR-DATA-012, BR-DATA-016.
- Spec-tested where legacy is unknown (`15` §2.6 "oracle: spec"): card format of a push (Q-BOT-002), dedup scope per
  user (Q-API-031, decided in the delivered-set service).
- DEC-20 off at S2 (parity), applied in the planner if turned on.

## Acceptance criteria

- One due instant item → one card, one claim in `radar_deliveries`, one `bot_listing_messages` row with
  `origin='instant'`, the item released.
- The same listing due for two radars of one user, or the same `DeliveryDue` handled twice, sends one card.
- A listing in the user's migrated delivered log (KV-DB-019) is never sent again (the backend re-send dry run returns
  zero).
- No path sends a second card for a claim; a failed permanent send releases the claim.

## Tests

| # | Case (`FakeBotApi`, queues `sync`, `travelTo` Asia/Tashkent) | Expected |
| - | ------------------------------------------------------------ | -------- |
| 1 | due instant item for user A at 14:00 | one `sendPhoto` to A's chat with the card; claim present; log `origin=instant`; item released |
| 2 | `DeliveryDue(A)` dispatched twice | one send (second `claim` returns false) |
| 3 | two due items, same listing, two radars of A | one send |
| 4 | listing already in A's migrated delivered log | no send; item released |
| 5 | due items of kind `quiet_hold` and `digest` | not touched by this listener (KV-TG-052) |
| 6 | fake answers `403` | `ChatUnreachable` raised; claim released; no retry |
| 7 | fake answers `400 Bad Request: wrong file identifier` | claim released; item not retried |
| 8 | listing withdrawn between planning and sending | eligibility fails; nothing sent; item released |
| 9 | exception thrown after the fake accepted the send, before the log write | retry sends nothing (claim exists); reconcile reports 1 after 10 min |
| 10 | user erased before the job runs | job ends without sending |
| 11 | send cap 0 (KV-TG-060) | nothing sent; job stays queued; sent once after the cap is lifted |

## Edge cases

- Merged listings (F-PIPELINE-003): alias resolution happens inside `DeliveryLedger::claim`; a card for the survivor of
  an already delivered alias is not sent.
- Price change or repost (Q-BOT-033): a new delivery only if the backend planner creates a new item; the claim keeps it
  at one card per user × listing.
- A paused radar: the backend drops its pending items; an item that slips through fails eligibility.
- Very large fan-out (one listing × thousands of users): items are created by the planner in chunks; sends are paced.

## Security

- SEC-REQ-029 (pacing through KV-TG-050), SEC-REQ-020 (card escaping in KV-TG-022), SEC-REQ-047 (counts only in logs,
  no chat ids or texts), SEC-REQ-014 (targets come from planner rows, never from user input).

## Definition of done

Tests green (`make ci-backend`), KV-QA-009 spec transcript "instant card" green, the `18` §5.4 "zero re-sends" check
scripted for rehearsals, parity-gate cells of F-DELIVERY-002 and F-DELIVERY-005 updated, `09` rows updated, PR
reviewed by the other developer (new scheduled command announced for the production track).
