# KV-FE-005 — Frontend dependency approval request

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Frontend (track: development); approval by the first developer |
| Complexity | S |
| Milestone | FE-0 (M9) |
| Feature IDs | F-MAP-001, F-ANALYTICS-002, F-TMA-001 |
| Dependencies | — ; decides DEC-23 for the frontend items; unblocks KV-FE-010, KV-FE-035, KV-FE-057…KV-FE-062, KV-FE-067, KV-FE-170 |

## Goal

Every third-party npm package the new frontends need is requested once, with the exact version the legacy production
bundle ships, the reason, the alternative without it, and a vetting note — "PROPOSED — needs approval (dependency
change)" — so the longest-lead approval of M9 starts on day one.

## Legacy reference

- Legacy dependency list (`$KVADRO_ROOT/demo/app/package.json`; `03` §1.10): pinned `react` / `react-dom` `19.3.0`,
  `posthog-js` `1.434.15`, `leaflet` `1.9.4`, `leaflet.markercluster` `1.5.3`, `maplibre-gl` `6.11.2`; ranges inferred
  by the recovery (`$KVADRO_ROOT/demo/app/docs/RECOVERY.md:94`): `lucide-react ^1.69.0`, `pmtiles ^4.5.0`,
  `protomaps-leaflet ^5.1.0`, `supercluster ^8.0.1`. MapLibre is vendored as `/assets/maplibre-gl-6.11.2/maplibre-gl.mjs`
  (`$KVADRO_ROOT/demo/app/vite.config.js:18-40`).
- HOMI already has `next 16.4.5`, `react` / `react-dom` `19.3.1` (`frontend/app/package.json`) — no React request.
- Approval rules: `CLAUDE.md` (no new dependency without approval), `12` §9.2, `15` §2.14, DEC-23, SEC-REQ-049
  (vetting note, lockfiles, `pnpm audit`).

## Implementation

1. Read `scripts/packages/proposed.json` (array of `{name, why, origin, phase, alternatives}`) and
   `docs/backend/package-registry.md` conventions; this task **describes** the entries — the PR that files them edits
   `scripts/packages/proposed.json` only after the developer agrees to file (it is a shared file: one small PR).
2. Entries to file (one object each; `phase` = "Migration M9 (frontend)"; `origin` names the legacy file):

   | # | name | version to pin | why | alternatives (without it) |
   | - | ---- | -------------- | --- | ------------------------- |
   | 1 | `maplibre-gl` | `6.11.2` | GL search map, lasso, selection card, spot map (F-MAP-001…003, F-LISTING-003); same engine and label fonts as legacy | none for a vector map; raster Leaflet only (needs 4) |
   | 2 | `pmtiles` | `4.5.x` (legacy range `^4.5.0`, inferred — confirm the exact version in the prod chunk) | `meta.tiles` `.pmtiles` sources over `Range` (RES-003) | template `{z}/{x}/{y}` tiles or OSM raster (RES-004) |
   | 3 | `supercluster` | `8.0.x` (`^8.0.1`, inferred) | GL clustering radius 48, maxZoom 17 (`03` SCR-011) | in-house grid clustering (more code, parity risk) |
   | 4 | `leaflet` | `1.9.4` | Leaflet fallback and lite mode (FD-3, Q-APP-018) | GL only; lite users get GL or no map |
   | 5 | `leaflet.markercluster` | `1.5.3` | Leaflet clusters | as 4 |
   | 6 | `protomaps-leaflet` | `5.1.x` (`^5.1.0`, inferred) | vector basemap inside Leaflet | raster basemap in Leaflet |
   | 7 | `posthog-js` | `1.434.15` | Mini App product analytics with the legacy options (RES-006, F-ANALYTICS-002) | journal events only (API-034); dashboards lose autocapture and replay |
   | 8 | `lucide-react` | `1.69.x` (`^1.69.0`, inferred) | the icon set of 45 legacy files | hand-copied SVGs in `@homi/ui` (ISC licence permits) |
   | 9 | `vitest`, `@testing-library/react`, `@testing-library/dom`, `jsdom` | current stable at approval | unit and component tests (HANDOFF T8) | no unit tests in the Next apps |
   | 10 | `@playwright/test` (+ browsers in CI) | current stable at approval; or the Pest browser plugin if KV-QA-010 chose it | E2E with a fake Telegram, screenshots | Dusk smoke only |
   | 11 | optional `zod` | current stable | response normalisation (LB-APP-005, LB-APP-006) | hand-written guards (default) |
   | 12 | optional TanStack Query or SWR | current stable | request cache (`10` §5.5) | in-house cache (default, KV-FE-023) |
   | 13 | optional image diff (pixelmatch or the runner's screenshot assertion) | current stable | automatic visual diff (`15` §2.14) | human side-by-side review |
   | 14 | `vite` (+ `@vitejs/plugin-react`) — **only if DEC-06 = B** | current stable | the static Mini App app of option B | n/a (option A) |

3. For each entry add a vetting note to the PR (SEC-REQ-049): licence (MapLibre BSD-3, Leaflet BSD-2, PostHog MIT,
   Lucide ISC, supercluster ISC, pmtiles BSD-3 — verify at filing), maintenance (last release), transitive dependency
   count from `pnpm why` on a scratch install outside the repository, known CVEs from `pnpm audit`.
4. Note the pin policy: the map stack and PostHog are pinned to the legacy versions for parity; upgrades are separate
   tasks after S4. Ranges marked "inferred" are confirmed by reading the version banner in the production chunk copy of
   KV-QA-010 (read-only) before filing.
5. Non-packages recorded in the same PR description: the 12 Noto Sans `woff2` label-glyph files (`03` §3.6) are assets
   (OFL) copied into `frontend/app/public/fonts/` by KV-FE-057; the landing loads PostHog from
   `https://eu-assets.i.posthog.com/static/<version>/array.js` like legacy (LND-031) — no package.
6. Record the decision per entry in the PR and in `docs/backend/package-registry.md`'s frontend counterpart when it
   exists (registry for Composer only today — note it, do not create a new registry here).

## States and texts

n/a.

## Interaction

n/a.

## Telegram integration

n/a.

## Storage and analytics

`posthog-js` entry carries the legacy init options (`03` §3.3: `persistence: memory`, bootstrap distinct id, masked
replay) so the approver sees the privacy posture.

## Files

- `scripts/packages/proposed.json` (entries 1–13, 14 only with option B) — filed in a separate small PR after agreement.

## API contract

n/a.

## Business rules

n/a.

## Acceptance criteria

- Each entry has name, exact version (or "confirm" with the reason), why, origin, phase, alternatives and a vetting
  note; JSON stays valid (`python3 -m json.tool`).
- The first developer's answer (approved / rejected / deferred) is recorded per entry; tasks marked
  `BLOCKED (approval)` in `12` are unblocked or re-planned on the alternative.

## Tests

`python3 -m json.tool scripts/packages/proposed.json` passes; `pnpm audit` on the scratch install has no high or
critical finding for an approved entry.

## Edge cases

- Approval of the map stack but not Leaflet: FD-3 resolves to GL + raster fallback; KV-FE-059 is dropped with that
  reason.
- Approval of PostHog refused: KV-FE-035 is re-planned to the journal-only alternative; DEC-26 notes the dashboard loss.

## Security

SEC-REQ-049 (vetting, lockfiles, audit gates), `.npmrc` keeps install scripts disabled where the app sets it; no
package fetches code at runtime from a CDN except the Telegram SDK (TMA-001) and PostHog's loader on the landing.

## Definition of done

Request filed and answered; `12` §9.2 rows updated with the answers by its owner; blocked tasks re-labelled; PR reviewed
by the first developer.
