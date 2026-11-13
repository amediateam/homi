# KV-BE-136 — `MergeService` and `UnmergeService`: survivor, aliases, re-pointing, shadow log

| Field | Value |
| ----- | ----- |
| Status | TODO (survivor rule `PROPOSED` until Q-API-019) |
| Owner | Backend (track: development) |
| Complexity | L |
| Feature IDs | F-PIPELINE-003, F-LISTING-001 |
| Dependencies | KV-BE-135, KV-BE-018 (`ListingAliasWriter`, resolver), KV-DB-008, KV-DB-010 (personal lists), KV-BE-109 (delivered-set re-pointer); Q-API-019 |

## Goal

Two listings found to be one flat become one card in one transaction: a survivor is chosen by a fixed rule, the other
listing's number becomes an alias that keeps resolving to the survivor, its publications, price points, personal-list
rows and delivered-card references move to the survivor without duplicates, and every merge is shadow-logged with
enough detail that an operator can revert it within the revert window and get both listings back as they were.

## Legacy reference

- BR-API-048 / BR-DATA-019 (a merged id keeps resolving to the survivor; the client switches to the returned `id`),
  BR-API-047 («ещё N» sources on the card), BR-API-049 (publications feed history and counters), Q-API-019 (algorithm,
  survivor, reversibility unknown), ENT-024; `$KVADRO_ROOT/demo/app/src/features/listing/hooks/useListingLoader.js:47-58`.
- `10` §4.9 ("Merge: survivor selection, alias rows, re-pointing of personal-list rows and delivered-card references in
  one transaction"), §4.12 (`ListingsMerged`); `14` §4.2 alias rules (chains flattened, earliest personal row kept),
  V-RI-1, V-RI-2; `15` §3.5 #6 (`duplicate_changed` processed twice → one alias, rows re-pointed once), §3.6 #11 (merge
  while a user favourites the alias → one favourite on the survivor), §3.7 #7.
- `.ai/agents/listing-matching-engineer.md` rule 10 (shadow log, `revertable_until` = now + 7 days, one-click revert).

## Implementation

1. Read `.ai/agents/listing-matching-engineer.md` rules 1, 8, 10, 11, KV-BE-018, KV-DB-010 and the KV-QA-008
   concurrency kit. Tests first (`pgsql` group for the races).
2. Migration `create_listing_merges_table` (`php artisan make:model ListingMerge -mf --no-interaction`): `id` ULID,
   `survivor_id`, `merged_id`, `merged_number`, `tier`, `confidence`, `matcher_version`, `reasons jsonb`,
   `moved jsonb` (table → list of moved row keys), `decided_by` (`matcher`, `cli:<name>`, later ARM user id),
   `merged_at`, `revertable_until`, `reverted_at`, `reverted_by`, `revert_reason`.
3. `php artisan make:class Services/Matching/MergeService --no-interaction`: `merge(Listing $a, Listing $b,
   MergeContext $ctx): ListingMerge`, one transaction, both listings locked `FOR UPDATE` in id order (no deadlock):
   - Survivor rule (`PROPOSED`, Q-API-019): the listing with the smaller `number` (oldest public link) survives; a
     `taken_down` listing never survives (its partner is taken down too — BR-DATA-022); an active listing survives
     over a withdrawn one.
   - `ListingAliasWriter::record(merged.number, survivor, 'merge')` (flattens chains, refuses live numbers).
   - Re-point through registered `MergeRepointer`s (an interface; each module adds its own): Listings
     (`listing_publications`, `listing_price_events` — timeline merged by `at`, duplicates by `(at, kind)` dropped —,
     `source_listings.listing_id`, `listing_photos` of the merged listing kept only as references for erasure, not shown);
     Engagement (`favorites`, `listing_views` (max `last_viewed_at`, summed `view_count`), `hidden_listings`,
     `listing_votes`, keeping the earliest row on PK conflicts, `14` §4.2); Delivery (KV-BE-109: `radar_deliveries`
     union keeping the earliest, `radar_pending_items`, `bot_listing_messages.listing_id` so a later withdrawal edits
     every sent copy). Each repointer returns the moved keys, stored in `listing_merges.moved`.
   - Merged listing: `status = merged`, content kept until the revert window ends (then a scheduled
     `matching:finalize-merges` clears its PII like a purge — KV-DB-028 rules).
   - Survivor attributes: higher-trust values win; `first_seen_at` = min; counters recomputed; `owner_status` recomputed;
     `listing_market` marked stale.
   - After commit: `ListingsMerged(survivor, merged, mergeId)` → medians/market (KV-BE-139/140), landing data, radar
     ledger (KV-BE-109).
4. `php artisan make:class Services/Matching/UnmergeService --no-interaction`: `revert(ListingMerge, string $by, string
   $reason)` — only before `revertable_until` (after it → `MergeNotRevertable`); restores the merged listing (status
   back, alias row deleted — the number is again that listing's own number), moves back exactly the rows in `moved`
   that still exist (rows users created on the survivor after the merge stay), recomputes both listings, writes
   `reverted_*`, raises `ListingsUnmerged`; the pair is stored as `rejected` in `listing_match_candidates` so it is
   never proposed again.
5. Idempotency: `merge()` on an already merged pair returns the existing `ListingMerge`; a `duplicate_changed` hint
   processed twice produces one merge (`15` §3.5 #6).
6. Commands until ARM: `matching:merges --recent`, `matching:revert {merge} --reason=`.

## Files

- `backend/app/Services/Matching/{MergeService,UnmergeService,MergeContext}.php`, `backend/app/Contracts/Matching/MergeRepointer.php`,
  `backend/app/Services/Matching/Repointers/{ListingsRepointer,EngagementRepointer}.php`,
  `backend/app/Events/Matching/{ListingsMerged,ListingsUnmerged}.php`, `backend/app/Models/ListingMerge.php`,
  `backend/app/Console/Commands/Matching/{ListMerges,RevertMerge,FinalizeMerges}.php` (new)
- migration `create_listing_merges_table`
- `backend/tests/Feature/Matching/MergeServiceTest.php`, `UnmergeServiceTest.php`,
  `backend/tests/Feature/Pgsql/Matching/MergeConcurrencyTest.php` (new)

## API contract

n/a (internal). Visible effect on API-008: `GET /api/listings/<merged number>` → `200` with the survivor and its own
`id` (KV-BE-036); `sources[]` lists both listings' channels.

## Business rules

- BR-API-048, BR-DATA-019 (alias resolves forever, except a reverted merge where the number is a live listing again),
  BR-API-047 («ещё N»), BR-DATA-022 (a taken-down listing never resurfaces through a merge).
- `14` §4.2 (earliest personal row kept on conflict).

## Acceptance criteria

- After a merge, every public reference to the merged number (API-008, favourites, history, landing pins, `/media`
  paths) resolves to the survivor, and the merged listing appears nowhere in feed, count, map or matching.
- A user who had both listings favourited ends with one favourite on the survivor (earliest `created_at`).
- A revert inside the window restores both listings, their publications and the moved personal rows; a revert after
  the window is refused.
- Merging the same pair twice (two hints) produces one alias and one merge row.

## Tests

- `MergeServiceTest`: `smaller_number_survives`, `taken_down_never_survives`, `active_survives_over_withdrawn`,
  `alias_recorded_and_chain_flattened`, `publications_and_price_points_moved_without_duplicates`,
  `favourites_conflict_keeps_earliest`, `views_summed_and_latest_kept`, `votes_moved`, `delivered_set_union_keeps_earliest`
  (with KV-BE-109's repointer), `bot_messages_repointed_for_withdrawal_edits`, `events_after_commit`,
  `merge_twice_is_idempotent` (`15` §3.5 #6), `moved_keys_recorded`.
- `UnmergeServiceTest`: `revert_restores_listing_and_number`, `revert_moves_back_only_recorded_rows`,
  `rows_created_after_merge_stay_on_survivor`, `revert_after_window_refused`, `reverted_pair_never_reproposed`.
- `MergeConcurrencyTest` (`pgsql`, KV-QA-008): `merge_while_user_favourites_alias_one_favourite_on_survivor`
  (`15` §3.6 #11, both interleavings), `two_merges_sharing_a_listing_serialise_without_deadlock`.

## Edge cases

- Merging into a survivor that is itself merged meanwhile: resolve to the final survivor under the lock, then merge.
- A radar card already delivered for both listings: the delivered set keeps one row; both chat messages stay
  addressable for «Объявление снято» (KV-BE-137 → telegram track).
- The merged listing had photos and the survivor has none: the survivor adopts the merged listing's photos (references
  move, numbering appended) — `PROPOSED`, legacy unknown.
- A vote threshold reached on the merged listing before the merge: thresholds are re-evaluated on the survivor
  (KV-BE-043 inputs re-pointed).

## Security

- SEC-REQ-014 (re-pointing never moves a row to another user), SEC-REQ-015 (race-safe, unique keys hold), SEC-REQ-045
  (audit of merges that change labels shown about people — shadow log), SEC-REQ-039 (erasure registry: `listing_merges`
  holds no user ids; moved keys for user tables are listing-side keys plus user ids — included in the KV-BE-050
  registry by KV-BE-165).

## Definition of done

Tests green (`make ci-backend`, `pgsql` group), V-RI-1/V-RI-2 style checks pass on synthetic data, revert procedure in
`docs/api/intake.md` (operations), `09` rows F-PIPELINE-003 and F-LISTING-001 updated, PR reviewed by the other
developer.
