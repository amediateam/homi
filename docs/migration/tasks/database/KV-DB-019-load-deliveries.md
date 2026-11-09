# KV-DB-019 — Load delivered cards and pending deliveries

| Field | Value |
| ----- | ----- |
| Status | BLOCKED (legacy schema) |
| Owner | Backend (track: development) |
| Complexity | M |
| Feature IDs | F-DELIVERY-005, F-DELIVERY-006, F-DELIVERY-004 |
| Dependencies | KV-DB-016, KV-DB-018; Q-DATA-013, Q-DATA-014 |

## Goal

The full legacy delivered-card log is in HOMI — `bot_listing_messages` keeps every `(chat_id, message_id, listing)` so
a later takedown can edit the old cards to «Объявление снято», `radar_deliveries` holds one row per (user, survivor
listing) so radars never re-send what a user already received, and items gathered for a digest or held by quiet hours
before the switch reach the next HOMI digest exactly once — proven by V-SUM-3, V-RI-4 and a re-send dry-run returning
zero rows.

## Legacy reference

- ENT-010, ENT-011 (`06` §2.2); scope `14` §2 (delivered-card log mandatory; pending delivery migrate if a queue exists,
  else rebuild from last-digest timestamps); ids `14` §3 (sent card natural key `(chat_id, message_id)` preserved); load
  order `14` §7.3 step 5.
- Rules `14` §4.2 rows Delivered card and Pending delivery; validation `14` §6.2 V-SUM-3, §6.3 V-RI-4, §6.5 "Radars do
  not re-send" dry-run; cut-over `14` §7.6 (final delta taken after the legacy jobs stopped, so the last deliveries are
  included).
- `$KVADRO_ROOT/docs/about.md:430` (the delivered-card log must migrate; `14` §2 ENT-010), `:425-440`.
- Questions: Q-DATA-013 (log keys, origins, retention, size), Q-DATA-014 (stored queue or recomputation,
  `last_digest_sent_at`), Q-BOT-002, Q-BOT-003, Q-BOT-034 (legacy daily send rate).
- BR-DATA-016, BR-DATA-019, BR-API-066 (edits on withdrawal), BR-API-079/080 (only new listings after creation/edit).

## Implementation

1. Read `14` §4.2, §6.5, `06` §4.2 rows `bot_listing_messages`, `radar_deliveries`, `radar_pending_items`,
   `.ai/agents/telegram-bot-engineer.md` (delivery and pacing) and `.ai/agents/postgis-geo-engineer.md` (partitioned
   tables, rule 5).
2. `make:class Services/Migration/Loaders/DeliveredCardLoader --no-interaction`: each legacy sent card →
   `bot_listing_messages(chat_id, message_id, user_id, listing_id, radar_id, origin, sent_at, state, edited_at,
   legacy_listing_number)` where `legacy_listing_number` = the **original** legacy number and `listing_id` = the
   alias-resolved survivor (KV-DB-016); conflict key `(chat_id, message_id, listing_id)`; `sent_at` in UTC; rows land in
   the monthly partitions created by KV-DB-035 (the loader asks the partition manager to ensure every month present in
   the stage data before the first batch).
3. `RadarDeliveryLoader`: one `radar_deliveries` row per (user, survivor listing) with the earliest `sent_at` and its
   radar as `first_radar_id`; conflict key `(user_id, listing_id)` keeps the earliest.
4. `PendingDeliveryLoader`: if Q-DATA-014 shows a stored queue, copy items not yet released into `radar_pending_items`
   and recompute `release_at` from the user's HOMI settings in Asia/Tashkent (quiet window end or next digest hour);
   if no queue exists, write `last_digest_sent_at` per user so HOMI's first digest covers "matches since then minus
   `radar_deliveries`".
5. Cards whose radar was merged as a twin (KV-DB-018) point at the survivor radar through `legacy_id_map`; cards of
   radars excluded or erased keep `radar_id = null` (the message stays addressable for takedown edits).
6. Re-send dry-run: `php artisan make:command Migration/DeliveryDryRun --no-interaction` runs the HOMI matching function
   of M4 (`radar_matches(radar_id, since)` — named in `14` §6.5; until M4 exists the command uses the
   `ListingSearchService` predicate of KV-BE-023 with each radar's filters) with sending disabled and prints, per radar,
   the would-be sends that are already in `radar_deliveries` (must be zero) and the would-be sends per hour (compared
   with the legacy daily rate, Q-BOT-034).
7. Run on R0; attach counts per origin, exclusions by reason and the dry-run output to the PR.

## Files

- `backend/app/Services/Migration/Loaders/{DeliveredCardLoader,RadarDeliveryLoader,PendingDeliveryLoader}.php`
- `backend/app/Console/Commands/Migration/DeliveryDryRun.php`
- `backend/tests/Feature/Migration/Deliveries/*Test.php`, `backend/tests/Fixtures/Migration/stage_deliveries.sql`

## API contract

No legacy HTTP endpoint exposes the log. Observable contract (bot side, `04` §5): after the switch, no listing already
delivered to a user is delivered again by any of the user's radars (BR-DATA-016); a takedown or withdrawal of a listing
delivered before the switch edits the legacy messages to «Объявление снято» (BR-API-066, F-DELIVERY-006); a digest due
right after the switch contains each pending item once (F-DELIVERY-004). `GET /api/subscriptions` previews are not
affected.

## Business rules

- Kept: BR-DATA-016 (no re-delivery; cards addressable by `(chat_id, message_id)`), BR-DATA-019 (merged numbers resolve
  to the survivor), BR-DATA-014 and BR-API-084 (quiet/digest wall-clock in Asia/Tashkent), BR-API-079/080.
- Defect fixes (`APPROVED`): none specific; the `legacy_listing_number` column keeps evidence for LB-DATA-019-style
  audits.
- `PROPOSED`: DEV-009 (twin merge) only through `legacy_id_map` from KV-DB-018; the optional cap on instant cards per
  radar per hour (DEC-20, SEC-REQ-029) is not applied to migrated data.

## Acceptance criteria

- V-SUM-3 (delivered set as `(telegram id, listing number)`) equals the expected set from `legacy_stage` after alias
  resolution; V-RI-4 returns zero for both queries.
- The re-send dry-run returns zero rows already delivered; would-be sends per hour are within the legacy daily rate.
- Every `bot_listing_messages` row keeps its legacy `(chat_id, message_id)` and original listing number.
- A re-run writes zero rows.

## Tests

`backend/tests/Feature/Migration/Deliveries/` (`pgsql` group, synthetic stage, frozen clock):
- `AliasResolvedDeliveryTest` — a card sent for alias 100 (merged into 200) → message row with
  `legacy_listing_number = 100`, `listing_id` = listing 200; `radar_deliveries` has one row for (user, 200).
- `EarliestDeliveryWinsTest` — two cards for the same (user, listing) from two radars → one `radar_deliveries` row with
  the earliest `sent_at`.
- `PartitionsEnsuredTest` — cards from three months land in three monthly partitions created before the batch.
- `PendingQueueTest` — quiet `23-08`, item matched 20:00 UTC → `release_at` 03:00 UTC (08:00 Tashkent).
- `LastDigestFallbackTest` — no queue in stage → `last_digest_sent_at` set; the first digest query excludes delivered
  listings.
- `DryRunZeroResendTest` — every migrated radar's matches minus deliveries; a planted extra delivery row is detected
  (validator: KV-QA-018).
- `DeliveriesRerunTest` — zero writes on the second run.

## Edge cases

- Users who blocked the bot (`bot_chat_state = blocked`): log migrated; no dry-run sends counted for them.
- Messages older than any retention the legacy kept: whatever exists is migrated; `bot_listing_messages` retention until
  the listing purge applies afterwards (SEC-REQ-038, KV-DB-028).
- Cards sent outside radars (starter list, `/fav`, deep link — origins per Q-DATA-013): kept with their `origin`, not
  added to `radar_deliveries` unless the origin is a radar delivery.
- Erased users: excluded at extract; their message rows are not migrated.

## Security

- SEC-REQ-039 (erasure covers delivered cards; replay after load, KV-DB-027), SEC-REQ-038 (retention of the log),
  SEC-REQ-041 (handling), SEC-REQ-029 (the dry-run never sends — the Bot API is faked or disabled).
- `chat_id` equals the Telegram user id for private chats: it is personal data — reports print counts, never chat ids.

## Definition of done

Tests green (`make ci-backend` / `make ci-frontend`), parity gate items ticked (15 §parity gate), docs and the feature
row in 09 updated, PR reviewed by the other developer. In addition: R0 run on the masked sample green with a zero-row
dry-run, the run report reviewed by the developer, `06`/`14` updated with the confirmed facts (Q-DATA-013, Q-DATA-014).
