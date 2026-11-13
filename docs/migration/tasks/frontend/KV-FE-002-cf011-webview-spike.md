# KV-FE-002 — CF-011 spike: Next 16.4 client route group on old WebViews

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Frontend (track: development) |
| Complexity | M |
| Milestone | FE-0 (M9, decision input for S4) |
| Feature IDs | F-TMA-001 |
| Dependencies | — (runs on the legacy floor as the first target while KV-FE-001 collects data); dev bot KV-INF-001; feeds KV-FE-003 (DEC-06) |

## Goal

A throw-away spike answers the one technical unknown of CF-011: does a minimal Next.js 16.4 client-rendered route
group, with a lowered `browserslist`, an ES5 pre-hydration boot script and a nonce CSP, boot and render a first feed
page on the oldest WebViews the product may have to support? The result (boots or not, JS size, time to first feed
render) goes into the ADR of KV-FE-003. `10` §3.11 calls this "data item 3".

## Legacy reference

- Option table and facts: `10` §3.11 (options A–E), §5.2 (option A shape); Next facts quoted there:
  `frontend/app/node_modules/next/dist/docs/03-architecture/supported-browsers.md` (Chrome/Edge/Firefox 111+, Safari
  16.4+, `browserslist` override, polyfills only for `fetch`, `URL`, `Object.assign`),
  `…/01-app/03-api-reference/03-file-conventions/instrumentation-client.md`,
  `…/01-app/02-guides/content-security-policy.md` (nonces need dynamic rendering),
  `…/01-app/03-api-reference/02-components/script.md` (`beforeInteractive` before any Next code).
- Legacy boot: TMA-001…TMA-005; `03` §1.3–§1.5; `$KVADRO_ROOT/demo/app/index.html:9-160` (stubs, watchdog, SDK tag,
  `nomodule` fallback); legacy build target `chrome80 / edge80 / firefox72 / safari13.1` (Q-APP-001).
- First paint before meta: `03` §1.3 step 9; prefetch of `/api/meta` and the first feed page (`08` §1.6).

## Implementation

1. Read the four Next docs above and `…/01-app/02-guides/single-page-applications.md`,
   `…/03-api-reference/03-file-conventions/{proxy,route-groups,layout}.md`.
2. On a spike branch (never merged; the report is the deliverable): `frontend/app/app/(spike)/layout.tsx` as its own
   root layout rendering `<html>`; an inline ES5 script (no arrow functions, no `let`, no template literals) that
   installs the TMA-002 stubs and a `window.__kvBoot` watchdog that swaps `#root` for a static "Update Telegram"
   block on an error before `ok`; `<Script src="https://telegram.org/js/telegram-web-app.js"
   strategy="beforeInteractive">`.
3. `frontend/app/proxy.ts` matched only to the spike route: a per-request nonce, `script-src 'self' 'nonce-…'
   'strict-dynamic' https://telegram.org`, `connect-src 'self'`, `frame-ancestors` per Q-SEC-012 (record what Telegram
   Web needs).
4. A `'use client'` page that waits ≤ 3 s for the SDK (TMA-004), reads `initData` (TMA-006), fetches a static JSON
   feed page (20 `ListingPreview` items from the sanitised fixtures of KV-QA-002 if present, else a hand-made file)
   and renders 20 plain cards with one image each; it marks `__kvBoot.ok = true` after mount.
5. Three builds: (a) Next default targets; (b) `"browserslist": ["chrome 80", "edge 80", "firefox 72",
   "safari 13.1"]` in `frontend/app/package.json`; (c) (b) plus polyfills in `instrumentation-client.ts` for whatever
   the run shows missing (record each one). No new npm package — polyfills hand-written or the build fails the spike.
6. Run matrix (record Chrome/Safari version for each): Android emulator with the oldest available Android System
   WebView (Chrome 80 if obtainable, else 83/87) inside Telegram Android via the dev bot (KV-INF-001) or the plain
   WebView shell; iOS simulators for the lowest iOS versions KV-FE-001 reports (at least iOS 13.4 → Safari 13.1 and
   iOS 14); Telegram Desktop; Telegram Web (A and K). **[PT]** if a staging bot is needed (KV-INF-017).
7. Measure per cell: boots (yes / boot screen / white screen), console errors, first-load JS (gzip, from
   `next build` output), time from navigation start to first card rendered (`performance.now()` mark, 5 runs, median),
   whether the nonce CSP blocks the boot script or the SDK, whether `'strict-dynamic'` is ignored (then `'self'` +
   the SDK host must carry it — SEC-REQ-031 fallback).
8. Write `docs/migration/spikes/KV-FE-002-cf011.md`: matrix, numbers, the polyfill list, the CSP finding, and a
   recommendation per the rule of `10` §3.11. Delete the spike branch after the ADR (KV-FE-003) merges.

## States and texts

Spike only: the static boot-failure block uses the legacy texts of SCR-001 (`$KVADRO_ROOT/demo/app/index.html:31-33`,
ru «Обновите Telegram» / «Вернуться в бота» / «Попробовать ещё раз») to see whether it renders on every engine.

## Interaction

n/a (no gestures; the spike measures boot and first render only).

## Telegram integration

TMA-001 (SDK tag via `beforeInteractive`), TMA-002 (stubs), TMA-003 (watchdog), TMA-004 (3 s wait), TMA-006
(initData), TMA-014 (`ready`, `expand`), TMA-042 (version gates exercised on each client version found).

## Storage and analytics

None. No PostHog, no journal events (the spike must not send data anywhere but the dev bot's own host).

## Files

- Spike branch only: `frontend/app/app/(spike)/…`, `frontend/app/proxy.ts`, `frontend/app/instrumentation-client.ts`,
  `frontend/app/package.json` (`browserslist`) — not merged.
- Merged: `docs/migration/spikes/KV-FE-002-cf011.md` (new).

## API contract

n/a — static JSON shaped like API-004 (`FeedPage`, `08` §1.8); no backend call.

## Business rules

n/a. Outcome feeds DEC-06 and the DEV candidate of `10` §3.11 (clients below the chosen floor see an "update Telegram"
screen).

## Acceptance criteria

- The report covers every run-matrix cell with a version number, a boot result and (when it booted) the first-card
  time and the first-load JS size for builds (a), (b) and (c).
- It states whether build (b)/(c) runs on Chrome 80 / Safari 13.1 and which polyfills it needed.
- It states whether the nonce CSP with `'strict-dynamic'` works on each engine and what the fallback directive is.
- It ends with a recommendation (A default floor / A lowered floor / B) and the reason.

## Tests

The spike is measured, not unit-tested. Each run is repeated 5 times; the report gives medians and the device / OS /
WebView versions so the run can be repeated.

## Edge cases

- The SDK host is blocked (corporate networks): the 3 s wait must still render (TMA-004/TMA-005) — test once with
  `telegram.org` blocked.
- An old WebView without ES modules: the `nomodule` path must show the boot screen (legacy `index.html:158-160`).
- Simulator Safari differs from device Safari: note it; the device pass of KV-FE-174 confirms on hardware.

## Security

The dev bot's `initData` is pasted into the emulator only locally and never committed (TMA-009, SEC-REQ-034); the
report contains no initData, token or screenshot with personal data.

## Definition of done

Report merged and linked from KV-FE-003; spike branch deleted; no change to `frontend/app` lands on `main`; PR reviewed
by the other developer.
