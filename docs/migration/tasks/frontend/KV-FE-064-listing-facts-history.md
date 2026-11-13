# KV-FE-064 — Listing: facts, stats, history, description

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Frontend (track: development) |
| Complexity | M |
| Milestone | FE-2 (M9, stage S4) |
| Feature IDs | F-LISTING-001, F-LISTING-006 |
| Dependencies | KV-FE-063, KV-FE-018; decisions: DEV-014 `PROPOSED`, DEV-007 `PROPOSED` (author phone row) |

## Goal

The listing body shows the «Факты» grid, the statistics cells, the publication / price history, the author block
(«Кто размещает») and the description («Из объявления») exactly as legacy, with every product date formatted in
`Asia/Tashkent` once DEV-014 is approved, and the author's raw number hidden once DEV-007 is approved.

## Legacy reference

- Screen: SCR-018 body (`03` §2: facts grid, stats cells, history, author, description).
- Code: `$KVADRO_ROOT/demo/app/src/features/listing/sections/FactsSection.jsx:18-60` (icon table, wide cell over 18
  characters), `sections/StatsSection.jsx:10-35`, `sections/HistorySection.jsx:7-99` (single sentence vs timeline,
  device-time-zone dates), `sections/AuthorSection.jsx:11-47`, `sections/DescriptionSection.jsx:5-12`;
  `$KVADRO_ROOT/demo/app/src/i18n/index.js:83-93` (`formatShortDate`).
- Rules: BR-APP-068 (stats), BR-APP-069 (history), BR-API-151 (ISO timestamps with `Z`).
- Defects: LB-APP-025 → DEV-014 (dates in Tashkent); LB-API-030 → DEV-007 (raw numbers).
- Visual baselines (KV-QA-019): `listing-open` → `SCR-018-*.png` (scroll to the facts and history blocks).

## Implementation

1. `frontend/app/app/(miniapp)/features/listing/sections/FactsSection.tsx`: render `details.facts[]` in server order;
   icon by `key` (`type`, `rooms`, `area`, `land`, `floor`, `building`, `renovation`, `furniture`, `appliances`,
   `per_m2`, `commission`, `conditions`), any other key → the house icon; cell `wide` when `value.length > 18`; React
   key `key + index` (duplicate keys must not collide); nothing rendered for an empty array.
2. `StatsSection.tsx`: cells `[days_listed]` (0 → `details.today` + `details.onMarket`, else number + plural
   `details.daysOnMarket`), `[publications]` (plural `details.publications`), `[channels]` only when `> 1` (plural
   `details.channels`), `[views]` only when non-zero (integer format of KV-FE-017 + plural `details.views`).
3. `HistorySection.tsx`: one entry → `details.historySingle` with the `@channel` part as a button when `url` is set
   (split the sentence at the `@{channel}` placeholder, never by building HTML); several → `details.priceHistory`
   timeline rows `date + time`, `text · @channel`, price (`price_usd` through the USD/UZS formatter of KV-FE-017) and
   `change_pct` with sign, `good` colour when negative, `high` when positive, trending icon; rows with `url` are
   buttons that open the post (`original_opened`, `src: price_history`, helper of KV-FE-065); CSS class from `kind`
   only when it is one of `published`, `price_down`, `price_up`.
4. Dates and times: `formatShortDate` and `formatTime` of KV-FE-018. Legacy uses the device time zone; with the DEV-014
   flag of KV-FE-018 on, both use `Asia/Tashkent`. Uzbek short months `yan … dek` and the ru dot-less «5 мар» per
   `03` §3.5.
5. `AuthorSection.tsx`: `listing.whoPosts` heading; `owner` row (user icon); `offers[]` row — items with `url` are link
   buttons (`original_opened`, `src: offers`), others plain text; phone row with `phone_display` as a button that calls
   (`call('author')` from KV-FE-068) — hidden when DEV-007 flag `dev007NoRawPhones` is on (introduced here, also read
   by KV-FE-065 and KV-FE-068); «Опубликовано {when}» from `age` (part after the first « · », else the whole string).
6. `DescriptionSection.tsx`: `listing.description` heading + `summary` as plain text, only when `summary` is non-empty.
7. Mark the phone button and the description with the replay-masking classes used by KV-FE-035 (`ph-mask`,
   `ph-no-capture`) so session replay never records numbers or text.

## States and texts

| State | Rendering and keys |
| ----- | ------------------ |
| loading | the `SectionSkeleton` slots of KV-FE-063 (3 lines for facts/stats/history, 4 for author/description/sources) |
| empty facts | `facts: []` → no «Факты» section |
| stats, 0 days | `details.today` «Сегодня» + `details.onMarket` «на рынке» |
| stats, N days | N + `details.daysOnMarket` («день / дня / дней на рынке») |
| publications | N + `details.publications` («публикация / публикации / публикаций») |
| channels (> 1) | N + `details.channels` («канал / канала / каналов») |
| views (> 0) | N + `details.views` («просмотр / просмотра / просмотров») |
| history, one entry | `details.history` «История» + `details.historySingle` «Опубликовано {date} в @{channel}. Повторов и изменений цены пока не было.» |
| history, several | `details.priceHistory` «История цены» + timeline |
| history, none | section hidden |
| author | `listing.whoPosts` «Кто размещает», `listing.published` «Опубликовано {when}» |
| description | `listing.description` «Из объявления» |
| error | no own error state: the layer state of KV-FE-063 applies |

Facts headings: `details.facts` «Факты» (uz «Xususiyatlar» since the 2026-11-06 release, `03` §3.1).

## Interaction

- Taps on `@channel`, history rows with `url` and offer links: light haptic, open through `openLink` of KV-FE-029
  (same-URL debounce 1.5 s).
- Tap on the phone row: medium haptic, call flow of KV-FE-068.
- No gestures of its own; text is selectable. Wide cells span both grid columns; the grid is two columns at 320–608 px.

## Telegram integration

TMA-028 (`openTelegramLink` for `t.me` posts), TMA-025 (haptics), TMA-029 (via the call flow of KV-FE-068).

## Storage and analytics

- Storage: none.
- Journal (KV-FE-034): `original_opened {listing_id, src: 'price_history' | 'offers'}` only when a link actually
  opened (the helper returns `false` on debounce).

## Files

- `frontend/app/app/(miniapp)/features/listing/sections/{FactsSection,StatsSection,HistorySection,AuthorSection,DescriptionSection}.tsx` (new)
- `frontend/app/lib/deviations.ts` (flag `dev007NoRawPhones`)
- `frontend/app/tests/listing/{FactsSection,StatsSection,HistorySection,AuthorSection}.test.tsx`

## API contract

API-008 `ListingDetails` fields (`08` §1.8): `facts: {key, label, value}[]`, `stats: {days_listed, publications,
channels, views?}`, `history: {at, channel, url, text?, kind?, price_usd!, change_pct!}[]` (`price_usd` and
`change_pct` strictly present, may be `null`), `owner`, `offers?: {text, url?}[]`, `phone_display`, `age`, `summary`.
`history[].at` is ISO-8601 UTC with `Z` (BR-API-151). No request of its own. Server side: the serializer KV-BE-034 and
the formatters KV-BE-021.

## Business rules

- Kept: BR-APP-068 (0 days → «Сегодня на рынке», channels only > 1, views only non-zero), BR-APP-069 (one entry →
  sentence, several → timeline with ± colour), BR-API-151.
- DEV-014 `PROPOSED`: dates and times in `Asia/Tashkent` (flag of KV-FE-018; test `todo('DEV-014 PROPOSED')`).
- DEV-007 `PROPOSED`: no raw number shown (`dev007NoRawPhones`); with FD-2 = A only the display is suppressed (the
  legacy surface still sends `phone`); with FD-2 = B the v1 API never returns it.

## Acceptance criteria

- Facts render in server order with the right icon; an unknown key gets the house icon; a 19-character value spans
  the full width; two facts with the same key both render.
- Stats show «Сегодня на рынке» for 0 and the correct ru plural for 1, 2, 5, 11, 21; channels hidden for 1, views hidden
  for 0.
- One history entry renders the sentence with a tappable `@channel` when `url` is set and plain text otherwise; several
  entries render the timeline with `$` prices and `-6%` in green / `+8%` in orange.
- With the DEV-014 flag on and the device in UTC−5, an entry at `2026-11-01T20:30:00Z` shows «2 ноя» and 01:30.
- Visual: side by side with the `listing-open` baseline — facts grid, stats cells and history layout equal.

## Tests

- Unit `HistorySection.test.tsx`: single sentence split with and without `url`; timeline signs (−, 0, +, `null`);
  unknown `kind` ignored for the class; DEV-014 `todo`.
- Unit `StatsSection.test.tsx`: dataset of `days_listed` 0/1/2/5/21, `channels` 1/2, `views` 0/1/1 200.
- Unit `FactsSection.test.tsx`: icon table, unknown key, duplicate keys, wide threshold 18/19.
- Component `AuthorSection.test.tsx`: offers with and without url; phone row hidden with `dev007NoRawPhones`; `age`
  without « · ».
- Visual capture in the E2E of KV-FE-170 at the history block.

## Edge cases

- `history[].channel` empty (server should never send it): keep the legacy rendering and record the fixture in the
  contract tests of KV-BE-034 rather than adding client logic.
- `price_usd` `null` and `change_pct` `null` in a row: neither column renders.
- `stats.views` absent (optional key): cell hidden.
- `summary` containing line breaks: preserved as text with `white-space: pre-line`.

## Security

- SEC-REQ-021: `facts[].label/value`, `history[].text`, `owner`, `offers[].text`, `summary` rendered as text.
- SEC-REQ-019: `history[].url` and `offers[].url` opened only when `https:` and on the allowlist (helper of KV-FE-029).
- SEC-REQ-028: with the phone quota tripped the server sends `phone_display: null` → the row is hidden, no error.

## Definition of done

`make ci-frontend` green; tests above green (or added when KV-FE-010 lands); visual review against the SCR-018
baseline recorded in the PR; parity gate G4 for F-LISTING-006 ticked (`15` §4); the feature row in `09` updated; PR
reviewed by the other developer.
