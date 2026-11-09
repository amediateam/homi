# KV-FE-152 — ARM takedowns and channel opt-outs

| Field | Value |
| ----- | ----- |
| Status | BLOCKED (DEC-22; scope `UNVERIFIED`) |
| Owner | Frontend (track: development) |
| Complexity | M |
| Milestone | FE-4 (M9, after S2) |
| Feature IDs | F-ADMIN-002, F-PIPELINE-001 |
| Dependencies | KV-FE-150; KV-BE-138 (takedowns and phone opt-outs), KV-BE-126 (channel registry and opt-outs); the ARM endpoints over them (unnumbered); Q-SEC-007 (takedown SLA), DEC-22 |

## Goal

Operators handle authors' and channel admins' requests in ARM: take a listing down by post link, listing number or
phone, add a phone opt-out, opt a channel out — and see that the takedown reached every surface (feed, map, SEO pages,
landing data, delivered cards).

## Legacy reference

- BR-API-043 (author blocking semantics), BR-API-068 (on request the listing leaves feed, map, site and alerts);
  privacy promises on `privacy.html` (LND-003: takedowns via `@KvadroSupportBot` or the mailbox); SEC-REQ-040.
- F-ADMIN-002 acceptance (`09`): takedown removes the listing from every surface and edits sent cards; opt-out stops new
  listings from the channel. F-PIPELINE-001 "arm: sources".
- Server side: KV-BE-138, KV-BE-126.

## Implementation

1. `/listings`: search by listing number, post link (`t.me/<channel>/<post>`) or phone (typed, hashed server-side; the
   phone is never displayed back); result card with status, sources and the takedown action.
2. Takedown form: reason, requester channel (support bot / e-mail), confirmation; shows the per-surface progress the
   server reports (feed/map, SEO, landing data, photos, delivered-card edits queued).
3. `/channels`: channel registry list (handle, city, flags, status), opt-out action with confirmation, review queue of
   unknown channels (KV-BE-126).
4. Phone opt-out list: add by typed number (stored as HMAC by the server), remove with confirmation.

## States and texts

New ARM copy (`arm.content.*`). States: search empty, not found, taken down (read-only), in progress, error with
request id, success with audit reference.

## Interaction

Desktop tables; search box focused on open; danger styling for takedown and opt-out.

## Telegram integration

n/a (links to `t.me/<channel>/<post>` open in a new tab for review, URL-059).

## Storage and analytics

None on the client; audit log on the server.

## Files

- `frontend/arm/app/(console)/listings/page.tsx`, `frontend/arm/app/(console)/channels/page.tsx` (new)
- `frontend/arm/e2e/takedown.spec.ts`

## API contract

Unnumbered ARM endpoints over KV-BE-138 / KV-BE-126; v1 envelope.

## Business rules

BR-API-068 (removal everywhere), SEC-REQ-040 (rights of authors, SLA per Q-SEC-007), SEC-REQ-025 (photos and snapshots
erased).

## Acceptance criteria

- A takedown of a seeded listing removes it from the Mini App feed and map, the SEO cards and the landing data of the
  next build; the UI shows each step as done.
- A channel opt-out stops new listings from that channel (intake refuses them) and hides its existing ones.
- No phone number is ever rendered after entry.

## Tests

E2E with a mocked API: takedown by number, by post link, by phone; opt-out; idempotent repeat.

## Edge cases

A merged listing (alias → survivor): the takedown applies to the survivor; a post link that resolves to no listing; a
request for a channel already opted out.

## Security

SEC-REQ-046, SEC-REQ-040, SEC-REQ-036, SEC-REQ-047; SEC-REQ-019 (only `https://t.me/` links rendered as links).

## Definition of done

As KV-FE-150, plus the F-ADMIN-002 parity-gate row ticked for G4.
