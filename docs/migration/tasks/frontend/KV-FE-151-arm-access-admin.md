# KV-FE-151 — ARM access administration

| Field | Value |
| ----- | ----- |
| Status | BLOCKED (DEC-22; scope `UNVERIFIED`) |
| Owner | Frontend (track: development) |
| Complexity | M |
| Milestone | FE-4 (M9, after S2) |
| Feature IDs | F-ADMIN-001 |
| Dependencies | KV-FE-150; KV-BE-011 (the same operations as artisan commands), KV-BE-009 (access gate); the ARM access endpoints (unnumbered); DEC-22, DEC-25 (access mode at S2), Q-API-006 |

## Goal

Operators manage closed-beta access in ARM instead of the shell: switch the access mode, set the seat limit, issue and
revoke invite links, maintain the owner list, block and unblock a user — each action audited — mirroring the commands
of KV-BE-011 one to one.

## Legacy reference

- The five reasons the gate returns: `private`, `invite`, `full`, `blocked`, `join` (BR-API-011…BR-API-016; API-001
  errors; SCR-003). The operations are inferred, not observed (Q-SYS-004, Q-API-006, Q-API-058; GAP-020).
- F-ADMIN-001 acceptance (`09`): "operator can switch beta mode, issue an invite, set the seat limit and block/unblock a
  user; each action audited".
- Invite tokens are migrated as hashes and must keep working (`14` §3; ENT-004).

## Implementation

1. Pages `/beta` (mode, seat limit, invite links with usage counts) and `/users` (search by internal user id or by a
   Telegram id typed by the operator — never listed in clear; block / unblock; owner flag) in `frontend/arm/app/(console)/`.
2. Every mutation: confirmation dialog stating the effect (e.g. "blocked users get «Доступ к приложению закрыт.» in the
   Mini App and no bot actions", SEC-REQ-006), then the API call, then the audit reference.
3. Invite link creation shows the full link once (copy button) and afterwards only its prefix and counters.
4. Mode change shows the current seat usage and how many waiting users a change would admit.

## States and texts

New ARM copy (`arm.access.*`, new keys). States: loading table, empty search, error with request id, success toast,
disabled controls for roles without `arm:access`.

## Interaction

Desktop tables with filters in the URL; keyboard-operable switches; destructive actions styled as danger.

## Telegram integration

n/a.

## Storage and analytics

None on the client; the server writes the audit log (SEC-REQ-046).

## Files

- `frontend/arm/app/(console)/beta/page.tsx`, `frontend/arm/app/(console)/users/page.tsx` (new)
- `frontend/arm/tests/access.test.tsx`, `frontend/arm/e2e/access.spec.ts`

## API contract

Unnumbered ARM endpoints matching the KV-BE-011 operations (mode, seats, invites, owners, block/unblock), v1 envelope
(ADR-0007); `403` for missing abilities.

## Business rules

BR-API-011…BR-API-016 are enforced by the server; the UI only explains their effect. DEC-25 sets the mode at S2.

## Acceptance criteria

- Each KV-BE-011 operation is reachable in ARM and produces the same server effect and audit record.
- Blocking a test user makes the Mini App show the `blocked` state of KV-FE-042 on its next request.
- No Telegram id is rendered in any list; search by id returns at most the matching user.

## Tests

Component tests per form; E2E with a mocked API for each operation and the forbidden case.

## Edge cases

Seat limit below the current usage (server decides; UI shows the answer); revoking an invite already used; blocking an
admin (refused by the server).

## Security

SEC-REQ-046, SEC-REQ-006, SEC-REQ-036 (minimisation: no names or usernames shown), SEC-REQ-047.

## Definition of done

As KV-FE-150, plus the F-ADMIN-001 parity-gate row ticked for G4.
