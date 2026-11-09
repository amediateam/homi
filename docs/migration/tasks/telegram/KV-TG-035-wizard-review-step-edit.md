# KV-TG-035 — In-place step edit from the review

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend — Telegram bot (track: development) |
| Complexity | S |
| Feature IDs | F-BOT-007 |
| Dependencies | KV-TG-034 (review); steps of KV-TG-029 … KV-TG-033; Q-BOT-041 |

## Goal

A `✏️` button on the review opens that one step in the same message; a choice or `◀️ Назад` returns to the review with
a recomputed estimate. Changing the deal resets the budget and forces the object step when the old object is not
allowed for the new deal. The same mechanism serves the edit screen of an existing radar (KV-TG-044).

## Legacy reference

- BOT-048, BTN-026 (`✏️ Сделка` … `✏️ Животные`), `tb:512–515`; state machine `04` §3.7.
- Rules: BR-BOT-043 (pencils of the branch only), BR-BOT-044 (choice returns to the review; Back returns unchanged),
  BR-BOT-045 (deal change resets the budget; incompatible object → object step).
- Header: the same `шаг N из M` as in creation; `Изменение радара · шаг N из M` (TXT-BOT-011) for an existing radar.
- Unknown: what follows the forced object step (Q-BOT-041).

## Implementation

1. Read `04` §3.7 and the engine's mode hooks (KV-TG-028 step 8). Tests first
   (`php artisan make:test --pest Bot/Wizard/ReviewStepEditTest`).
2. `k1:wz:<sid>:ed:<step>` → set `mode = edit_step`, `return_to = review` (or `edit_screen` when the wizard edits an
   existing radar), remember a snapshot of the draft, render the step with its normal header and the current choice
   ticked.
3. Return rules: a single-choice press stores the value and returns to `return_to`; `◀️ Назад` restores the snapshot
   and returns unchanged (BR-BOT-044); in the area step only `Готово (N)` returns (KV-TG-030); in the budget step a
   preset or «Не важно» returns, the toggle stays; a typed amount returns with the review as a new message
   (KV-TG-032).
4. Deal change (BR-BOT-045): `price_max` and `below_median` cleared («любой бюджет»); steps that disappear for the new
   deal are cleared by the normaliser (tenant, pets, rooms); if the object is not allowed for the new deal, the object
   step opens next (still `edit_step`).
5. Forced object step (Q-BOT-041, specified here, `oracle: spec`): after the object is chosen, if the new object has a
   rooms step and rooms are unset, rooms default to «Не важно»; the flow returns to `return_to` — no step-by-step
   continuation.
6. The review re-renders with a recomputed estimate (LB-BOT-005 fix in KV-TG-034).

## Files

- `backend/app/Telegram/Conversations/RadarWizard/{Wizard,WizardState}.php` (edit-step mode)
- `backend/tests/Feature/Bot/Wizard/ReviewStepEditTest.php` (new)

## API contract

Bot API: `editMessageText` + `reply_markup`, `answerCallbackQuery` (silent). Callback `k1:wz:<sid>:ed:<step>`;
step ops as in their tasks.

## Business rules

- Kept: BR-BOT-043, BR-BOT-044, BR-BOT-045.
- Q-BOT-041 closed by specification (return to the review after the forced object step); record it in the PR.
- No DEV.

## Acceptance criteria

- Every `✏️` button opens its step in the same message with the current value ticked.
- `◀️ Назад` from an edited step returns to an identical review (same text and keyboard).
- `✏️ Сделка` → `🏷 Купить` from a rent_long room radar opens the object step for sale, then returns to the review with
  `💰 любой бюджет` and no tenant / pets rows.

## Tests

| # | Conversation | Expected |
| - | ------------ | -------- |
| 1 | review → `press('✏️ Комнаты')` → `3` | review with `· 3 комн.`; flow recomputed |
| 2 | review → `press('✏️ Бюджет')` → `◀️ Назад` | review unchanged (byte-equal text) |
| 3 | rent_long · комната review → `✏️ Сделка` → `🏷 Купить` | object step for sale (header `шаг 2 из …`) |
| 4 | → `Квартира` | review: `🏠 Покупка · квартира`, `💰 любой бюджет`, no `👥` row, rooms «Не важно» |
| 5 | rent_long · квартира, budget 650 → `✏️ Сделка` → `🌙 Снять посуточно` | review: `💰 любой бюджет`, pets cleared, object kept |
| 6 | review → `✏️ Районы` → tick `Чиланзар` → `Готово (2)` | review `📍 Ташкент · Юнусабад, Чиланзар` |
| 7 | review → `✏️ Бюджет` → `✍️ Своя сумма` → `700` | old message keyboard removed; review as a new message with `до $700/мес` |
| 8 | edit screen of an existing radar → `✏️ Риелторы` → `Только хозяева` | back to TXT-BOT-033 edit screen with header TXT-BOT-011 used in the step |

## Edge cases

- Edit of a step that the branch no longer has (stale `ed:pets` after switching to sale) → silent re-render of the
  review without that step.
- Two `✏️` presses in a row on stale keyboards: the second sees `mode = edit_step` of another step and re-renders
  the current step.

## Security

- SEC-REQ-011: step keys from the closed set; `sid`-bound.
- SEC-REQ-017: every stored value passes the normaliser.

## Definition of done

Tests green (`make ci-backend`), KV-QA-009 transcripts for review edits pass, F-BOT-007 parity-gate row updated, `09`
row updated, PR reviewed by the other developer.
