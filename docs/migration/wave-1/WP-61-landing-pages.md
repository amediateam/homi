# WP-61 — Landing pages

| Field | Value |
| ----- | ----- |
| Stage | E |
| Status | TODO |
| Depends on | WP-60, WP-20 |
| Size | about 7 000 changed lines, L — the legacy landing is one 145 KB script plus its styles. Three PRs: part A = steps 1–9 (routing, texts, links, head, headers, data loader, frame: a complete simple page). Part B = steps 10–12 (display versions, hero and phone, live map). Part C = steps 13–17 (sections, privacy, analytics, scenarios). Production works after each part |
| Behaviour reference | `03b` §1 (LND-001 … LND-039), §1.5, §1.6 (the 40 parity scenarios), §3.1 (BR-LND-001 … BR-LND-023), §4.1 (LB-LND-001 … LB-LND-016), §5.1; `04` §6.1 (payloads the bot accepts); `25` §3.6, §3.7, §3.9, §4.4, §7; task files KV-FE-100, KV-FE-102 … KV-FE-113. Not used: KV-FE-101 and KV-FE-114 … KV-FE-129 (SEO, Wave 3) |
| Needs from the production track | (1) The landing app served at `https://homi.uz` and `https://staging.homi.uz` (vhost, TLS, the Node process of `frontend/landing`); staging answers with `X-Robots-Tag: noindex` on every path. (2) Env of the landing app per environment. Keys that `frontend/landing/.env.example` already has keep their names: `NEXT_PUBLIC_APP_ENV`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_CDN_URL` (the media host of the CSP and of the snapshot photos), `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`. New: `NEXT_PUBLIC_SITE_URL`, `API_URL` (server-side address of the API, the name WP-21 uses in `frontend/app`; falls back to `NEXT_PUBLIC_API_URL`), `NEXT_PUBLIC_SUPPORT_USERNAME`, `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST` (HOMI's own project of that environment, DEC-47). (3) nginx adds no second `Content-Security-Policy` header and keeps HSTS, `nosniff` and `Referrer-Policy` consistent with the app's values (below). (4) The media host serves the snapshot proxy of WP-60. Nothing else |

## Goal

`homi.uz` shows the full legacy landing under the HOMI brand in Russian, Uzbek and English: the scene in which
channel posts become one card inside a phone, the phone demo that turns into a live price map, live pushes, the
owner and agent switch, the savings block, the FAQ, the final block with the QR code, and the privacy pages. Every
button leads into HOMI's bot with the source tag and the visit id; every number comes from `GET /api/v1/landing/*`.

## Scope

In:

- Routes `/`, `/uz/`, `/en/`, the privacy pages, the localised 404 and error pages; language selection and switching.
- Catalogues for the landing and privacy texts; plural and number rules.
- Head metadata, icons, manifest, Open Graph images, `Organization` and `WebSite` structured data, `robots.txt` and
  a sitemap of the landing's own pages.
- Security headers with a Content-Security-Policy; site analytics with HOMI's PostHog project; the visit id.
- Link builders for HOMI's bot and Mini App.
- The data loader for `GET /api/v1/landing/live` and `/landing/pins`; the demo marker.
- Every block and behaviour of the table "LND items" marked "in".

Out:

- SEO pages, their path parser, sitemap entries, interlinking, `hreflang` to SEO pages, CSV exports, the footer
  link blocks into SEO pages (LND-018) — Wave 3 (KV-FE-101, KV-FE-114 … KV-FE-129).
- The landing data itself — WP-60. The `/start` payload handling in the bot — WP-52.
- The final legal wording of the privacy text — WP-70.
- The debug and benchmark overlays of the legacy script (`?bench=1`, `?debug=vh`): development tools, not rebuilt.

## Decisions that bind this package

| # | Decision | Consequence here |
| - | -------- | ---------------- |
| 1 | DEC-38, `25` §7 | The whole legacy landing, without the SEO pages. A block is left out only when the table "LND items" says why |
| 2 | DEC-32, `25` §2 rule 3 | Rebuilt from the audit. No legacy script or stylesheet is copied; the generated `miniapp.css` and `miniapp-i18n.js` of legacy (LND-036) have no successor — the phone is built from `@homi/ui` tokens and `@homi/i18n` keys |
| 3 | DEC-40, `25` §2 rule 5 | Name, logo, bot, support contact, site address and legal texts come from one brand layer. No legacy brand word, handle or host may reach a page (test) |
| 4 | DEC-36 and answer 5 of the developer | Defects of the table "Defects" are fixed. A defect whose fix is a `DEV` row is built behind a flag in `lib/flags.ts`, off: DEV-038, DEV-039, DEV-040, DEV-042 |
| 5 | DEC-44, `25` §3.7 | next-intl, as in the Mini App, with the catalogues of `@homi/i18n`. Unlike the Mini App the default language has no prefix (`/`), because that is the legacy address shape |
| 6 | DEC-47, `25` §3.9 | HOMI's own PostHog project per environment; an absent key means no analytics code is loaded |
| 7 | `25` §4.4, RK-27 | When an answer has `meta.source = stub`, the block that shows it carries the "demo data" marker of WP-20 |
| 8 | `25` §4.1 | The API answers `503 source_unavailable` → the page renders without that block's numbers; it never fails |
| 9 | DEC-08 (open: CSP for the landing) | Baseline of its recommendation: a policy without nonces, set in `next.config.ts`. The developer and the security review confirm it, or the hash-based option, in part A |
| 10 | DEC-49 | No new package beyond the approved batch. `next-intl` is in `frontend/landing/package.json` since WP-03; `posthog-js` (installed by WP-03 for `app` only) is added to it at the same exact version, with the `@homi/*` workspace packages the landing imports — a `package.json` and lockfile change the PR names for the first developer; a QR generator is **not** added (static files, see "Brand") |
| 11 | DEC-46, `25` §9 | Functional parity; the checklist is run in ru, uz and en at 1 366 × 860 and 390 × 844 |

## Design

### Next.js: read first

Next.js 16.4 differs from earlier versions; state nothing from memory. Before each step read the named files under
`frontend/landing/node_modules/next/dist/docs/01-app/`:

| Topic | Files |
| ----- | ----- |
| Locale segment, redirect by language | `02-guides/internationalization.md`, `03-api-reference/03-file-conventions/dynamic-routes.md`, `03-api-reference/04-functions/generate-static-params.md` |
| `proxy.ts` (the docs say the `middleware` convention is deprecated and renamed to `proxy`) | `01-getting-started/16-proxy.md`, `03-api-reference/03-file-conventions/proxy.md` |
| Redirects, trailing slash, headers | `02-guides/redirecting.md`, `03-api-reference/05-config/01-next-config-js/{redirects,trailingSlash,headers}.md` |
| Server and Client Components, lazy chunks | `01-getting-started/05-server-and-client-components.md`, `02-guides/lazy-loading.md`, `02-guides/server-and-client-boundary.md` |
| Fetching and caching with `cacheComponents` (it is on in `next.config.ts`) | `01-getting-started/06-fetching-data.md`, `08-caching.md`, `09-revalidating.md`, `03-api-reference/01-directives/use-cache.md`, `03-api-reference/04-functions/cacheLife.md`, `03-api-reference/05-config/01-next-config-js/cacheComponents.md`, `02-guides/public-static-pages.md` |
| Metadata, icons, manifest, Open Graph, robots, sitemap, JSON-LD | `01-getting-started/14-metadata-and-og-images.md`, `03-api-reference/04-functions/generate-metadata.md`, `generate-viewport.md`, `03-api-reference/03-file-conventions/01-metadata/{app-icons,manifest,opengraph-image,robots,sitemap}.md`, `02-guides/json-ld.md` |
| 404 and error pages | `01-getting-started/10-error-handling.md`, `03-api-reference/03-file-conventions/{not-found,error}.md` |
| Content-Security-Policy | `02-guides/content-security-policy.md` — it states that nonces require dynamic rendering, and describes the variant without nonces and the experimental hash-based option |
| A class on `<html>` before the first paint | `02-guides/preventing-flash-before-hydration.md`, `02-guides/scripts.md`, `03-api-reference/02-components/script.md` |
| Images, fonts, CSS | `01-getting-started/{11-css,12-images,13-fonts}.md`, `03-api-reference/02-components/{image,font}.md` |
| Environment variables, analytics, third-party code | `02-guides/environment-variables.md`, `02-guides/analytics.md`, `02-guides/third-party-libraries.md` |
| Tests | `02-guides/testing/` |

How next-intl leaves the default language without a prefix and plugs into `proxy.ts` on this Next.js version is to
be read in the next-intl documentation before step 3 (`UNVERIFIED` here, as in `25` §3.7).

### Routes

```text
frontend/landing/
├── app/
│   ├── [locale]/
│   │   ├── layout.tsx          html lang, fonts, display-version script, analytics mount, demo marker
│   │   ├── page.tsx            the landing
│   │   ├── privacy/page.tsx    the privacy page
│   │   ├── not-found.tsx       localised 404, noindex
│   │   └── error.tsx
│   ├── robots.ts  sitemap.ts  manifest.ts
│   └── global-not-found.tsx    404 for paths that match no route (experimental; read not-found.md first)
├── components/landing/         one file per block (below)
├── lib/                        brand, flags, links, analytics, landing-data, landing, motion, seo
├── i18n/                       routing.ts, request.ts, navigation.ts (as in frontend/app)
├── proxy.ts
├── public/                     icons, og images, brand and demo images, QR files
└── tests/  e2e/
```

| Address | Answer |
| ------- | ------ |
| `/`, `/uz/`, `/en/` | the landing in ru, uz, en; `<html lang>` accordingly (LND-001, LND-002) |
| `/privacy/`, `/uz/privacy/`, `/en/privacy/` | the privacy page |
| `/uz`, `/en`, `/privacy` | permanent redirect to the slashed address, query kept (LND-038) |
| `/ru/…` | permanent redirect to the same path without the prefix |
| `/index.html`, `/privacy.html` | permanent redirect to `/` and `/privacy/`, query kept |
| anything else | `404` as an HTML page in the language of the prefix, `noindex,follow`, with links to `/`, the bot and the privacy page — never JSON (fix of LB-LND-013) |

Language of `/` (BR-LND-004, legacy order kept): (1) `?lang=ru|uz|en`; (2) the path prefix; (3) the stored choice;
(4) the browser languages — `uz` or `ru` wins; `kk`, `ky`, `tg`, `tk`, `be` count as `ru`; `en` only when none of
those appears anywhere in the list; otherwise `ru`. The visible result equals legacy: the visitor ends on the page
of that language and the address says so.

- Steps 1 and 4 are decided in `proxy.ts`: a request for `/` that resolves to uz or en is redirected to `/uz/` or
  `/en/`, keeping `s`, `utm_source` and other parameters and dropping `lang`. A crawler without `Accept-Language`
  gets ru.
- Step 3: the choice is kept in `localStorage` under `homi-landing-lang` — not in a cookie, because the privacy text
  says the site sets none. A small inline script on `/` redirects before the first paint when a stored choice
  differs.
- A language switch (menu or footer buttons) is a navigation to the address of that language with the query and
  hash kept; it stores the choice (BR-LND-005). All addresses in the page are root-relative (fix of LB-LND-001); the
  uz and en pages are rendered from the same components (fix of LB-LND-003).
- Flag `dev038RootAlwaysRu` (DEV-038, off): `/` is always ru and `?lang=` redirects permanently.

### Texts and formats

- The 106 landing keys and the privacy texts live in `@homi/i18n` under `messages/landing/{ru,uz,en}.json` and
  `messages/privacy/{ru,uz,en}.json`, with the legacy key names (LND-028). They are imported once from the legacy
  catalogue file with the importer pattern of WP-20, then brand words are rewritten by the `messages/homi` layer.
  The keys of the phone demo are the Mini App keys already in the package (WP-20).
- No text reaches the DOM as raw HTML: `components/RichText.tsx` maps the few allowed tags (`br`, `b`, links) to
  elements.
- `lib/landing/format.ts`: plurals — ru three forms, en two, uz one; numbers — `ru-RU` grouping for ru and uz,
  `en-GB` for en; money `$` + number (BR-LND-006); ages «только что», «N мин назад», «N ч назад», «N дн. назад»
  relative to the `now` of the data, never the visitor's clock (BR-LND-013, BR-LND-014); the Uzbek weekday and month
  names of the lock-screen date written out by hand.
- English place names follow one convention, the one of the reference data (fix of LB-LND-011).

### Brand

`frontend/landing/lib/brand.ts`. The constants shared with the Mini App (`name`, the site address, the support
contact, the optional Instagram address) move to `@homi/config` as `brand`, and `frontend/app/lib/brand` of WP-20
imports them from there, so there is one definition. Per-environment values come from the env keys of the field
table. A test fails when a string of `brand-words.json` (`@homi/i18n`, WP-20) appears in the rendered HTML of any
route or under `frontend/landing` outside `lib/brand.ts`.

Assets under `public/`: `logo.svg`, `favicon.ico`, `favicon-32.png`, `apple-touch-icon.png`, `icon-192.png`,
`icon-512.png`, `og-{ru,uz,en}.jpg` — HOMI's, from the product owner. The QR code of the final block encodes
`https://t.me/<bot username>`; it is a static file per bot (`img/qr-<bot username>.svg`, produced once outside the
repository for the staging and the production bot) chosen by `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`; a missing file
fails the build.

Demo assets, which legacy ships as files: the four post photos, the six owner and agent card photos, and the static
Tashkent map image. The pins of the data are positioned in per cent on **that** map image (1 800 × 1 125), so HOMI
needs an image of the same extent. These are images, not code; using them needs the product owner's permission
(they show third parties' flats). Until it is given, part B uses neutral placeholders for the photos; the map image
has no substitute and is requested first.

### Links into Telegram

`lib/links/telegram.ts`, used through `components/BotLink.tsx`:

| Link | Format | Rule |
| ---- | ------ | ---- |
| Bot buttons: hero, final block, dock, the radar «+» in the phone | `https://t.me/<bot>?start=s_web[_<tag>][--v<visit>]` | BR-LND-001: tag = the lower-cased `?s=`, else `?utm_source=`, kept when it matches `^[a-z0-9_-]{1,40}$`, else dropped; at most 59 characters (LND-030) |
| Listing links in the live demo | the `link` of the data: `https://t.me/<bot>?startapp=l_<number>-web` | not tagged (BR-LND-017) |
| QR | `https://t.me/<bot>` | no payload, as legacy. Flag `dev040AttributedQr` (DEV-040, off) would add `s_web_qr` |
| Support, Instagram, OpenStreetMap | plain links from the brand layer | Instagram is hidden when the brand has none |

- Visit id (BR-LND-002): ten characters of `[a-z0-9]` from `crypto.getRandomValues`, kept in `sessionStorage` under
  `homi-visit`, one per tab session; regenerated when invalid; a blocked storage gives a new id per page view.
- Payloads are built and validated when the link is rendered; nothing is cut silently (fix of item 4 of
  LB-LND-007). A missing bot username fails the build.
- The bot parses these payloads in WP-52 (handlers BOT-027, BOT-028, BOT-029 of `04`).

### Data

`lib/landing-data.ts` (server only) calls `GET /api/v1/landing/live` and `GET /api/v1/landing/pins?deal=rent` (and
`deal=sale`) through `@homi/api-client` with `Accept-Language` of the page, validates the shape against the
generated types of `@homi/types`, and returns `{ data, source }` or `null`.

- The calls are made on the server and cached with the mechanism the caching docs describe for `cacheComponents`,
  with a lifetime of five minutes; the browser never calls the API (no CORS, WP-60).
- The numbers are in the server HTML: counters, the savings block and the first pushes are readable without
  JavaScript.
- `null` (the API answered `503`, timed out after 3 s, or the shape check failed): flag `dev039NoPlaceholderNumbers`
  off (legacy, LB-LND-006) → the legacy fallback values are shown — the hard-coded medians of the savings block and
  one example push; counters stay hidden. Flag on (DEV-039) → no numeric claim at all.
- `source = stub` → the demo marker next to each block fed by that answer.
- The sale pins are fetched when the visitor first chooses «Продажа» or the live map opens: a route handler
  `app/api/pins/route.ts` of the landing passes the request to the API on the server, with the same cache.

### Blocks

Each block is one component under `components/landing/`. "Server" means its text is in the server HTML.

| Block | Component | Content and rules |
| ----- | --------- | ----------------- |
| Header (LND-004) | `Header`, `LanguageMenu` | logo wordmark (brand), a globe button with the language code, `aria-label` of the pattern «RU — Язык: Русский», a `role=menu` with three `menuitemradio` «Русский», «Oʻzbekcha», «English»; outside click or Escape closes, Escape returns focus |
| Hero (LND-005) | `Hero` | seven example channel posts gather into one card; `h1` «Аренда квартир в Ташкенте», slogan, lead, the CTA «Открыть в Telegram», caption. Server |
| Phone demo (LND-006) | `PhoneDemo` (lazy chunk) | a static replica of the Mini App: top bar «Аренда · Ташкент», tabs, chips, feed with the first card, favourites, radar, settings, tab bar, filter sheet, static map, lock-screen wall; `role=img` with a label; every control inert until the live phase |
| Steps (LND-007) | `Steps` | «Как приложение. Прямо в Telegram.» — three steps feed → filters → map; a progress bar on narrow screens. Server |
| Hints (LND-009, LND-010) | `DemoFinger`, `ScrollCue` | the demo finger on a five-second cycle, stops at the first touch; «Попробуйте сами»; «Листайте дальше» |
| Lock phase (LND-011) | `LockPhase`, `Push` | v1 only: up to four pushes from `latest`, oldest first, the first at 12 % of the phase and then every 17 %, removed when scrolling back (BR-LND-014) |
| Live map (LND-008) | `LiveMap`, `LiveFeed`, `LiveFilters`, `LiveRadarTile` | price pins on the static map; which pins show and the declutter (BR-LND-010); demo filters on rooms, price, district, owner (BR-LND-011); tones (BR-LND-012); card facts `<rooms> · <area> м² · <floor>/<total> эт.` (BR-LND-013); sheet footer «≈N в день» or a weekly number (BR-LND-015); radar tile (BR-LND-016); a listing tap opens its `link`, a tap on a display-only control opens nothing, a 5 px drag is not a click (BR-LND-017) |
| «Узнавайте первым» (LND-012) | `LiveSection` | a lock-screen phone with clock and date in Asia/Tashkent, pushes dripping one per second while at least 35 % visible, ages refreshed every 30 s, the counter; shown where the lock phase does not run. Without JavaScript one example push. Server |
| Owner and agent (LND-013) | `OwnerAgentSwitch` | the heading is a `role=switch` «Хозяин» ◐ «Риелтор»; three cards per side with evidence lines; the sets slide 200 ms out and 380 ms in, not at all under reduced motion; card facts re-rendered per language |
| Savings (LND-014) | `SavingsBlock` | BR-LND-008: `cheap = round to 10 (median × 0.8)`; yearly saving `(median − cheap) × 12`; defaults two rooms and `chilonzor`; room buttons 1, 2, 3; district buttons ordered by the sum of `n`, descending; a district without the chosen rooms selects the first entry. The weekly line when `bargains_week` ≥ 100 (BR-LND-009). Rent only. Server |
| FAQ (LND-015) | `Faq` | eight `<details>` in two columns, the first open; no `FAQPage` structured data. Server |
| Final block (LND-016) | `FinalBlock` | «Бесплатно · N новых квартир за сутки» (or «за неделю»; BR-LND-007: `day` when ≥ 100, else `week` when ≥ 100, else no number; count-up 1.2 s), `h2` «Найдите квартиру сегодня», the CTA, the QR with «Откройте на телефоне» on desktop. Server |
| Footer (LND-017) | `Footer` | «© 2026 kvadro² [brand → HOMI]», language buttons with `aria-pressed`, links «Поддержка», «Instagram», «Конфиденциальность», «Карта: © OpenStreetMap»; the large wordmark, `aria-hidden` |
| Floating QR (LND-019) | `FloatingQr` | only at `min-width: 1200px` with hover and a fine pointer, after the first scene; expands into the final block's QR panel when that block is more than half visible; «Скрыть QR-код» hides it for the page view (BR-LND-023) |
| Dock (LND-020) | `Dock` | a sticky bottom «Открыть в Telegram»; shown after the first-screen CTA has gone; hidden on the steps, while the phone fills the screen, and when the final block shows (BR-LND-022) |

### Display versions and motion

| Version | When | Behaviour |
| ------- | ---- | --------- |
| v1 (LND-022) | a mouse device, scroll timelines supported, motion allowed | scroll-driven scene with smoothing; the phone chrome collapses in the 42–58 % range; `?motion=raw` disables the smoothing |
| v2 (LND-023) | `?v=2`, or a coarse pointer without `?v=1` (BR-LND-018) | time-driven show: trigger at 60 % of the viewport, an intro of about 2.6 s, a scroll hold with a 5 s safety limit, never replays |
| Simple v2 | BR-LND-019: reduced motion, Android with at most 4 cores or 2 GB, viewport height under 500, no `Element.animate`, no IntersectionObserver, or an intro measured under about 30 fps; `?anim=on` or `?anim=off` forces it | no intro, plain reveal |
| Static (LND-024) | reduced motion, or no scroll timelines on a mouse device | every block visible, no animation; «Узнавайте первым» shown |

- The version class on `<html>` is set by an inline script before the first paint, without a hydration warning.
- Responsive rules of LND-025: the phone scales to the viewport, with a separate range for landscape phones; the
  language menu stays inside a 320 px viewport.
- Theme colour (LND-026, BR-LND-021): `#0e0e10` while the dark first scene is under the browser toolbar, `#ffffff`
  afterwards. The legacy landing has one theme; there is no light and dark variant to check.
- The map image is requested about 600 ms after `load`; the phone demo is a lazy chunk (fix of LB-LND-010).
- Lite rules: on `Save-Data` or a `2g` connection the photos of the hero posts are not requested.

### Head, robots, headers

| Item | Value |
| ---- | ----- |
| Title, description | catalogue keys of the legacy head (LND-033), brand replaced |
| Canonical | the page's own address without query; `/` is the ru page |
| `hreflang` | `ru`, `uz`, `en` and `x-default` = ru, on the landing and on the privacy pages |
| Open Graph, Twitter | `og:url`, title, description, `og:image` = `og-<locale>.jpg`, `og:locale` `ru_RU`, `uz_UZ`, `en_US`; `twitter:card summary_large_image` |
| Structured data | one `@graph` with `Organization` and `WebSite` on the landing; none on the privacy pages; serialised so that a `</script>` in a value is inert |
| Manifest | one, in Russian, HOMI name and icons (legacy; LB-LND-014). Flag `dev042LocaleManifest` (DEV-042, off) |
| `robots.txt`, sitemap (LND-035) | production: allow all, sitemap with the three landing pages and the three privacy pages. Any other `NEXT_PUBLIC_SITE_URL`: disallow all, and `noindex` in the head |

Security headers from `lib/security-headers.ts`, set in `next.config.ts` (fix of LB-LND-009: no hand-pinned hashes,
a narrow `img-src`):

```text
default-src 'self';
script-src 'self' 'unsafe-inline';            // 'unsafe-eval' only in development; replaced by hashes if DEC-08 chooses them
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob: https://<media host>;
font-src 'self' data:;
connect-src 'self' https://<PostHog host>;
worker-src 'self' blob:;  object-src 'none';  base-uri 'none';  form-action 'self';  frame-ancestors 'none'
```

plus `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, and `report-uri` when `CSP_REPORT_URI` is
set (WP-70 decides the endpoint). The landing does not call the API from the browser, so the API host is not in
`connect-src`. `posthog-js` is bundled, so no script host is added.

### Analytics

`components/SiteAnalytics.tsx`, mounted once in the layout (LND-031): the visit id at once; PostHog imported and
started 1.5 s after `load`, never on `Save-Data` or `2g`, without cookies and without local persistence, with the
super-properties `site` (the site host), `visit` and `env`; nothing is loaded when the key is empty. Events keep the
legacy names (autocapture of clicks plus the page view). Option names are confirmed against the installed
`posthog-js` version, as WP-32 does for the Mini App.

### Privacy pages

`app/[locale]/privacy/page.tsx` (LND-003): title «Конфиденциальность — kvadro² [brand → HOMI]» / «Maxfiylik — …» /
«Privacy — …», the line «Обновлено <дата>», the sections «Сайт kvadro.app [site → homi.uz]», «Бот и приложение
kvadro² [brand → HOMI] в Telegram», «Как удалить свои данные», «Авторам объявлений», «Вопросы», and «← На главную».

- One page per language at the language's address; the language switch and the home link are navigations. On a new
  domain there is no legacy address to keep, so the one-address page with a script-chosen language (LB-LND-008,
  BR-LND-020) is not rebuilt; `/privacy.html` redirects.
- The contact is a plain link from the brand layer; nothing depends on a CDN rewriting an e-mail address
  (LB-LND-016, LND-039).
- The text is the legacy text adapted to what HOMI really does — the same adaptations as the bot text of WP-56
  (no support bot of its own, listings shown from another service and not stored, HOMI's own PostHog project, the
  real LLM vendor, a site without cookies that passes a visit number into the bot). The vendor is not fixed
  (DEC-55): the page takes its display name from the brand layer (`brand.llmVendor`, a build-time value that the
  production track changes together with `BRAND_LLM_VENDOR` of the bot text, WP-56) and prints the sentence that
  no language model is used while it is empty. The text is marked "pending legal review"; WP-70 delivers the final
  wording as the answer to Q-SEC-021. The page and the bot text are changed together.

## Files

All paths under `frontend/`.

- `landing/next.config.ts`, `landing/proxy.ts`, `landing/package.json`, `landing/i18n/{routing,request,navigation}.ts`
- `landing/app/[locale]/{layout,page,not-found,error}.tsx`, `landing/app/[locale]/privacy/page.tsx`,
  `landing/app/{robots,sitemap,manifest}.ts`, `landing/app/api/pins/route.ts`; the template `app/layout.tsx`,
  `app/page.tsx` removed
- `landing/components/{RichText,BotLink,JsonLd,SiteAnalytics,DemoMarker}.tsx`
- `landing/components/landing/{Header,LanguageMenu,Hero,PhoneDemo,Steps,DemoFinger,ScrollCue,LockPhase,Push,LiveMap,LiveFeed,LiveFilters,LiveRadarTile,LiveSection,OwnerAgentSwitch,SavingsBlock,Faq,FinalBlock,Footer,FloatingQr,Dock}.tsx`
- `landing/lib/{brand,flags,locales,security-headers,landing-data}.ts`, `landing/lib/links/telegram.ts`,
  `landing/lib/analytics/{visit,posthog}.ts`, `landing/lib/landing/{format,pins,filters,savings,counter}.ts`,
  `landing/lib/motion/{capabilities,v1Scroll,v2Show,simple,themeColor}.ts`, `landing/lib/seo/metadata.ts`
- `landing/public/…` (brand and demo assets, QR files)
- `packages/i18n/messages/{landing,privacy}/{ru,uz,en}.json`, `packages/i18n/scripts/import-landing.mjs`
- `packages/config/src/brand.ts`; `app/lib/brand/index.ts` (imports the shared constants)
- `landing/tests/*.test.ts(x)`, `landing/e2e/*.spec.ts`; the `landing` projects in `frontend/vitest.config.ts` and
  `frontend/playwright.config.ts`
- Shared file, separate small PR: `landing/.env.example` (adds `NEXT_PUBLIC_SITE_URL`, `API_URL`,
  `NEXT_PUBLIC_SUPPORT_USERNAME` and uncomments the two PostHog keys; the five existing keys keep their names) and
  the frontend key list of `docs/infrastructure/environments.md`

## Steps

Part A.

1. Read the Next.js files of the table, the next-intl routing documentation, the specifications of WP-20 (i18n
   package, tokens, demo marker, flags), WP-60 (data) and WP-52 (payloads). List the assets to ask for; send the
   request to the product owner.
2. Workspace wiring: `posthog-js` at the version WP-03 pinned and the `@homi/*` workspace packages in
   `landing/package.json` (`next-intl` is there since WP-03; the Composer package registry is not affected); the
   Vitest project; the Playwright projects `landing-desktop` and `landing-phone` that WP-03 declared empty — set
   `landing-desktop` to 1 366 × 860 (WP-03 wrote 1440 × 900) and add a `webServer` entry that builds and starts
   `landing` on port 3000, because WP-03 starts only `app`; `lib/flags.ts` with the four flags.
3. Routes and `proxy.ts`: the table of addresses, the language order, the redirects, the 404 page; unit tests of
   the language resolver; `e2e/routing.spec.ts`.
4. Catalogues: the importer, the landing and privacy messages, the brand overrides; `RichText`; `format.ts` with
   its tests; the brand-word test.
5. `@homi/config` brand constants; `lib/brand.ts`; `lib/links/telegram.ts`, `BotLink`, the visit id; tests of every
   payload rule.
6. Head: metadata builder, structured data, icons, manifest, Open Graph images, `robots.ts`, `sitemap.ts`; tests.
7. Security headers; the header test; a Playwright run that fails on any CSP violation. Record the decision on
   DEC-08 in the PR.
8. `landing-data.ts` with validation, cache, fallback, demo marker; tests on synthetic fixtures.
9. Frame: `Header`, `LanguageMenu`, `FinalBlock`, `Footer`, `FloatingQr`, `Dock`, and the hero texts without
   motion; `e2e/landing-language.spec.ts`. `make ci-frontend`; PR A; deploy; check on staging and production.

Part B.

10. Display versions: the inline switch, capabilities, v1, v2, simple, static, theme colour; tests.
11. `Hero` with the posts scene, `PhoneDemo`, `Steps`, hints, `LockPhase`.
12. Live map: `pins.ts`, `filters.ts`, the four components, the sale request; tests. PR B; deploy.

Part C.

13. `LiveSection`, `OwnerAgentSwitch`, `SavingsBlock` (`savings.ts`, `counter.ts`), `Faq`.
14. Privacy pages in three languages.
15. `SiteAnalytics`; a Playwright test that no request leaves for PostHog without a key and that no cookie is set.
16. The scenario suite: the 40 parity scenarios of `03b` §1.6 as Playwright cases on the stub driver, each mapped to
    its expected result or to the defect fix that changes it; Lighthouse on staging.
17. `make ci-frontend`; PR C; deploy; the checklist with screenshots; the reviewer signs.

## Behaviour to reproduce

### LND items

| # | Item | Id | In this package |
| - | ---- | -- | --------------- |
| 1 | Landing, ru | LND-001 | in — steps 3, 9 |
| 2 | Landing, uz and en | LND-002 | in — step 3 |
| 3 | Privacy policy | LND-003 | in — step 14 |
| 4 | Header: logo and language menu | LND-004 | in — step 9 |
| 5 | First scene: posts become one card | LND-005 | in — step 11 |
| 6 | Phone with the Mini App demo | LND-006 | in — step 11 |
| 7 | «Как приложение. Прямо в Telegram.» steps | LND-007 | in — step 11 |
| 8 | Live price map in the phone | LND-008 | in — step 12 |
| 9 | Demo finger and tap cursor | LND-009 | in — step 11 |
| 10 | «Попробуйте сами» hint and «Листайте дальше» cue | LND-010 | in — step 11 |
| 11 | Lock-screen phase (v1) | LND-011 | in — step 11 |
| 12 | «Узнавайте первым» section | LND-012 | in — step 13 |
| 13 | «Хозяин ◐ Риелтор» switch | LND-013 | in — step 13 |
| 14 | Savings block | LND-014 | in — step 13 |
| 15 | FAQ | LND-015 | in — step 13 |
| 16 | Final block | LND-016 | in — step 9 |
| 17 | Footer row | LND-017 | in — step 9 |
| 18 | Footer SEO link blocks | LND-018 | out: the SEO pages they link to are Wave 3 |
| 19 | Floating QR | LND-019 | in — step 9 |
| 20 | Dock | LND-020 | in — step 9 |
| 21 | Display versions v1 / v2 | LND-021 | in — step 10 |
| 22 | v1 scroll-driven scene | LND-022 | in — step 10 |
| 23 | v2 time-driven show and simple version | LND-023 | in — step 10 |
| 24 | Static layout | LND-024 | in — step 10 |
| 25 | Responsive behaviour | LND-025 | in — step 10 |
| 26 | Browser theme colour | LND-026 | in — step 10 |
| 27 | Language selection and switching | LND-027 | in — step 3 |
| 28 | Client-side texts, plurals and numbers | LND-028 | in — step 4 (rendered on the server) |
| 29 | Server-side localisation of `/uz/` and `/en/` | LND-029 | in — step 3 (one locale route) |
| 30 | Links into the bot with source tag and visit id | LND-030 | in — step 5 |
| 31 | Analytics without cookies | LND-031 | in — step 15 |
| 32 | Landing data loading | LND-032 | in — step 8 |
| 33 | Head metadata and structured data | LND-033 | in — step 6 |
| 34 | CSP, inline-script hashes, version stamps | LND-034 | in — step 7 (policy rebuilt; build hashes replace the stamps) |
| 35 | `robots.txt`, manifest, icons, og images | LND-035 | in — step 6 |
| 36 | Files generated outside the repository | LND-036 | replaced: the data comes from WP-60, the phone styles and texts from the shared packages |
| 37 | Debug and benchmark query parameters | LND-037 | partly: `?v=`, `?anim=`, `?motion=` in step 10; the debug overlays are not rebuilt |
| 38 | Landing HTTP routing | LND-038 | in — step 3 |
| 39 | Cloudflare e-mail obfuscation | LND-039 | not applicable: plain contact link |
| 40 | SEO pages, their shared parts and backend needs (25 items) | LND-040 … LND-064 | out: SEO, Wave 3 |

Totals: 39 landing items — 36 in, 1 partly (LND-037), 1 out (LND-018), 1 not applicable (LND-039), with LND-036
counted as in through its replacements; 25 SEO items out.

### Defects

| # | Defect | Id | What is done |
| - | ------ | -- | ------------ |
| 1 | Relative addresses break after a language switch | LB-LND-001 | fixed: root-relative addresses, the switch is a navigation |
| 2 | `/` is translated in the browser | LB-LND-002 | the language of `/` is resolved before rendering and ends in a redirect; "always ru" is DEV-038, flag off |
| 3 | `/uz/` and `/en/` made by text substitution | LB-LND-003 | fixed: one locale route |
| 4 | Point medians listed as districts | LB-LND-004 | fixed in WP-60; a test here proves no `pt:` code can be rendered |
| 5 | Data versioning does not match reality | LB-LND-005 | fixed: no constant version key; `generated_at` of WP-60 |
| 6 | Hard-coded numbers shown as live | LB-LND-006 | legacy kept as the fallback; "no placeholder numbers" is DEV-039, flag off |
| 7 | Attribution gaps | LB-LND-007 | silent truncation fixed by validation; the QR payload is DEV-040, flag off |
| 8 | Privacy page: one address, language by script | LB-LND-008 | pages per language (no legacy address to keep on `homi.uz`) |
| 9 | CSP with hand-pinned hashes, wide `img-src` | LB-LND-009 | fixed: policy from one builder, narrow `img-src` |
| 10 | Monolithic, unminified assets | LB-LND-010 | fixed: build output, lazy phone chunk |
| 11 | Inconsistent English place names | LB-LND-011 | fixed: one convention |
| 12 | Unsigned photo copies kept without end | LB-LND-012 | fixed in WP-60: proxy with a one-day cache |
| 13 | Unknown paths answer JSON | LB-LND-013 | fixed: HTML 404 |
| 14 | Manifest in Russian only | LB-LND-014 | legacy kept; per-language manifest is DEV-042, flag off |
| 15 | Debug switches public | LB-LND-015 | the overlays are not rebuilt; the display switches stay |
| 16 | Dependence on a CDN e-mail rewrite | LB-LND-016 | fixed by construction: plain link |

### Scenarios

The 40 parity scenarios of `03b` §1.6 are the scenario list; each is a Playwright case and a checklist line.

| Group | Scenarios | Expected |
| ----- | --------- | -------- |
| Full scene | `{ru,uz,en}-desktop`, `{ru,uz,en}-phone-v1`, `{ru,uz,en}-desktop-live` | the scene at each step label; the same screens and first card in the phone |
| v2 | `ru-phone-v2-hero`, `ru-desktop-v2-hero` | the timed show runs once |
| Live demo | `live-phone-v1`, `deal-sale`, `deal-sale-phone-v1`, `sheet-filters`, `sheet-toggles`, `sheet-sale`, `pin-card`, `pin-other`, `sub-switch` | pins, footer numbers and the radar line as computed from the fixture; a pin card opens its `link` |
| Blocks | `owner-agent`, `qr-close` | the switch changes sets and lead; the QR stays hidden after closing |
| Static | `{ru,uz,en}-desktop-static`, `{ru,uz,en}-phone-static` | every block visible, no animation |
| Language | `browser-uz`, `browser-en`, `browser-kk`, `query-lang-en`, `stored-lang-uz`, `menu-lang-uz`, `menu-lang-en-from-uz` | the final language and address of BR-LND-004 and BR-LND-005; after a switch every image and link answers `200` |
| Attribution | `source-tag` (`/?s=Insta_1`) | every bot button carries `s_web_insta_1--v<visit>` |
| Privacy | `privacy-ru`, `privacy-uz`, `privacy-en-browser`, `privacy-stored-uz` | the page of that language; `?lang=uz` on the ru page redirects to `/uz/privacy/` |

Edge cases: fewer than four `latest` items → as many pushes; `medians` empty → no district row; a pin photo that
answers `404` → the card hides the image; a pin without `link` → the bot link; `is_owner: null` → kept by "без
риелторов", dropped by "только хозяева"; rooms of five and more use the four-room title; storage blocked → the
choice is not remembered and nothing throws; a background tab during the intro or the QR morph ends in a consistent
state; `?lang=xx` is ignored.

## Tests

| # | Layer | Test | Cases |
| - | ----- | ---- | ----- |
| 1 | Unit (Vitest) | language resolver | the four steps of BR-LND-004 with the `kk`, `ky`, `tg`, `tk`, `be` cases; `en` only without them; unknown `?lang` |
| 2 | Unit | `format.ts` | plurals 1, 2, 5, 21 in ru; en two forms; uz one; number grouping per locale; ages from the data `now`; the non-breaking hyphen of «2‑комн.»; Uzbek date names |
| 3 | Unit | `telegram.ts`, `visit.ts` | `?s=Insta_1`, `?utm_source=tg`, an invalid tag dropped, 40-character tag, the 59-character bound, visit format, `startapp` links untouched, missing username throws |
| 4 | Unit | `savings.ts`, `counter.ts` | median 600 → cheap 480, «$1 440»; district order; missing rooms → first entry; `day` 120; `day` 80 and `week` 450; both small → hidden |
| 5 | Unit | `pins.ts`, `filters.ts` | the demo filter semantics; declutter leaves no overlap in the fixtures; owner tri-state |
| 6 | Unit | `landing-data.ts` | valid answers; `503`; timeout; a shape error; `source = stub` sets the marker; a `pt:` code never reaches the savings rows |
| 7 | Unit | metadata, structured data, security headers | canonical without query; four `hreflang` links; `og:image` per locale; an injected `</script>` is inert; exactly one policy string per environment |
| 8 | Component (Testing Library) | `LanguageMenu`, `OwnerAgentSwitch`, `Faq`, `SavingsBlock`, `FloatingQr` | roles, keyboard, `aria` states, reduced motion |
| 9 | Static | brand-word test over the built HTML of every route; catalogue key parity across ru, uz, en | |
| 10 | End to end (Playwright, stub driver, projects 1 366 × 860 and 390 × 844) | `routing`, `landing-language`, `landing-versions`, `landing-hero`, `landing-live-map`, `landing-sections`, `privacy`, `analytics`, `csp` | the 40 scenarios; zero CSP violations with analytics on; no cookie set; no request to PostHog without a key; the API down → the page still answers `200` |
| 11 | Performance | Lighthouse on staging | LCP ≤ 2.5 s and CLS ≤ 0.1 on a mobile profile for `/` (budget owned by WP-70) |

## Acceptance checklist

Run in ru, uz and en, at 1 366 × 860 and 390 × 844, on staging and on production; screenshots in the PR.

- [ ] `/`, `/uz/`, `/en/` open the landing in their language; `/uz` redirects to `/uz/`; an unknown path shows the
      HTML 404 in the language of its prefix.
- [ ] A browser set to Uzbek lands on `/uz/`; `/?lang=en` lands on `/en/`; a stored choice wins over the browser.
- [ ] The language menu and the footer buttons switch the language by navigation; afterwards every image and link
      on the page works.
- [ ] Header: logo, language button with code, menu with three languages, closes on Escape and outside click.
- [ ] Hero: the posts gather into one card; heading, slogan, lead, the CTA and caption are in the page's language.
- [ ] The phone shows the Mini App replica; the three steps follow the scene; the finger hint stops on touch.
- [ ] v1 on a mouse device, v2 on a touch device, the simple version on a weak device, the static layout under
      reduced motion — each behaves as the table says and is chosen without a flash.
- [ ] The lock phase shows up to four pushes built from live data; scrolling back removes them.
- [ ] The live map shows price pins; the filters change the pin set and the footer number; «Продажа» loads the sale
      pins; a pin card opens the listing in HOMI's Mini App.
- [ ] «Узнавайте первым» shows the lock-screen phone with Tashkent time and dripping pushes, and the counter by the
      100 rule.
- [ ] The owner and agent switch changes the three cards and the lead.
- [ ] The savings block computes the yearly saving for the chosen rooms and district; the weekly line appears only
      with at least 100.
- [ ] The FAQ has eight questions, the first open.
- [ ] The final block shows the counter line, the heading, the CTA and, on desktop, the QR; the QR opens HOMI's bot.
- [ ] The floating QR appears on wide screens after the first scene, morphs into the final block, and stays closed
      after «Скрыть QR-код».
- [ ] The dock appears and hides as the rules say.
- [ ] Every bot button opens HOMI's bot with `s_web`, the tag of `?s=` and the visit id; the bot answers with its
      welcome (WP-52).
- [ ] The footer shows HOMI's copyright, the language buttons, support, privacy and the OpenStreetMap credit.
- [ ] The privacy page exists in three languages, names HOMI, and its language buttons navigate.
- [ ] No page contains a brand word, handle or host of the legacy product.
- [ ] Locally, with the landing features on `stub`, the demo marker is visible next to the live blocks; on staging
      and production (`legacy`) it is not.
- [ ] With the API stopped on staging the landing still loads, without live numbers or with the fallback.
- [ ] Head: title, description, canonical, `hreflang`, Open Graph image per language; the manifest and icons load.
- [ ] No cookie is set; no CSP violation appears in the console; PostHog receives the page view with `site`,
      `visit`, `env` in HOMI's project.
- [ ] Staging is `noindex`; production serves `robots.txt` and the sitemap of six pages.
- [ ] The 40 scenario cases, the unit and component tests and `make ci-frontend` are green.

## Handoff

Empty — nobody has started this package.
