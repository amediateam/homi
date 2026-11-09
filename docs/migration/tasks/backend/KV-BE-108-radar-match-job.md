# KV-BE-108 — `MatchListingAgainstRadars`: triggers, exclusions, idempotent fan-in

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend (track: development) |
| Complexity | M |
| Feature IDs | F-DELIVERY-001, F-HIDE-004 |
| Dependencies | KV-BE-107 (`RadarMatcher`), KV-BE-109 (delivered set, eligibility), KV-BE-106 (hide rules), KV-BE-110 (`DeliveryPlanner`), KV-BE-009 (`AccessGate::forBot`); `ListingPublished` from KV-BE-134; DEC-20; Q-API-027, Q-BOT-033, Q-BOT-012 |

## Goal

When a listing is published, one queued job finds every user whose active radar it matches, drops the users for whom
it is excluded (hidden listing, blocked author, the radar's hide rule, already delivered, blocked access, unreachable
chat), picks one radar per user and hands one planned delivery per (user, listing) to the planner — exactly once, even
when the job is retried or the event arrives twice.

## Legacy reference

- `$KVADRO_ROOT/docs/about.md:198-207` (radar sends new matching listings); delivery pipeline reconstruction `04` §5
  (state diagram: matched → dropped / instant / quiet / digest).
- Audit IDs: BR-API-081, BR-BOT-101, BR-DATA-016, BR-DATA-022 (taken-down or opted-out never reappear); LB-API-041;
  BOT-081, BOT-082, BOT-083; GAP-010; Q-API-027, Q-BOT-033 (triggers), Q-BOT-012 (blocked bot).

## Implementation

1. Read `.claude/skills/laravel-queues/` (unique jobs, `afterCommit`, retries) and `.claude/skills/configuring-horizon/`.
2. Listener `QueueRadarMatching` (queued) on `ListingPublished` → dispatches `MatchListingAgainstRadars($listingId)` on
   the new `radar` queue (`supervisor-radar` in `config/horizon.php` — shared file, announced in the PR, `10` §4.10).
   `ListingPriceChanged` triggers matching only when `config('radar.match_on_price_change')` is on (default off — legacy
   triggers unknown, Q-API-027, Q-BOT-033); a repost attached to an existing listing never re-triggers.
3. `php artisan make:job Radar/MatchListingAgainstRadars --no-interaction`: `ShouldBeUnique` by listing id
   (`uniqueFor` 600 s), `tries` 3, backoff 10/60/300 s. Steps:
   1. reload the listing; stop unless `status = active` (withdrawn, taken down, purged or from an opted-out channel →
      nothing, BR-DATA-022);
   2. `RadarMatcher::radarsFor($listing)` in chunks of 1 000;
   3. per chunk, bulk-load the candidate users' exclusions with one query each: `hidden_listings` for this listing,
      `blocked_authors` for its author, the chunk's hide rules (`HideRulePredicate`), `radar_deliveries` for this listing,
      users with `bot_chat_state <> 'active'` (unreachable, Q-BOT-012), users the access gate refuses for bot actions
      (`blocked`);
   4. group the remaining radars by user; one radar per user: an `instant` radar wins over a `digest` radar, then the
      oldest `number` (spec — legacy is unknown whether one listing can reach a user twice through two radars; the
      delivered set forbids it, BR-DATA-016);
   5. `DeliveryPlanner::plan($user, $radar, $listing, now())` (KV-BE-110) inside a transaction that re-reads the radar
      `FOR SHARE` and skips it if it was deleted or paused meanwhile (`15` §3.6 #6).
4. The planner writes a `radar_pending_items` row (unique per unreleased (user, listing)) — retries and duplicate events
   hit the unique key and do nothing; a due item raises `DeliveryDue` for the telegram track's sender
   (F-DELIVERY-002, `11b` M5.8), which claims it through `DeliveryLedger::claim` (KV-BE-109) before sending.
5. Metrics (`10` §4.17): matches per listing, users excluded per reason, job duration, publish-to-plan lag; a warning
   log when one listing matches more than `radar.fanout_warn` (default 5 000) users.
6. Command `radar:match {listing}` for operators (replays one listing; idempotent by construction).

## Files

- `backend/app/Listeners/Radar/QueueRadarMatching.php`, `backend/app/Jobs/Radar/MatchListingAgainstRadars.php` (new)
- `backend/app/Services/Radar/MatchExclusions.php` (bulk exclusion loader, new)
- `backend/app/Console/Commands/Radar/MatchListingCommand.php` (new); `backend/config/radar.php`
- `backend/config/horizon.php` (new `supervisor-radar` — separate small PR if the other track prefers)
- `backend/tests/Feature/Radar/MatchListingAgainstRadarsTest.php`, `backend/tests/Feature/Pgsql/Radar/MatchRaceTest.php` (new)

## API contract

n/a. Events: consumes `ListingPublished`, optional `ListingPriceChanged`; produces pending items and `DeliveryDue`
(KV-BE-110).

## Business rules

- Kept: BR-API-081 / BR-BOT-101 (exclusions: hide rules, hidden listings, blocked authors, delivered cards),
  BR-DATA-016 (one delivery per user and listing), BR-DATA-022.
- Defect fix `APPROVED`: LB-API-041 (server-side exclusion in radar matching).
- DEC-20 (per-radar instant cap) is applied by the planner, not here.
- Spec-tested: triggers (new listings only by default), one radar per user, unreachable users skipped.

## Acceptance criteria

- A published listing matching radars of users A (instant), B (digest), C (hidden the listing), D (blocked the author),
  E (radar hide rule on its channel), F (already delivered), G (bot blocked) produces planned deliveries for A and B only.
- Running the job twice, or dispatching the event twice, leaves exactly the same pending rows.
- A radar deleted or paused while the job runs gets no delivery planned after the change commits.

## Tests

- `MatchListingAgainstRadarsTest`: `plans_for_matching_users_only` (the A–G scenario), `withdrawn_listing_plans_nothing`,
  `opted_out_channel_plans_nothing`, `one_delivery_per_user_with_two_matching_radars`, `instant_radar_preferred`,
  `job_retry_is_idempotent` (`15` §3.5 #1 planning half), `duplicate_event_is_idempotent`,
  `price_change_does_not_match_by_default`, `price_change_matches_when_enabled`, `repost_does_not_rematch`,
  `access_blocked_user_skipped`, `metrics_recorded`.
- `Pgsql/Radar/MatchRaceTest` (KV-QA-008): `radar_deleted_during_job_gets_nothing` (`15` §3.6 #6),
  `starter_and_instant_same_listing_one_delivery` (`15` §3.6 #7, with KV-BE-109 claim),
  `user_erased_during_job_no_rows_recreated` (`15` §3.6 #9).

## Edge cases

- A listing published and withdrawn within seconds → the job sees `withdrawn` and plans nothing; if already planned, the
  KV-BE-111 listener drops the pending item.
- A merge (KV-BE-136) after planning → pending item re-pointed to the survivor by `DeliveryLedger::repoint`.
- 50 000 active radars and a whole-city listing → chunking keeps memory flat; the job finishes within the 120 s
  timeout or splits into chunk jobs (`radar.chunk_jobs` threshold).
- Bot not configured locally → pending rows are written; nothing is sent (the sender belongs to the telegram track).

## Security

- SEC-REQ-014 (per-user exclusions computed for the right user only), SEC-REQ-006 (`blocked` users get nothing),
  SEC-REQ-029 (no sending here — pacing is the sender's), SEC-REQ-047 (logs carry ids only).

## Definition of done

Tests green (`make ci-backend`, `pgsql` group), new queue announced in the PR, parity gate items ticked (`15` §4) for
F-DELIVERY-001 and the matching part of F-HIDE-004, docs and the feature rows in `09` updated, PR reviewed by the
other developer.
