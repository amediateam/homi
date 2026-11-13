# KV-BE-135 — `DuplicateMatcher`: killer words, tiers, price gate, review queue

| Field | Value |
| ----- | ----- |
| Status | TODO (thresholds `PROPOSED` until Q-API-019 / OPQ-1 and the golden set; `pg_trgm` in staging/production needs the production track **[PT]**) |
| Owner | Backend (track: development) |
| Complexity | L |
| Feature IDs | F-PIPELINE-003 |
| Dependencies | KV-BE-134 (published listings), KV-BE-127 (photo dHash); Q-API-019 (OPQ-1) |

## Goal

After a listing is published or updated, a deterministic-first matcher looks for the same flat among recent active
listings and decides per candidate: merge automatically only on deterministic evidence (confidence ≥ 95, shadow-logged
and reversible), send probable duplicates to a review queue (70–94), and leave everything else alone — because a false
merge is worse than a missed duplicate. Thresholds live in config and are calibrated on a golden set.

## Legacy reference

- BR-API-047 (one flat = one card across channels and reposts; detected by photos, text and parameters — rooms, floor,
  district, price; the card shows «ещё N»), BR-DATA-020 (reposts attach to the same listing), BR-SEO-029 (methodology:
  «дубли сопоставляются по фото, тексту и параметрам»), Q-API-019 (algorithm, survivor, reversibility unknown),
  `$KVADRO_ROOT/docs/about.md:156`, `:177`; `$KVADRO_ROOT/docs/seo-pages.md:250-251`.
- GAP-005, OPQ-1 (`10` §1.14: behaviour known, thresholds not); `telegram.uz` provisional weights
  (`docs/api/intake-sources.md`: embedding .28, phash .22, geo .15, phone .10, price .10 …) — reference only.
- `.ai/agents/listing-matching-engineer.md` rules 1–15.

## Implementation

1. Read `.ai/agents/listing-matching-engineer.md` (all rules) and `.ai/agents/postgis-geo-engineer.md` rule 6
   (`pg_trgm` GIN). Tests first; PostgreSQL-only parts in the `pgsql` group.
2. Migration (`pgsql`): `CREATE EXTENSION IF NOT EXISTS pg_trgm` (local/CI; staging/production enablement **[PT]**);
   column `listings.match_text` (cleaned description, step 3) with a GIN `gin_trgm_ops` index `CONCURRENTLY`; table
   `listing_match_candidates` (`php artisan make:model ListingMatchCandidate -mf --no-interaction`): `id` ULID,
   `listing_id`, `candidate_listing_id`, `tier`, `confidence smallint`, `reasons jsonb` (codes), `matcher_version`,
   `status` (`pending`, `accepted`, `rejected`, `superseded`), `decided_by`, `decided_at`, unique pair (ordered ids).
3. `php artisan make:class Services/Matching/TextCleaner --no-interaction` — order fixed by agent rule 3: entity
   extraction first (rooms, area, floor, price already structured), then stop-words (ru/uz intent phrases «срочно»,
   «sotiladi», «ijaraga beriladi», «в Ташкенте», «Toshkentda», «новый», «yangi»; list in
   `config/matching.php`), uz-Cyrl → uz-Latn transliteration, HTML strip, NFC, lowercase, whitespace collapse;
   placeholders of masked phones removed.
4. `php artisan make:class Services/Matching/DuplicateMatcher --no-interaction`: `findFor(Listing): MatchDecision`.
   Pipeline order (rule 2): cleanup → killer words → tier 1 → tier 2 → tier 3 → price gate → routing. Candidates:
   active (and withdrawn < 90 days, not purged) listings of the same city, same `deal` + `rent_period`, same
   `property_type`, `first_seen_at` within `config('matching.window_days')` (60 `PROPOSED`).
   - **Killer words** (rule 4) block before similarity: deal (`аренда/ijara` vs `продажа/sotuv`), type (`комната/xona`
     vs `квартира/kvartira` vs `дом/uy` vs `участок/uchastka` vs `коммерческая/tijorat`), `посуточно/kunlik` vs long.
   - **Tier 1 (100)**: forwarded/reposted message with the same `forward_from (channel, post_id)` as a publication of
     the candidate; or same `phone_hmac` + identical cleaned-text hash (a repost by the same author); or identical
     photo set (all dHashes within distance ≤ 4) + same price + same rooms.
   - **Tier 2 (90)**: same district + same rooms + area ±3 % + floor and floors equal when both present + price ±10 %
     + (same `phone_hmac` or ≥ 2 shared photo dHashes) — exactly one candidate → review; two or more → review with all.
   - **Tier 3 (85)**: `similarity(match_text) ≥ 0.85` among same district + rooms, top 5, passing the price gate →
     review.
   - **Price gate** (rule 9): rent difference > 15 %, sale > 10 % → never auto-merge, review with both prices; only
     tier 1 overrides.
   - **Routing** (rule 8): ≥ 95 → `MergeService::merge()` (KV-BE-136) with shadow log; 70–94 → review queue; < 70 →
     nothing. All thresholds in `config/matching.php`; `matcher_version` stamped on every decision.
5. Job `php artisan make:job Matching/MatchDuplicates --no-interaction` (queue `ingest`, unique per listing, after
   `ListingPublished`/`ListingUpdated` and after photo copy completes — a second pass when photos arrive).
6. Review without ARM: `php artisan make:command Matching/ReviewCandidates --no-interaction` → `matching:review
   {--list} {--accept=} {--reject=}`; accept calls `MergeService` with `decided_by = cli:<name>`. The ARM screen is M9.
7. Benchmark: `matching:benchmark {--set=}` over `tests/Fixtures/matching/*.jsonl` (labelled pairs; ≥ 200 synthetic
   now, ≥ 1 000 from migrated data later — legacy aliases give positive pairs, `14` §2.1): precision, recall@5,
   confusion matrix; targets precision ≥ 95 %, recall@5 ≥ 90 % (rule 12). Budget ≤ 500 ms per listing online (rule 13)
   — measured in the benchmark.

## Files

- `backend/app/Services/Matching/{TextCleaner,DuplicateMatcher,KillerWords}.php`, `backend/app/Domain/Matching/MatchDecision.php`,
  `backend/app/Jobs/Matching/MatchDuplicates.php`, `backend/app/Console/Commands/Matching/{ReviewCandidates,BenchmarkMatcher}.php`,
  `backend/app/Models/ListingMatchCandidate.php` (new)
- migrations `enable_pg_trgm_and_add_match_text`, `create_listing_match_candidates_table`; `backend/config/matching.php` (new)
- `backend/tests/Fixtures/matching/synthetic.jsonl`, `backend/tests/Unit/Matching/{TextCleanerTest,KillerWordsTest}.php`,
  `backend/tests/Feature/Pgsql/Matching/DuplicateMatcherTest.php`, `backend/tests/Feature/Matching/ReviewCandidatesTest.php` (new)

## API contract

n/a (internal; review through commands until ARM).

## Business rules

- BR-API-047, BR-DATA-020 (reposts → one card), BR-SEO-029 (photos, text, parameters remain the declared signals).
- HOMI choice recorded in the PR: tier-2 probable duplicates are reviewed, not auto-merged (agent rule 6); if the
  benchmark shows precision ≥ 95 % for tier 2, config can lower `auto_merge_min` — a product decision, no DEV because
  the legacy thresholds are unknown (Q-API-019).

## Acceptance criteria

- Each killer word pair blocks a merge regardless of similarity.
- A forwarded post of a known publication merges automatically (tier 1) and is shadow-logged.
- A tier-2 pair lands in review, never auto-merged with default config.
- A ±20 % price pair is never auto-merged (price gate) even with identical photos unless tier 1 applies.
- The synthetic benchmark reports precision ≥ 95 % on the committed set.

## Tests

- `KillerWordsTest`: dataset over deal, type and period pairs in ru, uz-Latn, uz-Cyrl.
- `TextCleanerTest`: `stopwords_removed_after_entities`, `cyrl_transliterated`, `phone_placeholders_removed`.
- `DuplicateMatcherTest` (`pgsql`): `forward_of_known_post_tier1_auto_merges`, `same_phone_same_text_repost_tier1`,
  `identical_photos_same_price_rooms_tier1`, `tier2_single_candidate_goes_to_review`, `tier2_two_candidates_review_all`,
  `tier3_trgm_085_review`, `price_gate_rent_15_percent`, `price_gate_sale_10_percent`, `killer_word_blocks_before_similarity`,
  `different_district_never_tier2`, `withdrawn_candidate_within_90_days_considered`, `purged_candidate_ignored`,
  `thresholds_from_config`, `matcher_version_recorded`, `second_pass_after_photos`.
- False-merge cases (hard negatives): `same_building_different_floor_not_merged`, `same_agent_phone_two_flats_not_merged`
  (agent phones post several flats — phone equality alone is never enough), `same_photos_stock_image_different_price_review`.
- `ReviewCandidatesTest`: `accept_merges_via_service`, `reject_marks_pair_never_reproposed`.

## Edge cases

- An agency posting stock photos for many flats: identical photos with different floors/areas → killer-free but tier-1
  photo rule requires same price + rooms; floor mismatch sends to review, never auto.
- Chains: A≈B and B≈C proposed separately; accepting both merges into one survivor (KV-BE-136 flattens).
- A candidate merged meanwhile (status `merged`): the pair is re-pointed to the survivor or marked `superseded`.
- `datahub_uz` canon later: its `property_hint` overrides HOMI's matching (ADR-0009 §6) — hook left as a config flag.

## Security

- SEC-REQ-045 (merges change what users see about a flat — audit trail via shadow log and review decisions),
  SEC-REQ-047 (reasons are codes, no text). No embeddings/pgvector — that would be "PROPOSED — needs approval
  (dependency change)".

## Definition of done

Tests green (`make ci-backend`, `pgsql` group), benchmark output (confusion matrix) pasted in the PR (agent rule 12),
`pg_trgm` enablement request recorded for the production track, `09` row F-PIPELINE-003 updated, PR reviewed by the
other developer.
