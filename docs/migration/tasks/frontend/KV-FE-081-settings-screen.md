# KV-FE-081 — Settings screen and «О приложении»

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Frontend (track: development) |
| Complexity | M |
| Milestone | FE-2 (M9, stage S4) |
| Feature IDs | F-SETTINGS-001, F-SETTINGS-007 |
| Dependencies | KV-FE-012 (settings group, row, choice list primitives), KV-FE-013 (sub-page primitive), KV-FE-045 (app shell, tab), KV-FE-086 (home-screen row); backend KV-BE-045 (API-024, API-025), KV-BE-042 (API-026), KV-BE-022 (API-003), KV-BE-101 (API-018, digest radars for the hint); decisions: FD-8 (brand strings), Q-API-029 |

## Goal

The «Настройки» tab (SCR-032) shows the legacy groups and rows with their current values — appearance, language and
currency, delivery times, «Скрытое», «О приложении» — loads its data in parallel with one retryable error state, and
opens the sub-pages of KV-FE-082…KV-FE-085 as layers. Nothing is added that the legacy screen did not have (no city,
news toggle, privacy or account rows: those are bot functions).

## Legacy reference

- Since legacy release `index-BnFvC-Ft.js`: the group «Чат с ботом» with the row «Вид карточек» and its sub-page
  (SCR-048, BR-APP-074; built in WP-31).
- SCR-032 (`03` §2): `$KVADRO_ROOT/demo/app/src/features/settings/SettingsScreen.jsx:38-222` (parallel loads `:57-69`,
  error and spinner `:71-80`, groups `:141-197`, sub-pages `:198-219`), `AboutGroup.jsx:17-52`, `format.js:9-37`
  (`formatQuietHours`, `formatDays`, `INSTAGRAM_URL`, `graphicsAutoLabel`), `SettingsGroup.jsx`, `SettingsRow.jsx`,
  `SubPage.jsx:16-30`.
- Settings button: TMA-023 (`$KVADRO_ROOT/demo/app/src/app/useTelegramButtons.js:10-23`).
- Rules: BR-APP-051 (save semantics per row, implemented in the sub-pages), BR-APP-052 (graphics row on Android or when
  changed), BR-APP-053 («Скрытое» group only when something is hidden), BR-APP-045 (home-screen row on `missed` /
  `unknown`).
- Not in the Mini App: city setting, news toggle, privacy policy, data deletion, account (`03` SCR-032; `05` §2).
- Visual baseline: KV-QA-019 scenario `tab-settings` → `docs/migration/visual-baseline/SCR-032-*.png`.

## Implementation

1. `frontend/app/app/(miniapp)/features/settings/SettingsScreen.tsx`: on mount and on retry, start in parallel
   `GET /api/settings` (required), `GET /api/subscriptions` (only to know whether an active digest radar exists, for
   KV-FE-084), `GET /api/hidden` (row and count), `GET /api/bot` (support account); only the settings request decides
   loading and error; the others fail silently.
2. Groups and rows (icons from the set approved in KV-FE-005: palette, gauge, globe, coins, moon, clock, eye-off,
   smartphone, message-circle, Instagram, info):
   - «Оформление»: Тема (value `settings.theme.<auto|light|dark>` from the theme state of KV-FE-026); Графика (only when
     Android or `kv-graphics` is set, decided once on mount, BR-APP-052; value «Авто · полная/облегчённая» or the mode).
   - «Язык и валюта»: Язык (name of `settings.locale` in `settings.locales`, else the code), Валюта (same from
     `settings.currencies`).
   - «Когда присылать» with footer `notify.tz`: Тихие часы (`formatQuietHours`: `off` → `notify.quietOff`, `23-08` →
     «23–08»), Время подборок (`formatDays`: `09,21` → «9 и 21» joined with `notify.and`).
   - «Лента»: Скрытое with the count `listings.length + authors.length`, only when > 0 (BR-APP-053).
   - «О приложении»: the home-screen row (added by KV-FE-086), «Написать в поддержку» when API-003 returns `support`
     (`https://t.me/<support>`, URL-050), «Мы в Instagram» with value «@kvadro.app» (`https://www.instagram.com/kvadro.app/`,
     URL-060), the static about text.
3. Sub-pages: a row tap → light haptic → push the sub-page layer (KV-FE-013 sub-page: fixed layer z 40, 24 % slide-in,
   swipe-back except Android, Back handler, header shadow when scrolled). Pages: theme and graphics (KV-FE-082),
   language and currency (KV-FE-083), quiet hours and digest (KV-FE-084), hidden (KV-FE-085).
4. Shared formatters in `frontend/app/lib/settings/format.ts` (`formatQuietHours`, `formatDays`, `graphicsLabel`), also
   used by the radar sheet digest hint (KV-FE-077).
5. Brand strings (`@kvadro.app`, the Instagram URL, «KvadroApp» in `settings.about`) are read from the brand layer
   (FD-8), not hard-coded in the component.
6. The screen keeps `settings` in state; sub-pages report back the saved patch (`quiet`, `digest`) or trigger the
   in-place re-fetch (`locale`, `currency`, KV-FE-083).

## States and texts

| State | Texts (keys, ru) |
| ----- | ---------------- |
| loading | centred spinner |
| error (settings failed, nothing loaded) | ErrorState tall: `error.offline` «Нет связи» + `error.offlineText` or `common.loadFailed` «Не загрузилось» + `error.serverText`; `error.retry` «Повторить» |
| success, groups | `settings.group.look` «Оформление», `settings.group.region` «Язык и валюта», `settings.group.notify` «Когда присылать» (footer `notify.tz` «Время — ташкентское.»), `settings.group.feed` «Лента», `settings.group.about` «О приложении» |
| rows | `settings.theme` «Тема»; `settings.graphics` «Графика»; `notify.language` «Язык»; `notify.currency` «Валюта»; `notify.quiet` «Тихие часы»; `notify.digest` «Время подборок»; `settings.hidden` «Скрытое»; `settings.support` «Написать в поддержку»; `settings.instagram` «Мы в Instagram» |
| values | `settings.theme.auto` «Как в Telegram» / `settings.theme.light` «Светлая» / `settings.theme.dark` «Тёмная»; `settings.graphics.auto` «Авто» + « · » + lower-case `settings.graphics.full` «Полная» / `settings.graphics.lite` «Облегчённая»; `notify.quietOff` «Выкл»; `notify.and` « и » |
| about text | `settings.about` «KvadroApp собирает объявления из открытых Telegram-каналов. В каждой карточке — ссылка на оригинал.» |
| hidden group absent | `GET /api/hidden` failed or both lists empty |
| support row absent | API-003 failed or `support: null` |

## Interaction

- Opened by the tab bar or the Telegram Settings button (TMA-023), which also closes every overlay (LB-APP-046 fix in
  KV-FE-025) and scrolls to the top.
- No pull-to-refresh on this tab (BR-APP-058). Rows are buttons with a chevron and a right-aligned value; the about row
  is static text.
- Layout: grouped cards, 16 px gutters, max width 608 px; long values truncate; safe-area padding from KV-FE-026.

## Telegram integration

TMA-023 (Settings button opens this tab), TMA-022 (sub-pages push Back handlers), TMA-028 (`openTelegramLink` for
support, `openLink` for Instagram), TMA-025 (light haptic on row taps).

## Storage and analytics

- Reads `kv-graphics` (row visibility, value) and `kv-theme` (value) through KV-FE-027 / KV-FE-026.
- `$pageview settings` (legacy name). Sub-pages: legacy sends nothing; the layer tracking of KV-FE-035 reports
  `settings/<page>` (proposed names, LB-APP-037 fix).

## Files

- `frontend/app/app/(miniapp)/features/settings/SettingsScreen.tsx`, `AboutGroup.tsx` (new)
- `frontend/app/lib/settings/format.ts`, `frontend/app/lib/settings/settingsStore.ts` (new)
- `frontend/app/tests/settings/format.test.ts`, `SettingsScreen.test.tsx`, `frontend/app/e2e/settings.spec.ts`

## API contract

- API-024 `GET /api/settings` → `200 {quiet, digest, locale ("ru"|"uz_Latn"|"en"), currency, locales[{code,name}],
  currencies[{code,name}], quiet_presets[], digest_presets[]}`; error → ErrorState.
- API-026 `GET /api/hidden` → `{listings: ListingPreview[], authors: [{id, kind, label, count}]}`; error → no group.
- API-018 `GET /api/subscriptions` → used only for `some(active && mode === 'digest')`; error → `false`.
- API-003 `GET /api/bot` (no `Authorization`) → `{username, support}`; error → no support row.

## Business rules

- Kept: BR-APP-051 (per sub-page), BR-APP-052, BR-APP-053, BR-APP-045 (home row, KV-FE-086).
- Parity of absence: no city, news, privacy or deletion rows (product scope; adding any is a DEV).

## Acceptance criteria

- With the legacy mock settings the screen shows the same groups, rows, values and order as the `tab-settings` baseline
  (ru light), including «23–08» and «9 и 21».
- The graphics row is visible on an Android user agent or with `kv-graphics` set, hidden otherwise.
- The «Лента» group appears only with at least one hidden listing or author, with the right count.
- A failing `GET /api/settings` shows the error state; «Повторить» re-runs all four requests.
- The Settings button from a listing opens this tab with no sheet left over it.

## Tests

- Unit `format.test.ts`: `off`, `23-08`, `00-09`, `09`, `09,21`, `12,20`, graphics labels for auto lite/full.
- Component: row visibility matrix (Android × `kv-graphics`, hidden count 0/2, support null/known); locale names from
  `settings.locales` with an unknown code falling back to the code.
- E2E: tab → values; API-024 `500` → error → retry; each row opens its sub-page and Back returns.

## Edge cases

- `settings.locale` is `uz_Latn` on the wire → shown by its name from `locales`; internally mapped to `uz` (CF-006,
  KV-FE-015).
- `quiet` value not in `quiet_presets` (bot preset, Q-API-029) → shown formatted anyway.
- API-026 slower than API-024 → the «Лента» group appears when it arrives, without layout jump above it (it is below
  the delivery group).

## Security

- SEC-REQ-019 (support and Instagram links: `https:` and allowlisted hosts only), SEC-REQ-021 (server names rendered as
  text), SEC-REQ-007 (no credentials read or stored here).

## Definition of done

`make ci-frontend` green; tests green (or added with KV-FE-010); visual review of `SCR-032` recorded in the PR; parity
gate G4 for F-SETTINGS-001 ticked (`15` §4); row in `09` updated; PR reviewed by the other developer.
