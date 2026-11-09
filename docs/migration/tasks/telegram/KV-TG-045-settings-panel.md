# KV-TG-045 — `/settings` panel

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend — Telegram bot (track: development) |
| Complexity | M |
| Feature IDs | F-SETTINGS-006, F-SETTINGS-004, F-SETTINGS-005 |
| Dependencies | KV-TG-017 (language switch service), KV-TG-010, KV-TG-011; `SettingsService` read/patch of F-SETTINGS-001 (API-024, API-025) including the bot-only `service_news` key (BR-API-148); presets from the server config (BR-BOT-103); DEV-035 (`PROPOSED`); Q-BOT-015, Q-BOT-040 |

## Goal

`/settings` sends one panel message with the five settings of the legacy bot — quiet hours, digest times, language,
currency, service news — with the current value of each row ticked; every option press saves through the shared
`SettingsService`, toasts `Сохранил ✅` and re-renders the panel in place. Section titles live in the message text, not
in dead callback buttons (DEV-035).

## Legacy reference

- Command and step: BOT-017, BOT-074; state machine `04` §3.14; option table `04` §3.14 (RU labels, test-account
  values, inferred codes `tb:990`).
- Buttons: BTN-067 (section headers, did nothing — LB-BOT-026), BTN-068 (quiet hours), BTN-069 (digest times), BTN-070
  (language, handled by KV-TG-017), BTN-071 (currency), BTN-072 (service news).
- Texts: TXT-BOT-074 (panel; RU `$KVADRO_ROOT/docs/telegram-bot.md:773-786`, EN `tb:1092–1105`, UZ `tb:1114–1127`),
  TXT-BOT-075 (`Сохранил ✅` / `Saqlab qoʻydim ✅` / `Saved ✅`).
- Server presets for the Mini App: `$KVADRO_ROOT/demo/app/src/features/settings/SettingsPages.jsx:96-134`,
  `$KVADRO_ROOT/docs/api.md:845-854` (CONFIRMED contract, BR-BOT-103).
- Copy defects fixed in the catalogue (KV-TG-009): LB-BOT-010 (`oʻch..`), LB-BOT-011 (`Sokinlik soatlari` vs
  `Sokin soatlar`), LB-BOT-012 (`Sumi` vs `Soʻm`).

## Implementation

1. Read `.ai/agents/telegram-bot-engineer.md`, `04` §3.14, the backend settings task's `SettingsService`,
   `QuietWindow` and `DigestSchedule` (F-SETTINGS-001, F-SETTINGS-005). Tests first
   (`php artisan make:test --pest Bot/SettingsPanelTest`).
2. `php artisan make:class Telegram/Handlers/SettingsCommand` and `Telegram/Rendering/SettingsPanelRenderer`: text =
   TXT-BOT-074 with every section title and the current value line in the message body (bold title, values, italic
   last line as legacy, `tb:773–786`); keyboard = only option rows, current value prefixed `✅ ` (BR-BOT-003):
   quiet `выкл` · `22:00–08:00` · `23:00–08:00` / `00:00–09:00` · `23:00–07:00`; digest `09:00` · `09:00 и 19:00` /
   `12:00 и 20:00` · `19:00`; language (two other languages, as KV-TG-017 renders them); currency `Доллары, $` · `Сумы`;
   news `Присылать` · `Не присылать`. Option lists come from `config('settings.quiet_presets')` /
   `digest_presets` (BR-BOT-103), never hard-coded in the handler.
3. Callbacks `k1:st:<row>:<value>` with rows `q` (quiet), `d` (digest), `c` (currency), `n` (news); language rows go to
   the KV-TG-017 action `lg`. Values are preset codes (`off`, `22-08`, `09,19`, `USD`, `1`/`0`).
4. On press: `SettingsService::patch($user, [...])` (quiet / digest as legacy codes converted by `QuietWindow` /
   `DigestSchedule`, currency `USD`/`UZS`, `service_news` bool); answer the callback with TXT-BOT-075 in the user's
   locale; edit the panel. Pressing the current option still saves and toasts (BR-BOT-076); an identical re-render
   ("message is not modified") counts as success (KV-TG-010).
5. If DEV-035 is not approved, keep section headers as buttons with the action `k1:nop` answered silently without a
   spinner; the panel renderer has both layouts behind one config switch until the decision.
6. Service news: stored in `user_settings.service_news` (KV-DB-007, `06` §4.2), default `true` for new users
   (BR-BOT-075 test-account value, `UNVERIFIED`); migrated values per Q-BOT-040 (data track). Read by KV-TG-055.
7. Currency affects only how the bot formats prices from now on (cards, lists, wizard budget per DEV-006); this task
   stores it — the formatting consumers are KV-TG-022, KV-TG-031, KV-TG-032 (Q-BOT-015).
8. Settings changed in the Mini App and in the bot are one record (BR-API-147): the next `/settings` shows the Mini App
   value; no event is needed for that.

## Files

- `backend/app/Telegram/Handlers/SettingsCommand.php`, `backend/app/Telegram/Handlers/SettingsCallback.php` (new)
- `backend/app/Telegram/Rendering/SettingsPanelRenderer.php` (new)
- `backend/lang/{ru,uz,en}/bot.php` (`settings.*` keys; TXT-BOT-074/075 mapped in `tests/Fixtures/Bot/txt-keys.json`)
- `backend/tests/Feature/Bot/SettingsPanelTest.php` (new), `backend/tests/Fixtures/Bot/transcripts/settings.json` (new)

## API contract

Bot API only: `sendMessage` (panel), `editMessageText` with `reply_markup`, `answerCallbackQuery` with TXT-BOT-075.
The legacy `GET`/`PUT /api/settings` contract is unchanged; `service_news` stays outside it (BR-API-148).

## Business rules

- Kept: BR-BOT-073, BR-BOT-074, BR-BOT-076 (every option saves and toasts, even the current one), BR-BOT-077,
  BR-BOT-078, BR-BOT-079, BR-BOT-080, BR-BOT-103, BR-BOT-003, BR-BOT-014 (language path toast in the new language),
  BR-API-084, BR-API-085, BR-API-147, BR-API-148.
- Deviation: DEV-035 (`PROPOSED`) — section titles as text.
- Copy fixes without DEV (`APPROVED` by policy): LB-BOT-010, LB-BOT-011, LB-BOT-012 (texts in KV-TG-009).

## Acceptance criteria

- `/settings` on a new user shows `✅ выкл`, `✅ 09:00 и 19:00`, `✅ Доллары, $`, `✅ Присылать` (configured defaults)
  and the language row of KV-TG-017.
- Each option press changes the stored record exactly as `PUT /api/settings` with the same value would (shared service
  test), toasts TXT-BOT-075 and edits the same `message_id`.
- With DEV-035 approved the keyboard has no callback without an effect.
- The Mini App's `GET /api/settings` reflects a bot change at once and vice versa.

## Tests

| # | Conversation (KV-QA-009 DSL) | Expected |
| - | ---------------------------- | -------- |
| 1 | `send('/settings')` | new message TXT-BOT-074 with the five sections in the text; option rows with `✅` on current values |
| 2 | `press('23:00–08:00')` | `answerCallbackQuery` text `Сохранил ✅`; same message edited; `✅ 23:00–08:00`; stored quiet `23:00`–`08:00` |
| 3 | `press('23:00–08:00')` again | toast again; Bot API answers 400 "message is not modified" → no error logged (BR-BOT-076) |
| 4 | `press('12:00 и 20:00')` | digest hours `[12, 20]`; line `📬 Подборки: 12:00 и 20:00 …` |
| 5 | `press('Сумы')` | currency `UZS`; `GET /api/settings` returns `"currency":"UZS"` |
| 6 | `press('Не присылать')` | `service_news=false`; KV-TG-055 recipient query excludes the user |
| 7 | `press('🇬🇧 English')` | panel re-rendered in English, toast `Saved ✅` (delegated to KV-TG-017) |
| 8 | locale `uz` panel | `oʻch.` with one dot, one term for quiet hours, `soʻm` (LB-BOT-010…012) |
| 9 | forged `k1:st:q:21-07` (not a preset) | stale alert TXT-BOT-039, nothing saved (SEC-REQ-011) |
| 10 | press on a panel sent before a language change | renders in the current language; values from the server |

## Edge cases

- A migrated user whose stored quiet or digest value is not a preset (BR-DATA-014): the panel shows the stored value as
  text and ticks no option; pressing a preset replaces it.
- Quiet hours changed while cards are held (KV-TG-052): the held items are re-planned against the new window on the
  next release run, not dropped.
- Digest times changed to fewer hours: pending digest items move to the next remaining hour (KV-TG-053).
- Two panels open in the chat: both work against the server state; only the pressed one is re-rendered (BR-BOT-010).

## Security

- SEC-REQ-011: values must be in the preset lists; the actor is `from.id`; no foreign user can be addressed.
- SEC-REQ-027 / SEC-REQ-010: settings writes share the per-user bot limit (30/min).
- No personal data beyond the settings record; nothing is logged with values.

## Definition of done

Tests green (`make ci-backend`), transcript `settings.json` green in the KV-QA-009 runner, parity-gate cells G5/G7/G8
of F-SETTINGS-006 updated (DEV-035 decision recorded), `09` rows F-SETTINGS-006, F-SETTINGS-004, F-SETTINGS-005
updated, PR reviewed by the other developer.
