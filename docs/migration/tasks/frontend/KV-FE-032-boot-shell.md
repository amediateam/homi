# KV-FE-032 — Pre-hydration boot shell and the «Обновите Telegram» screen

| Field | Value |
| ----- | ----- |
| Status | BLOCKED (DEC-06) |
| Owner | Frontend (track: development) |
| Complexity | M |
| Milestone | FE-1 (M9, stage S4) |
| Feature IDs | F-TMA-001 |
| Dependencies | KV-FE-003 (ADR: option A or B, browser floor), KV-FE-024 (adapter); uses KV-FE-023 (boot prefetch), KV-FE-026 (theme), KV-FE-027 (lite), KV-FE-034 (handover of error reporting); spike evidence KV-FE-002; decisions DEC-06 (FD-1), FD-2 (transport of the boot report), DEV-020 `PROPOSED` |

## Goal

Before any framework code runs, the Mini App installs the legacy native-callback stubs and boot watchdog, loads the
Telegram SDK without letting a hung `telegram.org` keep the page white, and — if its own code fails to load or crashes
before mount — replaces the page with the three-language «Обновите Telegram» screen (SCR-001) and reports the failure.
Then it runs the legacy module-body steps (error handlers, lite mode, prefetch, SDK wait, window init) and marks the
boot as successful.

## Legacy reference

- `$KVADRO_ROOT/demo/app/index.html:9-20` (stubs), `:21-143` (boot IIFE: `__kvBoot`, texts `:30-34`, language `:44-59`,
  `token`/`bare` sanitisers `:60-68`, XHR report `:69-90`, `toBot` `:91-103`, `show` `:104-125`, capture listener
  `:127-142`), `:151-153` (preconnect, `#tg-sdk async crossorigin`, module), `:158-160` (`nomodule`);
  `$KVADRO_ROOT/demo/app/src/main.jsx:18-52` (module body and mount, `__kvBoot.ok = true`).
- SCR-001 (`03` §2), `03` §1.3 steps 1–7, §1.5 (CSP constraint); TMA-001 (SDK tag), TMA-002 (stubs: Android 12.10+
  `__tg__postBackgroundChange`, old iOS `TelegramGameProxy.receiveEvent`), TMA-003 (watchdog, boot report, SDK failure
  only marks `sdk = 'error'`); `10` §3.11 (option table), §5.2 (boot shell, option A), §5.12 (startup budget).
- Defects: LB-APP-032 → DEV-020 (the boot screen maps only `uz`/`ru`).

## Implementation

1. Read `frontend/app/node_modules/next/dist/docs/01-app/03-api-reference/02-components/script.md` (`beforeInteractive`:
   only in a root layout, injected into the initial HTML, executed before any Next module),
   `03-api-reference/03-file-conventions/{route-groups,layout,instrumentation-client}.md` (multiple root layouts; code
   that runs before the app is interactive; custom polyfills), `01-app/02-guides/content-security-policy.md` (nonce read
   in the layout) and `03-architecture/supported-browsers.md` (default Chrome 111 / Safari 16.4; `browserslist`).
2. **Option A (Next client route group).** Remove the template `frontend/app/app/layout.tsx` / `page.tsx` and the Geist
   fonts; create `frontend/app/app/(miniapp)/layout.tsx` as a root layout rendering `<html lang="ru">`, `<head>` and
   `<body><div id="root">`, title `KvadroApp`, `favicon.svg` (brand layer, FD-8), `viewport` export with
   `viewportFit: 'cover'`; the home route is `app/(miniapp)/page.tsx` (route-groups doc: no top-level layout).
   The layout reads the request nonce (`headers().get('x-nonce')`, which makes it dynamic — acceptable, `10` §5.2) and
   emits, in this order inside `<head>`:
   1. inline script 1 — the stubs of TMA-002, verbatim behaviour (`window.__tg__postBackgroundChange = … || function(){}`,
      `window.TelegramGameProxy = … || {receiveEvent(){}}`);
   2. inline script 2 — the ES5 boot IIFE (no `let`, arrow functions or optional chaining), generated from one source
      file at build time (`frontend/app/boot/boot.es5.js` with the flag value of DEV-020 and the build version
      substituted):
      `__kvBoot = {ok: false}`; `lang()` = `kv-locale` if known, else Telegram `language_code` `uz*` → `uz_Latn`, else
      `ru` (with `dev020OneLanguageDetector` on: `en*` → `en` too); `report(name, message, source)` only when `initData`
      exists and `__kvBoot.watching` is false, XHR `POST /api/events` with the 7-field `app_error` (kind `boot`, `name`,
      `message` ≤ 300, `source` stripped of `?…`/`#…` keeping `:line:col`, `stage: 'boot'`, `tg`, `platform`) plus `v`;
      `show()` renders SCR-001 (below) once unless `__kvBoot.ok`; a capturing `error` listener: a failed `<script>` from
      the app's own chunk path (`/_next/static/`) → report `LoadError` + `show()`, `#tg-sdk` failure → `sdk = 'error'`
      only; uncaught errors before `ok` (not «Script error.», not from `telegram.org/`) → report + `show()`;
      `telegram.org` errors → report only;
   3. `<link rel="preconnect" href="https://telegram.org" crossorigin>` and the SDK tag with `id="tg-sdk"`,
      `crossOrigin="anonymous"`, the nonce, via `<Script strategy="beforeInteractive">` **only if** the spike KV-FE-002
      shows that a stalled `telegram.org` does not delay first paint or hydration; otherwise a raw
      `<script async id="tg-sdk" …>` in the layout head (legacy semantics: `async`, the app waits ≤ 3 s itself);
   4. `<script nomodule>` calling `__kvBoot.show()` — kept if the spike confirms Next's output still lets `nomodule`
      browsers reach it; otherwise the watchdog's load-error path covers them.
3. `frontend/app/instrumentation-client.ts` (runs before the app is interactive) performs the legacy module-body steps
   in legacy order, guarded to the Mini App path: `installGlobalErrorHandlers()` (KV-FE-034, sets
   `__kvBoot.watching`), `applyGraphicsMode()` + scheduling `measureScrollPerformance()` (KV-FE-027), initial
   `applyTheme()` (KV-FE-026), `startBootPrefetch()` (KV-FE-023: meta, first feed page for the saved city, the
   deep-linked listing; nothing without `initData`), then imports the polyfills of the decided floor if DEC-06 lowers
   it (and only then a `browserslist` entry in `frontend/app/package.json`).
4. The root Client Component awaits `waitForTelegramSdk(3000, initTelegramApp)` (KV-FE-024), calls `initTelegramApp()`,
   renders the app, and in its first effect sets `window.__kvBoot.ok = true`.
5. **Option B (Vite SPA, `frontend/miniapp`).** The same two inline scripts, preconnect, async SDK tag and `nomodule`
   script live in `index.html`; their SHA-256 hashes are computed at build and written to the nginx CSP include
   (KV-FE-033); `main.tsx` runs step 3 then step 4 in its module body; no `proxy.ts`, no `instrumentation-client.ts`,
   `build.target` from the decided floor.
6. Under FD-2 = B the boot report has no token yet: it keeps posting to API-034 with `tma` while the legacy surface
   lives; a v1 equivalent must accept the raw `initData` report before S5 (recorded in KV-FE-004).

## States and texts

SCR-001 texts are not in the i18n catalogues (they must work without bundles); copy them verbatim from
`$KVADRO_ROOT/demo/app/index.html:31-33` into `boot.es5.js`:

| Locale | Title | Button 1 | Button 2 |
| ------ | ----- | -------- | -------- |
| ru | «Обновите Telegram» | «Вернуться в бота» | «Попробовать ещё раз» |
| uz | «Telegramni yangilang» | «Botga qaytish» | «Qayta urinish» |
| en | «Update Telegram» | «Back to the bot» | «Try again» |

Paragraph ru: «Приложение не запустилось: Telegram или встроенный браузер (Android System WebView) устарели. Обновите
их в Google Play или App Store и откройте приложение снова. Объявления можно смотреть и в боте.» (uz and en verbatim from
the same lines).

| State | Shown when | UI |
| ----- | ---------- | -- |
| booting | always first | empty `#root` on the theme background |
| boot failure (SCR-001) | own chunk fails, error before `ok`, `nomodule` path | 🔄 44 px, h1 22 px, hint, two 48 px pill buttons; bot button `#ffd23f` / `#0b0b0b`; retry `#f0f0f3` light, `#1c1c1f` dark; dark when `colorScheme === 'dark'` or `prefers-color-scheme: dark` |
| SDK failed or slow | `#tg-sdk` error or > 3 s | no screen; app starts without SDK (TMA-004/005) |
| success | mount done | app renders; `__kvBoot.ok = true` |

## Interaction

- «Вернуться в бота»: `Telegram.WebApp.close()`; without the SDK `GET /api/bot` (XHR, no `Authorization`) then
  `location.href = 'https://t.me/<username>'`.
- «Попробовать ещё раз»: `location.reload()`.
- Responsive: centred block, buttons max 300 px; no gestures.

## Telegram integration

TMA-001 (SDK tag, `async`, `crossorigin`, preconnect; unpinned SDK), TMA-002 (stubs), TMA-003 (watchdog, boot report,
handover to KV-FE-034), TMA-004/TMA-005 via KV-FE-024, TMA-039 (`close`), TMA-043 (outside Telegram: no report without
`initData`).

## Storage and analytics

- Reads `kv-locale` only.
- Journal: `app_error` with `error.kind = 'boot'`, fields `kind`, `name`, `message`, `source`, `stage`, `tg`,
  `platform` (empty values as `""`) and `v`; sent only with `initData` and only until `__kvBoot.watching`.

## Files

- `frontend/app/app/(miniapp)/layout.tsx`, `frontend/app/app/(miniapp)/page.tsx`, `frontend/app/app/(miniapp)/BootRoot.tsx`
  (new); `frontend/app/app/layout.tsx`, `page.tsx` (template removed)
- `frontend/app/boot/boot.es5.js`, `frontend/app/boot/stubs.es5.js`, `frontend/app/boot/build-inline.ts` (new)
- `frontend/app/instrumentation-client.ts` (new); `frontend/app/package.json` (`browserslist` only if DEC-06 says so)
- `frontend/app/tests/boot/boot.test.ts`, `frontend/app/e2e/boot-failure.spec.ts`

## API contract

- API-034 `POST /api/events` (XHR, `Authorization: tma <initData>`, JSON body above) → `204`, never read.
- API-003 `GET /api/bot` (no `Authorization`) → `200 {"username": string, "support": string|null}`; on failure nothing
  happens.

## Business rules

- Kept: TMA-001…TMA-003 behaviour; SDK wait 3 000 ms; the boot screen never shows for SDK failures.
- DEV-020 `PROPOSED`: one language detector (`en*` → en) in the boot screen (flag; test `todo('DEV-020 PROPOSED')`).

## Acceptance criteria

- Blocking the app's first chunk shows SCR-001 in the Telegram language and posts one `app_error` (kind `boot`,
  `name: LoadError`) with no `#tgWebAppData` in `source`.
- A thrown error before mount shows SCR-001; the same error after `__kvBoot.ok` does not.
- Blocking `telegram.org` shows no boot screen; the app renders after at most 3 s with native-bridge `ready`/`expand`.
- `kv-locale=en` shows the English screen; Telegram `uz-UZ` without `kv-locale` shows Uzbek; `en` without `kv-locale`
  shows Russian (legacy) or English (DEV-020 on).
- Without `initData` no XHR is sent.
- The inline scripts parse in an ES5 engine (test with a syntax check at the decided floor).
- Visual: no KV-QA-019 baseline exists for SCR-001; compare with the legacy markup of `index.html:104-125` (sizes,
  colours, order) side by side in the PR.

## Tests

- Unit (`boot.test.ts`, jsdom): `lang()` matrix; `bare()` strips `?a=1#tgWebAppData=…` but keeps `:12:34`; `token()`
  sanitiser; `report()` not sent with `watching = true` or without `initData`; `show()` idempotent.
- Syntax: an ES5 parse of the generated inline scripts (a build-time check with the TypeScript compiler's `ES5` target,
  no new dependency).
- E2E (`boot-failure.spec.ts`, with KV-FE-170): blocked chunk, thrown error, blocked SDK, `nomodule` simulation.

## Edge cases

- A late SDK after 3 s with `initData` re-runs `initTelegramApp` (KV-FE-024); the boot screen is unaffected.
- `localStorage` throws: language from Telegram.
- Extremely old WebView where `JSON.stringify` exists but `XMLHttpRequest` throws: the screen still shows.
- The nonce attribute is missing on a cached HTML response: the CSP blocks the scripts — the shell HTML must be
  `Cache-Control: no-store` (KV-FE-033).

## Security

TMA-009 / SEC-REQ-003: `initData` only in the `Authorization` header of the boot report, never in the body or URL;
sources stripped of query and hash; SEC-REQ-022 limits (message 300, source 300); the inline scripts carry the nonce
(option A) or are hash-allowed (option B) per SEC-REQ-031; boot texts are static (no user input in `innerHTML`).

## Definition of done

`make ci-frontend` green; unit and E2E tests green (with KV-FE-010); the spike's findings referenced in the PR; the
SCR-001 side-by-side review recorded; parity gate G4 for F-TMA-001 ticked together with KV-FE-033; `09` row updated;
PR reviewed by the other developer.
