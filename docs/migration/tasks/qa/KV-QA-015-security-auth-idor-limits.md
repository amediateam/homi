# KV-QA-015 — Security suite 1: authentication, access gate, IDOR matrix, rate limits

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | QA (track: development); review by the `security-reviewer` agent and the other developer |
| Complexity | L |
| Feature IDs | F-ACCESS-001, F-ACCESS-002, F-ACCESS-003, F-COMPAT-002, F-CONTACT-001, F-RADAR-002 … F-RADAR-005, F-HIDE-003, F-FAV-001, F-SETTINGS-001, F-CONTACT-003, F-OWNER-006 |
| Dependencies | KV-QA-003, KV-QA-004, KV-QA-008; T6 (shared `initData` verifier); the compatibility route group (CF-001, CF-002) |

## Goal

The negative-authentication table, the access-gate matrix, the IDOR matrix and every rate limiter of `16` are
executable tests; the IDOR matrix is generated from the route list, so a new per-user route without a row fails. Since
the owner-cabinet plan it also covers the IDOR rows of the owner methods and the request limits, built by WP-84 and
WP-85.

## Legacy reference

- `16` §5.1 (negative authentication), §5.2 (IDOR matrix), §5.4 (replay and expiry), §5.7 (rate limits).
- Requirements: SEC-REQ-001 … SEC-REQ-006, SEC-REQ-014, SEC-REQ-016, SEC-REQ-027, SEC-REQ-028.
- Legacy behaviour and fixes: BR-API-004 … BR-API-016, LB-API-001 (defect fix), DEV-001, DEV-002 (`PROPOSED`),
  Q-API-002, Q-API-003, Q-API-005, Q-SEC-002, Q-SEC-003.
- Cases: `15` §3.1, §3.2.

## Implementation

1. Read `.ai/agents/security-reviewer.md`, `.claude/skills/laravel-owasp-security/`, `16` §4.1, §4.3, §4.6, §5.
2. `backend/tests/Feature/Security/LegacyAuthTest.php`: every row of `16` §5.1 for the legacy surface, using
   `InitDataFactory` mutations and a frozen clock for the `auth_date` window (`TELEGRAM_INITDATA_MAX_AGE` from test
   config).
3. `backend/tests/Feature/Security/V1AuthTest.php`: the v1 column of `16` §5.1 (token exchange, abilities, expiry,
   sixth-token revocation) — `todo` until T6.
4. `backend/tests/Feature/Security/AccessGateMatrixTest.php`: the five access states × every protected legacy route →
   expected status and `detail`; `blocked` never receives `phone`, `phone_display` or `call_url` (SEC-REQ-006);
   `GET /api/bot` always `200`.
5. `backend/tests/Feature/Security/IdorMatrixTest.php`: build the route list from `Route::getRoutes()` (legacy group
   and v1); a resolver map in the test names, per route, how to create A's resource; actors A, B, U, G, N per `15`
   §3.1; for B and U compare status, body bytes and the number of queries (`DB::getQueryLog()`); assert A's rows are
   unchanged with a before/after fingerprint. `IdorCoverageTest` fails for any per-user route missing from the map.
6. `backend/tests/Feature/Security/RateLimitTest.php`: each limiter of SEC-REQ-027 — N allowed, N+1 → `429` with
   `{"detail":"rate_limited"}` and `Retry-After` on legacy, the envelope on v1; buckets per user; behind the trusted
   proxy list two client IPs get two buckets; a forged `X-Forwarded-For` from outside the list is ignored.
7. `backend/tests/Feature/Pgsql/Concurrency/RadarTabBurstTest.php`: the recorded radar-tab burst (10 radars × feed,
   count, flow = 30 requests, from the KV-QA-011 request log) passes without `429` (CF-018).
8. `backend/tests/Feature/Security/PhoneQuotaTest.php`: thresholds 3/5 in test config — the 4th listing returns
   `phone: null`, `phone_display: null`, `call_url: null` with the same shape; the 6th flags the user (SEC-REQ-028).

## Files

- `backend/tests/Feature/Security/{LegacyAuthTest,V1AuthTest,AccessGateMatrixTest,IdorMatrixTest,IdorCoverageTest,RateLimitTest,PhoneQuotaTest}.php` (new)
- `backend/tests/Feature/Pgsql/Concurrency/RadarTabBurstTest.php` (new)

## API contract

Legacy: `401 {"detail":"unauthorized"}`, `401 {"detail":"auth_expired"}`, `403 {"detail":"<reason>"}`,
`404 {"detail":"Not Found"}`, `429 {"detail":"rate_limited"}` + `Retry-After`. v1: the ADR-0007 envelope.

## Business rules

BR-API-004 … BR-API-016; SEC-REQ values marked *PROPOSED* in `16` are read from config so the tests survive the
decision.

## Acceptance criteria

- Every row of `16` §5.1, §5.2 and §5.7 is a test (real or `todo` with the blocking item named).
- `IdorCoverageTest` passes: no per-user route without a matrix row.
- For B vs U, status, body and query count are identical on every route.

## Tests

As listed. The matrix runs on SQLite; the burst on PostgreSQL.

## Edge cases

- A token for listing X presented for listing Y on `/call/<token>` → `404` (SEC-REQ-026).
- `PATCH` on another user's radar must not evaluate `no_chat` for the owner (`16` §5.2).
- `DELETE /api/hidden/{listing id}` instead of an author entry id → `404`, nothing removed.

## Security

Synthetic users only; tests never log `initData` (assert the fingerprint format instead, SEC-REQ-003).

## Definition of done

Tests green (`make ci-backend`, `make ci-backend-pgsql`), parity gate items ticked (15 §4, G6 for the listed
features), docs and the feature rows in 09 updated, PR reviewed by the other developer.
