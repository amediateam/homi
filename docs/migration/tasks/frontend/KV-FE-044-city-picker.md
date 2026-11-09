# KV-FE-044 — City picker sheet and the first-launch variant

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Frontend (track: development) |
| Complexity | M |
| Milestone | FE-2 (M9, stage S4) |
| Feature IDs | F-ONBOARD-003, F-FILTER-004 |
| Dependencies | KV-FE-013 (sheet primitive), KV-FE-020 (city-change transition), KV-FE-031 (location service, nearest city), KV-FE-040 (bootstrap: `meta`, `cityStats`); backend KV-BE-030 (API-002), KV-BE-045 (API-025); decisions: DEV-023 `PROPOSED`, Q-APP-013, Q-APP-004 |

## Goal

One `CityPicker` component serves the three legacy uses: the blocking first-launch sheet «Где ищете жильё?» (SCR-005),
the city sheet opened from the feed header chip, and the nested picker inside the full filters sheet (SCR-017). It
shows the cities of `meta.cities` with their listing counts, offers «Определить по геопозиции», and applies the
city-change rules of BR-APP-009 without ever sending the location to the server.

## Legacy reference

- SCR-005, SCR-017 (`03` §2); `$KVADRO_ROOT/demo/app/src/features/city/CityPicker.jsx:21-134` (one component, prop
  `first`); opening rules `$KVADRO_ROOT/demo/app/src/app/App.jsx:257` (first launch), `:648-669` (header and first
  variants), `$KVADRO_ROOT/demo/app/src/features/filters/FiltersSheet.jsx:164-170,250-257` (nested, draft only).
- City change: `App.jsx:283-303` (`pickCity`), `FiltersSheet.jsx:119-131` (`selectCity`); `saveCity` →
  `$KVADRO_ROOT/demo/app/src/lib/city.js:20-27` (`kv-city` + `PUT /api/settings {city}`, errors ignored).
- Geolocation: TMA-035, `$KVADRO_ROOT/demo/app/src/lib/geo/location.js:5-126` (`requestLocation`,
  `findNearestCity`, `canRequestLocation`).
- Rules: BR-APP-009, BR-APP-055, BR-APP-056, BR-APP-010. Defects: LB-APP-007 (boolean coercion), LB-APP-009 (location
  timeout), LB-APP-035 → DEV-023, LB-APP-037 (first-launch picker not tracked).
- Visual baselines (KV-QA-019): scenario `city-picker` → `SCR-017-*.png`; meta with `city_chosen: false` →
  `SCR-005-*.png`.

## Implementation

1. Read `frontend/app/node_modules/next/dist/docs/01-app/02-guides/single-page-applications.md` (client component in
   the `(miniapp)` group).
2. `frontend/app/app/(miniapp)/features/city/CityPicker.tsx` with props `cities`, `stats`, `current`, `variant:
   'first' | 'header' | 'nested'`, `onPick(code)`, `onClose()`; built on the bottom-sheet primitive of KV-FE-013.
3. Variant `first`: no close button, no checkmark, no Back handler, no drag-to-close, backdrop taps ignored
   (`CityPicker.jsx:22-30`, `:56-61`); header class `first` with the title `city.firstTitle`.
4. Variants `header` and `nested`: × button (aria `common.close`), Back handler via the layer stack (KV-FE-025),
   drag-to-close and backdrop close; ✓ on the current city (`aria-pressed`).
5. Geolocation row only when `canRequestLocation()` (KV-FE-031): tap → light haptic, spinner, `requestLocation()` with
   the ≈12 s timeout of the LB-APP-009 fix; `denied` → `city.locateDenied`, `fail` → `city.locateFail`; else
   `findNearestCity` (BR-APP-056: towns ≤ 16 km, then regions `zoom < 11` ≤ 110 km, then towns ≤ 110 km); none →
   `city.locateFar`; found → success haptic and immediate `onPick`. Coordinates stay on the device (F-PRIVACY-004).
6. Pick semantics, all through `selectCity()` of `@homi/search` (KV-FE-020), booleans coerced (LB-APP-007):
   - `first` and `header`: apply to the live filters (clear `districts`, `polygon`; keep `zones` only if the city has
     zones, `near_metro` only if `city.metro`, `below_median` only if `city.median`), reset an unavailable sort to
     `new`, scroll to top, `kv-city` + `PUT /api/settings {city}` (errors ignored, `city.js:20-27`), mark "picked this
     session" so the first-launch sheet does not return;
   - `nested`: change only the filters-sheet draft; the city is saved on «Показать» (KV-FE-050).
7. First-launch gate in the shell (KV-FE-045 renders it): more than one city **and** `meta.city_chosen === false`
   (strict) **and** not picked this session **and** no listing open (BR-APP-055).
8. Counts line from `GET /api/cities` (`stats`, refreshed when the filters sheet opens, KV-FE-050): legacy shows
   `rent_long` and `sale` only. DEV-023 flag `dev023CityCountsIncludeDaily` (default off) adds daily rent with a
   precise label.

## States and texts

| State | Shown when | Texts (keys, ru) |
| ----- | ---------- | ---------------- |
| title (header, nested) | always | `city.title` «Город» |
| title (first launch) | variant `first` | `city.firstTitle` «Где ищете жильё?» |
| geolocation idle | `canRequestLocation()` | `city.locate` «Определить по геопозиции» |
| locating (disabled row) | request pending | `city.locating` «Определяем…» + small spinner |
| denied | `requestLocation()` → `denied` | `city.locateDenied` «Нет доступа к геопозиции — выберите город из списка. Разрешить можно в настройках Telegram.» |
| failed / timeout | `fail` or timeout | `city.locateFail` «Не получилось определить, где вы, — выберите город из списка.» |
| too far | no city in range | `city.locateFar` «Рядом с вами наших городов пока нет — выберите из списка.» |
| city row | per `meta.cities` | city `name` (server string) + `city.counts` «{rent} аренда · {sale} продажа» when stats exist |
| loading counts | API-002 pending | rows without the counts line |
| error counts | API-002 failed | rows without the counts line (errors ignored, API-002) |
| empty | `meta.cities` length ≤ 1 | picker never opens; the header chip is hidden (KV-FE-048) |

DEV-023 (flag on): new key (not in legacy) `city.countsDaily` «{rent} аренда · {daily} посуточно · {sale} продажа»;
uz/en to be translated, product owner review.

## Interaction

- Row tap: light haptic, pick; the sheet closes (header/nested) or disappears (first launch).
- Gestures: drag-to-close from the grab area (start 6 px, close at 25 % or 0.5 px/ms, settle 200 ms) and backdrop tap —
  not in the `first` variant; the sheet scroll shows a header shadow when scrolled (`useScrolled`).
- Animation: `rise` sheet entrance from KV-FE-013; reduced motion → no transition.
- Layering: the nested picker renders over the filters sheet (z 60 city sheet over the z 50 backdrop, `03` §3.6).
- Responsive: phone-width sheet, max column 608 px, bottom safe-area padding; Telegram Desktop keeps the same sheet.

## Telegram integration

TMA-035 (LocationManager from 8.0, else browser geolocation), TMA-022 (Back closes header/nested variants only),
TMA-025 (light and success haptics), TMA-042 (version gates through KV-FE-024).

## Storage and analytics

- Storage: writes `kv-city` (mirrored to DeviceStorage, restored before the first data request — KV-FE-028).
- Analytics: `$pageview city` for the header variant only (legacy); the nested variant keeps `filters`. The first-launch
  variant was untracked (LB-APP-037); KV-FE-035 adds the new screen name `city/first` (not in legacy).

## Files

- `frontend/app/app/(miniapp)/features/city/CityPicker.tsx` (new)
- `frontend/app/app/(miniapp)/features/city/useCityPick.ts` (new: apply, save, session "picked" flag)
- `frontend/app/lib/deviations.ts` (flag `dev023CityCountsIncludeDaily`)
- `frontend/app/tests/city/CityPicker.test.tsx`, `frontend/app/e2e/city-picker.spec.ts`

## API contract

- API-002 `GET /api/cities` → `200 CityStats[]` (`code`, `counts {rent_long, rent_daily, sale}`, `presets`, `typical`);
  `counts` read without optional chaining when an entry exists; errors ignored.
- API-025 `PUT /api/settings` body `{"city": "<code>"}` → `200 SettingsResponse`; errors ignored (the local choice
  stands).
- `meta.cities[]` from API-001: `code`, `name`, `center`, `zoom?` (default 12; `< 11` = region, Q-APP-004), `metro`,
  `median`, `districts[]`, `zones[]`; `meta.city_chosen` strict `false` triggers the first-launch sheet (Q-APP-013).

## Business rules

- Kept: BR-APP-009 (city change), BR-APP-055 (first-launch condition), BR-APP-056 (nearest city), BR-APP-010 (server
  city at start-up, applied by KV-FE-040).
- Defect fixes `APPROVED` (policy): LB-APP-007 (no `undefined` booleans), LB-APP-009 (location timeout).
- DEV-023 `PROPOSED` behind its flag (`todo('DEV-023 PROPOSED')`).

## Acceptance criteria

- With `city_chosen: false` and three cities, the first-launch sheet blocks the app: no ×, Back and backdrop do
  nothing, and only a pick dismisses it; a pick sends `PUT /api/settings {"city": …}` once.
- Picking a city without metro clears `near_metro` to `false` (not `undefined`); a city without zones clears `zones`;
  `sort=center` falls back to `new` when the new city has no zones.
- Location denied / timeout / far each shows its exact text; success picks the nearest city with a success haptic.
- Nested variant: picking changes only the draft; closing the filters sheet without «Показать» keeps the old city.
- Visual: side by side with the `SCR-017` and `SCR-005` baselines — title, row layout, counts line, checkmark and the
  geolocation row equal (ru light).

## Tests

- Unit (`useCityPick.test.ts`): BR-APP-009 table (zones/metro/median × kept/cleared), sort fallback, booleans never
  `undefined`, saved-city write and the session flag.
- Component (`CityPicker.test.tsx`): three variants (close button, checkmark, Back registration), each locate outcome
  (mocked KV-FE-031 service), counts with and without stats, DEV-023 `todo('DEV-023 PROPOSED')`.
- E2E (`city-picker.spec.ts`, contract mocks): first launch → pick → feed for the new city; header chip → pick →
  feed re-created; filters sheet → nested pick → «Показать» saves the city.

## Edge cases

- `meta.cities` missing or empty: Tashkent from top-level `districts`/`zones` (API-001), picker unavailable.
- A listing deep link is open at first launch: the sheet waits until the listing closes (BR-APP-055).
- Location returns while the sheet was closed: the result is dropped.
- `stats` lacks the current city: row without counts, no crash.

## Security

- F-PRIVACY-004 / TMA-035: coordinates never leave the device; no analytics property carries them.
- SEC-REQ-021: city names are server strings rendered as text.
- SEC-REQ-033: geolocation is allowed by `Permissions-Policy` only on the Mini App host (KV-FE-033).

## Definition of done

`make ci-frontend` green; unit, component and E2E tests green (or added when KV-FE-010 lands); side-by-side review of
the SCR-005 and SCR-017 baselines recorded in the PR; parity gate G4 for F-ONBOARD-003 and F-FILTER-004 ticked
(`15` §4); the feature rows in `09` updated; PR reviewed by the other developer.
