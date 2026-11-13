# 03b — Legacy landing and SEO pages audit: kvadro.app

This document audits the public web surface of kvadro² on `kvadro.app`:

- the landing (`/`, `/uz/`, `/en/`, `/privacy.html`);
- the 1 008 server-rendered SEO pages (`/arenda/…`, `/prodazha/…`, `/novostrojki/…` and their `/uz/`, `/en/` variants);
- every public URL and deep link that this surface emits or that already circulates outside the system.

It owns the IDs `LND-NNN`, `URL-NNN`, `BR-LND-NNN`, `BR-SEO-NNN`, `LB-LND-NNN`, `LB-SEO-NNN`, `Q-LND-NNN` and
`Q-SEO-NNN` ([`README.md`](README.md)). Mini App API endpoints and non-API resources belong to
[`08-api-inventory.md`](08-api-inventory.md) and are named here by `METHOD path`. Mini App screens
([`03`](03-legacy-frontend-audit.md)), the Telegram WebApp integration ([`05`](05-telegram-miniapp-audit.md)) and the
bot (`04`) are referred to by name.

**Status rules used here.**

- **Landing.** `$KVADRO_ROOT/demo/landing/site/` holds the production files 1:1, so what is visible there is
  `CONFIRMED`. Browser effects derived by reading unambiguous code are also `CONFIRMED` and say "derived". Server-side
  generation (`/uz/`, `/en/`, data files, `stats.js` templating) is `DOCUMENTED_ONLY`.
- **SEO pages.** They are rendered by the unavailable backend and known only from `$KVADRO_ROOT/docs/seo-pages.md`
  (a production observation of 25 pages plus the sitemap). They are `DOCUMENTED_ONLY`. Every 🔶 item there is
  `UNVERIFIED` and paired with a `Q-…`.
- **Nothing was run** against production or in the legacy tree, so nothing is `RUNTIME_VERIFIED`. One static asset,
  the QR code (`img/qr-bot.svg`), was decoded by parsing its SVG with a script in a scratch directory outside both
  repositories.

**Migration policy** (README): legacy bugs and logically wrong decisions are fixed, not reproduced. Every `LB-…` item
has a "Proposed fix:" line and a "URL/SEO impact:" line. Public URLs and deep links keep working.

**Numbering.** `LND-001`–`LND-039` cover the landing and `LND-040`–`LND-064` cover the SEO pages. `URL-NNN` is
sequential.

**Evidence shorthands.**

| Short | Path |
| ----- | ---- |
| `IDX:n` | `$KVADRO_ROOT/demo/landing/site/index.html:n` |
| `UZ:n`, `EN:n` | `$KVADRO_ROOT/demo/landing/site/uz/index.html:n`, `…/en/index.html:n` |
| `PRV:n` | `$KVADRO_ROOT/demo/landing/site/privacy.html:n` |
| `LJS:n` | `$KVADRO_ROOT/demo/landing/site/landing.js:n` |
| `STJ:n` | `$KVADRO_ROOT/demo/landing/site/stats.js:n` |
| `LI18N` / `MI18N` | `$KVADRO_ROOT/demo/landing/site/landing-i18n.js` / `…/miniapp-i18n.js` (key named) |
| `CSS:n` | `$KVADRO_ROOT/demo/landing/site/landing.css:n` |
| `REC:n` | `$KVADRO_ROOT/demo/landing/docs/RECOVERY.md:n` |
| `FIX/<file>` | `$KVADRO_ROOT/demo/landing/tools/parity/fixtures/data/<file>` (prod data snapshot of 2026-11-08) |
| `SCN:n` | `$KVADRO_ROOT/demo/landing/tools/parity/scenarios.mjs:n` |
| `SRV:n` | `$KVADRO_ROOT/demo/landing/tools/lib/server.mjs:n` (local server that mirrors the prod routes) |
| `REL` | `$KVADRO_ROOT/demo/landing/tools/sync/release.json` (prod fingerprint: CSP header, stamps, out-links) |
| `SEO:n` | `$KVADRO_ROOT/docs/seo-pages.md:n` |
| `ABT:n` | `$KVADRO_ROOT/docs/about.md:n` |
| `BOT:n` | `$KVADRO_ROOT/docs/telegram-bot.md:n` |
| `SP:n` | `$KVADRO_ROOT/demo/app/src/lib/telegram/startParam.js:n` |

## 0. Findings that matter most for the migration

1. **The public URL contract is large and partly outside our control.** The surface has:
   - 1 008 SEO URLs in three languages, four landing URLs, two CSV exports, the sitemap and robots;
   - bot links (`?start=s_web…`, `?start=s_seo…`) and Mini App links (`?startapp=l_<id>-web`,
     `-seo-<channel>-<post>`, `-fb12`…) that sit in search caches, chats, ads and printed QR codes.

   If the domain changes (Q-SYS-006), every `kvadro.app` path needs a path-for-path `301`. `t.me/KvadroAppBot` links
   cannot be redirected, so the bot username and the payload grammar must survive. See §6 (URL-001 – URL-062).
2. **The SEO pages exist only as a description.** The renderer, `area.css`, the SVG charts and the uz/en texts of most
   page types are not in our material: 25 of 1 008 pages were sampled, and uz/en only on 4 pages.
   - **Before cut-over:** crawl and archive every sitemap URL, both CSVs and the assets. That archive is the parity
     baseline (Q-SEO-001).
   - **Unknown thresholds:** several calculations have thresholds that are known only approximately (noindex cut-off,
     `lastmod`, index history) (BR-SEO-011 – BR-SEO-021, Q-SEO-002/003/013).
3. **Language handling on the landing is broken in two ways.**
   - **Broken links after a switch.** Switching the language on `/` rewrites the address with `history.replaceState`
     while all URLs are relative. Images, data files, the logo link, the privacy link and the 24 footer SEO links then
     resolve under `/en/` or `/uz/` and return 404 (LB-LND-001).
   - **Wrong language on the canonical URL.** `/` is translated client-side to the browser or stored language while
     canonical and hreflang still say `ru` (LB-LND-002).

   **Fix:** server-rendered locales and real navigation. `?lang=` stays as a redirect.
4. **Live production data breaks a landing block.** The prod `pins-rent.json` now mixes 36 district medians with
   2 033 point medians (`pt:<lat>:<lng>[:near]`). The savings block renders every entry as a "district" button, so
   raw codes appear in the row (LB-LND-004). The landing data contract needs to be redesigned rather than copied
   (LB-LND-005, LB-LND-006).
5. **Attribution is leakier than it looks.**
   - The desktop QR code encodes a bare `https://t.me/KvadroAppBot` (decoded). It carries no `s_web` tag and no
     visit id.
   - Mini App links from the landing carry `-web` only: no `?s=` tag and no visit id.
   - `stats.js` cuts payloads to 49 characters.
   - All metro pages share the tag `s_seo_metro`.
   - How the bot handles `s_seo_*` payloads is undocumented.

   See LB-LND-007, LB-SEO-011, Q-LND-004, Q-SEO-012.
6. **CSP is pinned to inline-script sha256 hashes.** The same header serves the landing, privacy and SEO pages. A
   Next.js port needs nonces or build-time hashes, plus a decision on `/api/csp-report` (LB-LND-009).
7. **Some index history may not be recomputable.** The rent index promises that past months never change, and the
   sale-price history is published as CSV and may be cited. A new backend that recomputes from migrated data may not
   reproduce them. Archive the CSVs and migrate the series (Q-SEO-013).
8. **Search Console context.** An HTML comment of 2026-11-05 records that of about 450 site pages, 94 were indexed and
   349 were "обнаружена, не проиндексирована" (`IDX:379-380`). The SEO equity at stake is real but modest, and the
   thin-page policy deserves a review (LB-SEO-012).

## 1. Landing

### 1.1 Delivery and file map

All 35 files under `site/` are prod files byte for byte, except `privacy.html`, whose Cloudflare email rewrite was
removed (`REC:89-95`). There is no build step and no source map (`REC:9-12`).

| File | Size / lines | Role | Produced by | Status |
| ---- | ------------ | ---- | ----------- | ------ |
| `index.html` | 75 KB / 434 | ru landing markup, head, inline v1/v2 script, JSON-LD | hand-written | CONFIRMED |
| `uz/index.html`, `en/index.html` | 72 KB / 435 each | same page translated; own `<head>`; `<base href="../">`; footer slugs rewritten | backend `app/api/landing_pages.py` from `index.html` + `landing-i18n.js` (+ Mini App texts) | output CONFIRMED / generator DOCUMENTED_ONLY |
| `privacy.html` | 25 KB / 180 | privacy policy, ru/uz/en in one file, own inline script | hand-written | CONFIRMED |
| `landing.js` | 145 KB / 2 482 | all page logic, ES5 IIFE, unminified | hand-written | CONFIRMED |
| `landing-i18n.js` | 23 KB / 351 | `window.LANDING_TEXTS`, 106 keys × ru/uz/en; JSON after the assignment so the server can read it | hand-written | CONFIRMED |
| `miniapp-i18n.js` | 20 KB / 573 | `window.MINIAPP_TEXTS`, 188 keys × ru/uz/en | generated by `scripts/landing_miniapp.mjs` in the unavailable `webapp` repo | CONFIRMED / generator DOCUMENTED_ONLY |
| `miniapp.css` | 74 KB / 1 167 | Mini App styles scoped to `.dev` | generated from `webapp/src/styles.css` by the same script | CONFIRMED / generator DOCUMENTED_ONLY |
| `landing.css` | 102 KB / 1 197 | landing styles, scroll timelines, v2 steps | hand-written | CONFIRMED |
| `stats.js` | 2.5 KB / 55 | PostHog loader (no cookies), visit id, bot-link tagging; key and host written in by the server | backend `app/api/site_stats.py` | CONFIRMED / templating DOCUMENTED_ONLY |
| `robots.txt`, `site.webmanifest` | — | crawler rules, manifest | static | CONFIRMED |
| Images | 9 at root + 14 in `img/` | `logo.svg`, `favicon-32.png`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`, `og-{ru,uz,en}.jpg` (1200×630), `map-tashkent.webp`; `img/`: `cluster-{2k,3,4,5}.webp`, `own-{chil,mirzo,yunus}.webp`, `ag-{chil,yakka,shay}.webp`, `unk-yash.webp`, `mirobod-2k.webp`, `mascot-shrug.svg`, `qr-bot.svg` | static | CONFIRMED |
| `data/*.json`, `img/snap/*.webp` | 3 JSON + 316 photos in the fixture | landing data snapshot (§1.5) | backend `scripts/landing_snapshot.py`, `live.json` ← `app/api/landing.py`, several times a day | shape CONFIRMED / schedule DOCUMENTED_ONLY |

Evidence: `REC:21-50`, `REC:52-77`; `$KVADRO_ROOT/demo/landing/README.md:35-41`; `REL` (`fileCount 35`, data
`fileCount 319`).

### 1.2 Pages

#### LND-001 — Landing, ru (`/`) · CONFIRMED

- **What:** a single long page about the bot, in this order:
  1. a dark first screen: Telegram posts gather into one card in a phone;
  2. the Mini App demo and the live price map;
  3. «Узнавайте первым» (lock-screen pushes);
  4. «Хозяин ◐ Риелтор»;
  5. «Сразу видно, где дешевле рынка»;
  6. FAQ;
  7. a final block with a QR code;
  8. a dark footer with SEO links.
- **Head:** `<title>` «Аренда квартир в Ташкенте — все объявления из Telegram | kvadro²», description, og/twitter,
  canonical, hreflang, JSON-LD, icons, manifest, `theme-color` (LND-033).
- **Scripts:** one inline script in `<head>` (LND-021), then `stats.js`, `miniapp-i18n.js`, `landing-i18n.js`,
  `landing.js`, all `defer` and in that order (`IDX:429-432`).
- **Without JS:** the markup carries complete ru texts and example numbers. Bot buttons point to the bare
  `https://t.me/KvadroAppBot` (`IDX:109`, `:343`, `:423`).
- **Evidence:** `IDX:1-434`; `REC:3-5`, `REC:25`.

#### LND-002 — Landing, uz and en (`/uz/`, `/en/`) · CONFIRMED (output) / DOCUMENTED_ONLY (generator)

- **What:** the same page served already translated. The backend does the following (diff of `IDX` vs `EN`/`UZ`):
  - **Head:** sets `<html lang>`, inserts `<base href="../">`, and replaces title, description and the og tags
    (`og:url` `/uz/` or `/en/`, `og:image` `og-uz.jpg` or `og-en.jpg`, `og:locale` `uz_UZ` or `en_US`). It also points
    `canonical` to the page itself.
  - **Texts:** replaces every `data-l`, `data-la`, `data-tx`, `data-t` text from `landing-i18n.js` and the Mini App
    texts.
  - **Footer slugs:** rewrites `arenda/` → `uz/ijara/` or `en/rent/`, `prodazha/` → `uz/sotuv/` or `en/sale/`,
    `novostrojki/` → `uz/novostroyka/` or `en/new-builds/`, `indeks/` → `index/` (en) and `ceny/` → `narxlar/` (uz)
    or `prices/` (en).
  - **Kept as in ru:** the hreflang set and the JSON-LD.
- **Titles:**
  - uz: «Toshkentda ijaraga kvartira (arenda) — Telegramdagi barcha eʼlonlar | kvadro²»;
  - en: «Apartments for rent in Tashkent — every Telegram listing | kvadro²» (`LI18N meta.title`).
- **Client side:** `landing.js` leaves server-translated text alone when the document language already matches
  (`LJS:2370-2378`).
- **Evidence:** `UZ:1-30`, `EN:1-30`, `EN:370-408`; `REC:26`, `REC:54-55`; `ABT:328-333`. The generator
  `app/api/landing_pages.py` is known only by name.

#### LND-003 — Privacy policy (`/privacy.html`) · CONFIRMED

- **What:** one HTML document with three `<article data-doc="ru|uz|en">` blocks. A single version is shown.
  - **Title:** «Конфиденциальность — kvadro²» / «Maxfiylik — kvadro²» / «Privacy — kvadro²».
  - **Date:** «Обновлено 5 ноября 2026».
  - **Sections:** «Сайт kvadro.app», «Бот и приложение kvadro² в Telegram», «Как удалить свои данные», «Авторам
    объявлений», «Вопросы»; then «← На главную».
  - **Head:** `<meta name="theme-color" content="#ffffff">`, `landing.css` plus an inline `<style>`. There is no
    canonical, hreflang, og or JSON-LD.
- **Language selection:** an inline script (`PRV:150-177`) picks the language in this order:
  1. `?lang=`;
  2. `localStorage kv-landing-lang`;
  3. browser languages, by the same rule as the landing (BR-LND-020).

  It then sets `html lang` and `document.title`, unhides the matching article, and for uz/en rewrites the home links
  to `./?lang=<lang>`.
- **Promises the product must keep or rewrite:**
  - **Site analytics:** no cookies; PostHog EU; a visit number travels into the bot.
  - **Bot data:** an action log kept for 180 days; `/owner` keeps only a phone hash.
  - **Anti-fraud and waitlist:** anti-fraud signals; a waitlist record.
  - **Gemini:** queries and listing texts are processed, with phones and `@nicks` hidden first.
  - **Support:** message ↔ user mapping kept for 90 days.
  - **Geolocation:** never sent to the server.
  - **Deletion:** via `/privacy` → «Удалить мои данные»; backups expire in about two weeks.
  - **Listing authors:** photo copies kept for up to 30 days; withdrawn listings kept for 90 days, then text, phone and
    photo erased; takedowns via `@KvadroSupportBot` or the project mailbox.
- **Analytics:** `stats.js` (`PRV:178`).
- **Evidence:** `PRV:1-180`; `ABT:264-275`.

### 1.3 Blocks, in page order

#### LND-004 — Header: logo and language menu · CONFIRMED

- **Logo:** `a.brand` with `logo.svg` and «kvadro²», `href="./"`. After a language switch it becomes `uz/` or `en/`
  (`LJS:2433`).
- **Language menu:**
  - **Button:** `#lang-btn` shows a globe icon and the code (`RU`); `aria-label` «RU — Язык: Русский».
  - **Menu:** `#lang-menu` (`role=menu`) holds three `menuitemradio` buttons with `data-lang` ru/uz/en, labelled
    «Русский», «Oʻzbekcha», «English».
  - **Closing:** an outside click or Escape closes it, and Escape returns focus to the button (`LJS:2456-2476`).
- **Theme:** `body.hero-dark` makes the first screen dark (the comment cites an owner decision of 13.10).
- **Evidence:** `IDX:50-63`.

#### LND-005 — First scene: posts become one card (hero) · CONFIRMED

- **Markup:** `section.story` («Посты из каналов собираются в одну карточку в Mini App») with a timeline proxy
  `.tl-proxy.tl-cloud` and `.stage` split into three layers.
- **`s-posts` layer:** seven example posts (`article.post p1…p7`). Four have photos (`img/cluster-*.webp`). Their texts
  mix ru and uz, for example «🔥 СРОЧНО! 2-х комн, Чиланзар · 600$», «2xona 55kv 1/4 Chilonzor ‼️ 600$ ‼️». These demo
  texts are the same in every language.
- **`s-back` layer:**
  - **`h1`:** «Аренда квартир в Ташкенте». Per the comment, the H1 is the search query (owner decision of 18.10).
  - **Slogan:** `p.hero-title` «Вся аренда из Telegram. В одной ленте.».
  - **Lead:** «Без повторов, рекламы и хаоса.».
  - **CTA:** «Открыть в Telegram» (`data-bot-link`).
  - **Caption:** «Семь постов — одна карточка».
- **`s-front` layer:** the phone and the steps (LND-006, LND-007).
- **Evidence:** `IDX:65-116`.

#### LND-006 — Phone with the Mini App demo · CONFIRMED

- **Wrapper:** `.phone` (`role=img`, «Mini App kvadro² в Telegram: лента квартир, фильтры и карта с ценами») wraps
  `.dev.fullscreen` and `#m-app`. It is a static HTML replica of the Mini App UI:
  - **Top:** a mini top bar («Аренда · Ташкент»), title tabs «Аренда» / «Продажа» (`data-deal` `rent_long`/`sale`) and
    header chips (rooms, price, «Без риелторов»).
  - **Feed:** `#m-feed`. Its first card is the apartment from the post cloud: 2 rooms, $550, Chilonzor.
  - **Screens:** favourites («Избранное» / «Смотрел»), radar («Радар», one subscription tile and a bot button),
    settings (appearance, theme, region, time zone; display only) and a tab bar «Поиск · Избранное · Радар ·
    Настройки».
  - **Filter sheet:**
    - city, rent term, housing type, rooms, districts, «центр» / «рядом», «Рядом с метро», tenants («семья», «мужчины»,
      «женщины»), owner, below-median;
    - price presets $300, 400, 500, 600, 800, 1 000, 1 500 (rent) and $40 000 – 200 000 (sale);
    - footer «📡 Радар: ≈N в день» and «Показать N».
  - **Map:** a static raster `map-tashkent.webp` (1 800 × 1 125 points), a pin layer, a selected-listing card, a
    «Где я» button and «© OpenStreetMap».
  - **Chrome:** a lock-screen wall, an iOS status bar and Telegram header buttons.
- **Styles and texts:** `miniapp.css` (generated); texts come from `miniapp-i18n.js` through `data-t` / `data-tp`.
  Every control has `tabindex="-1"` and is inert until live mode (LND-008).
- **Evidence:** `IDX:137-175`; `REC:31`, `REC:45`; `LJS:537-575`.

#### LND-007 — «Как приложение. Прямо в Telegram.» steps · CONFIRMED

- **Steps:** `ol.app-steps` with three entries:
  - «Лента» — «Все объявления в одном месте, свежие сверху.»;
  - «Фильтры» — «Район, цена, комнаты, без риелторов.»;
  - «Карта» — «Цены на карте — видно, что сдаётся рядом.»
- **Narrow screens:** a segmented progress bar `.st-bar` («Лента · Фильтры · Карта») under the phone. It is
  `aria-hidden`; the list stays available to screen readers.
- **Evidence:** `IDX:119-127`, `IDX:177-180`.

#### LND-008 — Live price map in the phone · CONFIRMED

- **Activation:** at the end of scene 1 the phone grows and becomes interactive (`.dev.m-interactive`, `.stage.live`).
  - v1 switches on at scene progress > 0.9256 and off at ≤ 0.9008.
  - v2 switches on after the scripted steps or straight away in the simple version (BR-LND-010, BR-LND-019).
- **Content:**
  - **Pins:** prices from `data/pins-rent.json`, or `pins-sale.json` after «Продажа», which is preloaded on entry.
    Pins are decluttered and the selected one is drawn first.
  - **Card:** a tap shows the listing card. A tap on the card, a feed card or a push opens the listing in the Mini App.
  - **Map drag:** a mouse drags in any direction, a finger only sideways. A drag longer than 4 px cancels the click.
  - **Filters:** chips and the filter sheet work for rooms, price, districts and owner. Sale, zones, metro, housing,
    term and tenants are display-only (BR-LND-011).
  - **Feed and tabs:** «Карта / Список», a feed built from the pins, favourites and history kept in memory only, and
    the radar tile (BR-LND-016).
- **Links:**
  - **Listing:** `p.link` = `https://t.me/KvadroAppBot?startapp=l_<id>-web`, opened with
    `window.open(…, "_blank", "noopener")`.
  - **Fallback:** the bot link with the `s_web` tag (BR-LND-017).
- **Evidence:** `LJS:537-1350`, `LJS:1834-1918`; `FIX/pins-rent.json`.

#### LND-009 — Interaction hints: demo finger and tap cursor · CONFIRMED

- **Live map:** a finger (`demoStart`) runs a cycle of about 5 s. It taps a price near the map centre, which changes
  the card, then drags the map. It stops for good after any user touch or when live mode ends.
- **v2 show:** a single «кружок» cursor glides between buttons during the scripted feed → filters → map steps and
  presses them slightly early. It fades before live mode.
- **Evidence:** `LJS:752-800`, `LJS:1430-1530`.

#### LND-010 — «Попробуйте сами» hint and «Листайте дальше» cue · CONFIRMED

- **Hint:** `.live-hint`. The long text is «Это живая карта: цены — из свежих объявлений. Нажмите на любую или потяните
  карту.», the short one «Нажмите на цену или потяните карту», and there is an arrow.
- **Cue:** `#scroll-cue` «Листайте дальше». A tap scrolls to the lock-screen phase (LND-011), or past the scene when
  that phase is absent. This matters on phones, where a finger on the map drags the map instead of the page.
- **Evidence:** `IDX:181-189`; `LJS:2177-2192`.

#### LND-011 — Lock-screen phase at the end of scene 1 (v1 only) · CONFIRMED

- **When:** only if v1 is active, `timeline-scope` and `animation-timeline: view()` are supported, and reduced motion
  is off (`LOCK_SCENE`, `LJS:2152`). Scene 1 is then 9 200 px tall (`CSS:1006-1011`).
- **Sequence:** after 250 px of dwell on the live map (`LOCK_DWELL`), the phone moves right and dims to a lock screen.
  Up to 4 pushes about the latest real rentals (`data/live.json`) arrive with scrolling: the first at 12 % of the
  phase, then every 17 %. They leave again when scrolling back.
- **Left column:** «Узнавайте первым», the lead «Больше не нужно листать каналы: подходящие квартиры сами придут в
  Telegram, как только появятся.» and the counter (BR-LND-007).
- **Evidence:** `LJS:2145-2211`; `IDX:128-136`, `IDX:164-169`.

#### LND-012 — «Узнавайте первым» section (`#live`) · CONFIRMED

- **What:** a standalone grey block with the same heading and lead, a lock-screen phone (390 × 844 points, scaled) and
  the counter `#live-count`.
  - **When shown:** CSS hides it where the lock phase of LND-011 runs, so it serves v2, reduced motion and browsers
    without scroll timelines (`CSS:1010`).
  - **v2:** the phone is bigger and cropped from the top (`lcrop`). The dark scene above slides away with a parallax
    of up to 260 px (`LJS:1810-1830`).
- **Behaviour:**
  - **Clock and date:** set to `Asia/Tashkent`.
  - **Pushes:** they drip one per second while the block is at least 35 % visible.
  - **Ages:** relative to the snapshot time and refreshed every 30 s.
  - **Without JS:** one example push stays: «kvadro² · только что · 2-комн. квартира · Мирабад · $600/мес · −23% к
    рынку» (BR-LND-014).
- **Evidence:** `IDX:194-231`; `LJS:1939-2140`.

#### LND-013 — «Хозяин ◐ Риелтор» switch · CONFIRMED

- **Switch:** the heading itself is the switch: «Хозяин» [toggle] «Риелтор» (`#or2`, `role=switch`). Visually hidden
  `h2` «Хозяин или риелтор?».
- **Owner side:** three cards (Chilonzor $650, Mirzo-Ulugbek $550, Yunusobod $850) with the badge «Хозяин» and
  evidence lines «В тексте: «сдаёт хозяин»» or «В тексте: #хозяева».
- **Agent side:** three cards (Chilonzor $550, Yakkasaroy $750, Shayxontohur $700) with evidence lines:
  - «Номер — ещё в 12 объявлениях. По тексту не угадать»;
  - «В тексте: «комиссия 50%»»;
  - «Номер уже был в объявлениях риелтора».
- **Leads:**
  - owner: «Хозяин сам пишет об этом в объявлении. Под каждой квартирой — почему мы так решили.»;
  - agent: «Риелтора выдаёт комиссия в тексте или номер, который стоит во многих объявлениях. Скройте их в одно
    касание.»
- **Animation:** the sets slide in the direction of the switch (200 ms out, 380 ms in), with none under reduced motion.
  On phones each set scrolls sideways.
- **Data:** static cards and photos (`img/own-*.webp`, `img/ag-*.webp`). Card parameters are re-rendered per language
  from `data-params` (`2,60,1,7` → «2‑комн. · 60 м² · 1/7 эт.»).
- **Evidence:** `IDX:234-291`; `LJS:78-125`, `LJS:2396-2400`.

#### LND-014 — «Сразу видно, где дешевле рынка» savings block · CONFIRMED

- **Content:**
  - lead «Снять квартиру на 20% дешевле обычной цены — это»;
  - the big number «$1 440» with «экономии за год»;
  - the explanation «{kind} в районе {district} обычно стоит {median} в месяц. Каждую квартиру мы сравниваем с
    похожими рядом и в районе и отмечаем те, что заметно дешевле, — например, за {cheap}.»;
  - room buttons «1 комн. · 2 комн. · 3 комн.»;
  - a horizontally scrolling row of district buttons;
  - a weekly line «N квартир на 20% и больше дешевле обычной цены нашли за неделю в Ташкенте».
- **Data:** `medians` and `bargains_week` of `data/pins-rent.json`. Until the data arrives, hard-coded fallback
  medians are used (BR-LND-008, BR-LND-009).
- **Bug:** current prod data makes it render point medians as districts (LB-LND-004).
- **Evidence:** `IDX:294-311`; `LJS:2241-2318`; `LI18N pc.*`.

#### LND-015 — FAQ «Вопросы» · CONFIRMED

- **Layout:** eight `<details>` in two columns of independent height; the first is open.
- **Questions:**
  1. «Сколько это стоит?»
  2. «Как получать новые квартиры сразу?» (it mentions «Включить радар» and free-text requests like «двушка на
     Чиланзаре до 600$»)
  3. «Откуда объявления?»
  4. «Как вы убираете повторы?»
  5. «А продажа есть?»
  6. «А если квартиру уже сдали?» («Уже сдано»)
  7. «Нужно что-то устанавливать?»
  8. «Вы видите мои данные?» (`/privacy` in the bot)
- **No `FAQPage` JSON-LD.**
- **Evidence:** `IDX:314-331`; `LI18N faq.*`.

#### LND-016 — Final block · CONFIRMED

- **Left column:**
  - the line «Бесплатно · N новых квартир за сутки» (or «за неделю»; the count part stays hidden when the numbers are
    small, BR-LND-007);
  - `h2` «Найдите квартиру сегодня»;
  - the CTA «Открыть в Telegram».
- **Right column (desktop):** a QR code `img/qr-bot.svg` with «Откройте на телефоне». The QR is version 2, 25 × 25,
  error correction M, byte mode. **Decoded content: `https://t.me/KvadroAppBot`**: no `start` payload
  (LB-LND-007).
- **Phone:** no QR, button only.
- **Evidence:** `IDX:334-353`; `LJS:2212-2240`; decode of `$KVADRO_ROOT/demo/landing/site/img/qr-bot.svg`.

#### LND-017 — Footer row · CONFIRMED

- **Row:**
  - «© 2026 kvadro²»;
  - language buttons «Русский · Oʻzbekcha · English» (`aria-pressed`; same handler as the menu);
  - links «Поддержка» (`https://t.me/KvadroSupportBot`), «Instagram» (`https://www.instagram.com/kvadro.app/`),
    «Конфиденциальность» (`privacy.html`, becomes `privacy.html?lang=<uz|en>` after a switch);
  - «Карта: © OpenStreetMap» linking to `openstreetmap.org/copyright`.
- **Wordmark:** a large «kvadro²» at the bottom (`aria-hidden`).
- **Evidence:** `IDX:356-366` (OpenStreetMap link `IDX:365`), `IDX:409`; `LJS:2432`.

#### LND-018 — Footer SEO link blocks · CONFIRMED

- **What:** four `<nav>` blocks with 24 links per language into the SEO pages. They are crawl paths: per the comment of
  2026-11-05, Google reaches the district pages through them.
- **Links:**

  | Nav | ru links | uz / en prefix |
  | --- | -------- | -------------- |
  | «Аренда квартир» | `arenda/{tashkent,tashkent-region,andijan,namangan,kokand,fergana}/`, `arenda/` («Все города и районы») | `uz/ijara/…`, `en/rent/…` |
  | «Районы Ташкента» | `arenda/tashkent/{yunusobod,chilonzor,mirzo-ulugbek,yakkasaroy,mirobod,yashnobod,shayxontohur,olmazor,sergeli,uchtepa,yangihayot,bektemir}/` | same |
  | «Продажа квартир» | `prodazha/tashkent/`, `novostrojki/tashkent/` («Новостройки Ташкента»), `prodazha/` | `uz/sotuv/…`, `uz/novostroyka/…`; `en/sale/…`, `en/new-builds/…` |
  | «Цены» | `arenda/indeks/` («Индекс аренды Ташкента»), `prodazha/ceny/` («Цены на квартиры в Ташкенте») | `uz/ijara/indeks/`, `uz/sotuv/narxlar/`; `en/rent/index/`, `en/sale/prices/` |

- **Relative links:** the hrefs are relative. On `/uz/` and `/en/` they resolve through `<base href="../">`. On `/`
  after a client-side language switch they break (LB-LND-001).
- **Counts in the prod fingerprint:** `arenda` 20, `prodazha` 3, `novostrojki` 1, `uz` 24, `en` 24 (`REL outLinks`).
- **Evidence:** `IDX:367-408`; `UZ` and `EN` footers.

#### LND-019 — Floating QR (desktop) · CONFIRMED

- **What:** `aside.qr-float`, a small grey card in the corner with the same QR and «На телефоне», plus a close button
  «Скрыть QR-код».
- **When:** only on wide pointer devices (`min-width: 1200px`, hover, fine pointer) and after the first scene.
- **Morph:** when the final block is more than half visible, the card expands into the final block's QR panel. Text
  fades in after it, and the card collapses back when the block leaves. It is computed per frame, with a timer
  fallback for background tabs. Closing hides it for the rest of the page view.
- **Evidence:** `IDX:412-420`; `LJS:245-330`.

#### LND-020 — Dock (sticky bottom CTA) · CONFIRMED

- **What:** `#dock`, a bottom «Открыть в Telegram» button.
- **When:** it appears once the first-screen button has faded out. It is hidden:
  - while the phone fills the screen (it would cover the phone's own controls);
  - on the «Как приложение» step;
  - when the final block (its own CTA or QR) is visible.
- **v2:** shown only after the first-screen button has scrolled away and nothing of the phone is underneath.
- **Height:** measured from the real button height, because of iOS toolbar behaviour.
- **Evidence:** `IDX:421-427`; `LJS:193-245`.

### 1.4 Behaviours

#### LND-021 — Display versions v1 / v2 · CONFIRMED

- **Choice:** an inline `<head>` script adds `html.v2` when `?v=2`, or when `?v=1` is absent and
  `(pointer: coarse)` matches. The choice is made before first paint.
  - **v1** (mouse): the scene is driven by scrolling.
  - **v2** (touch): the scenes play by time.
- **CSP:** the script is allowed by its sha256 (LND-034).
- **Evidence:** `IDX:39-46`; `ABT:510-512`.

#### LND-022 — v1 scroll-driven scene and smoothing · CONFIRMED

- **Animations:** the CSS uses `animation-timeline: view()` and a named timeline `--cloud` on an invisible copy of the
  section (`.tl-proxy`).
- **Smoothing:** JS smooths progress with inertia and a speed cap by shifting the proxy (`smoothTick`). Smoothing is
  on only with a mouse, without v2, when timelines are supported and reduced motion is off. `?motion=raw` disables
  it.
- **Phone chrome:** the phone's own top and bottom bars collapse in the 42–58 % range, imitating Mini App
  `useMiniChrome`. On touch devices they slide away instead.
- **Map preload:** the map image is warmed up 600 ms after `load`.
- **Evidence:** `LJS:126-536`; `CSS` (`animation-timeline: --cloud` used 27 times).

#### LND-023 — v2 time-driven show and simple version · CONFIRMED

- **Sequence:** when the phone top passes 60 % of the viewport, the posts fly to the phone, gather into the first
  card's photo and fade. The phone grows (about 2.6 s in total). Then the steps feed → filters → map play, and the map
  goes live.
  - **Scroll hold:** the page is held while the posts fly, with a 5 s safety limit.
  - **Once only:** the posts never fly back (owner decisions of 17.10).
- **Simple version:** used for reduced motion, a weak Android (≤ 4 cores or ≤ 2 GB), `innerHeight` < 500, missing
  Web Animations / IntersectionObserver, or a janky intro below about 30 fps. It skips the intro and the steps and
  shows the live map straight away. Override with `?anim=on|off` (BR-LND-019).
- **Phone movement:** sizes change through FLIP transforms (`morphPhoneV2`).
- **Evidence:** `LJS:1351-1938`.

#### LND-024 — Static layout (reduced motion / no scroll timelines) · CONFIRMED

- **What:** with `prefers-reduced-motion: reduce`, or when `animation-timeline: view()` is unsupported, the scene is
  laid out statically. The «Узнавайте первым» block (LND-012) takes over the lock phase, and all `animate()` calls are
  skipped.
- **Parity:** the parity suite has six «static» scenarios for this layout.
- **Evidence:** `CSS` (13 `prefers-reduced-motion: reduce` blocks, 3 `@supports not (animation-timeline: view())`);
  `SCN:4-8`.

#### LND-025 — Responsive behaviour · CONFIRMED

- **Width breakpoints:** 380 px (small phones), 760 px (phone / desktop switch; 13 blocks), 900 px (final layout with
  QR; mouse), 1 100 px, 1 200 px (floating QR, hover + fine pointer), 1 280 px (`max-width: 1279px` layout).
- **Height breakpoints:** 480, 640, 680, 700, 740, 760, 800, 820 and 860 px.
- **Units:** `svh` and `lvh` where supported.
- **Phone scale:**
  - Narrow screens: computed from real heights (`--ps-m` within 0.36–0.72; landscape 0.3–0.58).
  - Mobile Chrome: the stage is centred in `visualViewport`, with settle and confirm timers against toolbar jitter.
- **Touch:**
  - lighter graphics (no glass blur) on touch in v1 and on weak Android in v2;
  - `?touch=1` and `?glass=off` force these for testing.
- **Evidence:** `CSS` media queries; `LJS:364-383`, `LJS:460-530`, `LJS:1300-1350`.

#### LND-026 — Browser theme colour · CONFIRMED

- **What:** `meta[name=theme-color]` is `#0e0e10` while the dark first scene is under the browser toolbar and
  `#ffffff` afterwards.
- **Evidence:** `IDX:37-38`; `LJS:240`.

#### LND-027 — Language selection and switching · CONFIRMED

- **On load:** `pickLang` resolves the language and `applyLang` applies it without changing the URL (BR-LND-004).
- **On a menu or footer choice:** `chooseLang` (BR-LND-005):
  1. applies the texts;
  2. rewrites the address to `/`, `/uz/` or `/en/` with `history.replaceState`, keeping other query parameters and the
     hash and dropping `lang`;
  3. stores the choice in `localStorage kv-landing-lang`.
- **Side effects:**
  - the privacy link becomes `privacy.html?lang=<lang>` and the logo link `<lang>/`;
  - the language button code and the `aria-checked` / `aria-pressed` states update.
- **Defects:** LB-LND-001, LB-LND-002.
- **Evidence:** `LJS:2321-2477`; parity scenarios `browser-uz`, `browser-en`, `browser-kk`, `query-lang-en`,
  `stored-lang-uz`, `menu-lang-uz`, `menu-lang-en-from-uz` (`SCN:104-114`).

#### LND-028 — Client-side texts, plurals and numbers · CONFIRMED

- **Text attributes:**
  - `data-l` → `innerHTML` from `LANDING_TEXTS`, which may contain `<br>`, `<b>` and `&nbsp;`;
  - `data-la="attr:key;…"` → attributes;
  - `data-tx` / `data-t` / `data-tp` → `textContent` or `placeholder` from `MINIAPP_TEXTS`;
  - `data-params` → card parameters.
- **Data safety:** data is inserted only as text or attributes, never through `innerHTML` (`LJS:1-2`).
- **Fallback:** a missing landing key falls back to ru.
- **Plurals and numbers:** see BR-LND-006.
- **Text sets:** 106 landing keys and 188 Mini App keys, complete in all three languages (no missing keys).
- **Evidence:** `LJS:6-24`, `LJS:46-56`, `LJS:2356-2400`; `LI18N`; `MI18N`.

#### LND-029 — Server-side localisation of `/uz/` and `/en/` · CONFIRMED (output) / DOCUMENTED_ONLY (mechanism)

- **What:** see LND-002. The server reads `landing-i18n.js` as JSON, which is why it must stay without comments or
  trailing commas.
- **Quirk:** the Mini App place names in English are Uzbek-Latin («Rent · Toshkent», «Mirobod»), while landing texts
  use English exonyms («Tashkent», «Mirabad») (LB-LND-011).
- **Evidence:** `$KVADRO_ROOT/demo/landing/site/landing-i18n.js:1-7`; `REC:29`; `MI18N mini`, `city`.

#### LND-030 — Links into the bot with source tag and visit id · CONFIRMED

- **Landing buttons:** every `[data-bot-link]` anchor gets `?start=s_web[_<tag>][--v<visit>]` (BR-LND-001). There are
  four of them: hero, final, dock, and the radar «+» inside the phone.
- **SEO and other bot links:** `stats.js` tags other bot links that carry `s_…` payloads at click time (BR-LND-003).
- **Listing links:** Mini App deep links inside the demo come from the data (`startapp=l_<id>-web`) and are not
  tagged.
- **QR code:** carries no tag (LND-016).
- **Evidence:** `LJS:26-44`; `STJ:15-24`; `ABT:254-262`; `BOT:997-1017`; parity scenario `source-tag` (`/?s=Insta_1`).

#### LND-031 — Analytics: `stats.js` and PostHog without cookies · CONFIRMED

- **Loading:** `stats.js` is the first deferred script. It sets the visit id (BR-LND-002) and loads
  `https://eu-assets.i.posthog.com/static/<sdk version>/array.js` 1.5 s after `load`.
- **Initialisation:** `posthog.init` with the project key embedded by the server (not reproduced here) and these
  options:
  - `api_host` `https://eu.i.posthog.com`;
  - `cookieless_mode: "always"`, `person_profiles: "identified_only"`;
  - `capture_pageview` and `capture_pageleave`;
  - autocapture of `click` and `submit` without copied text;
  - `rageclick`, `enable_heatmaps`, `capture_performance: {web_vitals: true, network_timing: false}`;
  - session recording and surveys off.
- **Super-properties:** `env`, `site: "kvadro.app"`, `visit`.
- **Events:** the landing sends no custom events (no `posthog.capture` in `landing.js`). Every event comes from
  PostHog: `$pageview`, `$pageleave`, `$autocapture`, `$rageclick`, web vitals, heatmaps.
- **Errors:** errors are not posted to `/api/events`; that is Mini App behaviour only.
- **Evidence:** `STJ:1-55`; `REC:33`, `REC:64`; `PRV:42`.

#### LND-032 — Landing data snapshot loading · CONFIRMED (client) / DOCUMENTED_ONLY (producer, schedule)

- **Loader:** `getData(name)` fetches `data/<name>.json?v=202610171944` (`DATA_V`, a constant) with
  `Accept: application/json`, once per page view. On failure the cache entry is cleared so the next use retries.
- **Files and consumers:**
  - `live.json`: sheet numbers, lock screen, `#live`, final;
  - `pins-rent.json`: on entry;
  - `pins-sale.json`: preloaded on live entry or on the first «Продажа».
- **No API calls:** the page never calls the API («к API страница не обращается»).
- **Refresh:** the files and `img/snap/*` are rewritten by the backend several times a day. Observed on 2026-11-08:
  `live.json` at 02:02, `pins-*.json` at 15:00. Files carry `max-age=1800`.
- **Stale comments:** the `DATA_V` constant and its comment «зафиксированные один раз» are out of date (LB-LND-005).
  HTML comments still name `/api/landing/live` and `/api/landing/pins`; whether those endpoints exist is open (see
  `08-api-inventory.md`, `GET /api/landing/live`).
- **Contract:** §1.5.
- **Evidence:** `LJS:58-72`; `REC:60-61`, `REC:66-77`; `FIX/*.json`.

#### LND-033 — Landing head metadata and structured data · CONFIRMED

- **Tags:**
  - `<title>`, `meta description`;
  - `og:type website`, `og:site_name kvadro²`, absolute `og:url`, `og:title`, `og:description`;
  - `og:image https://kvadro.app/og-<lang>.jpg` (1200 × 630) with `og:image:alt`, `og:locale`;
  - `twitter:card summary_large_image`.
- **Canonical and hreflang:** canonical points to the page itself. hreflang `ru` → `/`, `uz` → `/uz/`, `en` → `/en/`,
  `x-default` → `/`.
- **JSON-LD `@graph`:**
  - `Organization` (`#org`): name «kvadro²», `alternateName` «KvadroApp», logo `icon-512.png`, the project mailbox,
    `sameAs` `https://t.me/KvadroAppBot`;
  - `WebSite` (`#site`): `inLanguage` ru/uz/en.
- **Icons and manifest:** `logo.svg`, `favicon-32.png`, `apple-touch-icon.png`, `site.webmanifest`.
- **Evidence:** `IDX:5-36`; `UZ:1-30`; `EN:1-30`.

#### LND-034 — CSP, inline-script hashes and `?v=` stamps · CONFIRMED

- **CSP header:** the prod header captured in `REL` is:
  - `default-src 'self'`;
  - `script-src 'self'` plus two `sha256-…` sources and `https://eu-assets.i.posthog.com`. The two hashes belong to
    the inline script of `index.html` (the same bytes in uz/en) and of `privacy.html`;
  - `style-src 'self' 'unsafe-inline'`;
  - `img-src 'self' data: blob: https:`;
  - `font-src 'self' data:`;
  - `connect-src 'self' https://eu.i.posthog.com https://eu-assets.i.posthog.com`;
  - `worker-src 'self' blob:`, `child-src 'self' blob:`;
  - `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`;
  - `report-uri /api/csp-report`.
- **Fragility:** one changed byte in an inline script blocks it. The JSON-LD block is not executed and not hashed.
- **SEO pages:** they send the same CSP (`SEO:375-377`).
- **Stamps:** `?v=` is the first 10 hex characters of the file's sha256. `stats.js?v=20261020b` is a manual stamp. Who
  stamps the files in prod is unknown (Q-LND-001).
- **Evidence:** `REL csp`, `REL pages`; `REC:56-59`; `$KVADRO_ROOT/demo/landing/README.md:38`.

#### LND-035 — `robots.txt`, manifest, icons, og images · CONFIRMED

- **`robots.txt`:**
  - `User-agent: *`, `Allow: /`;
  - `Disallow: /api/`, `/media/`, `/img/snap/`, `/*/img/snap/`. The comments explain that photos from listings
    belong to others and are not given to image search;
  - `Sitemap: https://kvadro.app/sitemap.xml`.
- **`site.webmanifest`:**
  - name «kvadro² — вся аренда из Telegram», `short_name` «kvadro²»;
  - `start_url` and `scope` `./`, `display: browser`;
  - colours `#0e0e10`;
  - icons 192 and 512.
- **Evidence:** `$KVADRO_ROOT/demo/landing/site/robots.txt:1-10`;
  `$KVADRO_ROOT/demo/landing/site/site.webmanifest`.

#### LND-036 — Files generated outside the repository · CONFIRMED (files) / DOCUMENTED_ONLY (generators)

| Artefact | Generator | Consequence for the port |
| -------- | --------- | ------------------------ |
| `miniapp.css`, `miniapp-i18n.js` | `scripts/landing_miniapp.mjs` in the `webapp` repo, from Mini App styles and texts | The demo phone must be rebuilt from the new Mini App components or styles. The generated copy must not be hand-edited. |
| `uz/index.html`, `en/index.html` | backend `app/api/landing_pages.py` | Replaced by locale routes (LB-LND-003). |
| `stats.js` | backend `app/api/site_stats.py` (key, host, SDK version, `env`, `clicks`) | Becomes app config: `NEXT_PUBLIC_*` or a server-rendered config. |
| `data/*.json`, `img/snap/*` | backend `scripts/landing_snapshot.py`, `app/api/landing.py` | Becomes an API or ISR data source (§1.5). |
| `sitemap.xml`, SEO pages, CSV | backend `app/api/area_pages.py` | Moves to the landing app and the backend (§2). |

Evidence: `REC:26-34`; `$KVADRO_ROOT/demo/landing/README.md:38-40`; `$KVADRO_ROOT/demo/landing/site/miniapp-i18n.js:1`;
`$KVADRO_ROOT/demo/landing/site/miniapp.css:1`.

#### LND-037 — Debug and benchmark query parameters · CONFIRMED

| Parameter | Effect | Evidence |
| --------- | ------ | -------- |
| `?v=1` / `?v=2` | force scroll-driven or time-driven display | `IDX:41-46` |
| `?motion=raw` | no scroll smoothing (used by parity) | `LJS:132` |
| `?touch=1` | behave as a touch device | `LJS:364` |
| `?glass=off` | v2 without glass blur | `LJS:368` |
| `?anim=on` / `?anim=off` | force the full or simple v2 | `LJS:1419` |
| `?bench=1[&off=anim,phone,sb]` | self-scrolling frame-rate benchmark | `LJS:387-460` |
| `?debug=vh` | viewport diagnostics (comment) | `LJS:460-470` |

These parameters are public on prod (LB-LND-015).

#### LND-038 — Landing HTTP routing · DOCUMENTED_ONLY

- **Routes:**
  - `GET /`, `/uz/`, `/en/` → HTML;
  - `/uz` and `/en` → `308` to the slashed path, query preserved;
  - `/index.html` → `301 /`;
  - `/privacy.html` → HTML.
- **Unknown path:** the local server that mirrors prod returns `404` with the JSON body `{"detail":"Not Found"}`
  (UNVERIFIED for prod, Q-LND-006, LB-LND-013). The SEO sections have their own localised 404 page (LND-055).
- **Evidence:** `REC:54-55`; `SRV:1-3`, `SRV:39-66`.

#### LND-039 — Cloudflare Email Obfuscation · DOCUMENTED_ONLY

- **What:** on prod, Cloudflare rewrites the `mailto:` links of `privacy.html` (12 replacements) and of the
  methodology page into `/cdn-cgi/l/email-protection#…` and injects `email-decode.min.js`. The mirror keeps the
  original `mailto:`.
- **Evidence:** `REC:85-87`; `REL notes`; `SEO:378`.

### 1.5 Landing data contract (as read by `landing.js`)

| File | Fields read | Used by | Notes |
| ---- | ----------- | ------- | ----- |
| `data/live.json` | `now`, `day`, `week`, `latest[]` (`id`, `rooms`, `price_usd`, `delta`, `tone`, `district`, `district_code`, `area`, `seen_at`, `link`), `sheet.all` / `sheet.demo` (`count`, `per_day`) | counters (LND-011/012/016), pushes, filter-sheet footer, radar tile | `since` is `null` in the fixture and unused. `latest` holds 6 items. `link` = `https://t.me/KvadroAppBot?startapp=l_<id>-web`. |
| `data/pins-rent.json` | `pins[]` (`id`, `x`, `y` in % of the map image, `rooms`, `price_usd`, `delta`, `tone`, `area`, `floor`, `floors_total`, `district`, `district_code`, `point`, `photo`, `link`, `age_min`, `is_owner`, `in_all`, `in_rooms`), `medians[]` (`district_code`, `rooms`, `median_usd`, `n`), `bargains_week` | live map, feed, radar collage, savings block | 167 pins. `dots` (1 310 triples) is unused by the page. `medians` = 36 district + 2 033 `pt:` entries (LB-LND-004). Tones seen: `good`, `high`, `same`, `mixed`. |
| `data/pins-sale.json` | as rent | live map after «Продажа» | 149 pins. `medians` is empty, `bargains_week` is `null`, `dots` is empty. Tones also include `no_repair` and `null`. |
| `img/snap/<id>.webp` | — | pin photos, feed cards, radar collage | 316 files. Unsigned copies of channel photos (LB-LND-012). |

District codes in the data use underscores (`mirzo_ulugbek`), while URL slugs use hyphens (`mirzo-ulugbek`)
(BR-SEO-002). Evidence: `FIX/live.json`, `FIX/pins-rent.json`, `FIX/pins-sale.json`; `LJS:1038-1080`, `LJS:1112`,
`LJS:2098`, `LJS:2161`, `LJS:2225`, `LJS:2302-2309`.

### 1.6 Parity scenarios as an acceptance checklist

The legacy team's 40 parity scenarios (`SCN:1-175`) are a ready-made acceptance list for the new landing. Expected
results change where an `LB-…` fix applies.

| Group | Scenarios | Covers |
| ----- | --------- | ------ |
| Full scene | `{ru,uz,en}-desktop`, `{ru,uz,en}-phone-v1`, `{ru,uz,en}-desktop-live` (9) | LND-005 – LND-011, LND-022 |
| v2 | `ru-phone-v2-hero`, `ru-desktop-v2-hero` (2) | LND-023 |
| Live prototype | `live-phone-v1`, `deal-sale`, `deal-sale-phone-v1`, `sheet-filters`, `sheet-toggles`, `sheet-sale`, `pin-card`, `pin-other`, `sub-switch` (9) | LND-008, BR-LND-010 – BR-LND-017 |
| Blocks | `owner-agent`, `qr-close` (2) | LND-013, LND-019 |
| Static | `{ru,uz,en}-desktop-static`, `{ru,uz,en}-phone-static` (6) | LND-024 |
| Language | `browser-uz`, `browser-en`, `browser-kk`, `query-lang-en`, `stored-lang-uz`, `menu-lang-uz`, `menu-lang-en-from-uz` (7) | LND-027, BR-LND-004/005 |
| Attribution | `source-tag` (`/?s=Insta_1`) (1) | BR-LND-001 |
| Privacy | `privacy-ru`, `privacy-uz` (`?lang=uz`), `privacy-en-browser`, `privacy-stored-uz` (4) | LND-003, BR-LND-020 |

## 2. SEO pages

### 2.1 Inventory and counts

- **What the sitemap holds:** `sitemap.xml` holds 1 012 URLs: the landing ×3, `privacy.html` and 1 008 SEO pages, 336
  per language. Every URL has `<lastmod>` (dates from 3 to 8 November) and `xhtml:link` alternates for ru/uz/en plus
  `x-default` (= ru) (`SEO:46-47`). `REC:62` says «около 1020», an approximation; the parse in `seo-pages.md` is the
  better figure.
- **Pages per language:**

  | Page type | Rent (`arenda` / `ijara` / `rent`) | Sale (`prodazha` / `sotuv` / `sale`) | New builds (`novostrojki` / `novostroyka` / `new-builds`) | Per language | ×3 |
  | --------- | ---: | ---: | ---: | ---: | ---: |
  | Section hub | 1 | 1 | 1 | 3 | 9 |
  | City | 6 | 6 | 6 | 18 | 54 |
  | City + rooms | 18 | 23 | 17 | 58 | 174 |
  | District | 15 | 17 | 14 | 46 | 138 |
  | District + rooms | 37 | 50 | 37 | 124 | 372 |
  | Quarter / massif | 45 | — | — | 45 | 135 |
  | Metro hub | 1 | — | — | 1 | 3 |
  | Metro station | 35 | — | — | 35 | 105 |
  | By owner: city | 1 | — | — | 1 | 3 |
  | By owner: district | 2 | — | — | 2 | 6 |
  | Rent index | 1 | — | — | 1 | 3 |
  | Methodology | 1 | — | — | 1 | 3 |
  | Sale prices | — | 1 | — | 1 | 3 |
  | **Total** | **163** | **98** | **75** | **336** | **1 008** |

- **Which districts have pages** (`SEO:65-71`):
  - Tashkent: 12;
  - Tashkent region: `chirchiq`, `olmaliq`, `zangiota` for rent; `qibray` and `toshkent-tumani` for sale and new
    builds;
  - Andijan, Namangan, Kokand and Fergana: city and city + rooms only.
- **Data-driven page set:** only slices with enough listings exist. For example, Yangihayot has only the 2-room rent
  page (`SEO:62-63`).
- **Evidence:** `SEO:44-71`.

### 2.2 Address scheme

```text
/{section}/                                    section hub
/{section}/{city}/                             city
/{section}/{city}/{N}-{rooms}/                 city + rooms
/{section}/{city}/{district}/                  district
/{section}/{city}/{district}/{N}-{rooms}/      district + rooms
/{rent}/tashkent/{district}/{quarter}/         quarter or massif (rent, Tashkent only)
/{rent}/tashkent/metro/                        metro hub
/{rent}/tashkent/metro/{station}/              metro station
/{rent}/tashkent/{by-owner}/                   by owner, city
/{rent}/tashkent/{district}/{by-owner}/        by owner, district
/{rent}/{index}/   /{rent}/{methodology}/   /{sale}/{prices}/
/arenda/indeks/kvadro-rent-index.csv   /prodazha/ceny/kvadro-sale-prices.csv
```

Language prefix and service-slug translation (`SEO:90-101`). The "metro" row is not in the source table
(Q-SEO-010).

| Concept | ru (no prefix) | uz (`/uz/`) | en (`/en/`) |
| ------- | -------------- | ----------- | ----------- |
| rent | `arenda` | `ijara` | `rent` |
| sale | `prodazha` | `sotuv` | `sale` |
| new builds | `novostrojki` | `novostroyka` | `new-builds` |
| N rooms | `N-komnatnye` | `N-xonali` | `N-room` |
| by owner | `bez-posrednikov` | `maklersiz` | `by-owner` |
| index | `indeks` | `indeks` | `index` |
| methodology | `metodika` | `metodika` | `methodology` |
| prices | `ceny` | `narxlar` | `prices` |
| metro | `metro` | `metro` 🔶 | `metro` 🔶 |

Example: `/arenda/tashkent/yunusobod/2-komnatnye/` = `/uz/ijara/tashkent/yunusobod/2-xonali/` =
`/en/rent/tashkent/yunusobod/2-room/` (`SEO:105-106`). Slug rules: BR-SEO-002, BR-SEO-003. Routing: BR-SEO-004.

### 2.3 Page types and templates

All SEO pages share the frame in LND-041. Per-type blocks are listed in order (`SEO:189-205`). The ru `<title>`
templates are in BR-SEO-009, and the bot tags in BR-SEO-025.

#### LND-040 — SEO pages: general · DOCUMENTED_ONLY

- **Rendering:** server-rendered HTML with no JavaScript except `stats.js` (PostHog).
- **Styles and graphics:** the shared `landing.css` plus `area.css`, which is not mirrored (Q-SEO-001). Charts and the
  district map are server-rendered SVG.
- **Data:** counters, medians and cards are live from the database. The CDN holds a page for up to 5 minutes, and
  `Last-Modified` is the render time.
- **Purpose:** answer a search query («аренда квартир в Юнусабаде»: how many listings, the usual price, fresh
  listings) and send the visitor into Telegram.
- **Languages and currency:** three languages; prices always in USD, with no currency switch.
- **Evidence:** `SEO:32-42`; `ABT:522-528`.

#### LND-041 — Common page frame · DOCUMENTED_ONLY

- **Layout:**

  ```text
  header:  logo (→ /), language switch (Русский · Oʻzbekcha · English)
  main:    breadcrumbs (kvadro² › Аренда квартир › Ташкент › Юнусабад) + BreadcrumbList JSON-LD
           h1, lead, counter tiles («611 квартир в аренду», «287 новых за 7 дней»)
           sentence «Сейчас в Юнусабаде — 611 квартир в аренду, 287 из них появились за последнюю неделю, 6 — от хозяев без риелтора.»
           page blocks (per type)
           CTA «Новые квартиры … — сразу в Telegram» + button «Открыть в Telegram» (→ bot, start=s_seo_…)
           link blocks (LND-064)
  footer:  Главная · Конфиденциальность · Поддержка (@KvadroSupportBot) · Instagram (instagram.com/kvadro.app)
  ```

- **Owners link:** on the city page, «N — от хозяев без риелтора» links to the by-owner page.
- **Open:** whether the language switch links to the alternate of the same page is Q-SEO-011.
- **Evidence:** `SEO:174-187`.

#### LND-042 — Section hub (`/arenda/`, `/prodazha/`, `/novostrojki/`) · DOCUMENTED_ONLY

- **Blocks:**
  - lead;
  - link cards to the special pages («Индекс аренды», «Как мы считаем», «Цены на квартиры») and to the other sections;
  - «… по городам» with counters;
  - CTA.
- **Rent hub `<title>`:** «Аренда квартир в Узбекистане по городам и районам — объявления из Telegram | kvadro²».
- **Bot tags:** `s_seo`, `s_seo_sale`, `s_seo_new`.
- **Evidence:** `SEO:151`, `SEO:193`, `SEO:358-367`.

#### LND-043 — City with districts (Tashkent; Tashkent region 🔶) · DOCUMENTED_ONLY

- **Blocks:**
  - counters;
  - **«Цены по районам»**: a district × 1/2/3-room table (cells «—» under 8 listings);
  - cards and CTA;
  - links «по комнатам», «по районам», «по кварталам и массивам», «у метро», the other section of the same place,
    «по городам».
- **Bot tags:** `s_seo_tashkent`, `s_seo_tashkent-region_chirchiq` (region district).
- **Open:** whether Tashkent region uses this template is UNVERIFIED (Q-SEO-020).
- **Evidence:** `SEO:194`.

#### LND-044 — City without districts (Andijan, Namangan, Kokand, Fergana) · DOCUMENTED_ONLY

- **Blocks:**
  - «Сколько стоит аренда в Коканде» (price tiles by rooms);
  - cards and CTA;
  - links by rooms, sale in the city, «по городам».
- **Bot tag:** `s_seo_kokand`.
- **Evidence:** `SEO:195`.

#### LND-045 — City + rooms and district + rooms · DOCUMENTED_ONLY

- **Blocks:**
  - the table «2-комнатные по районам» (usual price, «сейчас в аренде»), or the district's price tile;
  - cards and CTA;
  - other room counts, «2-комнатные в других районах», the other section, cities.
- **Rooms:** 1–3 for rent, 1–4 for sale and new builds.
- **Bot tags:** `s_seo_tashkent_2k`, `s_seo_tashkent_yunusobod_2k`, `s_seo_sale_tashkent_yunusobod_2k`,
  `s_seo_new_tashkent_mirobod_2k`.
- **Evidence:** `SEO:153`, `SEO:157`, `SEO:197`, `SEO:108`.

#### LND-046 — District · DOCUMENTED_ONLY

- **Blocks:**
  - **price tiles** «1 комната $500/мес · по 82 из 197 объявлений»;
  - the comparison «Двухкомнатная здесь в среднем дороже, чем в 7 из 11 других районов города»;
  - cards and CTA;
  - links: the district's rooms, all districts, the district's quarters, nearby stations, sale in the district (with
    per-room counters), cities.
- **Bot tag:** `s_seo_tashkent_yunusobod`.
- **Evidence:** `SEO:152`, `SEO:196`.

#### LND-047 — Quarter / massif (45, rent, Tashkent) · DOCUMENTED_ONLY

- **Blocks:**
  - lead «Квартиры, в объявлении которых назван квартал …»;
  - **«Где это»**: district, nearest metro and distance from the middle of the quarter;
  - prices «по 12 ближайшим в обычных домах, до ~0,7 км · в Юнусабаде — $500»;
  - **«Школы рядом»**: number, place in the rating, distance;
  - cards and CTA;
  - «Соседние кварталы» with distance.
- **Nesting:** a quarter sits under the district that owns it according to the hokimiyat. Some «Чиланзар-N» massifs
  sit under `uchtepa`.
- **Examples:** `yunusobod/minor` «Минор (Ц-6)», `yunusobod/qiyot` «Киёт (Ц-5)», `chilonzor/chilonzor-19`,
  `uchtepa/chilonzor-26`, `mirzo-ulugbek/buyuk-ipak-yoli`, `olmazor/sebzor`, `shayxontohur/chorsu`.
- **Bot tag:** `s_seo_kv_yunusobod-minor`.
- **Evidence:** `SEO:110-113`, `SEO:154`, `SEO:198`.

#### LND-048 — Metro hub (`/arenda/tashkent/metro/`) · DOCUMENTED_ONLY

- **Blocks:**
  - the table «Станция · Рядом · 1-комн. · 2-комн. · 3-комн.» for 35 stations («—» under 8 listings);
  - CTA.
- **Bot tag:** `s_seo_metro`.
- **Evidence:** `SEO:199`.

#### LND-049 — Metro station · DOCUMENTED_ONLY

- **Blocks:**
  - a lead about landmarks within about 1 km;
  - **«Где именно — ориентиры в объявлениях»**: landmark, number of flats, distance to the station, or «названа сама
    станция»;
  - prices for the nearest listings and for the district;
  - cards and CTA;
  - «Соседние станции».
- **`<title>`:** «Аренда квартир у метро Айбек, Ташкент — цены и свежие объявления | kvadro²».
- **Bot tag:** `s_seo_metro`, the same for all stations (LB-SEO-011).
- **Evidence:** `SEO:155`, `SEO:200`.

#### LND-050 — By owner: city and district · DOCUMENTED_ONLY

- **Blocks:**
  - lead «только объявления, где сдаёт сам хозяин: так написано в тексте или канал поставил пометку (#хозяин,
    #собственник)»;
  - the share of all listings («Это 1% всех квартир…»);
  - «Сколько просят хозяева»;
  - the table «по районам: от хозяев / всего / доля»;
  - cards and CTA.
- **Instances:** 1 city page and 2 district pages per language (`sergeli` is one of them).
- **Bot tags:** `s_seo_tashkent_owners`, `s_seo_tashkent_sergeli_owners`.
- **Evidence:** `SEO:156`, `SEO:201`.

#### LND-051 — New-builds pages · DOCUMENTED_ONLY

- **Blocks:**
  - lead «Новостройка — так сказано в объявлении или в канале»;
  - prices by rooms plus per m² plus «по N из M объявлений»;
  - prices by district;
  - cards and CTA;
  - links to rooms, districts, all sale of the place, cities.
- **`<title>`:** «Новостройки в Ташкенте — купить квартиру в новостройке: 2 665 объявлений | kvadro²».
- **Defect:** LB-SEO-005.
- **Evidence:** `SEO:158`, `SEO:202`.

#### LND-052 — Rent index (`/arenda/indeks/`) · DOCUMENTED_ONLY

- **Blocks:**
  - overline «Ноябрь 2026 · данные на 8 ноября»;
  - **«Аренда в зарплатах»** (BR-SEO-018);
  - an **SVG map** of Tashkent with the 2-room median by district (districts are links);
  - a district table with the change against the previous month;
  - a **weekly chart** (SVG) with its table in `<details>`;
  - a monthly table;
  - the CSV link;
  - citation terms («цифры можно использовать со ссылкой»).
- **JSON-LD:** `Dataset` with `DataDownload`.
- **`<title>`:** «Индекс аренды Ташкента — ноябрь 2026 | kvadro²».
- **Bot tag:** `s_seo_index`.
- **Evidence:** `SEO:159`, `SEO:203`, `SEO:300-311`.

#### LND-053 — Sale prices (`/prodazha/ceny/`) · DOCUMENTED_ONLY

- **Blocks:**
  - a map and table «цена за м² по районам» with the change against the previous month;
  - a monthly table (m², 1–4 rooms, listings);
  - «Как считаем»;
  - CSV;
  - «Смотрите также».
- **JSON-LD:** `Dataset`.
- **`<title>`:** «Цены на квартиры в Ташкенте — ноябрь 2026: за м² по районам | kvadro²».
- **Bot tag:** `s_seo_sale_prices`.
- **Evidence:** `SEO:160`, `SEO:204`, `SEO:313-318`.

#### LND-054 — Methodology (`/arenda/metodika/`) · DOCUMENTED_ONLY

- **Content:** text on:
  - where listings come from;
  - how the text is parsed;
  - duplicates;
  - the usual price;
  - «дешевле рынка»;
  - the rent index;
  - rent in salaries;
  - limitations;
  - citation.
- **Mailbox:** the `mailto:` is rewritten by Cloudflare (LND-039).
- **Requirement:** this text is the public statement of the calculations, so the new backend must keep it true
  (BR-SEO-029).
- **Bot tag:** `s_seo_method`.
- **Evidence:** `SEO:205`, `SEO:242-257`, `SEO:378`.

#### LND-055 — 404 page · DOCUMENTED_ONLY

- **Content:** a localised page («Страница не найдена» / «Sahifa topilmadi») with `noindex,follow` and links to the
  rent hub, the index and the methodology.
- **When:** wrong case, unknown slug, a type the section does not have, or a slug from another language (BR-SEO-004).
- **Evidence:** `SEO:115-129`.

### 2.4 Shared parts of the SEO pages

#### LND-056 — Listing card and sorting · DOCUMENTED_ONLY

- **Count and sorting:**
  - up to 24 cards and no pagination;
  - default sort «Сначала новые»; other sorts «Дешевле», «Дороже», «Ниже рынка» via `?sort=cheap|expensive|below#cards`;
  - sort links have `rel="nofollow"`, and sorted pages are `noindex,follow` with a canonical without the parameter.
- **Markup:** `<li><a class="card" href="https://t.me/KvadroAppBot?startapp=l_<id>-seo-<channel>-<post>"
  target="_blank" rel="noopener">`, then:
  - a photo `/media/<id>/0.jpg?e=…&s=…` (`loading="lazy"`, 400 × 300);
  - badges `b-owner` «Хозяин» and «на 12% дешевле рынка»;
  - price, parameters, place, age;
  - «Открыть в Telegram ↗».
- **Never on the page:** phone, listing text or address («телефон и подробности — по нажатию, в Telegram»).
- **Formats:** BR-SEO-022.
- **Evidence:** `SEO:210-238`.

#### LND-057 — Head: titles, descriptions, canonical, hreflang, og, JSON-LD · DOCUMENTED_ONLY

- **Every page:**
  - `<html lang>`;
  - `canonical` to itself without parameters;
  - `hreflang` ru/uz/en/x-default;
  - `og:*` with the image `og-{ru,uz,en}.jpg` and `og:locale` `ru_RU` / `uz_UZ` / `en_US`;
  - `twitter:card=summary_large_image`.
- **JSON-LD:** `BreadcrumbList` everywhere. `Dataset` (with `DataDownload` → CSV, `temporalCoverage`, `dateModified`,
  `variableMeasured`) on the rent index and sale prices.
- **Templates:** BR-SEO-007, BR-SEO-009.
- **Evidence:** `SEO:139-170`.

#### LND-058 — Indexing rules and sitemap · DOCUMENTED_ONLY

- **What:** thin pages are `noindex,follow` and stay out of the sitemap. The sitemap is dynamic, holds only indexable
  pages, and gives each URL a `lastmod`. `robots.txt` is the one from LND-035.
- **Rules:** BR-SEO-006, BR-SEO-008, BR-SEO-035, BR-SEO-034, BR-SEO-036.
- **Evidence:** `SEO:131-145`.

#### LND-059 — HTTP headers, caching, CDN · DOCUMENTED_ONLY

- **Headers:**
  - `Cache-Control: public, max-age=0, must-revalidate, s-maxage=300`;
  - `Last-Modified` = render time;
  - the landing's CSP;
  - `Referrer-Policy: no-referrer`;
  - `X-Content-Type-Options: nosniff`;
  - HSTS.
- **CDN:** Cloudflare.
- **Rule and defect:** BR-SEO-027; LB-SEO-010.
- **Evidence:** `SEO:375-377`.

#### LND-060 — Photos on SEO pages · DOCUMENTED_ONLY

- **What:** signed photo URLs `/media/<id>/<n>.jpg?e=<unix>&s=<32 hex>`, plus the `.s.jpg` variant with the same
  signature. `robots.txt` disallows `/media/`. The endpoint itself is in `08-api-inventory.md`
  (`GET /media/<listing_id>/<n>.jpg`).
- **Rule and defect:** BR-SEO-028; LB-SEO-006.
- **Evidence:** `SEO:379-390`.

#### LND-061 — CSV exports · DOCUMENTED_ONLY

- **What:** `text/csv; charset=utf-8`, public, linked from the pages and from `Dataset` JSON-LD. External articles may
  cite them («цифры можно использовать со ссылкой»).
- **Format:** BR-SEO-024.
- **Open:** whether uz/en variants exist (Q-SEO-009).
- **Evidence:** `SEO:325-345`, `SEO:403-404`.

#### LND-062 — Links into the bot and the Mini App · DOCUMENTED_ONLY (formats) / CONFIRMED (client handling)

- **Cards:** link to the Mini App with `startapp=l_<id>-seo-<channel>-<post>`. The Mini App reads the source `seo` and
  can offer the source post on its no-access screen (`SP:44-54`).
- **CTA button:** goes to the bot with `start=s_seo[_<lang>][_<slice>]` (BR-SEO-025). At click time `stats.js` appends
  `--v<visit>` (`STJ:15-24`).
- **Evidence:** `SEO:347-371`; `SP:1-54`.

#### LND-063 — Analytics on SEO pages · UNVERIFIED

- **What is known:** `stats.js` loads on SEO pages, the same file as on the landing (LND-031).
- **What is not:** which events fire from district pages was not checked.
- **Expected:** the same autocapture, pageview and pageleave, with `site: "kvadro.app"` (Q-SEO-005).
- **Evidence:** `SEO:34`, `SEO:447`.

#### LND-064 — Interlinking blocks · DOCUMENTED_ONLY

- **What:** every page links to neighbouring slices (rooms, districts, quarters, stations), to the other section of
  the same place (rent ↔ sale ↔ new builds) and to all cities. Link texts carry the current number of listings.
- **Rule:** BR-SEO-030.
- **Evidence:** `SEO:144-145`.

### 2.5 What the SEO renderer needs from the backend (🔶 legacy team's recommendation)

The legacy team lists the backend inputs for a Next.js SEO renderer (`SEO:392-420`). It also recommends SSG or ISR
with revalidation of about 5 minutes, because medians are hourly. The list:

1. **Place dictionary** with grammatical cases and translations: cities, districts, quarters (with boundaries and
   middle point), metro stations (coordinates), slugs; in 3 languages.
2. **Per-slice aggregates** for «section × city × district | quarter | station | owners × rooms»: active listings, new
   in 7 days, from owners, medians per rooms with «n из m», «near» medians for quarters and stations (radius, house
   class), rank among districts, price per m².
3. **Slice cards** (up to 24) with sorts `new | cheap | expensive | below`: price, rooms, area, floor / floors, place,
   age, badges, signed photo, `id`, channel and post for `startapp`.
4. **The list of indexable pages** for the sitemap (threshold about 10 listings) with `lastmod`.
5. **Indexes:** monthly and weekly series, district tables with month-over-month change, the SVG map (district
   boundaries), the Nationalstat salary, CSV.
6. **Landmarks near a station** (landmark → flats, distance) and **schools near a quarter** (rating, distance).
7. **Photo link signing:** a shared secret between the API and the `/media` server.

Status: `UNVERIFIED` as a design; the needs themselves follow from the documented pages.

## 3. Business rules

### 3.1 Landing — `BR-LND`

All `CONFIRMED` from the production files.

- **BR-LND-001** · `CONFIRMED` — Landing bot payload.
  - **Format:** `START = "s_web" + ("_" + tag if tag matches ^[a-z0-9_-]{1,40}$) + ("--v" + KV_VISIT if the visit
    matches ^[a-z0-9]{10}$)`.
  - **Tag:** the lowercased `?s=`, or `?utm_source=` when `s` is absent. An invalid tag is dropped silently.
  - **Applied to:** every `[data-bot-link]` anchor at script start, as `href = href.split("?")[0] + "?start=" + START`.
  - **Length:** at most 59 characters, within Telegram's 64.
  - *Evidence:* `LJS:26-44`.
- **BR-LND-002** · `CONFIRMED` — Visit id.
  - **Generation:** 10 characters from `[a-z0-9]`, from `crypto.getRandomValues` (fallback `Math.random`) with
    `byte % 36`.
  - **Storage:** kept in `sessionStorage kv-visit` (one per tab session) and regenerated if invalid.
  - **Exposure:** `window.KV_VISIT`, and registered as the PostHog super-property `visit`.
  - *Evidence:* `STJ:4-14`, `STJ:48`.
- **BR-LND-003** · `CONFIRMED` — Click-time tagging by `stats.js` (landing and SEO pages).
  - **Matching links:** on `click` and `auxclick` (capture phase), for anchors whose `href` fully matches
    `^(https://t.me/\w+\?start=)(s_[a-z0-9_-]+)$` and has no `--v`.
  - **Rewrite:** `prefix + payload.slice(0, 49) + "--v" + visit`.
  - **Not tagged:** links with other parameters, upper-case payloads and `startapp` links.
  - *Evidence:* `STJ:15-24`.
- **BR-LND-004** · `CONFIRMED` — Language on load, first match wins:
  1. `?lang=ru|uz|en`;
  2. the path `/uz/` or `/en/`;
  3. `localStorage kv-landing-lang`;
  4. browser languages in order: `uz` or `ru` → that language; `kk`, `ky`, `tg`, `tk`, `be` → `ru`; `en` only if none
     of those appears anywhere in the list; otherwise `ru`.

  The path takes priority over a stored choice. *Evidence:* `LJS:2326-2353`.
- **BR-LND-005** · `CONFIRMED` — Language switch.
  - **Texts:** applies them, unless the document was already server-translated into that language.
  - **Address:** rewrites it to `root + (lang === "ru" ? "" : lang + "/")`, keeping other query parameters and the hash
    and dropping `lang`.
  - **Storage:** stores the choice.
  - **Links:** sets the privacy link `privacy.html[?lang=…]` and the logo link `./` or `<lang>/`.
  - *Evidence:* `LJS:2410-2454`.
- **BR-LND-006** · `CONFIRMED` — Plurals and numbers.
  - **Plurals:**
    - ru: three forms (`n%10==1 && n%100!=11` → one; `2..4` except `12..14` → few; otherwise many);
    - en: two forms (`n===1`);
    - uz: one form.
  - **Numbers:** `Intl.NumberFormat("en-GB")` for en (`2,880`); `ru-RU` for ru and uz (`2 880`), because Chrome has no
    Uzbek locale data.
  - **Money:** `$` + number.
  - *Evidence:* `LJS:6-24`, `LJS:51-56`.
- **BR-LND-007** · `CONFIRMED` — Counters («N новых квартир за сутки / за неделю»).
  - **Rule:** show `day` if `day ≥ 100`; else show `week` with «за неделю» if `week ≥ 100`; else hide the counter
    (`COUNT_MIN = 100`, «сервис не должен выглядеть маленьким»).
  - **Animation:** counts up over 1.2 s, ease-out cubic.
  - **Used by:** the lock screen, `#live` and the final block.
  - *Evidence:* `LJS:2062-2092`, `LJS:2216-2240`.
- **BR-LND-008** · `CONFIRMED` — Savings block.
  - **Formula:** `cheap = round10(median × 0.8)`; yearly saving = `(median − cheap) × 12`.
  - **Defaults:** 2 rooms, `chilonzor`.
  - **Medians used:** entries with `rooms ∈ 1..3` and `median_usd > 0`.
  - **District buttons:** every entry for the chosen rooms, ordered by the sum of `n` over all rooms, descending. If
    the selected district has no median for those rooms, the first entry is selected.
  - **Before data:** `PC_FALLBACK` medians (Chilonzor $500 / $600 / $650; Mirobod, Yunusobod, Mirzo-Ulugbek 2-room).
  - *Evidence:* `LJS:2246-2309`.
- **BR-LND-009** · `CONFIRMED` — Weekly bargains line.
  - **Rule:** shown only when `bargains_week ≥ 100`, as `num(n) + plural("квартира") + " на 20% и больше дешевле
    обычной цены нашли за неделю в Ташкенте"`.
  - **Server definition:** the server defines «bargain» as 20 % or more below the usual price (comment). That is a
    different bar from the ≥ 10 % «ниже рынка» tone (Q-LND-010).
  - *Evidence:* `LJS:2241-2244`, `LJS:2310-2316`.
- **BR-LND-010** · `CONFIRMED` — Live-map pins.
  - **Activation:** v1 enters live mode at scene progress > 0.9256 and leaves at ≤ 0.9008.
  - **Which pins:**
    - outside live mode, those with `in_all`;
    - with a single room count from 1 to 3 selected, those with `in_rooms`;
    - otherwise those with `in_all`;
    - all filtered by BR-LND-011.
  - **Declutter:** label boxes `(len(price) × 7.4 + 18) / 2 + 3` points must not overlap; the selected pin and the
    story pin take precedence.
  - *Evidence:* `LJS:656-735`, `LJS:1905-1918`.
- **BR-LND-011** · `CONFIRMED` — Demo filter semantics.
  - **Rooms:** `rooms ≥ rmin`; `rooms ≤ rmax` unless `rmax ≥ 4`.
  - **Price:** `price_usd ≤ price`, with presets of $300 – 1 500 for rent and $40 000 – 200 000 for sale.
  - **Districts:** the code must be in the list.
  - **Owner:** `no_agents` excludes `is_owner === false`; `owners` keeps `is_owner === true`.
  - **Deal switch:** switching between rent and sale resets the price.
  - **Display-only:** sale, zones, metro, housing, term and tenants.
  - **Rooms chips:** one value is exact, a second value gives a range, repeating a value or «Любые» resets.
  - *Evidence:* `LJS:645-661`, `LJS:1049-1170`; `IDX:152-154`.
- **BR-LND-012** · `CONFIRMED` — Price tone on pins, cards and pushes. The server sends `delta` (%) and `tone`.
  - **No tone:** `null` or missing → no market line.
  - **`same` or `mixed`:** «≈ рынок».
  - **`no_repair`:** a neutral «±N% к рынку».
  - **`good`:** «−N% к рынку» (green) and the tag «Ниже рынка».
  - **`high`:** «+N% к рынку».
  - **Tag priority:** below market, then «Хозяин» (`is_owner`).
  - **Pushes:** the mark is shown only when the tone is not `same`.
  - *Evidence:* `LJS:609-624`, `LJS:2007-2021`.
- **BR-LND-013** · `CONFIRMED` — Demo card formatting.
  - **Facts:** `title.<min(rooms,4)>` · `{area} м²` · `{floor}/{total} эт.` or `{floor} эт.`.
  - **Age:** `< 1` min «только что», `< 60` «N мин назад», `< 1440` «N ч назад» (floor), else «N дн. назад».
  - **Where:** the translated district name · `point`.
  - **Period:** «/мес» for rent and nothing for sale.
  - *Evidence:* `LJS:591-633`.
- **BR-LND-014** · `CONFIRMED` — Lock-screen pushes.
  - **Set:** at most 4 (`LIVE_MAX`), taken from `latest` and shown oldest first, so the newest arrives last at the
    bottom.
  - **Drip:** one per second while the block is at least 35 % visible; at once under reduced motion.
  - **Ages:** relative to the snapshot time `now` (no drift), re-rendered every 30 s.
  - **Clock and date:** in `Asia/Tashkent`. The Uzbek date is formatted by hand («seshanba, 13-oktabr»).
  - **Link:** each push links to `item.link`.
  - *Evidence:* `LJS:1939-2060`.
- **BR-LND-015** · `CONFIRMED` — Filter-sheet footer.
  - **No conditions:** `sheet.all` numbers.
  - **Demo filter** (2 rooms, Chilonzor + Mirobod, «Без риелторов»): `sheet.demo` numbers.
  - **Text:** «📡 Радар: ≈N в день» if `per_day ≥ 1`, else «≈N в неделю» (`per_day × 7`), plus «Показать N».
  - **Other combinations or sale:** «Показать» without a number and no radar line.
  - *Evidence:* `LJS:1081-1112`.
- **BR-LND-016** · `CONFIRMED` — Radar tile in the demo.
  - **Filter:** `DEMO_FILTERS` = 2 rooms, `chilonzor` + `mirobod`, `no_agents`.
  - **Collage:** up to 4 photos of matching pins.
  - **State line:** «≈N в день / в неделю» from `sheet.demo`.
  - **Controls:** the switch pauses, the tile opens the feed with that filter, and «+» / `m-bot` opens the bot link.
  - *Evidence:* `LJS:1196-1240`, `LJS:1028-1031`.
- **BR-LND-017** · `CONFIRMED` — Click targets.
  - **Listing elements:** pins, the selected card, feed cards and pushes open `p.link` in a new window.
  - **Otherwise:** the first `[data-bot-link]` URL (tagged).
  - **When:** only while the map is live.
  - *Evidence:* `LJS:634-644`, `LJS:928`, `LJS:950`.
- **BR-LND-018** · `CONFIRMED` — Display version.
  - **Rule:** v2 if `?v=2`, or if `(pointer: coarse)` and not `?v=1`; otherwise v1.
  - **When decided:** before first paint.
  - *Evidence:* `IDX:41-46`.
- **BR-LND-019** · `CONFIRMED` — The simple v2 is used when any of these holds:
  - reduced motion;
  - Android with `hardwareConcurrency ≤ 4` or `deviceMemory ≤ 2`;
  - `innerHeight < 500`;
  - no `Element.animate`;
  - no IntersectionObserver;
  - the measured intro runs below about 30 fps.

  Force with `?anim=on|off`. *Evidence:* `LJS:1399-1430`.
- **BR-LND-020** · `CONFIRMED` — Privacy language.
  - **Order:** `?lang=`, then `kv-landing-lang`, then browser languages as in BR-LND-004, with no path step.
  - **Home links:** uz/en rewrite them to `./?lang=<lang>`.
  - *Evidence:* `PRV:150-177`.
- **BR-LND-021** · `CONFIRMED` — Browser theme colour.
  - **Rule:** `#0e0e10` while the dark first scene is under the toolbar, `#ffffff` afterwards.
  - *Evidence:* `LJS:236-241`.
- **BR-LND-022** · `CONFIRMED` — Dock visibility.
  - **Shown:** after the first-screen CTA has gone.
  - **Hidden:** on the «Как приложение» step, while the phone is full-screen (live), and when the final block shows.
  - **v2:** shown only once the hero button has scrolled away and the phone is not underneath.
  - *Evidence:* `LJS:193-235`.
- **BR-LND-023** · `CONFIRMED` — Floating QR.
  - **Where:** only at `min-width: 1200px` with hover and a fine pointer, after the first scene.
  - **Morph:** expands when the final block is more than half visible and collapses when it has almost left (with
    hysteresis).
  - **Close:** hides it for the page view.
  - *Evidence:* `LJS:245-330`.

### 3.2 SEO pages and calculations — `BR-SEO`

`DOCUMENTED_ONLY` unless marked otherwise. Several of these rules also feed the Mini App. Where the backend audit
already captured a rule, the matching `BR-API` item is named.

- **BR-SEO-001** · `DOCUMENTED_ONLY` — URL scheme and service-slug translations as in §2.2.
  - **Prefixes:** ru has none, uz uses `/uz/`, en uses `/en/`.
  - **Slugs:** service slugs are translated, place slugs are not.
  - *Evidence:* `SEO:73-106`.
- **BR-SEO-002** · `DOCUMENTED_ONLY` — Place slugs.
  - **Rule:** the same in all three languages, all lower case, words joined by hyphens.
  - **Cities:** use their own forms: `tashkent`, `tashkent-region`, `andijan`, `namangan`, `kokand`, `fergana`.
  - **Districts, quarters, stations:** Uzbek Latin without apostrophes (`oʻ` → `o`, `gʻ` → `g`, `ʼ` dropped; `x` for
    the kh sound): `yunusobod`, `shayxontohur`, `chilonzor-19`, `qiyot`, `abdulla-qodiriy`, `toshkent-tumani`,
    `buyuk-ipak-yoli`.
  - **Mapping from data codes:** the landing data uses underscores (`mirzo_ulugbek`) where the slug has a hyphen
    (`mirzo-ulugbek`) (`CONFIRMED`: `FIX/pins-rent.json` vs `IDX:384`).
  - *Evidence:* `SEO:103-113`.
- **BR-SEO-003** · `DOCUMENTED_ONLY` — Rooms slugs and ranges.
  - **Slugs:** `N-komnatnye` / `N-xonali` / `N-room`.
  - **Ranges:** rent N = 1–3; sale and new builds N = 1–4. `/arenda/…/4-komnatnye/` → `404`.
  - **Bot tags:** `<N>k`.
  - *Evidence:* `SEO:97`, `SEO:108`, `SEO:361-367`.
- **BR-SEO-004** · `DOCUMENTED_ONLY` — Routing.

  | Request | Answer |
  | ------- | ------ |
  | Missing trailing `/` | `308` to the slashed URL |
  | Other letter case | `404` |
  | Unknown city, district, quarter or station | `404` |
  | A type the section lacks (`/prodazha/tashkent/metro/`, a quarter under `prodazha`, `/novostrojki/ceny/`) | `404` |
  | A slug from another language (`/uz/arenda/…`) | `404` |
  | `?sort=cheap\|expensive\|below` | `200`, other card order, `noindex,follow`, canonical without the parameter |
  | `?page=2` and any other parameter | ignored: same page, canonical without the parameter |

  The 404 page is localised, `noindex,follow` (LND-055). **Reserved slugs** cannot be place slugs at the same level:
  - `metro`, `bez-posrednikov` / `maklersiz` / `by-owner` at the district level;
  - `indeks` / `index`, `metodika` / `methodology`, `ceny` / `narxlar` / `prices` at the city level.

  *Evidence:* `SEO:115-129`.
- **BR-SEO-005** · `DOCUMENTED_ONLY` — Which slices exist.
  - **Districts:** 12 in Tashkent; Tashkent region districts as in §2.1; none for the 4 other cities.
  - **Quarters:** 45, rent only, Tashkent, nested by hokimiyat ownership.
  - **Stations:** 35.
  - **Data-driven:** a slice gets a page only with enough listings (Q-SEO-008 for the exact existence rule).
  - *Evidence:* `SEO:62-71`, `SEO:110-113`.
- **BR-SEO-006** · `DOCUMENTED_ONLY` — Indexing threshold.
  - **Rule:** a page with ≤ 9 listings → `<meta name="robots" content="noindex,follow">` and not in the sitemap; ≥ 11
    → indexed. The exact cut-off is BR-SEO-035.
  - **Same treatment:** `?sort` pages and the 404 are also `noindex,follow`.
  - *Evidence:* `SEO:137-138`.
- **BR-SEO-007** · `DOCUMENTED_ONLY` — Head of every page.
  - **Tags:** `html lang`, a self canonical without parameters, hreflang ru/uz/en + `x-default` = ru, `og:*` with
    `og-<lang>.jpg` and `og:locale`, `twitter:card summary_large_image`.
  - **JSON-LD:** `BreadcrumbList` everywhere; `Dataset` on the rent index and sale prices.
  - **Sort links:** `rel="nofollow"`.
  - *Evidence:* `SEO:139-143`.
- **BR-SEO-008** · `DOCUMENTED_ONLY` — Sitemap.
  - **Build:** `/sitemap.xml` is built dynamically with `s-maxage=300`.
  - **Contents:** the landing ×3, `privacy.html` and indexable SEO pages only.
  - **Per URL:** `lastmod` and `xhtml:link` alternates for ru/uz/en + `x-default`.
  - **Open:** `lastmod` semantics are BR-SEO-034.
  - *Evidence:* `SEO:46-47`, `SEO:135-136`.
- **BR-SEO-009** · `DOCUMENTED_ONLY` — `<title>` and `description` templates (ru). The live numbers are examples.

  | Type | `<title>` |
  | ---- | --------- |
  | Rent hub | «Аренда квартир в Узбекистане по городам и районам — объявления из Telegram \| kvadro²» |
  | City / district | «Аренда квартир в Юнусабаде, Ташкент — снять квартиру: 611 объявлений \| kvadro²» |
  | + rooms | «Снять 2-комнатную квартиру в Юнусабаде, Ташкент — 289 объявлений и цены \| kvadro²» |
  | Quarter | «Аренда квартир в квартале Минор (Ц-6), Ташкент — цены и свежие объявления \| kvadro²» |
  | Station | «Аренда квартир у метро Айбек, Ташкент — цены и свежие объявления \| kvadro²» |
  | By owner | «Аренда квартир без посредников в Ташкенте — 58 объявлений от хозяина \| kvadro²» |
  | Sale, rooms | «Купить 2-комнатную квартиру в Юнусабаде, Ташкент — 306 объявлений и цены \| kvadro²» |
  | New builds | «Новостройки в Ташкенте — купить квартиру в новостройке: 2 665 объявлений \| kvadro²» |
  | Index | «Индекс аренды Ташкента — ноябрь 2026 \| kvadro²» |
  | Sale prices | «Цены на квартиры в Ташкенте — ноябрь 2026: за м² по районам \| kvadro²» |

  - **District description:** «611 квартир в аренду в Юнусабаде, Ташкент из Telegram-каналов, 287 новых за неделю.
    Обычная цена: 1 комната $500, 2 комнаты $615, 3 комнаты $800 в месяц. Недорогие — кнопкой «Дешевле». Без повторов
    и рекламы, бесплатно.»
  - **Sale and new builds:** «Обычная цена — $76 500, $1 429 за м².».
  - **Quarters and stations:** without «кнопкой «Дешевле»».
  - **Declension:** place names are declined («в Юнусабаде», «в Чирчике», «в Коканде»). Every place needs case forms in
    every language.
  - **Open:** the uz/en templates are only partly known (Q-SEO-004).
  - *Evidence:* `SEO:147-170`.
- **BR-SEO-010** · `DOCUMENTED_ONLY` — Counters.
  - **«Сейчас … N квартир»:** active listings of the slice.
  - **«новых за 7 дней»:** listings that appeared in the last week (Q-SEO-016 for the date basis).
  - **«от хозяев без риелтора»:** listings with an explicit owner mark: owner wording in the text, or the channel
    hashtag `#хозяин` / `#собственник`.
  - *Evidence:* `SEO:259-262`; same owner rule as BR-API-046.
- **BR-SEO-011** · `DOCUMENTED_ONLY` — Usual price (district median), the same as BR-API-057.
  - **Slice:** district (or city) × rooms.
  - **Window:** the last 60 days.
  - **Recompute:** hourly.
  - **Selection:** one publication per flat; at most 3 listings per channel (no channel cap in regional cities).
  - **Minimum:** a group under 8 listings is not computed («—»).
  - **Outliers dropped:** prices below $50 or above $20 000 per month, and «per person» prices.
  - **Caption:** «по 82 из 197 объявлений» = used / all.
  - *Evidence:* `SEO:264-275`.
- **BR-SEO-012** · `DOCUMENTED_ONLY` — District rank sentence.
  - **Text:** «Двухкомнатная здесь в среднем дороже, чем в X из Y других районов города».
  - **Method:** the district's median for that room count is compared with the medians of the other districts of the
    city that have one.
  - **Open:** tie handling and the choice of the room count (the page shows 2 rooms) are not documented (Q-SEO-016).
  - *Evidence:* `SEO:196`, `SEO:275`.
- **BR-SEO-013** · `DOCUMENTED_ONLY` — «Near» usual price (quarters, stations, card badges), the same as BR-API-058.
  - **Rent:** the median of the **12 nearest** listings with the same rooms.
  - **Sale:** the **15 nearest**, per m².
  - **Measured from:** the place named in the listing (quarter, landmark, metro).
  - **Limits:** within 5 km; at most 3 listings per channel.
  - **Caption:** the radius reached and the house class («по 12 ближайшим в обычных домах, до ~0,7 км»).
  - **Fallback:** with fewer than 8 nearby listings, the district median is used.
  - *Evidence:* `SEO:277-282`.
- **BR-SEO-014** · `DOCUMENTED_ONLY` — «Дешевле рынка» badge and tone, the same as BR-API-059/060.
  - **Badge:** «на N% дешевле рынка» (uz «bozordan N% arzon», en «N% below market»).
  - **Under 10 %:** «на уровне обычной цены», without a percentage.
  - **Mixed:** if the nearest listings are cheaper but the whole district is dearer, «ниже рынка» is not claimed and
    both numbers are shown.
  - **Comparison base:** 3+ room flats with unusual area are compared per m² among 3+ room flats; 1–2 room flats by
    room count. Very small flats are never called «подозрительно дёшево».
  - **Owner badge:** «Хозяин» (`b-owner`). A card may carry both badges or neither.
  - *Evidence:* `SEO:232`, `SEO:283-286`.
- **BR-SEO-015** · `DOCUMENTED_ONLY` — Owners.
  - **«Сколько просят хозяева»:** the median of **current** owner listings for rent, shown where there are at least 8.
    It is compared with the usual price over all listings for 60 days.
  - **Share line:** «Это 1% всех квартир…» = owner listings / all active listings of the slice.
  - **District table:** from owners / total / share.
  - *Evidence:* `SEO:201`, `SEO:289-292`.
- **BR-SEO-016** · `DOCUMENTED_ONLY` — Sale and new-builds statistics, the same as BR-API-063.
  - **Measures:** price and price per m².
  - **Excluded:** down payment and instalment prices.
  - **Channel cap:** at most a tenth of a group from one channel.
  - **New build:** «так сказано в объявлении или в канале».
  - **Captions:** «по N из M».
  - *Evidence:* `SEO:294-298`.
- **BR-SEO-017** · `DOCUMENTED_ONLY` — Tashkent rent index.
  - **Monthly median:** of the **new** listings of the month, i.e. the month the flat first appeared in the channels,
    taken with its last price. A flat reposted later is not new, so **past months never change**.
  - **Selection:** one publication per flat; no channel cap; no «near» logic. The result may differ from the usual
    price on cards.
  - **Weeks:** Monday to Sunday.
  - **Visibility:** a month or week is shown and compared only if it has ≥ 50 listings with that room count.
  - **District table (2 rooms):** median, listings, change against the previous month (`±0%`, `−6%`, `+8%`, `—`).
  - **Coverage:** data from 2026-10-01 (`temporalCoverage`).
  - *Evidence:* `SEO:300-311`.
- **BR-SEO-018** · `DOCUMENTED_ONLY` — «Аренда в зарплатах».
  - **Formula:** the month's median converted to UZS at the Central Bank rate, divided by the average accrued salary in
    Tashkent from the latest Nationalstat release («12,3 млн сум, январь–сентябрь 2026»).
  - **Output:** «1 комната 49% зарплаты», per room count.
  - **Open:** rounding is not documented.
  - *Evidence:* `SEO:309-310`.
- **BR-SEO-019** · `DOCUMENTED_ONLY` — Sale prices page.
  - **Month:** by first appearance; one flat counted once.
  - **Excluded:** down payments, instalments, prices < $5 000 and > $5 M.
  - **Per m²:** only listings with an area.
  - **Channel cap:** ≤ 1/10 of a group from one channel.
  - **Visibility:** groups under 8 hidden; comparison with the previous month from 50 listings.
  - *Evidence:* `SEO:313-318`.
- **BR-SEO-020** · `DOCUMENTED_ONLY` — Metro.
  - **«У метро»:** the landmark from the listing (quarter, residential complex, place or the station itself) lies
    within about 1 km of the station in a straight line.
  - **Hub table:** «—» under 8 listings.
  - **Station page:** landmarks with flat count and distance, or «названа сама станция».
  - *Evidence:* `SEO:199-200`, `SEO:320-322`.
- **BR-SEO-021** · `DOCUMENTED_ONLY` — Quarters.
  - **Membership:** a listing belongs to a quarter if its text names the quarter. The district is sometimes inferred
    from a landmark or mahalla.
  - **Distances:** to metro and schools, from the middle of the quarter.
  - **«Соседние кварталы»:** distance and flat count.
  - **Schools:** number, rating place (Tashkent 2024 rating, 9 criteria), distance.
  - **Sources:** boundaries and ratings from `opendata.tashkent.uz/data/132` and `/134`; school locations from
    OpenStreetMap.
  - *Evidence:* `SEO:198`, `SEO:253-257`, `SEO:323`.
- **BR-SEO-022** · `DOCUMENTED_ONLY` — Card list and formats.
  - **List:** up to 24 cards, default «Сначала новые», `?sort=cheap|expensive|below#cards`, no pagination.
  - **Price:** rent `$700/мес` (`/oy`, `/mo`); sale `$76 500 · $1 429/м²`.
  - **Parameters:** `3-комн. · 68 м² · 4/4 эт.`, or without area `2-комн. · 1/4 эт.`, or without total floors
    `2-комн. · 3 эт.`, or `N-комн.` only. uz `2 xonali · 60 m² · 9/10 qavat`; en `2 rm · 60 m² · floor 9/10`.
  - **Place:** quarter, landmark or residential complex from the listing (`Юнусабад-4`, `Megapolis`); optional.
  - **Age:** `14 мин назад`, `3 ч назад`, `4 дн. назад` (uz `N soat oldin`, en `N h ago`).
  - **Absent:** no phone, listing text or address.
  - *Evidence:* `SEO:212-238`.
- **BR-SEO-023** · `DOCUMENTED_ONLY` — Currency.
  - **Display:** prices always in USD, with no switch.
  - **Conversion:** UZS prices are converted to USD at the official Central Bank of Uzbekistan rate.
  - *Evidence:* `SEO:42`, `SEO:250`.
- **BR-SEO-024** · `DOCUMENTED_ONLY` — CSV formats.
  - **Rent index:** `/arenda/indeks/kvadro-rent-index.csv` with columns `period,start,rooms,median_usd,listings`.
    `period` ∈ `month|week`; `start` is an ISO date (the Monday for weeks).
  - **Sale prices:** `/prodazha/ceny/kvadro-sale-prices.csv` with columns
    `month,district,rooms,median_usd,median_usd_m2,listings`. `district=all` and `rooms=0` mean "all"; `median_usd`
    is empty for `rooms=0`.
  - **Content type:** `text/csv; charset=utf-8`.
  - *Evidence:* `SEO:325-345`.
- **BR-SEO-025** · `DOCUMENTED_ONLY` — Bot CTA payload grammar.
  - **Grammar:** `s_seo[_<lang>][_<slice>]`. `<lang>` is `uz` or `en` (none for ru) and comes right after `s_seo`.
  - **Slices:**

    | Page | Tag (ru) |
    | ---- | -------- |
    | rent hub | `s_seo` |
    | city | `s_seo_<city>` |
    | district | `s_seo_<city>_<district>` (`s_seo_tashkent-region_chirchiq`) |
    | + rooms | `…_<N>k` |
    | quarter | `s_seo_kv_<district>-<quarter>` |
    | metro hub and all stations | `s_seo_metro` |
    | by owner | `s_seo_<city>[_<district>]_owners` |
    | index | `s_seo_index` |
    | methodology | `s_seo_method` |
    | sale | `s_seo_sale[_<city>[_<district>][_<N>k]]` |
    | sale prices | `s_seo_sale_prices` |
    | new builds | `s_seo_new[_<city>[_<district>][_<N>k]]` |

  - **Examples:** `s_seo_uz_tashkent_yunusobod`, `s_seo_en_sale_tashkent`, `s_seo_uz_kv_yunusobod-minor`.
  - **Visit suffix:** `stats.js` appends `--v<visit>` after cutting the payload to 49 characters (BR-LND-003).
  - *Evidence:* `SEO:353-371`.
- **BR-SEO-026** · `DOCUMENTED_ONLY` (format) / `CONFIRMED` (parser) — Card deep link.
  - **Format:** `https://t.me/KvadroAppBot?startapp=l_<id>-seo-<channel>-<post>`.
  - **Mini App parser:**
    - id `^l_(\d+)`;
    - source `seo` for `^l_\d+-seo(-|$)`;
    - source post `^l_\d+-(?:seo-)?([A-Za-z0-9_]{4,32})-(\d{1,12})$` → `https://t.me/<channel>/<post>`.
  - **Length:** stays within Telegram's 64-character `startapp` limit for 32-character channel names.
  - *Evidence:* `SEO:216`, `SEO:349-351`; `SP:14-54`.
- **BR-SEO-027** · `DOCUMENTED_ONLY` — HTTP.
  - **Headers:** `Cache-Control: public, max-age=0, must-revalidate, s-maxage=300` (5 minutes at the CDN, revalidation
    in browsers); `Last-Modified` = render time; CSP as the landing; `Referrer-Policy: no-referrer`; `nosniff`; HSTS.
  - **Sitemap:** also `s-maxage=300`.
  - *Evidence:* `SEO:36-37`, `SEO:135`, `SEO:375-377`.
- **BR-SEO-028** · `DOCUMENTED_ONLY` — Photo URLs, the same as BR-API-055.
  - **Format:** `/media/<id>/<n>.jpg?e=<unix>&s=<32 hex>`.
  - **`e`:** rounded to 00:00 UTC and issued about 1–2 days ahead, so a photo keeps one URL per day for CDN caching.
  - **Signature:** bound to the listing and the photo number, not to the size (`.s.jpg` works with the same
    signature).
  - **Errors:** missing `e` or `s` → `422` with a validation body; bad or expired → `404 {"detail":"Not Found"}`.
  - **Response:** `image/jpeg`, `Cache-Control: public, max-age=86400`, `ETag`; served the same from `kvadro.app` and
    `app.kvadro.app`.
  - *Evidence:* `SEO:379-387`.
- **BR-SEO-029** · `DOCUMENTED_ONLY` — Public methodology statements the new pipeline must keep true, or the text must
  change:
  - 217 open channels, read through their public pages without subscribing;
  - Gemini extracts the fields and leaves empty what is not in the text («без догадок»);
  - phones and `@nicks` are hidden before sending;
  - UZS → USD at the Central Bank rate;
  - duplicates are matched on photos, text and parameters; one flat = one card and one unit in counts;
  - withdrawn listings are kept for 90 days, then phone, text and photos are erased.

  *Evidence:* `SEO:244-257`.
- **BR-SEO-030** · `DOCUMENTED_ONLY` — Interlinking.
  - **Neighbours:** rooms, districts, quarters, stations, the other section of the same place, all cities.
  - **Link texts:** carry the current listing count.
  - **City page:** «N — от хозяев без риелтора» links to the by-owner page.
  - *Evidence:* `SEO:144-145`, `SEO:187`.
- **BR-SEO-031** · `DOCUMENTED_ONLY` — CTA texts follow the radar scenario:
  - «Задайте район, цену и комнаты…»;
  - «В радаре выберите цену, комнаты и «Рядом с метро»…»;
  - «…и «Только хозяева»…»;
  - «В радаре выберите «Купить», «Новостройка», район, бюджет и комнаты…» (LB-SEO-005).

  *Evidence:* `SEO:207-208`.
- **BR-SEO-032** · `DOCUMENTED_ONLY` — 404 page.
  - **Text:** localised «Страница не найдена» / «Sahifa topilmadi».
  - **Indexing:** `noindex,follow`.
  - **Links:** to the rent hub, the index and the methodology.
  - *Evidence:* `SEO:128-129`.
- **BR-SEO-033** · `UNVERIFIED` — The «near» and badge calculation of the SEO pages is the same one that produces
  `median_*` on Mini App cards (🔶). *Check:* Q-SEO-018.
- **BR-SEO-034** · `UNVERIFIED` — Sitemap `lastmod` is the date of the page's last data change (🔶). *Check:* Q-SEO-003.
- **BR-SEO-035** · `UNVERIFIED` — The indexing cut-off is exactly 10 listings: ≥ 10 indexed (🔶; ≤ 9 noindex and ≥ 11
  indexed were observed). *Check:* Q-SEO-002.
- **BR-SEO-036** · `UNVERIFIED` — A slice that shrinks below the threshold stays `200` + `noindex,follow` and drops out
  of the sitemap (🔶, by analogy with thin pages). *Check:* Q-SEO-008.
- **BR-SEO-037** · `UNVERIFIED` — Channels are read through the public web preview `t.me/s/<channel>`, not an MTProto
  client (🔶). *Check:* Q-SEO-019.
- **BR-SEO-038** · `UNVERIFIED` — The Mini App receives the same signed `/media` URLs in `photos` / `photos_preview`
  as the SEO pages (🔶). *Check:* Q-API-024 in `02-legacy-backend-audit.md`.

## 4. Legacy bugs and questionable decisions

### 4.1 Landing — `LB-LND`

- **LB-LND-001** · `bug` · `CONFIRMED` — **Relative URLs break after a language switch on `/`.**
  - **Cause:** `/` has no `<base>`, and `chooseLang` rewrites the address to `/en/` or `/uz/` with
    `history.replaceState`.
  - **Affected URLs** (relative to the new address):
    - images, the favicon and lazy images → `/en/img/…` → `404` (prod observation);
    - derived from the code:
      - the 24 footer SEO links → `/en/arenda/…` (`404` by the SEO routing rules) while their labels turn English;
      - the logo link `en/` → `/en/en/`;
      - the privacy link → `/en/privacy.html?lang=en`;
      - later data fetches → `/en/data/pins-sale.json` (empty sale map);
      - `img/snap` photos.
  - **On `/uz/` and `/en/`:** `<base href="../">` hides the problem, but switching there still leaves uz-slug footer
    links under English labels.
  - *Evidence:* `REC:81-84`; `LJS:2410-2454`; `IDX:367-408`.
  - **Proposed fix:**
    - Use root-relative or absolute URLs everywhere.
    - A language switch is a real navigation to the server-rendered `/`, `/uz/`, `/en/` (Next.js locale routes). Each
      locale renders its own footer slugs.
  - **URL/SEO impact:** none on canonical URLs. It removes 404s and wrong-language links that users and
    JavaScript-rendering crawlers can reach.
- **LB-LND-002** · `decision` · `CONFIRMED` (code) / `UNVERIFIED` (crawler effect) — **The canonical `/` is translated
  on the client.**
  - **Behaviour:** on `/`, `pickLang` uses `?lang=`, then a stored choice, then the browser language, and swaps all
    texts and the `<title>` without changing the URL. Canonical and hreflang still declare `ru`. A visitor or renderer
    with an English locale gets English content on the ru URL, and `/?lang=uz` serves uz content under a canonical of
    `/`.
  - **Risk:** search engines see mixed-language duplicates of `/` and `/en/`.
  - *Evidence:* `LJS:2328-2337`, `LJS:2374-2400`, `LJS:2477`; parity `browser-en`. *Check:* Q-LND-003.
  - **Proposed fix:**
    - Render `/` always in ru on the server.
    - Answer `/?lang=uz|en` with a `301` to `/uz/` or `/en/`, keeping the other parameters such as `s` and
      `utm_source`.
    - Optionally show a dismissible «Эта страница есть на O'zbekcha / English» suggestion from `Accept-Language` or
      `navigator.languages`, with no automatic rewrite. The stored choice only drives that suggestion.
  - **URL/SEO impact:** `/?lang=…` links keep working through redirects, and the canonical stops carrying foreign
    content. DEV, `PROPOSED`.
- **LB-LND-003** · `decision` · `CONFIRMED` — **`/uz/` and `/en/` are produced by text substitution.** They are built
  from the ru HTML plus `landing-i18n.js`, with a `<base href="../">` workaround. That couples the server to the
  client's i18n file format (JSON without comments). *Evidence:* `REC:26`, `REC:29`; `UZ:5`.
  - **Proposed fix:** one locale-aware route in `frontend/landing` with message files per locale. Use absolute paths
    and no `<base>`.
  - **URL/SEO impact:** none. The URLs stay `/`, `/uz/`, `/en/` with the same hreflang set.
- **LB-LND-004** · `bug` · `CONFIRMED` (code + prod data snapshot) — **The savings block lists point medians as
  districts.**
  - **Cause:** the prod `pins-rent.json` `medians` has 2 069 entries: 36 district medians and 2 033 point medians with
    codes `pt:<lat>:<lng>` or `pt:<lat>:<lng>:near`, mostly `n = 12`. `setPriceData` keeps every entry with
    `rooms ∈ 1..3` and `median_usd > 0`, and `renderSave` turns each one into a district button labelled with
    `tx("d." + code) || code`.
  - **Effect:** after the 12 real districts, the row shows hundreds of buttons named `pt:41.2011:69.1883`. The point
    entries also bloat the file.
  - **Parity blind spot:** the parity tests compare identical behaviour on both sides, so they cannot catch this.
  - *Evidence:* `LJS:2252-2299`, `LJS:2302-2306`, `LJS:1951-1953`; `FIX/pins-rent.json`.
  - **Proposed fix:**
    - Split the contract into `district_medians` (district code, rooms, median, n) and `point_medians`, or drop point
      medians from the landing feed.
    - Render only codes that have a dictionary name, and test with the real feed.
  - **URL/SEO impact:** none.
- **LB-LND-005** · `decision` · `CONFIRMED` — **Data versioning does not match reality.**
  - **Mismatch:** `DATA_V = "202610171944"` never changes and the comment says the data was «зафиксированные один
    раз», but the files are rewritten several times a day with `max-age=1800`. Clients can show data up to 30 minutes
    old and get no cache-busting.
  - **Dead data and stale comments:** `dots` (1 310 entries) is shipped and unused. HTML comments still point to
    `/api/landing/live` and `/api/landing/pins`.
  - *Evidence:* `LJS:58-72`; `REC:68-70`; `IDX:67`, `IDX:195`, `IDX:295`, `IDX:340`; `FIX/pins-rent.json`.
  - **Proposed fix:** render the numbers server-side (ISR) from a data snapshot that carries `generated_at`. If client
    loading remains, version the URL with the snapshot hash and drop unused fields.
  - **URL/SEO impact:** none. Numbers become crawlable.
- **LB-LND-006** · `decision` · `CONFIRMED` — **Hard-coded numbers are shown as if live.**
  - **Before or without data, the page shows:**
    - `PC_FALLBACK` medians from October 2026;
    - the markup's «$1 440», «175 квартир…» and «Двушка в районе Чиланзар обычно стоит $600»;
    - the example push «Мирабад $600 −23% к рынку»;
    - «Суббота, 11 октября», 9:41.
  - **Text mismatch:** the markup and the JS texts disagree. The markup has «Мы сравниваем с этой ценой каждую
    квартиру…» and «дешевле рынка»; JS has «сравниваем с похожими рядом и в районе…» and «дешевле обычной цены».
    Crawlers and no-JS users see the markup.
  - *Evidence:* `IDX:300-309`, `IDX:214-217`, `IDX:165-166`; `LJS:2246-2250`; `LI18N pc.what`, `pc.weekRest`.
  - **Proposed fix:** server-render from the same snapshot. Hide numeric claims when data is missing, or label example
    content. Keep one source text per key.
  - **URL/SEO impact:** the indexed text becomes truthful and consistent.
- **LB-LND-007** · `decision` · `CONFIRMED` — **Attribution gaps on the landing.**
  1. The desktop QR (`img/qr-bot.svg`) encodes the bare `https://t.me/KvadroAppBot`, so desktop → phone visitors arrive
     without `s_web` and without a visit id.
  2. Listing links from the live map and the pushes are `startapp=l_<id>-web`. They carry neither the `?s=` tag nor
     the visit.
  3. Only `s` or `utm_source` survives; `utm_campaign` and `utm_medium` are dropped.
  4. `stats.js` silently truncates payloads to 49 characters.

  *Evidence:* QR decode (LND-016); `FIX/live.json`; `LJS:26-37`; `STJ:18-21`.
  - **Proposed fix:**
    - Generate the QR with `?start=s_web_qr` (static), or render it per visit with the tagged link.
    - Add a short tag to `startapp` where it fits, e.g. `l_<id>-web-<tag>`. The Mini App parser must stay tolerant:
      today `l_<id>-web` is matched exactly, so a new suffix needs a parser change first (see `05`, TMA-011).
    - Define a payload grammar with a validated maximum length at generation time instead of truncating.
  - **URL/SEO impact:** new payload variants. The bot and the Mini App must accept old and new formats. DEV,
    `PROPOSED`.
- **LB-LND-008** · `decision` · `CONFIRMED` — **Privacy page: one URL, three languages chosen by JS.**
  - **Gaps:** no canonical, hreflang or og. The uz and en texts are hidden, so they cannot be indexed or linked per
    language.
  - **Home link:** uz/en home links go to `/?lang=<lang>`, which triggers LB-LND-002.
  - **Duplication:** the bot's `/privacy` text is a separate copy.
  - *Evidence:* `PRV:1-30`, `PRV:150-177`.
  - **Proposed fix:**
    - Serve `/privacy.html` (ru), `/uz/privacy.html` and `/en/privacy.html`, or locale routes with an `.html`-less
      alias, each server-rendered with hreflang.
    - Answer `/privacy.html?lang=uz|en` with a `301` to the localised URL.
    - Generate both the page and the bot text from one source.
  - **URL/SEO impact:** the old URL keeps working; two new indexable URLs are added to the sitemap.
- **LB-LND-009** · `decision` · `CONFIRMED` — **CSP allows inline scripts by sha256.**
  - **Fragility:** any byte change blocks a script.
  - **Looseness:** `style-src 'unsafe-inline'` and `img-src … https:` (any HTTPS image).
  - **Reports:** go to `/api/csp-report` (endpoint behaviour unknown; see `08-api-inventory.md`).
  - *Evidence:* `REL csp`; `REC:56-57`.
  - **Proposed fix:**
    - Use nonce-based CSP from Next.js middleware, or hashes computed at build.
    - Narrow `img-src` to `'self'`, the media host and `data:`.
    - Keep a report endpoint, using `report-to` with `report-uri` as a fallback.
  - **URL/SEO impact:** none.
- **LB-LND-010** · `decision` · `CONFIRMED` — **Monolithic, unminified assets.** The landing ships `landing.js` (145 KB),
  `landing.css` (102 KB), `miniapp.css` (74 KB) and the two i18n files (43 KB), all unminified and loaded on every
  view. *Evidence:* §1.1.
  - **Proposed fix:**
    - Component split in `frontend/landing` with minification.
    - Load the interactive phone demo lazily.
    - Inline only critical CSS.
  - **URL/SEO impact:** better Core Web Vitals; no URL change.
- **LB-LND-011** · `bug` · `CONFIRMED` — **Inconsistent English place names.**
  - **Mismatch:** landing texts say «Tashkent», «Mirabad», «Chilanzar». The Mini App texts in the demo phone say
    «Toshkent» («Rent · Toshkent») and «Mirobod».
  - **Also in uz:** the same split exists between the two text sets.
  - *Evidence:* `LI18N dist.*`, `city.*`; `MI18N mini`, `city`, `d.*`.
  - **Proposed fix:** one place dictionary (names, cases, slugs) shared by the landing, SEO pages, Mini App and bot.
  - **URL/SEO impact:** none on URLs; consistent anchor texts.
- **LB-LND-012** · `decision` · `CONFIRMED` — **Unsigned photo copies outside the media policy.**
  - **What:** `img/snap/<id>.webp` holds unsigned copies of channel photos (316 in the snapshot), outside the signed
    `/media` policy and outside the privacy promise («копии фото — до 30 дней», removal on takedown).
  - **Partial cover:** robots blocks them, but they stay publicly fetchable.
  - *Evidence:* `FIX/pins-*.json`; `$KVADRO_ROOT/demo/landing/site/robots.txt:6-8`; `PRV:66`. Related: LB-API-054 in
    `02-legacy-backend-audit.md`.
  - **Proposed fix:** serve landing photos through the media pipeline: signed or short-lived URLs, purged on takedown
    and withdrawal. Regenerate the snapshot without withdrawn listings.
  - **URL/SEO impact:** `/img/snap/*` disappears; nothing indexable depends on it.
- **LB-LND-013** · `decision` · `UNVERIFIED` — **Unknown paths answer with JSON.** Per the local server that mirrors
  prod, an unknown path on the landing host answers `404` with the JSON body `{"detail":"Not Found"}` rather than an
  HTML page. *Evidence:* `SRV:1-3`, `SRV:62-66`. *Check:* Q-LND-006.
  - **Proposed fix:** a localised HTML 404 with `noindex` (the same component as LND-055) for every unknown path; JSON
    only under `/api/`.
  - **URL/SEO impact:** soft-error handling improves; no URL change.
- **LB-LND-014** · `decision` · `CONFIRMED` — **The web manifest is ru-only** («kvadro² — вся аренда из Telegram») and
  serves every locale. *Evidence:* `$KVADRO_ROOT/demo/landing/site/site.webmanifest`.
  - **Proposed fix:** per-locale manifests, or a language-neutral name.
  - **URL/SEO impact:** none.
- **LB-LND-015** · `decision` · `CONFIRMED` — **Debug switches are public on prod:** `?bench=1`, `?debug=vh`,
  `?touch=1`, `?glass=off`, `?motion=raw`, `?anim=` (LND-037).
  - **Proposed fix:** keep only what the product needs (possibly `?v=`). Move the rest behind a development flag. Any
    URL carrying them must still render the page.
  - **URL/SEO impact:** none; these URLs are canonicalised to the page anyway.
- **LB-LND-016** · `decision` · `DOCUMENTED_ONLY` — **The page depends on Cloudflare Email Obfuscation** for the
  `mailto:` links of `privacy.html` and the methodology page. Cloudflare injects a script and `/cdn-cgi/` links, which
  differs from the origin markup and only works behind Cloudflare. *Evidence:* `REC:85-87`; `SEO:378`.
  - **Proposed fix:** render a plain contact link (support bot first, mailbox second) and do not rely on edge
    rewriting.
  - **URL/SEO impact:** `/cdn-cgi/l/email-protection#…` URLs disappear; nothing depends on them.

### 4.2 SEO pages — `LB-SEO`

- **LB-SEO-001** · `bug` · `DOCUMENTED_ONLY` — **Inconsistent number formatting.**
  - **Title:** groups digits with a space (`4 337`), even in English (`5 062`).
  - **Description and body:** no separator (`4337`).

  *Evidence:* `SEO:426-427`.
  - **Proposed fix:** one locale-aware number formatter: ru and uz use a narrow no-break space, en a comma. Use it in
    the title, description and body, as on the landing (BR-LND-006).
  - **URL/SEO impact:** titles and snippets change text; no URL change.
- **LB-SEO-002** · `bug` · `DOCUMENTED_ONLY` — **Wrong plural agreement:** «168 квартир … 81 новых за неделю» should be
  «81 новая». *Evidence:* `SEO:428`.
  - **Proposed fix:** ICU plural rules per locale (ru three forms, uz one, en two) for every counted noun and
    adjective.
  - **URL/SEO impact:** snippet text only.
- **LB-SEO-003** · `bug` · `DOCUMENTED_ONLY` — **Language versions disagree on the data.** The same place showed
  different medians in different languages (2-room Yunusobod $615 / $630 / $640), because each version was rendered at
  a different time behind a 5-minute CDN cache. *Evidence:* `SEO:429-431`.
  - **Proposed fix:** render all locales from one data snapshot id. Revalidate the three language versions of a slice
    together by tag.
  - **URL/SEO impact:** consistent numbers across hreflang alternates.
- **LB-SEO-004** · `bug` · `DOCUMENTED_ONLY` — **`?page=N` duplicates.** It returns the same page with `200` and no
  `noindex`, so the duplicate is closed only by the canonical. *Evidence:* `SEO:432`.
  - **Proposed fix:** a `301` to the parameter-less URL for known junk parameters (`page`). Keep tracking parameters
    (`utm_*`, `s`) with `200` and the canonical, so attribution links still land.
  - **URL/SEO impact:** fewer duplicate crawls; inbound `?page=` links are preserved through the redirect. DEV,
    `PROPOSED`.
- **LB-SEO-005** · `bug` · `DOCUMENTED_ONLY` — **The new-builds CTA points to a missing radar step.** The CTA tells
  users to pick «Новостройка» in the radar, but the bot's radar wizard has no such step; the filter exists only in the
  Mini App (`market: new`). *Evidence:* `SEO:433-434`; `BOT` §6.4.
  - **Proposed fix:** either add the new-build choice to the bot radar wizard (preferred if the radar covers new
    builds), or change the CTA to open the Mini App with the new-build filter.
  - **URL/SEO impact:** text only. Coordinate with `04`.
- **LB-SEO-006** · `bug` · `DOCUMENTED_ONLY` — **Inconsistent photo error codes.** A missing signature returns `422`
  with a FastAPI validation body; a wrong or expired signature returns `404`. *Evidence:* `SEO:435`.
  - **Proposed fix:** answer every invalid or missing signature with the same `404` (or `403`) and no framework
    validation details.
  - **URL/SEO impact:** none (`/media/` is disallowed).
- **LB-SEO-007** · `decision` · `DOCUMENTED_ONLY` — **Quarter names differ by script.** uz pages write quarter names in
  Latin («Minor (C-6)»), ru pages in Cyrillic («Минор (Ц-6)»). This is expected, but the place dictionary must hold
  per-language names, including the letter in codes like `C-6` / `Ц-6`, plus case forms. *Evidence:* `SEO:436`;
  BR-SEO-009.
  - **Proposed fix:** a dictionary entry per place with `name`, `name_cases` (ru: prepositional and others),
    `name_uz_latn` and `name_en`. The slug stays language-neutral.
  - **URL/SEO impact:** none.
- **LB-SEO-008** · `decision` · `DOCUMENTED_ONLY` — **Mixed-case paths answer `404`** (`/ARENDA/…`), so inbound links
  with wrong case lose their equity. *Evidence:* `SEO:120`.
  - **Proposed fix:** a `301` to the lower-case canonical when the lower-cased path resolves; `404` otherwise.
  - **URL/SEO impact:** recovers mistyped inbound links. DEV, `PROPOSED`.
- **LB-SEO-009** · `decision` · `DOCUMENTED_ONLY` — **A slug from another language answers `404`** (`/uz/arenda/…`,
  `/en/prodazha/…`). *Evidence:* `SEO:126`.
  - **Proposed fix:** a `301` to the same page with the slugs of the requested language prefix (`/uz/arenda/x/` →
    `/uz/ijara/x/`).
  - **URL/SEO impact:** recovers hand-edited or translated links. DEV, `PROPOSED`.
- **LB-SEO-010** · `decision` · `DOCUMENTED_ONLY` — **`Last-Modified` is the render time, not the data time.** It
  changes every 5 minutes, so conditional requests never hit, and it disagrees with sitemap `lastmod`. *Evidence:*
  `SEO:37`, `SEO:376`.
  - **Proposed fix:** set `Last-Modified` and `ETag` from the slice's data snapshot. Use the same value for sitemap
    `lastmod`.
  - **URL/SEO impact:** more efficient recrawl; truthful freshness signals.
- **LB-SEO-011** · `decision` · `DOCUMENTED_ONLY` — **The bot payload grammar is ad hoc.**
  - **Lost detail:** the metro hub and all 35 stations share `s_seo_metro`, so the station is lost. Quarters drop the
    city.
  - **Placement:** the language sits in the middle (`s_seo_uz_…`).
  - **Length:** nothing bounds the length; `stats.js` truncates at 49 characters before `--v`.

  *Evidence:* `SEO:353-371`; `STJ:20`.
  - **Proposed fix:**
    - Define the grammar formally: `s_seo_<lang|ru>_<section>_<city>[_<district>|_kv_<quarter>|_m_<station>][_<N>k][_owners]`
      with a validated ≤ 49-character budget.
    - Keep accepting every legacy form in the bot.
  - **URL/SEO impact:** new payloads only; old links remain valid. DEV, `PROPOSED`.
- **LB-SEO-012** · `decision` · `UNVERIFIED` — **Thin pages and index coverage.**
  - **Coverage:** on 2026-11-05 only 94 of about 450 site pages were indexed; 349 were «обнаружена, не
    проиндексирована».
  - **Thin pages:** they stay reachable as `200 noindex,follow`, and the interlinking may still point to them.
  - *Evidence:* `IDX:379-380`; `SEO:123`, `SEO:144-145`. *Check:* Q-SEO-017.
  - **Proposed fix:**
    - Review Search Console before cut-over.
    - Link only to indexable slices.
    - Consider merging rarely populated room pages into the district page.
    - Keep the 200/noindex contract for direct visits.
  - **URL/SEO impact:** crawl budget concentrates on indexable pages. No existing URL is removed.

## 5. Open questions

### 5.1 Landing — `Q-LND`

| ID | Question | Check that closes it |
| -- | -------- | -------------------- |
| Q-LND-001 | Who stamps `?v=` on JS/CSS in prod (deploy or server), and is anything else derived from file hashes (`REC:58-59`, `REC:95`)? | Ask the legacy team; otherwise irrelevant once the new build owns hashing. |
| Q-LND-002 | Schedule and generator of `data/*.json` and `img/snap/*` (`scripts/landing_snapshot.py`, `app/api/landing.py`); do `/api/landing/live` and `/api/landing/pins` exist? (also `08-api-inventory.md`, `GET /api/landing/live`) | Legacy team; or watch `Last-Modified` of the three data files on prod for 48 h (team action, not from this repo). |
| Q-LND-003 | Does a JS-rendering crawler (Google) see English content on `/` (LB-LND-002)? | Search Console URL Inspection → rendered HTML of `/`; the language of the Google snippet for `kvadro.app`. |
| Q-LND-004 | How the bot stores and uses `s_web[_<tag>]` and `--v<visit>` (and `s_seo_*`). Where is `docs/analytics.md`, which `landing.js:27` cites but our material lacks? | Legacy team; a `start` payload export or attribution report from the bot DB / PostHog. |
| Q-LND-005 | Which `?s=` / `utm_source` tags are in circulation (ads, Instagram bio, partner posts)? | PostHog: distinct `$current_url` query values on `kvadro.app`; bot attribution table. |
| Q-LND-006 | Prod response for unknown landing paths (JSON `404` or HTML) and for `/favicon.ico` (not among the 35 mirrored files). | `curl -sI https://kvadro.app/does-not-exist`, `…/favicon.ico` (team action). |
| Q-LND-007 | Full landing response headers: HTML `Cache-Control`, HSTS, `Referrer-Policy`; static assets and data `max-age` (1 800 observed for data). | `curl -sI` on `/`, `/landing.js?v=…`, `/data/live.json` (team action). |
| Q-LND-008 | PostHog continuity: which project, dashboards and insights depend on `site`, `visit`, `env` and on landing autocapture selectors (`data-l` keys, classes)? | PostHog project review with the owner before the new landing changes markup. |
| Q-LND-009 | Format of the `web_app` button URLs in already-sent bot messages (`BOT:657` 🔶 «URL с id объявления») and whether they survive a domain change of `app.kvadro.app` (redirect plus `#tgWebAppData` fragment). | Legacy team; inspect a sent card's `reply_markup` in a test chat; test a `301` with a staging Mini App. |
| Q-LND-010 | One definition of «below market» for HOMI: landing «≥ 20 %» (`bargains_week`, savings) vs tone `good` at ≥ 10 % (BR-SEO-014); HOMI's own brief says «about 20 %». | Product decision; record it in `07-business-rules.md`. |
| Q-LND-011 | Is `?v=1` / `?v=2` (or any debug parameter) used in shared links or ads? | PostHog `$current_url` query scan. |

### 5.2 SEO pages — `Q-SEO`

| ID | Question | Check that closes it |
| -- | -------- | -------------------- |
| Q-SEO-001 | Full content of all pages. Only 25 of 1 008 were sampled; `area.css`, the SVGs and the uz/en texts are not mirrored. The sitemap count also needs re-checking (1 012 vs `REC:62` «около 1020»). | Crawl every URL in `sitemap.xml` plus the two CSVs, `area.css` and `og-*.jpg` before cut-over. Store them as the parity baseline (read-only GETs at a polite rate; team action). |
| Q-SEO-002 | Exact noindex threshold: is a page with exactly 10 listings indexed? (BR-SEO-035) | Find a slice with 10 listings in the crawl, or ask the legacy team. |
| Q-SEO-003 | How sitemap `lastmod` is computed (BR-SEO-034). | Compare `lastmod` with the newest card age across crawled pages; legacy team. |
| Q-SEO-004 | uz and en `<title>` / `description` templates and block texts for every page type (verified on 4 pages only). | From the Q-SEO-001 crawl: extract the head of each type × language. |
| Q-SEO-005 | Which PostHog events fire on SEO pages (LND-063). | Browser devtools on one district page: network calls to `eu.i.posthog.com`. |
| Q-SEO-006 | How a listing is attached to a quarter, landmark or station (Gemini and geocoding; BR-SEO-020/021). | Legacy backend source or team; otherwise define it anew and mark a DEV. |
| Q-SEO-007 | Photo signature algorithm and `e` issuance (same as Q-API-024). Do already-rendered legacy pages need legacy-valid signatures after cut-over? | Legacy team. Signatures expire in ≤ 2 days, so a short overlap is enough. |
| Q-SEO-008 | What makes a combination "exist" (dictionary vs data)? What happens when a slice drops below the threshold or to 0: `200 noindex` or `404`? (BR-SEO-036) | Watch a shrinking slice over days; legacy team. |
| Q-SEO-009 | Do CSV exports exist under `/uz/…` and `/en/…` (`/en/rent/index/kvadro-rent-index.csv`)? Which CSV URL do uz/en pages link? | From the crawl. |
| Q-SEO-010 | Is `metro` untranslated in uz/en (`/uz/ijara/tashkent/metro/`, `/en/rent/tashkent/metro/`)? Station slugs are the same in all languages. | `sitemap.xml` grep. |
| Q-SEO-011 | Does the header language switch link to the alternate of the same page? | From the crawl. |
| Q-SEO-012 | How the bot answers `s_seo_*` payloads (greeting, stored attribution); `BOT:997-1017` lists only `s_web`, `s_friend`, `s_<src>--l<id>`. | Send `/start s_seo_tashkent` to the prod bot from a test account (team action), or legacy team. |
| Q-SEO-013 | Index history: the rent-index months and weeks and the sale-price months since 2026-10-01 must not change after migration (BR-SEO-017). Can the new backend recompute them identically from migrated data, or must the series be migrated as data? | Archive both CSVs at cut-over; compare a recompute in staging; decide in `14-data-migration-plan.md`. |
| Q-SEO-014 | Source and update process of the salary figure (Nationalstat release, manual entry?), and rounding of «% зарплаты». | Legacy team; methodology text. |
| Q-SEO-015 | Versions and licences of the open data (`opendata.tashkent.uz/data/132`, `/134`), the school rating set and OSM school extraction. | Legacy team; the open-data portal pages. |
| Q-SEO-016 | Sort definitions (`below` = ascending `delta`?, tie-breaks), the date basis of «новых за 7 дней» (first seen or posted), and the rules of the district-rank sentence. | Legacy team; compare orders in the crawl. |
| Q-SEO-017 | Search Console coverage now: indexed vs «discovered – not indexed» per page type; are thin pages linked from indexable ones? (LB-SEO-012) | Search Console export by the owner; the crawl's link graph. |
| Q-SEO-018 | Is the SEO «near» median and badge the same calculation as the Mini App `median_*` (BR-SEO-033)? | For a few listings, compare the SEO card badge with `GET /api/listings/:id` `median_*` (team action). |
| Q-SEO-019 | Are channels read via `t.me/s/<channel>` (BR-SEO-037)? Also `about.md` §11 item 3. | Legacy team. |
| Q-SEO-020 | Template of the Tashkent region city page. Are `chirchiq`, `olmaliq`, `zangiota`, `qibray`, `toshkent-tumani` districts or towns in the place model? (tag `s_seo_tashkent-region_chirchiq`) | From the crawl; legacy team. |
| Q-SEO-021 | Which numbers in the methodology are dynamic («217 каналов», dates)? | From the crawl at two dates. |

## 6. Public URL contract

### 6.1 Rules for the cut-over

- **Domain.** Whether the product stays on `kvadro.app` or moves to `homi.uz` is open (Q-SYS-006).
  - **If the domain changes:** every `kvadro.app` URL marked "301" below needs a path-for-path `301` (query string
    preserved) for at least the life of search caches and external citations (≥ 12 months). The sitemap moves too,
    with Search Console change-of-address.
  - **If it stays:** the new landing app must serve the same paths.
- **Telegram links cannot be redirected.** `t.me/KvadroAppBot?start=…` and `?startapp=…` work only while the bot keeps
  its username and its Main Mini App. Keep `@KvadroAppBot`, or keep it alive as a forwarder (`ABT:406-441`).
- **Payload tolerance.** The new bot and Mini App accept every legacy `start` and `startapp` grammar below. They also
  accept unknown suffixes without failing: a greeting, and the listing if the id is valid.
- **Owners after migration:**
  - `landing app` = `frontend/landing` (Next.js);
  - `app` = `frontend/app` (Mini App);
  - `backend` = `backend/` (Laravel: API, media, CSV/data generation, sitemap data);
  - `bot` = the Telegram module of `backend/`;
  - `external` = not ours.

### 6.2 URL table

The machine-readable copy is [`data/public-urls.json`](data/public-urls.json). "Redirect" means what is needed if the
domain changes. "Must keep" means the pattern has to keep resolving after cut-over.

| ID | Pattern | Example | Kind | Lang | Count | Owner | Redirect | SEO risk | Must keep | Status |
| -- | ------- | ------- | ---- | ---- | ----: | ----- | -------- | -------- | :-------: | ------ |
| URL-001 | `/` | `https://kvadro.app/` | landing | ru | 1 | landing app | 301 | high (home, x-default) | yes | CONFIRMED |
| URL-002 | `/uz/` | `https://kvadro.app/uz/` | landing | uz | 1 | landing app | 301 | high | yes | CONFIRMED |
| URL-003 | `/en/` | `https://kvadro.app/en/` | landing | en | 1 | landing app | 301 | high | yes | CONFIRMED |
| URL-004 | `/uz`, `/en` → `308` | `/uz` → `/uz/` | landing | uz, en | 2 | landing app | 301 | low | yes | DOCUMENTED_ONLY |
| URL-005 | `/index.html` → `301 /` | `/index.html?s=x` → `/?s=x` | landing | ru | 1 | landing app | 301 | low | yes | DOCUMENTED_ONLY |
| URL-006 | landing `?s=<tag>` / `?utm_source=<tag>` | `/?s=insta_1` | landing | all | open set | landing app | 301 with query | none (canonical) | yes | CONFIRMED |
| URL-007 | landing `?lang=ru\|uz\|en` | `/?lang=uz` | landing | all | 3 | landing app | 301 → `/uz/` (LB-LND-002) | medium (duplicate today) | yes | CONFIRMED |
| URL-008 | landing `?v=1\|2` | `/?v=2` | landing | all | 2 | landing app | 301 with query | none | no | CONFIRMED |
| URL-009 | landing debug parameters (`motion`, `touch`, `glass`, `anim`, `bench`, `off`, `debug`) | `/?bench=1&off=anim` | landing | all | 7 | landing app | 301 with query | none | no | CONFIRMED |
| URL-010 | `/privacy.html[?lang=uz\|en]` | `/privacy.html?lang=uz` | landing | ru, uz, en | 1 (+2 variants) | landing app | 301 | low | yes | CONFIRMED |
| URL-011 | `/robots.txt` | `/robots.txt` | other | — | 1 | landing app | 301 (new file on the new host) | high | yes | CONFIRMED |
| URL-012 | `/sitemap.xml` | `/sitemap.xml` | seo | — | 1 (1 012 entries) | landing app (data from backend) | 301 + change of address | high | yes | DOCUMENTED_ONLY |
| URL-013 | `/site.webmanifest` | — | asset | — | 1 | landing app | 301 | none | no | CONFIRMED |
| URL-014 | icons `/logo.svg`, `/favicon-32.png`, `/apple-touch-icon.png`, `/icon-192.png`, `/icon-512.png` | `/icon-512.png` (JSON-LD logo) | asset | — | 5 | landing app | 301 | low | yes | CONFIRMED |
| URL-015 | `/favicon.ico` | — | asset | — | 1 | landing app | 301 | none | no | UNVERIFIED |
| URL-016 | `/og-ru.jpg`, `/og-uz.jpg`, `/og-en.jpg` | `/og-uz.jpg` | asset | per file | 3 | landing app | 301 | low (cached link previews) | yes | CONFIRMED |
| URL-017 | landing JS/CSS with `?v=<10 hex>` | `/landing.js?v=7385730cf1` | asset | — | 6 | landing app | none (replaced) | none | no | CONFIRMED |
| URL-018 | landing static images (`/map-tashkent.webp`, `/img/*.webp\|svg`) | `/img/qr-bot.svg` | asset | — | 15 | landing app | none (replaced) | none | no | CONFIRMED |
| URL-019 | `/data/{live,pins-rent,pins-sale}.json?v=<DATA_V>` | `/data/live.json?v=202610171944` | asset | — | 3 | backend → landing app | none | none | no | CONFIRMED |
| URL-020 | `/img/snap/<listing_id>.webp` | `/img/snap/<id>.webp` | media | — | ≈ 316 (rotating) | backend (media) | none (dropped, LB-LND-012) | none (disallowed) | no | CONFIRMED |
| URL-021 | `POST /api/csp-report` | — | other | — | 1 | backend | none | none | no (until legacy pages stop) | DOCUMENTED_ONLY |
| URL-022 | `/cdn-cgi/l/email-protection#<hex>` | — | other | — | 2 pages | external (Cloudflare) | none | none | no | DOCUMENTED_ONLY |
| URL-023 | section hub `/{arenda\|prodazha\|novostrojki}/` | `/uz/sotuv/`, `/en/new-builds/` | seo | ru, uz, en | 9 | landing app | 301 | high | yes | DOCUMENTED_ONLY |
| URL-024 | city `/{section}/{city}/` | `/en/rent/kokand/` | seo | ru, uz, en | 54 | landing app | 301 | high | yes | DOCUMENTED_ONLY |
| URL-025 | city + rooms `/{section}/{city}/{N}-{komnatnye\|xonali\|room}/` | `/arenda/tashkent/2-komnatnye/` | seo | ru, uz, en | 174 | landing app | 301 | high | yes | DOCUMENTED_ONLY |
| URL-026 | district `/{section}/{city}/{district}/` | `/uz/ijara/tashkent/yunusobod/` | seo | ru, uz, en | 138 | landing app | 301 | high | yes | DOCUMENTED_ONLY |
| URL-027 | district + rooms `/{section}/{city}/{district}/{N}-…/` | `/en/rent/tashkent/yunusobod/2-room/` | seo | ru, uz, en | 372 | landing app | 301 | high | yes | DOCUMENTED_ONLY |
| URL-028 | quarter `/{rent}/tashkent/{district}/{quarter}/` | `/arenda/tashkent/yunusobod/minor/` | seo | ru, uz, en | 135 | landing app | 301 | medium | yes | DOCUMENTED_ONLY |
| URL-029 | metro hub `/{rent}/tashkent/metro/` | `/arenda/tashkent/metro/` | seo | ru, uz, en | 3 | landing app | 301 | medium | yes | DOCUMENTED_ONLY |
| URL-030 | metro station `/{rent}/tashkent/metro/{station}/` | `/arenda/tashkent/metro/abdulla-qodiriy/` | seo | ru, uz, en | 105 | landing app | 301 | medium | yes | DOCUMENTED_ONLY |
| URL-031 | by owner, city `/{rent}/tashkent/{bez-posrednikov\|maklersiz\|by-owner}/` | `/en/rent/tashkent/by-owner/` | seo | ru, uz, en | 3 | landing app | 301 | medium | yes | DOCUMENTED_ONLY |
| URL-032 | by owner, district `/{rent}/tashkent/{district}/{by-owner}/` | `/arenda/tashkent/sergeli/bez-posrednikov/` | seo | ru, uz, en | 6 | landing app | 301 | medium | yes | DOCUMENTED_ONLY |
| URL-033 | rent index `/{arenda\|uz/ijara}/indeks/`, `/en/rent/index/` | `/arenda/indeks/` | seo | ru, uz, en | 3 | landing app | 301 | high (citations) | yes | DOCUMENTED_ONLY |
| URL-034 | methodology `/{arenda\|uz/ijara}/metodika/`, `/en/rent/methodology/` | `/arenda/metodika/` | seo | ru, uz, en | 3 | landing app | 301 | medium | yes | DOCUMENTED_ONLY |
| URL-035 | sale prices `/prodazha/ceny/`, `/uz/sotuv/narxlar/`, `/en/sale/prices/` | `/prodazha/ceny/` | seo | ru, uz, en | 3 | landing app | 301 | high (citations) | yes | DOCUMENTED_ONLY |
| URL-036 | thin slices: the same patterns, `200 noindex,follow`, not in the sitemap | (data-driven) | seo | ru, uz, en | unknown | landing app | 301 | low | yes | DOCUMENTED_ONLY |
| URL-037 | `?sort=cheap\|expensive\|below#cards` on any SEO page | `/arenda/tashkent/?sort=cheap#cards` | seo | ru, uz, en | 3 per page | landing app | 301 with query | low (noindex, nofollow) | yes | DOCUMENTED_ONLY |
| URL-038 | ignored parameters (`?page=N`, `utm_*`, others) on SEO pages | `/arenda/tashkent/?page=2` | seo | ru, uz, en | open set | landing app | 301 with query | low (canonical; LB-SEO-004) | yes | DOCUMENTED_ONLY |
| URL-039 | SEO path without the trailing slash → `308` | `/arenda/tashkent` | seo | ru, uz, en | 1 008 | landing app | 301 to the slashed URL | low | yes | DOCUMENTED_ONLY |
| URL-040 | `/arenda/indeks/kvadro-rent-index.csv` | — | csv | ru (uz/en? Q-SEO-009) | 1 | backend (or landing app route) | 301 | medium (external citations) | yes | DOCUMENTED_ONLY |
| URL-041 | `/prodazha/ceny/kvadro-sale-prices.csv` | — | csv | ru (uz/en? Q-SEO-009) | 1 | backend (or landing app route) | 301 | medium | yes | DOCUMENTED_ONLY |
| URL-042 | `/media/<listing_id>/<n>.jpg?e=<unix>&s=<32 hex>` (kvadro.app and app.kvadro.app) | `/media/<id>/0.jpg?e=…&s=…` | media | — | per photo | backend | none (expires ≤ 2 days); keep the old host during the window | none (disallowed) | yes (pattern) | DOCUMENTED_ONLY |
| URL-043 | `/media/<listing_id>/<n>.s.jpg?e=…&s=…` | — | media | — | per photo | backend | as URL-042 | none | yes (pattern) | DOCUMENTED_ONLY |
| URL-044 | `/call/<token>` (Mini App host) | — | call | — | per call (TTL ≈ 10 min) | backend | none | none | yes (during the compatibility window) | DOCUMENTED_ONLY |
| URL-045 | `https://t.me/KvadroAppBot` (no payload) | QR, JSON-LD `sameAs`, no-JS button href | bot-deeplink | — | 1 | bot | n/a (Telegram) | none | yes | CONFIRMED |
| URL-046 | `t.me/KvadroAppBot?start=s_web[_<tag>][--v<visit>]` | `?start=s_web_insta_1--v<10 chars>` | bot-deeplink | — | open set | bot | n/a | none | yes | CONFIRMED |
| URL-047 | `t.me/KvadroAppBot?start=s_seo[_<lang>][_<slice>][--v<visit>]` | `?start=s_seo_uz_tashkent_yunusobod` | bot-deeplink | ru, uz, en | ≈ 1 000 tags | bot | n/a | none | yes | DOCUMENTED_ONLY |
| URL-048 | `t.me/KvadroAppBot?start=s_<source>--l<id>` | `?start=s_web--l<id>` | bot-deeplink | — | open set | bot | n/a | none | yes | CONFIRMED |
| URL-049 | `t.me/KvadroAppBot?start=s_friend` | — | bot-deeplink | — | 1 | bot | n/a | none | yes | CONFIRMED |
| URL-050 | `https://t.me/KvadroSupportBot` | footer «Поддержка» | bot-deeplink | — | 1 | external (support bot; see Q-SYS-003) | n/a | none | yes | CONFIRMED |
| URL-051 | `t.me/KvadroSupportBot?start=l_<id>` | Mini App «Поддержка» on a listing | bot-deeplink | — | per listing | external (support bot) | n/a | none | yes | CONFIRMED |
| URL-052 | `t.me/KvadroAppBot?startapp=l_<id>` | Mini App share | miniapp-deeplink | — | per listing | app | n/a | none | yes | CONFIRMED |
| URL-053 | `t.me/KvadroAppBot?startapp=l_<id>-web` | landing pins and pushes | miniapp-deeplink | — | per listing | app | n/a | none | yes | CONFIRMED |
| URL-054 | `t.me/KvadroAppBot?startapp=l_<id>-seo-<channel>-<post>` | SEO cards | miniapp-deeplink | — | per listing | app | n/a | none | yes | DOCUMENTED_ONLY |
| URL-055 | `t.me/KvadroAppBot?startapp=l_<id>-(fb\|tg\|ig)<1-4 digits>` | `?startapp=l_<id>-fb12` | miniapp-deeplink | — | per campaign | app | n/a | none | yes | CONFIRMED |
| URL-056 | `t.me/KvadroAppBot?startapp=l_<id>-<channel>-<post>` (no `seo`) | — | miniapp-deeplink | — | unknown | app | n/a | none | yes (parser tolerance) | UNVERIFIED |
| URL-057 | Mini App origin `https://app.kvadro.app/[?listing=<id>][?news=<code>]` (menu button, `web_app` buttons in sent messages) | `?listing=<id>` | miniapp-deeplink | — | 1 origin | app | keep the host or redirect with fragment (Q-LND-009) | none | yes | CONFIRMED |
| URL-058 | `https://t.me/share/url?url=<encoded startapp or start link>&text=<text>` | Mini App share fallback, «рассказать друзьям» | share | — | per share | external (Telegram), built by app | n/a | none | no | CONFIRMED |
| URL-059 | `https://t.me/<channel>/<post>` (source post) | bot «🔗 Открыть оригинал», Mini App no-access screen | other | — | per listing | external (emitted by bot and app) | n/a | none | yes (keep emitting) | CONFIRMED |
| URL-060 | `https://www.instagram.com/kvadro.app/` | landing and SEO footers | other | — | 1 | external | n/a | none | no | CONFIRMED |
| URL-061 | `mailto:` project mailbox | privacy, methodology, JSON-LD | other | — | 1 | external | n/a | none | no | CONFIRMED |
| URL-062 | `https://www.openstreetmap.org/copyright` | landing footer «Карта: © OpenStreetMap» | other | — | 1 | external | n/a | none | yes (licence attribution) | CONFIRMED |

Sources per row are in `data/public-urls.json`. The SEO counts add up per language to 3 + 18 + 58 + 46 + 124 + 45 + 1 +
35 + 1 + 2 + 1 + 1 + 1 = 336 (URL-023 – URL-035).

### 6.3 Deep-link grammar in one place

```text
Bot   https://t.me/KvadroAppBot?start=<payload>      payload ≤ 64 chars, [A-Za-z0-9_-]
  s_web                                   landing, no tag                        (BR-LND-001)
  s_web_<tag>                             landing ?s= / ?utm_source=, tag [a-z0-9_-]{1,40}
  s_seo[_uz|_en][_<slice>]                SEO CTA                                (BR-SEO-025)
  <any s_… above>--v<visit>               visit suffix, visit [a-z0-9]{10}; base cut to 49 chars (BR-LND-003)
  s_<source>--l<id>                       Mini App no-access screen → «Квартира, по которой вы пришли…» (BOT:1011-1017)
  s_friend                                Mini App «Нашли жильё?» share
  l_<id>                                  not a bot format: plain greeting (BOT:1009)

Mini App https://t.me/KvadroAppBot?startapp=<param>
  l_<id>                                  share → source "share"                  (SP:30-41)
  l_<id>-web                              landing → "web"
  l_<id>-(fb|tg|ig)<1-4 digits>           ad campaign → campaign code
  l_<id>-seo[-…]                          SEO → "seo"
  l_<id>-[seo-]<channel 4-32>-<post 1-12> → source post t.me/<channel>/<post> on the no-access screen
  (+ page query ?listing=<id>, ?news=<code> on the Mini App URL itself — 05, TMA-012)

Support https://t.me/KvadroSupportBot[?start=l_<id>]
```

## 7. Summary and counts

### 7.1 Items in this document by kind and status

| Kind | Total | CONFIRMED | DOCUMENTED_ONLY | UNVERIFIED | DEPRECATED_CANDIDATE |
| ---- | ----: | --------: | --------------: | ---------: | -------------------: |
| `LND` landing (001–039) | 39 | 37 | 2 | 0 | 0 |
| `LND` SEO (040–064) | 25 | 0 | 24 | 1 | 0 |
| — of which SEO page types (042–055) | 14 | 0 | 14 | 0 | 0 |
| `BR-LND` | 23 | 23 | 0 | 0 | 0 |
| `BR-SEO` | 38 | 0 | 32 | 6 | 0 |
| `LB-LND` (bug 3, decision 13) | 16 | 14 | 1 | 1 | 0 |
| `LB-SEO` (bug 6, decision 6) | 12 | 0 | 11 | 1 | 0 |
| `Q-LND` | 11 | — | — | — | — |
| `Q-SEO` | 21 | — | — | — | — |
| `URL` | 62 | 31 | 29 | 2 | 0 |

The `URL` rows by kind are:

| Kind | URLs |
| ---- | ---: |
| landing | 10 |
| seo | 18 |
| csv | 2 |
| asset | 7 |
| media | 3 |
| call | 1 |
| bot-deeplink | 7 |
| miniapp-deeplink | 6 |
| share | 1 |
| other | 7 |

`must_keep: true` applies to 49 of the 62.

### 7.2 Source totals vs this document

| Source item | Counted in source | Here |
| ----------- | ----------------- | ---- |
| Files in `site/` | 35 (`REC:91`, `REL fileCount`) | all mapped in §1.1; served paths in URL-001 – URL-020 |
| `index.html` sections + chrome | 6 `<section>` + header + footer row + 4 footer navs + QR aside + dock | LND-004 – LND-020 (blocks), LND-001 (page) |
| `landing.js` sections (`REC:38-50`) | 9 | LND-008 – LND-032 and BR-LND-001 – BR-LND-023 (every section has at least one item) |
| Landing text keys | 106 × 3 (`LI18N`), 188 × 3 (`MI18N`) | LND-028; texts quoted where they carry rules |
| Parity scenarios | 40 (`SCN`) | §1.6, all 40 grouped |
| Landing data files | 3 JSON + 316 photos (fixture 319) | §1.5, URL-019, URL-020 |
| `RECOVERY.md` §5 quirks | 2 | LB-LND-001, LB-LND-016 |
| SEO page types (`SEO:189-205` template rows) | 13 + 404 page | LND-042 – LND-055 (14) |
| SEO pages | 336 per language, 1 008 total; sitemap 1 012 | §2.1; URL-023 – URL-035 sum to 336 per language |
| SEO URL patterns (`SEO:75-88`) | 13 page patterns + 2 CSV | URL-023 – URL-035, URL-040, URL-041; plus routing variants URL-036 – URL-039 |
| Service-slug translations (`SEO:92-101`) | 8 | §2.2 (+ `metro`, Q-SEO-010) |
| Routing rules (`SEO:117-126`) | 8 | BR-SEO-004 |
| `<title>` templates (`SEO:149-160`) | 10 | BR-SEO-009 |
| Calculation subsections (`SEO:244-323`) | 9 | BR-SEO-010 – BR-SEO-021, BR-SEO-029, BR-SEO-033, BR-SEO-037 |
| CSV exports (`SEO:325-345`) | 2 | BR-SEO-024, URL-040, URL-041 |
| Bot tag table (`SEO:356-368`) | 11 rows | BR-SEO-025 |
| `seo-pages.md` §12 quirks | 7 | LB-SEO-001 – LB-SEO-007 |
| `seo-pages.md` §13 unverified | 8 | Q-SEO-001 (2 rows), Q-SEO-002, Q-SEO-003, Q-SEO-005, Q-SEO-006, Q-SEO-007, Q-SEO-008 |
| 🔶 items in `seo-pages.md` | 7 (`:136`, `:138`, `:247`, `:287`, `:387`, `:390`, `:450`) + §11 recommendations | BR-SEO-033 – BR-SEO-038 (+ Q), §2.5 |
| `about.md` §5.10 link table | 5 | URL-046, URL-048, URL-049, URL-052 – URL-055, URL-057 |
| `telegram-bot.md` §10 payloads | 6 | §6.3, URL-046 – URL-049 |
| Link builders in `demo/app/src` (`rg startapp\|start_param\|t\.me/`) | 9 constructions | URL-045, URL-048 – URL-059 |

### 7.3 Not covered here

- **Mini App API resources.** Behaviour of `/media`, `/call`, `/api/csp-report` and `/api/landing/*` beyond their
  public URL shape belongs to `08-api-inventory.md`.
- **Bot replies.** How the bot answers each payload belongs to `04`.
- **Visual details.** Pixel-level design (colours, spacing, every CSS animation keyframe) is not itemised. The parity
  scenarios (§1.6) and the mirrored `landing.css` / `miniapp.css` are the visual reference.
- **SEO page content.** The SEO page HTML, `area.css`, the SVG charts and the uz/en texts of most templates are
  unavailable until the crawl in Q-SEO-001.
- **Live production.** Nothing was fetched from production.
