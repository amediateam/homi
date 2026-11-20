# KV-FE-108 — Landing page frame: header, language menu, final block, footer, QR, dock

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Frontend (track: development) |
| Complexity | M |
| Milestone | FE-3b (M9, stage S4) |
| Feature IDs | F-LANDING-001, F-LANDING-004, F-LANDING-005, F-LANDING-006 |
| Dependencies | KV-FE-100, KV-FE-102, KV-FE-103, KV-FE-106; decisions: DEV-038, DEV-040, DEV-041 `PROPOSED`, FD-8 (brand assets), DEC-04 (brand copy), DEC-21 (support link) |

## Goal

The landing pages `/`, `/uz/` and `/en/` exist in `frontend/landing` with the legacy frame around the scenes: the
header with the logo and the language menu, the final block with the counter, the CTA and the QR, the footer row with
language buttons and links, the four footer SEO link blocks (24 links per language), the floating desktop QR and the
sticky dock — with language switching as a real navigation (LB-LND-001 fix) and root-relative URLs everywhere.

## Legacy reference

- LND-001 (page order), LND-002 (uz/en served translated), LND-004 (header: `a.brand` logo «kvadro²», `#lang-btn` globe
  + code, `aria-label` «RU — Язык: Русский», `#lang-menu` `role=menu` with three `menuitemradio` «Русский», «Oʻzbekcha»,
  «English»; outside click or Escape closes, Escape returns focus; `body.hero-dark`), LND-016 (final block), LND-017
  (footer row), LND-018 (footer SEO links: four `<nav>`, 24 links per language), LND-019 (floating QR), LND-020 (dock),
  LND-027 (language selection and switching), LND-029.
- URL-001…URL-003, URL-017, URL-018 (versioned assets and images, replaced by the build), URL-050, URL-060, URL-062.
  URL-051 (`t.me/KvadroSupportBot?start=l_<id>`) is emitted only by the Mini App (KV-FE-071); the landing footer emits
  the bare support link URL-050.
- Rules: BR-LND-004 (language on load), BR-LND-005 (language switch), BR-LND-007 (final counter), BR-LND-022 (dock
  visibility), BR-LND-023 (floating QR).
- Defects and deviations: LB-LND-001 (relative URLs break after a switch, fix `APPROVED`), LB-LND-003 (`APPROVED`),
  LB-LND-002 → DEV-038, LB-LND-007 → DEV-040 (QR payload), LB-LND-008 → DEV-041 (privacy link target).
- Source: `$KVADRO_ROOT/demo/landing/site/index.html:47-60`, `:413-519`; `$KVADRO_ROOT/demo/landing/site/landing.js:196-333`,
  `:2321-2477`; parity scenarios `$KVADRO_ROOT/demo/landing/tools/parity/scenarios.mjs`.
- S1–S3: these URLs are served from the legacy files by nginx (infrastructure); this task is the S4 replacement.

## Implementation

1. Read `frontend/landing/node_modules/next/dist/docs/01-app/02-guides/internationalization.md` and
   `01-app/03-api-reference/02-components/link.md`.
2. `frontend/landing/app/[lang]/page.tsx` (Server Component) composes: `Header`, the scenes (KV-FE-110, KV-FE-112), the
   final block, `Footer`, `FloatingQr`, `Dock`. Every href is root-relative or absolute: logo → `/`, `/uz/`, `/en/`;
   privacy → `/privacy.html` (DEV-041 on: `/uz/privacy.html`, `/en/privacy.html`); footer SEO links built with
   `buildSeoPath` (KV-FE-101) per language, so `/uz/` shows `uz/ijara/…` and `/en/` shows `en/rent/…`.
3. Language menu (Client Component `LanguageMenu`): button shows the globe icon and the upper-case code; menu with three
   radio items; outside click and Escape close it, Escape returns focus to the button; choosing a language stores
   `localStorage` `kv-landing-lang` and **navigates** to `/`, `/uz/` or `/en/` keeping the other query parameters and the
   hash and dropping `lang` (BR-LND-005 target URL; LB-LND-001: a real navigation instead of `history.replaceState`).
   The footer language buttons use the same handler with `aria-pressed`.
4. Language on load (BR-LND-004), flag `dev038RootAlwaysRu` (KV-FE-100) off: on `/` only, a client resolver applies
   `?lang=` → stored `kv-landing-lang` → browser languages (`uz`/`ru` → that language; `kk`, `ky`, `tg`, `tk`, `be` →
   `ru`; `en` only when none of those appears; else `ru`) and, when the result is uz or en, renders that language's
   messages in place without changing the URL (legacy parity; the three message sets for `/` ship with the page).
   On `/uz/` and `/en/` the path wins. Flag on: `/` always renders ru; `?lang=` is redirected by KV-FE-100; an optional
   dismissible hint «Эта страница есть на O'zbekcha / English» (new key `landing.langHint`, not in legacy) uses the
   stored choice or `navigator.languages`.
5. Final block (LND-016): line `final.free` «Бесплатно» + the counter of BR-LND-007 («N новых квартир за сутки» /
   «за неделю», hidden under 100; count-up 1.2 s ease-out cubic), `h2` `final.h2` «Найдите квартиру сегодня», the CTA
   `BotLink` (`cta` «Открыть в Telegram»), and on wide screens the QR `img/qr-bot.svg` with `final.qr` «Откройте на
   телефоне» (phones: button only). QR payload per `dev040AttributedQr` (KV-FE-106).
6. Footer row (LND-017): «© 2026 kvadro²» (year from the build date), language buttons, links `foot.support`
   «Поддержка» → `https://t.me/KvadroSupportBot`, «Instagram» → `https://www.instagram.com/kvadro.app/`, `foot.privacy`
   «Конфиденциальность», «Карта: © OpenStreetMap» (`foot.map`) → `https://www.openstreetmap.org/copyright`; the large
   `aria-hidden` wordmark.
7. Footer SEO links (LND-018): navs `foot.rent` «Аренда квартир» (six cities + `foot.rent.all` «Все города и районы»),
   `foot.districts` «Районы Ташкента» (12 districts), `foot.sale` «Продажа квартир» (`prodazha/tashkent/`,
   `foot.sale.new` «Новостройки Ташкента», `prodazha/`), `foot.prices` «Цены» (`foot.rent.index` «Индекс аренды
   Ташкента», `foot.sale.prices` «Цены на квартиры в Ташкенте»); place names from the place dictionary (KV-FE-102).
8. Floating QR (LND-019, BR-LND-023): only at `min-width: 1200px`, `(hover: hover)` and `(pointer: fine)`, after the
   first scene; `qr.title` «На телефоне», close button `qr.close` «Скрыть QR-код» hides it for the page view; it morphs
   into the final block's QR panel when that block is more than half visible and collapses when it has almost left
   (hysteresis), computed per animation frame with a timer fallback for background tabs; `qr.alt` / `qr.aside` as alt
   and aria texts.
9. Dock (LND-020, BR-LND-022): a bottom «Открыть в Telegram»; appears once the first-screen CTA has faded out; hidden
   on the «Как приложение» step, while the phone is full-screen (live) and when the final block shows; v2: shown only
   after the hero button scrolled away and nothing of the phone is underneath; height measured from the real button
   (iOS toolbar).
10. Header theme: `hero-dark` while the dark first scene is on screen (colour switching of the browser bar in
    KV-FE-109).

## States and texts

| State | Shown when | Texts and controls |
| ----- | ---------- | ------------------ |
| default | page load | `lang.aria` «Язык» on the menu; button aria «RU — Язык: Русский» (code + `lang.aria` + language name) |
| menu open | button tap | three items «Русский», «Oʻzbekcha», «English», current one `aria-checked` |
| counter hidden | `day` and `week` < 100 or data missing | `final.free` alone |
| counter day / week | BR-LND-007 | «N новых квартир за сутки» / «за неделю» (`count.what` plural + `count.day` / `count.week`) |
| QR closed | `qr.close` pressed | floating QR gone for this page view; final QR unaffected |
| no JavaScript | — | full ru (or uz/en by path) markup; CTAs are the bare bot link; menu links are plain anchors to `/`, `/uz/`, `/en/` |

## Interaction

- Keyboard: the menu is reachable by Tab, arrow keys move between items, Enter selects, Escape closes and returns focus.
- Dock and floating QR respect `prefers-reduced-motion` (no morph animation, instant states).
- Responsive: breakpoints of LND-025 (380, 760, 900, 1 100, 1 200, 1 280 px; owned by KV-FE-109); QR panel from 900 px
  with a fine pointer.

## Telegram integration

n/a (CTAs are `https://t.me` links built by KV-FE-106).

## Storage and analytics

- `localStorage` `kv-landing-lang` (written on a choice; read by the flag-off resolver and by the privacy page).
- PostHog autocapture records menu and CTA clicks (KV-FE-105); stable `data-ph` attributes per Q-LND-008.

## Files

- `frontend/landing/app/[lang]/page.tsx`, `frontend/landing/components/landing/{Header,LanguageMenu,FinalBlock,Footer,FooterSeoLinks,FloatingQr,Dock}.tsx` (new)
- `frontend/landing/public/img/qr-bot.svg`, `frontend/landing/public/logo.svg` (brand layer, FD-8)
- `frontend/landing/tests/landing-frame.test.tsx`, `frontend/landing/e2e/landing-language.spec.ts`

## API contract

Landing data `live.json` (`day`, `week`) via KV-FE-107 for the final counter. Place names via KV-FE-102.

## Business rules

- Kept: BR-LND-004 (flag off), BR-LND-005 (target URL, storage, link updates), BR-LND-007, BR-LND-022, BR-LND-023.
- Defect fixes `APPROVED`: LB-LND-001, LB-LND-003.
- DEV-038, DEV-040, DEV-041 `PROPOSED` behind their flags (`todo('DEV-038 PROPOSED')`, `todo('DEV-040 PROPOSED')`,
  `todo('DEV-041 PROPOSED')`).

## Acceptance criteria

- Landing parity scenarios (KV-QA-013, `03b` §1.6) pass or map to an LB/DEV: `{ru,uz,en}-desktop` (frame parts),
  `browser-uz`, `browser-en`, `browser-kk`, `query-lang-en`, `stored-lang-uz` (flag off), `menu-lang-uz`,
  `menu-lang-en-from-uz` (final URL and texts equal; the switch is a navigation — LB-LND-001), `source-tag`, `qr-close`.
- After switching to English on `/`, every image, the logo link, the privacy link and all 24 footer SEO links answer
  `200` (the LB-LND-001 regression set).
- `/uz/` footer links point to `uz/ijara/…`, `uz/sotuv/…`, `uz/novostroyka/…`, `uz/ijara/indeks/`, `uz/sotuv/narxlar/`.
- Visual: side by side with the legacy production mirror at 1 366 × 860 and 390 × 844 for ru, uz, en.

## Tests

- Component: menu keyboard behaviour; footer link set per language (24 hrefs); counter thresholds.
- E2E (`landing-language.spec.ts`): the language scenarios above with the browser locale set by Playwright; no 404 in the
  network log after a switch.
- Flag tests as `todo` for DEV-038, DEV-040, DEV-041.

## Edge cases

- `localStorage` blocked: the choice is not remembered; navigation still works.
- `?lang=xx` (unknown): ignored, ru on `/` (BR-LND-004).
- Very narrow screens (320 px): the menu stays inside the viewport.
- Background tab during the QR morph: the timer fallback keeps the state consistent.

## Security

SEC-REQ-019 (outbound links `https` and allow-listed), SEC-REQ-021 (texts as text; rich text only `<br>`/`<b>`).

## Definition of done

`make ci-frontend` green; component and E2E tests green; the parity scenarios listed above recorded in KV-QA-013's
results; parity gate G4 for F-LANDING-001, F-LANDING-004, F-LANDING-005 and F-LANDING-006 ticked (`15` §4); `09` rows
updated; PR reviewed by the other developer.
