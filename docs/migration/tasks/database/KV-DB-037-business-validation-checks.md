# KV-DB-037 — Business-level and API-level validation checks

| Field | Value |
| ----- | ----- |
| Status | BLOCKED (dump, test account P14) |
| Owner | Backend (track: development) |
| Complexity | M |
| Feature IDs | Technical migration task — business proof of the migrated features F-RADAR-001, F-DELIVERY-005, F-FAV-001, F-HIDE-001, F-HIDE-002, F-SHARE-002, F-OWNER-002, F-SEO-006, F-PIPELINE-005, F-ANALYTICS-002, F-SETTINGS-001, F-LISTING-001 |
| Dependencies | KV-DB-022, M2 and M3 endpoints |

## Goal

The checks that compare migrated data through behaviour rather than rows run as one command: the 1 % sampled
field-level comparison (`14` §6.4 DB level), the 300-listing API diff between legacy and HOMI (§6.4 API level), and the
ten business checks of §6.5; each result lands in the same run report as KV-DB-022.

## Legacy reference

- `14` §6.4 (DB-level: 1 % per entity, minimum 200 rows, every difference explained by `migration_changes`; API-level:
  300 sampled listing ids stratified by deal, status and city incl. merged ids and `post_deleted`, fetched from legacy
  before the switch and from HOMI's legacy route, allowed differences: `call_url` token, photo URL signatures,
  `median_*` within tolerance, `stats.views`), §6.5 (radar counts, re-send dry-run, favourites resolvable, hidden and
  blocked effective, public links resolve, owner badges, index CSV, medians, analytics ids, settings), §6.6 tolerances.
- `14` §1.1 P14 (owner-approved test account; never a real user's `initData`); `15` §1.6 (read-only recording rules:
  `GET` only, ≤ 1 request/s, sanitising) and §3.7.
- Rules: BR-DATA-016, BR-DATA-019, BR-DATA-021, BR-DATA-023, BR-DATA-026; LB-API-009 (key presence).

## Implementation

1. Read `.ai/agents/security-reviewer.md` and `.claude/skills/testing-best-practices/`.
2. `php artisan make:command --no-interaction Migration/ValidateBusinessCommand` (`migration:validate-business
   --run=<id> [--check=…]`), with one check class per row of §6.4–§6.5 implementing the KV-DB-022 `ValidationCheck`
   interface so results share the report.
3. DB-level sample: for each entity, a seeded random sample (seed recorded in the run) of max(1 %, 200) legacy rows;
   apply the step's transform function to the stage row and diff with the HOMI row; unexplained differences fail.
4. API-level diff: a `LegacyApiProbe` client that sends `GET` only to the legacy API with the test account's `initData`
   read from an environment variable set for one session (never stored or logged), at ≤ 1 request/s, and to HOMI's
   legacy route on staging with an `initData` minted for the same Telegram id by the staging bot; both responses are
   sanitised in memory (`15` §1.6 list) and diffed with the allowed-differences mask; only the diff summary is written.
   **Needs developer approval: touches production** — without it the check is reported `skipped`, never `pass`.
5. Business checks: radar match counts via `GET /api/feed/count` for every distinct active-radar filter set (legacy vs
   HOMI, ≤ 1 request/s), re-send dry-run (HOMI matching with sending disabled joined against `radar_deliveries`),
   favourites resolvable for 50 sampled users (staging impersonation only), 0 leaks of hidden or blocked items in feed
   and map for 50 users, every listing id of the last landing snapshot and 500 SEO card links resolves (`200` or the
   survivor), owner-badge count equal, index CSV byte-equal for frozen periods (from KV-DB-021), medians within
   tolerance (from KV-DB-021), `meta.analytics.id` equal for 50 users, `GET /api/settings` legacy strings for sampled
   users.
6. Each check states its oracle and whether it is `spec-tested` (`15` §1.1) in the report.

## Files

- `backend/app/Console/Commands/Migration/ValidateBusinessCommand.php` (new)
- `backend/app/Services/Migration/Validation/Business/*.php` (new, one per check)
- `backend/app/Services/Migration/Validation/LegacyApiProbe.php` (new)
- `backend/tests/Feature/Migration/BusinessValidationTest.php` (new; legacy API faked with `Http::fake`)

## API contract

Compared shapes: API-008 `ListingDetails` (all strict keys, integer `id`, survivor for merged ids), API-005 `{count}`,
API-029 `{items, next_cursor: null}`, API-001 `analytics.id`, API-024 settings strings (`uz_Latn`, `quiet`, `digest`),
API-026 hidden lists; the allowed differences are exactly those of `14` §6.4.

## Business rules

BR-DATA-016 (no re-send), BR-DATA-019 (merged ids resolve), BR-DATA-021 (analytics ids byte-equal), BR-DATA-023
(published index unchanged), BR-DATA-026 (median rules), BR-DATA-013 (settings). Differences caused by an approved DEV
are allowed only with the DEV id in the mask; a `PROPOSED` DEV is reported, not masked.

## Acceptance criteria

- Every row of `14` §6.4–§6.5 has a check class and appears in the report (coverage test).
- Re-send dry-run, favourites resolvable, hidden/blocked leaks and public links are zero-tolerance; medians and tones
  follow `14` §6.6.
- No request other than `GET` is ever sent to the legacy API; the rate stays ≤ 1 request/s.
- Nothing from the legacy responses is written except the sanitised diff summary.

## Tests

- `api diff masks call_url token and photo signatures and flags any other difference` (faked legacy and HOMI).
- `missing strict key on HOMI fails the API diff` (LB-API-009).
- `merged id returns the survivor on both sides`.
- `probe refuses non-GET methods and throttles to 1 request/s` (fake clock).
- `probe never logs or stores the initData` (log capture scan).
- `without production approval the API check reports skipped`.
- `re-send dry-run fails on a planted delivered listing` (with KV-QA-018).

## Edge cases

- The test account sees only its own personal data: per-user checks run on staging impersonation, never against
  legacy for other users.
- Legacy and HOMI see the same frozen data only inside the freeze; outside it counts may differ by new listings —
  checks record the watermark and run at the frozen moment for exact counts.
- Legacy rate limits (Q-API-001) hit by the probe: back off and report partial coverage, never fail open.

## Security

SEC-REQ-003 (test `initData` only in memory, fingerprinted in logs), SEC-REQ-041 (no production data on laptops or in
CI artefacts; diff summaries only), SEC-REQ-047 (no PII in logs); production calls need the developer's approval each
run (`15` §1.6).

## Definition of done

Tests green (`make ci-backend`), parity gate items ticked (15 §4), docs and the feature rows in 09 updated, PR reviewed
by the other developer. The checks ran in R1 (skipped ones listed with the reason) and in R2/R3 with all zero-tolerance
checks green.
