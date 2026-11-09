# KV-BE-137 — Listing status machine, post deletion and `ListingWithdrawn`

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend (track: development) |
| Complexity | M |
| Feature IDs | F-PIPELINE-006, F-DELIVERY-006 |
| Dependencies | KV-BE-134, KV-DB-032 (`listing_status_events`), KV-BE-043 (`RentedThresholdReached`); Q-API-023, Q-BOT-031 |

## Goal

Every change of a listing's state goes through one `ListingStatusMachine` with an explicit transition table, an audit
row per transition and an event after commit: withdrawals from the source (rented, sold, deleted), deleted source
posts (`post_deleted`), vote thresholds, takedowns, merges, reactivation on re-posting — so feed, map, radars, the bot's
«Объявление снято» edits and the 90-day PII clock all react to the same fact exactly once.

## Legacy reference

- BR-API-065 / BR-DATA-006 / BR-BOT-093 (withdrawn — rented, sold, deleted — kept 90 days, then PII erased),
  BR-API-066 / BR-BOT-092 (sent cards edited to «Объявление снято»), BR-API-067 (`post_deleted: true`: no «Открыть
  пост», video opens the gallery), BR-API-068 (author takedown removes from feed, map, site and alerts), BR-API-069
  (`status_text` label, mock «Сдана»), ENT-034, Q-API-023 (what API-008 returns for a withdrawn listing), Q-BOT-031
  (text and triggers of the edit), `$KVADRO_ROOT/docs/about.md:181-185`.
- `10` §4.4 ("listing status transitions and the 90-day PII clock" live in exactly one place), §4.12
  (`ListingWithdrawn` → Delivery edit, Privacy schedule, Media purge on takedown); `15` §3.5 #7.

## Implementation

1. Read KV-DB-008 (`status` values `active`, `withdrawn`, `rented`, `sold`, `taken_down`, `merged`), KV-DB-032,
   KV-BE-043, `.claude/skills/laravel-best-practices/`. Tests first.
2. `php artisan make:enum Enums/Listings/ListingStatus --no-interaction` (if KV-BE-014 has not) and
   `Enums/Listings/StatusCause` (`SourceWithdrawn`, `SourceDeleted`, `VotesRented`, `Takedown`, `Merge`, `Expired`,
   `Republished`, `Operator`, `Legacy`).
3. `php artisan make:class Services/Listings/ListingStatusMachine --no-interaction`:
   `transition(Listing, ListingStatus $to, StatusCause, string $actor): bool` — locks the row, checks the table, writes
   `listing_status_events`, sets `withdrawn_at` (first entry into a withdrawn-type state only; never reset by a second
   withdrawal), clears it on reactivation; returns `false` and writes nothing when the listing is already in `$to`
   (idempotent). Allowed transitions:
   - `active` → `rented` | `sold` | `withdrawn` | `taken_down` | `merged`;
   - `rented` | `sold` | `withdrawn` → `active` (cause `Republished`, only while `pii_purged_at` is null and within
     90 days) | `taken_down` | `merged`;
   - `taken_down` → nothing (terminal, BR-DATA-022); `merged` → `active` only through `UnmergeService` (KV-BE-136).
4. Triggers wired here:
   - intake `withdrawn` event (KV-BE-123) with reason `rented` / `sold` / `deleted` / `expired` → that status for the
     publication; the listing changes only when **no other publication** of it is still active (a flat posted in
     two channels stays active while one post lives);
   - `post_deleted` (reader or collector): the publication gets `deleted_at`; when all publications are deleted the
     listing gets `post_deleted = true` at once and is withdrawn with cause `SourceDeleted` after
     `config('listings.deleted_post_grace_hours')` (24 h `PROPOSED`, spec-tested — legacy timing unknown, Q-API-023)
     unless a new publication arrives;
   - `RentedThresholdReached` (KV-BE-043) → `rented`, cause `VotesRented`, behind the kill switch of KV-BE-043;
   - optional expiry: `config('listings.expire_after_days')` (default `null` = off; legacy rule unknown) → `withdrawn`,
     cause `Expired`, by a daily command `listings:expire`.
5. Events after commit: `ListingWithdrawn(listing, status, cause)` for every entry into `rented`/`sold`/`withdrawn`/
   `taken_down`; `ListingReactivated`; consumers: Radar/Delivery (drop pending items, KV-BE-111; edit sent cards —
   telegram track `11b` M5.8 for F-DELIVERY-006), Pricing (mark dirty), PublicData (landing/SEO), Privacy (the 90-day
   clock reads `withdrawn_at`, KV-DB-028).
6. `status_text`: a label key per status for the display formatter (KV-BE-021) — `rented` → «Сдана», `sold` →
   «Продана», `withdrawn` → «Снято», `taken_down` → not served (404 per KV-BE-036's Q-API-023 decision).
7. Search exclusion is already `status = 'active'` (KV-BE-023); this task adds the regression tests per transition.

## Files

- `backend/app/Services/Listings/ListingStatusMachine.php`, `backend/app/Enums/Listings/StatusCause.php`,
  `backend/app/Events/Listings/{ListingWithdrawn,ListingReactivated}.php`,
  `backend/app/Listeners/Listings/{ApplyRentedThreshold,ApplySourcePostDeleted}.php`,
  `backend/app/Console/Commands/Listings/{ExpireListings,ApplyDeletedPostGrace}.php` (new)
- `backend/app/Services/Ingest/Stages/ApplyLifecycle.php` (body); `backend/config/listings.php`
- `backend/tests/Feature/Listings/ListingStatusMachineTest.php`, `backend/tests/Feature/Listings/ListingLifecycleTest.php` (new)

## API contract

n/a (internal). Visible through `status_text`, `post_deleted`, and exclusion from API-004/005/007 and radar matching.

## Business rules

- BR-API-065, BR-DATA-006 (`withdrawn_at` starts the 90-day clock, set once), BR-API-066 / BR-BOT-092 (edit fan-out
  triggered by `ListingWithdrawn`), BR-API-067, BR-API-068, BR-API-069, BR-DATA-022 (`taken_down` terminal).
- Q-API-023 (withdrawn-listing details) stays with KV-BE-036; Q-BOT-031 (edit text and triggers) with the telegram
  track.

## Acceptance criteria

- A listing posted in two channels stays active when one post is withdrawn and is withdrawn when the second is.
- A second `withdrawn` event for the same listing writes no status row, keeps the original `withdrawn_at` and raises no
  second event (so each delivered card is edited once, `15` §3.5 #7).
- A taken-down listing cannot be reactivated by any event, re-post or merge.
- All publications deleted → `post_deleted = true` immediately; withdrawn after the grace period unless re-posted.

## Tests

- `ListingStatusMachineTest`: dataset of allowed and forbidden transitions, `same_status_is_noop_without_event`,
  `withdrawn_at_set_once`, `reactivation_clears_withdrawn_at`, `reactivation_refused_after_purge`,
  `taken_down_terminal`, `status_event_written_with_cause_and_actor`, `event_dispatched_after_commit_only`.
- `ListingLifecycleTest`: `one_of_two_publications_withdrawn_listing_stays_active`, `last_publication_rented_sets_rented`,
  `post_deleted_flag_then_grace_withdrawal` (time travel 24 h ± 1 s), `republish_within_grace_cancels_withdrawal`,
  `rented_threshold_event_sets_rented`, `kill_switch_blocks_vote_transition`, `expiry_off_by_default`,
  `withdrawn_listing_absent_from_feed_map_and_matching`.

## Edge cases

- Withdrawal and a price update arriving out of order: events ordered by `source_version` (KV-BE-123); a stale
  `updated` never reactivates.
- A merge of a withdrawn listing into an active one: the merged listing is `merged`, not withdrawn — no «Объявление
  снято» edit for cards of the merged id (they now show the survivor).
- Votes say `rented` while the source keeps re-posting: re-posting reactivates (cause `Republished`) and the vote
  decision is recorded as overturned for review (SEC-REQ-045).

## Security

- SEC-REQ-040 (takedown terminal), SEC-REQ-045 (vote-driven transitions behind the threshold and kill switch, audited),
  SEC-REQ-038 (`withdrawn_at` is the retention clock).

## Definition of done

Tests green (`make ci-backend`), the transition table documented in `docs/api/intake.md` (lifecycle), `09` rows
F-PIPELINE-006 and F-DELIVERY-006 updated, PR reviewed by the other developer; the event contract announced to the
telegram track and M4.
