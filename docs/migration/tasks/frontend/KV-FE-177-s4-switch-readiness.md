# KV-FE-177 — S4 canary and switch readiness

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Frontend (track: development); hosting, BotFather and canary menu buttons **[PT]** |
| Complexity | M |
| Milestone | FE-5 (M9, stage S4) |
| Feature IDs | F-TMA-001, F-LANDING-001, F-SHARE-002 |
| Dependencies | KV-FE-170, KV-FE-171, KV-FE-172, KV-FE-173, KV-FE-174, KV-FE-175; KV-INF-023 (deploy pipeline, **[PT]**); FD-2 |

## Goal

A written, rehearsed plan to put the new Mini App and the new landing in front of users — a canary cohort first, then
everyone — with budgets that stop the rollout and a rollback that swaps the legacy files back within minutes.

## Legacy reference

- `18` §12.1 (S4: canary on the same origin under a separate path or sub-host, opened for a cohort through per-chat menu
  buttons; full switch at the origin root; BotFather Main Mini App URL unchanged unless the URL changes; `kv-*` keys
  kept; rollback = swap the root back).
- Mini App origin `https://app.kvadro.app/[?listing=<id>][?news=<code>]` (URL-057; old `web_app` buttons point at the
  root, Q-LND-009, Q-APP-019); landing hosts per `17` §3.
- Budgets `10` §5.12 (startup p75, crash rate, support requests).

## Implementation

1. Canary routing: the new Mini App build served under a canary path or sub-host on the Mini App origin **[PT]**; a cohort
   list of test users gets per-chat menu buttons via `setChatMenuButton` **[PT]** (telegram track).
2. Pre-flight checklist: E2E (KV-FE-170) green, visual review complete (KV-FE-171), behaviour comparison clean
   (KV-FE-172), budgets met (KV-FE-173), device pass complete (KV-FE-174), landing parity complete (KV-FE-175), CSP report
   endpoint quiet on staging.
3. Canary metrics from existing signals: `app_launch.ms` p75, `app_error` reports per session (ErrorBoundary and boot),
   `403`/`401` rates, support messages; stop conditions written as numbers.
4. Full switch: the origin root serves the new app; old `web_app` buttons and `startapp` links open it (deep-link router
   KV-FE-037 accepts every legacy form); `kv-*` keys and DeviceStorage values carry over.
5. Rollback runbook: swap the root back to the legacy artefacts (KV-INF-010 manifest) and clear the CDN for the shell;
   the legacy surface is still live (S5 not reached). For FD-2 = B also confirm the v1 adapters stay up.
6. Landing: replace the mirrored legacy files after KV-FE-175; the SEO pages are already HOMI's since S2.

## States and texts

n/a.

## Interaction

n/a.

## Telegram integration

Menu button and Main Mini App URL handling (BotFather) **[PT]**; `startapp` and `?listing=` entry links (TMA-010…TMA-012).

## Storage and analytics

`kv-*` continuity; PostHog distinct id continuity (DEC-26); analytics event names unchanged.

## Files

- `docs/migration/runbooks/s4-new-frontends.md` (new runbook; or a section in `18` if its owner prefers)

## API contract

n/a.

## Business rules

Migration policy: public links and deep links keep working (`README.md`); no client setting lost (`03` §3.2).

## Acceptance criteria

- The runbook has numeric stop conditions, a named decision maker per step and a rollback rehearsed on staging **[PT]**.
- A canary user and a non-canary user can both open old shared links and get the right client.
- After rollback, a user who used the new app opens the legacy app with the same `kv-*` settings.

## Tests

Staging rehearsal of canary on/off and rollback; link-opening checks for URL-052…URL-057.

## Edge cases

A user in the canary cohort opens a listing link from an old message (root URL) — gets the root client of the moment;
cached shell in the WebView after rollback (cache headers `index.html no-cache`, `17` §3).

## Security

CSP of both clients active during the canary; no credential carried between clients (SEC-REQ-007).

## Definition of done

Runbook merged and rehearsed; S4 go/no-go recorded with the product owner and the first developer.
