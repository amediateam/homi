# KV-FE-053 — Filters: «Где искать» — area, zones, metro, districts

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Frontend (track: development) |
| Complexity | M |
| Milestone | FE-2 (M9, stage S4) |
| Feature IDs | F-FILTER-001, F-MAP-002 |
| Dependencies | KV-FE-050 (sheet frame and the draw hand-off); uses `toggleZone`, `toggleDistrict`, `clearPolygon` of KV-FE-020; related: the drawing itself is KV-FE-060; decisions: Q-API-013 (legacy `zone` key), DEV-004 (server normaliser) |

## Goal

Section 7 of the full filters sheet (SCR-014) lets the user choose exactly one geography mode — a drawn area, one or
both zones, or a set of districts — plus the independent «🚇 Рядом с метро», with the legacy labels per city and the
hand-off to drawing on the map.

## Legacy reference

- SCR-014 section 7 (`03` §2); `$KVADRO_ROOT/demo/app/src/features/filters/sheet/LocationSections.jsx:33-131`
  (`WhereSection`); `options.js:4` (`ZONE_OPTIONS = ['center', 'near_center']`); draw hand-off
  `$KVADRO_ROOT/demo/app/src/app/App.jsx:393-402` (`drawFromSheet`); `onDraw` is passed only to the search-mode sheet
  (`App.jsx:570-600`).
- Rules: BR-APP-008 (mutually exclusive geography, canonical zone order, metro independent), BR-APP-061 (polygon
  format, produced by KV-FE-060), BR-APP-064 (summary labels «Своя область», «Центр и ближе к центру»).
- Contract: `zones` repeated query key (since 2026-11-06; `zone` before, Q-API-013), `districts` repeated, `polygon`
  `lat,lon;…` (3–40 vertices), `near_metro=true` only when set (`08` §1.7).
- Visual baseline (KV-QA-019): `filters-sheet` → `SCR-014-*.png` (scrolled to «Где искать» if captured; otherwise
  compare against the legacy layout).

## Implementation

1. `frontend/app/app/(miniapp)/features/filters/sections/WhereSection.tsx` with `{filters, update, city, onDraw?}`.
2. Heading `sheet.where`.
3. Area row (only when a polygon exists **or** `onDraw` is provided, i.e. search mode):
   - polygon set → highlighted chip with the lasso icon `sheet.drawAreaOn`; tap removes the polygon
     (`polygon: null`);
   - no polygon → chip `sheet.drawArea`; tap calls `onDraw({...filters, districts: [], zones: []})` → the sheet saves
     the city if changed, closes, switches to the map and starts drawing (KV-FE-050, KV-FE-060).
4. Zones and metro row (only when the city has zones or `metro`): one chip per `city.zones[]` — `sheet.zone.center` for
   `center`, `sheet.zone.near_center` otherwise; toggling keeps the canonical order `center, near_center` and clears
   `districts` and `polygon`; «🚇 Рядом с метро» (`sheet.nearMetro`) only when `city.metro`, toggles `near_metro`
   without touching the other modes.
5. Districts: caption — `sheet.orDistricts` when the city has zones, `sheet.districts` for Tashkent without zones,
   `sheet.districtsRegion` otherwise; shown only when the city has districts. One chip per `city.districts[]`
   (server `name`); toggling adds/removes the code and clears `zones` and `polygon`.
6. All values are codes from `meta.cities[]`; nothing is translated client-side except the zone and metro labels.
7. Chips are buttons with `aria-pressed`; the district chips wrap (no horizontal scroll).

## States and texts

| State | Shown when | Texts (keys, ru) |
| ----- | ---------- | ---------------- |
| heading | always | `sheet.where` «Где искать» |
| draw | search mode, no polygon | `sheet.drawArea` «Обвести на карте» |
| area on | polygon set | `sheet.drawAreaOn` «Своя область на карте» (highlighted; tap removes) |
| zones | city has zones | `sheet.zone.center` «🏛 Центр», `sheet.zone.near_center` «🏙 Ближе к центру» |
| metro | `city.metro` | `sheet.nearMetro` «🚇 Рядом с метро» |
| districts caption | city has districts | `sheet.orDistricts` «Или районы:» / `sheet.districts` «Районы:» / `sheet.districtsRegion` «Районы области (необязательно):» |
| districts | city has districts | server district names |
| meta loading | `city = null` | only the area row (if applicable) |
| radar modes | create / edit | area row only when a polygon exists (remove only), no draw entry |

## Interaction

- Taps only; chip haptics from the chip primitive; any change re-runs the live count (KV-FE-050).
- Draw hand-off: the sheet closes with its normal animation, the map appears in drawing mode with the top-bar hint
  (KV-FE-045).
- Responsive: chip rows wrap; at 320 px the district list grows the sheet body, which scrolls.

## Telegram integration

TMA-022: after the draw hand-off, Back cancels drawing (KV-FE-060) and does not reopen the sheet (legacy).

## Storage and analytics

- Storage: `kv-city` when the draw hand-off changes the city (KV-FE-050).
- Analytics: `$pageview map/draw` comes from the drawing layer (KV-FE-060); none here.

## Files

- `frontend/app/app/(miniapp)/features/filters/sections/WhereSection.tsx` (new)
- `frontend/app/tests/filters/WhereSection.test.tsx`

## API contract

n/a — draft only. Values travel as `zones` (repeated), `districts` (repeated), `near_metro=true`, `polygon` in
`FilterQuery` (`08` §1.7); radar bodies carry `zones: []`, never `zone` (Q-API-013).

## Business rules

- Kept: BR-APP-008, BR-APP-061 (via KV-FE-060), BR-APP-064.
- The server normaliser (DEV-004, KV-BE-016) enforces the same exclusivity for bot-created radars; the client never
  sends two modes at once.

## Acceptance criteria

- Selecting «Ближе к центру» then «Центр» stores `zones = ['center', 'near_center']` and clears districts and polygon.
- Selecting a district after a zone clears the zones; selecting a zone after districts clears the districts.
- «Рядом с метро» toggles independently of zones and districts and is absent for a city without metro.
- Tashkent without zones shows «Районы:»; a region city shows «Районы области (необязательно):».
- «Обвести на карте» closes the sheet and opens the map in drawing mode with districts and zones cleared; with a polygon
  the chip «Своя область на карте» removes it.
- Visual: the «Где искать» block matches the legacy layout (baseline `SCR-014` or the legacy harness screenshot).

## Tests

- Component (`WhereSection.test.tsx`): exclusivity table (polygon / zones / districts × each action), canonical zone
  order, caption per city type, area row per mode, draw callback payload.

## Edge cases

- City with zones but no districts; city with neither (section shows only the heading and possibly the area row) —
  legacy behaviour kept.
- A stored radar with legacy `zone: "center"` (Q-API-013): the server returns `zones` (KV-BE-016); the client never reads
  `zone`.
- Polygon set and the city changes: the city transition clears the polygon (KV-FE-044).

## Security

- SEC-REQ-021: district names are server strings rendered as text.
- SEC-REQ-017: only codes present in `meta.cities[]` are sent.

## Definition of done

`make ci-frontend` green; component tests green (or added when KV-FE-010 lands); side-by-side review recorded in the
PR; parity gate G4 for F-FILTER-001 and F-MAP-002 (with KV-FE-060) ticked (`15` §4); the `09` rows updated; PR reviewed
by the other developer.
