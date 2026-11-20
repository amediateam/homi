# KV-QA-013 — Landing reference scenarios against the new landing

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | QA (track: development) |
| Complexity | M |
| Feature IDs | F-LANDING-001 … F-LANDING-007, F-LANDING-009, F-PRIVACY-001, F-ANALYTICS-004, F-MEDIA-004 |
| Dependencies | KV-QA-010 (runner); the new `frontend/landing` pages (KV-FE tasks); CF-010 decision; landing data files RES-010 … RES-012 (F-PIPELINE-008) |

## Goal

The 40 legacy landing scenarios run with the production mirror as base and the new HOMI landing as candidate; every
scenario is identical, or its difference is mapped to a DEV row, a defect fix or a CF-010 decision.

## Legacy reference

- Scenarios: `$KVADRO_ROOT/demo/landing/tools/parity/scenarios.mjs` (40; groups in `03b` §1.6: full scene, v2, live
  prototype, blocks, static, language, attribution, privacy).
- Runner: `$KVADRO_ROOT/demo/landing/tools/parity/parity.mjs:26-83` (prepare: languages, storage, frozen time and
  randomness, CSP violation capture; capture: DOM with origins stripped, `<html class>`, `lang`, title, description,
  localStorage, CSP, same-origin requests); fixtures `$KVADRO_ROOT/demo/landing/tools/parity/fixtures/`.
- Base: `$KVADRO_ROOT/demo/landing/tools/parity/original/` and `$KVADRO_ROOT/demo/landing/site/` (production files 1:1).
- Landing hard rules: inline scripts allowed by CSP hash (`$KVADRO_ROOT/CLAUDE.md:49-52`); LND-001 … LND-039.
- Fix decisions: DEV-012, DEV-038, DEV-039, DEV-040, DEV-041, DEV-042, DEV-043, DEV-044 (`PROPOSED`); LB-LND defect
  rows of `09` §4.3.

## Implementation

1. Read `03b` §1, `15` §2.9 and the runner decision of KV-QA-010.
2. Copy the base (mirror + fixtures + scenarios) into the gitignored scratch directory; record a manifest
   (`docs/migration/data/legacy-landing-manifest.json`).
3. Serve the candidate: `frontend/landing` with `next build && next start` on a free port (or `https://homi.loc` on
   the local stack), with landing data served from the same fixtures as the base.
4. Port the prepare/capture logic of the landing runner into the chosen runner; run all 47 scenarios on both sides (40 at the audit; landing intake).
5. For each scenario record the comparison type: `behaviour` (DOM equality) when CF-010 keeps the landing 1:1, or a
   checklist (texts, links, language rules, bot payloads, no CSP violations) when CF-010 approves a redesign; write
   the results to `docs/migration/data/landing-scenario-results.csv`.
6. Map differences to DEV / defect rows or CF-010; open known issues for the rest.

## Files

- `docs/migration/data/legacy-landing-manifest.json`, `landing-scenario-results.csv` (new)
- `backend/tests/Browser/Parity/LandingScenariosTest.php` (new; or runner equivalent)

## API contract

Landing data: `data/live.json`, `data/pins-rent.json`, `data/pins-sale.json` schemas (RES-010 … RES-012; `03b` §1.5);
CSP reports `POST /api/csp-report` (RES-015).

## Business rules

BR-LND-001 (source tag), BR-LND-004, BR-LND-005 (language rules), BR-BOT-096 (payload grammar in bot links); DEV rows
of the LANDING module per their state.

## Acceptance criteria

- All 47 scenarios run on both sides; each has a result row and, if different, a resolution.
- Candidate runs report zero CSP violations (SEC-REQ-031).
- Bot links on the candidate carry `s_web[_<tag>][--v<visit>]` with the 49-character cut (URL-046, BOT-029).

## Tests

`LandingScenariosTest`; a negative control that edits one candidate text and sees `DIFFERENT`.

## Edge cases

- Full-scene scenarios need animations enabled and `?motion=raw` (`$KVADRO_ROOT/CLAUDE.md:47`); static scenarios use
  reduced motion.
- `browser-kk` must fall back to Russian; `stored-lang-uz` reads `kv-landing-lang`.
- Pure CSS changes are invisible to DOM comparison; visual review covers them (KV-QA-019 procedure).

## Security

Analytics hosts are blocked; `stats.js` must not send to production PostHog from tests (RES-014).

## Definition of done

Tests green, parity gate items ticked (15 §4), docs and the feature rows in 09 updated, PR reviewed by the other
developer.
