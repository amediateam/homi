# KV-BE-051 — Owner listing lifecycle: publish, statuses, limits and moderation

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend (track: development) |
| Complexity | L |
| Feature IDs | F-OWNER-005, F-OWNER-006 |
| Dependencies | KV-BE-018, KV-BE-025, KV-BE-050; decisions DEC-70, DEC-72, DEC-73, DEC-77, DEC-81 |

## Goal

A HOMI owner listing moves through its statuses by the rules of `02` BR-API-174 … BR-API-177 with HOMI's
post-moderation: publish runs the automatic checks, the listing is active at once, votes and operators can hold or
withdraw it.

## Legacy reference

`08` API-044 … API-046; `02` BR-API-173 … BR-API-178; `03` LB-APP-056, LB-APP-059, LB-APP-065; screens `03` SCR-055,
SCR-056, SCR-057, SCR-059. The legacy server was never seen: whether anything is checked before a listing goes live is
`UNVERIFIED` (Q-API-071), and so is the effect of each status (Q-API-070).

## Implementation

Built by the Wave 1 packages WP-84 (service, commands) and WP-89 (the operators' notice); this file is the register
entry. The steps are those of WP-84: publish with the automatic checks (required fields, a number, the limits, the
realtor and fraud checks of DEC-77, `PhoneMasker` on the description, the point check); the statuses and their
effects; `held` and `withdrawn` by votes and by the operators' console commands; the switch of DEC-81.

## Files

As listed in WP-84 (owner listing service, status actions, console commands) and WP-89 (the operators' notice).

## API contract

`POST /api/v1/owner/listings/{id}/publish`, `PUT /api/v1/owner/listings/{id}/status`,
`PUT /api/v1/owner/listings/{id}/contact-mode`, `DELETE /api/v1/owner/listings/{id}` — the contract of WP-80.

## Business rules

Keep BR-API-174 … BR-API-178 as WP-84 words them for HOMI; apply DEV-055 (a new listing starts in `request` mode) and
DEV-056 (a way forward after a rejection), both `APPROVED` (DEC-74), and DEV-062 (`APPROVED`, DEC-80).

## Acceptance criteria

The acceptance of WP-84: a published listing is active at once; `held` and `withdrawn` cannot be resumed by the
owner; nothing leaves `rented` or `removed`; publishing, creating a draft and asking for the phone answer
`403 owner_disabled` while `OWNER_CABINET_ENABLED` is off, and every status action still works.

## Tests

Feature tests of WP-84: each rejection, the limits per account and per phone, every status transition, the IDOR rows
of the owner methods (KV-QA-015).

## Edge cases

A `paused` listing published again stays paused; a `rejected` listing is published again only after the operators
release it; a draft and a rejected listing are deleted, nothing else (WP-84).

## Security

SEC-REQ-045 (rules that label people), SEC-REQ-051 (the owner's number); ownership on every owner method.

## Definition of done

WP-84 and WP-89 are `DONE` in `wave-1/README.md`, and the row of F-OWNER-005 and F-OWNER-006 in `09` is updated.
