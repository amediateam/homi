# KV-FE-175 — Landing parity run and performance

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Frontend (track: development) |
| Complexity | M |
| Milestone | FE-5 (M9, stage S4) |
| Feature IDs | F-LANDING-001, F-LANDING-002, F-LANDING-003, F-LANDING-004, F-LANDING-005, F-LANDING-006, F-LANDING-007, F-LANDING-008, F-LANDING-009, F-LANDING-010 |
| Dependencies | KV-QA-013 (landing scenarios against the new landing), KV-FE-108, KV-FE-109, KV-FE-110, KV-FE-111, KV-FE-112, KV-FE-113 |

## Goal

The re-implemented landing passes the 47 legacy landing scenarios (40 at the audit; landing intake) (or maps each difference to an `LB-LND` decision or a
landing DEV) and meets the landing performance budget, so it can replace the mirrored legacy files at S4.

## Legacy reference

- 47 scenarios `$KVADRO_ROOT/demo/landing/tools/parity/scenarios.mjs`, groups in `03b` §1.6 (full scene, v2, live
  prototype, blocks, static, language, attribution, privacy); harness compares DOM with origins stripped, `<html class>`,
  `lang`, title, description, localStorage, CSP violations and same-origin requests
  (`$KVADRO_ROOT/demo/landing/tools/parity/parity.mjs:26-83`).
- Expected differences: LB-LND-001 (absolute URLs), LB-LND-002 / DEV-038 (`/` always ru), LB-LND-004 (district medians
  only), LB-LND-005 / DEV-039 (server-rendered numbers), LB-LND-007 / DEV-040 (QR payload), LB-LND-008 / DEV-041 (privacy
  URLs), LB-LND-015 / DEV-043 (debug parameters), LB-LND-016 / DEV-044 (plain contact links).
- Budget `10` §5.12: LCP ≤ 2.5 s p75 mobile, CLS ≤ 0.1, HTML ≤ 100 KB; scene animations respect
  `prefers-reduced-motion`.

## Implementation

1. Run KV-QA-013 with base = the production mirror and candidate = `frontend/landing` on the local host alias
   (KV-INF-002).
2. For each failing scenario: fix, or record the LB/DEV mapping with the flag state in
   `docs/migration/data/landing-parity.csv`.
3. Performance: Lighthouse (approved tool or Playwright performance timings if Lighthouse is not approved) for `/`,
   `/uz/`, `/en/`, `/privacy.html` on a mobile profile; record LCP, CLS, HTML size.
4. Check PostHog continuity (Q-LND-008): autocapture selectors used by dashboards still exist or are mapped.

## States and texts

n/a — asserted by the scenarios.

## Interaction

The v1/v2/static scenarios exercise scroll-driven, time-driven and reduced-motion behaviour (LND-021…LND-024).

## Telegram integration

n/a (bot links checked through their `href` values).

## Storage and analytics

`kv-landing-lang` (language choice), `sessionStorage kv-visit` (visit id, BR-LND-002); PostHog cookieless config.

## Files

- `docs/migration/data/landing-parity.csv` (new); fixes land in the owning landing tasks

## API contract

Landing data files (RES-010…RES-012) from the fixture snapshot `$KVADRO_ROOT/demo/landing/tools/parity/fixtures/data/`.

## Business rules

BR-LND-001…BR-LND-023 as asserted by the scenarios.

## Acceptance criteria

- 47 of 47 scenarios identical or mapped; no CSP violation; no request to a removed asset path.
- Performance numbers within budget on all four pages.

## Tests

The scenario run itself; a check that the mapping file lists only existing LB/DEV ids.

## Edge cases

Fixture data older than the new data contract (use the converted fixture of KV-FE-107); browsers without scroll
timelines (static layout).

## Security

CSP per KV-FE-104; no inline scripts beyond the decided policy.

## Definition of done

Mapping file complete; G10 evidence for the LANDING features linked; reviewed by the other developer.
