# KV-BE-001 — ADR: kvadro² compatibility surface

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend (track: development); review and acceptance by the first developer (production track) |
| Complexity | S |
| Feature IDs | F-COMPAT-001, F-ACCESS-001, F-LOCALE-001, F-LOCALE-003 |
| Dependencies | CF-001, CF-002, CF-006, CF-017, CF-018, CF-020; DEC-01 |

## Goal

One accepted ADR fixes how HOMI serves the unchanged legacy Mini App: a separate legacy route group at `/api/*` on the
legacy hosts only, the `{detail}` error dialect, the `tma` credential as a second credential limited to that group, the
`uz_Latn` mapping, server-side display formatting, the limiter classes, the hand-written legacy OpenAPI document and the
sunset rule. DEC-01 (contract freeze and sunset) is needed for acceptance, not for the draft. Every task KV-BE-005…KV-BE-050 cites this ADR instead of re-arguing the design.

## Legacy reference

- Contract the old client needs: bare JSON at relative `/api/*` (`$KVADRO_ROOT/demo/app/src/lib/api/client.js:74-106`;
  `08` §1.1, §1.4), `detail` read only when it is a string (`client.js:87-97`; BR-API-017), `403` reasons only on
  `GET /api/meta` (BR-API-011), `409 no_chat` vs limit (BR-API-021), no empty `200` (BR-API-020, LB-API-003),
  `next_cursor: null` as the only end signal (BR-API-022, LB-API-004).
- `Authorization: tma <initData>` on every request, no token (`client.js:77-78`; TMA-007; BR-API-004…010; LB-API-019,
  LB-API-020).
- Wire locale `uz_Latn` (BR-API-143, LB-API-048), server-formatted strings (BR-API-071…074, BR-API-146, LB-API-029).
- Request bursts: debounced count/flow, 30-request radar tab (`08` §1.6; LB-API-038, LB-API-052; Q-API-001).
- No published legacy spec (`$KVADRO_ROOT/demo/app/docs/RECOVERY.md:16`; `$KVADRO_ROOT/docs/about.md:404`).
- HOMI decisions it amends in scope only: ADR-0003 (one credential), ADR-0006 (formatting in clients), ADR-0007
  (envelope, prefix); the renderer that wraps every `api/*` path (`backend/app/Http/ApiExceptionRenderer.php:46-49`,
  `backend/bootstrap/app.php:48-52`).
- Decisions to record: `10` §3.2 (CF-001), §3.3 (CF-002), §3.7 (CF-006), §3.17 (CF-017), §3.18 (CF-018), §3.20 (CF-020);
  status table `10` §4.7; hosts `17` §3.1–§3.2; sunset rule proposal `10` §3.2 (DEC-01).

## Implementation

1. Read `docs/architecture/decisions/0000-adr-template.md`, ADR-0003, ADR-0006, ADR-0007, ADR-0011 and `10` §3.1–§3.3,
   §3.7, §3.17, §3.18, §3.20, §4.6–§4.8; read `.ai/agents/security-reviewer.md` for the credential section.
2. Take the next free ADR number (`ls docs/architecture/decisions/`; 0014 is reserved for HANDOFF T4;
   `docs/handoff/parallel-work.md` §5) and write `docs/architecture/decisions/NNNN-kvadro-compatibility-surface.md`
   with `Status: Proposed`.
3. **Decision** section, one rule per line: (a) route group `routes/legacy.php`, prefix `api`, middleware group
   `legacy`, served only on `config('legacy.app_hosts')` / `config('legacy.site_hosts')` (`/media`, `/api/csp-report` on
   both), refused elsewhere with `404 {"detail":"Not Found"}`; (b) its own renderer `LegacyExceptionRenderer` running
   before `ApiExceptionRenderer` with the `10` §4.7 status table; (c) `tma` credential accepted on this group only, one
   verifier shared with `POST /api/v1/auth/telegram` (T6), window `TELEGRAM_INITDATA_MAX_AGE` (86 400 s until Q-API-002,
   never below the measured legacy window); v1 and ARM answer `401` to `tma`, the legacy group `401` to `Bearer`;
   (d) `uz` internally, `uz_Latn` on the legacy wire; (e) server-side display strings from `backend/lang` shared with the
   bot; (f) limiter classes of SEC-REQ-027 keyed by internal user id; (g) `Cache-Control: private, no-store`, no CORS;
   (h) hand-written `docs/api/kvadro-legacy.openapi.yaml`, frozen at the contract freeze, never fed to the TS client;
   (i) the group owns no tables and imports nothing that imports it back (arch tests); (j) sunset rule of DEC-01.
4. **Consequences:** list the tasks it creates (KV-BE-005…KV-BE-013, KV-QA-004) and the env keys
   (`LEGACY_SURFACE_ENABLED`, `LEGACY_APP_HOSTS`, `LEGACY_SITE_HOSTS`, `TELEGRAM_INITDATA_MAX_AGE`); record that the
   token rotation at S2 invalidates open `initData` (SEC-REQ-012) and expects a short `401` spike.
5. **Alternatives:** CF-001 B and C, CF-002 B and C, CF-006 B, CF-017 B, CF-020 B with the reasons of `10` §2.1.
6. Open a docs-only PR (`docs/adr-compatibility-surface`), ask the first developer for review; record DEC-01 as an open
   item in the ADR and in `.ai/memory/session-handoff.md` ("Waiting for the developer") until answered. Set
   `Status: Accepted` only after approval.

## Files

- `docs/architecture/decisions/NNNN-kvadro-compatibility-surface.md` (new)
- `docs/architecture/decisions/README.md` (index row, if the index lists ADRs)

## API contract

The ADR fixes the dialect every legacy endpoint follows: bare JSON bodies; errors `{"detail": "<string>"}` with
`422 invalid_<field>`, `401 unauthorized` / `auth_expired`, `403 private|invite|full|blocked|join`, `404 Not Found`,
`405 Method Not Allowed`, `409 no_chat` / `subscription_limit`, `429 rate_limited` (+ `Retry-After`),
`500 internal_error`; `204` only where BR-API-020 allows it; integer listing ids; `uz_Latn` locale code;
`Cache-Control: private, no-store`. Endpoint shapes stay in `08` and the legacy OpenAPI document (KV-BE-012/013).

## Business rules

Kept: BR-API-001, BR-API-004, BR-API-005, BR-API-008, BR-API-009, BR-API-010, BR-API-017, BR-API-019…023, BR-API-143,
BR-API-146, BR-API-151. Defect fixes recorded as policy-approved (`09` §4.3): LB-API-001, LB-API-003, LB-API-004,
LB-API-020, LB-API-022 (string `detail` for `422`), LB-API-048. DEV-002 (`auth_expired` window) is `PROPOSED` and named
as an open item, not decided by the ADR.

## Acceptance criteria

- The ADR exists with every rule of step 3, the alternatives of step 5 and the env keys of step 4.
- It states which clauses of ADR-0003, ADR-0006 and ADR-0007 it narrows (scope only — those ADRs stay valid for v1).
- DEC-01 appears either answered (with date and decider) or as an explicit open item that blocks only the sunset
  clause.
- The first developer approved the PR; the status line reads `Accepted` with the date.

## Tests

No code. Review checklist in the PR: every row of the `10` §4.7 table appears; every CF listed in the header has a
decision line; the ADR names the tests that enforce it — `tests/Feature/LegacyApi/LegacyRendererTest.php` and
`tests/Arch/LegacySurfaceTest.php` (KV-BE-005), `tests/Feature/Identity/TmaGuardTest.php` (KV-BE-007),
`tests/Feature/LegacyApi/LegacyRateLimitTest.php` (KV-BE-010), the contract harness of KV-QA-004.

## Edge cases

- `GET /api/bot`, `/media`, `/call`, `/api/csp-report` are anonymous members of the group: the ADR lists them as
  exceptions to the `tma` rule.
- The renderer must also cover unmatched `api/*` paths on legacy hosts (no route, so no middleware marker).
- If CF-008 ends with a different host plan, only the host list changes, not the ADR's rules.

## Security

SEC-REQ-001…005 (credential), SEC-REQ-027 (limits), SEC-REQ-032 (no CORS), SEC-REQ-033 (`no-store`), SEC-REQ-047
(`Authorization` never logged). The credential section is reviewed against `.ai/agents/security-reviewer.md`.

## Definition of done

Tests green (`make ci-backend`), parity gate items ticked (15 §4), docs and the feature row in 09 updated, PR reviewed
by the other developer. Additionally: ADR merged with `Status: Accepted` (or `Proposed` plus the list of open DEC items
in `session-handoff.md`); `10` CF-001/002/006/017/018/020 rows point at the ADR number.
