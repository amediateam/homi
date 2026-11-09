# KV-FE-035 — PostHog analytics and screen tracking

| Field | Value |
| ----- | ----- |
| Status | BLOCKED (approval) |
| Owner | Frontend (track: development) |
| Complexity | M |
| Milestone | FE-1 (M9, stage S4) |
| Feature IDs | F-ANALYTICS-002 |
| Dependencies | KV-FE-005 (`posthog-js` 1.434.15 — PROPOSED, needs approval (dependency change)), KV-FE-025 (screen state); uses KV-FE-027 (lite: no replay), KV-FE-034 (render-error hook); related: KV-FE-040 passes `meta.analytics` to `initAnalytics`; backend KV-BE-152 (server capture, person deletion); decisions DEC-26 (FD-9: PostHog project), FD-2 |

## Goal

The new Mini App loads PostHog lazily with the legacy privacy settings (memory persistence, identified by the
server-issued random id, hashes and `initData` scrubbed) and sends `$pageview` with the 16 legacy screen names, plus
screen names for the layers legacy never tracked (LB-APP-037), so existing dashboards keep working at S4.

## Legacy reference

- `$KVADRO_ROOT/demo/app/src/lib/analytics.js:7-197` (lazy load 0.5 s after first content or 8 s; Save-Data / 2g skip;
  `history.replaceState` dropping the hash; init options; `before_send`; `trackScreen` dedupe; pending pageview;
  super properties); `$KVADRO_ROOT/demo/app/src/app/useScreenTracking.js:26-44` (screen precedence);
  `$KVADRO_ROOT/demo/app/src/components/Photo.jsx:38-42` (`markFirstContent`).
- `03` §3.3 (b), §1.9 (lazy chunks), §1.7 (no replay in lite); RES-006; TMA-009.
- Contract: API-001 `meta.analytics` `{key, host, id, env?, team?, autocapture?, replay?, replay_rate?}` (`null` →
  no analytics).
- Defect: LB-APP-037 (most layers are not tracked) — fix `APPROVED` (policy, internal).

## Implementation

1. After approval (KV-FE-005) add `posthog-js@1.434.15` to `frontend/app/package.json` (same version as the legacy
   production bundle, `03` §1.10). Read `frontend/app/node_modules/next/dist/docs/01-app/02-guides/analytics.md` and
   `lazy-loading.md` (dynamic `import()` keeps it out of the first-feed bundle, budget of `10` §5.12).
2. `frontend/app/lib/analytics/posthog.ts`:
   - `initAnalytics(config)` once per session; no-op for `null` config, Save-Data or `effectiveType` `2g`/`slow-2g`;
     wait for `markFirstContent()` (first loaded feed photo, KV-FE-047) or 8 000 ms, then 500 ms, then load;
   - before init remove the URL hash with `history.replaceState` (the `initData` copy is already captured by
     KV-FE-024);
   - dynamic imports: `posthog-js` and the extensions `web-vitals-with-attribution`, `exception-autocapture`,
     `dead-clicks-autocapture` (only with autocapture), `lazy-recorder` (only when replay is sampled);
   - init options as legacy: `api_host: config.host`, `disable_external_dependency_loading: true`,
     `persistence: 'memory'`, `disable_capture_url_hashes: true`, autocapture (unless `autocapture === false`) with
     `dom_event_allowlist ['click','change','submit']`, `element_attribute_ignorelist ['href','src','srcset']`,
     `capture_copied_text: false`; `rageclick`, `enable_heatmaps`; `capture_pageview: false`,
     `capture_pageleave: false`, `disable_surveys: true`; `capture_performance {web_vitals: true, network_timing:
     false}`; `enable_recording_console_log: false`; `capture_exceptions: true`; `person_profiles: 'identified_only'`;
     `bootstrap {distinctID: config.id, isIdentifiedID: true}`; replay only when `config.replay`, not lite and
     `Math.random() < (config.replay_rate ?? 1)`, with `maskAllInputs: true`, `maskTextSelector: '.ph-mask'` and
     request names stripped of hashes;
   - `before_send`: strip `#…` from `$current_url`, `$referrer`, `$initial_current_url`; recursively (depth 6) remove
     `tgWebAppData=…` from every string property except `$snapshot`;
   - super properties `env`, `team: !!config.team`, `build: BUILD_VERSION`; `screen` registered with each pageview;
   - `setRenderErrorHook(posthog.captureException)` (KV-FE-034).
3. `trackScreen(screen, props)`: `$pageview` with `{...props, $current_url: origin + '/' + screen, $pathname: '/' +
   screen}`; skip when `screen:listing_id` equals the last one; before load keep only the last screen and send it right
   after init.
4. `frontend/app/lib/analytics/screens.ts`: derive the screen from navigation state (KV-FE-025) with the legacy
   precedence `listing > radar/edit > radar/new > filters > filters/<kind> > sort > city > map/draw > tab screen`, then
   the new layer names on top of their base (a layer opened over the listing reports its own name):

| # | Screen name | Layer | Status |
| - | ----------- | ----- | ------ |
| 1 | `search/list` | search tab, list | legacy |
| 2 | `search/map` | search tab, map | legacy |
| 3 | `saved/favorites` | favourites sub-tab | legacy |
| 4 | `saved/history` | history sub-tab | legacy |
| 5 | `subs` | radar tab | legacy |
| 6 | `settings` | settings tab | legacy |
| 7 | `listing` (+ `listing_id`) | listing screen | legacy |
| 8 | `radar/edit` | radar editor | legacy |
| 9 | `radar/new` | new radar | legacy |
| 10 | `filters` | full filters sheet | legacy |
| 11 | `filters/rooms`, `filters/price`, `filters/owner` | quick sheets | legacy (3 names) |
| 12 | `sort` | sort sheet | legacy |
| 13 | `city` | city picker (header variant) | legacy |
| 14 | `map/draw` | lasso | legacy |
| 15 | `onboarding/language` | language picker (SCR-004) | new |
| 16 | `onboarding/city` | first-launch city picker (SCR-005) | new |
| 17 | `map/card` | map selection card | new |
| 18 | `listing/actions`, `listing/report` | actions sheet views | new |
| 19 | `listing/photos`, `listing/market`, `listing/map` | photo viewer, market sheet, fullscreen spot map | new |
| 20 | `radar/sheet`, `radar/found` | radar sheet, survey | new |
| 21 | `settings/theme`, `settings/graphics`, `settings/language`, `settings/currency`, `settings/quiet`, `settings/digest`, `settings/hidden` | settings sub-pages | new |

   The no-access screen (SCR-003) and the outside-Telegram state (SCR-002) stay untracked: analytics needs `meta`
   (legacy behaviour, `03` SCR-003).
5. The same derived screen name feeds `setErrorScreen()` of KV-FE-034.

## States and texts

n/a — no UI. Module states: `not requested | skipped (no config / data saver) | waiting | loaded`.

## Interaction

n/a — no UI. Masked elements: phone numbers and author labels carry `.ph-mask` (KV-FE-068, KV-FE-071, KV-FE-085).

## Telegram integration

TMA-009 (hash removal, `tgWebAppData` scrubbing); `platform` is added by the journal, not PostHog.

## Storage and analytics

- Storage: `persistence: 'memory'` — PostHog writes no cookie and no localStorage.
- Channel (b) of `03` §3.3: `$pageview` (21 rows above, 16 legacy names unchanged), autocapture, rage clicks, heatmaps,
  dead clicks, web vitals, exceptions, sampled replay.

## Files

- `frontend/app/lib/analytics/posthog.ts`, `screens.ts`, `firstContent.ts` (new)
- `frontend/app/package.json` (dependency after approval)
- `frontend/app/tests/analytics/posthog.test.ts`, `screens.test.ts`

## API contract

- Configuration from API-001 `meta.analytics`; ingestion to `config.host` (RES-006; must be in the CSP of KV-FE-033).
- The distinct id is the server's random id (never the Telegram user id); person deletion is server-side (KV-BE-152).

## Business rules

- Kept: analytics behaviour of `03` §3.3 (b); no replay in lite (§1.7).
- LB-APP-037 defect fix `APPROVED` (policy): new screen names for untracked layers; legacy names unchanged.

## Acceptance criteria

- With Save-Data or 2g, no PostHog request is made.
- PostHog loads 500 ms after the first feed photo, or after 8.5 s at the latest; nothing from `posthog-js` is in the
  JS loaded before the first feed render (bundle check of KV-FE-173).
- No captured event (including autocapture and exceptions) contains `tgWebAppData` or a URL hash.
- Opening listing 42 twice in a row sends one `$pageview listing` with `listing_id: 42`; a screen opened before load is
  sent once after load.
- With `meta.analytics: null` nothing loads; with `replay: true` and lite on, no recorder chunk loads.
- Dashboards on the 16 legacy names keep receiving events in a staging run (checked with the production track and the
  PostHog project of DEC-26).

## Tests

- Unit (`posthog.test.ts`, mocked module): load timing with fake timers, data-saver skip, init options snapshot,
  `before_send` scrubbing (nested object with `tgWebAppData`, `$snapshot` untouched), replay sampling with `Math.random`
  stubbed.
- Unit (`screens.test.ts`): precedence over a matrix of navigation states, every row of the table.
- E2E (with KV-FE-170): PostHog endpoint intercepted; event payloads checked for hashes and `initData`.

## Edge cases

- PostHog host unreachable: events drop silently; the app is unaffected.
- `config.id` missing: do not init (anonymous persons would break continuity).
- A render error before PostHog loads: only the journal receives it (hook not set yet).

## Security

TMA-009, SEC-REQ-047 (no PII in analytics), SEC-REQ-049 (new package vetted), F-PRIVACY-004 (no coordinates);
`maskAllInputs` and `.ph-mask` for phones and author labels in replays.

## Definition of done

`make ci-frontend` green; unit and E2E tests green (with KV-FE-010); dependency approved and registered; parity gate G4
for F-ANALYTICS-002 ticked; `09` row updated; PR reviewed by the other developer.
