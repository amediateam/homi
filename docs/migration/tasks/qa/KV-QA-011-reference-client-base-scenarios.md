# KV-QA-011 — Reference-client base scenarios with the mock-equivalent seed

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | QA (track: development) |
| Complexity | L |
| Feature IDs | F-ACCESS-002, F-ONBOARD-001, F-FEED-001, F-LISTING-001 … F-LISTING-007, F-CONTACT-002, F-SHARE-001, F-SHARE-002, F-FAV-001, F-HISTORY-001, F-HIDE-001 … F-HIDE-003, F-REPORT-001, F-RADAR-001 … F-RADAR-006, F-DELIVERY-007, F-SETTINGS-001, F-LOCALE-001, F-LOCALE-003, F-TMA-004 |
| Dependencies | KV-QA-010 (runner); the legacy routes behind the covered screens (backend tasks of `09` modules FEED, LISTING, FAV, HISTORY, HIDE, REPORT, RADAR, SETTINGS) |

## Goal

The 43 scenarios of the legacy `mocks.mjs` are classified; every data-path scenario runs against HOMI seeded with data
equivalent to the mocks and is `IDENTICAL` to the mock run, or each difference is fixed or mapped to a `DEV-…`, a
defect fix or an open bug.

## Legacy reference

- Scenarios: `$KVADRO_ROOT/demo/app/tools/parity/mocks.mjs:199-265` (43 entries; `feed`, `feed-dark-uz`,
  `listing-open`, `filters-sheet`, `tab-favorites`, `tab-radar`, `tab-settings`, `deep-link-listing`, `sort-sheet`,
  `city-picker`, `quick-rooms`, `quick-price`, `map-view`, `map-view-leaflet`, `listing-actions`, `listing-photo`,
  `listing-market`, `listing-offer-link`, `settings-hidden`, `radar-sheet`, `found-*`, `radar-edit-*`,
  `listing-share-*`, `listing-redirect`, `listing-post-deleted*`, `listing-report-*`, `listing-hide*`,
  `listing-block-author*`, `feed-uzs-en-lite`, `no-access-403`).
- Mock data: `mocks.mjs:57-112` (cities, meta, `item(id)`, `detail(id)`, `subs`, `hiddenList`, settings).
- Screens: SCR-003, SCR-007, SCR-014 … SCR-018, SCR-020, SCR-022 … SCR-026, SCR-028, SCR-029, SCR-031, SCR-032,
  SCR-039, SCR-042 (`03`).
- Fix decisions: `09` §4 (for example LB-API-015 → report always `200`; DEV-051 undo for «rented», `PROPOSED`).

## Implementation

1. Classify every scenario into `docs/migration/data/reference-client-scenarios.csv` (`scenario, suite, class,
   features, screens, notes`). Classes: **data-path** (reproducible by seeding HOMI: includes `no-access-403` via the
   `private` access state, `listing-redirect` via a merged alias, `listing-post-deleted` via a deleted post) and
   **fault** (forced `500`, `204`, failed undo: `listing-report-204`, `listing-hide-undo-fail`, …), which stay
   mock-only and become E2E cases for the new Mini App (T8).
2. Write `backend/database/seeders/Testing/ParityMockSeeder.php`: the mock data rebuilt through HOMI models —
   Tashkent (three districts, two zones) and Samarkand; meta directories (renovations per deal, appliances, presets,
   locales); listings with numbers 1, 2, 3, 4 and 7 matching `item(id)` and `detail(id)` field by field; radar 11 with
   the 25-key filters; favourites 1, 2; history 2, 3; hidden listing 7 and two blocked authors; settings `23-08` /
   `09,21`. Phone and channel values use the sanitised placeholders of KV-QA-002 — and the mock copy used in mode 1
   is sanitised the same way, so both modes see the same strings.
3. Set listing timestamps relative to the frozen clock of the fake (`mocks.mjs:49-53`) so that HOMI's server
   formatter must produce the mock strings (`age`, `price`, `title`): a difference here is a formatting finding
   (Q-API-022), not a seeding error.
4. Run every data-path scenario in both modes with the KV-QA-010 runner; append results to
   `docs/migration/data/reference-client-results.csv` (`date, scenario, result, first_diff, cause, resolution`).
5. For each difference: fix it in the owning backend task, or map it to a DEV / defect row of `09` §4, or open a known
   issue; never edit the expected side to match HOMI.
6. Add the run to the nightly job definition of KV-QA-021 (command and expected `n/N identical`).

## Files

- `docs/migration/data/reference-client-scenarios.csv`, `reference-client-results.csv` (new)
- `backend/database/seeders/Testing/ParityMockSeeder.php` (new)
- `backend/tests/Browser/Parity/BaseScenariosTest.php` (new; or the runner's equivalent if option A/B was chosen)

## API contract

Exercises API-001 … API-004, API-008, API-011 … API-018, API-021 … API-022, API-024, API-026, API-029, API-030,
API-032 … API-034 and RES-001 as the legacy client calls them.

## Business rules

The legacy client's behaviour is the expectation (`15` §1.4 item 5); server-side defect fixes must not change what it
renders unless recorded.

## Acceptance criteria

- All 43 scenarios are classified; data-path and fault counts recorded.
- Every data-path scenario has a result row; each non-identical one names its cause and resolution.
- No resolution is "expected side changed to match HOMI".

## Tests

`BaseScenariosTest` (one dataset entry per data-path scenario); a self-check that mode 1 still reproduces the legacy
harness results (`IDENTICAL` for every scenario with the original mocks).

## Edge cases

- `deep-link-listing` uses `start_param` `l_3-share` and `?listing=3`: both must reach HOMI as listing 3.
- `listing-share-*` count Telegram calls through `/api/__probe/*` requests (`$KVADRO_ROOT/demo/app/tools/parity/README.md`);
  in mode 2 those probe requests must be answered by the router, never forwarded to HOMI.
- `feed-uzs-en-lite`: UZS strings from the server must match the mock strings the client renders (§3.11 of `15`).

## Security

Synthetic data only; the seeder never runs outside the testing environment (guard on `app()->environment('testing')`).

## Definition of done

Tests green (`make ci-backend`; the scenario run recorded), parity gate items ticked (15 §4; G10 evidence for the
covered features), docs and the feature rows in 09 updated, PR reviewed by the other developer.
