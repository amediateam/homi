# KV-TG-031 — Wizard step 5: budget presets, median line, «Не дороже рынка»

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend — Telegram bot (track: development) |
| Complexity | M |
| Feature IDs | F-BOT-005, F-FILTER-007 |
| Dependencies | KV-TG-030 (area step: city chosen); price presets per city / deal / rooms — F-FILTER-006 (ENT-051); city medians and the availability rule of «Не дороже рынка» — F-FILTER-007, F-PIPELINE-005; money formatter F-LOCALE-003; DEV-052, DEV-006 (`PROPOSED`); Q-BOT-044 |

## Goal

Step 5 asks for the maximum budget with presets that depend on the city, deal and rooms, shows the city's median line
and the «Не дороже рынка» toggle only where a market comparison exists, and moves on with a preset or «Не важно». The
availability of the below-market option follows one server rule shared with the Mini App (DEV-052); amounts follow the
user's currency once DEV-006 is approved.

## Legacy reference

- BOT-041; question TXT-BOT-018 by deal (`Бюджет в месяц — до скольки?` / `Бюджет за сутки — до скольки?` /
  `Бюджет на покупку — до скольки?`), median line TXT-BOT-019 (`<Город>: половина квартир — до $<N> в месяц`; sale
  without «в месяц»), explanation TXT-BOT-020 (`tb:382`) — `tb:373–411`.
- Buttons: BTN-018 presets `до $<amount>` (3 per row) and `✅ Не важно`, BTN-019 `✍️ Своя сумма` (KV-TG-032), BTN-020
  `📊 Не дороже рынка` (toggle, stays on the step); layout `tb:385–388`; observed preset sets `04` §3.6 table.
- Rules: BR-BOT-031 (presets and median by city, deal, rooms), BR-BOT-032 (median and toggle only for Tashkent and
  Tashkent region, rent_long and sale; never rent_daily; paragraph absent without the button), BR-BOT-033 (meaning of
  «Не дороже рынка»), BR-BOT-034 (toggle combines with an amount), BR-BOT-035 (maximum in USD).
- Decisions: DEV-052 (one availability rule), DEV-006 (bot budget in the user's currency), LB-BOT-019.
- Shared data: `GET /api/cities` → `presets` (inferred, Q-BOT-044); `CityMeta.median` flag (`tb:399–400`).

## Implementation

1. Read `04` §3.6, the DEV-052 and DEV-006 rows of `09` §4.2. Tests first
   (`php artisan make:test --pest Bot/Wizard/BudgetStepTest`).
2. `php artisan make:class Telegram/Conversations/RadarWizard/BudgetStep`: text = TXT-BOT-018 for the deal + (when
   available) TXT-BOT-019 with the city median formatted by the money formatter + TXT-BOT-020 (only with the toggle).
3. Data: presets from the presets source of F-FILTER-006 (city × deal × rooms; rooms bucket of the draft); median and
   availability from the Pricing module through one rule `BelowMedianAvailability::for(city, deal, types)` (DEV-052;
   until approval it reproduces BR-BOT-032 exactly).
4. Keyboard: presets `до $<amount>` three per row (`k1:wz:<sid>:s5:<amount36>`, the amount must be one of the presets
   currently shown), `✍️ Своя сумма` · `✅ Не важно` (`k1:wz:<sid>:am`, `k1:wz:<sid>:s5:any`), `📊 Не дороже рынка`
   with `✅ ` when on (`k1:wz:<sid>:bm`), then Back · Cancel. Default ticked: `✅ Не важно`.
5. Transitions: preset or «Не важно» → `price_max` set or cleared → next step (owner) or back to the review in edit
   mode; `bm` toggles `below_median` and re-renders the same step (BR-BOT-034); `am` → KV-TG-032.
6. DEV-006 (`PROPOSED`, money — developer + product owner): with the flag `bot.dev006` and the user's currency `UZS`,
   presets come in soʻm from the presets source (rounded per currency), labels `до <amount> сум`, and the draft stores
   `price_max` with `price_currency = UZS`; the matcher converts with the CBU rate (F-PIPELINE-007). Without the flag:
   USD, as legacy.
7. Deal `rent_daily`: no median line, no toggle (BR-BOT-032); `below_median` forced off by the normaliser.

## Files

- `backend/app/Telegram/Conversations/RadarWizard/BudgetStep.php` (new)
- `backend/app/Telegram/Keyboards/BudgetKeyboard.php` (new)
- `backend/lang/{ru,uz,en}/bot.php` (`wizard.budget.*`)
- `backend/tests/Feature/Bot/Wizard/BudgetStepTest.php` (new)

## API contract

Bot API: `editMessageText` + `reply_markup`, `answerCallbackQuery` (silent). Callbacks `k1:wz:<sid>:s5:<amount36|any>`,
`k1:wz:<sid>:bm`, `k1:wz:<sid>:am`.

## Business rules

- Kept: BR-BOT-031, BR-BOT-032 (until DEV-052), BR-BOT-033 (meaning, implemented by the matcher), BR-BOT-034,
  BR-BOT-035 (USD until DEV-006).
- `PROPOSED`: DEV-052 (one availability rule), DEV-006 (user's currency) — tests `todo` until approved.

## Acceptance criteria

- For the fixtures of `04` §3.6 the step shows exactly the observed presets, median lines and toggle presence per city
  and deal.
- `📊 Не дороже рынка` toggles without leaving the step and survives a later preset choice (`💰 до $100 000, не
  дороже рынка` in the review).
- A forged amount that is not among the shown presets is refused (catch-all).
- rent_daily never shows the toggle or the median line.

## Tests

| # | Conversation | Expected |
| - | ------------ | -------- |
| 1 | rent_long · apartment · 2 · Ташкент → step 5 | TXT-BOT-018 month question; `Ташкент: половина квартир — до $700 в месяц`; presets 300, 400, 500 / 600, 800, 1 000 / 1 500; toggle present |
| 2 | same for Андижан | median `… до $300 в месяц`, presets 200, 300, 350, 500, no toggle, no TXT-BOT-020 paragraph |
| 3 | rent_daily | `Бюджет за сутки — до скольки?`; presets 30, 50, 80, 120; no median, no toggle |
| 4 | sale · Ташкент | `Бюджет на покупку — до скольки?`; `Ташкент: половина квартир — до $94 000`; six presets; toggle |
| 5 | step 5 → `📊 Не дороже рынка` | same message, `✅ 📊 Не дороже рынка`, still step 5 |
| 6 | → `до $800` | owner step; draft `price_max = 800 USD`, `below_median = true` |
| 7 | → `✅ Не важно` | owner step; `price_max = null` |
| 8 | forged `k1:wz:<sid>:s5:<amount not shown>` | alert TXT-BOT-039, no change |
| 9 | user currency UZS, `bot.dev006` on (`todo`) | presets in soʻm; draft currency UZS |

## Edge cases

- City without presets data yet (fresh environment): only `✍️ Своя сумма` and `✅ Не важно`; no crash.
- Median missing for the city (too few listings): no median line and, by DEV-052, no toggle.
- Rooms «Не важно»: presets of the city × deal without a rooms bucket.
- Live values change between render and press: the pressed preset is validated against the presets stored with the
  rendered step (kept in the wizard state), not recomputed.

## Security

- SEC-REQ-011 / SEC-REQ-017: amounts accepted only from the presets of the rendered step; values pass the normaliser.
- SEC-REQ-020: city names and formatted amounts escaped.
- No personal data.

## Definition of done

Tests green (`make ci-backend`), transcripts per city in KV-QA-009 pass, F-BOT-005 and F-FILTER-007 parity-gate rows
updated (G5 waits for DEV-052 / DEV-006), `09` rows updated, PR reviewed by the other developer.
