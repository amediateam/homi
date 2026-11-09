# KV-FE-103 — Head metadata, JSON-LD, manifest, icons and og images

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Frontend (track: development) |
| Complexity | M |
| Milestone | FE-3a (M9, stage S2) |
| Feature IDs | F-LANDING-007, F-SEO-008 |
| Dependencies | KV-FE-100, KV-FE-101, KV-FE-102; decisions: DEV-042 `PROPOSED`, FD-8 (brand assets), DEC-14 (no listing pages), Q-SEO-004, Q-LND-006 |

## Goal

Every landing and SEO page emits the legacy head: title, description, self canonical without parameters, hreflang
ru/uz/en + `x-default` = ru, og and twitter tags with the per-language og image, and safely serialised JSON-LD
(`Organization` + `WebSite` on the landing, `BreadcrumbList` everywhere on SEO pages, `Dataset` hooks for the index
pages). The static assets that external caches and the JSON-LD point to — icons, og images, the manifest, the favicon
— keep their URLs.

## Legacy reference

- LND-033 (landing head and `@graph` JSON-LD), LND-035 (robots, manifest, icons, og images), LND-057 (SEO head:
  `html lang`, canonical, hreflang, og with `og-{ru,uz,en}.jpg` and `og:locale` `ru_RU` / `uz_UZ` / `en_US`,
  `twitter:card summary_large_image`, `BreadcrumbList`, `Dataset` on index and prices), LND-002 (uz/en head replaced by
  the server), LND-026 (theme colour; behaviour in KV-FE-109).
- URL-011 (robots — content in KV-FE-128), URL-013 (`/site.webmanifest`), URL-014 (`/logo.svg`, `/favicon-32.png`,
  `/apple-touch-icon.png`, `/icon-192.png`, `/icon-512.png`), URL-015 (`/favicon.ico`, UNVERIFIED, Q-LND-006),
  URL-016 (`/og-ru.jpg`, `/og-uz.jpg`, `/og-en.jpg`).
- Rules: BR-SEO-007 (head of every page), BR-SEO-009 (title templates, via KV-FE-102).
- Evidence: `$KVADRO_ROOT/demo/landing/site/index.html:5-36`, `$KVADRO_ROOT/demo/landing/site/uz/index.html:1-30`,
  `$KVADRO_ROOT/demo/landing/site/site.webmanifest`; `$KVADRO_ROOT/docs/seo-pages.md:139-170`.
- Deviation: LB-LND-014 → DEV-042 (per-locale manifest).

## Implementation

1. Read `frontend/landing/node_modules/next/dist/docs/01-app/03-api-reference/04-functions/generate-metadata.md`
   (`alternates.canonical`, `alternates.languages`, `openGraph`, `twitter`, `robots`),
   `01-app/02-guides/json-ld.md`, `01-app/03-api-reference/03-file-conventions/01-metadata/{manifest,app-icons}.md`.
2. `frontend/landing/lib/seo/metadata.ts`: `buildMetadata({lang, route, title, description, robots})` returns Next
   `Metadata` with absolute URLs from `NEXT_PUBLIC_SITE_URL` (`17` §4; `https://kvadro.app` until S6): canonical = the
   page's own path from `buildSeoPath` without any query; `alternates.languages` = `{ru, uz, en, 'x-default': ru}`; og
   `type: website`, `siteName: 'kvadro²'`, `url`, `title`, `description`, `images: [{url: /og-<lang>.jpg, width: 1200,
   height: 630, alt}]`, `locale`; `twitter.card: 'summary_large_image'`.
3. Landing head (`app/[lang]/page.tsx` `generateMetadata`): titles and descriptions from `landing` `meta.title`,
   `meta.desc` and the og description and alt of `index.html:10-16`; canonical `/`, `/uz/`, `/en/` (LND-002 behaviour,
   no `<base>`).
4. `frontend/landing/components/JsonLd.tsx`: the only `dangerouslySetInnerHTML` in the app; serialises with `<`, `>`,
   `&`, U+2028 and U+2029 escaped (SEC-REQ-021; the Next guide escapes `<` only — extend it). Landing `@graph`:
   `Organization` (`@id` `#org`, name «kvadro²», `alternateName` «KvadroApp», `logo` `/icon-512.png`, the project mailbox
   from configuration, `sameAs` the bot URL) and `WebSite` (`@id` `#site`, `inLanguage` ru/uz/en). SEO pages:
   `BreadcrumbList` from the breadcrumb model of KV-FE-114; `Dataset` + `DataDownload` filled by KV-FE-124/KV-FE-125.
   No `FAQPage` (LND-015 has none), no `RealEstateListing` (DEC-14).
5. Static assets in `frontend/landing/public/`: the five icons, three og images and `site.webmanifest` copied from the
   legacy artefacts into the brand layer (FD-8; the S6 brand move swaps this folder). Same file names and content
   types. `/favicon.ico` is served (the legacy answer is unknown, Q-LND-006; a file is harmless).
6. Manifest: `/site.webmanifest` with the legacy content (name «kvadro² — вся аренда из Telegram», `short_name`
   «kvadro²», `start_url` and `scope` `./`, `display: browser`, colours `#0e0e10`, icons 192 and 512). DEV-042 flag
   `dev042LocaleManifest` (default off): `/uz/site.webmanifest`, `/en/site.webmanifest` with localised names, linked from
   the uz/en pages; the root file stays.
7. `<meta name="theme-color" content="#0e0e10">` initially on the landing (switching in KV-FE-109); `#ffffff` on SEO and
   privacy pages (`PRV`, LND-003).
8. `robots` meta per page comes from the caller: `noindex,follow` for thin, sorted and 404 pages (KV-FE-128,
   KV-FE-115, KV-FE-100).

## States and texts

| State | Head |
| ----- | ---- |
| landing ru | `<title>` `landing` `meta.title` «Аренда квартир в Ташкенте — все объявления из Telegram \| kvadro²», canonical `/` |
| landing uz | «Toshkentda ijaraga kvartira (arenda) — Telegramdagi barcha eʼlonlar \| kvadro²», canonical `/uz/` |
| landing en | «Apartments for rent in Tashkent — every Telegram listing \| kvadro²», canonical `/en/` |
| SEO page | title and description from the `seo` templates (BR-SEO-009); canonical without parameters |
| thin / sorted / 404 | as above plus `robots: noindex,follow` |
| data missing | title falls back to the template without the count clause; never an empty `<title>` |

## Interaction

n/a — head only.

## Telegram integration

n/a. (The og tags drive Telegram link previews of shared landing and SEO URLs; keep the 1200 × 630 images.)

## Storage and analytics

n/a.

## Files

- `frontend/landing/lib/seo/metadata.ts`, `frontend/landing/components/JsonLd.tsx` (new)
- `frontend/landing/public/{logo.svg,favicon-32.png,favicon.ico,apple-touch-icon.png,icon-192.png,icon-512.png,og-ru.jpg,og-uz.jpg,og-en.jpg,site.webmanifest}`
- `frontend/landing/app/[lang]/page.tsx`, `app/[lang]/[...slug]/page.tsx` (`generateMetadata` wiring)
- `frontend/landing/tests/metadata.test.ts`, `frontend/landing/tests/json-ld.test.ts`

## API contract

n/a — titles and breadcrumbs use data already fetched by the page (KV-BE-159 `seo/resolve` gives `canonical` and
`alternates`; the builder output must equal them).

## Business rules

- Kept: BR-SEO-007 (head of every page), the LND-033 landing head, LND-057.
- DEV-042 `PROPOSED` behind `dev042LocaleManifest` (test `todo('DEV-042 PROPOSED')`).
- DEC-14: no per-listing structured data.

## Acceptance criteria

- For one page per SEO type and the three landing pages, in three languages, the head equals the legacy head (or the
  archive of KV-FE-007) for: `html lang`, canonical, the four hreflang links, og url/title/description/image/locale,
  twitter card; differences only in numbers that changed with the data.
- `canonical` never carries a query string (`?sort=`, `?page=`, `utm_*`, `s`).
- `GET /icon-512.png`, `/og-uz.jpg`, `/site.webmanifest`, `/logo.svg` answer `200` with the legacy content types.
- A listing title containing `</script><script>alert(1)</script>` inside JSON-LD data is serialised inert.
- Landing parity scenarios `{ru,uz,en}-desktop` (KV-QA-013) compare title and description equal.

## Tests

- Unit (`metadata.test.ts`): canonical and alternates for `/`, `/uz/`, `/en/`, a district page in three languages, a
  sorted page; og locale per language.
- Unit (`json-ld.test.ts`): escaping of `<`, `>`, `&`, U+2028, U+2029; `BreadcrumbList` positions start at 1.
- E2E: fetch each asset URL and compare SHA-256 with the legacy file (recorded in the PR).
- `todo('DEV-042 PROPOSED')`.

## Edge cases

- `x-default` always points to the ru URL, also on uz/en pages.
- A slice that exists in ru but is thin in uz: hreflang still lists all three (legacy lists the alternates per URL;
  confirm with the archive).
- `NEXT_PUBLIC_SITE_URL` on staging (`kvadro.staging.homi.uz`): canonical uses it, so staging never claims production
  URLs; staging must also stay out of search indexes (an environment-wide `noindex`, agreed with KV-FE-128 and
  KV-INF-024 **[PT]**).

## Security

SEC-REQ-021 (JSON-LD is the only raw HTML and is escaped); no personal data in metadata (the mailbox is a project
address from configuration, not a person's).

## Definition of done

`make ci-frontend` green; metadata and JSON-LD tests green; asset hashes recorded; parity gate G4 for F-LANDING-007 and
F-SEO-008 (head part) ticked (`15` §4); `09` rows updated; PR reviewed by the other developer.
