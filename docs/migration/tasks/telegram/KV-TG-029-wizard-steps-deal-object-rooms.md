# KV-TG-029 — Wizard steps 1–3: deal, object, rooms

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend — Telegram bot (track: development) |
| Complexity | S |
| Feature IDs | F-BOT-003 |
| Dependencies | KV-TG-028 (wizard engine); shared filter enums — F-FILTER-001 (BR-BOT-104); DEV-046 (`PROPOSED`) |

## Goal

The first three wizard steps ask what the user is looking for, which object, and how many rooms, with the legacy
option sets, layouts and context line; the rooms step appears only for apartments and houses. Values are stored as the
shared radar filter enums.

## Legacy reference

- Step 1: BOT-037, TXT-BOT-012 `Что ищете?`, BTN-006 `🔑 Снять надолго`, BTN-007 `🌙 Снять посуточно`, BTN-008
  `🏷 Купить`, one per row, then `✖️ Отмена` (`tb:279–287`).
- Step 2: BOT-038, TXT-BOT-013 `Какой объект?`, BTN-009, context `🏠 Аренда · любой объект` /
  `🏠 Посуточно · любой объект` / `🏠 Покупка · любой объект`; layouts per deal `tb:289–297` (table in `04` §3.4).
- Step 3: BOT-039, TXT-BOT-014 `Сколько комнат?`, BTN-010 `1` · `2` · `3` · `4+` / `1–2` · `2–3` · `✅ Не важно`
  (default «Не важно»), context `· 2 комн.` / `· 2–3 комн.` (`tb:299–308`).
- Shared contract: `TYPES_BY_DEAL`, `NO_ROOMS_TYPES`
  (`$KVADRO_ROOT/demo/app/src/features/filters/options.js:7-11`, `$KVADRO_ROOT/demo/app/src/features/filters/model.js:5`).
- New-build choice for sale: DEV-046 (from LB-SEO-005).

## Implementation

1. Read `04` §3.4 option table. Tests first (`php artisan make:test --pest Bot/Wizard/DealObjectRoomsTest`).
2. `php artisan make:class Telegram/Conversations/RadarWizard/DealStep`: buttons `k1:wz:<sid>:s1:<rl|rd|sl>` →
   `deal` = `rent_long` / `rent_daily` / `sale`. Changing the deal in create mode clears object and rooms
   (edit-mode rules are KV-TG-035).
3. `ObjectStep`: options per deal (BR-BOT-021) with the legacy row layout; value codes `ap` (apartment), `ho` (house),
   `ah` (apartment + house), `rm` (room), `cm` (commercial), `ld` (land) → `types` array of the shared enum. No option is
   pre-ticked; the context shows «любой объект» until chosen.
4. `RoomsStep`: shown for `ap`, `ho`, `ah` only (BR-BOT-022); options `1`, `2`, `3`, `4+`, `1–2`, `2–3`, `Не важно` →
   `rooms_min` / `rooms_max` (`1/1`, `2/2`, `3/3`, `4/null`, `1/2`, `2/3`, `null/null`); default ticked `✅ Не важно`
   (BR-BOT-023).
5. DEV-046 (`PROPOSED`): for `sale` + apartment, an extra row `🏗 Только новостройки` (`bot.wizard.object.new_builds`,
   new label) toggling `market=new` on the object step; hidden behind `bot.dev046` until the developer and the product
   owner approve.
6. Labels from `bot.wizard.deal.*`, `bot.wizard.object.*`, `bot.wizard.rooms.*`; context strings from the engine.

## Files

- `backend/app/Telegram/Conversations/RadarWizard/{DealStep,ObjectStep,RoomsStep}.php` (new)
- `backend/lang/{ru,uz,en}/bot.php` (`wizard.deal.*`, `wizard.object.*`, `wizard.rooms.*`)
- `backend/tests/Feature/Bot/Wizard/DealObjectRoomsTest.php` (new)

## API contract

Bot API: `editMessageText` + `reply_markup`, `answerCallbackQuery` (silent). Callbacks `k1:wz:<sid>:s1:<deal>`,
`k1:wz:<sid>:s2:<object>`, `k1:wz:<sid>:s3:<rooms>` (`1`, `2`, `3`, `4p`, `12`, `23`, `any`).

## Business rules

- Kept: BR-BOT-020, BR-BOT-021, BR-BOT-022, BR-BOT-023, BR-BOT-104 (enum values).
- `PROPOSED`: DEV-046 (new-build choice for sale) — tests `todo` until approved.

## Acceptance criteria

- Option sets and row layouts equal `tb:279–308` for each deal.
- rent_long + `Квартира или дом` stores `types = [apartment, house]`; `Помещение` stores `[commercial]` and skips
  rooms.
- Rooms `4+` stores `rooms_min = 4, rooms_max = null`; `Не важно` stores nulls.
- Context line after step 3 reads `🏠 Аренда · квартира · 2 комн.` for the fixture choice.

## Tests

| # | Conversation | Expected |
| - | ------------ | -------- |
| 1 | `/new` → `🔑 Снять надолго` | object step: `Квартира` · `Дом` / `Квартира или дом` · `Комната / подселение` / `Помещение` |
| 2 | `/new` → `🌙 Снять посуточно` | `Квартира` · `Дом` / `Комната / подселение` |
| 3 | `/new` → `🏷 Купить` | `Квартира` · `Дом` / `Квартира или дом` · `Участок` / `Помещение` |
| 4 | rent_long → `Квартира` | rooms step, `✅ Не важно` ticked, context `🏠 Аренда · квартира` |
| 5 | → `2–3` | area step, context `🏠 Аренда · квартира · 2–3 комн.`, draft rooms 2..3 |
| 6 | sale → `Участок` | area step directly, draft `types = [land]` |
| 7 | rooms step → `◀️ Назад` | object step with `✅ Квартира` |
| 8 | sale → `Квартира` with `bot.dev046` on (`todo`) | extra row `🏗 Только новостройки`; toggle sets `market=new` |
| 9 | forged `k1:wz:<sid>:s2:ld` while deal is rent_long | catch-all alert (option not allowed for the deal) |

## Edge cases

- `Дом` alone keeps the rooms step (houses have rooms), matching the review keyboard of `tb:502–508`.
- Back from step 3 to step 1 and a different deal: object and rooms are cleared; the context resets to «любой объект».
- A deal without allowed objects cannot exist; the normaliser rejects unknown pairs.

## Security

- SEC-REQ-011: option codes are validated against the closed per-deal set; anything else → catch-all.
- SEC-REQ-017: the draft passes the shared normaliser.
- No personal data.

## Definition of done

Tests green (`make ci-backend`), transcripts for the three deals pass in KV-QA-009, F-BOT-003 parity-gate row updated,
`09` row updated, PR reviewed by the other developer.
