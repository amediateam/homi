# KV-FE-028 — Client storage and the DeviceStorage policy

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Frontend (track: development) |
| Complexity | S |
| Milestone | FE-1 (M9, stage S4) |
| Feature IDs | F-TMA-007 |
| Dependencies | KV-FE-024 (adapter, gate 9.0); consumers: KV-FE-015 (`kv-locale`), KV-FE-023 (boot prefetch waits for `kv-city`), KV-FE-026, KV-FE-027, KV-FE-044, KV-FE-054, KV-FE-057, KV-FE-080, KV-FE-086 |

## Goal

One typed storage module keeps every legacy `kv-*` key name and value format (so users keep their client settings when
S4 switches the app, `18` §12.1), declares per key whether it is local-only or mirrored to Telegram DeviceStorage and
restored, and restores mirrored keys **before** the first data request that needs them. No credential is ever stored.

## Legacy reference

- `$KVADRO_ROOT/demo/app/src/lib/storage.js:6-87` (`storageGet`, `storageSet` mirroring every key from 9.0, restore of
  `kv-nudge`, `kv-home`, `kv-city` with 1.5 s per key); `$KVADRO_ROOT/demo/app/src/app/useHomeScreenOffer.js:23-25`
  (restore runs in an effect after mount); `$KVADRO_ROOT/demo/app/src/main.jsx:25` (`kv-city` read for the prefetch).
- `03` §3.2 (key table), `$KVADRO_ROOT/docs/about.md` §9.1 (renaming keys resets users' settings).
- TMA-037 (DeviceStorage, gate 9.0), TMA-038 (CloudStorage, SecureStorage, BiometricManager, sensors: confirmed
  absence).
- Defects: LB-APP-012 (every key mirrored, only three restored), LB-APP-021 (restored values arrive too late).

## Implementation

1. `frontend/app/lib/storage/keys.ts` — the registry (names and formats unchanged):

   | Key | Format | Policy |
   | --- | ------ | ------ |
   | `kv-locale` | `ru` / `uz_Latn` / `en` (legacy codes kept on disk; mapped to `uz` in memory by KV-FE-015) | mirrored + restored |
   | `kv-city` | city code | mirrored + restored |
   | `kv-nudge` | JSON `{asked: string[≤40], closed, quietUntil, lastShown}` | mirrored + restored |
   | `kv-home` | JSON `{days: ['YYYY-MM-DD' ×≤10], offered}` | mirrored + restored |
   | `kv-new-<feature>` | `'1'` (only `pets` in use) | mirrored + restored |
   | `kv-theme` | `auto` / `light` / `dark` | local only (`meta.theme` wins at start) |
   | `kv-graphics` | `full` / `lite` (absent = auto) | local only (device-specific) |
   | `kv-graphics-measured` | `lite` | local only |
   | `kv-map-v2` | `gl` / `leaflet` | local only |
   | `kv-map-fit:<lat>,<lon>` | JSON `[lat, lon, zoom]` | local only |

   Fix of LB-APP-012: only keys that are restored are mirrored. `kv-locale` and `kv-new-*` become restored (legacy
   mirrored them without restoring).
2. `frontend/app/lib/storage/storage.ts`: `storageGet(key)`, `storageSet(key, value|null)` (local write; DeviceStorage
   `setItem`/`removeItem` only for mirrored keys and only when `supports('deviceStorage')`), every call in `try`;
   unknown keys are a type error (template literal types for `kv-new-*` and `kv-map-fit:*`).
3. `restoreFromDeviceStorage(keys = mirroredKeys)`: for each mirrored key missing locally, `DeviceStorage.getItem`
   with a 1.5 s timeout, all keys in parallel; never rejects.
4. Restore early (fix of LB-APP-021): the boot sequence (KV-FE-023, KV-FE-040) awaits the restore in parallel with the
   SDK wait of KV-FE-024; the first-feed prefetch starts immediately when `kv-city` exists locally, otherwise after the
   restore settles (≤ 1.5 s after the SDK is available). Server values still win after meta (`meta.city`,
   `meta.locale`, BR-APP-010).
5. Guard: a dev-time assertion and a unit test that no value matching an `initData` shape (`hash=`, `auth_date=`,
   `query_id=`) or a bearer token is ever passed to `storageSet`, `localStorage`, `sessionStorage` or DeviceStorage
   (SEC-REQ-007).
6. sessionStorage, IndexedDB, CloudStorage, SecureStorage and BiometricManager stay unused (TMA-038).

## States and texts

n/a — no UI. Module states: `restore: pending | done | unavailable (< 9.0 or no SDK)`.

## Interaction

n/a — no UI.

## Telegram integration

TMA-037 (`DeviceStorage.setItem/getItem/removeItem`, gate 9.0), TMA-038 (absences kept), TMA-042 (gate from the
KV-FE-024 table).

## Storage and analytics

- Storage: the ten legacy keys above, names and formats unchanged.
- Analytics: none. (Restore duration may be added to `app_launch` later; not part of parity.)

## Files

- `frontend/app/lib/storage/keys.ts`, `storage.ts`, `restore.ts` (new)
- `frontend/app/tests/storage/storage.test.ts`, `restore.test.ts`

## API contract

n/a — no HTTP calls.

## Business rules

- Kept: key names and formats (`03` §3.2); server profile wins after meta (BR-APP-010, BR-APP-050).
- LB-APP-012 and LB-APP-021 defect fixes `APPROVED` (policy).

## Acceptance criteria

- With a fresh localStorage and DeviceStorage holding `kv-city=samarkand`, the first feed request of the session uses
  `city=samarkand` (legacy used the default and applied the city only on the next launch).
- `kv-theme`, `kv-graphics*`, `kv-map-*` never reach DeviceStorage; the five mirrored keys always do (9.0+).
- On a 8.0 client no DeviceStorage call is made and nothing throws.
- A DeviceStorage that never answers delays the city-dependent prefetch by at most 1.5 s.
- No storage API ever receives `initData` or a token.

## Tests

- Unit (`storage.test.ts`): policy per key; write/remove mirrored and local keys; storage throwing; type-level test that
  an unknown key does not compile.
- Unit (`restore.test.ts`, fake DeviceStorage): missing keys restored, present keys untouched, timeout, `getItem`
  throwing, error callback.
- Unit (security): spy on all storage APIs during a full boot with a fake `initData` and assert no write contains it.

## Edge cases

- localStorage quota exceeded or disabled (private mode): reads return `null`, writes are ignored, the app still boots.
- DeviceStorage returns a value in a legacy format for `kv-nudge`/`kv-home`: the consumers (KV-FE-080, KV-FE-086)
  validate JSON and fall back to defaults.
- A user who used the legacy app keeps `kv-locale=uz_Latn`: read as `uz` in memory, written back unchanged.

## Security

SEC-REQ-007 (no credentials in localStorage, DeviceStorage, CloudStorage or cookies); TMA-009 (`initData` never
persisted); stored values contain no personal data beyond the city and UI preferences.

## Definition of done

`make ci-frontend` green; unit tests green (with KV-FE-010); parity gate G4 for F-TMA-007 ticked; `09` row updated;
PR reviewed by the other developer.
