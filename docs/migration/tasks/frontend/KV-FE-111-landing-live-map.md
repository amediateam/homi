# KV-FE-111 — Landing live map in the phone

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Frontend (track: development) |
| Complexity | M |
| Milestone | FE-3b (M9, stage S4) |
| Feature IDs | F-LANDING-003 |
| Dependencies | KV-FE-110 (phone demo), KV-FE-107 (pins data); KV-FE-106 (listing and bot links); decisions: DEV-040 `PROPOSED` (tagged `startapp` links, backend side), Q-LND-010 |

## Goal

At the end of the first scene the phone becomes a working demo on real data: price pins on a static Tashkent map from
`pins-rent.json` (and `pins-sale.json` after «Продажа»), a selected-listing card, a feed built from the pins, the
filter chips and sheet with the legacy demo semantics, in-memory favourites and history, and the radar tile — every
listing tap opening the listing in the Mini App, every other tap leading to the bot.

## Legacy reference

- LND-008 (activation and content), LND-009 (the demo finger stops on the first user touch), LND-006 (the replica).
- Rules: BR-LND-010 (activation thresholds, which pins, declutter), BR-LND-011 (demo filter semantics), BR-LND-012
  (tones), BR-LND-013 (card formatting), BR-LND-015 (sheet footer), BR-LND-016 (radar tile), BR-LND-017 (click targets).
- URL-053 (`startapp=l_<id>-web` from the data `link`), URL-046 (bot fallback link). Of the other `startapp` forms the
  live map emits none: URL-052 (share) and URL-055 (campaigns) come from the Mini App and ads, URL-054 from the SEO cards
  (KV-FE-115), URL-056 only exists for parser tolerance; with DEV-040 the backend may extend URL-053 to
  `l_<id>-web-<tag>`.
- Source: `$KVADRO_ROOT/demo/landing/site/landing.js:537-1350`, `:591-661` (formatting, tones, filters), `:656-735`
  (declutter), `:1028-1031`, `:1049-1170`, `:1196-1240`, `:1834-1918`; data shapes `03b` §1.5.

## Implementation

1. Read `frontend/landing/node_modules/next/dist/docs/01-app/02-guides/lazy-loading.md` (this component is the heaviest
   part of the landing and loads only when the scene approaches its end).
2. `frontend/landing/components/landing/LiveMap.tsx` (Client Component inside `PhoneDemo`): the static raster
   `map-tashkent.webp` (1 800 × 1 125 points) with a pin layer positioned by `x`, `y` (percent of the image) — no map
   library; attribution «© OpenStreetMap».
3. Activation: v1 enters live mode at scene progress > 0.9256 and leaves at ≤ 0.9008; v2 after the scripted steps;
   simple v2 at once (inputs from KV-FE-109). Entering live mode preloads `pins-sale.json` (KV-FE-107).
4. Pins (BR-LND-010): outside live mode the `in_all` set; with a single room count 1–3 selected the `in_rooms` set;
   otherwise `in_all`; all filtered by `matches` of BR-LND-011. Declutter: a label box of
   `(len(price) × 7.4 + 18) / 2 + 3` points must not overlap another; the selected pin and the story pin win.
5. Interaction: tap a pin → its card (selected pin drawn first); tap the card, a feed card or a push → open the pin's
   `link` in a new window (`noopener`), validated by `listingStartapp` (KV-FE-106); otherwise the first tagged bot link
   (BR-LND-017). Map drag: a mouse drags in any direction, a finger only sideways (vertical swipes scroll the page); a
   drag longer than 4 px cancels the click. Clicks act only while the map is live.
6. Filters (BR-LND-011): rooms (one tap exact, second value a range, repeating a value or «Любые» resets; `rooms ≥ rmin`,
   `rooms ≤ rmax` unless `rmax ≥ 4`), price presets $300, 400, 500, 600, 800, 1 000, 1 500 for rent and
   $40 000 – 200 000 for sale (`price_usd ≤ price`), districts (code in list), owner (`no_agents` excludes
   `is_owner === false`, `owners` keeps `is_owner === true`); the deal switch resets the price; sale, zones, metro,
   housing type, term and tenants are display-only.
7. Sheet footer (BR-LND-015): no conditions → `sheet.all` numbers; the demo filter (2 rooms, Chilonzor + Mirobod, «Без
   риелторов») → `sheet.demo`; text «📡 Радар: ≈N в день» if `per_day ≥ 1`, else «≈N в неделю» (`per_day × 7`), plus
   «Показать N»; other combinations or sale → «Показать» without a number and no radar line.
8. Feed and tabs: «Карта / Список» toggle, a feed built from the shown pins, favourites and history kept in memory only;
   the radar tile (BR-LND-016): `DEMO_FILTERS` (2 rooms, `chilonzor` + `mirobod`, `no_agents`), a collage of up to 4
   matching photos, the state line «≈N в день · сразу» / «N за неделю · сразу» from `sheet.demo`, the switch pauses
   («На паузе»), the tile opens the feed with that filter, «+» and the bot button open the tagged bot link.
9. Card formatting (BR-LND-013) and tone (BR-LND-012) as pure functions shared with the pushes of KV-FE-112: facts
   `title.<min(rooms,4)>` · `fmt.area` · `fmt.floorOf` / `fmt.floor`; ages `age.now` / `age.min` / `age.hours` /
   `age.days`; where = dictionary district name · `point`; period `period` «/мес» for rent, none for sale; tone `same` or
   `mixed` → `market.same` «≈ рынок»; `no_repair` → neutral «±N% к рынку»; `good` → «−N% к рынку» (green) and tag
   `tag.below` «Ниже рынка»; `high` → «+N% к рынку»; tag priority below-market, then `tag.owner` «Хозяин»; no tone → no
   market line.

## States and texts

| State | Shown when | Texts (demo / Mini App keys) |
| ----- | ---------- | ---------------------------- |
| inert | before live mode | replica only; no pins react |
| live, map | live mode, map tab | pins with prices; card with `c*`-style formatting from data |
| live, list | «Список» | feed cards from the shown pins |
| empty | filters leave no pins | the map without pins; footer «Показать» without a number (the legacy demo shows no message) |
| data missing | pins fetch failed | the replica stays inert (no live mode); DEV-039 rules of KV-FE-107 |
| sale | «Продажа» chosen | pins from `pins-sale.json`; price presets of sale; no radar line |

Chrome texts: `app.view.map` «Карта», `app.view.list` «Список», `sheet.title` «Фильтры» (Mini App catalogue);
radar tile `radar.title` «2-комн.», `radar.sub` «Чиланзар, Мирабад · без риелторов», `radar.stateDay` «≈{n} в день ·
сразу», `radar.stateWeek` «{n} за неделю · сразу», `radar.paused` «На паузе» (`demo` namespace).

## Interaction

- Touch: sideways drag on the map only; taps on pins, cards, chips, the sheet; the demo finger stops on the first touch.
- Animations: card swap, sheet rise (Mini App sheet primitive in demo mode, no Telegram Back).
- Responsive: inside the scaled phone (KV-FE-109).

## Telegram integration

n/a (opens `https://t.me/…?startapp=…` and `?start=…` links in a new window; no WebApp API).

## Storage and analytics

Favourites and history live in component state only (legacy: memory only). PostHog autocapture records clicks
(KV-FE-105).

## Files

- `frontend/landing/components/landing/{LiveMap,LiveFeed,LiveFilters,LiveRadarTile}.tsx` (new)
- `frontend/landing/lib/landing/{pins,filters,format}.ts` (pure functions; new)
- `frontend/landing/tests/live-filters.test.ts`, `frontend/landing/tests/live-format.test.ts`,
  `frontend/landing/e2e/landing-live-map.spec.ts`

## API contract

`GET /data/pins-rent.json`, `GET /data/pins-sale.json`, `GET /data/live.json` (RES-010…RES-012) via KV-FE-107; pin
photos `img/snap/<id>.webp` or media-pipeline URLs per DEV-012.

## Business rules

- Kept: BR-LND-010, BR-LND-011, BR-LND-012, BR-LND-013, BR-LND-015, BR-LND-016, BR-LND-017.
- DEV-040 `PROPOSED` affects only the `link` values produced by the backend; the frontend accepts both forms.

## Acceptance criteria

- Landing parity scenarios (KV-QA-013) pass or map to an LB/DEV: `live-phone-v1`, `deal-sale`, `deal-sale-phone-v1`,
  `sheet-filters`, `sheet-toggles`, `sheet-sale`, `pin-card`, `pin-other`, `sub-switch`, `{ru,uz,en}-desktop-live`.
- With the synthetic fixture, the shown pin set, the footer numbers and the radar state line equal the legacy page fed
  the same data.
- A tap on a pin card opens exactly the `link` of that pin; a tap on the map background or a display-only control opens
  nothing; a 5 px drag does not trigger a click.
- No pin label overlaps another (declutter) at 390 × 844 and 1 366 × 860.

## Tests

- Unit: `matches` table (BR-LND-011), pin set selection (BR-LND-010), declutter on synthetic coordinates, footer text
  choice (BR-LND-015), tone mapping (BR-LND-012), facts and ages (BR-LND-013) in ru, uz, en.
- E2E (`landing-live-map.spec.ts`): the scenarios above with `?motion=raw`.

## Edge cases

- A pin without `link`: card taps fall back to the bot link.
- `is_owner: null` (unknown): neither owner filter keeps or excludes it wrongly (`no_agents` keeps it, `owners` drops it).
- Pins with identical `x`, `y`: declutter keeps the selected one visible.
- Rooms ≥ 5: facts use `title.4` (min(rooms, 4)).

## Security

SEC-REQ-019 (only `https://t.me` links opened, `noopener`), SEC-REQ-021 (data rendered as text — the legacy code also
avoided `innerHTML`).

## Definition of done

`make ci-frontend` green; unit and E2E tests green; scenario results recorded for KV-QA-013; parity gate G4 for
F-LANDING-003 (live map part) ticked (`15` §4); `09` row updated; PR reviewed by the other developer.
