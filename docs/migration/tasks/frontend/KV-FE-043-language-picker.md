# KV-FE-043 — First-launch language picker

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Frontend (track: development) |
| Complexity | S |
| Milestone | FE-2 (M9, stage S4) |
| Feature IDs | F-ONBOARD-002, F-LOCALE-001 |
| Dependencies | KV-FE-040 (gate, `refreshMeta`); uses KV-FE-012 (buttons), KV-FE-015 (locale switch in place), KV-FE-029 (haptics), KV-FE-014 (toast for DEV-016); backend KV-BE-045 (API-025); decisions DEV-016 `PROPOSED`, DEV-020 `PROPOSED`, Q-APP-013 |

## Goal

On the first launch (server says `locale_chosen` is false) the user must pick the interface language from the server's
list, with the Telegram language first; the choice is saved to the server and applied **in place** — no full page
reload (LB-APP-041) — after which the app continues to the shell.

## Legacy reference

- SCR-004 (`03` §2): `$KVADRO_ROOT/demo/app/src/features/onboarding/LanguagePicker.jsx:12-64` (hard-coded headings,
  Telegram language first, `saveSettings({locale})`, `saveLocale`, `window.location.reload()`, error haptic only);
  `$KVADRO_ROOT/demo/app/src/app/App.jsx:234-236` (gate `meta && !meta.locale_chosen`);
  `$KVADRO_ROOT/demo/app/src/styles/misc.css:36-39` (first button accent-coloured).
- TMA-008 (Telegram language: `uz*` → uz, `en*` → en, else ru — this component already maps `en`).
- Rules: BR-APP-050 (first launch requires an explicit choice), BR-APP-051 (language: save then reload — replaced).
- Defects: LB-APP-041 (full reload, fixed), LB-APP-027 → DEV-016 (failure with haptic only), LB-APP-032 → DEV-020.
- Visual baseline: KV-QA-019 "meta with `locale_chosen: false`" → `SCR-004`.

## Implementation

1. `frontend/app/app/(miniapp)/features/onboarding/LanguagePicker.tsx` (Client Component), rendered by the gate of
   KV-FE-040 when `meta && !meta.locale_chosen`.
2. Headings are **not** catalogue texts (the catalogue language is what the user is choosing): a constant
   `CHOOSE_LANGUAGE = {ru: 'Выберите язык', uz: 'Tilni tanlang', en: 'Choose a language'}`; `h1` in the Telegram
   language (KV-FE-024 code → KV-FE-015 detector, fallback ru); the subtitle joins the other two with « · ».
3. Buttons from `meta.locales` (`{code, name}`, names as sent by the server), sorted with the Telegram language first,
   the rest in server order; the first button uses the accent style.
4. Tap: medium haptic; disable all buttons; `PUT /api/settings {"locale": "<code>"}` with the wire code (`uz_Latn` for
   Uzbek, CF-006); on success write `kv-locale` (mirrored, KV-FE-028), switch the i18n locale in place
   (`setLocale`, KV-FE-015) and call `refreshMeta()` (KV-FE-040) — the new meta has `locale_chosen: true`, so the gate
   moves on to the shell and the server-formatted strings arrive in the new language. No `location.reload()`.
5. On failure: error haptic, buttons re-enabled (legacy); with `dev016ErrorToasts` on also the toast `common.saveFailed`
   «Не получилось сохранить» (KV-FE-014).
6. Globe icon in an `empty-icon` circle (icon set per KV-FE-005; inline SVG until approved).

## States and texts

| State | UI | Texts |
| ----- | -- | ----- |
| idle | globe, h1, subtitle, language buttons | «Выберите язык» / «Tilni tanlang» / «Choose a language» (constant, not i18n); button labels = `meta.locales[].name` |
| saving (disabled) | all buttons disabled | — |
| error | buttons enabled again; error haptic; toast with DEV-016 | `common.saveFailed` «Не получилось сохранить» (DEV-016 only) |
| success | picker unmounts, shell renders in the chosen language | — |
| empty | `meta.locales` empty (should not happen) | fall back to the three known locales with their native names «Русский», «Oʻzbekcha», «English» |

## Interaction

- Single tap per button; double taps ignored while saving.
- No Back handler (a base state; Telegram shows Close). No gestures, no animation besides the button press state.
- Responsive: centred column (`lang-pick`), full-width buttons up to the 608 px column.

## Telegram integration

TMA-008 (language code for ordering and the heading), TMA-025 (medium impact on tap, error notification on failure).

## Storage and analytics

- Writes `kv-locale` (wire code kept as legacy `uz_Latn` for Uzbek; mirrored + restored, KV-FE-028).
- Analytics: legacy none; new `$pageview onboarding/language` (KV-FE-035, LB-APP-037 fix).

## Files

- `frontend/app/app/(miniapp)/features/onboarding/LanguagePicker.tsx` (new)
- `frontend/app/tests/onboarding/LanguagePicker.test.tsx`; `frontend/app/e2e/language-picker.spec.ts`

## API contract

- API-025 `PUT /api/settings` body `{"locale": "ru"|"uz_Latn"|"en"}` → `200` full `SettingsResponse` (not read here);
  any error → state "error".
- API-001 `GET /api/meta` re-fetched by `refreshMeta()` → `locale_chosen: true`, `locale` = the chosen code.

## Business rules

- Kept: BR-APP-050 (explicit choice on first launch); Telegram language first.
- LB-APP-041 defect fix `APPROVED` (policy): no reload; BR-APP-051's reload for language is replaced by `refreshMeta()`.
- DEV-016 `PROPOSED` (error toast; flag `dev016ErrorToasts`, test `todo('DEV-016 PROPOSED')`).
- DEV-020 `PROPOSED`: the same detector orders the list (no change for this component, which already maps `en`).

## Acceptance criteria

- With Telegram language `en`, the heading is «Choose a language», the subtitle «Выберите язык · Tilni tanlang», and
  English is the first (accent) button.
- Tapping «Oʻzbekcha» sends `{"locale":"uz_Latn"}` once, then the shell renders in Uzbek without a page reload
  (`performance.navigation` unchanged, no second `app_launch`).
- A `500` on save re-enables the buttons and keeps the picker; with DEV-016 on, the toast appears.
- Visual: side by side with the `SCR-004` baseline (ru Telegram language) of KV-QA-019.

## Tests

- Component (`LanguagePicker.test.tsx`): ordering for `ru`, `uz-UZ`, `en-US`, `de`; heading/subtitle per language;
  disabled while saving; error path.
- E2E (`language-picker.spec.ts`, contract mocks): meta `locale_chosen: false` → pick `en` → `PUT` body → meta refetch
  → shell in English; no navigation event.
- `todo('DEV-016 PROPOSED')`: toast on failure.

## Edge cases

- Q-APP-013 (when `locale_chosen` can be false again): the gate shows the picker whenever meta says so, even later in a
  session after `refreshMeta()`.
- The user closes the app during saving: the server may have saved; the next launch skips the picker.
- `PUT` succeeds but the meta refetch fails: keep the chosen locale locally, mark meta as stale and retry per the
  KV-FE-040 retry table; the picker stays hidden only once meta confirms `locale_chosen`.

## Security

SEC-REQ-017 (the locale is one of the server-listed codes; arbitrary values are never sent), SEC-REQ-014 (settings are
owner-scoped on the server).

## Definition of done

`make ci-frontend` green; component and E2E tests green (with KV-FE-010); SCR-004 baseline review recorded; parity gate
G4 for F-ONBOARD-002 ticked (F-LOCALE-001 with KV-FE-040, KV-FE-083); `09` rows updated; PR reviewed by the other
developer.
