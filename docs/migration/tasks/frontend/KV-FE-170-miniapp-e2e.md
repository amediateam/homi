# KV-FE-170 — Mini App E2E suite with a fake Telegram

| Field | Value |
| ----- | ----- |
| Status | BLOCKED (approval: Playwright, KV-FE-005) |
| Owner | Frontend (track: development) |
| Complexity | L |
| Milestone | FE-5 (M9, stage S4) |
| Feature IDs | F-TMA-001, F-TMA-002, F-TMA-003, F-TMA-004, F-TMA-005, F-TMA-006, F-TMA-007, F-TMA-008, F-TMA-009, F-FEED-001, F-RADAR-002 |
| Dependencies | KV-FE-010 (runner), KV-FE-022 (contract mocks), KV-FE-038 (emulator ideas); KV-QA-003 (`initData` signer); every FE-2 task whose scenarios it runs |

## Goal

One Playwright suite drives the new Mini App at 390 × 844 with an injected fake `window.Telegram.WebApp` and the contract
mocks, so that the legacy parity scenarios (including the fault-injection ones that stay mock-only for the reference
client) become regression tests of the new client: every screen state of SCR-001…SCR-045 and every TMA behaviour with
a version gate.

## Legacy reference

- Legacy harness: `$KVADRO_ROOT/demo/app/tools/parity/parity.mjs:32-89` (viewport, fake Telegram, request interception,
  normalised DOM), scenario lists `$KVADRO_ROOT/demo/app/tools/parity/mocks.mjs` (43), `mocks-filters.mjs` (36),
  `gl-parity.mjs` (16); fake Telegram `mocks.mjs:7-60` (frozen `Math.random` and `Date`).
- `15` §2.5 step 4 (fault-injection scenarios stay mock-only and become E2E cases for the new Mini App), §2.7.
- Version gates TMA-042; outside Telegram TMA-043; back stack TMA-022; deep links TMA-010…TMA-012.

## Implementation

1. Read `frontend/app/node_modules/next/dist/docs/01-app/02-guides/testing/playwright.md`.
2. `frontend/app/e2e/fixtures/telegram.ts`: an init script that installs a fake `Telegram.WebApp` with configurable
   `version` (6.0, 6.9, 7.0, 7.7, 8.0, 9.0), `platform` (`ios`, `android`, `tdesktop`, `weba`), `colorScheme`,
   `themeParams`, `initData` signed by the KV-QA-003 signer with a synthetic bot token, and spies for `BackButton`,
   `SettingsButton`, `HapticFeedback`, `showConfirm`, `openLink`, `openTelegramLink`, `shareMessage`,
   `requestWriteAccess`, `LocationManager`, `DeviceStorage`, `addToHomeScreen`; frozen clock and random.
3. `frontend/app/e2e/fixtures/api.ts`: routes `/api/*`, `/media/*`, tiles to the contract mocks of KV-FE-022 with a
   per-test override (status, body, delay) — no real backend, no network.
4. Port the scenario list: one spec per area (`boot`, `access`, `onboarding`, `feed`, `filters`, `map`, `listing`,
   `saved`, `radar`, `settings`, `nudges`), each case named after the legacy scenario (`x-feed-error`, `no-access-403`,
   `listing-hide`, …) plus the cases required by the LB fixes (e.g. `flow-204-does-not-crash` for LB-APP-006,
   `radar-save-without-relaxed` for LB-APP-005, `meta-401-shows-session-expired` for LB-APP-047).
5. Version-gate matrix: run the boot, back-stack, share and storage specs at Telegram 6.0 and 9.0; outside Telegram
   (no `initData`) for SCR-002.
6. Assert the request set per scenario (method, path, query, body; `POST /api/events` excluded as in the legacy harness)
   so KV-FE-172 can reuse the same recording format.
7. Nightly job in `frontend.yml` (or the KV-QA-021 nightly workflow) with traces kept on failure.

## States and texts

n/a — the suite asserts the states and texts defined in the screen tasks (exact keys and ru values).

## Interaction

Gestures are driven with Playwright touch emulation: sheet drag-to-close (25 % / 0.5 px/ms), swipe-back (33 %, not on
Android), pull-to-refresh (72 px), lasso (pointer capture), photo pinch and double tap.

## Telegram integration

All TMA items with client behaviour, through the spies above; the matrix covers TMA-042's gates.

## Storage and analytics

Assert `kv-*` keys written and the DeviceStorage mirror per KV-FE-028; assert journal events (API-034 calls) per
KV-FE-034 without sending them anywhere.

## Files

- `frontend/app/e2e/**` (specs, fixtures), `frontend/app/playwright.config.ts`
- `.github/workflows/frontend.yml` (nightly E2E job; shared file, its own small PR)

## API contract

The contract mocks of KV-FE-022 (golden fixtures of KV-QA-002) for API-001…API-034.

## Business rules

n/a — rules are asserted inside the specs of each area.

## Acceptance criteria

- Every legacy scenario of the three lists has a passing counterpart or a recorded mapping to an LB fix or DEV row.
- Every SCR id appears in at least one spec name or annotation; a coverage script lists SCR ids without a spec (must be
  empty).
- The suite runs headless in CI in under 15 minutes and is not flaky over 10 consecutive nightly runs (`15` §5.5).

## Tests

This task is the test suite; its own self-test: the fake Telegram fixture is checked against the API surface the
adapter of KV-FE-024 uses (a call to an unknown method fails the test).

## Edge cases

SDK never loads (TMA-005 bridge path); late SDK after 3 s (TMA-004); `initData` only in the URL hash (TMA-006).

## Security

No real `initData`, tokens or phone numbers in fixtures (SEC-REQ-041 spirit); traces contain only synthetic data.

## Definition of done

Suite green nightly; parity gate G8 evidence linked for the Mini App features; PR reviewed by the other developer.
