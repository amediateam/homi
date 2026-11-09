# KV-TG-033 — Wizard steps 6–8: owner, tenant, pets

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend — Telegram bot (track: development) |
| Complexity | S |
| Feature IDs | F-BOT-006 |
| Dependencies | KV-TG-029 (wizard steps 1–3; engine of KV-TG-028); shared filter rules for tenant and pets — F-FILTER-001 (normaliser); DEV-017 (`PROPOSED`); Q-BOT-027 |

## Goal

Steps 6–8 ask whose listings the user wants, who will live in the flat, and whether pets matter, with the legacy texts
and options; step 7 appears only for the deals the shared rule allows and step 8 only for long-term rent. The bot and
the Mini App store the same values for the same choice (DEV-017).

## Legacy reference

- Step 6: BOT-044, TXT-BOT-023 `От кого объявления?` + hint `tb:429`, BTN-021 `✅ Все объявления` / `Без риелторов` /
  `Только хозяева`; next step 7 (rent) or review (sale) (`tb:424–432`).
- Step 7: BOT-045, TXT-BOT-024 `Кто будет жить?` + `Скрою объявления «только девушкам / парням / семье», которые вам не
  подходят.`, BTN-022 `👨‍👩‍👧 Семья` / `👨 Парень / парни` / `👩 Девушка / девушки` / `✅ Не важно`; rent_long and
  rent_daily (`tb:434–442`).
- Step 8: BOT-046, TXT-BOT-025 `🆕 Можно ли с животными?` + hint `tb:449`, BTN-023 `🐾 Не запрещены` / `🐾 Разрешены` /
  `✅ Не важно`; rent_long only (`tb:444–452`).
- Rules: BR-BOT-036 (owner filters), BR-BOT-037 (tenant), BR-BOT-038 (pets / pets_only, never both), BR-BOT-104 (enum
  values `any` / `no_agents` / `owners`, `family` / `men` / `women` / null).
- Conflict: LB-BOT-030 (bot asks tenant on rent_daily, contract says rent_long only), DEV-017, Q-BOT-027.

## Implementation

1. Read `04` §3.4 option table and the DEV-017 row of `09` §4.2. Tests first
   (`php artisan make:test --pest Bot/Wizard/OwnerTenantPetsTest`).
2. `php artisan make:class Telegram/Conversations/RadarWizard/OwnerStep`: options one per row, default `✅ Все
   объявления`; callbacks `k1:wz:<sid>:s6:<any|na|ow>` → `owner` = `any` / `no_agents` / `owners`.
3. `TenantStep`: visible when `SearchFilters::allows('tenant', deal)` from the shared normaliser — legacy bot shows it
   for rent_long and rent_daily; DEV-017 decides the shared rule for both bot and app (proposal: both deals). Options
   one per row, default `✅ Не важно`; `k1:wz:<sid>:s7:<fa|me|wo|any>` → `tenant` = `family` / `men` / `women` / null.
4. `PetsStep`: rent_long only; options `🐾 Не запрещены` (`pets = true`), `🐾 Разрешены` (`pets_only = true`),
   `✅ Не важно` (both false); `k1:wz:<sid>:s8:<nf|al|any>`; the `🆕` prefix of TXT-BOT-025 is kept as legacy text.
5. Next after each: the next shown step of the graph, or the review (KV-TG-034); in edit mode back to the review /
   edit screen (KV-TG-035, KV-TG-044).
6. Changing the deal later (edit mode) re-applies visibility: values of a step that disappears are cleared by the
   normaliser (DEV-004), never silently kept.

## Files

- `backend/app/Telegram/Conversations/RadarWizard/{OwnerStep,TenantStep,PetsStep}.php` (new)
- `backend/lang/{ru,uz,en}/bot.php` (`wizard.owner.*`, `wizard.tenant.*`, `wizard.pets.*`)
- `backend/tests/Feature/Bot/Wizard/OwnerTenantPetsTest.php` (new)

## API contract

Bot API: `editMessageText` + `reply_markup`, `answerCallbackQuery` (silent). Callbacks `k1:wz:<sid>:s6:<v>`,
`k1:wz:<sid>:s7:<v>`, `k1:wz:<sid>:s8:<v>`.

## Business rules

- Kept: BR-BOT-020, BR-BOT-036, BR-BOT-037, BR-BOT-038, BR-BOT-104.
- `PROPOSED`: DEV-017 (one tenant/pets rule for API, bot and app) — until approval the bot keeps legacy visibility
  (tenant for both rents); the transcript for rent_daily + tenant is marked with DEV-017.

## Acceptance criteria

- Option labels, order and defaults equal `tb:424–452`.
- sale skips steps 7 and 8; rent_daily skips step 8; rent_long shows all three.
- `Не запрещены` and `Разрешены` never set both `pets` and `pets_only`.
- The stored values equal what the Mini App would store for the same choices under the approved DEV-017 rule.

## Tests

| # | Conversation | Expected |
| - | ------------ | -------- |
| 1 | rent_long … step 6 | TXT-BOT-023 + hint; `✅ Все объявления` / `Без риелторов` / `Только хозяева`; Back · Cancel |
| 2 | → `Без риелторов` | tenant step; draft `owner = no_agents` |
| 3 | → `👨‍👩‍👧 Семья` | pets step with `🆕 Можно ли с животными?`; draft `tenant = family` |
| 4 | → `🐾 Разрешены` | review; `pets_only = true`, `pets = false` |
| 5 | sale … step 6 → `Только хозяева` | review directly |
| 6 | rent_daily … step 6 → `✅ Все объявления` | tenant step (legacy visibility; DEV-017) → `✅ Не важно` → review |
| 7 | pets step → `◀️ Назад` | tenant step with `✅ 👨‍👩‍👧 Семья` |
| 8 | forged `k1:wz:<sid>:s8:al` in a sale wizard | catch-all alert, no change |

## Edge cases

- rent_long radar edited to sale later: tenant and pets cleared by the normaliser and absent from the review.
- A Mini App radar with `tenant` on rent_daily edited in the bot: the step shows the stored value ticked (if the
  approved rule allows it) or the value is dropped with the normaliser's report (DEV-004).

## Security

- SEC-REQ-011 / SEC-REQ-017: values from closed sets only; normaliser applied.
- No personal data.

## Definition of done

Tests green (`make ci-backend`), KV-QA-009 transcripts for the three deals pass, F-BOT-006 parity-gate row updated (G5
waits for DEV-017), `09` row updated, PR reviewed by the other developer.
