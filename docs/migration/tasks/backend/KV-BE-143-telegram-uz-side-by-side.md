# KV-BE-143 — Side-by-side run of `telegram.uz` against the in-repo reader and the source switch

| Field | Value |
| ----- | ----- |
| Status | BLOCKED (GAP-027: `telegram.uz` has no push to HOMI and is not confirmed in production; DEC-02) |
| Owner | Backend (track: development); collector-side work outside this repository (`telegram.uz` owner); production runs **[PT]** |
| Complexity | M |
| Feature IDs | F-PIPELINE-001 |
| Dependencies | KV-BE-125 (in-repo reader), KV-BE-123 (intake events and reconciliation); GAP-027, DEC-02; Q-DATA-045 |

## Goal

When `telegram.uz` can push, HOMI compares it with its own reader on the same channel list for a fixed period —
coverage, freshness, field agreement and duplicate behaviour — in shadow mode (nothing from the shadow source is
published), produces a report against agreed thresholds, and can then switch the active source per channel group by
configuration, without changing the pipeline (CF-007 option C → A).

## Legacy reference

- `10` §3.8 option C ("a shadow run compares `telegram.uz` with B on the same channel list; switch the active source
  when it matches"; "switching to `telegram.uz` (A) then means activating another source, not changing the pipeline"),
  data items 2 (freshness baseline) and 3 (dated commitment from the `telegram.uz` owner), GAP-027 (outbox, payload
  with text, gated phones, photos, post ids, the 217-channel import, `rent_period`), `docs/api/intake-sources.md`
  ("What `telegram.uz` must add to push to HOMI"), `14` §2.1 option C (attach by `(channel, post_id)`), Q-DATA-045.
- Collector facts (reference-reader, 2026-11-08): `telegram.uz` reads over MTProto, parses with rules + an Anthropic
  LLM fallback, has no push and is not confirmed in production.

## Implementation

1. Read the KV-BE-120 ADR, `docs/api/intake-sources.md`, KV-BE-125, KV-BE-130 (benchmark — parsing differences of the
   Anthropic parser are scored there). Tests first with two synthetic sources.
2. Source modes: `sources.mode` (`active`, `shadow`, `inactive`) — additive column (`php artisan make:migration
   add_mode_to_sources_table --no-interaction`); `IntakeAcceptService` stores and parses shadow events normally but
   `ListingIngestService` (KV-BE-134) writes them to `shadow_listings` (`source_listing_id`, normalised fields jsonb,
   geo, matched publication id, `computed_at`) instead of publishing. Per-channel override:
   `source_channels.active_source_id` (which source publishes this channel's posts).
3. `php artisan make:class Services/Intake/SideBySideComparator --no-interaction`: for a period and channel set, joins
   both sources on `(channel, post_id)`:
   - coverage: posts seen by A only, B only, both;
   - freshness: per post, `received_at` difference and each source's post-to-receive latency (p50/p95) against the
     legacy baseline of KV-BE-142;
   - field agreement on normalised fields (deal, period, price USD, rooms, area, floor, district) with the tolerances
     of KV-BE-130;
   - photos: count and sha256/dHash agreement;
   - phones: equality of HMACs computed by HOMI from both payloads (the collector's own HMACs are opaque, ADR-0009).
4. `php artisan make:command Intake/SideBySideReport --no-interaction` → `intake:side-by-side {--from=} {--to=}
   {--channels=}` writes a JSON + Markdown report (counts only). Switch criteria (`PROPOSED`, written into the ADR):
   coverage ≥ 99 % of B's posts, p95 freshness no worse than B by > 2 min, field agreement ≥ 97 % on core fields,
   photo availability ≥ 98 %, for 14 consecutive days.
5. `php artisan make:command Intake/SwitchActiveSource --no-interaction` → `intake:switch-source {source} {--channels=}
   {--dry-run}`: flips `active_source_id` for the channels, sets the other source to `shadow` for them; publications
   keep attaching by `(channel, post_id)` so listings and numbers do not change; reversible by the same command.

## Files

- `backend/app/Services/Intake/SideBySideComparator.php`, `backend/app/Models/ShadowListing.php`,
  `backend/app/Console/Commands/Intake/{SideBySideReport,SwitchActiveSource}.php` (new)
- migrations `add_mode_to_sources_table`, `add_active_source_to_source_channels_table`, `create_shadow_listings_table`
- `backend/tests/Feature/Intake/ShadowSourceTest.php`, `backend/tests/Feature/Intake/SideBySideComparatorTest.php` (new)

## API contract

n/a for HOMI clients. The collector uses the existing intake API (KV-BE-122/123) with its own token; the shadow mode
is invisible to it (same `202` responses).

## Business rules

- BR-DATA-020 (one listing per `(channel, post_id)` whatever the source), BR-API-042 / BR-SEO-029 (the methodology
  statement «через публичные страницы без подписки» changes if MTProto reading becomes the active method — product
  owner decision recorded in the ADR), BR-DATA-022 (opt-outs apply to every source).

## Acceptance criteria

- With source B active and A in shadow, A's posts create no listing, no event for radars and no change in public
  surfaces; the report counts them.
- Switching channel group X to A keeps every existing listing number and attaches A's next post of a known
  `(channel, post_id)` to the same listing.
- The report shows coverage, freshness and agreement figures with the thresholds and a pass/fail line.

## Tests

- `ShadowSourceTest`: `shadow_events_not_published`, `shadow_events_parsed_and_stored`, `switch_keeps_listing_numbers`,
  `switch_is_reversible`, `dry_run_changes_nothing`, `opt_out_applies_to_shadow_source`.
- `SideBySideComparatorTest`: `coverage_counts`, `freshness_percentiles`, `field_agreement_with_tolerances`,
  `photo_agreement_by_hash`, `phone_agreement_by_homi_hmac`, `report_pass_fail_against_thresholds`.

## Edge cases

- Multi-lot posts split by `telegram.uz` (`segment_index`) versus one post from the reader: compared at post level;
  segments reported separately (CF-016 contract note in KV-BE-121).
- `telegram.uz` sends parsed hints that disagree with HOMI's parser: HOMI's parser decides (`10` §3.8 "Where parsing
  happens"); disagreement is part of the report.
- MTProto account bans on the collector side: coverage drops; the switch criteria fail and B stays active.

## Security

- SEC-REQ-034 (separate tokens per source and environment), SEC-REQ-036 (raw phones only through the PII gate),
  SEC-REQ-047 (reports hold counts only). No reading of the `telegram.uz` database or code from this repository —
  facts only through the read-only reference agent (CLAUDE.md).

## Definition of done

Tests green (`make ci-backend`), the first real report attached to the DEC-02 follow-up, switch criteria recorded in
the acquisition ADR, `09` row F-PIPELINE-001 updated, PR reviewed by the other developer.
