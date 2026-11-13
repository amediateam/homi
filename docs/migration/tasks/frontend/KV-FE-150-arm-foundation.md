# KV-FE-150 — ARM foundation: Telegram sign-in, TOTP, roles, layout

| Field | Value |
| ----- | ----- |
| Status | BLOCKED (DEC-22; scope `UNVERIFIED`) |
| Owner | Frontend (track: development) |
| Complexity | M |
| Milestone | FE-4 (M9, after S2) |
| Feature IDs | F-ADMIN-001 |
| Dependencies | DEC-22 (roles, admin list, TOTP), OPQ-4; the ARM authentication endpoints (unnumbered ARM API, GAP-023); KV-FE-011, KV-FE-012, KV-FE-015 (shared tokens, primitives, i18n) |

## Goal

`frontend/arm` has a working shell for operators: Telegram Login Widget sign-in followed by a mandatory TOTP step, a
role-aware navigation for the operations the audit inferred (GAP-023), request-id error display and `noindex`
everywhere — so the screens of KV-FE-151…KV-FE-154 can be added one by one once their API exists.

## Legacy reference

- No legacy admin UI or tooling is visible (Q-SYS-004, Q-API-058); operations are implied by the access reasons and the
  privacy promises: beta seats and invites, user blocking, takedowns, channel opt-outs, service-news broadcasts, vote
  moderation (GAP-023; BR-API-016, BR-API-043, BR-API-068, BR-API-148).
- Planned ARM routes: `10` §5.3 (`/login`, `/listings`, `/channels`, `/votes`, `/users`, `/beta`, `/broadcasts`,
  `/stats`, `/audit`); Server/Client split `10` §5.4 (bearer token in memory, so data screens are Client Components).
- Security baseline: SEC-REQ-046 (Telegram sign-in + mandatory TOTP, roles moderator / operator / admin, `arm:*` token
  abilities, short expiry, append-only audit log), SEC-REQ-004 (`tma` never accepted on ARM routes), Q-SEC-018 (legacy
  owner/team lists are not imported as admins without review).
- Until ARM exists, operators use the artisan commands of KV-BE-011.

## Implementation

1. Read `frontend/arm/node_modules/next/dist/docs/01-app/02-guides/authentication.md`,
   `…/authentication-with-cache-components.md`, `…/03-api-reference/03-file-conventions/{layout,route-groups,proxy}.md`.
2. Replace the `create-next-app` page and Geist fonts of `frontend/arm` (`10` §7 "Next apps (blank)") with a root layout
   using the tokens of `@homi/ui` (KV-FE-011) and `<meta name="robots" content="noindex,nofollow">` plus an
   `X-Robots-Tag` header from `next.config.ts` (ADR-0013).
3. `/login`: Telegram Login Widget (script from `telegram.org`, allowed in the ARM CSP) → `POST` of the signed widget
   payload to the ARM auth endpoint → TOTP code form → short-lived `arm:*` bearer token kept **in memory only**
   (SEC-REQ-007 applies by analogy); a reload signs the operator out.
4. A typed client on `@homi/api-client` (v1 envelope, ADR-0007) with `onUnauthorized` → back to `/login`; every error
   shows the backend request id (`10` §5.14).
5. Navigation filtered by role (from the token's abilities): sections appear only when the role may use them; pages
   for which no API exists render "not available yet".
6. Shared table and filter components with filters in the URL so links can be shared between moderators (`10` §5.5).
7. Each action that mutates state asks for a confirmation and shows the audit-log reference returned by the server.

## States and texts

ARM copy is new (no legacy strings): ru first, uz and en from the shared catalogue mechanism of KV-FE-015 with new
keys under an `arm.*` family (new keys, not in legacy).

| State | Shown when | Behaviour |
| ----- | ---------- | --------- |
| signed out | no token in memory | `/login` with the widget |
| TOTP required | widget accepted | code form; 5 wrong codes → server lock message |
| loading | any data screen fetching | skeleton rows |
| empty | list with no rows | "nothing to review" message |
| error | non-2xx | message + request id + retry |
| forbidden | role lacks the ability | section hidden; a direct URL shows "no permission" |
| success | action done | toast with the audit reference |

## Interaction

Desktop first (`10` §5.11): left navigation, wide tables, keyboard-accessible controls; usable down to 1 024 px. No
gestures. Sign-out on tab close by construction (token in memory).

## Telegram integration

n/a for the WebApp SDK. The Telegram Login Widget is used for sign-in only.

## Storage and analytics

No `localStorage`/cookies for credentials; no PostHog in ARM (operators' actions are recorded in the server audit log,
SEC-REQ-046).

## Files

- `frontend/arm/app/layout.tsx`, `frontend/arm/app/login/page.tsx`, `frontend/arm/app/(console)/layout.tsx` (new)
- `frontend/arm/lib/api.ts`, `frontend/arm/lib/session.ts` (in-memory token), `frontend/arm/next.config.ts` (headers)
- `frontend/arm/tests/session.test.ts`, `frontend/arm/e2e/login.spec.ts` (after KV-FE-010)

## API contract

Unnumbered ARM endpoints (to be specified with DEC-22): widget-payload exchange, TOTP verification, token refresh,
`GET` of the operator's abilities. v1 envelope `{success, data}` / `{success:false, message, errors, code}` (ADR-0007).
`tma` credentials are refused on every ARM route (SEC-REQ-004).

## Business rules

No legacy rule exists for ARM; GAP-023 lists the operations. Roles and the admin list come from DEC-22.

## Acceptance criteria

- Without TOTP no ARM page except `/login` renders data; a token from a Mini App session is refused.
- A reload loses the session; no credential is found in `localStorage`, `sessionStorage`, IndexedDB or cookies.
- Every page sends `noindex` and the ARM CSP forbids framing (`frame-ancestors 'none'`, SEC-REQ-033).
- Role filtering: an operator without `arm:broadcast` sees no broadcast section and a direct URL shows "no permission".

## Tests

Unit: session store keeps the token only in memory; ability → navigation mapping. E2E (with mocked ARM API): login →
TOTP → console; wrong TOTP; expired token → `/login`; forbidden section by URL.

## Edge cases

Clock skew on TOTP (server tolerance), widget blocked by the browser (show a hint), two tabs (each signs in separately).

## Security

SEC-REQ-046 (TOTP, roles, audit), SEC-REQ-004, SEC-REQ-007 (by analogy: memory-only token), SEC-REQ-021 (text-only
rendering of user data in tables), SEC-REQ-033 (headers), SEC-REQ-047 (no PII in client logs).

## Definition of done

Unblocked by DEC-22 and the ARM auth API; `make ci-frontend` green; E2E green after KV-FE-010; security review of the
sign-in flow by the security-reviewer agent; PR reviewed by the other developer.
