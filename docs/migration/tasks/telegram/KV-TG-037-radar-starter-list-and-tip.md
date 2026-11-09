# KV-TG-037 — Starter list after save and the first-radar tip

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend — Telegram bot (track: development) |
| Complexity | M |
| Feature IDs | F-BOT-008, F-DELIVERY-005 |
| Dependencies | KV-TG-036 (`RadarSavedByBot`), KV-TG-022 (`CardSender`, open-by-number handler shared with KV-TG-027); starter query and delivered set — F-DELIVERY-005 (BR-API-079, BR-API-089; `radar_deliveries` of KV-DB-009 in `14` §8); radar mode patch — F-RADAR-004 (API-021 domain); Q-BOT-038, Q-BOT-010 |

## Goal

After a radar is saved the bot lists what already matches from the last three days, newest first, with number buttons
that open cards; these listings count as delivered, so the radar never pushes them again. After the user's very first
radar, a short tip explains the bot and asks whether new listings should arrive instantly or as a digest.

## Legacy reference

- Starter list: BOT-052, TXT-BOT-035 `🗂 Уже есть за последние 3 дня: N — свежие сверху` + rows `<n>. 2-комн. квартира ·
  Юнусабад · $700 · @<канал> · 30.10 17:00` + `Нажмите номер, чтобы открыть карточку.`; BTN-031 number buttons five per
  row; a number sends the card as a new message, the list does not change, buttons work after the radar is deleted
  (`tb:538–551`).
- Defect: LB-BOT-003 (a 30.10 post listed first on 09.11 — window and label used different dates), fix `APPROVED` by
  policy (`09` §4.3).
- Tip: BOT-053, TXT-BOT-036 (`tb:554–562`, digest times from the settings), BTN-032 `⚡ Сразу` → keyboard removed and the
  last paragraph replaced by TXT-BOT-037; BTN-033 `📬 Подборкой` not checked → TXT-BOT-038 unverified (Q-BOT-010).
- Rules: BR-BOT-048, BR-BOT-049 (after an edit only unseen listings), BR-BOT-050 (tip only after the first radar),
  BR-API-079, BR-DATA-012.

## Implementation

1. Read `04` §3.8 and the starter / delivered-set services of the backend track. Tests first
   (`php artisan make:test --pest Bot/Wizard/StarterListTest`).
2. `php artisan make:listener Telegram/SendStarterList --event=RadarSavedByBot` (queued on `telegram`): ask the starter
   query for matches of the radar from the last 72 hours by **first-seen time**, excluding hidden listings, blocked
   authors, the radar's hide rules and listings already delivered to the user (LB-BOT-003: one date for filter and
   label, the label is the first-seen time in Asia/Tashkent `dd.mm HH:MM`).
3. If N > 0: send TXT-BOT-035 with the rows (formatter of F-LOCALE-003) and number buttons five per row
   (`k1:ln:<listing36>`, handled by the shared open-by-number handler with `CardSender` origin `number`). Cap
   (`PROPOSED`, Q-BOT-038): at most 30 rows; above that the header keeps the full N and the last row is
   `bot.starter.more` («…и ещё K — в приложении», new text) with a `web_app` button to the Mini App feed.
4. Record every listed listing in the delivered set (`radar_deliveries`, first radar = this radar) in the same
   transaction as the send log, so radar pushes skip them (BR-BOT-049, F-DELIVERY-005).
5. Tip (BR-BOT-050): only when this is the user's first radar ever (no earlier radar, including deleted ones —
   `users` flag `first_radar_tip_sent_at`, added by this task's migration if KV-DB-007 lacks it); TXT-BOT-036 with the
   user's digest times; buttons `⚡ Сразу` (`k1:tp:<radar36>:in`) · `📬 Подборкой` (`k1:tp:<radar36>:dg`).
6. `in` → radar mode instant (already the default, idempotent patch) → keyboard removed, last paragraph → TXT-BOT-037;
   `dg` → radar mode digest through the radar service → keyboard removed, last paragraph → TXT-BOT-038 with the
   digest times (`📬 Хорошо — пришлю подборкой в {times}. Поменять: /subs.` — specified here for Q-BOT-010,
   `oracle: spec`).
7. Message order after save: confirmation edit and sticker (KV-TG-036, before the event is dispatched) → starter list
   → tip, the last two sent in that order by this one queued listener so they never interleave.
8. After an edit of an existing radar (KV-TG-044) the same listener sends only unseen listings (BR-BOT-049) and never the
   tip or the sticker (legacy unrecorded; specification).

## Files

- `backend/app/Listeners/Telegram/SendStarterList.php` (new), `backend/app/Telegram/Handlers/FirstRadarTip.php` (new)
- `backend/app/Telegram/Keyboards/NumberGridKeyboard.php` (new)
- `backend/database/migrations/*_add_first_radar_tip_sent_at_to_users_table.php` (only if KV-DB-007 does not add it)
- `backend/lang/{ru,uz,en}/bot.php` (`starter.*`, `tip.*`)
- `backend/tests/Feature/Bot/Wizard/StarterListTest.php` (new)

## API contract

Bot API: `sendMessage` (list, tip), `editMessageText` (tip answers), card sends through `CardSender`. Callbacks
`k1:ln:<n>`, `k1:tp:<radar36>:in|dg`.

## Business rules

- Kept: BR-BOT-048, BR-BOT-049, BR-BOT-050, BR-API-079, BR-DATA-012.
- Defect fix: LB-BOT-003 (one date for window and label).
- No DEV; the 30-row cap and the digest answer are specifications for Q-BOT-038 and Q-BOT-010.

## Acceptance criteria

- The list for the fixture equals TXT-BOT-035 with 11 rows and buttons `1`…`5` / `6`…`10` / `11`.
- No listed listing is later pushed by the same user's radars (delivered set checked by a matching test).
- Every row's date is within the last 72 hours of first-seen time; rows are newest first.
- The tip appears after the first radar only; `⚡ Сразу` and `📬 Подборкой` set the mode and end with the right
  paragraph and no keyboard.

## Tests

| # | Conversation | Expected |
| - | ------------ | -------- |
| 1 | first radar saved, 11 matches | sticker, then TXT-BOT-035 with 11 rows and a 5/5/1 grid, then TXT-BOT-036 with `⚡ Сразу` · `📬 Подборкой` |
| 2 | → `press('3')` | card of row 3 as a new message (origin `number`); list unchanged |
| 3 | delete the radar, then `press('5')` on the old list | card still sent (BR-BOT-048) |
| 4 | tip → `press('⚡ Сразу')` | keyboard removed; last paragraph TXT-BOT-037; mode instant |
| 5 | tip → `press('📬 Подборкой')` | mode digest; last paragraph `📬 Хорошо — пришлю подборкой в 09:00, 19:00. …` (spec) |
| 6 | second radar saved | sticker and list, no tip |
| 7 | listing first seen 4 days ago but re-posted yesterday | not listed (first-seen rule, LB-BOT-003) |
| 8 | 45 matches | 30 rows + `bot.starter.more` row with the Mini App button; header shows 45 |
| 9 | radar edited (KV-TG-044) after a push of listing L | starter after edit excludes L |

## Edge cases

- Zero matches: no list message; the confirmation already says `bot.radar.saved_none`.
- A listed listing is withdrawn before the user presses its number: the card opens in the withdrawn variant.
- The user blocked the bot right after saving: sends fail with `403`; the delivered set is written only for messages
  actually sent.

## Security

- SEC-REQ-014: the starter query runs for the actor's own radar; tip callbacks resolve the radar through the actor's
  relation (foreign number → catch-all).
- SEC-REQ-020: row texts escaped; SEC-REQ-029: the 2–3 messages are well under the per-chat limit.

## Definition of done

Tests green (`make ci-backend`), KV-QA-009 transcripts for the save sequence pass, F-BOT-008 and F-DELIVERY-005
parity-gate rows updated, `09` rows updated, PR reviewed by the other developer.
