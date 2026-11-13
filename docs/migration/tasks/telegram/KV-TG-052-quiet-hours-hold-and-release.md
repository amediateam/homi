# KV-TG-052 — Quiet hours: hold and morning release

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend — Telegram bot (track: development) |
| Complexity | M |
| Feature IDs | F-DELIVERY-004 |
| Dependencies | KV-TG-051 (instant send path), KV-INF-007 (scheduler foundation); backend delivery planner of F-DELIVERY-002…004 (`QuietWindow`, `DeliveryPlanner` writing `radar_pending_items` of kind `quiet_hold` with `release_at` = window end, `DuePendingItems`, re-planning on `SettingsChanged`); Q-BOT-003, Q-DATA-014; related: the digest sender of KV-TG-053 plugs in behind the `DigestDispatcher` seam defined here |
## Goal

The release schedule of the Telegram side: one sweep every minute picks up every pending delivery the backend planner
marked as due and hands it to the right sender — instant items to KV-TG-051, items held during quiet hours as **one**
morning digest per user, digest items as one digest per user and slot (KV-TG-053). Nothing is sent inside a user's
quiet window, and a held item is released once.

## Legacy reference

- Outbound step BOT-083 (never observed), settings row `🌙 Тихие часы` (BTN-068, `04` §3.14), the panel text
  «В это время карточки не приходят; всё, что появилось за ночь, — одной подборкой утром» (TXT-BOT-074,
  `$KVADRO_ROOT/docs/telegram-bot.md:775`), Mini App wording quoted in BR-API-083.
- Rules: BR-BOT-077 (no cards in the window; one morning digest), BR-BOT-073 (presets), BR-API-083, BR-API-084,
  BR-API-150 (business time Asia/Tashkent), BR-DATA-014 (`off` or `HH-HH`), BR-DATA-016.
- Open: Q-BOT-003 (exact release time, edge cases), Q-DATA-014 (stored queue vs recomputation; ENT-011).
- Scheduler rows "Digest dispatch" and "Quiet-hours release" (`10` §4.11) — implemented here as one sweep.

## Implementation

1. Read `10` §4.11, ADR-0006 (UTC storage, Tashkent display), KV-QA-006 (time matrix and clock helpers) and the backend
   delivery planner task (kinds, `release_at`, `DuePendingItems`). Tests first
   (`php artisan make:test --pest Delivery/ReleaseSweepTest`).
2. `App\Services\Delivery\DigestDispatcher` — interface defined here: `dispatchFor(User $user, string $reason,
   Collection $items): void` with reasons `quiet_end` and `digest_slot`; the implementation is KV-TG-053, a test fake
   until then.
3. `php artisan make:job Delivery/ReleaseDueDeliveries`, scheduled every minute in `routes/console.php`
   (`->onOneServer()->withoutOverlapping()`), command alias `delivery:release-due` for manual runs:
   - iterate `DuePendingItems::dueUsers(now)` lazily, chunks of 500 users;
   - per user, load due items (`forUser`) and group them: `instant` → the KV-TG-051 handler (fallback for a lost
     `DeliveryDue`); `quiet_hold` → one group; `digest` → one group per `release_at` slot;
   - for each non-instant group: one transaction that marks the items released (`markReleased`) and, after commit,
     `DigestDispatcher::dispatchFor($user, 'quiet_end' | 'digest_slot', $items)`;
   - a `quiet_hold` group and a `digest` group due at the same minute for one user (digest slot inside the window,
     moved to the window end by the planner) are merged into one `quiet_end` dispatch (BR-BOT-077: one message).
4. Before dispatching, re-check `QuietWindow::contains(now)` for the user: if the user switched quiet hours on in the
   meantime and the window is active, skip the group — the backend re-planning moves `release_at`; nothing is sent
   inside a window.
5. Re-planning when quiet hours change is the backend's (`SettingsChanged` listener of the planner); this task only reads
   `release_at`.
6. Metrics (KV-INF-011): `delivery_release_batches_total{reason}`, `delivery_release_lag_seconds` (now − `release_at`).

## Files

- `backend/app/Services/Delivery/DigestDispatcher.php` (interface), `backend/app/Jobs/Delivery/ReleaseDueDeliveries.php`
  (new)
- `backend/routes/console.php` (schedule entry)
- `backend/tests/Feature/Delivery/ReleaseSweepTest.php` (new)

## API contract

No HTTP endpoint and no Bot API call of its own (instant cards: KV-TG-051; digests: KV-TG-053). Internal:
`DigestDispatcher::dispatchFor()`; backend `DuePendingItems::dueUsers()` / `forUser()` / `markReleased()`.

## Business rules

- Kept: BR-BOT-077, BR-BOT-073, BR-API-083, BR-API-084, BR-API-150, BR-DATA-014, BR-DATA-016.
- Spec-tested (legacy never observed, `15` §2.6): release within one minute after the window end; a single held item is
  still delivered as a digest of one (proposal; Q-BOT-003 may change it to a plain card).
- No DEV.

## Acceptance criteria

- No `sendMessage`/`sendPhoto` reaches a user while their quiet window is active (property test over the frozen clock
  with random matches).
- Every item held overnight appears in exactly one released group, released between the window end and +1 minute.
- Two concurrent sweeps release each item once.
- All boundary times are Asia/Tashkent wall-clock, stored in UTC.

## Tests

Frozen clock in Asia/Tashkent (`travelTo`), planner rows created through the backend planner, `DigestDispatcher` faked:

| # | Case | Expected |
| - | ---- | -------- |
| 1 | quiet `23-08`, instant match at 23:30 | `quiet_hold` item; nothing sent at 23:31, 03:00, 07:59 |
| 2 | sweep at 08:00 | one `dispatchFor(A, 'quiet_end', [1 item])` |
| 3 | three held matches at 23:30, 02:00, 06:59 | one dispatch with 3 items at 08:00, ordered by `matched_at` |
| 4 | quiet `00-09`, match at 23:59 | instant item, sent at once through KV-TG-051 |
| 5 | quiet `22-08`, matches at 21:59 / 22:00 | sent / held (window half-open `[start, end)`) |
| 6 | digest `19`, two digest items at 19:00 | one `dispatchFor(A, 'digest_slot', [2 items])` |
| 7 | user turns quiet on (`23-08`) at 23:10 while a digest item is due at 23:10 | skipped; released with the morning group after re-planning |
| 8 | held listing withdrawn at 05:00 | not dispatched (backend drops the item; the sweep never sees it) |
| 9 | two sweeps run concurrently | each item dispatched once (`withoutOverlapping`, release in a transaction) |
| 10 | scheduler down 07:30–09:10 | the 09:10 run releases the overdue morning group once; lag metric ~70 min |
| 11 | lost `DeliveryDue` for an instant item | the sweep sends it through the KV-TG-051 handler |

## Edge cases

- Users in other time zones: business time is always Asia/Tashkent (BR-API-150); no per-user zone.
- Bot blocked during the night: the morning digest fails with `403` → `ChatUnreachable` (KV-TG-021); the backend
  listener drops the user's remaining items.
- Migration: pending items or last-digest timestamps from legacy (KV-DB-019, Q-DATA-014) are loaded into the same table
  and released by the same sweep.
- 50 000 due users at 09:00: the sweep only dispatches; sending is paced (KV-TG-050); the run finishes in seconds.

## Security

- No personal data beyond ids; the job logs counts only (SEC-REQ-047). Sends happen under the pacer (SEC-REQ-029).

## Definition of done

Tests green (`make ci-backend`), the quiet-hours rows of KV-QA-006's time matrix green, KV-QA-009 spec transcript
"quiet hours" green after KV-TG-053, parity-gate cells of F-DELIVERY-004 updated, `09` row updated, PR reviewed by the
other developer (new every-minute scheduled task announced to the production track).
