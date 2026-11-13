# KV-FE-016 — Mini App catalogues: 461 keys × ru/uz/en

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Frontend (track: development); new uz/en strings reviewed by the product owner |
| Complexity | M |
| Milestone | FE-1 (M9, stage S4) |
| Feature IDs | F-LOCALE-002 |
| Dependencies | KV-FE-015 (runtime); key list shared with KV-QA-002 / KV-QA-007 (`legacy-i18n-keys.json`); DEV-015 `PROPOSED` (whole-city label); fixes LB-APP-026 |

## Goal

The three legacy dictionaries become the typed catalogues of `@homi/i18n` — same keys, same values, same plural
objects, with `uz` as the catalogue name for `uz_Latn` — transcribed read-only and checked for key parity at build
time. The six dead keys are dropped, every key a fix or DEV adds is marked as new, and the full legacy key list is
emitted as `legacy-i18n-keys.json` so the enum-safety tests of KV-QA-007 can prove the legacy client never meets an
unknown key.

## Legacy reference

- Sources (read-only, release `plF_TOcT`, `03` §1 intro): `$KVADRO_ROOT/demo/app/src/i18n/locales/ru.js`,
  `uz_Latn.js`, `en.js` — each `export const <name> = {…}`, self-contained (no imports).
- Inventory (`03` §3.1): **461 top-level keys per locale**, none missing in any locale; **14 plural keys**: `listings`,
  `listing.rooms`, `details.daysOnMarket`, `details.publications`, `details.channels`, `details.views`,
  `actions.blockCount`, `map.missing`, `market.info.agoMin`, `market.info.agoHour`, `market.info.agoDay`,
  `market.v3.found`, `market.v3.district`, `market.v3.city` — ru forms `one/few/many/other` except `map.missing`
  (`one/other`); uz and en `one/other`.
- Families by prefix (`03` §3.1 table): `sheet` 67, `market` 50, `listing` 32, `found` 21, `toast` 19, `feed` 18,
  `fmt` 17, `settings` 17, … (the scratch parse of ru shows the same total, 461).
- Dead keys (LB-APP-026, `03` §3.1 "Unused keys"): `feed.historyHint`, `subs.count`, `subs.inFeed`, `subs.edit`,
  `subs.delete`, `subs.modeAria`.
- Strings outside the dictionaries (`03` §3.1): boot screen texts (`$KVADRO_ROOT/demo/app/index.html:31-33`, kept in
  the ES5 boot script of KV-FE-032), language-picker headings (`$KVADRO_ROOT/demo/app/src/features/onboarding/LanguagePicker.jsx:12-16`,
  kept as a constant in KV-FE-043), Instagram handle, methodology URLs (KV-FE-066), Uzbek short months
  (`yan … dek`, KV-FE-018).
- Release history: 2026-11-06 uz changes (`details.facts` «Xususiyatlar», `details.publications` «nashr»,
  `details.channels` «kanal») and `sum.zonesBoth`; 2026-11-07 `card.ownerVerified`
  (`$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:27,41,50`).
- QA: KV-QA-002 step 8 writes `backend/tests/Fixtures/Legacy/legacy-i18n-keys.json` (key paths per locale); KV-QA-007
  consumes it; `15` §3.12.

## Implementation

1. Import method (one-time, reproducible, read-only): copy the three locale files into a scratch directory outside both
   repositories, run `node scripts/migration/import_legacy_i18n.mjs <scratchDir>` (Node 26 built-ins only: dynamic
   `import()` of the copies, `JSON.stringify`), which writes
   `frontend/packages/i18n/src/catalogues/{ru,uz,en}.json` (`uz` from `uz_Latn`) with keys sorted and plural objects
   kept as objects. Never run anything inside the legacy tree.
2. The script also writes the **full legacy key list** (461 keys × 3 locales, plural form names included, no values) in
   the format of KV-QA-002 step 8. Whichever task lands first commits
   `backend/tests/Fixtures/Legacy/legacy-i18n-keys.json`; the other verifies byte equality in CI.
3. Drop the six dead keys from the new catalogues (they stay in the legacy key list). Add new keys with a marker
   comment in `frontend/packages/i18n/src/catalogues/NEW_KEYS.md` (key, ru text, source LB/DEV, uz/en "to be translated,
   product owner review"):
   - `error.sessionExpired` «Сессия устарела — закройте и откройте приложение снова» (LB-APP-047, KV-FE-036);
   - `sum.wholeCityGeneric` «Весь город» (DEV-015 `PROPOSED`, used only when the flag is on, KV-FE-020);
   - keys the screen tasks of FE-2 add later are appended to the same file by those tasks.
4. `src/catalogues/index.ts`: `export type Catalogue = typeof ru` (via `resolveJsonModule`), `uz satisfies Catalogue`,
   `en satisfies Catalogue` — a missing or extra key fails `tsc` (build-time parity, F-LOCALE-002 target "typed
   catalogue with build-time key check").
5. A `MessageKey` union type exported for `t()` so call sites are typo-checked; runtime-built keys use the enum tables of
   KV-FE-015.
6. Plural check: a test asserts the 14 plural keys keep their object shape and ru forms `one/few/many/other`
   (`map.missing` `one/other`).
7. Do not edit any value during import. Copy fixes (wrong grammar, mixed units) belong to the DEV rows and the tasks
   that apply them behind flags.

## States and texts

n/a — catalogue content. The values are the legacy ones; examples used across FE-2: `tab.search` «Поиск»,
`common.saveFailed` «Не получилось сохранить», `error.offline` «Нет связи», `app.openViaBot` «Откройте приложение
через бота в Telegram.».

## Interaction

n/a.

## Telegram integration

n/a.

## Storage and analytics

n/a.

## Files

- `scripts/migration/import_legacy_i18n.mjs` (new; Node built-ins only)
- `frontend/packages/i18n/src/catalogues/{ru,uz,en}.json`, `index.ts`, `NEW_KEYS.md` (new)
- `backend/tests/Fixtures/Legacy/legacy-i18n-keys.json` (new or verified, shared with KV-QA-002)
- `frontend/packages/i18n/tests/catalogues.test.ts` (after KV-FE-010)

## API contract

n/a.

## Business rules

- LB-APP-026 fix (`APPROVED`): dead keys removed from the new catalogues; `sum.wholeCity` «Весь Ташкент» kept for the
  flag-off path.
- DEV-015 `PROPOSED`: `sum.wholeCityGeneric` exists but is used only behind `dev015NeutralWholeCity`.

## Acceptance criteria

- `ru`, `uz`, `en` catalogues each have 455 legacy keys (461 − 6) plus the keys listed in `NEW_KEYS.md`; `tsc` fails if
  one locale misses a key.
- A diff of every legacy key's value between the legacy file and the catalogue is empty (script `--verify` mode run on
  the scratch copy).
- The 14 plural keys keep their forms.
- `legacy-i18n-keys.json` lists all 461 keys per locale and matches the KV-QA-002 output byte for byte.

## Tests

`catalogues.test.ts`: key-set equality across locales; plural shape; no empty string values; placeholders equal across
locales for every key (`{n}`, `{city}`, … same set — `15` §3.12 #3 for the client side); new keys present in all three
locales (uz/en may temporarily repeat ru with a `TODO(translation)` marker that the test reports as a warning list).

## Edge cases

- A key present in ru but whose uz value equals the ru value (untranslated legacy string): kept as legacy.
- The ru plural `other` form differs from `many` (legacy `listings.other` «объявления»): kept verbatim.
- Values with emoji (`📢`, `📡`, `🐾`) and non-breaking spaces: preserved byte for byte.

## Security

No user data in catalogues. Values are rendered as text by the runtime (SEC-REQ-021). The script reads only the copied
files and writes only inside this repository.

## Definition of done

`make ci-frontend` green; tests green (after KV-FE-010); `NEW_KEYS.md` sent to the product owner for uz/en review;
KV-QA-007 can consume the key list; PR reviewed by the other developer.
