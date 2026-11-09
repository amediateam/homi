# KV-FE-153 — ARM report and vote moderation

| Field | Value |
| ----- | ----- |
| Status | BLOCKED (DEC-22, OPQ-4; scope `UNVERIFIED`) |
| Owner | Frontend (track: development) |
| Complexity | M |
| Milestone | FE-4 (M9, after S2) |
| Feature IDs | F-ADMIN-003, F-REPORT-003 |
| Dependencies | KV-FE-150; KV-BE-043 (votes and reports); the ARM moderation endpoints (unnumbered); DEV-010 `PROPOSED`, Q-API-058, DEC-22 |

## Goal

A moderator can review reports and votes (`rented`, `agent`, `wrong_data`, `fraud`), see why a phone got a realtor
label, and revert a wrong label with an audit record — the review path that DEV-010 and SEC-REQ-045 require.

## Legacy reference

- Reports from the Mini App (API-016, SCR-023) and bot votes (F-REPORT-002); vote weighting and thresholds unknown
  (F-REPORT-003, Q-API-039 via `09`); moderation tooling not visible (Q-API-058). F-ADMIN-003 is `DEFER` until the
  product owner decides (OPQ-4).
- DEV-010 (weighted threshold, undo, honest wording), SEC-REQ-045 (one tap never relabels a number; dispute path for
  verified owners; audit trail).

## Implementation

1. `/votes`: queue of listings and phones with recent reports, grouped by reason, with counts of distinct voters and
   the current derived state (hidden for others, realtor label).
2. Detail view: vote timeline (internal user ids only), the threshold rule in force, actions "revert label", "dismiss
   reports", "confirm" — each with a reason and confirmation.
3. Disputes from verified owners (when the API provides them) appear at the top.

## States and texts

New ARM copy (`arm.votes.*`). States: queue loading, empty queue, detail error, action success with audit reference.

## Interaction

Desktop list/detail; keyboard shortcuts optional; no gestures.

## Telegram integration

n/a.

## Storage and analytics

None on the client.

## Files

- `frontend/arm/app/(console)/votes/page.tsx`, `frontend/arm/app/(console)/votes/[id]/page.tsx` (new)

## API contract

Unnumbered ARM endpoints over the vote store of KV-BE-043; v1 envelope.

## Business rules

DEV-010 `PROPOSED`, SEC-REQ-045; reasons from API-016 (`rented`, `agent`, `wrong_data`, `fraud`).

## Acceptance criteria

- A moderator can revert a realtor label and the Mini App badge (KV-FE-047) and owner filters reflect it on the next
  request; the audit log has the record.
- Voter identities appear only as internal ids.

## Tests

E2E with a mocked API: queue → detail → revert; dismiss; forbidden for a role without `arm:moderate`.

## Edge cases

Votes on a withdrawn listing; a phone with labels from many listings; concurrent moderation by two operators (server
conflict answer shown).

## Security

SEC-REQ-045, SEC-REQ-046, SEC-REQ-036.

## Definition of done

As KV-FE-150, plus the F-ADMIN-003 row of `09` updated when the product owner moves it out of `DEFER`.
