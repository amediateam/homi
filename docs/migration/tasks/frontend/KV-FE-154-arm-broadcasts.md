# KV-FE-154 — ARM service-news broadcasts

| Field | Value |
| ----- | ----- |
| Status | BLOCKED (DEC-22; scope `UNVERIFIED`) |
| Owner | Frontend (track: development) |
| Complexity | M |
| Milestone | FE-4 (M9, after S2) |
| Feature IDs | F-DELIVERY-008 |
| Dependencies | KV-FE-150; the broadcast job and its ARM endpoints (unnumbered, backend M4, F-DELIVERY-008); DEC-22 |

## Goal

An admin composes a service-news message in ru/uz/en, previews it as the bot will send it, sends it to the users who
opted in, and watches throttled progress — the sender tool that legacy had but nobody saw.

## Legacy reference

- F-DELIVERY-008 (`UNVERIFIED`): operator sends news → users with «Присылать» receive it; the sender tool is unknown;
  bot message BOT-084, text TXT-BOT-088; the opt-in lives in the bot `/settings` (F-SETTINGS-006).
- BR-API-148 (news opt-in), SEC-REQ-029 (outbound pacing, resumable broadcasts).
- The Mini App's `?news=<code>` entry (TMA-012) links a broadcast to a Mini App feature (e.g. `?news=pets`, BR-APP-057).

## Implementation

1. `/broadcasts`: list of drafts and sent broadcasts with counters (targeted, sent, failed, blocked).
2. Composer: one text per locale (ru required), optional `web_app` button with a `?news=<code>` parameter chosen from
   the codes the Mini App understands (KV-FE-037), Telegram-HTML preview with the length limits (4 096 characters).
3. "Send" requires admin role + confirmation with the audience size; progress view polls the job state; pause and
   resume.

## States and texts

New ARM copy (`arm.broadcast.*`). States: draft, sending (progress), paused, done, failed with reason.

## Interaction

Desktop form with live preview; no gestures.

## Telegram integration

The preview mimics Telegram HTML rendering; the actual sending is the bot's job (SEC-REQ-029).

## Storage and analytics

None on the client.

## Files

- `frontend/arm/app/(console)/broadcasts/page.tsx`, `frontend/arm/app/(console)/broadcasts/new/page.tsx` (new)

## API contract

Unnumbered ARM endpoints for drafts, send, pause/resume and progress; v1 envelope.

## Business rules

BR-API-148 (only opted-in users), SEC-REQ-029 (pacing within Telegram limits; resumable).

## Acceptance criteria

- A broadcast reaches only opted-in test users of the staging bot **[PT]** and respects the opt-out immediately.
- The preview equals the message the fake Bot API receives in the backend test (same HTML).
- `?news=` codes offered are only those the Mini App handles.

## Tests

Component: composer validation (length, required ru); E2E with a mocked API: draft → send → progress → done; pause.

## Edge cases

A locale text missing (falls back to ru, warned before sending); a broadcast resumed after a deploy; users who blocked
the bot (counted as failed, not retried).

## Security

SEC-REQ-046 (admin only, audited), SEC-REQ-020 (HTML escaping by the bot), SEC-REQ-029.

## Definition of done

As KV-FE-150, plus the F-DELIVERY-008 parity-gate row ticked for G4.
