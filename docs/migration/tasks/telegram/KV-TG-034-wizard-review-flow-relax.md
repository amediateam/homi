# KV-TG-034 — Review screen: summary, flow estimate, warnings, relax

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend — Telegram bot (track: development) |
| Complexity | M |
| Feature IDs | F-BOT-007, F-RADAR-006 |
| Dependencies | KV-TG-033 (last wizard steps); flow estimate — F-FILTER-005 (API-006 domain `FlowEstimator`, one flow vocabulary of DEV-021); relax options — F-RADAR-006 (API-023 domain); money / time formatters F-LOCALE-003; Q-BOT-039, Q-BOT-010 |

## Goal

After the last step (or a parsed phrase) the wizard message becomes the review: a summary of the conditions, the
weekly flow estimate, warnings when the radar is too broad or nearly empty, one-tap relax options, the `✏️` buttons of
the branch and `✅ Сохранить` / `✖️ Отмена`. The estimate is recomputed after every change (LB-BOT-005) and uses the
flow vocabulary shared with the app and landing (DEV-021). The summary renderer is reused by the save message, the
radar card and the edit screen.

## Legacy reference

- BOT-047, BOT-049; title TXT-BOT-027 `📡 Новый радар — проверьте` (free text: TXT-BOT-040, edit: TXT-BOT-033);
  summary rows `🏠 📍 💰 👤 👥` (+ pets) with variants `tb:474–481`; layout `tb:458–470` (`04` §3.7 element table).
- Flow estimate TXT-BOT-028 (three wordings, `tb:483–487`); warnings TXT-BOT-029 (too broad, seen at ≈20/day),
  TXT-BOT-030 (almost nothing even without extras), TXT-BOT-031 (`Чтобы приходило больше:` + `• вместе с риелторами —
  2 за неделю`); closing TXT-BOT-032.
- Relax: BTN-027 `✅ Вместе с риелторами` (others unknown, Q-BOT-039) above the `✏️` rows; applying it recomputes
  and removes the button (`tb:495–498`).
- Keyboard per branch: BTN-026 two per row, `✅ Сохранить` (primary) and `✖️ Отмена` (`tb:500–510`).
- Rules: BR-BOT-039, BR-BOT-040, BR-BOT-041, BR-BOT-042, BR-BOT-043. Defect: LB-BOT-005 (estimate not recomputed after
  an object change), fix `APPROVED` by policy. Decision: DEV-021.

## Implementation

1. Read `04` §3.7 and the flow / relax services of the backend track. Tests first
   (`php artisan make:test --pest Bot/Wizard/ReviewTest`).
2. `php artisan make:class Telegram/Rendering/RadarSummaryRenderer`: rows from a `SearchFilters` value —
   `🏠` deal · object · rooms; `📍` city · districts (comma-separated) / zones / `весь <город>`; `💰` `до $650/мес`,
   `до $100 000, не дороже рынка`, `любой бюджет` (period suffix by deal); `👤` owner wording; `👥` tenant (omitted for
   null); pets row omitted for «Не важно», otherwise `bot.summary.pets.not_forbidden` / `.allowed` (specified here for
   Q-BOT-010, `oracle: spec`); a line `bot.summary.extra_filters` when the radar holds filters the bot cannot show
   (Mini App radars, Q-BOT-026). Shared by KV-TG-036, KV-TG-041, KV-TG-044.
3. `php artisan make:class Telegram/Conversations/RadarWizard/ReviewStep`: title by mode; summary; flow line from the
   flow estimator (per-week count of the normalised draft) worded by the shared flow formatter (DEV-021) in the three
   TXT-BOT-028 tiers (≈N per day / N per week / none); warnings: TXT-BOT-029 when the daily rate ≥
   `bot.review.too_broad_per_day` (default 20, Q-BOT-039), TXT-BOT-030 when the base count (deal + types + city only)
   ≤ `bot.review.base_scarce_per_week` (default 2, Q-BOT-039); relax block TXT-BOT-031 with one line per relax option
   (`• <label> — <rate>`) and one button per option (`k1:wz:<sid>:rx:<code>`); closing TXT-BOT-032.
4. Keyboard: relax buttons, then `✏️` buttons of the branch two per row (`k1:wz:<sid>:ed:<step>`; per-branch sets of
   `tb:502–508`, room/commercial branches without `✏️ Комнаты`), `✅ Сохранить` primary (`k1:wz:<sid>:sv`),
   `✖️ Отмена` (`k1:wz:<sid>:cx`).
5. Relax (`rx:<code>`): ask the relax service to apply the weakening to the draft (e.g. `owner: no_agents → any`),
   recompute everything, re-render; the applied option disappears (BR-BOT-042). Unknown or no-longer-offered code →
   silent re-render.
6. Recompute the estimate on every render (LB-BOT-005); the estimator caches by normalised filter hash for 30–60 s
   (backend).
7. Save (`sv`) is KV-TG-036, step edits (`ed`) are KV-TG-035.

## Files

- `backend/app/Telegram/Rendering/RadarSummaryRenderer.php` (new)
- `backend/app/Telegram/Conversations/RadarWizard/ReviewStep.php`, `backend/app/Telegram/Keyboards/ReviewKeyboard.php` (new)
- `backend/config/bot.php` (`review.*` thresholds), `backend/lang/{ru,uz,en}/bot.php` (`review.*`, `summary.*`)
- `backend/tests/Feature/Bot/Wizard/ReviewTest.php`, `backend/tests/Unit/Telegram/RadarSummaryRendererTest.php` (new)

## API contract

Bot API: `editMessageText` + `reply_markup`, `answerCallbackQuery` (silent). Callbacks `k1:wz:<sid>:rx:<code>`,
`k1:wz:<sid>:ed:<step>`, `k1:wz:<sid>:sv`, `k1:wz:<sid>:cx`.

## Business rules

- Kept: BR-BOT-039, BR-BOT-040, BR-BOT-042, BR-BOT-043; BR-BOT-041 with a configurable threshold (`UNVERIFIED`,
  Q-BOT-039).
- Defect fix: LB-BOT-005 (recompute after every change).
- `PROPOSED`: DEV-021 (one flow vocabulary) — wording from the shared formatter once approved; until then the exact
  TXT-BOT-028 strings.

## Acceptance criteria

- The review of the fixture radar equals the `tb:458–470` sample (title, rows, flow line, closing).
- `✏️` buttons per branch equal `tb:502–508`; save and cancel always present.
- Changing the object in an edit and returning to the review changes the flow line when the counts change.
- Applying `✅ Вместе с риелторами` sets `👤 все объявления`, recomputes, and removes the button.

## Tests

| # | Conversation | Expected |
| - | ------------ | -------- |
| 1 | rent_long · квартира · 2 · Юнусабад, Чиланзар · до $650 · без риелторов · семья · pets any | review TXT-BOT-027 with rows `🏠 Аренда · квартира · 2 комн.`, `📍 Ташкент · Юнусабад, Чиланзар`, `💰 до $650/мес`, `👤 без риелторов`, `👥 для семьи`; no pets row |
| 2 | estimator fake: 21 per week | `📡 По последней неделе — ≈3 объявления в день (дубли из разных каналов — одной карточкой).` |
| 3 | estimator fake: 2 per week | `… — 2 объявления за неделю: радар будет срабатывать нечасто.` |
| 4 | estimator fake: 0 | `📡 За последнюю неделю таких объявлений не было — радар будет срабатывать редко.` |
| 5 | 140 per week (20/day) | TXT-BOT-029 paragraph present; at 133 (19/day) absent |
| 6 | relax service offers `agents` with 2/week | TXT-BOT-031 block and `✅ Вместе с риелторами` above `✏️` rows |
| 7 | → `press('✅ Вместе с риелторами')` | `👤 все объявления`; flow recomputed; relax button gone |
| 8 | sale · участок | `✏️ Сделка` `✏️ Объект` / `✏️ Районы` `✏️ Бюджет` / `✏️ Риелторы`, then save, cancel |
| 9 | pets `Разрешены` | pets row `bot.summary.pets.allowed` (spec) |

## Edge cases

- The estimator is slow or down: render the review without the flow line and log; the user can still save.
- A relax option that would empty the radar is never offered (relax service rule).
- Very long district lists: the `📍` row lists all; the message stays under 4 096 characters (40+ districts still fit).

## Security

- SEC-REQ-011 / SEC-REQ-017: relax codes from the closed set returned by the service for this draft.
- SEC-REQ-020: names escaped in the summary.
- Estimator queries run on the normalised filter only; no user text reaches SQL.

## Definition of done

Tests green (`make ci-backend`), KV-QA-009 review transcripts pass, F-BOT-007 parity-gate row updated (G5 waits for
DEV-021), `09` rows F-BOT-007 / F-RADAR-006 updated, PR reviewed by the other developer.
