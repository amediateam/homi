# KV-QA-019 — Visual baseline of legacy key states

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | QA (track: development) |
| Complexity | M |
| Feature IDs | F-TMA-004, F-ACCESS-002, F-ONBOARD-002, F-ONBOARD-003, F-FEED-001, F-FEED-002, F-FILTER-001 … F-FILTER-004, F-MAP-001 … F-MAP-003, F-LISTING-001 … F-LISTING-004, F-FAV-001, F-HISTORY-001, F-RADAR-001, F-RADAR-003, F-DELIVERY-007, F-SETTINGS-001, F-HIDE-003, F-TMA-005 |
| Dependencies | KV-QA-010 (runner) |

## Goal

About 32 screenshots of the legacy Mini App's key states are stored with a manifest, so the new Mini App and the
reference-client runs can be reviewed side by side; the review procedure is written down. An automatic pixel diff is
proposed separately.

## Legacy reference

- Screens: SCR-001 … SCR-045 (`03`, `data/screens.json`).
- Screenshots in the legacy harness: `SHOTS=` (`$KVADRO_ROOT/demo/app/tools/parity/parity.mjs:76`); viewport 390 × 844,
  DPR 1, mobile, touch (`parity.mjs:32`).
- Scenario sources: `$KVADRO_ROOT/demo/app/tools/parity/mocks.mjs`, `mocks-filters.mjs`, `gl-parity.mjs`.
- Pure CSS changes are invisible to DOM comparison (`$KVADRO_ROOT/CLAUDE.md:47`).

## Implementation

1. Capture with the KV-QA-010 runner in mode 1 (production artefacts + sanitised mocks), on the CI Linux image so the
   fonts are reproducible.
2. States (scenario → screen): `no-telegram` → SCR-002; `no-access-403` → SCR-003; meta with `locale_chosen: false` →
   SCR-004; meta with `city_chosen: false` → SCR-005; `feed` → SCR-007 (ru, light); `feed-dark-uz` → SCR-007 (uz,
   dark); `feed-uzs-en-lite` → SCR-007 (en, UZS, lite); `x-feed-error` → SCR-008; `x-feed-empty` → SCR-009; `gl-base` →
   SCR-011; `map-view-leaflet` → SCR-011 (Leaflet); `gl-lasso` → SCR-012; `gl-pin-click` → SCR-013; `filters-sheet` →
   SCR-014; `quick-rooms` → SCR-015; `sort-sheet` → SCR-016; `city-picker` → SCR-017; `listing-open` → SCR-018;
   `listing-post-deleted` → SCR-018 (deleted post); `listing-photo` → SCR-020; `listing-market` → SCR-022;
   `listing-actions` → SCR-023; `tab-favorites` → SCR-024; `x-history` → SCR-025; `tab-radar` → SCR-026; subscriptions
   `[]` → SCR-027; `radar-sheet` → SCR-028; `radar-edit-save` before saving → SCR-029; `found-pause` → SCR-031;
   `tab-settings` → SCR-032; `settings-hidden` → SCR-039; `listing-hide` → SCR-042.
3. Store PNGs as `docs/migration/visual-baseline/<SCR-NNN>-<variant>.png` and `manifest.json` (scenario, variant,
   release, viewport, SHA-256, capture date). Size budget: ≤ 6 MB in total; compress losslessly.
4. Check every screenshot by eye for personal data before committing: phones must show the `+998 00` placeholder,
   channels `example_channel`.
5. Write the review procedure into `docs/migration/visual-baseline/README.md`: how to capture the new Mini App in the
   same states, how to review side by side in the PR, what counts as a regression (layout, missing element, wrong
   text) versus an accepted change (a DEV row, a client-side defect fix of `09` §4.3).
6. File the approval request for an automatic diff (pixelmatch or the browser plugin's screenshot assertion) in
   `scripts/packages/proposed.json` — needs approval (dependency change).

## Files

- `docs/migration/visual-baseline/*.png`, `manifest.json`, `README.md` (new)
- `scripts/packages/proposed.json` (approval request only)

## API contract

n/a.

## Business rules

The legacy client's look is the reference; LB-APP fixes of `09` §4.3 and DEV rows change it only in the new Mini App.

## Acceptance criteria

- About 32 baselines exist, each listed in the manifest with its scenario and SHA-256.
- Total size within the budget; no personal data visible.
- The review procedure is written; the diff-tool request is filed.

## Tests

A manifest check (`backend/tests/Unit/Legacy/VisualBaselineManifestTest.php`): every file listed exists and matches
its hash; every listed SCR id exists in `docs/migration/data/screens.json`.

## Edge cases

- GL screenshots depend on SwiftShader; record the Chrome version in the manifest.
- Animated states (toasts, sheets) are captured after the DOM settles, not after a fixed delay.
- SCR-045 (crash screen) needs a forced error; skipped in the first capture and listed as a gap.

## Security

Screenshots come from synthetic data only; the PR reviewer confirms no PII before merge.

## Definition of done

Tests green (`make ci-backend`), parity gate items ticked (15 §4), docs updated, PR reviewed by the other developer.
