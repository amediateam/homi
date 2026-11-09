# KV-TG-030 — Wizard step 4: city, zones, metro, districts

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend — Telegram bot (track: development) |
| Complexity | M |
| Feature IDs | F-BOT-004 |
| Dependencies | KV-TG-028 (wizard engine), KV-TG-029 (steps 1–3); KV-DB-006 (`14` §8, geo dictionaries and code aliases); city list and statistics of F-FILTER-004 (API-002); DEV-026 and DEV-015 (`PROPOSED`); Q-BOT-044, Q-BOT-010 |

## Goal

Step 4 of the radar wizard lets the user pick one of the six cities, the Tashkent zones and «Рядом с метро», and any
number of districts in one message, and only `Готово (N)` moves on to the budget. City and zone buttons no longer jump
to step 5 (DEV-026), the whole-city label no longer depends on grammatical gender (DEV-015), and the step text says
what a zone clears.

## Legacy reference

- Step and its buttons: BOT-040, BTN-011 (cities), BTN-012 (`🏛 Центр`), BTN-013 (`🏙 Ближе к центру`, not pressed),
  BTN-014 (`🚇 Рядом с метро (до ~1 км)`), BTN-015 (districts), BTN-016 (`Весь <город>`), BTN-017 (`Готово (N)`),
  BTN-024, BTN-025; state machine `04` §3.5; option table `04` §3.4 "Wizard option sets and limits" row "4 area".
- Texts: TXT-BOT-015 (question), TXT-BOT-016 (Tashkent hint), TXT-BOT-017 (a/b/c hints for the other cities);
  source of truth for the 79 district names `$KVADRO_ROOT/docs/telegram-bot.md:351-358` (`tb:351–358`), hints
  `tb:338`, `tb:345–347`.
- Shared contract: zones `center` / `near_center`, `near_metro` boolean, zones and districts exclusive —
  `$KVADRO_ROOT/demo/app/src/features/filters/options.js:4`, `$KVADRO_ROOT/demo/app/src/features/filters/model.js:21-23`,
  `$KVADRO_ROOT/docs/api.md:155-156`, `:182`.
- Legacy defects fixed here: LB-BOT-001 (zones jump to step 5), LB-BOT-002 (city jumps to step 5), LB-BOT-009
  («Весь Фергана»), LB-BOT-031 (silent unticking by «Центр»).

## Implementation

1. Read `.ai/agents/telegram-bot-engineer.md`, `04` §3.4–§3.5 and the wizard engine of KV-TG-028
   (`App\Telegram\Conversations\RadarWizard\Step` contract). Tests first (`php artisan make:test --pest
   Bot/Wizard/AreaStepTest`).
2. `php artisan make:class Telegram/Conversations/RadarWizard/AreaStep`: renders TXT-BOT-015 + the hint for the
   current city (TXT-BOT-016 for Tashkent, TXT-BOT-017 a/b/c otherwise) and the keyboard:
   - row(s) of cities, 3 per row, the current one prefixed `✅ ` (BR-BOT-003), labels from the city dictionary in the
     user's locale (KV-DB-006; English exonyms per LB-BOT-013);
   - Tashkent only (BR-BOT-025): `🏛 Центр`, `🏙 Ближе к центру`, `🚇 Рядом с метро (до ~1 км)` as toggles with `✅ `;
   - districts of the current city, two per row, alphabetical in the user's locale (BR-BOT-026), ticked ones `✅ `;
   - `✅ <whole-city label>` (DEV-015: `bot.wizard.area.whole_city` = «Весь город» / «<Город> целиком», chosen by the
     product owner when approving DEV-015) · `Готово (N)`;
   - `◀️ Назад` · `✖️ Отмена` (engine).
3. Callbacks through the codec of KV-TG-011, all carrying the wizard `sid`: `k1:wz:<sid>:ct:<city>`,
   `k1:wz:<sid>:zn:<center|near_center|metro>`, `k1:wz:<sid>:ds:<district>`, `k1:wz:<sid>:wc`, `k1:wz:<sid>:dn`.
   City and district values are dictionary codes in base36 ids (≤ 64 bytes, checked by a unit test for the longest).
4. State transitions (DEV-026, BR-BOT-029, BR-BOT-030):
   - city button → city set, districts and zones cleared, `near_metro` cleared when the new city is not Tashkent;
     the step re-renders with that city's lists (no jump);
   - `Центр` / `Ближе к центру` toggles the zone; turning a zone on clears ticked districts (contract: zones and
     districts exclusive) and the step text shows the line `bot.wizard.area.zone_cleared_districts` (new text,
     DEV-026);
   - `Рядом с метро` toggles `near_metro` and keeps districts;
   - district toggles; the first tick removes `✅` from the whole-city button; unticking the last restores it;
   - whole city → districts and zones cleared;
   - `Готово (N)` → step 5 (KV-TG-031); `N` counts ticked districts; `N = 0` with whole city = the whole city
     (BR-BOT-028 matching semantics stay in the radar module).
5. In edit mode (KV-TG-035, KV-TG-044) `Готово` returns to the review / edit screen instead of step 5.
6. Store the result in the draft `SearchFilters` (`city`, `districts`, `zones`, `near_metro`) through the shared
   normaliser of F-FILTER-001 (SEC-REQ-017), never as free strings.
7. Every press edits the same message (BR-BOT-001) and answers the callback silently (`04` §4.3).
8. Texts: add `bot.wizard.area.*` keys to `lang/ru|uz|en/bot.php` (catalogue of KV-TG-008/009) and map TXT-BOT-015,
   TXT-BOT-016, TXT-BOT-017 in `tests/Fixtures/Bot/txt-keys.json`.

## Files

- `backend/app/Telegram/Conversations/RadarWizard/AreaStep.php` (new)
- `backend/app/Telegram/Keyboards/AreaKeyboard.php` (new)
- `backend/lang/{ru,uz,en}/bot.php` (keys `wizard.area.*`)
- `backend/tests/Feature/Bot/Wizard/AreaStepTest.php` (new), `backend/tests/Unit/Telegram/AreaKeyboardTest.php` (new)
- `backend/tests/Fixtures/Bot/transcripts/wizard-area.json` (new, KV-QA-009 format)

## API contract

Bot API only: `editMessageText` (text + `reply_markup`) and `answerCallbackQuery` without text. Inbound callback
grammar as in step 3. No HTTP endpoint.

## Business rules

- Kept: BR-BOT-003, BR-BOT-020 (districts are the only multi-select of the legacy wizard; zones join them here),
  BR-BOT-024, BR-BOT-025, BR-BOT-026, BR-BOT-027 (hint wording), BR-BOT-028, BR-BOT-029, BR-BOT-030.
- Applied deviations (both `PROPOSED`; tests expect the new behaviour only after approval, `15` §1.4): DEV-026
  (zones are toggles, a city re-renders the step, only `Готово` advances, the text says what a zone clears), DEV-015
  (gender-neutral whole-city label).
- Copy fix without a DEV: LB-BOT-013 (English exonyms from the city dictionary, `09` §4.3).

## Acceptance criteria

- Tashkent shows 12 districts, Tashkent region 22, Andijan 15, Namangan 13, Fergana 17, Kokand none (BR-BOT-026) —
  read from the dictionary, compared with `tb:351–358` by a fixture test.
- No city or zone press changes the step number; only `Готово (N)` (or Back / Cancel) leaves step 4.
- The draft filters after `Готово` match the shared normaliser's output for the same choice.
- Every `callback_data` of the largest keyboard (Tashkent region, 22 districts) is ≤ 64 bytes.
- Russian texts equal TXT-BOT-015 … TXT-BOT-017 except the deliberate DEV-015 / DEV-026 changes.

## Tests

Conversation tests (KV-QA-009 DSL, `FakeBotApi`):

| # | Conversation | Expected |
| - | ------------ | -------- |
| 1 | `send('/new')` → `🔑 Снять надолго` → `Квартира` → `2` | step 4 for Tashkent: `✅ Ташкент`, three zone buttons, 12 districts, `✅ Весь город`, `Готово (0)` |
| 2 | … → `Юнусабад` → `Чиланзар` | same `message_id` edited; both ticked; whole city unticked; `Готово (2)` |
| 3 | … → `Юнусабад` → `🏛 Центр` | still step 4; `✅ 🏛 Центр`; districts unticked; text contains `bot.wizard.area.zone_cleared_districts` |
| 4 | … → `🏛 Центр` → `🏛 Центр` | zone off again; still step 4 (LB-BOT-001 fixed) |
| 5 | … → `Юнусабад` → `🚇 Рядом с метро` | `near_metro` on, `Юнусабад` still ticked, still step 4 |
| 6 | … → `Андижан` | step 4 re-rendered for Andijan: 15 districts, no zone buttons, hint TXT-BOT-017 (b) (LB-BOT-002 fixed) |
| 7 | … → `Коканд` → `Готово (0)` | step 5 for Kokand; draft `city=kokand`, no districts |
| 8 | … → `Юнусабад` → `Готово (1)` | step 5; draft districts = [yunusobod] |
| 9 | … → `◀️ Назад` on step 4 | step 3 with `✅ 2` (BR-BOT-019) |
| 10 | object `Комната / подселение` → step 4 → `◀️ Назад` | step 2 (rooms skipped, BR-BOT-022) |
| 11 | press a step-4 district on a wizard message with an older `sid` | alert TXT-BOT-039, keyboard removed, no state change (BOT-023) |
| 12 | locale `en`, Tashkent region | city labels in English exonyms, whole-city label from `en` catalogue |

Unit: keyboard layout (3 cities per row, 2 districts per row, alphabetical per locale), `callback_data` length for
every district of every city.

## Edge cases

- A city with no districts (Kokand): only the whole-city button and `Готово (0)`.
- A district renamed or merged in the dictionary while a wizard is open: the code resolves through
  `dictionary_code_aliases`; an unknown code → stale alert, no crash.
- Zone on, then a district ticked: the zone is cleared (exclusivity both ways) and the text says so.
- Switching city after ticking districts clears them; Back from step 5 shows the city chosen last.
- Q-BOT-044 may show that bot labels and `GET /api/meta` codes differ: the dictionary alias table absorbs it; the
  fixture test fails loudly if a `tb` district has no code.

## Security

- SEC-REQ-011: callbacks parsed by the strict codec; the `sid` binds them to the actor's own wizard; foreign or stale
  `sid` changes nothing.
- SEC-REQ-017: values pass the shared filter normaliser; no free text from callbacks reaches queries.
- SEC-REQ-020: city and district names are escaped by `Html::escape` before rendering.
- No personal data in this step.

## Definition of done

Tests green (`make ci-backend`), transcript `wizard-area.json` passing in KV-QA-009's runner, parity-gate cells
G5/G7/G8 of F-BOT-004 updated (DEV-026 and DEV-015 must be `APPROVED` before G5 is ticked), `docs/migration/09` row
F-BOT-004 updated, PR reviewed by the other developer.
