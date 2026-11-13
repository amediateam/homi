# KV-FE-172 — Behaviour comparison with the legacy reference client

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Frontend (track: development) |
| Complexity | M |
| Milestone | FE-5 (M9, stage S4) |
| Feature IDs | F-COMPAT-001, F-FILTER-001, F-MAP-001 (and every Mini App feature with data-path scenarios) |
| Dependencies | KV-QA-010 (runner), KV-QA-011, KV-QA-012 (reference-client scenarios against HOMI), KV-INF-010 (legacy artefact manifest), KV-FE-170; FD-2 (transport) |

## Goal

For the same scenario and the same HOMI backend data, the new Mini App sends the same requests (method, path, query,
body) as the unchanged legacy client and reaches the same visible outcome — so the backend contract tests and the
client agree, and the S4 switch cannot surprise the server.

## Legacy reference

- `15` §2.5 (reference client runs: production artefacts proxied to HOMI, `behaviour` mode), KV-QA-011 / KV-QA-012
  results in `docs/migration/data/reference-client-results.csv`.
- Request-building rules: `08` §1.3, §1.6, §1.7 (query key order matters only for the prefetch cache), BR-APP-024
  (`limit=20`, cursor), BR-APP-023 (`new` never sent), BR-APP-041 (subscribe flow request sequence).

## Implementation

1. For each data-path scenario of KV-QA-011 / KV-QA-012, run the new Mini App against the same seeded HOMI backend
   (mock-equivalent seed) and record the request set in the KV-FE-170 format.
2. Diff the new request set against the legacy reference-client recording: same endpoints and parameters; documented
   differences only where a fix changes requests on purpose (LB-APP-036 batched radar previews, LB-APP-022 pagination,
   DEV-002 re-auth, FD-2 = B transport).
3. Compare the normalised visible outcome (texts and element order of the main layer) as in the legacy harness.
4. Append the results to `docs/migration/data/reference-client-results.csv` with a `client=new` column.

## States and texts

n/a.

## Interaction

n/a.

## Telegram integration

Fake Telegram with `initData` signed for the local backend's synthetic bot token (KV-QA-003).

## Storage and analytics

`POST /api/events` excluded from the request diff (as legacy); its payload keys checked separately against KV-FE-034.

## Files

- `frontend/app/e2e/behaviour/*.spec.ts`, `docs/migration/data/reference-client-results.csv` (rows appended)

## API contract

The live HOMI legacy surface (`/api/*`) on the local test backend; with FD-2 = B the comparison maps v1 calls to their
legacy counterparts through the table of KV-FE-004.

## Business rules

Request rules of `08` §1 and BR-APP-023/024/041 hold for the new client unless an LB fix or DEV says otherwise.

## Acceptance criteria

- Every data-path scenario: identical request set, or every difference mapped to an LB fix, DEV or FD-2 in the results
  file.
- No scenario shows a visible divergence of severity "critical" or "major" (`15` §4.5) without a DEV.

## Tests

The comparison specs; a self-test that a planted difference (an extra query key) is reported.

## Edge cases

Prefetch timing (the new client may prefetch earlier); de-duplicated in-flight requests counted once; aborted
count/flow requests (debounce) compared by the final request only.

## Security

Synthetic seed only; no production data.

## Definition of done

Results committed; parity gate G10 behaviour evidence linked; PR reviewed by the other developer.
