# KV-TG-028 — Radar wizard engine: frame, step graph, Back, Cancel, entry points

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend — Telegram bot (track: development) |
| Complexity | M |
| Feature IDs | F-BOT-003, F-BOT-013 |
| Dependencies | KV-TG-011 (callback codec, stale catch-all), KV-TG-012 (conversation state); `SearchFilters` value object and shared normaliser — F-FILTER-001 (DEV-004, SEC-REQ-017) |

## Goal

A small wizard engine runs the radar wizard: every start sends a new message with a fresh wizard id, each step edits
that message, the frame shows `шаг N из M` computed from the real branch, `◀️ Назад` goes to the previous shown step
with the earlier choice ticked, `✖️ Отмена` ends the wizard, and buttons of an older wizard get the «Форма устарела»
alert. Steps (KV-TG-029 … KV-TG-033) and the review (KV-TG-034) plug into it.

## Legacy reference

- Entry: BOT-014 (`/new`), BTN-002 (welcome `📡 Включить радар`), BTN-030 (`➕ Новый радар` in `/subs`, empty `/subs`,
  the saved-radar message, the not-understood reply) — `tb:246–250`.
- Frame: BOT-036, TXT-BOT-010 `📡 Новый радар · шаг N из M` + context `🏠 <сделка> · <объект или «любой объект»>[ ·
  <комнаты>]` + question + hint; edit header TXT-BOT-011 `Изменение радара · шаг N из M` (`tb:254–277`, `tb:721`).
- Back / Cancel: BTN-024, BTN-025, BOT-050, TXT-BOT-026 `Отменил. Новый радар — /new, список — /subs` (`tb:267–275`).
- State machine `04` §3.4; outdated wizard BOT-023, TXT-BOT-039 (`tb:172–173`); state ENT-012; Q-BOT-018.
- Rules: BR-BOT-016 (new message per start, edits after), BR-BOT-017 (M = 8 / 7 / 6, step 1 «из 7»), BR-BOT-018
  (context holds deal, object, rooms only), BR-BOT-019 (Back), BR-BOT-020 (single choice advances), BR-BOT-046 (Cancel),
  BR-BOT-009 (outdated).
- Defects fixed here: LB-BOT-015 (wrong total on step 1), LB-BOT-016 (numbering when rooms are skipped) — `APPROVED`
  by policy (`09` §4.3).

## Implementation

1. Read `.ai/agents/telegram-bot-engineer.md` rule 5, `04` §3.4, KV-TG-011 and KV-TG-012. Tests first
   (`php artisan make:test --pest Bot/Wizard/WizardEngineTest`).
2. `App\Telegram\Conversations\RadarWizard\{Wizard, WizardState, Step, StepView, Transition}`
   (`php artisan make:class …`): `Step::key()`, `isShown(WizardState)`, `render(WizardState): StepView`
   (question, hint, keyboard rows), `handle(op, value, WizardState): Transition` (stay / next / review / to step).
3. Step graph (keys and visibility): `deal` always; `object` always; `rooms` for apartment, house, apartment-or-house
   (BR-BOT-022); `area` always; `budget` always; `owner` always; `tenant` when the shared normaliser allows tenant for
   the deal (rent_long, and rent_daily per DEV-017); `pets` rent_long only; then `review`. Registered steps are
   injected so KV-TG-029 … KV-TG-033 add themselves.
4. Numbering (LB-BOT-015/016): before a deal is chosen the header reads `bot.wizard.frame.step_first` (`📡 Новый радар ·
   шаг 1`, no total); afterwards `N из M`, where M counts the shown steps of the current branch (deal + object) and N
   the position among them. Edit mode uses TXT-BOT-011 with the same numbers.
5. Context line (BR-BOT-018): deal label (`Аренда` / `Посуточно` / `Покупка`), object or «любой объект», rooms
   (`· 2 комн.`, `· 2–3 комн.`) — from `bot.wizard.context.*`.
6. Start (`/new`, `k1:nw`): load the user's settings for locale, create state `{kind: wizard_new, sid, message_id,
   step: deal, data: empty draft}` and send a NEW message (BR-BOT-016); a newer start replaces the state, so callbacks
   of the old message carry a stale `sid`.
7. Callback dispatch `k1:wz:<sid>:<op>[:<v>]`: unknown `sid`, expired state, or another kind → stale alert TXT-BOT-039
   + keyboard removed (KV-TG-011). Ops handled by the engine: `bk` (Back to the previous shown step, earlier choice
   marked `✅`), `cx` (Cancel: edit to TXT-BOT-026, keyboard removed, state deleted, silent answer). Step ops (`s1` …
   `s8`, `ct`, `zn`, `ds`, `wc`, `dn`, `bm`, `am`) go to the current step; `ed`, `rx`, `sv` to the review.
8. Mode hooks for KV-TG-035 and KV-TG-044: `mode = create | edit_step | edit_radar`, `return_to = review |
   edit_screen`; Cancel in `edit_radar` mode is delegated to KV-TG-044 (DEV-030).
9. Draft = `SearchFilters` built only through the shared normaliser; the engine never stores raw strings from callbacks.
10. Every step press edits the same `message_id` (BR-BOT-001) and answers silently (`04` §4.3). The only exception —
    the typed-amount path that continues in a new message — is handled by KV-TG-032 through `Transition::newMessage()`.

## Files

- `backend/app/Telegram/Conversations/RadarWizard/{Wizard,WizardState,Step,StepView,Transition,StepGraph}.php` (new)
- `backend/app/Telegram/Handlers/NewRadarCommand.php` (new; `/new` and `k1:nw`)
- `backend/lang/{ru,uz,en}/bot.php` (`wizard.frame.*`, `wizard.context.*`, `wizard.cancelled`)
- `backend/tests/Feature/Bot/Wizard/WizardEngineTest.php`, `backend/tests/Unit/Telegram/StepGraphTest.php` (new)

## API contract

Bot API: `sendMessage` (start), `editMessageText` + `reply_markup` (steps, Cancel), `editMessageReplyMarkup` (stale),
`answerCallbackQuery`. Callbacks `k1:nw`, `k1:wz:<sid>:<op>[:<v>]`.

## Business rules

- Kept: BR-BOT-009, BR-BOT-016, BR-BOT-018, BR-BOT-019, BR-BOT-020, BR-BOT-046.
- Replaced by the defect fixes LB-BOT-015/016: BR-BOT-017's fixed totals (M now follows the branch).
- DEV-030 (Cancel in edit mode) is applied in KV-TG-044; DEV-017 decides `tenant` visibility through the normaliser.

## Acceptance criteria

- `/new`, `📡 Включить радар` and `➕ Новый радар` each send one new message with a new `sid`; the welcome or list
  message they were pressed on is unchanged.
- rent_long + apartment shows `N из 8`, rent_long + room `N из 7`, rent_daily + apartment `N из 7`, sale + land
  `N из 5`; numbers have no gaps.
- Back from any step lands on the previous shown step with its choice ticked; Cancel always yields TXT-BOT-026 and an
  empty state.
- Any button of a superseded or expired wizard answers TXT-BOT-039 with `show_alert` and loses its keyboard.

## Tests

| # | Conversation | Expected |
| - | ------------ | -------- |
| 1 | `send('/new')` | new message: `📡 Новый радар · шаг 1`, TXT-BOT-012, three deal buttons and `✖️ Отмена`, no `◀️ Назад` |
| 2 | → `press('🔑 Снять надолго')` | same `message_id` edited; `шаг 2 из 8`; context `🏠 Аренда · любой объект` |
| 3 | → `press('Комната / подселение')` | `шаг 3 из 7` (area); rooms skipped |
| 4 | → `press('◀️ Назад')` | object step with `✅ Комната / подселение` |
| 5 | → `press('✖️ Отмена')` | text TXT-BOT-026, no keyboard, no toast, state deleted |
| 6 | start wizard A, then `/new` (B), press a button on A | alert TXT-BOT-039, A's keyboard removed, B unaffected |
| 7 | wizard idle longer than the TTL, then press | alert TXT-BOT-039 (Q-BOT-018 value configurable) |
| 8 | welcome → `press('📡 Включить радар')` | new wizard message; welcome not edited |
| 9 | forged `k1:wz:<sid of user B>:s1:rl` from user A | alert, no state change for A or B |

## Edge cases

- Two quick taps on one step button: the second sees the advanced state; the step ignores an op not valid for the
  current step (silent answer, no edit).
- Locale switched mid-wizard (KV-TG-017): the next render uses the new locale; the draft is kept.
- Redis flushed (ADR-0005 allows it): all wizards become stale; users restart with `/new`.

## Security

- SEC-REQ-011: actor from `from.id`; the `sid` binds callbacks to the actor's own state; malformed data → catch-all.
- SEC-REQ-017: every value goes through the shared normaliser.
- SEC-REQ-010: wizard presses count against the per-user callback limit of KV-TG-006.
- Conversation state holds filters only, no personal data (ENT-012).

## Definition of done

Tests green (`make ci-backend`), transcript `wizard-engine.json` in KV-QA-009 passes, F-BOT-003 and F-BOT-013
parity-gate rows updated, `09` rows updated, PR reviewed by the other developer.
