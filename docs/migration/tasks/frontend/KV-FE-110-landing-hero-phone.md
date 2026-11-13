# KV-FE-110 — Landing hero scene and the phone demo

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Frontend (track: development) |
| Complexity | L |
| Milestone | FE-3b (M9, stage S4) |
| Feature IDs | F-LANDING-002 |
| Dependencies | KV-FE-109 (versions and motion), KV-FE-045 (Mini App shell components), KV-FE-047 (listing card); KV-FE-107 (pushes data for the lock phase); decisions: FD-8 (brand assets), DEC-04 (brand copy), Q-LND-008 |

## Goal

The first scene of the landing works as in legacy: seven example channel posts gather into one card inside a phone
that shows a static replica of the Mini App (feed, filters, map, favourites, radar, settings), the three «Как
приложение» steps, the interaction hints and, in v1, the lock-screen phase with the first pushes. The phone is built
from the new Mini App components and catalogues instead of the generated `miniapp.css` / `miniapp-i18n.js` copy
(LND-036), so the demo never drifts from the real app.

## Legacy reference

- LND-005 (hero: `section.story` with `story.aria`, `.tl-proxy.tl-cloud`, `.stage` with layers `s-posts` — seven posts
  `p1…p7`, four with photos `img/cluster-{2k,3,4,5}.webp`, texts mixed ru/uz and the same in every language; `s-back` —
  `h1` «Аренда квартир в Ташкенте» (the search query, owner decision), slogan `p.hero-title`, lead, CTA, caption;
  `s-front` — phone and steps), LND-006 (phone demo: `.phone` `role=img` with `phone.aria`, top bar «Аренда · Ташкент»,
  title tabs, header chips, feed `#m-feed` with the Chilonzor $550 card first, favourites, radar, settings, tab bar,
  filter sheet, static map `map-tashkent.webp` 1 800 × 1 125 points, lock-screen wall, iOS status bar, Telegram header
  buttons; every control `tabindex="-1"` and inert until live), LND-007 (steps and the narrow-screen `.st-bar`),
  LND-009 (demo finger ~5 s cycle; v2 tap cursor), LND-010 (`try` hint and `cue`), LND-011 (v1 lock-screen phase:
  `LOCK_SCENE` conditions, scene 9 200 px, `LOCK_DWELL` 250 px, up to 4 pushes at 12 % then every 17 %), LND-036.
- Rules: BR-LND-013 (demo card formatting), BR-LND-014 (pushes), BR-LND-007 (counter in the left column).
- Source: `$KVADRO_ROOT/demo/landing/site/index.html:65-189`; `$KVADRO_ROOT/demo/landing/site/landing.js:537-575`,
  `:752-800`, `:1430-1530`, `:2145-2211`; parity scenarios `$KVADRO_ROOT/demo/landing/tools/parity/scenarios.mjs`.

## Implementation

1. Read `frontend/landing/node_modules/next/dist/docs/01-app/02-guides/lazy-loading.md` and
   `01-app/03-api-reference/02-components/image.md` (static images with fixed dimensions, no layout shift).
2. `frontend/landing/components/landing/Hero.tsx` (Server Component): the three layers with server-rendered texts; the
   seven demo posts as static markup with their photos from `frontend/landing/public/img/` (brand layer, FD-8); the
   post texts are demo content copied verbatim and identical in all languages (e.g. «🔥 СРОЧНО! 2-х комн, Чиланзар ·
   600$», «2xona 55kv 1/4 Chilonzor ‼️ 600$ ‼️»).
3. `frontend/landing/components/landing/PhoneDemo.tsx` (Client Component, `next/dynamic`, loaded after the first paint):
   renders the Mini App top bar, tab bar, view toggle, chips and listing cards from `@homi/ui` / the Mini App components
   of KV-FE-045 and KV-FE-047 in a non-interactive mode (`inert` until live), with Mini App catalogue texts
   (KV-FE-016) for the chrome (`tab.search` «Поиск», `tab.favorites` «Избранное», `tab.subs` «Радар»,
   `tab.settings` «Настройки», `app.view.map` «Карта», `app.view.list` «Список», `sheet.title` «Фильтры») and the
   `demo` namespace (KV-FE-102) for the demo content (`mini` «Аренда · Ташкент», `c0.price` «$550», `c0.facts`
   «2-комн. квартира · 55 м² · 1/4 эт.», `c0.where` «Чиланзар», `c0.age` «3 мин назад», `c0.delta` «−8% к рынку», …).
   Screens: feed, favourites («Избранное» / «Смотрели»), radar (one tile, bot button), settings (display only), filter
   sheet, static map; lock-screen wall, iOS status bar (time 9:41 is decorative), Telegram header buttons.
4. Steps (LND-007): `app.h2` «Как приложение. Прямо в Telegram.», list `st.feed` «Лента» / `st.feed.s` «Все объявления в
   одном месте, свежие сверху.», `st.filters` «Фильтры» / `st.filters.s` «Район, цена, комнаты, без риелторов.»,
   `st.map` «Карта» / `st.map.s` «Цены на карте — видно, что сдаётся рядом.»; narrow screens add the `aria-hidden`
   progress bar «Лента · Фильтры · Карта».
5. Hints (LND-009, LND-010): the demo finger cycle (~5 s: tap a price near the map centre, which changes the card, then
   drag the map; stops for good after any user touch or when live mode ends); the v2 tap cursor gliding between buttons
   during the scripted steps and fading before live mode; `try.h` «Попробуйте сами», `try.text` «Это живая карта: цены —
   из свежих объявлений. Нажмите на любую или потяните карту.», `try.short` «Нажмите на цену или потяните карту»; the cue
   `cue` «Листайте дальше» scrolls to the lock phase, or past the scene when that phase is absent.
6. Lock phase (LND-011, v1 only): enabled when v1 is active, `timeline-scope` and `animation-timeline: view()` are
   supported and motion is allowed; scene height 9 200 px; after 250 px of dwell the phone moves right and dims to a lock
   screen; up to 4 pushes from `live.json` `latest` (oldest first, newest last at the bottom) arrive at 12 % of the
   phase and then every 17 %, and leave when scrolling back; left column `lock.h2` «Узнавайте первым», `lock.lead`
   «Больше не нужно листать каналы: подходящие квартиры сами придут в Telegram, как только появятся.» and the counter of
   BR-LND-007. Push rendering is shared with KV-FE-112 (`Push` component).
7. Live mode hand-off: at the end of scene 1 (v1 progress > 0.9256, off at ≤ 0.9008; v2 after the steps; simple at once)
   the phone becomes interactive — owned by KV-FE-111.
8. The `cta` button «Открыть в Telegram» and the caption `cap` «Семь постов — одна карточка» use `BotLink` (KV-FE-106).

## States and texts

| State | Shown when | Texts |
| ----- | ---------- | ----- |
| static first paint | always (server HTML) | `hero.kicker` «Аренда квартир в Ташкенте» (as the H1), `hero.h1` «Вся аренда из Telegram. В одной ленте.» (slogan), `hero.lead` «Без повторов, рекламы и хаоса.», `cta`, `cap`, `story.aria`, `phone.aria` |
| loading (phone chunk) | before the dynamic import resolves | the phone frame with the static first card image; no spinner |
| demo running | v1 scroll / v2 time | steps and hints as above |
| lock phase | LND-011 conditions | `lock.h2`, `lock.lead`, counter (`count.what` + `count.day` «за сутки» / `count.week` «за неделю») |
| no pushes | `latest` empty or data missing | lock screen without pushes; DEV-039 rules of KV-FE-107 for the counter |
| error (chunk failed) | dynamic import fails | static first card stays; page usable |

## Interaction

- Gestures: none on the phone until live mode (inert); the cue is a button.
- Animations: post fly-in, gather and phone growth (v2 ~2.6 s), steps cross-fade, finger cycle; all instant or absent
  under `prefers-reduced-motion` (static layout of KV-FE-109).
- Responsive: phone scale per KV-FE-109; steps column beside the phone on desktop, progress bar on phones.

## Telegram integration

n/a (decorative replica of the Mini App; no WebApp API).

## Storage and analytics

None written. PostHog autocapture covers the CTA; demo controls are inert and produce no events until live.

## Files

- `frontend/landing/components/landing/{Hero,PhoneDemo,Steps,DemoFinger,ScrollCue,LockPhase,Push}.tsx` (new)
- `frontend/landing/public/img/{cluster-2k,cluster-3,cluster-4,cluster-5}.webp`, `frontend/landing/public/map-tashkent.webp`
  (brand/demo assets copied from the legacy artefacts, FD-8)
- `frontend/landing/e2e/landing-hero.spec.ts`

## API contract

Landing data `live.json` (`latest[]`, `day`, `week`, `now`) via KV-FE-107 for the lock-phase pushes and counter.

## Business rules

- Kept: BR-LND-013 (demo card facts `title.<min(rooms,4)>` · `{area} м²` · `{floor}/{total} эт.`; ages «только что»,
  «N мин назад», «N ч назад», «N дн. назад»; period «/мес» for rent), BR-LND-014, BR-LND-007.
- LND-036: the generated `miniapp.css` / `miniapp-i18n.js` are not ported; their role is taken by the shared components.

## Acceptance criteria

- Landing parity scenarios (KV-QA-013) pass or map to an LB/DEV: `{ru,uz,en}-desktop` (all step labels),
  `{ru,uz,en}-phone-v1`, `ru-phone-v2-hero`, `ru-desktop-v2-hero`.
- The server HTML contains the H1, slogan, lead, CTA, caption and step texts in the page's language (crawlable).
- The phone replica shows the same screens and first card as legacy at each scenario step (visual side by side at
  1 366 × 860 and 390 × 844).
- The lock phase delivers at most 4 pushes, oldest first, at 12 % and then every 17 % of the phase, and removes them
  when scrolling back.
- The phone chunk is not part of the initial JavaScript (lazy, LB-LND-010).

## Tests

- E2E (`landing-hero.spec.ts`): the scenarios above with `?motion=raw`; push timing at fixed scroll positions; inert
  controls not focusable before live mode.
- Component: `Push` with tones `good`, `same`, `null` (mark hidden for `same`, BR-LND-014 / BR-LND-012).

## Edge cases

- Fewer than 4 `latest` items: as many pushes as items.
- A browser with `animation-timeline` but no `timeline-scope`: no lock phase; the «Узнавайте первым» block of KV-FE-112
  is shown instead.
- Very short viewports (< 500 px): simple v2, no intro.

## Security

SEC-REQ-021 (demo and data texts rendered as text). The replica never loads real listing photos except the pin
snapshots delivered by the data contract.

## Definition of done

`make ci-frontend` green; E2E scenarios green; visual review recorded; parity gate G4 for F-LANDING-002 (scene part)
ticked (`15` §4); `09` row updated; PR reviewed by the other developer.
