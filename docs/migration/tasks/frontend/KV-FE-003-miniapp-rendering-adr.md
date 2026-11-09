# KV-FE-003 — ADR draft: Mini App rendering, browser floor and CSP

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Frontend (track: development); hosting section reviewed by the first developer **[PT]** |
| Complexity | S |
| Milestone | FE-0 (M9, stage S4) |
| Feature IDs | F-TMA-001, F-TMA-002 |
| Dependencies | KV-FE-001 (client distribution), KV-FE-002 (spike report); decides DEC-06 (FD-1); related CF-011, Q-APP-001, Q-SEC-012, SEC-REQ-031 |

## Goal

The ADR "Mini App rendering, browser floor and CSP" proposed in `10` §3.11 is drafted from the data of KV-FE-001 and
the spike of KV-FE-002, reviewed, and accepted by the people DEC-06 names. After it, every FE-1/FE-2 task knows its
paths, its browser targets and its CSP model.

## Legacy reference

- CF-011 analysis and decision rule: `10` §3.11; option A shape `10` §5.2; route structure §5.3; budgets §5.12;
  surfaces per stage §5.1; S4 canary `18` §12.1.
- Legacy boot and CSP constraints: TMA-001…TMA-005; `03` §1.3–§1.5; Q-APP-016 (legacy CSP header).
- ADRs touched: ADR-0013 (`docs/architecture/decisions/0013-nextjs-ssr-behind-nginx.md`) for option A; ADR-0001 and
  ADR-0004 as well for option B (`10` §3.11 "ADR proposal").
- Security: SEC-REQ-031 (Mini App CSP), SEC-REQ-033 (headers), SEC-REQ-007 (no credentials in storage).

## Implementation

1. Read `docs/architecture/decisions/README.md` and `0000-adr-template.md`; take the next free number at writing time
   (0014 is reserved for T4, `10` §3 conventions); file
   `docs/architecture/decisions/00NN-miniapp-rendering-browser-floor-csp.md`.
2. Context: the two questions of `10` §3.11 (transition client is the unchanged legacy build — not in this ADR's scope;
   the S4 client is), the facts list, the KV-FE-001 numbers and the KV-FE-002 matrix.
3. Decision, by the rule of `10` §3.11:
   - **A, default floor** if sessions below Chrome 111 / Safari 16.4 are under the product owner's threshold (suggested
     1 % of weekly active users) — older clients get the "update Telegram" screen (a DEV candidate, see step 6);
   - **A, lowered floor** if the spike booted on the measured floor — `browserslist` in `frontend/app/package.json`,
     polyfills in `instrumentation-client.ts` (list them);
   - **B** otherwise — a fourth workspace app `frontend/miniapp` (Vite + React 19, `build.target` from the floor),
     static hosting, CSP hashes at build time; Vite is a new dependency (KV-FE-005 adds it to the request).
4. Consequences section: the path mapping that FE-1/FE-2 tasks use (`frontend/app/app/(miniapp)/…` under A;
   `frontend/miniapp/src/…` under B, shared packages unchanged); the boot shell (KV-FE-032) and CSP (KV-FE-033)
   shape; hosting on the Mini App origin per `17` §3 (nginx → `next start` for A, static files for B); the
   `(web)` group stays reserved (`10` §5.3).
5. CSP section (SEC-REQ-031): nonce + `'strict-dynamic'` from `proxy.ts` for A (dynamic rendering of the shell is
   acceptable — per-user, never indexed), hashes for B; the fallback `'self' https://telegram.org` for engines that
   ignore `'strict-dynamic'` (spike result); `connect-src` API, PostHog and tile hosts; `img-src 'self' data: blob:`
   + media and tile hosts; `worker-src blob:` (MapLibre); `frame-ancestors` for Telegram Web (Q-SEC-012);
   `report-uri /api/csp-report`.
6. Name the DEV candidate if the floor rises above what legacy supports ("some users who work today would be told to
   update", `10` §3.11) and ask the owner of `09` §4.2 to number it; until numbered, the ADR calls it "floor DEV
   candidate".
7. Circulate: product owner (floor), first developer (hosting), security review (CSP); record the answer to DEC-06
   in the ADR's status line; update `10` §8 DEC-06 row through its owner.

## States and texts

n/a — documentation task. (The "update Telegram" screen it may require is SCR-001, KV-FE-032.)

## Interaction

n/a.

## Telegram integration

Records which TMA-042 version gates remain reachable on the chosen floor and how TMA-001…TMA-005 are reproduced
(inline boot script with nonce or hash; SDK with `beforeInteractive` or a plain tag under B).

## Storage and analytics

Records that `kv-*` keys and analytics names are unchanged by the decision (`10` §5.2 "what does not change").

## Files

- `docs/architecture/decisions/00NN-miniapp-rendering-browser-floor-csp.md` (new)
- `docs/architecture/decisions/README.md` (index line)

## API contract

n/a (the data transport is KV-FE-004).

## Business rules

n/a. Records the floor DEV candidate (step 6) as `PROPOSED`.

## Acceptance criteria

- The ADR states one option (A or B), the floor as a `browserslist` line, the polyfill list, the CSP header template
  and the hosting model, each traced to the KV-FE-001 data or the KV-FE-002 report.
- The path mapping for FE-1/FE-2 tasks is explicit.
- DEC-06 shows the deciders' names and the date; the ADR is merged with status `Accepted` (or `Proposed` with the open
  point named).

## Tests

n/a — reviewed document. The decision is verified later by KV-FE-174 (device pass) and KV-FE-173 (budgets).

## Edge cases

- KV-FE-001 data unavailable: the ADR may be accepted on the spike alone only if option A boots on the legacy floor
  (chrome80 / safari13.1); otherwise it stays `Proposed`.
- Option B chosen: KV-FE-005 must add Vite (`10` §5.2: "a Vite dependency and an ADR change to the workspace layout").

## Security

The CSP section satisfies SEC-REQ-031 and SEC-REQ-033; security review sign-off is recorded in the PR.

## Definition of done

ADR merged; DEC-06 answered in `10` §8 (by its owner); KV-FE-032 and KV-FE-033 unblocked; PR reviewed by the other
developer and the first developer.
