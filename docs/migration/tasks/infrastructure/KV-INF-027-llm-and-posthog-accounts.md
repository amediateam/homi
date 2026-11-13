# KV-INF-027 — LLM keys, spend caps and PostHog projects per environment

| Field | Value |
| ----- | ----- |
| Status | BLOCKED (DEC-03 LLM vendor and its legal basis Q-SEC-006; DEC-26 PostHog projects) |
| Owner | DevOps (track: production — first developer approves), with the product owner for accounts and contracts |
| Complexity | S |
| Feature IDs | F-BOT-009, F-ANALYTICS-002 (and F-PIPELINE-002, F-LISTING-005 through the same LLM key) |
| Dependencies | DEC-03, DEC-26, Q-SEC-006; the LLM gateway with masking and caps (backend track, SEC-REQ-042 … SEC-REQ-044) reads the env names; stage S1 (`18` §5.1 Decisions row) |

## Goal

Each environment has its own LLM key with a vendor-side budget alert and an in-app daily cap, and its own PostHog
project (production keeps the legacy EU project so distinct ids continue), so free-text and voice queries, listing
extraction and translations run on staging without ever spending production budget or writing production analytics.

## Legacy reference

- Free text and voice parsed by Google Gemini, texts not stored, phones and handles masked (BR-BOT-055, BR-BOT-088,
  BOT-054, BOT-056); analytics in PostHog EU under random ids (BR-BOT-090).
- `17` §8 (one key per environment and vendor, `AI_DAILY_SPEND_LIMIT`, staging cap a small fraction), `17` §9
  (production = legacy EU project, staging separate, personal key server-only), env names `17` §4 rows LLM and PostHog.

## Implementation

1. After DEC-03: create the vendor project(s) and keys for staging and production (the product owner holds the
   contract); vendor-side budget alerts at 50 % and 80 % of the monthly budget.
2. Server `.env` names (values in the vault): `GEMINI_API_KEY` (or the chosen vendor's key), `AI_DEFAULT_PROVIDER`,
   `AI_DAILY_SPEND_LIMIT` (staging ≤ 5 % of production, `PROPOSED`).
3. After DEC-26: production `POSTHOG_PROJECT_KEY`, `POSTHOG_HOST`, `POSTHOG_PROJECT_ID` of the legacy EU project
   (custody transfer through KV-INF-014), `POSTHOG_PERSONAL_API_KEY` (person deletion only, server-only); a new staging
   project with its own keys; session replay off on staging.
4. Verify the in-app kill switch (Pennant flag of the gateway) can be flipped on servers by the production track.
5. Record in `docs/infrastructure/environments.md` (staging/production rows) which vendor and project each environment
   uses — names, never values.

## Files

- `docs/infrastructure/environments.md` (staging/production rows; production-owned)
- server `.env` on staging and production (outside the repository)

## API contract

Outbound only: the vendor's API from the gateway; PostHog capture and person-deletion APIs from the backend.

## Business rules

BR-BOT-055, BR-BOT-088 (masking happens in the gateway before any call), BR-BOT-090 (PostHog without Telegram id, name
or phone; deletion requested on erasure).

## Acceptance criteria

- Staging free-text parsing works with the staging key; the production key is not present on the staging host.
- Reaching the staging daily cap degrades as specified by the gateway (no extraction / free text answers the
  not-understood path), alert at 80 % fires (KV-INF-025).
- Staging events land in the staging PostHog project only.

## Tests

| # | Check | Expected |
| - | ----- | -------- |
| 1 | `php artisan security:check` (KV-INF-004) on staging | LLM and PostHog names present, lengths ok, no values printed |
| 2 | staging bot: send a free-text query | review screen; vendor dashboard shows a staging-project call |
| 3 | set `AI_DAILY_SPEND_LIMIT` to the current spend on staging | next query takes the degraded path |
| 4 | staging Mini App event | appears in the staging PostHog project, not production |

## Edge cases

- Vendor not approved by DEC-03 before S1: free text and voice ship behind the kill switch, off; the wizard still works.
- The legacy PostHog project cannot be transferred: DEC-26 falls back to a new project and distinct-id continuity is
  lost — recorded by the product owner.
- Keys rotated at S3 (`18` §11 step 3) if the legacy operator ever held them.

## Security

SEC-REQ-034 (per-environment secrets), SEC-REQ-042 … SEC-REQ-044 (masking, injection containment, caps — in code),
Q-SEC-006 (legal basis for cross-border processing).

## Definition of done

Keys and projects live per environment, checks recorded, DEC-03 and DEC-26 answers linked in the production notes,
`environments.md` rows updated.
