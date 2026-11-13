# KV-FE-031 — Location service and nearest city

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Frontend (track: development) |
| Complexity | S |
| Milestone | FE-1 (M9, stage S4) |
| Feature IDs | F-ONBOARD-003, F-PRIVACY-004 |
| Dependencies | KV-FE-024 (adapter, gate 8.0); consumers: KV-FE-044 (city picker «Определить по геопозиции»), KV-FE-058 (map «Где я»), KV-FE-067 (fullscreen spot map) |

## Goal

One promise-based location request that uses Telegram's LocationManager when available, falls back to browser
geolocation, **always settles within about 12 s** (LB-APP-009 fixed), never sends the position to the server, and the
legacy nearest-city search used by the city picker.

## Legacy reference

- `$KVADRO_ROOT/demo/app/src/lib/geo/location.js:5-126` (`getLocationManager` 8.0+, `init`, `isLocationAvailable`,
  `isAccessRequested && !isAccessGranted` → `denied`, `getLocation`; browser fallback `enableHighAccuracy`, 12 000 ms
  timeout, `maximumAge` 60 000; `distanceKm` haversine with 12 742 km; `findNearestCity` 16 km / 110 km rule).
- TMA-035 (location; `openSettings` unused; no timeout on the Telegram path), SCR-044 (permission sheet), `03` §3.4
  (geolocation constants), §6.1 #4 (`zoom < 11` marks a region — `UNVERIFIED`, Q-APP-004).
- Rules: BR-APP-056 (nearest city: towns ≤ 16 km, then regions ≤ 110 km, then towns ≤ 110 km, else none).
- Privacy: `$KVADRO_ROOT/docs/about.md` §5.11 (the location never leaves the device), F-PRIVACY-004.
- Defect: LB-APP-009 (Telegram path can hang forever).

## Implementation

1. `frontend/app/lib/geo/location.ts`:
   - `requestLocation(): Promise<{lat, lon, accuracy|null} | 'denied' | 'fail'>`; never rejects;
   - Telegram path when gate 8.0 and `LocationManager` exists: `init` once (skip when `isInited`), then if
     `isLocationAvailable`: `isAccessRequested && !isAccessGranted` → `'denied'`; else `getLocation(cb)` → coordinates
     from `latitude`, `longitude`, `horizontal_accuracy`, or `'denied'` for a `null` answer;
   - otherwise browser `navigator.geolocation.getCurrentPosition` with `{enableHighAccuracy: true, timeout: 12000,
     maximumAge: 60000}`; `PERMISSION_DENIED` → `'denied'`, other errors → `'fail'`; no geolocation API → `'fail'`;
   - **fix LB-APP-009:** race the whole Telegram path (including `init`) against a 12 000 ms timer that resolves
     `'fail'`; late answers are ignored;
   - `canRequestLocation()` = gate 8.0 LocationManager or `'geolocation' in navigator`.
2. `frontend/app/lib/geo/nearestCity.ts`: `distanceKm([lat, lon], [lat, lon])` (haversine, Earth diameter 12 742 km)
   and `findNearestCity(point, cities)` with the BR-APP-056 order; `isRegion(city) = (city.zoom ?? 12) < 11` kept as
   legacy and marked `UNVERIFIED` (Q-APP-004) in a code comment.
3. Concurrency: one request at a time per caller; a second tap while pending returns the same promise.
4. The returned coordinates live only in component state; no module stores, logs or sends them (F-PRIVACY-004). The
   map and city picker use them locally (fly-to, nearest city); the city picker then saves only the **city code**.

## States and texts

Texts belong to the callers; the service returns `'denied'` / `'fail'` / coordinates. Keys used by them:

| State | City picker (KV-FE-044) | Map (KV-FE-058) / spot map (KV-FE-067) |
| ----- | ----------------------- | -------------------------------------- |
| idle | `city.locate` «Определить по геопозиции» | `map.locate` «Где я» (aria) |
| pending | `city.locating` «Определяем…» + spinner | spinner on the button |
| denied | `city.locateDenied` «Нет доступа к геопозиции — выберите город из списка. Разрешить можно в настройках Telegram.» | `map.locateDenied` «Нет доступа к геопозиции. Разрешить можно в настройках Telegram.» (5 s) |
| fail (incl. the new 12 s timeout) | `city.locateFail` «Не получилось определить, где вы, — выберите город из списка.» | `map.locateFail` «Не получилось определить, где вы.» (5 s) |
| no city near | `city.locateFar` «Рядом с вами наших городов пока нет — выберите из списка.» | n/a |
| success | city picked at once + success haptic | fly to zoom ≥ 15, blue dot, accuracy circle under 2 km |

## Interaction

Triggered only by an explicit tap (no location on launch). The native permission sheet (SCR-044) may appear; the
service waits for it within the 12 s budget.

## Telegram integration

TMA-035 (LocationManager `init`, `isLocationAvailable`, `isAccessRequested`, `isAccessGranted`, `getLocation`; gate 8.0
per TMA-042; `openSettings` stays unused), TMA-043 (browser geolocation outside Telegram), SCR-044.

## Storage and analytics

- Storage: none (the chosen city is saved by KV-FE-044 as `kv-city`).
- Analytics: none; coordinates never go to the journal or PostHog. Autocapture of the locate button sends only the
  click, no values (KV-FE-035 masks inputs).

## Files

- `frontend/app/lib/geo/location.ts`, `nearestCity.ts` (new)
- `frontend/app/tests/geo/location.test.ts`, `nearestCity.test.ts`

## API contract

n/a — no request carries coordinates. `meta.cities[].center` and `zoom` (API-001) are the input of `findNearestCity`.

## Business rules

- Kept: BR-APP-056 thresholds; browser options of `03` §3.4.
- LB-APP-009 defect fix `APPROVED` (policy): 12 s timeout on the Telegram path.
- F-PRIVACY-004: location stays on the device.

## Acceptance criteria

- LocationManager that never calls back → `'fail'` after 12 s (legacy hung).
- `isAccessRequested && !isAccessGranted` → `'denied'` without calling `getLocation`.
- Client 7.10 → browser path with the legacy options.
- Tashkent centre point → `tashkent`; a point 60 km away inside the region radius → the region code; 200 km away →
  `null`.
- A network capture of a full locate-and-pick flow shows no coordinates in any request.

## Tests

- Unit (`location.test.ts`, fake SDK and geolocation, fake timers): the paths above, `init` skipped when inited, late
  callback ignored after the timeout.
- Unit (`nearestCity.test.ts`): BR-APP-056 matrix (inside 16 km, region within 110 km, town within 110 km, none),
  missing `zoom` → town, ties by distance.
- E2E (with KV-FE-170): locate in the city picker with a mocked position; request log has no `lat`/`lon`.

## Edge cases

- `getLocation` answers `null` after the user denies in the sheet → `'denied'`.
- `init` throws: fall back to the browser path.
- Accuracy over 2 km: the map shows no accuracy circle (rule of KV-FE-058).
- `meta.cities` empty or without centres: `findNearestCity` returns `null` → `city.locateFar`.

## Security

F-PRIVACY-004 and SEC-REQ-036 (minimisation): the position is never transmitted or stored; `Permissions-Policy`
allows geolocation only on the Mini App origin (SEC-REQ-033, KV-FE-033).

## Definition of done

`make ci-frontend` green; unit tests green (with KV-FE-010); parity gate G4 for F-PRIVACY-004 ticked (F-ONBOARD-003 with
KV-FE-044); `09` rows updated; PR reviewed by the other developer.
