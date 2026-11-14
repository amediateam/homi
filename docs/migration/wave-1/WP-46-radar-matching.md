# WP-46 — Radar matching and delivery planning

| Field | Value |
| ----- | ----- |
| Stage | C |
| Status | TODO |
| Depends on | WP-45 |
| Size | about 2 600 changed lines, L |
| Behaviour reference | `25` §5 (matching and delivery planning), §4.5 (limits); `24` §8.3 (RK-25); `15` §3.5, §3.6 rows 6–9, §3.10 (time zones); `16` SEC-REQ-014, SEC-REQ-029; tasks `tasks/backend/KV-BE-108-radar-match-job.md` (exclusions, one delivery per user), `KV-BE-109-delivery-ledger.md` (claim and release), `KV-BE-110-delivery-planner.md` (quiet hours, digest slots), `KV-BE-111-radar-lifecycle-listeners.md` (what drops pending items). The SQL match predicate of `KV-BE-107` is not built in Wave 1; `backend/config/horizon.php` (queues) |
| Needs from the production track | 1. Review the small shared-file PR that adds `supervisor-radar` (queue `radar`) to `backend/config/horizon.php`; Horizon restarts with the deploy. 2. Confirm the Laravel scheduler runs every minute on staging and production. 3. Approve three migrations on production (`radar_filter_sets`, `radar_deliveries`, `radar_outbox`, new and empty). 4. Server env: `RADAR_MATCHING_ENABLED=false` now; it becomes `true` with the bot's sending package (WP-57), when the feed feature is on a real source and a sender exists. Leave `RADAR_POLL_INTERVAL` and `RADAR_POLL_BUDGET_PER_MINUTE` blank (defaults 300 and 60) unless the operator's limits say otherwise |

## Goal

New listings reach the outbox of every user whose active radar they match — exactly once per user and listing, at
the right time for the user's quiet hours and digest hours. HOMI finds new listings by polling the listing source
once per distinct filter set. The bot's sending package only has to implement one small interface to deliver what
the outbox holds.

## Scope

In: filter sets and their poller; the matcher's fan-out with per-user exclusions; the delivered set (ledger); the
delivery planner; the outbox table, its interface, the delivery job and the sender contract with a null
implementation; lifecycle listeners; scheduler entries; the `radar` queue; retention of the outbox.

Out: rendering and sending cards and digests, pacing towards Telegram, editing cards of withdrawn listings (WP-57,
which binds the sender); the bot's radar screens (WP-55); matching by SQL over HOMI's own listings (Wave 2).

## Decisions that bind this package

- Radars are matched and delivered by HOMI through the new bot (DEC-43).
- In Wave 1 the matcher polls the listing source per distinct filter set and compares with what it has seen
  (`25` §5); identical filters of many users cost one poll (RK-25).
- The matcher never runs on stub data: real users must not get demo listings in their chat (RK-27).
- A delivered listing is never delivered again to the same user, whatever radar matched (task `KV-BE-109`).
- Time rules are computed in Asia/Tashkent wall-clock through the zone name; storage is UTC (ADR-0006).
- Behaviour changes stay off (DEC-36): no cap on instant cards per radar (DEC-20 undecided → `null`).

## Design

### Filter sets and polling

Table `radar_filter_sets`: `hash` (char 64, primary key — the canonical hash that `radars.filters_hash` holds),
`filters` (`json`, the 25 keys with `posted_days` null), `city`, `deal`, `seen_numbers` (`json`, the newest 200
listing numbers seen), `baseline_at`, `last_polled_at`, `next_poll_at` (indexed), `failures` (small integer),
timestamps. `App\Services\Delivery\FilterSetRegistry` keeps one row per hash that has an active radar (listener on
`RadarSaved` and `RadarDeleted`); rows without one are removed by the daily `radar:prune`.

Command `radar:poll`, scheduled every minute with `onOneServer()` and `withoutOverlapping()`:

1. Stop when `config('radar.matching_enabled')` is false, when `source.listings.feed` resolves to `stub` for a system
   context, or when the legacy breaker is open.
2. Take the sets with `next_poll_at <= now` that have an active radar, oldest first, at most
   `config('radar.poll_budget_per_minute')` (60).
3. For each: set `next_poll_at = now + poll_interval (300 s) + up to 30 s of jitter` and dispatch
   `App\Jobs\Radar\PollFilterSet` (queue `radar`, unique per hash for 300 s, one try, timeout 60 s).

`PollFilterSet::handle()`:

1. `ListingSource::feed()` with the set's filters, `sort = new`, in `SourceContext::system()` — the legacy client
   treats it as a background call and gives it only its share of the outbound budget (WP-41).
2. First poll (`baseline_at` null): remember the numbers of the page as seen, set the baseline, deliver nothing. The
   past belongs to the starter list of WP-45.
3. Later polls: new numbers are those not in `seen_numbers`. When every number of a page is new, read the next
   page, at most `config('radar.poll_max_pages')` (3). Put the new numbers at the head of the ring and cut it to 200.
4. For each new listing, oldest first: `RadarMatcher::fanOut($set, $summary)`.
5. Source unavailable: `failures + 1`, `next_poll_at = now + min(interval × 2^failures, 3 600 s)`, no exception;
   a success resets `failures`.

Only new listings trigger matching; a price change of an old listing does not (the legacy triggers are unknown,
Q-API-027).

### Fan-out (`App\Services\Delivery\RadarMatcher`)

`fanOut(RadarFilterSet $set, ListingSummary $listing): int` (number of planned deliveries). Active radars with that
hash are read in chunks of 500 with their users. Per chunk, with one query per rule, these users are dropped:

| Rule | Source |
| ---- | ------ |
| access blocked | `access_grants.state = 'blocked'` |
| chat not reachable (only when `radar.require_chat`) | `users.bot_chat_state <> 'active'` |
| listing hidden by the user | `hidden_listings` |
| author blocked by the user | `blocked_authors` against the listing's author key (`listing_refs`, or the key on the summary) |
| the radar's hide rule matches | `HideRuleSet::excludes()` of WP-45; adds 1 to `radars.hidden_count` |
| vote-marked as rented | `listing_marks` (WP-44) |
| already delivered | `radar_deliveries` |

Each remaining pair goes to `DeliveryPlanner::plan()`. A listing that matches two filter sets of one user is planned
once: the outbox is unique per user and listing, and an existing unreleased `digest` row is upgraded when the second
radar is `instant` (an instant radar wins, then the older one). A warning is logged when one listing reaches more
than `config('radar.fanout_warn')` (5 000) users.

### Delivered set (`App\Services\Delivery\DeliveryLedger`)

Table `radar_deliveries`: `id`, `user_id` (foreign key, cascade), `listing_number`, `source_channel`,
`source_post_id`, `first_radar_id` (ULID, nullable, not a foreign key), `origin` (`instant`, `digest`, `starter`),
`chat_id`, `message_id` (`bigInteger`, nullable), `delivered_at`. Unique (`user_id`, `listing_number`).

- `delivered(User, list<int>): list<int>` — implements `DeliveredSet` of WP-45 and replaces its null binding.
- `claim(User, ListingPointer, ?Radar, DeliveryOrigin): bool` — `insertOrIgnore`; true only for the caller that
  inserted.
- `attachMessage(User, int $number, int $chatId, int $messageId)`; `release(User, int $number)` — removes a claim
  when the send failed for good before any message existed, so a later match can deliver.

Rows are kept (numbers only) so a listing is never sent twice even months later.

### Planner (`App\Services\Delivery\DeliveryPlanner`)

`plan(User, Radar, ListingPointer, CarbonImmutable $now): ?RadarOutboxItem` computes one release time from the
user's settings (`QuietWindow`, `DigestSchedule` of WP-40):

| Radar mode | Now is | `kind` | `release_at` |
| ---------- | ------ | ------ | ------------ |
| `instant` | outside quiet hours | `instant` | now |
| `instant` | inside quiet hours | `quiet_hold` | the end of the quiet window («всё, что появилось за ночь, — одной подборкой утром») |
| `digest` | any | `digest` | the next digest hour at or after now; if that hour lies inside quiet hours, the end of the window |

A digest radar of a user without digest hours uses `config('delivery.default_digest_hours')` (`[9]`). The quiet
window is half-open `[start, end)`; a window of 24 hours counts as off. Starter listings are **not** planned here:
legacy sends them as one list message right after a radar is saved (BR-API-079, BOT-052), which is the wizard package
of the bot (WP-54). That package claims each starter listing in the delivered set with origin `starter`
(`DeliveryLedger::claim()`), so the matcher never sends it again. `replanForUser(User)` recomputes `release_at` of the user's unreleased `quiet_hold`
and `digest` rows; it runs on `SettingsChanged` when quiet or digest hours changed. After commit, a row with
`release_at <= now` raises `App\Events\Delivery\DeliveryDue` (user id).

### Outbox — the seam for the bot (WP-57)

Table `radar_outbox`: `id`, `user_id` (foreign key, cascade), `radar_id` (ULID, nullable), `listing_number`,
`source_channel`, `source_post_id`, `kind` (`instant`, `quiet_hold`, `digest`), `matched_at`,
`release_at`, `claimed_at`, `sent_at`, `failed_at` (`timestampTz`, nullable), `fail_reason` (string 32, nullable),
`attempts` (small integer). Unique (`user_id`, `listing_number`); index (`sent_at`, `failed_at`, `release_at`);
index (`user_id`, `release_at`).

```php
namespace App\Services\Delivery\Contracts;

interface RadarOutbox {
    /** @return LazyCollection<int, int> ids of users with something due, by the database clock */
    public function dueUsers(CarbonImmutable $now): LazyCollection;
    /** @return Collection<int, OutboxItem> unsent, unclaimed, release_at <= now, ordered by matched_at */
    public function dueFor(User $user, CarbonImmutable $now): Collection;
    public function claim(OutboxItem $item): bool;
    public function markSent(OutboxItem $item, int $chatId, int $messageId): void;
    public function markFailed(OutboxItem $item, string $reason, bool $permanent): void;
    /** Pacing: release the item again after $seconds; no attempt is counted. */
    public function defer(OutboxItem $item, int $seconds): void;
}

interface RadarSender {
    public function sendCard(User $user, OutboxItem $item): SentMessage;              // instant
    /** @param list<OutboxItem> $items */
    public function sendDigest(User $user, array $items): SentMessage;                // quiet_hold, digest of one slot
}
```

- `OutboxItem` (readonly): `id`, `userId`, `radarId`, `ListingPointer $listing`, `kind`, `matchedAt`, `releaseAt`.
  `SentMessage`: `chatId`, `messageId`. A sender signals failure with `App\Exceptions\Delivery\SendFailed`
  (`reason`, `permanent`), and "not now" with its subclass `App\Exceptions\Delivery\SendDeferred` (`retryIn`
  seconds): a send limit or a `retry_after` from Telegram. The job answers a deferral with `defer()` for the item
  (for a digest, every item of the group), stops the loop for this user and dispatches itself again with that
  delay, so pacing never uses up attempts. The limits themselves are WP-57.
- `claim()`, in one transaction: lock the row; refuse when it is sent, failed, or claimed less than
  `config('delivery.claim_timeout')` (300 s) ago; run `DeliveryEligibility::check()` — the radar still exists and is
  active, the user is not blocked, the chat is reachable (when required), the listing is not hidden, its author not
  blocked, no hide rule matches; then `DeliveryLedger::claim()`. Ineligible or already delivered → the row is marked
  failed with reason `ineligible` or `duplicate` and `false` is returned. This closes the gap between planning and
  sending (`15` §3.6 rows 6–8).
- `markSent()` sets `sent_at` and stores chat and message id on the ledger row. `markFailed()`: permanent → sets
  `failed_at` and releases the ledger claim; transient → clears the claim, adds an attempt and moves `release_at` by
  1, 5 or 15 minutes; the fifth attempt becomes permanent.
- `App\Services\Delivery\DatabaseRadarOutbox` implements `RadarOutbox`.

Job `App\Jobs\Radar\DeliverRadarItems` (queue `notifications` — outbound sending must not wait behind incoming
updates on `telegram`; unique per user id, one try): reads `dueFor()`, sends `instant` items one by one through
`sendCard()`, and groups `quiet_hold` and `digest` items that share
a `release_at` into one `sendDigest()` call — one digest per user and slot. Each item is claimed before sending and
marked after. The job is dispatched by a listener on `DeliveryDue` and by the command `radar:release` (scheduled
every minute, iterates `dueUsers()`).

This package binds `App\Services\Delivery\NullRadarSender`: with it the job returns without claiming anything, so
items wait untouched. WP-57 binds its sender and changes nothing else here.

### Lifecycle listeners (queue `radar`)

| Event | Effect |
| ----- | ------ |
| `RadarSaved` (any kind), `RadarDeleted` | `FilterSetRegistry::sync()` for the old and new hash |
| `RadarSaved` with kind `paused`, `RadarDeleted` | delete the radar's unsent outbox rows (a paused radar sends nothing, including what was held for the morning) |
| `SettingsChanged` with quiet or digest hours | `replanForUser()` |
| `App\Events\Telegram\ChatUnreachable` (raised by the bot later; the class is created here) | delete the user's unsent rows; radars stay as they are |

### Queue, schedule, retention

- `backend/config/horizon.php` (shared file, separate PR): `supervisor-radar` — connection `redis`, queue `radar`,
  `balance` `simple`, one process (two in production), `tries` 1, `timeout` 120, `memory` 256.
- `routes/console.php`: `radar:poll` and `radar:release` every minute; `radar:prune` daily at 04:10 Asia/Tashkent —
  deletes outbox rows 30 days after `sent_at` or `failed_at` and filter sets without an active radar.
- `radar:status` prints: sets, sets due, sets failing, outbox rows pending, due and failed in the last hour.
- `backend/config/radar.php` gains `matching_enabled`, `poll_interval`, `poll_budget_per_minute`, `poll_max_pages`,
  `seen_ring`, `fanout_chunk`, `fanout_warn`; new `backend/config/delivery.php`: `default_digest_hours`,
  `instant_cap_per_radar_per_hour` (null), `claim_timeout`, `retry_minutes`, `max_attempts`, `outbox_retention_days`.

Tables with a user link, for the erasure registry of WP-47: `radar_deliveries`, `radar_outbox`.

## Files

- Three migrations; `backend/app/Models/{RadarFilterSet,RadarDelivery,RadarOutboxItem}.php` with factories
- `backend/app/Services/Delivery/{FilterSetRegistry,RadarMatcher,DeliveryLedger,DeliveryPlanner,DeliveryEligibility,DatabaseRadarOutbox,OutboxItem,SentMessage,NullRadarSender}.php`
- `backend/app/Services/Delivery/Contracts/{RadarOutbox,RadarSender}.php`; `backend/app/Enums/Delivery/{OutboxKind,DeliveryOrigin}.php`
- `backend/app/Jobs/Radar/{PollFilterSet,DeliverRadarItems}.php`; `backend/app/Console/Commands/Radar/{PollRadars,ReleaseRadars,PruneRadars,RadarStatus}.php`
- `backend/app/Events/Delivery/DeliveryDue.php`, `backend/app/Events/Telegram/ChatUnreachable.php`,
  `backend/app/Exceptions/Delivery/SendFailed.php`; `backend/app/Listeners/Radar/*.php` (the five rows above and
  `DispatchDeliveryOnDue`)
- `backend/config/{radar,delivery}.php`, `backend/routes/console.php`, `backend/app/Providers/AppServiceProvider.php`
  (bindings); `backend/config/horizon.php` — separate shared-file PR
- `backend/tests/Unit/Delivery/DeliveryPlannerTimeTest.php`; `backend/tests/Feature/Delivery/{PollFilterSetTest,RadarMatcherTest,DeliveryLedgerTest,DeliveryPlannerTest,RadarOutboxTest,DeliverRadarItemsTest,LifecycleListenersTest,RadarCommandsTest}.php`;
  `backend/tests/Feature/Pgsql/DeliveryRaceTest.php`; `backend/tests/Support/FakeRadarSender.php`
- `backend/.env.example` (`RADAR_MATCHING_ENABLED`, `RADAR_POLL_INTERVAL`, `RADAR_POLL_BUDGET_PER_MINUTE`) —
  separate shared-file PR

## Steps

1. Read the four task files for rules, edge cases and test names, the skills `laravel-queues` and
   `configuring-horizon`, and `15` §3.10. Tests first in every step; time tests use a frozen clock.
2. Migrations and models. `DeliveryLedger`; bind it as `DeliveredSet`.
3. `DeliveryPlanner` with the time matrix; `replanForUser`; `DeliveryDue`.
4. `DatabaseRadarOutbox`, `DeliveryEligibility`, `OutboxItem`; the two contracts; `NullRadarSender`.
5. `DeliverRadarItems` with `FakeRadarSender` in tests; `radar:release`.
6. `FilterSetRegistry`, `PollFilterSet`, `radar:poll` with its three stop conditions.
7. `RadarMatcher::fanOut` with the exclusion rules.
8. The listeners; `radar:prune`; `radar:status`; the schedule.
9. The Horizon PR; Pint, PHPStan, `make ci-backend`; the env PR; deploy with matching off.

## Behaviour to reproduce

- An instant radar sends one card at once; a digest radar sends at the user's digest hours; nothing arrives in quiet
  hours, and what was held arrives as one message when they end (legacy bot behaviour, task `KV-BE-110`).
- One listing reaches one user once, through whichever radar (task `KV-BE-109`).
- Hidden listings, blocked authors, hide rules and already delivered listings never produce a delivery — checked
  when matching and again when claiming (fix of LB-API-041).
- A deleted or paused radar sends nothing more; an erased user leaves no job that recreates rows (`15` §3.6 row 9:
  jobs load the user by id and stop when it is gone).
- A retried or duplicated job changes nothing: every write is an `insertOrIgnore` on a unique key (`15` §3.5).

Edge cases: quiet hours 22–8 with a digest at 20 → 20:00 Tashkent is outside, sent at 15:00 UTC; settings changed
to a window that contains now while instant items are due → they move to the window end; `dueUsers()` compares with
the database clock, not the worker's; with no sender bound, rows accumulate and are pruned only after they were sent
or failed — check `radar:status` before turning matching on.

## Tests

- Planner time matrix (unit, dataset): the quiet presets of WP-11 at start − 1 s, start, end − 1 s, end; `null`
  quiet hours; digest hours `[9]`, `[9, 19]`, `[12, 20]`, `[19]` with the next-day wrap at 19:00 UTC; a digest hour
  inside quiet hours moves to the window end; no digest hours → default; results identical under process time zones
  `UTC` and `Asia/Tashkent`.
- Planner: `plan` twice → one row; digest row upgraded by an instant radar; replan after
  quiet hours are switched off makes held rows due; `DeliveryDue` only after commit.
- Ledger: `claim` true once and false afterwards; `delivered` subset; `release` allows a new claim; rows of user A
  never answer for user B.
- Outbox: `dueFor` order and filters; `claim` refuses sent, failed and freshly claimed rows and re-claims a stale
  one; ineligible cases one by one (radar deleted, radar paused, user blocked, listing hidden, author blocked, hide
  rule) → `false` and reason; duplicate in the ledger → `false`; transient failure backs off 1, 5, 15 minutes and
  becomes permanent on the fifth; a permanent failure releases the claim.
- Delivery job (`FakeRadarSender`): two instant items → two cards; three held items of one slot → one digest with
  three items; `SendFailed` transient and permanent; `SendDeferred` defers the item (every item of a digest group),
  counts no attempt, stops the loop for that user and dispatches the job again after the delay; with
  `NullRadarSender` nothing is claimed.
- Poller (fake `ListingSource`): first poll baselines and plans nothing; a later poll plans only unseen numbers,
  oldest first; a fully new page pulls the next, up to three; the ring is cut to 200; source unavailable → back-off
  and no failed job; `radar:poll` stops when matching is off, when the feed driver is `stub`, and when the breaker
  is open; the budget limits the number of dispatched jobs; two users with equal filters cause one source call.
- Matcher: each exclusion row; `hidden_count` incremented by a hide rule; one listing in two sets of one user →
  one outbox row; chunking over 1 200 radars.
- Listeners: pause and delete drop unsent rows; filter set created and pruned; chat unreachable drops the user's
  rows; replays are harmless.
- `pgsql` group: a radar deleted while its poll job runs → nothing sent after the delete commits; a starter claim
  in the ledger racing a poll of the same listing → the poll plans nothing for it; two workers claiming one item →
  one wins.

## Acceptance checklist

- [ ] One poll per distinct filter set and interval; the poller never runs on the stub driver or with matching off.
- [ ] A new listing produces one outbox row per matching user, with the release time of the user's settings.
- [ ] Hidden, blocked, hide-ruled, vote-marked and already delivered listings are excluded at match and at claim.
- [ ] `RadarOutbox`, `RadarSender`, `OutboxItem` and the job `DeliverRadarItems` exist as specified; a fake sender
      delivers cards and digests in tests; the null sender leaves rows untouched.
- [ ] Pause, delete, settings changes and an unreachable chat adjust the outbox as specified.
- [ ] `supervisor-radar` is in Horizon (shared-file PR merged); the three commands are scheduled; `radar:status` works.
- [ ] The PR names the migrations, the env keys and the fact that `RADAR_MATCHING_ENABLED` stays false until the bot's sending package (WP-57) is deployed.
- [ ] `make ci-backend` and the `pgsql` group are green.
- [ ] On staging with matching switched on for a test (feed feature on the fixture-backed legacy driver or a real
      key): a radar gets outbox rows for new listings, visible in `radar:status`; then matching is switched off again.

## Handoff

Empty.
