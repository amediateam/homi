# KV-FE-109 — Landing display versions, motion and responsive behaviour

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Frontend (track: development) |
| Complexity | M |
| Milestone | FE-3b (M9, stage S4) |
| Feature IDs | F-LANDING-002, F-LANDING-008 |
| Dependencies | KV-FE-108; KV-FE-104 (the inline switch must be allowed by the DEC-08 policy); decisions: DEV-043 `PROPOSED`, Q-LND-011 |

## Goal

The re-implemented landing keeps the two display versions and their fallbacks: v1 (scroll-driven scenes on mouse
devices), v2 (time-driven scenes on touch devices, with a simple variant for weak devices), the static layout for
reduced motion or browsers without scroll timelines, the responsive phone scaling and the browser theme colour — chosen
before the first paint, with the debug and benchmark switches kept for development only once DEV-043 is approved. The
scene contents themselves are KV-FE-110…KV-FE-112.

## Legacy reference

- LND-021 (v1/v2 choice by an inline `<head>` script: `html.v2` when `?v=2`, or `(pointer: coarse)` and no `?v=1`),
  LND-022 (v1: `animation-timeline: view()`, named timeline `--cloud` on `.tl-proxy`, JS smoothing with inertia and a speed
  cap, only with a mouse, no v2, timelines supported, motion allowed; `?motion=raw` disables; phone chrome collapses in
  the 42–58 % range; map image warmed 600 ms after `load`), LND-023 (v2: trigger at 60 % of the viewport, ~2.6 s intro,
  scroll hold with a 5 s safety limit, never replays; steps feed → filters → map; FLIP `morphPhoneV2`), LND-024 (static
  layout), LND-025 (responsive), LND-026 (theme colour), LND-037 (debug parameters).
- URL-008 (`?v=1|2`), URL-009 (debug parameters), URL-017, URL-018 (assets replaced by the build).
- Rules: BR-LND-018 (display version), BR-LND-019 (simple v2), BR-LND-021 (theme colour).
- Defects and deviations: LB-LND-015 → DEV-043, LB-LND-010 (monolithic assets, fix `APPROVED`).
- Source: `$KVADRO_ROOT/demo/landing/site/index.html:37-43`; `$KVADRO_ROOT/demo/landing/site/landing.js:129-539`,
  `:1351-1938`, `:2145-2211`; `$KVADRO_ROOT/demo/landing/site/landing.css` (27 uses of `animation-timeline: --cloud`,
  13 `prefers-reduced-motion` blocks, 3 `@supports not (animation-timeline: view())`).

## Implementation

1. Read `frontend/landing/node_modules/next/dist/docs/01-app/02-guides/preventing-flash-before-hydration.md` (inline
   script before paint), `01-app/02-guides/lazy-loading.md`, `01-app/02-guides/scripts.md`.
2. Version switch before paint: a constant inline script in `app/[lang]/layout.tsx` `<head>` (no user data in it) that
   adds `html.v2` per BR-LND-018. It is the second documented exception to the "no raw HTML" lint rule after JSON-LD
   (SEC-REQ-021) and must be permitted by the DEC-08 policy of KV-FE-104 (`'unsafe-inline'` or its SRI hash recorded in
   the PR).
3. `frontend/landing/lib/motion/` (Client modules, loaded lazily after the first scene's static HTML):
   - `capabilities.ts`: pointer type, `prefers-reduced-motion`, `CSS.supports('animation-timeline: view()')`, Web
     Animations and IntersectionObserver presence, Android `hardwareConcurrency ≤ 4` or `deviceMemory ≤ 2`,
     `innerHeight < 500`, measured intro frame rate (< ~30 fps) — the BR-LND-019 inputs;
   - `v1Scroll.ts`: scroll smoothing with inertia and a speed cap by shifting the proxy; off with `?motion=raw`;
   - `v2Show.ts`: the time-driven sequence (posts fly into the phone, gather into the first card's photo, the phone
     grows, steps feed → filters → map, live map), scroll hold ≤ 5 s, once only, FLIP morphs;
   - `simple.ts`: skip the intro and steps, show the live map at once.
4. CSS: port the scroll-timeline animations into CSS modules of the landing (`landing.css` structure split by section;
   LB-LND-010: minified, the phone demo loaded lazily, critical CSS inlined by Next); keep the 13 reduced-motion and the
   3 `@supports not (animation-timeline: view())` fallbacks — the static layout of LND-024 (the «Узнавайте первым» block
   takes over the lock phase; all `animate()` calls skipped).
5. Responsive (LND-025): width breakpoints 380, 760 (13 blocks), 900, 1 100, 1 200, 1 280 px; height breakpoints 480, 640,
   680, 700, 740, 760, 800, 820, 860 px; `svh`/`lvh` where supported; phone scale `--ps-m` within 0.36–0.72 (landscape
   0.3–0.58) computed from real heights; mobile Chrome: the stage centred in `visualViewport` with settle and confirm
   timers; lighter graphics (no glass blur) on touch in v1 and on weak Android in v2.
6. Theme colour (BR-LND-021): `meta[name=theme-color]` `#0e0e10` while the dark first scene is under the browser
   toolbar, `#ffffff` after (one IntersectionObserver on the scene).
7. Debug parameters (LND-037): `?v=1|2`, `?motion=raw`, `?touch=1`, `?glass=off`, `?anim=on|off`,
   `?bench=1[&off=anim,phone,sb]`, `?debug=vh`. DEV-043 flag `dev043DebugParamsDevOnly` in
   `frontend/landing/lib/deviations.ts` (default off = all work as legacy). On: in production only `?v=` stays; the rest
   work when `NEXT_PUBLIC_APP_ENV` is not `production` (the parity runs of KV-QA-013 need `?motion=raw` on staging);
   every URL carrying them still renders the normal page (`200`, canonical without parameters). Q-LND-011 checks whether
   `?v=` circulates in shared links.

## States and texts

| State | Chosen when | Behaviour |
| ----- | ----------- | --------- |
| v1 | fine pointer, no `?v=2`, or `?v=1` | scroll-driven scene, smoothing on (mouse only) |
| v2 full | coarse pointer or `?v=2`, none of BR-LND-019 | time-driven intro, steps, then live map |
| v2 simple | any BR-LND-019 condition, or `?anim=off` | no intro, live map at once |
| static | `prefers-reduced-motion: reduce` or no scroll timelines | static layout, «Узнавайте первым» block shown |
| no JavaScript | — | static layout from CSS with full texts (v2 class may still be set by the inline script) |

No visible texts of its own; the scene texts are in KV-FE-110 / KV-FE-112. The scroll cue `cue` «Листайте дальше» is
rendered by KV-FE-110.

## Interaction

- v1: scroll drives the scene; wheel/trackpad smoothing only with a mouse.
- v2: the page is held while posts fly (≤ 5 s), then scrolls freely; the intro never replays when scrolling back up.
- Touch on the phone in live mode drags the map sideways only (KV-FE-111); the cue lets phone users leave the scene.
- All animations stop or become instant with `prefers-reduced-motion` (`10` §5.12 landing budget).

## Telegram integration

n/a.

## Storage and analytics

None. (The legacy page stored nothing for the version choice.)

## Files

- `frontend/landing/app/[lang]/layout.tsx` (inline version switch), `frontend/landing/lib/motion/{capabilities,v1Scroll,v2Show,simple,themeColor,debugParams}.ts` (new)
- `frontend/landing/app/[lang]/landing.module.css` and section CSS modules (new)
- `frontend/landing/lib/deviations.ts` (`dev043DebugParamsDevOnly`)
- `frontend/landing/tests/motion-capabilities.test.ts`, `frontend/landing/e2e/landing-versions.spec.ts`

## API contract

n/a.

## Business rules

- Kept: BR-LND-018, BR-LND-019, BR-LND-021.
- Defect fix `APPROVED`: LB-LND-010 (split, minified, lazy phone demo).
- DEV-043 `PROPOSED` behind `dev043DebugParamsDevOnly` (test `todo('DEV-043 PROPOSED')`).

## Acceptance criteria

- Landing parity scenarios (KV-QA-013) pass or map to an LB/DEV: `{ru,uz,en}-phone-v1`, `ru-phone-v2-hero`,
  `ru-desktop-v2-hero`, `{ru,uz,en}-desktop-static`, `{ru,uz,en}-phone-static`, and the full-scene `{ru,uz,en}-desktop`
  snapshots at their step labels.
- `html.v2` is present in the first paint on a touch profile and absent on a mouse profile (no flash, no hydration
  warning).
- With reduced motion no `animate()` runs and the «Узнавайте первым» block is visible.
- The theme colour is `#0e0e10` at the top and `#ffffff` after the first scene.
- Every URL of URL-008 and URL-009 answers `200` with a canonical without parameters, with the flag on and off.
- Lighthouse on `/` (KV-FE-175): LCP ≤ 2.5 s p75 mobile, CLS ≤ 0.1 (`10` §5.12).

## Tests

- Unit (`motion-capabilities.test.ts`): BR-LND-018 and BR-LND-019 decision tables with mocked media queries.
- E2E (`landing-versions.spec.ts`): the scenarios above on Chromium desktop and the 390 × 844 touch profile; theme-colour
  check; `?motion=raw` used for deterministic snapshots.
- `todo('DEV-043 PROPOSED')`.

## Edge cases

- iOS toolbar jitter: settle and confirm timers prevent the phone from jumping on scroll.
- A janky intro detected mid-way: switch to the simple version without a layout jump.
- Landscape phones: the landscape scale range applies.
- Background tab during the v2 intro: the sequence resumes or skips to live mode, never stalls the scroll hold beyond
  5 s.

## Security

The inline switch script is a constant (no interpolation); SEC-REQ-021 lint exception documented in the ESLint config;
CSP per KV-FE-104.

## Definition of done

`make ci-frontend` green; unit and E2E tests green; the scenario results recorded for KV-QA-013; parity gate G4 for
F-LANDING-002 (display part) and F-LANDING-008 ticked (`15` §4); `09` rows updated; PR reviewed by the other developer.
