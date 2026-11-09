# KV-FE-173 — Mini App performance budgets

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Frontend (track: development) |
| Complexity | M |
| Milestone | FE-5 (M9, stage S4) |
| Feature IDs | F-TMA-001, F-FEED-001, F-MAP-001 |
| Dependencies | KV-FE-001 (legacy `app_launch.ms` baseline), KV-FE-010 (CI), KV-FE-003 (floor), KV-FE-034 (`app_launch` event) |

## Goal

The new Mini App is at least as fast as legacy where users feel it: startup to first feed render, JavaScript before the
first feed, map opening — with budgets enforced in CI and measured in the field through the existing `app_launch`
event.

## Legacy reference

- Budgets proposal `10` §5.12: p75 launch → first feed no worse than the legacy p75 of `app_launch.ms`; JS before the
  first feed ≤ 170 KB gzip; map code lazy.
- Legacy startup design `03` §1.3 (inline boot, prefetch of meta and the first feed before mount, first two photos
  preloaded), lazy chunks §1.9 (map, PostHog; map preload after 2.5 s on the list), lite mode §1.7.
- `app_launch` properties `entry`, `ms`, `v`, `sdk?`, `js`, `platform` (`03` §3.3).

## Implementation

1. Read `frontend/app/node_modules/next/dist/docs/01-app/02-guides/{lazy-loading,package-bundling,memory-usage}.md`.
2. Bundle budget check in CI: size of the JS needed before the first feed render (shell + feed + card + i18n catalogue
   for one locale), gzip, from the production build output; fail above 170 KB (or the adjusted value recorded in the
   ADR of KV-FE-003).
3. Confirm the lazy boundaries: map engines and MapLibre, Leaflet, PMTiles, PostHog, photo viewer, filters sheet
   sections beyond the first screen; locale catalogues per locale.
4. Lab measurement: Playwright on a throttled profile (4× CPU, slow 4G) with the contract mocks — time from navigation
   to the first card's photo `load`; record p50/p75 over 20 runs.
5. Field measurement: `app_launch.ms` (unchanged name and meaning) compared with the legacy baseline of KV-FE-001 during
   the S4 canary (KV-FE-177).

## States and texts

n/a.

## Interaction

Scroll performance on lite devices: the lite measurement of KV-FE-027 stays the source of truth.

## Telegram integration

`app_launch` carries `platform` and the Telegram version (TMA-041).

## Storage and analytics

`app_launch` (journal, API-034); PostHog web vitals (KV-FE-035) as a secondary signal.

## Files

- `frontend/app/scripts/bundle-budget.mjs` (or a `next build` output check), `frontend/app/e2e/perf/startup.spec.ts`,
  `.github/workflows/frontend.yml` (budget step; shared file)

## API contract

n/a (mocks for the lab run).

## Business rules

n/a.

## Acceptance criteria

- CI fails when the pre-feed JS exceeds the budget; the budget value and its source are written in the ADR.
- Lab p75 startup on the throttled profile is recorded per release; field p75 at the canary is not worse than the
  legacy p75.
- Opening the map after 2.5 s on the list does not download the map code again (preloaded, as legacy).

## Tests

The budget script with a planted oversize bundle (fails); the startup spec.

## Edge cases

Save-Data and 2g (no PostHog, no tile prefetch — as legacy); cold vs warm WebView cache.

## Security

No `initData` in performance traces.

## Definition of done

Budget enforced in CI; numbers recorded in the PR and in `10` §5.12's follow-up; reviewed by the other developer.
