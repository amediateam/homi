# KV-FE-015 — i18n runtime: `t()` that never throws, plurals, locale codes

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Frontend (track: development) |
| Complexity | M |
| Milestone | FE-1 (M9, stage S4; reused by the landing for S2) |
| Feature IDs | F-LOCALE-001, F-LOCALE-002 |
| Dependencies | — ; CF-006 (`uz` inside, `uz_Latn` at the legacy boundary); DEV-020 `PROPOSED` (one language detector); fixes LB-APP-002, LB-APP-032 |

## Goal

A new workspace package `@homi/i18n` provides the translation runtime for the Mini App and the landing: `t(key,
params)` and `plural(key, n, params)` that never throw (missing key → `ru` → the key itself, reported once), plural
forms through `Intl.PluralRules`, `{placeholder}` interpolation with the legacy semantics, the locale code mapping
`ru | uz | en` ↔ legacy `uz_Latn`, number and date locales as legacy, explicit label tables for server-driven enums,
and one language detector.

## Legacy reference

- Runtime: `$KVADRO_ROOT/demo/app/src/i18n/index.js:1-160` (`03` §3.1): dictionaries `ru`, `uz_Latn`, `en`; Intl locales
  `ru-RU`, `uz-Latn-UZ`, `en-GB`; number locale for `uz_Latn` = `ru-RU` (`:16-74`); `t()` returns `entry.other` for
  plural objects and **throws** on a missing key (`:118-121`, LB-APP-002); `plural()` falls back to `other` (`:131-144`);
  unknown `{placeholders}` stay as they are (`:100-110`); `setLocale` sets `<html lang>` to the first subtag and
  persists `kv-locale` (`:43-55`).
- Keys built at runtime from server values (`03` §3.1 table): `type.${type}`, `subs.mode.${mode}`,
  `market.v3.rooms${median_rooms}`, plus local `deal.*`, `owner.*`, `tenant.*`, `sort.*`, `report.*`, `found.*`,
  `noAccess.*`, `settings.theme.*`, `settings.graphics.*`, `sheet.market.*`, `sheet.posted.*`, `app.saved.*`.
- Language detection paths differ (LB-APP-032): `detectLocale` (`kv-locale`, then `uz*` only — `index.js:25-34`),
  `getTelegramLanguage` (`uz*` → `uz_Latn`, `en*` → `en`, else `ru` — `$KVADRO_ROOT/demo/app/src/lib/telegram/webApp.js:137-155`,
  TMA-008), boot script (`uz` / `ru` only — `$KVADRO_ROOT/demo/app/index.html:44-59`). DEV-020 proposes one detector.
- Before meta / after meta: BR-APP-050 (`meta.locale` wins after meta; `locale_chosen` gate).
- HOMI: `@homi/config` locales `ru`, `uz`, `en` (`frontend/packages/config/src/index.ts`); `@homi/utils` `intlLocale`
  (`uz` → `uz-Latn-UZ`); ADR-0006; `10` §5.10.

## Implementation

1. Create the workspace package `frontend/packages/i18n` (`@homi/i18n`, `type: module`, `exports` `.`) with
   `typecheck`/`lint` scripts like the other packages; announce the lockfile change in the PR.
2. `src/locale.ts`: `Locale = 'ru' | 'uz' | 'en'` (from `@homi/config`); `toLegacy(l)` (`uz` → `uz_Latn`),
   `fromLegacy(code)` (`uz_Latn` → `uz`, unknown → `ru`); `intlLocale(l)` (`ru-RU`, `uz-Latn-UZ`, `en-GB`);
   `numberLocale(l)` (`uz` → `ru-RU`, legacy rule; changing it is a DEV candidate, `10` §5.10); `htmlLang(l)`.
3. `src/runtime.ts`: `createI18n({catalogues, locale, onMissing})` returning `t`, `plural`, `has`, `setLocale`,
   `locale`. Lookup order: current locale → `ru` → the key string. `onMissing(key, locale)` fires once per key per
   session (a `Set`); the Mini App wires it to the error journal (KV-FE-034, `app_error` with `kind: 'i18n'`).
4. `plural(key, n)`: `new Intl.PluralRules(intlLocale(locale)).select(n)`; missing form → `other`; string entries get
   `{n}` interpolated; `t()` on a plural entry returns `other` (legacy).
5. Interpolation: `{name}` replaced when the param exists, else left verbatim (legacy); values stringified with
   `String()` — no HTML, no markup parsing.
6. `src/enum.ts`: `label(table, value, fallbackKey)` for server-driven values — tables `TYPE_KEYS`
   (`apartment, house, room, commercial, land`), `SUB_MODE_KEYS` (`instant, digest`), `DEAL_KEYS`, `REPORT_KEYS`; an
   unknown value returns the fallback label and reports once (LB-APP-002 fix: "map server enums through explicit tables
   with a default label"). Rooms for `market.v3.rooms<N>` are handled by KV-FE-066 (LB-APP-015).
7. `src/detect.ts`: `detectLocale({stored, telegramLanguage, mode})`:
   - DEV-020 on (`dev020SingleLanguageDetector`): stored `kv-locale` (legacy values accepted) → `uz*` → `uz`, `en*` →
     `en`, else `ru` — used by the boot shell, the pre-meta UI and the no-access screen alike;
   - DEV-020 off: the legacy split — pre-meta UI maps only `uz*` (as `detectLocale`), the no-access screen uses the
     Telegram mapping with `en` (as `getTelegramLanguage`), the boot screen maps `uz`/`ru`.
8. React binding `src/react.tsx` (`'use client'`): `I18nProvider`, `useT()`; locale switch re-renders in place (no
   reload — LB-APP-041 fix used by KV-FE-083).
9. Storage boundary: `kv-locale` keeps the legacy values (`ru`, `uz_Latn`, `en`) so the legacy client still reads it
   during the S4 canary; reading maps through `fromLegacy` (storage itself is KV-FE-028).

## States and texts

| Situation | Result |
| --------- | ------ |
| key present in the current locale | that string |
| key missing in `uz` / `en` | the `ru` string; `onMissing` once |
| key missing everywhere | the key itself (never a throw, never an empty string); `onMissing` once |
| plural entry with a missing form | `other` |
| unknown `{param}` | left as `{param}` |
| unknown server enum value | fallback label (e.g. `type.apartment` is **not** used; a neutral key per table) |

## Interaction

n/a (library). Locale switches are synchronous re-renders.

## Telegram integration

TMA-008 (`initDataUnsafe.user.language_code` or the hash `user` JSON — read by KV-FE-024 and passed in as
`telegramLanguage`).

## Storage and analytics

Reads `kv-locale` through KV-FE-028 (legacy values). Missing-key reports go to `app_error` (`kind: 'i18n'`,
`message` = the key, no user data), deduplicated per session and within the 5-per-session cap of KV-FE-034.

## Files

- `frontend/packages/i18n/{package.json,tsconfig.json}`, `src/{index,locale,runtime,enum,detect,react}.ts(x)` (new)
- `frontend/pnpm-lock.yaml` (workspace link)
- `frontend/packages/i18n/tests/*.test.ts` (after KV-FE-010)

## API contract

Boundary mapping only: legacy API locale values `ru | uz_Latn | en` (API-001 `locale`, API-024/API-025 `locale`,
`meta.locales[].code`) ↔ internal `ru | uz | en` (CF-006).

## Business rules

- Kept: BR-APP-050 (language before meta, `meta.locale` after); `uz` numbers formatted with `ru-RU`.
- LB-APP-002 fix (`APPROVED`, policy): no throw; fallback chain; enum tables with defaults.
- DEV-020 `PROPOSED`: single detector (flag; test `todo('DEV-020 PROPOSED')`).

## Acceptance criteria

- `t('nope')` returns `'nope'`, logs one report, and does not throw; a second call does not report again.
- `plural('listings', n)` in ru gives объявление / объявления / объявлений for 1, 2, 5, 11, 12, 14, 21, 22, 25, 101,
  111 (`15` §3.12 #6); uz and en use `one`/`other`.
- `fromLegacy('uz_Latn') === 'uz'`, `toLegacy('uz') === 'uz_Latn'`; unknown codes → `ru`.
- With DEV-020 off, a Telegram `en` user sees ru before meta (legacy); with it on, en.
- No package outside `@homi/i18n` calls `Intl.PluralRules` directly (grep check in review).

## Tests

Unit: fallback chain table above; plural matrix (`15` §3.12 #6); interpolation with missing params; enum label tables
with unknown values (`subs.mode.weekly`, `type.villa`); detector matrix (stored `uz_Latn`, `kk`, `en-GB`, `uz-Cyrl`,
empty) for both flag states; `onMissing` dedup.

## Edge cases

- Telegram language `uz-Cyrl`: maps to `uz` (Latin) like legacy (`uz*`).
- A catalogue value that is a plural object used through `t()`: returns `other`.
- `n` negative or fractional in `plural`: `Intl.PluralRules` decides (`other`); callers round first.

## Security

Interpolated values are inserted as text by React; the runtime never returns HTML (SEC-REQ-021). Missing-key reports
carry no user data (SEC-REQ-022).

## Definition of done

`make ci-frontend` green; unit tests green (after KV-FE-010); KV-FE-016 builds on it; PR reviewed by the other
developer.
