# frontend/app — the HOMI Mini App

Next.js 16.4 App Router app of the Telegram Mini App (DEC-44). Its plan is `docs/migration/25-wave-1-plan.md` §3; the
packages that build it are WP-20 … WP-33 of `docs/migration/wave-1/README.md`. Read the guide of a Next.js feature in
`node_modules/next/dist/docs/` before using it: this version differs from older ones (`proxy.ts`, `cacheComponents`).

## Layout

| Path | Content |
| ---- | ------- |
| `app/[locale]/` | The route tree of `25` §3.2. `layout.tsx` is the root layout; `(main)/` holds the screens with the `@sheet` and `@overlay` slots; `welcome/`, `no-access/`, `outside/` are the gates. Route files only read `params` and mount a component from `features/` |
| `app/[locale]/(main)/@sheet/(.)…`, `@overlay/(.)listing/…` | Sheets and the listing layer intercepted from a soft navigation; a hard load renders the page of the same name. Each slot has `default.tsx`, `page.tsx` and `[...rest]` returning `null` |
| `app/bff/session/route.ts` | The session exchange (`25` §3.4): `POST` trades the launch data for the `homi_session` cookie, `GET` reads `/me` with the cookie or a bearer header |
| `boot/` | `stubs.js` and `boot.js` (ES5, inlined by the root layout from the committed `inline.generated.ts`; `build.mjs` writes it before `dev` and `build`): theme and lite class before paint, the engine test, the boot watchdog, «Обновите Telegram», the SDK tag |
| `dev/` | The development Telegram emulator; `build.mjs` turns it into `public/__dev/telegram-emulator.js` (git-ignored) before `next dev` and deletes it before a build |
| `features/` | One folder per feature; `features/shell/` has the placeholders, `BootGuard`, `TelegramButtons`, `LaunchRedirector`, `FragmentGuard`, `NavigationBinder`, the demo marker |
| `i18n/` | next-intl: `routing.ts`, `request.ts` (locale from `next/root-params`), `navigation.ts` (`Link`, `useRouter` — both counted in the history stack, `usePathname`, `redirect`), `IntlClientProvider.tsx`, `labels.ts` |
| `lib/telegram/` | The only way to Telegram (`tg`); `sdk.ts` alone reads `window.Telegram`. Version gates, the SDK wait, init, theme, links, calls, sharing, location, home screen, DeviceStorage |
| `lib/session/` | The bootstrap of a launch, `SessionProvider` / `useSession()`, `reauthenticate()`, the in-memory token of header mode, `LocaleGuard`, server-only `getSessionToken()` |
| `lib/navigation/` | `routes.ts` (the only place an address is spelled), `nav`, the history stack, `useBack`, `closeThen`, `useLayerState` |
| `lib/deeplinks/` | `parseLaunch` (start_param, `?listing=`, `?news=`, `?map=`), the link builders, the launch gate |
| `lib/storage.ts`, `lib/graphics.ts` | The client storage keys with their DeviceStorage policy; lite graphics |
| `lib/security/csp.ts` | The nonce CSP of `proxy.ts` (ADR-0020) |
| `lib/brand/` | HOMI's name, bot, links and artwork paths; the only place a brand word may appear |
| `lib/flags.ts` | `devFlags`: the 17 `DEV` switches, all off |
| `lib/analytics/events.ts`, `lib/errors/report.ts` | `track` and `reportError` facades (no-ops until WP-32) |
| `lib/data/sources.ts` | Which drivers answered the current screen; drives the "demo data" marker |
| `proxy.ts` | Locale redirect (cookie `NEXT_LOCALE`, else `ru`), then the CSP with a fresh nonce and the security headers |
| `styles/app.css` | Tailwind and `@homi/ui/styles.css` (tokens, themes, lite, motion) |
| `public/brand/` | Placeholder artwork of the legacy sizes; the final files replace them without a code change |
| `tests/`, `e2e/` | Vitest (`pnpm --filter app test`) and Playwright (`pnpm test:e2e` from `frontend/`) |

Catalogues live in `@homi/i18n` (`frontend/packages/i18n`): the generated `legacy` layer, the hand-written `homi`
layer, and the runtime rules — a missing key renders its path and is reported once, never a throw.

## Rendering and session

- Every document renders at request time so that its scripts carry the CSP nonce (ADR-0020): the root layout reads
  `x-nonce` and exports `instant = false`. An unknown address shows the not-found screen with `noindex` and status
  `200`.
- A launch: the SDK wait (3 s at most), the DeviceStorage restore, `ready`/`expand`, the fragment scrub, then a
  valid cookie of the same Telegram user or one sign-in through `/bff/session`. Cookie mode refreshes the router once
  so Server Components render with the session; header mode keeps the token in memory only. `html[data-session]`
  mirrors the status (`booting`, `ready`, `outside`, `denied`, `expired`).
- The app server calls the API at `API_URL` (server-only), else `NEXT_PUBLIC_API_URL`.

## Commands

```bash
pnpm --filter app dev       # http://localhost:3001, or https://app.homi.loc through the local stack
pnpm --filter app build
pnpm --filter app test      # Vitest project "app"
pnpm --filter app lint
pnpm --filter app typecheck # next typegen && tsc --noEmit
```

On a developer machine the app server reaches `https://api.homi.loc` only if Node trusts the mkcert root: start it
with `NODE_EXTRA_CA_CERTS="$(mkcert -CAROOT)/rootCA.pem"`; `pnpm test:e2e` does this by itself. In a desktop browser
the emulator offers the launch data of your own dev bot or a fake user for the stub sign-in.

Rules for later packages: every address is built with `routes.*` and navigated with `@/i18n/navigation` or `nav`;
nothing touches `window.Telegram` outside `lib/telegram/sdk.ts`; client storage goes through `lib/storage.ts`;
colours, radii and motion come from the tokens of `@homi/ui` (Tailwind's default palette is removed); a server value
becomes a label through `labelFor` of `@/i18n/labels`; workspace packages never import `lib/flags.ts`.
