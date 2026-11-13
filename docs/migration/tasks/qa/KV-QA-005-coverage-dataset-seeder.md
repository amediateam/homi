# KV-QA-005 — Legacy-shaped coverage dataset seeder

| Field | Value |
| ----- | ----- |
| Status | BLOCKED (domain models of KV-DB-007 … KV-DB-010; step 1 can start now) |
| Owner | QA (track: development) |
| Complexity | M |
| Feature IDs | Technical migration task — test data. Serves F-FEED-001, F-FILTER-001, F-LISTING-001, F-PIPELINE-003, F-PIPELINE-006, F-RADAR-002, F-ACCESS-002 |
| Dependencies | KV-DB-007, KV-DB-008, KV-DB-009, KV-DB-010 (models and factories); KV-DB-006 (dictionaries) |

## Goal

A deterministic, synthetic dataset contains at least one record for every enum value and edge case the legacy
contract and data model know, so that contract, consistency and reference-client tests never pass only because the
data was too simple.

## Legacy reference

- Enums and per-deal rules: `08` §1.7 (25 filter keys), BR-API-028 (types per deal), BR-API-029, BR-API-030,
  ENT-049 … ENT-052 (`06`).
- Listing shapes and edges: `08` §1.8, ENT-023 … ENT-036; merged ids (ENT-024, LB-API-011), `post_deleted`, video,
  withdrawn and purged listings (Q-API-023), down payment (`price_kind`).
- Cities: six cities, Tashkent districts and zones (`10` OPQ-3, ENT-042 … ENT-044).
- Access states: `private`, `invite`, `full`, `blocked`, `join` (ENT-003, BR-API-012).
- Radars before the `zone` → `zones` change (Q-API-013, `08` §1.7).

## Implementation

1. Write the manifest `backend/tests/Fixtures/Legacy/coverage-dataset.json`: required cases with a short id, the
   entity, the attribute values and the evidence (for example `listing.merged-alias`, `listing.uzs-posted`,
   `user.state.blocked`, `radar.legacy-zone`). This step needs no models.
2. Read `.claude/skills/laravel-testing/` (factories and states).
3. Write `backend/database/seeders/Testing/LegacyCoverageSeeder.php` using the factories of KV-DB-007 … KV-DB-010 with
   fixed numbers (listing `number`, radar `number`, CF-003) so tests can reference records; fixed Faker seed; no
   `now()` — timestamps relative to a constant test instant.
4. Coverage: every deal × allowed type; with and without coordinates; 0, 1 and 10 photos; median present and absent
   with each `median_tone`; each `nearby` kind; owner verified and not; author by phone and by channel; listing
   active, withdrawn (< 90 days), purged (> 90 days), taken down, merged (alias → survivor), `post_deleted`, with
   video; UZS-posted price; users in each access state; settings with each quiet and digest preset and each locale
   and currency; one radar per mode, one paused, one at the 10-radar limit; a radar migrated from the pre-`zones`
   shape.
5. Write `backend/tests/Feature/Pgsql/CoverageDatasetTest.php`: seeds, then asserts every manifest case exists.

## Files

- `backend/tests/Fixtures/Legacy/coverage-dataset.json` (new)
- `backend/database/seeders/Testing/LegacyCoverageSeeder.php` (new)
- `backend/tests/Feature/Pgsql/CoverageDatasetTest.php` (new)

## API contract

n/a (data). The dataset makes every field of `08` §1.8 reachable with a non-trivial value.

## Business rules

BR-API-028, BR-API-029, BR-API-030, BR-API-033 (`posted_days`), BR-DATA-017 (uniqueness per user and listing).

## Acceptance criteria

- The manifest lists every enum value of `08` §1.7 and every edge of step 4, each with evidence.
- The seeder runs twice into a clean database with identical row fingerprints (deterministic).
- `CoverageDatasetTest` is green on PostgreSQL.

## Tests

`CoverageDatasetTest`; a determinism test comparing two seeding runs.

## Edge cases

- Phone numbers use the `+998 00` placeholder range; two listings share one phone to test author blocking.
- Merged alias numbers never collide with live numbers (V-RI-2 in `14`).
- Timestamps around the Tashkent midnight for the time cases of KV-QA-006.

## Security

Synthetic only; no legacy sample is loaded by this seeder (SEC-REQ-041).

## Definition of done

Tests green (`make ci-backend`, `make ci-backend-pgsql`), parity gate items ticked (15 §4), docs updated, PR reviewed
by the other developer.
