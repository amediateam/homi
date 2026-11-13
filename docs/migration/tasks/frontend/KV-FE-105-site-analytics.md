# KV-FE-105 — Site analytics loader and visit id

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Frontend (track: development) |
| Complexity | S |
| Milestone | FE-3a (M9, stage S2) |
| Feature IDs | F-ANALYTICS-004 |
| Dependencies | KV-FE-104 (CSP allows the PostHog hosts); decisions: DEC-26 / FD-9 (PostHog project), Q-LND-008, Q-SEO-005 |

## Goal

The SEO pages (S2) and later the landing and privacy pages (S4) carry the legacy site analytics: a per-tab visit id,
click-time tagging of bot links with that visit id, and PostHog loaded late without cookies, with the same
initialisation options and super-properties — so attribution from the web into the bot and the existing dashboards keep
working. No npm package is needed: PostHog is loaded from its EU asset host as legacy does.

## Legacy reference

- LND-031 (`stats.js` and PostHog without cookies), LND-063 (analytics on SEO pages, UNVERIFIED, Q-SEO-005), RES-014
  (`stats.js`), RES-006 (PostHog ingestion).
- Rules: BR-LND-002 (visit id), BR-LND-003 (click-time tagging).
- Source: `$KVADRO_ROOT/demo/landing/site/stats.js:1-55` (config object with key, host `https://eu.i.posthog.com`,
  assets `https://eu-assets.i.posthog.com`, SDK version `1.434.15`, `env`, `clicks`; the key itself is not copied).
- Privacy promise: «Сайт kvadro.app» section of `$KVADRO_ROOT/demo/landing/site/privacy.html` (no cookies, PostHog EU,
  a visit number travels into the bot) — must stay true.

## Implementation

1. Read `frontend/landing/node_modules/next/dist/docs/01-app/03-api-reference/02-components/script.md` (`strategy`
   values) and `01-app/02-guides/analytics.md`.
2. `frontend/landing/components/SiteAnalytics.tsx` (Client Component, rendered once in `app/[lang]/layout.tsx`):
   - visit id (BR-LND-002): read `sessionStorage` `kv-visit`; if it does not match `^[a-z0-9]{10}$`, generate 10
     characters from `abcdefghijklmnopqrstuvwxyz0123456789` with `crypto.getRandomValues` (fallback `Math.random`),
     `byte % 36`, store it (storage errors ignored); expose it to the link builder of KV-FE-106 through a small module
     (`getVisit()`), and as `window.KV_VISIT` only if a legacy consumer still needs it (none in the new pages);
   - click tagging (BR-LND-003): `click` and `auxclick` listeners in the capture phase on `document`; for the closest
     `a[href]` whose `href` fully matches `^(https://t\.me/\w+\?start=)(s_[a-z0-9_-]+)$` and has no `--v`, rewrite to
     `prefix + payload.slice(0, 49) + "--v" + visit`; `startapp` links, upper-case payloads and links with other
     parameters are left alone;
   - PostHog: 1 500 ms after `load` inject `<script async src="{assets}/static/{version}/array.js">` (a
     `next/script` with `strategy="lazyOnload"` and `onLoad`), then `posthog.init(key, {api_host: host,
     cookieless_mode: 'always', person_profiles: 'identified_only', capture_pageview: true, capture_pageleave: true,
     autocapture: clicks && {dom_event_allowlist: ['click','submit'], capture_copied_text: false}, rageclick: clicks,
     enable_heatmaps: clicks, capture_performance: clicks && {web_vitals: true, network_timing: false},
     disable_session_recording: true, disable_surveys: true, enable_recording_console_log: false})` and
     `register({env, site: 'kvadro.app', visit})`.
3. Configuration from `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST` (`17` §4), plus new
   `NEXT_PUBLIC_POSTHOG_ASSETS_HOST`, `NEXT_PUBLIC_POSTHOG_SDK_VERSION`, `NEXT_PUBLIC_SITE_ANALYTICS_CLICKS` (announce the
   names to KV-INF-003; values never in the repository). No key → no PostHog, tagging still runs.
4. `site` stays `kvadro.app` while the domain is (DEC-04); `env` from `NEXT_PUBLIC_APP_ENV`.
5. Q-LND-008: autocapture selectors change with the new markup; list the dashboards and insights that depend on
   `data-l` keys or classes with the product owner before S4, and give stable `data-ph` attributes to the CTA, the
   language menu and the QR if dashboards need them.

## States and texts

n/a — no visible UI.

## Interaction

- The visit id survives reloads in the same tab and is new in a new tab (sessionStorage semantics, as legacy).
- Middle-click (`auxclick`) and normal click both tag the link before navigation.

## Telegram integration

n/a (it prepares the `start` payload that the bot parses: KV-TG-015).

## Storage and analytics

- `sessionStorage` `kv-visit` (10 chars). No cookies, no `localStorage` writes here.
- PostHog events: `$pageview`, `$pageleave`, `$autocapture` (click, submit), `$rageclick`, web vitals, heatmaps — no
  custom events (legacy sends none). Super-properties `env`, `site`, `visit`.

## Files

- `frontend/landing/components/SiteAnalytics.tsx`, `frontend/landing/lib/analytics/visit.ts`,
  `frontend/landing/lib/analytics/tagBotLinks.ts` (new)
- `frontend/landing/app/[lang]/layout.tsx` (mount once)
- `frontend/landing/tests/visit.test.ts`, `frontend/landing/tests/tag-bot-links.test.ts`, `frontend/landing/e2e/analytics.spec.ts`

## API contract

External: `https://eu-assets.i.posthog.com/static/<version>/array.js` (script), `https://eu.i.posthog.com` (capture).
Both allowed by KV-FE-104.

## Business rules

- Kept: BR-LND-002, BR-LND-003 (including the 49-character cut, the legacy contract the bot parser of KV-TG-015
  expects).
- LB-LND-007 item 4 (silent truncation) is fixed at generation time by KV-FE-106 (payloads are built within 49
  characters), so the cut here becomes a no-op safety net.

## Acceptance criteria

- On a district page, clicking the CTA `https://t.me/KvadroAppBot?start=s_seo_tashkent_yunusobod` navigates to
  `…?start=s_seo_tashkent_yunusobod--v<visit>` with the same visit as `sessionStorage.kv-visit`.
- A `startapp` card link and a link with `&x=1` are not modified; a payload of 60 characters is cut to 49 before `--v`.
- PostHog loads 1.5 s after `load`, sets no cookie, and registers `site: kvadro.app` and the visit; with
  `NEXT_PUBLIC_POSTHOG_KEY` empty nothing is requested from PostHog.
- Landing parity scenario `source-tag` (`/?s=Insta_1`, KV-QA-013) yields the same bot link payload as legacy once
  KV-FE-106 builds the landing links.

## Tests

- Unit: visit generator (alphabet, length, invalid stored value replaced); tagging regex on 10 hrefs (valid, `startapp`,
  upper case, extra parameter, already tagged, 60-character payload).
- E2E (`analytics.spec.ts`): network interception asserts the asset URL, no `Set-Cookie`, the `register` call; click
  tagging on a real anchor.

## Edge cases

- `sessionStorage` blocked (private mode, sandbox): a new visit per page view, no exception.
- `crypto.getRandomValues` missing: `Math.random` fallback.
- The user navigates before the 1.5 s timer: no PostHog on that page view (as legacy).
- Ad blockers block PostHog: tagging still works.

## Security

- No `initData`, phone or personal data on these pages; PostHog runs with `person_profiles: identified_only` and never
  identifies anyone here.
- SEC-REQ-022: the visit id is random, not derived from the user; SEC-REQ-021: no HTML is generated.

## Definition of done

`make ci-frontend` green; unit and E2E tests green; the dashboard dependency list of Q-LND-008 attached to the PR;
parity gate G4 for F-ANALYTICS-004 ticked (`15` §4); `09` row updated; PR reviewed by the other developer.
