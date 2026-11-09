# KV-QA-022 — Smoke tests per environment and the device pass

| Field | Value |
| ----- | ----- |
| Status | TODO (staging and production parts wait for those environments) |
| Owner | QA (track: development) for local; DevOps / production track for staging and production |
| Complexity | M |
| Feature IDs | F-TMA-001 … F-TMA-009, F-BOT-001, F-BOT-012, F-COMPAT-001, F-MEDIA-001, F-MEDIA-002, F-ONBOARD-001 |
| Dependencies | KV-QA-014 (Smoke configuration); T1 (webhook) for webhook probes; staging (production track) for the staging list |

## Goal

Each environment has a short, read-only smoke list that proves the legacy surface answers after every deploy, and a
manual device pass with real Telegram clients runs before each release on the dev or staging bot.

## Legacy reference

- Legacy-surface essentials: API-001 (`GET /api/meta`), API-003 (`GET /api/bot`, no auth), RES-001 (signed media),
  RES-019 (`sitemap.xml`), RES-020 (`robots.txt`), RES-022 (bot update endpoint).
- Telegram integration points: TMA-001 … TMA-045 (`05`), boot and fallback paths (TMA-001 … TMA-005, TMA-041 …
  TMA-043); old WebView targets `chrome80` / `safari13.1` (`$KVADRO_ROOT/CLAUDE.md:62`).
- Environments and bots: `14` P12, CF-009, `docs/handoff/parallel-work.md` (staging bot approval each time).

## Implementation

1. Local: extend `make dev-check` (`scripts/dev/check.sh`) with legacy-surface probes once the routes exist:
   `GET /api/bot` → `200` with `username`; `GET /api/meta` without auth → `401 {"detail":…}`; webhook without secret →
   `403`; a media URL signed with the local key → `200 image/jpeg`.
2. `backend/tests/Smoke/EnvironmentSmokeTest.php` (Smoke configuration of KV-QA-014): the same probes plus `/up`,
   `robots.txt`, three SEO URLs, `sitemap.xml` reachable; parameterised by base URLs; read-only.
3. Staging checklist `docs/testing/staging-smoke.md` (production track owns the run): the smoke suite against staging
   hosts; a reference-client run with a staging test account's `initData` pasted by the developer; the bot list
   (`/start`, `/new` to the review, `/subs`, `/settings`, an old-message callback → TXT-BOT-039); `getWebhookInfo` on
   the staging bot. Each use of the staging bot needs the production track's approval.
4. Production post-deploy checklist in the same file: `/up`, `GET /api/bot`, one signed media URL, `robots.txt`, three
   SEO URLs, `getWebhookInfo` — **needs developer approval: touches production**; read-only; no test account
   mutations.
5. Device pass `docs/testing/device-pass.md`: Telegram iOS, Android (one current, one with an old system WebView),
   Desktop, Web; per client the TMA items that are observable (boot, theme, BackButton stack, SettingsButton,
   fullscreen and safe areas, haptics, `showConfirm`, `openLink` / `openTelegramLink`, `shareMessage`,
   `requestWriteAccess` after `409 no_chat`, location, home-screen offer, `DeviceStorage`, close); result table with
   date, client version, pass/fail and notes; run on the dev bot (needs the T1 tunnel) or the staging bot.
6. Record each run in `docs/testing/verification-log.md` in its existing table format.

## Files

- `scripts/dev/check.sh` (probes)
- `backend/tests/Smoke/EnvironmentSmokeTest.php` (new)
- `docs/testing/staging-smoke.md`, `docs/testing/device-pass.md` (new)
- `docs/testing/verification-log.md`

## API contract

Probes only read: API-001 (status only, no auth), API-003, RES-001, RES-019, RES-020; webhook probe without secret.

## Business rules

BR-API-009 (`/api/bot` without auth), BR-API-010 (empty `tma ` rejected), BR-API-008 (`initData` bound to the bot).

## Acceptance criteria

- `make dev-check` shows the legacy-surface probes as PASS on a local stack with the routes built.
- The Smoke test runs green against the local stack.
- Staging and production checklists are reviewed and accepted by the production track.
- The device-pass template covers every observable TMA item; the first pass is recorded.

## Tests

`EnvironmentSmokeTest`; the manual lists above.

## Edge cases

- The webhook probe on production must not create a `telegram_updates` row (it has no secret → `403` before parsing).
- Old Android WebViews may lack features the new Mini App uses; failures there are release blockers only for P0
  features (`09` §2.1).
- After the bot token rotation at cut-over (SEC-REQ-012), old `initData` must fail — part of the cut-over smoke.

## Security

No credentials in smoke runs; `initData` for staging is pasted by a person and never stored; production probes are
read-only and approved.

## Definition of done

Tests green (`make ci-backend`; local smoke recorded), parity gate items ticked (15 §4, G9 evidence on staging), docs
and the feature rows in 09 updated, PR reviewed by the other developer.
