# KV-FE-084 — Settings › Quiet hours and Digest time

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Frontend (track: development) |
| Complexity | S |
| Milestone | FE-2 (M9, stage S4) |
| Feature IDs | F-SETTINGS-005 |
| Dependencies | KV-FE-081 (settings screen, formatters, digest-radar flag); backend KV-BE-045 (API-024, API-025); decisions: DEV-016 `PROPOSED`; Q-API-029 |

## Goal

The two delivery-time sub-pages (SCR-037, SCR-038) let the user pick quiet hours and digest hours from the server's
presets, save optimistically, roll back on failure and say that times are Tashkent time; the hint of the digest page
depends on whether an active digest radar exists.

## Legacy reference

- SCR-037, SCR-038 (`03` §2): `$KVADRO_ROOT/demo/app/src/features/settings/SettingsPages.jsx:92-140`
  (`QuietHoursPage`, `DigestPage`), `SettingsScreen.jsx:82-96` (`savePatch`: optimistic, replaced by the server
  response, rollback + error haptic), `:60-63` (`hasDigestRadars`), `format.js:9-27` (`formatQuietHours`,
  `formatDays`).
- Server side: quiet hours and digests are evaluated in `Asia/Tashkent` (F-DELIVERY-003, F-DELIVERY-004; `03` §3.5).
- Rules: BR-APP-051 (quiet and digest optimistic with rollback).
- Defects: LB-APP-027 → DEV-016 (failure only vibrates).
- No KV-QA-019 baseline; compare with the legacy sub-page markup and SCR-032.

## Implementation

1. `frontend/app/app/(miniapp)/features/settings/QuietHoursPage.tsx`: sub-page titled `notify.quiet`, hint
   `notify.quietHint`; options `settings.quiet_presets` formatted with `formatQuietHours` (KV-FE-081: `off` →
   `notify.quietOff`, `23-08` → «23–08»); the current `settings.quiet` checked.
2. `DigestPage.tsx`: titled `notify.digest`; hint `notify.digestHint` when an active radar in mode `digest` exists, else
   `notify.digestHintNone`, followed by a space and `notify.tz`; options `settings.digest_presets` formatted with
   `formatDays` (`09,21` → «9 и 21», `notify.and`).
3. Pick (any value, also the current one, as legacy) → light haptic → optimistic local update → `PUT /api/settings
   {quiet}` or `{digest}` → replace the local settings with the response (it is the full `SettingsResponse`); failure →
   restore the previous settings, error haptic, and with DEV-016 (flag `dev016ErrorToastOnFailure`) toast
   `common.saveFailed`.
4. The radar sheet's digest hint (KV-FE-077) reads the same settings store, so a change here shows there without a
   refetch.
5. Values not in the presets (radars and settings created in the bot, Q-API-029) are shown formatted as the current
   value even if no option matches; then no row is checked.

## States and texts

| State | Texts (keys, ru) |
| ----- | ---------------- |
| quiet page | title `notify.quiet` «Тихие часы»; options e.g. «23–08», `notify.quietOff` «Выкл»; hint `notify.quietHint` «Карточки не приходят; всё, что появилось за ночь, — одной подборкой утром.» |
| digest page | title `notify.digest` «Время подборок»; options e.g. «9», «9 и 21»; hint `notify.digestHint` «Во сколько присылать новое от радаров в режиме «Подборкой».» or `notify.digestHintNone` «Для радаров в режиме «Подборкой» — режим переключается в карточке радара, вкладка «Радар».» + `notify.tz` «Время — ташкентское.» |
| saving | the new value is checked at once (optimistic) |
| error | previous value checked again; error haptic; with DEV-016 `common.saveFailed` «Не получилось сохранить» |
| loading / empty | n/a (presets come with API-024); an empty preset list renders no rows and only the hint |

## Interaction

- Sub-page chrome of KV-FE-013; rows are radio buttons with a check (`ChoiceList`).
- No time picker: only server presets (legacy). Hours are shown without leading zeros.

## Telegram integration

TMA-022 (Back), TMA-025 (haptics).

## Storage and analytics

- Storage: none (server profile only).
- No events; `$pageview settings/quiet`, `settings/digest` through KV-FE-035 (proposed names).

## Files

- `frontend/app/app/(miniapp)/features/settings/QuietHoursPage.tsx`, `DigestPage.tsx` (new)
- `frontend/app/tests/settings/QuietDigestPages.test.tsx`

## API contract

- API-024 `GET /api/settings` → `quiet` (`off` | `HH-HH`), `digest` (`HH` | `HH,HH`, always a string),
  `quiet_presets[]`, `digest_presets[]`.
- API-025 `PUT /api/settings {"quiet": string}` / `{"digest": string}` → `200 SettingsResponse` (replaces local state).
  `422 {"detail":"invalid_quiet"}` for a value outside the presets → rollback.

## Business rules

- Kept: BR-APP-051 (optimistic with rollback); quiet hours and digests evaluated server-side in Tashkent time.
- DEV-016 `PROPOSED` (flag).

## Acceptance criteria

- Picking «Выкл» checks it at once and sends `{"quiet":"off"}`; a `500` checks the previous value again.
- The digest hint switches between the two texts depending on an active digest radar; «Время — ташкентское.» always
  follows it.
- After a successful digest change the radar sheet shows «Списком в <new hours>» without reloading settings.

## Tests

- Component: option formatting for both pages; optimistic update and rollback; response replaces state; hint variants;
  unknown current value shows no check; `todo('DEV-016 PROPOSED')`.

## Edge cases

- `digest` arrives as a non-string (contract break) → treated as unknown, page still renders (no `split` crash).
- Quick double pick → the later response wins; a failed earlier request does not roll back a later success.

## Security

- SEC-REQ-017 (only preset codes sent), SEC-REQ-021.

## Definition of done

`make ci-frontend` green; tests green (or added with KV-FE-010); review recorded in the PR; parity gate G4 for
F-SETTINGS-005 ticked (`15` §4); row in `09` updated; PR reviewed by the other developer.
