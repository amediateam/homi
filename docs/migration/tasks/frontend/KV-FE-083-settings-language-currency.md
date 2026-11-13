# KV-FE-083 — Settings › Language and Currency, without a reload

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Frontend (track: development) |
| Complexity | S |
| Milestone | FE-2 (M9, stage S4) |
| Feature IDs | F-LOCALE-001, F-SETTINGS-004 |
| Dependencies | KV-FE-081 (settings screen), KV-FE-015 (i18n runtime, `uz` ↔ `uz_Latn`), KV-FE-017 (money formatting, currency state), KV-FE-023 (request cache invalidation); backend KV-BE-045 (API-024, API-025), KV-BE-020 (server strings follow currency and locale); decisions: DEV-016 `PROPOSED`; Q-APP-011 |

## Goal

The language (SCR-035) and currency (SCR-036) sub-pages save the choice to the profile — which also drives the bot and
the listing cards it sends — and switch the Mini App **in place**: catalogues, number formats and every server-formatted
string are refreshed without the legacy full page reload (LB-APP-041), so in-memory state (tabs, filters, scroll,
favourites of the session) survives and no boot sequence re-runs.

## Legacy reference

- SCR-035, SCR-036 (`03` §2): `$KVADRO_ROOT/demo/app/src/features/settings/SettingsPages.jsx:50-86` (`LanguagePage`,
  `CurrencyPage`), `SettingsScreen.jsx:115-127` (`saveAndReload`: save, `saveLocale`, `location.reload()`; failure →
  haptic only).
- Server-formatted values (`price`, `age`, `title`, map `label`, flow `label/rate`, dictionary names): `03` §1.12; client
  money rules `03` §3.5 (`meta.currency`, `meta.usd_uzs`).
- Rules: BR-APP-051 (language and currency: save, then reload — changed here by the approved fix), BR-APP-050 (after
  meta, `meta.locale` wins), BR-APP-060 (UZS only with a rate > 0), BR-API-146 (reload after locale/currency).
- Defects: LB-APP-041 (full reload; fix `APPROVED`, internal), LB-APP-027 → DEV-016 (failure only vibrates).
- No KV-QA-019 baseline; compare with the legacy sub-page markup and the SCR-032 row styles.

## Implementation

1. `frontend/app/app/(miniapp)/features/settings/LanguagePage.tsx`: sub-page titled `notify.language` with hint
   `notify.languageHint`; options are `settings.locales` (`{code, name}`) from API-024; the current one checked.
2. Pick a different locale → light haptic → `PUT /api/settings {locale: <wire code>}` (`uz` is sent as `uz_Latn`,
   KV-FE-015) → on success:
   - `setLocale(code, {persist: true})` of KV-FE-015 (writes `kv-locale` per the storage policy of KV-FE-028, swaps the
     catalogue, number locale `ru-RU` / `en-GB`, `<html lang>`);
   - invalidate every cached server-formatted response in the request cache (KV-FE-023): meta, cities, feed pages,
     count/flow, map points, listing details, favourites, history, hidden, subscriptions; re-fetch `GET /api/meta` and
     `GET /api/settings`; visible lists refetch their first page and keep the scroll position when items remain;
   - the open sub-page stays open and now reads in the new language.
3. `CurrencyPage.tsx`: titled `notify.currency`, hint `notify.currencyHint`, options `settings.currencies`. Pick → `PUT
   /api/settings {currency}` → on success re-fetch `GET /api/meta` (new `currency` and `usd_uzs`), `setCurrency()` of
   KV-FE-017, and the same cache invalidation (server price strings follow the profile currency, Q-APP-011).
4. Failure of the `PUT` → nothing changes, error haptic; with DEV-016 (flag `dev016ErrorToastOnFailure`) toast
   `common.saveFailed`. Failure of the follow-up re-fetch → keep the new locale/currency, show stale server strings, retry
   on the next screen load (no reload).
5. While the save is in flight the options are disabled (prevents a second `PUT`).
6. The fix is `APPROVED` by policy, so there is no flag. If a staging run shows server strings that do not follow the
   profile after a re-fetch (Q-APP-011), record it in the PR and in `09`; the backend fix belongs to KV-BE-020.

## States and texts

| State | Texts (keys, ru) |
| ----- | ---------------- |
| language page | title `notify.language` «Язык»; options = `settings.locales[].name` (server); hint `notify.languageHint` «Для приложения, бота и карточек объявлений.» |
| currency page | title `notify.currency` «Валюта»; options = `settings.currencies[].name` (e.g. «Доллары ($)», «Сумы»); hint `notify.currencyHint` «Цены в ленте, на карте и в карточках бота.» |
| saving (disabled) | option rows disabled; the checked row stays on the old value until success |
| success | check moves; texts, numbers and prices switch in place |
| error | error haptic; with DEV-016 `common.saveFailed` «Не получилось сохранить» |
| loading / empty | n/a (options come with API-024, already loaded by KV-FE-081) |

## Interaction

- Sub-page chrome from KV-FE-013 (slide-in, swipe-back except Android, Back).
- After a language switch the tab labels, sheet texts and the Telegram-side command menu (bot, server side) follow the
  new language; the current scroll and open tab stay.

## Telegram integration

TMA-008 (Telegram language is only the pre-meta default; the profile wins afterwards), TMA-022 (Back), TMA-025 (haptics).
No reload means no new `initData` read and no re-run of the boot sequence (TMA-001…TMA-005 untouched).

## Storage and analytics

- `kv-locale` (`ru` / `uz_Latn` / `en`, mirrored to DeviceStorage per KV-FE-028) written on success; the stored value
  keeps the legacy wire code so the legacy client and the boot screen read it unchanged.
- No events; PostHog super properties are not locale-bound. `$pageview settings/language`, `settings/currency` through
  KV-FE-035 (proposed names).

## Files

- `frontend/app/app/(miniapp)/features/settings/LanguagePage.tsx`, `CurrencyPage.tsx` (new)
- `frontend/app/lib/settings/applyProfileChange.ts` (new: save, switch, invalidate, re-fetch)
- `frontend/app/tests/settings/applyProfileChange.test.ts`, `frontend/app/e2e/settings-language.spec.ts`

## API contract

- API-025 `PUT /api/settings {"locale": "ru"|"uz_Latn"|"en"}` or `{"currency": "USD"|"UZS"}` → `200 SettingsResponse`.
  `uz` or `uz-Latn` on the legacy wire → `422` (KV-BE-045), so the client always maps to `uz_Latn`.
- API-001 `GET /api/meta` re-fetched for `locale`, `currency`, `usd_uzs`, dictionary names.
- API-024 `GET /api/settings` re-fetched for localised option names.
- Errors: `422`, `401`, `403 <reason>`, `429`, network → no change.

## Business rules

- Kept: BR-APP-050, BR-APP-060; BR-APP-051 for the save itself.
- Defect fix `APPROVED` (policy): LB-APP-041 (in place instead of reload; changes BR-API-146 behaviour on purpose).
- DEV-016 `PROPOSED` (flag).

## Acceptance criteria

- Switching ru → en changes the tab labels, the settings rows and number separators (`$1,200`) without a navigation or
  reload (no second `app_launch` event, no boot screen flash); the feed's server price strings are re-fetched.
- Switching USD → UZS shows prices in сум after the re-fetch; with `usd_uzs` 0 the client keeps USD (BR-APP-060).
- The search tab keeps its filters and scroll after a language change.
- A failing `PUT` leaves language and currency unchanged.

## Tests

- Unit `applyProfileChange.test.ts`: wire mapping `uz` → `uz_Latn`; invalidation list; re-fetch order; failure leaves
  state; `todo('DEV-016 PROPOSED')`.
- E2E (contract mocks): language switch updates texts and sends exactly one `PUT` and one `GET /api/meta`; no reload
  (page object identity kept); currency switch updates a feed card price string.

## Edge cases

- The user switches language twice quickly → the second waits for the first `PUT`; the final state is the last choice.
- An open listing during a currency change → its details refetch; the CTA price updates.
- `kv-locale` unavailable (storage blocked) → in-memory only; the server profile restores it next launch.

## Security

- SEC-REQ-017 (only codes from the server lists are sent), SEC-REQ-021 (server names as text), SEC-REQ-007.

## Definition of done

`make ci-frontend` green; tests green (or added with KV-FE-010); review recorded in the PR; parity gate G4 for
F-LOCALE-001 and F-SETTINGS-004 ticked (`15` §4); rows in `09` updated; PR reviewed by the other developer.
