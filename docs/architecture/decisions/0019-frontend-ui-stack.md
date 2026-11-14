# ADR-0019: Frontend UI stack — Tailwind 4 tokens, shadcn/ui with Radix, next-intl

- Status: Proposed
- Date: 2026-11-14
- Deciders: developer (answer round of 2026-11-14); first developer (review of this PR)
- Source: `docs/migration/24-three-wave-strategy.md` §8.1 (DEC-32, DEC-44, DEC-49); `docs/migration/25-wave-1-plan.md` §2 rule 6, §3.6–§3.8, §10; verbatim answers 6, 20, 21, 36, 37 in `docs/migration/decisions/2026-11-14-developer-answers.md`; amends ADR-0006

## Context

The Mini App keeps the legacy interface (ADR-0016, DEC-46), but its code is rebuilt from the audit and the legacy
code and CSS are never copied (DEC-32). The workspace has Tailwind 4 and the shared packages `@homi/ui` (only `cn`
today) and `@homi/config`, and no component library, icon set, localisation library or map engine. ADR-0006 put the
Next.js message catalogues in `frontend/packages/config`.

## Decision

- **Styling.** Tailwind 4 with tokens in `@homi/ui`: the legacy palette, radii, spacing and type scale become tokens.
  Light, dark and Telegram-driven themes switch by attributes on `<html>`, as legacy does. The lite graphics mode
  stays and turns off blur, shadows and animation by rule, not per component (`25` §3.6).
- **Components.** shadcn/ui with Radix supplies dialogs, sheets, switches, tabs and toasts, restyled to the legacy
  look. A legacy gesture with no equivalent (sheet drag with velocity, swipe back, collapsing header) is written on
  top of the primitive, not replaced by different behaviour (DEC-44, `25` §3.6).
- **Icons.** `lucide-react`, the set legacy uses (`25` §3.6).
- **Localisation.** next-intl with the locale as the first path segment: `ru`, `uz`, `en` (DEC-44, `25` §3.7):
  - `uz` is the address and the file name for legacy `uz_Latn`.
  - The catalogues live in the new workspace package `@homi/i18n`, one file per locale, with the legacy key names.
    Values are copied verbatim except brand words, so a legacy release diff can be applied (`25` §2 rule 6).
  - A missing key renders the key and reports an error instead of throwing (fix of LB-APP-002).
- **Maps.** Both engines (DEC-44, `25` §3.8):
  - the main engine is MapLibre GL with supercluster and PMTiles;
  - the fallback is Leaflet with markercluster and protomaps-leaflet;
  - the legacy rule chooses between them, and both are client-only and loaded on demand.

**Amends ADR-0006.** The Next.js UI catalogues live in `@homi/i18n`, not in `frontend/packages/config`. Everything
else in ADR-0006 stands: the locales `ru`, `uz` and `en`, the time zone, translatable database fields, currency, and
Laravel `lang/` for API messages.

## Consequences

- New dependencies: the batch of `25` §10 (`next-intl`, the Radix primitives that shadcn/ui needs, `lucide-react`,
  the map packages at the legacy versions, `posthog-js`, and the test tools). The developer approved it as one batch
  (DEC-49). The first developer confirms the exact list in the install PR of WP-03 (`docs/handoff/parallel-work.md`
  §4).
- The legacy CSS is not copied (DEC-32). The look is rebuilt from tokens and the audit (`docs/migration/03-legacy-frontend-audit.md` §3.6), and small
  visual differences are accepted (DEC-46).
- Until HOMI hosts its own PMTiles file, both engines use the raster fallback on the public OpenStreetMap tile
  server. Hosting the file is a condition of the launch package WP-70 (`25` §3.8).
- Version-specific behaviour of next-intl (how it plugs into `proxy.ts` on Next.js 16), shadcn/ui, Radix and the
  map libraries is to be verified in the installed documentation by WP-20, after WP-03 has installed them.

## Alternatives considered

- Copy the legacy CSS: rejected. The developer chose «Tailwind 4 + токены» (answer 6), and the legacy code is never
  copied (DEC-32).
- A hand-written component set: rejected. The developer chose «shadcn/ui + Radix» (answer 36). Focus handling,
  dialogs and sheets would otherwise be written and tested again.
- The locale in a cookie: rejected. The developer chose «next-intl, язык в адресе» (answer 37). An address keeps the
  locale across a reload and a shared link.
