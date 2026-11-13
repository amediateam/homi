# KV-BE-110 — Quiet hours, digest slots and the `DeliveryPlanner`

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend (track: development) |
| Complexity | M |
| Feature IDs | F-DELIVERY-002, F-DELIVERY-003, F-DELIVERY-004, F-SETTINGS-005 |
| Dependencies | KV-DB-009 (`radar_pending_items`), KV-BE-045 (quiet and digest settings, `SettingsChanged`), KV-QA-006 (time fixtures and clock helpers); DEC-20 (instant cap); Q-BOT-002, Q-BOT-003, Q-DATA-014 |

## Goal

Every planned delivery gets one release time computed in `Asia/Tashkent` wall-clock from the user's settings: now for
an instant radar outside quiet hours, the end of the quiet window («всё, что появилось за ночь, — одной подборкой
утром»), or the next digest hour for a digest radar. The telegram track's senders then only ask "what is due now?" —
one query, no time arithmetic of their own.

## Legacy reference

- `$KVADRO_ROOT/demo/app/src/i18n/locales/ru.js:512` («Карточки не приходят; всё, что появилось за ночь, — одной
  подборкой утром.»), `:519` («Время — ташкентское.»); `$KVADRO_ROOT/docs/telegram-bot.md:775-777` (digest only for
  digest radars; quiet hours), `:783` (service news opt-out).
- Presets: bot quiet `off`, `22-08`, `23-08`, `00-09`, `23-07`; digest `09`, `09,19`, `12,20`, `19` (`04` §3.14);
  Mini App mock examples `23-08`, `22-09`, `09,21`, `21` (`$KVADRO_ROOT/demo/app/tools/parity/mocks.mjs` settings).
- Audit IDs: BOT-081, BOT-082, BOT-083, ENT-011, BR-API-082, BR-API-083, BR-API-084, BR-API-085, BR-BOT-073,
  BR-BOT-074, BR-BOT-077, BR-BOT-078, BR-BOT-100, BR-BOT-103, BR-DATA-014, BR-DATA-030; LB-DATA-018; GAP-010, GAP-022;
  SEC-REQ-029 (optional instant cap, DEC-20).

## Implementation

1. Read KV-QA-006 (clock helpers, the `15` §3.10 fixture) and ADR-0006 (storage in UTC).
2. Value objects (`php artisan make:class Domain/Delivery/QuietWindow --no-interaction`, `Domain/Delivery/DigestSchedule`):
   - `QuietWindow::fromSettings(?time $start, ?time $end)`; `off` when either is null; the window is the half-open
     interval `[start, end)` in Tashkent wall-clock and may cross midnight; `contains(CarbonImmutable $utc): bool`;
     `endAfter(CarbonImmutable $utc): CarbonImmutable` (UTC instant of the next window end). Accepts any `HH-HH`, not
     only presets (Mini App examples differ, BR-API-085).
   - `DigestSchedule::fromHours(int[] $hours)` (0–23, sorted, unique); `nextSlotAtOrAfter(CarbonImmutable $utc)`.
     Asia/Tashkent is UTC+5 all year (no DST) but the code uses the zone, never a fixed offset.
3. `php artisan make:class Services/Delivery/DeliveryPlanner --no-interaction`: `plan(User, Radar, Listing,
   CarbonImmutable $now): PlannedDelivery` → inserts `radar_pending_items (user_id, radar_id, listing_id, matched_at,
   release_at, kind)` with `insertOrIgnore` on the KV-DB-009 partial unique key, `kind` ∈ `instant`, `quiet_hold`,
   `digest` (`kind` is a new nullable column — `php artisan make:migration add_kind_to_radar_pending_items_table
   --no-interaction`, additive):
   - `instant` radar, `now` outside the quiet window → `release_at = now`, kind `instant`;
   - `instant` radar inside the window → `release_at = quiet.endAfter(now)`, kind `quiet_hold` (the morning digest);
   - `digest` radar → `release_at = digest.nextSlotAtOrAfter(now)`; if that slot falls inside the quiet window, it moves
     to the window end; kind `digest`. A user in digest mode without digest hours uses the first digest preset (`09`,
     spec);
   - optional cap (DEC-20 — `config('delivery.instant_cap_per_radar_per_hour')`, `null` at S2 for parity): over the cap
     an instant item becomes `digest` at the next slot (or the quiet end) — SEC-REQ-029 overflow rule.
   After commit, an item with `release_at ≤ now` raises `DeliveryDue(user_id)` (`php artisan make:event Delivery/DeliveryDue`).
4. `php artisan make:class Services/Delivery/DuePendingItems --no-interaction`: `dueUsers(CarbonImmutable $now):
   LazyCollection<int>` and `forUser(User, CarbonImmutable $now): Collection` (unreleased, `release_at ≤ now`, ordered by
   `matched_at`), plus `markReleased(array $ids)` used by the sender after its claims. Grouping into one message per user
   and slot, the release schedule and the sending are the telegram track's (F-DELIVERY-002…004, `11b` M5.8); the slot key
   for "one digest per (user, slot)" is `release_at` itself (`15` §3.5 #2).
5. `replanForUser(User)` on `SettingsChanged` (KV-BE-045): unreleased items of the user get a new `release_at` from the
   new settings (quiet turned off → due now; digest hours changed → next new slot).
6. `config/delivery.php`: `instant_cap_per_radar_per_hour` (null), `default_digest_hours` ([9]).
7. Index check: `radar_pending_items (release_at) WHERE released_at IS NULL` serves `dueUsers` (KV-DB-009 partial
   index or add one, `CONCURRENTLY`).

## Files

- `backend/app/Domain/Delivery/QuietWindow.php`, `DigestSchedule.php`, `PlannedDelivery.php` (new)
- `backend/app/Services/Delivery/DeliveryPlanner.php`, `DuePendingItems.php` (new); `backend/app/Events/Delivery/DeliveryDue.php`
- `backend/app/Listeners/Delivery/ReplanOnSettingsChanged.php` (new); `backend/config/delivery.php`
- `backend/tests/Unit/Delivery/QuietWindowTest.php`, `DigestScheduleTest.php`,
  `backend/tests/Feature/Delivery/DeliveryPlannerTest.php` (new)

## API contract

n/a. Contract with the telegram track: `DeliveryDue(user_id)` + `DuePendingItems::forUser()` + `markReleased()`;
claims through `DeliveryLedger::claim()` (KV-BE-109).

## Business rules

- Kept: BR-API-082 / BR-BOT-100 (instant one card at once; digest at the user's hours), BR-API-083 / BR-BOT-077 (no cards
  in quiet hours; one morning digest), BR-API-084 / BR-DATA-030 (Asia/Tashkent wall-clock), BR-BOT-078 (digest hours
  only for digest radars), BR-DATA-014 (`quiet` `off|HH-HH`, `digest` `HH|HH,HH`).
- DEC-20 (instant cap) — none at S2; the switch exists for the product owner.
- Spec-tested (never observed, Q-BOT-002, Q-BOT-003, Q-DATA-014): morning digest at exactly the window end; a digest
  slot inside the quiet window moves to its end; one digest per user per slot for all radars.

## Acceptance criteria

- The `15` §3.10 cases #1–#4 hold with a frozen clock: quiet `23-08`, instant, matched at 17:59:59 / 18:00:00 /
  02:59:59 UTC → due now / held / held, and the held items are due at 03:00:00 UTC; quiet `00-09`, matched at 18:59:59
  and 19:00:00 UTC → due / held; digest `09,19` → slots 04:00 and 14:00 UTC, never 09:00 UTC; items from 14:00 UTC to
  04:00 UTC next day all fall into the 04:00 slot, none twice across the Tashkent midnight (19:00 UTC).
- Results are identical with process `TZ=UTC` and `TZ=Asia/Tashkent` (`15` §3.10 #11).
- Planning the same (user, listing) twice leaves one unreleased item.

## Tests

- `Unit/Delivery/QuietWindowTest`: dataset over the five bot presets and the Mini App examples, boundary instants
  (start − 1 s, start, end − 1 s, end), `off`, a window not crossing midnight (`00-09`).
- `Unit/Delivery/DigestScheduleTest`: `09,19` slots, `12,20`, a single hour, the next-day wrap at 19:00 UTC.
- `DeliveryPlannerTest`: the `15` §3.10 #1–#4 matrix, `digest_slot_inside_quiet_moves_to_window_end`,
  `digest_mode_without_hours_uses_default`, `plan_is_idempotent`, `due_item_raises_delivery_due_after_commit`,
  `replan_on_quiet_off_makes_items_due`, `replan_on_new_digest_hours`, `instant_cap_overflow_to_digest`
  (cap configured), `cap_null_by_default`, `tz_matrix_identical_results` (nightly matrix hook).

## Edge cases

- Quiet window `22-08` and a digest at `20` → 20:00 Tashkent is outside, sent at 15:00 UTC.
- Settings changed to a window that contains `now` while instant items are due → they move to the window end.
- A user whose quiet window equals 24 h (`08-08`) → treated as `off` (an empty interval), spec.
- Clock skew between workers: `release_at ≤ now` uses the database clock in `dueUsers` (`now()` of PostgreSQL), not the
  worker's.

## Security

- SEC-REQ-029 (optional overflow cap), SEC-REQ-014 (items per user), SEC-REQ-047 (no listing text in logs).

## Definition of done

Tests green (`make ci-backend`, TZ matrix in the nightly job), parity gate items ticked (`15` §4) for the planning parts
of F-DELIVERY-002, F-DELIVERY-003, F-DELIVERY-004 and F-SETTINGS-005, docs and the feature rows in `09` updated, PR
reviewed by the other developer.
