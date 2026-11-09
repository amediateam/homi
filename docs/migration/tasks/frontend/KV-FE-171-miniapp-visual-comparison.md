# KV-FE-171 — Visual comparison against the legacy baselines

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Frontend (track: development) |
| Complexity | M |
| Milestone | FE-5 (M9, stage S4) |
| Feature IDs | F-TMA-004, F-FEED-001, F-LISTING-001 (and every Mini App feature with a baseline) |
| Dependencies | KV-QA-019 (legacy baselines and review procedure), KV-FE-170 (scenarios and fake Telegram); optional image-diff tool (KV-FE-005, needs approval) |

## Goal

The new Mini App is captured in exactly the states of the legacy baseline set and compared side by side; every
difference is fixed or justified by an LB fix or a DEV row, and the result is recorded per SCR id.

## Legacy reference

- Baselines: `docs/migration/visual-baseline/<SCR-NNN>-<variant>.png` and `manifest.json` (KV-QA-019): about 32 states,
  390 × 844, DPR 1, ru light plus `feed-dark-uz` and `feed-uzs-en-lite`; scenario → SCR mapping in KV-QA-019.
- `15` §2.8 (human review until a diff tool is approved; pure CSS changes are invisible to DOM comparison).
- Design tokens `03` §3.6 (KV-FE-011): colours, radii, z-index ladder, typography.

## Implementation

1. Reuse the KV-FE-170 scenarios; add a capture step per baseline scenario that waits for the DOM to settle (no fixed
   delays; animations finished or disabled through `prefers-reduced-motion`).
2. Capture on the CI Linux image used by KV-QA-019 (fonts reproducible); write
   `docs/migration/visual-baseline/new/<SCR-NNN>-<variant>.png` and a manifest with the same keys plus the commit.
3. Produce a review page (static HTML in the CI artefact) with legacy | new pairs and the list of expected differences
   per SCR id (LB fixes such as LB-APP-042 owner chip, LB-APP-044 map states; DEV flags that are on).
4. Record the verdict per pair in `docs/migration/data/visual-review.csv` (`scr, variant, verdict, reason, reviewer`).
5. If an image-diff tool is approved, add a pixel-diff threshold per pair as an extra signal (never as the only gate).

## States and texts

n/a — uses the states of the screen tasks.

## Interaction

n/a (static captures); animated states captured after settle.

## Telegram integration

Fake Telegram from KV-FE-170 with `colorScheme` light/dark and `themeParams` as in the legacy mocks.

## Storage and analytics

n/a.

## Files

- `frontend/app/e2e/visual/*.spec.ts`, `docs/migration/visual-baseline/new/*` (CI artefact; committed only for the
  reviewed set within the size budget of KV-QA-019), `docs/migration/data/visual-review.csv`

## API contract

Contract mocks (KV-FE-022) with the same sanitised fixtures as the legacy capture.

## Business rules

Legacy look is the reference; `09` §4.3 fixes and approved DEVs change it on purpose (`15` §2.8).

## Acceptance criteria

- Every baseline has a new capture and a verdict; no pair is left "regression" at S4.
- SCR ids without a legacy baseline (e.g. SCR-045, SCR-044) are reviewed against the legacy code and strings and listed
  as such.
- No personal data in any capture (synthetic fixtures only).

## Tests

The capture specs themselves; a manifest check that every KV-QA-019 manifest entry has a counterpart.

## Edge cases

Font rendering differences between the legacy capture machine and CI (re-capture the legacy set on the same image if
needed); GL map captures depend on SwiftShader (record the Chrome version).

## Security

Synthetic data only; the reviewer confirms no PII before merge.

## Definition of done

Review file complete; parity gate G10 visual evidence linked for each Mini App feature; PR reviewed by the other
developer.
