# KV-TG-044 — Edit an existing radar

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend — Telegram bot (track: development) |
| Complexity | M |
| Feature IDs | F-BOT-010, F-RADAR-003 |
| Dependencies | KV-TG-041 (radar card), KV-TG-035 (in-place step edit), KV-TG-037 (starter list of unseen listings); radar update — API-020 domain (F-RADAR-003; filters replaced, `active` untouched); DEV-030, DEV-031, DEV-009 (`PROPOSED`); Q-BOT-026, Q-BOT-030 |

## Goal

`✏️ Изменить` on a radar card opens «Радар — что изменить?» with the summary and the `✏️` buttons of the branch; steps
open with the header `Изменение радара · шаг N из M`; saving replaces the radar's filters through the shared service,
keeps every filter the bot cannot show, and sends only listings not delivered before. After approval, Cancel returns to
the unchanged radar card (DEV-030) and the result is titled «Радар изменён» with the radar's real status (DEV-031).

## Legacy reference

- BOT-066 (edit screen), BOT-067 (save), BTN-055 `✏️ Изменить`, BTN-056 `✅ Сохранить` (primary), BTN-025 Cancel;
  TXT-BOT-033 `Радар — что изменить?`, TXT-BOT-011 `Изменение радара · шаг N из M`, after save TXT-BOT-075 and
  TXT-BOT-034 `✅ Радар включён`; starter list with only listings not sent before (`tb:568–569`, `tb:721`).
- Rules: BR-BOT-069 (edit header; save behaves like a new radar), BR-BOT-049 (only unseen listings after an edit),
  BR-API-080.
- Problems: LB-BOT-020 (Cancel shows the new-radar text) → DEV-030; LB-BOT-021 (save always says «Радар включён»)
  → DEV-031; open questions Q-BOT-026 (filters the bot cannot show), Q-BOT-030 (does saving resume a paused radar).

## Implementation

1. Read `04` §3.7, §3.11, KV-TG-035. Tests first (`php artisan make:test --pest Bot/RadarEditTest`).
2. `php artisan make:class Telegram/Handlers/Subs/RadarEdit`: `k1:sb:<r>:ed` → conversation state `{kind:
   wizard_edit, sid, message_id, edit_radar: <number>, data: radar filters (all keys, incl. `price_min`, `polygon`,
   `furnished`, `renovation`, floors, area, `market`, `appliances`), mode: edit_radar, return_to: edit_screen}` → edit the
   card into TXT-BOT-033 + summary (`RadarSummaryRenderer`, extra-filters line) + `✏️` buttons of the branch +
   `✅ Сохранить` (`k1:wz:<sid>:sv`) + `✖️ Отмена` (`k1:wz:<sid>:cx`).
3. Steps open through KV-TG-035 with header TXT-BOT-011 and return to the edit screen.
4. Save: radar service `update(radar, filters)` — the draft keeps every key the bot did not touch (Q-BOT-026 answered by
   specification: preserved); `active` and `mode` untouched (the service's `PUT` never changes `active`);
   DEV-009 twin check as in KV-TG-036. Then toast TXT-BOT-075 and:
   - legacy (flag `bot.dev031` off): edit into TXT-BOT-034 `✅ Радар включён` + summary (as legacy);
   - DEV-031 (`PROPOSED`): edit into `bot.radar.updated` («Радар изменён») + the real status line of KV-TG-041 +
     summary; a paused radar stays paused (answers Q-BOT-030 the safe way);
   then the starter list of only unseen listings (KV-TG-037 listener with `edited = true`; no sticker, no tip).
5. Cancel: legacy (`bot.dev030` off) → TXT-BOT-026, keyboard removed (as legacy); DEV-030 (`PROPOSED`) → the unchanged
   radar card of KV-TG-041 in the same message. State deleted either way.
6. The radar was deleted or changed elsewhere while editing: save → stale alert TXT-BOT-039 and the message re-rendered
   as the list (`k1:sb:0:ls` view); no resurrection.

## Files

- `backend/app/Telegram/Handlers/Subs/RadarEdit.php` (new)
- `backend/app/Telegram/Conversations/RadarWizard/{Wizard,SaveRadar}.php` (edit-radar mode)
- `backend/config/bot.php` (`dev030`, `dev031`), `backend/lang/{ru,uz,en}/bot.php` (`radar.edit*`, `radar.updated`)
- `backend/tests/Feature/Bot/RadarEditTest.php` (new)

## API contract

Bot API: `editMessageText` + `reply_markup`, `answerCallbackQuery`, `sendMessage` (starter list). Callbacks
`k1:sb:<r>:ed`, `k1:wz:<sid>:ed:<step>`, `k1:wz:<sid>:sv`, `k1:wz:<sid>:cx`.

## Business rules

- Kept: BR-BOT-049, BR-BOT-069, BR-API-080.
- `PROPOSED`: DEV-030 (Cancel → radar card), DEV-031 (keep state, «Радар изменён»), DEV-009 (twins) — tests `todo` until
  approved; legacy texts until then.
- Q-BOT-026 answered by specification (unseen filters preserved); record in the PR.

## Acceptance criteria

- The edit screen equals TXT-BOT-033 + summary + the branch's `✏️` buttons + save / cancel.
- A Mini App radar with `polygon`, `renovation`, `price_min` edited in the bot (budget only) keeps those keys
  byte-equal after save.
- After changing `2 комн.` → `2–3 комн.` the starter list contains only listings never delivered to the user
  (BR-BOT-049, the `tb:568–569` example).
- A paused radar stays paused after save in DEV-031 mode.

## Tests

| # | Conversation | Expected |
| - | ------------ | -------- |
| 1 | card → `press('✏️ Изменить')` | same message → `Радар — что изменить?` + summary + `✏️` rows + `✅ Сохранить` · `✖️ Отмена` |
| 2 | → `press('✏️ Комнаты')` | step with header `Изменение радара · шаг 3 из 8`, `✅ 2` ticked |
| 3 | → `2–3` → `press('✅ Сохранить')` | toast `Сохранил ✅`; `✅ Радар включён` + summary (legacy); starter list with only the new 3-room listings |
| 4 | DEV-031 (`todo`), paused radar → edit → save | `bot.radar.updated`, status `⏸ На паузе …`; radar still paused |
| 5 | edit → `press('✖️ Отмена')` (legacy) | TXT-BOT-026, keyboard removed; radar unchanged |
| 6 | DEV-030 (`todo`): edit → Cancel | the unchanged radar card in the same message |
| 7 | Mini App radar with `polygon` → edit budget → save | `polygon`, `renovation`, `price_min` preserved |
| 8 | radar deleted in the Mini App during the edit → save | alert TXT-BOT-039; message → list |
| 9 | DEV-009 (`todo`): edit into a twin of another radar | toast `bot.radar.twin_exists`; no change |

## Edge cases

- Editing the deal of a radar with Mini App-only filters that are invalid for the new deal: the normaliser drops them and
  the service reports it; the edit screen shows the new summary before save.
- Two edit sessions for the same radar (two old cards): the newer `sid` wins; the older save gets the stale alert.

## Security

- SEC-REQ-014: radar resolved by number through the actor's relation, at start and again at save.
- SEC-REQ-015 / SEC-REQ-017: update idempotent per filter hash; normaliser applied.

## Definition of done

Tests green (`make ci-backend`), KV-QA-009 edit transcripts pass, F-BOT-010 and F-RADAR-003 (bot part) parity-gate rows
updated (G5 waits for DEV-030 / DEV-031 / DEV-009), `09` rows updated, PR reviewed by the other developer.
