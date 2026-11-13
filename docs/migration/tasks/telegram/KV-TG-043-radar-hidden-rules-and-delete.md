# KV-TG-043 — Radar card: hidden rules one by one and delete with confirmation

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend — Telegram bot (track: development) |
| Complexity | M |
| Feature IDs | F-BOT-010, F-HIDE-004, F-RADAR-005 |
| Dependencies | KV-TG-041 (radar card), KV-TG-040 (found poll); radar hide rules (ENT-009) and the `unhide` patch — API-021 domain; radar delete — API-022 domain (F-RADAR-005); DEV-033 (`PROPOSED`); DEV-034 coordination with KV-TG-026 |

## Goal

The radar card lets the user remove hide rules — all at once as in legacy, and one by one with «remove all» behind a
confirmation once DEV-033 is approved — and delete the radar after a confirmation, landing on the list (or the empty
state) and possibly the found poll.

## Legacy reference

- BTN-054 `🙉 Показать скрытое` (only with rules) → toast TXT-BOT-066 `Скрытое снова показывается`; the `🙈` line and the
  button disappear; all rules removed at once (`tb:720`).
- BTN-057 `🗑 Удалить` → TXT-BOT-061 `Удалить радар «<название>»?` with BTN-058 `🗑 Да, удалить` (danger) · BTN-059
  `✖️ Отмена`; confirm → toast TXT-BOT-067 `Радар удалён`, message → list or `Радаров пока нет…`; the poll did not come
  that time; cancel → back to the card (`tb:722–724`; BOT-068).
- Rules: BR-BOT-063 (rules removed only all together), BR-BOT-068 (confirmation, then list or empty state), BR-BOT-048
  (starter number buttons keep working after a delete), BR-API-090 (`ask_found` on delete).
- Problem: LB-BOT-024 (no way to remove one rule; no confirmation) → DEV-033.

## Implementation

1. Read `04` §3.11 and the DEV-033 row of `09` §4.2. Tests first
   (`php artisan make:test --pest Bot/RadarHiddenRulesDeleteTest`).
2. Hidden rules, `php artisan make:class Telegram/Handlers/Subs/RadarHiddenRules`:
   - legacy (flag `bot.dev033` off): `🙉 Показать скрытое` = `k1:sb:<r>:ra` → radar service `patch(unhide: true)`
     → toast TXT-BOT-066 → card re-rendered without the `🙈` line and the button;
   - DEV-033 (`PROPOSED`): the button becomes `🙈 Скрытое (N)` (`bot.subs.hidden_rules`, new label) → `k1:sb:<r>:hr`
     edits the card into a rule list: one button per rule `✖ @канал` / `✖ <район>` / `✖ <автор>` (`k1:sb:<r>:rr:<rule36>`),
     `🙉 Показать всё скрытое` (`k1:sb:<r>:ra`) → confirmation `bot.subs.unhide_all_confirm` with `✅ Да` (`ray`) /
     `✖️ Отмена` (`op`), and `◀️` back to the card (`op`); removing one rule answers `bot.subs.rule_removed` (new text)
     and re-renders the list; removing the last returns to the card.
   - With DEV-034 approved (user-wide rules, KV-TG-026) the rules shown are the user's, labelled as such.
3. Delete, `php artisan make:class Telegram/Handlers/Subs/RadarDelete`: `k1:sb:<r>:dl` → edit into TXT-BOT-061 with
   `🗑 Да, удалить` (style `danger`, `dly`) · `✖️ Отмена` (`dln` → card); `dly` → radar service `delete` → toast
   TXT-BOT-067 → edit into the list (KV-TG-041) or TXT-BOT-057 when none is left → `FoundPoll::maybeSend(user, radar,
   delete)`.
4. A second `dly` (double tap or stale copy) finds no radar → re-render the list, toast TXT-BOT-067 again (idempotent
   outcome), no error.
5. Effects owned by other modules: pending digest / quiet items of the radar are dropped by the delivery planner;
   the delivered set is kept (so the user's other radars still skip those listings); starter-list buttons keep working
   (they carry only listing numbers).

## Files

- `backend/app/Telegram/Handlers/Subs/{RadarHiddenRules,RadarDelete}.php` (new)
- `backend/app/Telegram/Keyboards/{HiddenRulesKeyboard,ConfirmKeyboard}.php` (new)
- `backend/config/bot.php` (`dev033`), `backend/lang/{ru,uz,en}/bot.php` (`subs.hidden*`, `subs.delete*`)
- `backend/tests/Feature/Bot/RadarHiddenRulesDeleteTest.php` (new)

## API contract

Bot API: `answerCallbackQuery` (toasts), `editMessageText` + `reply_markup`, `sendMessage` (poll). Callbacks
`k1:sb:<r>:hr|rr:<rule>|ra|ray|op|dl|dly|dln`.

## Business rules

- Kept: BR-BOT-068, BR-BOT-048, BR-API-090; BR-BOT-063 until DEV-033 is approved.
- `PROPOSED`: DEV-033 (rules one by one, remove-all behind a confirmation) — tests `todo` until approved. The old Mini
  App's `PATCH {unhide: true}` keeps clearing all rules (backend).

## Acceptance criteria

- Legacy mode: one press removes all rules, toast TXT-BOT-066, card without `🙈` and the button.
- DEV-033 mode: each `✖` removes exactly one rule; remove-all needs the confirmation.
- Delete needs the confirmation; confirm shows the list or TXT-BOT-057 in the same message and TXT-BOT-067 as a toast;
  cancel restores the card.

## Tests

| # | Conversation | Expected |
| - | ------------ | -------- |
| 1 | card with 2 rules → `press('🙉 Показать скрытое')` (legacy) | toast TXT-BOT-066; card re-rendered without `🙈` line and button; rules gone |
| 2 | DEV-033 (`todo`): `press('🙈 Скрытое (2)')` → `press('✖ @<канал>')` | one rule removed; list shows one rule; toast `bot.subs.rule_removed` |
| 3 | DEV-033: `🙉 Показать всё скрытое` → `✅ Да` | all rules removed; back to the card |
| 4 | card → `press('🗑 Удалить')` | TXT-BOT-061 `Удалить радар «Аренда · квартира · 2 комн. · …»?`; `🗑 Да, удалить` has style `danger` |
| 5 | → `press('✖️ Отмена')` | card restored, radar intact |
| 6 | → `press('🗑 Да, удалить')` (other radars left) | toast `Радар удалён`; list in the same message; poll if `ask_found` |
| 7 | delete the last radar | TXT-BOT-057 with `➕ Новый радар` |
| 8 | double tap on `🗑 Да, удалить` | one delete; second press → list re-rendered, same toast |
| 9 | after delete, press a number of that radar's starter list | card sent (BR-BOT-048) |

## Edge cases

- Rules created by the Mini App's global hidden list are not radar rules and are not shown here (until DEV-034).
- A rule referencing a channel that was later opted out: still listed and removable.
- Radar deleted in the Mini App while the confirmation is open: `dly` → list re-render, no error.

## Security

- SEC-REQ-014: radars and rules resolved through the actor's relation; rule ids belong to that radar.
- Destructive actions confirmed (`danger` style), idempotent.

## Definition of done

Tests green (`make ci-backend`), KV-QA-009 transcripts for hidden rules and delete pass, F-BOT-010, F-HIDE-004 and
F-RADAR-005 (bot part) parity-gate rows updated (G5 for F-HIDE-004 waits for DEV-033), `09` rows updated, PR reviewed by
the other developer.
