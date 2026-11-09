# KV-FE-018 — Date, age, distance and flow formatters

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Frontend (track: development) |
| Complexity | S |
| Milestone | FE-1 (M9, stage S4) |
| Feature IDs | F-LISTING-006, F-LISTING-007, F-FILTER-005 |
| Dependencies | KV-FE-015 (runtime, plurals); KV-QA-006 (shared time fixture `backend/tests/Fixtures/Shared/time-cases.json`); DEV-014, DEV-019, DEV-021 `PROPOSED`; fixes LB-APP-010 (used by KV-FE-086) |

## Goal

The client formats the few values the server does not pre-format — history dates and times, the «обновлено N назад»
of the market sheet, distances to metro, centre and nearby places, the Tashkent visit-day key, and the radar flow
wording — in one module each, with the legacy output by default and the PROPOSED unifications (Tashkent dates, one
distance formatter, one flow vocabulary) behind flags.

## Legacy reference

- Dates (`03` §3.5): `formatShortDate` «5 мар» (ru, dot removed), «5 Mar» (en), «5-mar» (uz, months `yan, fev, mar,
  apr, may, iyn, iyl, avg, sen, okt, noy, dek`) (`$KVADRO_ROOT/demo/app/src/i18n/index.js:76-93`); history time
  `toLocaleTimeString(numberLocale, {hour: '2-digit', minute: '2-digit'})`
  (`$KVADRO_ROOT/demo/app/src/features/listing/sections/HistorySection.jsx:7-12`) — both in the **device** time zone
  (LB-APP-025 → DEV-014).
- «Обновлено» (`$KVADRO_ROOT/demo/app/src/features/listing/MarketSheet.jsx:15-34`): < 2 min `market.info.agoNow`
  «только что»; < 60 min `market.info.agoMin` («{n} минуту / минуты / минут назад»); hours = round(min/60) < 48
  `market.info.agoHour`; else days `market.info.agoDay`.
- Distances (`$KVADRO_ROOT/demo/app/src/features/listing/format.js:76-126`): `metroLabel` only ≤ 1.5 km; < 0.05 km the
  name only; else `fmt.metroDist` «{metro} · {m} м» with metres rounded to 100 (BR-APP-029); `distanceLabel` < 0.1 km
  `near.here` «рядом», < 0.95 km `near.m` «{m} м» (metres rounded to 100), else `near.km` «{km} км» with 1 decimal,
  `~` prefix when approximate (`geo_radius_m ≥ 400`, default 500) (BR-APP-031); `centerDistanceLabel` `fmt.centerKm`
  «{km} км до центра» (1 decimal). Inconsistency LB-APP-031 → DEV-019.
- Flow (`format.js:230-243`, `$KVADRO_ROOT/demo/app/src/features/radar/subscriptionStatus.js:11-32`,
  `$KVADRO_ROOT/demo/app/src/features/feed/Nudges.jsx:24-37`): `week == 0` → three different texts
  (`sheet.flowNone`, `alert.rare`, `nudge.none`); `week/days < 1` → `sheet.flowWeek` / `alert.week` «{n} за неделю»;
  else `sheet.flowDay` «📡 Радар: ≈{n} в день» / `alert.day` «≈{n} в день» (BR-APP-044; LB-APP-033 → DEV-021).
- Visit days in UTC (LB-APP-010, `$KVADRO_ROOT/demo/app/src/lib/telegram/homeScreen.js:71-78`) — defect fix.
- Test matrix: `15` §3.10 cases #5 (server `age` across the Tashkent midnight — rendered as sent), #7 (`history[].at`
  and `median_updated` arrive as ISO-8601 with `Z`), #11 (`TZ=UTC` and `TZ=Asia/Tashkent` give identical results),
  #13 (new client: visit days and history dates in Tashkent) — rows of KV-QA-006 `time-cases.json`.

## Implementation

1. `frontend/packages/utils/src/date-legacy.ts`: `formatShortDate(iso, locale, {timeZone})`, `formatTime(iso, locale,
   {timeZone})`, `agoLabel(iso, now, t, plural)`, `tashkentDayKey(date)` (`Intl.DateTimeFormat('en-CA', {timeZone:
   'Asia/Tashkent'})`, LB-APP-010 fix, always on). The time zone argument is `undefined` (device) when
   `dev014TashkentDates` is off and `'Asia/Tashkent'` when on (`frontend/app/lib/deviations.ts`).
2. Uzbek short months stay a constant in this module (they are outside the dictionaries in legacy, `03` §3.1).
3. `frontend/packages/utils/src/distance.ts`: `metroLabel(item)`, `distanceLabel(km, approx)`, `centerLabel(km)` with the
   legacy thresholds; with `dev019OneDistanceFormatter` on, all three use one rule (metres below 1 km rounded to 50/100,
   km with one decimal above — DEV-019 text) and the metro cap 1.5 km stays.
4. `frontend/packages/utils/src/flow.ts`: `flowRate(flow)` → `{kind: 'none' | 'week' | 'day', n}` (pure);
   `flowText(rate, surface)` where `surface` ∈ `sheet | tile | nudge` maps to the legacy keys; with
   `dev021OneFlowVocabulary` on, every surface uses the `sheet.*` vocabulary without the 📡 prefix outside the sheet
   (exact strings named in DEV-021 approval; until then `todo`). `flow` may be `null` (no line rendered) — the
   normalisation of non-object responses is KV-FE-021 (LB-APP-006).
5. All functions are pure and take `now`, `locale` and the translation functions as arguments, so they run the same in
   both `TZ` values.
6. Fixture-driven tests over the rows of `time-cases.json` that concern the client (#5 as pass-through, #7 parsing,
   #11, #13).

## States and texts

| Value | Output (ru, flags off) | Key |
| ----- | ---------------------- | --- |
| history date 2026-03-05 | «5 мар» (uz «5-mar», en «5 Mar») | — |
| median updated 1 min ago | «только что» | `market.info.agoNow` |
| 5 min ago | «5 минут назад» | `market.info.agoMin` |
| 30 h ago | «30 часов назад» | `market.info.agoHour` |
| metro 0.04 km | «Чиланзар» | — |
| metro 0.83 km | «Чиланзар · 800 м» | `fmt.metroDist` |
| nearby 0.08 km | «рядом» | `near.here` |
| nearby 1.26 km, approx | «~1,3 км» | `near.km` |
| centre 3.4 km | «3,4 км до центра» | `fmt.centerKm` |
| flow week 0 (sheet / tile / nudge) | «📡 За неделю таких не было — радар будет срабатывать редко» / «пока редко» / «Таких пока нет — радар пришлёт, как появятся» | `sheet.flowNone`, `alert.rare`, `nudge.none` |
| flow 4 in 7 days | «📡 Радар: 4 за неделю» / «4 за неделю» | `sheet.flowWeek`, `alert.week` |
| flow 21 in 7 days | «📡 Радар: ≈3 в день» / «≈3 в день» | `sheet.flowDay`, `alert.day` |

## Interaction

n/a (library).

## Telegram integration

n/a.

## Storage and analytics

`tashkentDayKey` is the day format stored in `kv-home.days` (KV-FE-086); old UTC-based entries stay readable (same
`YYYY-MM-DD` shape).

## Files

- `frontend/packages/utils/src/{date-legacy,distance,flow}.ts` (new); `package.json` exports
- `frontend/app/lib/deviations.ts` (flags `dev014TashkentDates`, `dev019OneDistanceFormatter`, `dev021OneFlowVocabulary`)
- `frontend/packages/utils/tests/{date-legacy,distance,flow}.test.ts` (after KV-FE-010)

## API contract

Consumes `ListingDetails.history[].at`, `median_updated` (ISO-8601 with `Z`, `15` §3.10 #7), `metro`, `metro_km`,
`center_km`, `nearby[].km`, `geo_radius_m` (API-008, `08` §1.8) and `FlowResponse` `{week, days, options?}` (API-006).
Server strings `age` are never re-formatted.

## Business rules

- Kept: BR-APP-029, BR-APP-031, BR-APP-044; BR-API-150 (age day = Tashkent day — server side, rendered as sent).
- LB-APP-010 fix `APPROVED` (policy).
- DEV-014, DEV-019, DEV-021 `PROPOSED` (flags; tests `todo('DEV-0NN PROPOSED')`).

## Acceptance criteria

- The table above holds in ru, and the uz/en equivalents match the catalogues; `km` uses the locale decimal mark.
- `tashkentDayKey('2026-11-08T19:30:00Z')` = `2026-11-09`.
- With `TZ=UTC` and `TZ=Asia/Tashkent`, DEV-014 on gives identical history dates; off gives the device-zone dates
  (legacy) — both covered.
- Every client-relevant row of `time-cases.json` passes.

## Tests

Table tests for each function and threshold edge (0.05, 0.1, 0.95, 1.5 km; 2 min, 60 min, 48 h); flow edges
(`week` 0, `week/days` 0.99 and 1.0, `days` 0 → treated as no data); TZ matrix run (`15` §3.10 #11).

## Edge cases

- `days` = 0 or missing in a flow response: `null` line (never divide by zero).
- `median_updated` in the future (clock skew): «только что».
- Invalid ISO strings: `null` (no `Invalid Date` in the UI).

## Security

n/a (no user data).

## Definition of done

`make ci-frontend` green; tests green (after KV-FE-010); KV-QA-006 rows referenced in the PR; PR reviewed by the other
developer.
