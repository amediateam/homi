# KV-BE-045 — Settings: API-024 and API-025

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend (track: development) |
| Complexity | M |
| Feature IDs | F-SETTINGS-001, F-SETTINGS-004, F-SETTINGS-005, F-SETTINGS-007, F-ONBOARD-002, F-ONBOARD-003, F-LOCALE-001 |
| Dependencies | KV-BE-014, KV-BE-015, KV-DB-007 (and the M0 legacy layer: KV-BE-005, KV-BE-007, KV-BE-009, KV-BE-010; `GET /api/meta` of KV-BE-029 reads the same record) |

## Goal

One server-owned profile record drives `GET /api/settings`, `PUT /api/settings` and `GET /api/meta`: a partial `PUT`
persists so that meta reports the new values with `locale_chosen: true` / `city_chosen: true`, `uz_Latn` round-trips,
and quiet/digest hours are served and accepted as the legacy strings while stored as structured Asia/Tashkent values.
The bot's `/settings` (M5) writes through the same `SettingsService`.

## Legacy reference

- Since legacy release `index-BnFvC-Ft.js` the profile also holds `card_style` (`classic` | `rich`), and
  `POST /api/settings/card-sample` (API-036) asks the bot for a sample card (`03` SCR-048, BR-APP-074; the v1
  contract is WP-11's, storage WP-40's).
- API-024 and API-025 (`08-api-inventory.md:1299-1362`); client `$KVADRO_ROOT/demo/app/src/lib/api/settings.js:5`,
  `:11-15`; `$KVADRO_ROOT/demo/app/src/features/settings/SettingsScreen.jsx:59`, `:83-95`, `:105`, `:115-126`;
  `$KVADRO_ROOT/demo/app/src/features/radar/RadarSheet.jsx:52-61` (`digest.split(',')`);
  `$KVADRO_ROOT/demo/app/src/features/onboarding/LanguagePicker.jsx:32`; `$KVADRO_ROOT/demo/app/src/lib/city.js:20-26`;
  `$KVADRO_ROOT/docs/api.md:842-897`; bot presets `$KVADRO_ROOT/docs/telegram-bot.md:990`; mock
  `$KVADRO_ROOT/demo/app/tools/parity/mocks.mjs:124`.
- Rules: `02-legacy-backend-audit.md:1157-1191` (§21: BR-API-143…149, Q-API-057, LB-API-018), §22 (BR-API-150), BR-API-085
  and contradiction C-03 (`07` §3: the server serves the bot-observed sets to both surfaces), BR-DATA-013, BR-DATA-014,
  BR-DATA-015.
- Fixes by policy (`09` §4.3): LB-API-018, LB-API-048, LB-API-049, LB-API-050, LB-DATA-014. CF-006 (`10` §3.7).

## Implementation

1. Read `.claude/skills/laravel-best-practices/`, `.claude/skills/testing-best-practices/` and `10` §3.7.
2. `php artisan make:class Domain/Identity/QuietWindow` (`off` or `HH-HH`, may cross midnight; `fromLegacy()`,
   `toLegacy()`; stores `quiet_start`/`quiet_end` `time` or both `null`) and `Domain/Identity/DigestSchedule`
   (`HH` or `HH,HH` ↔ sorted unique `smallint[]` `digest_hours`). `LocaleCode` comes from KV-BE-014.
3. `config/settings.php`: `quiet_presets` = `off`, `22-08`, `23-08`, `00-09`, `23-07`; `digest_presets` = `09`,
   `09,19`, `12,20`, `19` (C-03); `locales` and `currencies` with display names per locale from `backend/lang`
   (KV-BE-020); defaults for new users.
4. `php artisan make:class Services/Identity/SettingsService`: `get(User): UserSettings`, `patch(User, array $changes):
   UserSettings` — one `user_settings` row (created by KV-BE-007 on first contact), per-key update with
   `locale_chosen_at`/`city_chosen_at` set on a stored `locale`/`city` (derived flags, LB-API-018); raises
   `App\Events\Identity\SettingsChanged` (`php artisan make:event Identity/SettingsChanged --no-interaction`) with the
   changed keys — M5 listens for the bot command locale (`setMyCommands` per user, About:318 🔶).
5. `php artisan make:request Legacy/UpdateSettingsRequest --no-interaction`: all keys optional; `locale` ∈ `ru`,
   `uz_Latn`, `en`; `currency` ∈ `USD`, `UZS`; `theme` ∈ `auto`, `light`, `dark`; `city` resolved by `Gazetteer`
   (KV-BE-015, aliases accepted); `quiet` ∈ `quiet_presets`; `digest` ∈ `digest_presets`; unknown keys ignored;
   failures → `422 {"detail":"invalid_<field>"}`.
6. `php artisan make:class Http/Serializers/Legacy/SettingsSerializer` → the 8-key `SettingsResponse` with `uz` →
   `uz_Latn`; stored values outside the preset sets (migrated, BR-DATA-014) are returned as stored.
7. `php artisan make:controller Legacy/SettingsController --no-interaction` (`show`, `update`); routes `GET settings`
   (`throttle:legacy-reads`) and `PUT settings` (`throttle:legacy-radar`), both `auth:tma` + `legacy.access`.
8. Make `MetaService` (KV-BE-029) read `locale`, `locale_chosen`, `currency`, `theme`, `city`, `city_chosen` from the
   same `SettingsService::get()`; add the round-trip tests here.
9. Pint, PHPStan, `make ci-backend`.

## Files

- `backend/app/Domain/Identity/{QuietWindow,DigestSchedule}.php` (new)
- `backend/app/Services/Identity/SettingsService.php`, `backend/app/Domain/Identity/UserSettings.php` (new)
- `backend/app/Events/Identity/SettingsChanged.php` (new); `backend/config/settings.php` (new)
- `backend/app/Http/Requests/Legacy/UpdateSettingsRequest.php`, `backend/app/Http/Serializers/Legacy/SettingsSerializer.php`,
  `backend/app/Http/Controllers/Legacy/SettingsController.php` (new); `backend/routes/legacy.php` (changed)
- `backend/tests/Feature/LegacyApi/Api024SettingsShowTest.php`, `Api025SettingsUpdateTest.php`,
  `backend/tests/Unit/Identity/{QuietWindowTest,DigestScheduleTest}.php`, `backend/tests/Feature/Pgsql/SettingsRaceTest.php`

## API contract

- `GET /api/settings` → `200 {"quiet": "off"|"HH-HH", "digest": "HH"|"HH,HH", "locale": "ru"|"uz_Latn"|"en",
  "currency": "USD"|"UZS", "locales": [{"code", "name"}], "currencies": [{"code", "name"}], "quiet_presets":
  [string], "digest_presets": [string]}` — all eight keys, `digest` always a string (the radar sheet calls
  `digest.split(',')`), arrays never `null`. Unread by the client: `theme`, `city` (may be added, spec: not emitted).
- `PUT /api/settings`, JSON body with **one or more** of `city`, `theme`, `locale`, `currency`, `quiet`, `digest`
  (PATCH semantics, LB-API-049) → `200` with the full `SettingsResponse`. The client reads it only for `quiet`/`digest`
  and reloads the page after `locale`/`currency`.
- Errors: unknown locale (`uz`, `uz-Latn` on the legacy wire — 15 §3.12 #2 decided as `422`), `quiet` outside the
  presets, unknown city → `422 {"detail":"invalid_<field>"}`; empty body `{}` → `200` no-op (spec; legacy unknown);
  `401 {"detail":"unauthorized"}`; `403 {"detail":"<reason>"}`; `429 {"detail":"rate_limited"}`.

## Business rules

- Keep: BR-API-143 (wire codes), BR-API-144 (server is the source of truth), BR-API-145 (a `PUT` is what meta returns
  next, with the chosen flags), BR-API-146 (locale change → server strings in the new locale), BR-API-150
  (Asia/Tashkent), BR-API-085 with C-03 (bot-observed presets on both surfaces), BR-API-148 (`service_news` stays
  bot-only: not in this contract), BR-DATA-013…015.
- Defect fixes `APPROVED`: LB-API-018 (derived `*_chosen`), LB-API-048 / LB-DATA-014 (`uz` inside, `uz_Latn` on the
  wire), LB-API-049 (partial `PUT` kept), LB-API-050 (strings on the legacy route, structured storage).
- `PROPOSED`: DEV-020 (one language detector) concerns the default locale chosen at first contact (KV-BE-007), not
  this route.

## Acceptance criteria

- Each single-key `PUT` persists, returns all 8 keys and leaves other keys unchanged.
- After `PUT {"locale": "uz_Latn"}`: `GET /api/settings.locale` and `GET /api/meta.locale` are `uz_Latn`, the stored
  value is `uz`, `meta.locale_chosen` is `true`. After `PUT {"city": "<code>"}`: `meta.city` updated,
  `meta.city_chosen: true`.
- `quiet: "23-08"` stores `23:00`/`08:00`; `"off"` stores nulls; `digest: "09,19"` stores `{9,19}` and reads back
  `"09,19"`.
- Bot and Mini App writes agree (`15` §3.7 #5): per-key last write wins.

## Tests

- `Api024SettingsShowTest`: all 8 keys present with types; `quiet ∈ quiet_presets`, `digest ∈ digest_presets` for a
  default user; migrated out-of-set value (`09,21`) returned as stored; `uz` user → `uz_Latn`; contract via KV-QA-004.
- `Api025SettingsUpdateTest`: dataset of single-key patches; meta round-trip (`15` §3.12 #1, `08` API-025 Tests);
  invalid locale, `quiet: "21-07"`, unknown city → `422`; `{}` → `200` unchanged; `currency: "UZS"` then
  `GET /api/feed` price strings in сум (`15` §3.11 #16, after KV-BE-031); `SettingsChanged` dispatched with the
  changed keys only.
- Unit: `QuietWindowTest` (`off`, `23-08` crossing midnight, `00-09`, malformed), `DigestScheduleTest` (sorting,
  duplicates, `HH` padding).
- `SettingsRaceTest` (`pgsql`, `15` §3.6 #12): concurrent `PUT {quiet}` and `PUT {locale}` → both values kept.
- IDOR (`15` §3.1 #7): B's `GET /api/settings` shows only B's values.

## Edge cases

- `locale` sent together with `currency` in one `PUT` (not done by the client) → both applied.
- `city` alias spelling (LB-DATA-001) accepted and stored as the canonical city; meta returns the legacy API code.
- A region (`zoom < 11`, LB-API-051) is a valid `city`.
- `theme` patch → stored, not echoed (unread key), and meta returns it.

## Security

- SEC-REQ-014 (own record only), SEC-REQ-006, SEC-REQ-027 (`legacy-reads` 300/min, `legacy-radar` 30/min for `PUT`),
  SEC-REQ-017 (closed enums, body ≤ 16 KB). SEC-REQ-036: the locale is the only language data stored.

## Definition of done

Tests green (`make ci-backend` + `pgsql` group), parity gate items for F-SETTINGS-001, F-SETTINGS-004, F-SETTINGS-005,
F-ONBOARD-002, F-ONBOARD-003, F-LOCALE-001 ticked for the settings part (`15` §4), API-024 and API-025 contract cases
real in KV-QA-004, feature rows in `09` updated, PR reviewed by the other developer.
