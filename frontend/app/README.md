# frontend/app — the HOMI Mini App

Next.js 16.4 App Router app of the Telegram Mini App (DEC-44). Its plan is `docs/migration/25-wave-1-plan.md` §3; the
packages that build it are WP-20 … WP-33 of `docs/migration/wave-1/README.md`. Read the guide of a Next.js feature in
`node_modules/next/dist/docs/` before using it: this version differs from older ones (`proxy.ts`, `cacheComponents`).

## Layout

| Path | Content |
| ---- | ------- |
| `app/[locale]/` | The route tree of `25` §3.2. `layout.tsx` is the root layout; `(main)/` holds the screens with the `@sheet` and `@overlay` slots; `welcome/`, `no-access/`, `outside/` are the gates. Route files only read `params` and mount a component from `features/` |
| `app/[locale]/(main)/@sheet/(.)…`, `@overlay/(.)listing/…` | Sheets and the listing layer intercepted from a soft navigation; a hard load renders the page of the same name. Each slot has `default.tsx`, `page.tsx` and `[...rest]` returning `null` |
| `features/` | One folder per feature; `features/shell/` has `RoutePlaceholder`, `SourceReporter`, `DemoDataMarker` |
| `i18n/` | next-intl: `routing.ts`, `request.ts` (locale from `next/root-params`), `navigation.ts` (`Link`, `useRouter`, `usePathname`, `redirect`), `IntlClientProvider.tsx`, `labels.ts` |
| `lib/navigation/routes.ts` | The only place an address is spelled: `routes.*`, `parentOf`, `isRootTab`, `searchStateOf`, `screenNameOf` |
| `lib/brand/` | HOMI's name, bot, links and artwork paths; the only place a brand word may appear |
| `lib/flags.ts` | `devFlags`: the 17 `DEV` switches, all off |
| `lib/analytics/events.ts`, `lib/errors/report.ts` | `track` and `reportError` facades (no-ops until WP-32) |
| `lib/data/sources.ts` | Which drivers answered the current screen; drives the "demo data" marker |
| `proxy.ts` | Locale redirect (cookie `NEXT_LOCALE`, else `ru`); WP-21 adds the CSP and security headers |
| `styles/app.css` | Tailwind and `@homi/ui/styles.css` (tokens, themes, lite, motion) |
| `public/brand/` | Placeholder artwork of the legacy sizes; the final files replace them without a code change |
| `tests/`, `e2e/` | Vitest (`pnpm --filter app test`) and Playwright (`pnpm test:e2e` from `frontend/`) |

Catalogues live in `@homi/i18n` (`frontend/packages/i18n`): the generated `legacy` layer, the hand-written `homi`
layer, and the runtime rules — a missing key renders its path and is reported once, never a throw.

## Commands

```bash
pnpm --filter app dev       # http://localhost:3001, or https://app.homi.loc through the local stack
pnpm --filter app build
pnpm --filter app test      # Vitest project "app"
pnpm --filter app lint
pnpm --filter app typecheck # next typegen && tsc --noEmit
```

Rules for later packages: every address is built with `routes.*` and navigated with `@/i18n/navigation`; colours,
radii and motion come from the tokens of `@homi/ui` (Tailwind's default palette is removed); a server value becomes a
label through `labelFor` of `@/i18n/labels`; workspace packages never import `lib/flags.ts`.
