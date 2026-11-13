# KV-BE-109 — Delivered set («only new»), merge re-pointing and the re-send dry-run

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend (track: development) |
| Complexity | M |
| Feature IDs | F-DELIVERY-005 |
| Dependencies | KV-DB-009 (`radar_deliveries`, `bot_listing_messages`, `radar_pending_items`), KV-BE-018 (alias → survivor); used by KV-BE-102, KV-BE-108, KV-BE-136 and the telegram track's senders (KV-TG-022 `CardSender`); Q-API-031, Q-DATA-013 |

## Goal

One service answers "has this user already received this listing?" and makes "send it now" a single atomic claim, so
that no radar ever sends a card twice — across retries, starter lists, instant pushes and digests, after merges, and
after the cut-over with the migrated log — and one command proves it on real data before go-live (`14` §6.5).

## Legacy reference

- `$KVADRO_ROOT/docs/about.md:200-201` («only listings not received yet» after an edit), `:430` (the delivered log must
  be migrated, «иначе радары повторно отправят»).
- Audit IDs: ENT-010, BR-API-080, BR-API-081, BR-API-089, BR-BOT-049, BR-DATA-012, BR-DATA-016, BR-DATA-019; GAP-024;
  Q-API-031 (per user or per radar), Q-DATA-013 (log shape, origins).
- Migration: `14` §4.2 (delivered-card rows), §6.5 "Radars do not re-send" (dry-run query), V-SUM-3, V-RI-4; KV-DB-019.

## Implementation

1. Read `.claude/skills/laravel-database-optimization/` and `.ai/agents/postgis-geo-engineer.md` (rule 5 upserts).
2. `php artisan make:class Services/Delivery/DeliveryLedger --no-interaction`:
   - `delivered(User, array $listingIds): array` — the subset already in `radar_deliveries` (aliases resolved to
     survivors first, KV-BE-018);
   - `claim(User, Listing, ?Radar, CardOrigin): bool` — `insertOrIgnore` into `radar_deliveries (user_id, listing_id,
     first_radar_id, first_delivered_at)`; `true` only for the caller that inserted. The dedup scope is the **user**
     (unique `(user_id, listing_id)` of KV-DB-009; Q-API-031 open — a per-radar scope would re-send across radars).
     Only radar origins claim: `instant`, `digest`, `starter`; `fav`, `number`, `deeplink`, `share` cards are logged in
     `bot_listing_messages` by the sender but do not enter the dedup set (spec; Q-DATA-013);
   - `release(User, Listing)` — deletes the claim when the send failed permanently before any message existed
     (Telegram `400`/`403`), so a later match can deliver; never after a message id exists;
   - `unseen(Builder $listings, User)` — excludes the delivered set and `listing_views` (resume starter, BR-API-089);
   - `repoint(Listing $from, Listing $to)` — called inside the KV-BE-136 merge transaction: `radar_deliveries` rows of
     `from` move to `to` unless the user already has `to` (then the older row is kept); unreleased
     `radar_pending_items` likewise (one per user); `bot_listing_messages.listing_id` moves to `to` so withdrawal edits
     still find the old messages.
3. `php artisan make:class Services/Delivery/DeliveryEligibility --no-interaction`: `check(User, Listing, ?Radar):
   ?string` — re-evaluated at claim time by the sender: listing still `active`; not hidden by the user; author not
   blocked; not excluded by the radar's hide rules; user not `blocked` by the access gate; chat reachable. Returns the
   reason or `null`. This closes the window between planning and sending (`15` §3.6 #8: a hide during digest assembly
   is applied to every item not yet claimed).
4. `php artisan make:command Radar/ResendDryRunCommand --no-interaction` (`radar:resend-dry-run --since=<ISO>
   [--limit-rate=]`): for every active radar, forward matches since `--since` (`ListingSearchService` with the radar
   filters, `first_seen_at ≥ since`) joined with `radar_deliveries` for the radar's user; prints the radars with a
   non-zero overlap (must be zero after the migration) and the would-be sends per hour for the window, compared with
   `--limit-rate` (the legacy daily rate, Q-BOT-034). Exit code 1 on any overlap. Read-only; safe on staging after
   rehearsals.
5. Retention: `radar_deliveries` rows are kept (ids only) after a listing's purge so a re-published flat is never
   re-sent — the KV-DB-028 decision; `bot_listing_messages` of purged listings go with KV-DB-028.

## Files

- `backend/app/Services/Delivery/DeliveryLedger.php`, `DeliveryEligibility.php` (new)
- `backend/app/Enums/Delivery/CardOrigin.php` (shared with KV-TG-022 — whoever lands first creates it)
- `backend/app/Console/Commands/Radar/ResendDryRunCommand.php` (new)
- `backend/tests/Feature/Delivery/DeliveryLedgerTest.php`, `backend/tests/Feature/Pgsql/Delivery/ClaimRaceTest.php`,
  `backend/tests/Feature/Radar/ResendDryRunCommandTest.php` (new)

## API contract

n/a (service and artisan command).

## Business rules

- Kept: BR-DATA-016 / BR-API-081 (a delivered listing is not delivered again), BR-API-080 / BR-BOT-049 (edit starter =
  not received), BR-API-089 (resume = unseen), BR-DATA-019 (merged ids keep resolving).
- Spec-tested (unknown): user-level scope (Q-API-031), which origins count (Q-DATA-013).

## Acceptance criteria

- Two concurrent `claim` calls for one (user, listing) return `true` exactly once.
- After a merge, a listing delivered under the merged id counts as delivered for the survivor, and withdrawal edits find
  the old message rows.
- `radar:resend-dry-run` returns zero rows on the synthetic migrated dataset of KV-QA-005 and exits `1` when one planted
  overlap exists.

## Tests

- `DeliveryLedgerTest`: `claim_true_once`, `fav_and_deeplink_cards_do_not_claim`, `delivered_resolves_aliases`,
  `release_allows_later_delivery`, `release_refused_after_message_exists`, `unseen_excludes_viewed_and_delivered`,
  `repoint_moves_claims_pending_and_messages`, `repoint_keeps_older_claim_when_user_has_both`,
  `eligibility_reasons` (dataset: withdrawn, hidden, author blocked, hide rule, access blocked, chat unreachable).
- `Pgsql/Delivery/ClaimRaceTest` (KV-QA-008): `concurrent_claims_one_winner`, `fanout_retry_sends_remaining_only`
  (`15` §3.5 #1: 2 of 5 claimed, retry claims the other 3, 5 rows total), `hide_during_digest_assembly`
  (`15` §3.6 #8), `merge_while_claiming` (`15` §3.6 #11 delivery half).
- `ResendDryRunCommandTest`: `zero_overlap_exit_zero`, `planted_overlap_exit_one`, `prints_rate_against_limit`.

## Edge cases

- Migrated delivered rows that point to a merged-away legacy id → resolved through `listing_aliases` (KV-DB-019 loads
  them; `delivered()` resolves).
- A user erased and re-created (new Telegram account) → new user id, empty set (erasure removed the old rows).
- A listing re-published after its purge with a new number (new flat by dedup) → not in the set; delivered as new.

## Security

- SEC-REQ-014 (sets are per user), SEC-REQ-015 (atomic claim), SEC-REQ-039 (rows listed in the erasure registry by
  KV-BE-111).

## Definition of done

Tests green (`make ci-backend`, `pgsql` group), the dry-run command documented in the KV-DB-026 runbook notes (PR
description), parity gate items ticked (`15` §4) for F-DELIVERY-005 (server part), docs and the feature row in `09`
updated, PR reviewed by the other developer.
