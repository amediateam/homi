# KV-TG-026 — Card submenu «Скрыть похожие»

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend — Telegram bot (track: development) |
| Complexity | M |
| Feature IDs | F-HIDE-004 |
| Dependencies | KV-TG-022 (card renderer, delivered-card log with `radar_id`); radar hide rules in the Radar module (ENT-009, `radar_hide_rules` of KV-DB-009 in `14` §8); blocked authors and «Скрытое» — F-HIDE-002, F-HIDE-003 (API-014, API-026 domain); DEV-034 (`PROPOSED`); Q-BOT-028, Q-BOT-009 |

## Goal

`Скрыть похожие` turns the card keyboard into a submenu with the listing's channel, district and (when the author is
known) the realtor; a choice stores a hide rule and restores the card. The target of the rule is never ambiguous:
legacy per-radar scope with an explicit radar choice when several radars could own it, or user-wide rules once DEV-034
is approved.

## Legacy reference

- BOT-061; BTN-044 `Скрыть похожие` → toast TXT-BOT-051 `Что скрыть?`, keyboard → `📢 Канал @<канал>` (BTN-045) /
  `📍 Район <район>` (BTN-046) / `✖️ Отмена` (BTN-048); a realtor row is promised by the tip text but never shown
  (BTN-047, `tb:557`, `tb:666`; Q-BOT-009).
- Choice → toast TXT-BOT-052 `Скрыл. Убрать правило — /subs → радар → «Показать скрытое»`, card keyboard restored,
  rule shown as `🙈 скрыто: …` on the radar card (`tb:667`, `tb:711–712`).
- Rule: BR-BOT-063 (rule stored in the radar, removed only all together).
- Problems: LB-BOT-025 (per-radar scope vs the Mini App's global hidden list; undefined target for cards from `/fav`,
  starter lists of deleted radars or with several radars), LB-DATA-006; Q-BOT-028.

## Implementation

1. Read `04` §3.10, §10 row "Hiding", the DEV-034 row of `09` §4.2. Tests first
   (`php artisan make:test --pest Bot/Card/HideSimilarTest`).
2. `php artisan make:class Telegram/Handlers/Card/HideSimilar`:
   - `k1:cd:<n>:hs` → toast TXT-BOT-051 → `editMessageReplyMarkup` with the submenu: `📢 Канал @<канал>`
     (`k1:cd:<n>:hc:<channel36>`), `📍 Район <район>` (`k1:cd:<n>:hd:<district36>`, only when the district is known),
     `👤 Этого риелтора` (`k1:cd:<n>:ha`, new label `bot.card.hide.realtor`, only when the listing's author is a phone
     author — closes Q-BOT-009 by specification), `✖️ Отмена` (`k1:cd:<n>:hx`);
   - `hx` → card keyboard restored, no toast (BTN-048).
3. Target resolution (`App\Telegram\Handlers\Card\HideRuleTarget`), config `bot.hide_rules.scope`:
   - `radar` (legacy, default until DEV-034 is decided): the radar that delivered this copy (`bot_listing_messages.
     radar_id`); otherwise the user's only radar; otherwise, with several radars, a radar choice keyboard
     (`bot.card.hide.which_radar`, one button per radar title, new text of the DEV-034 alternative); with no radar, a
     toast `bot.card.hide.no_radar` (new text) and nothing stored;
   - `user` (DEV-034 approved): channel → blocked source, realtor → blocked author (API-014 domain), district → a
     user-wide district rule visible in «Скрытое» (F-HIDE-003); no radar involved.
4. Store through the Radar module's hide-rule methods (scope `radar`) or the personal-list service (scope `user`);
   idempotent per (target, kind, value).
5. Toast TXT-BOT-052 and the card keyboard restored on the pressed copy (BR-BOT-002); with scope `user` the toast is
   `bot.card.hide.saved_user` (new text, DEV-034) pointing to «Скрытое» instead of `/subs`.
6. The hidden card itself stays in the chat; future matching excludes the rule (F-DELIVERY-001, backend).

## Files

- `backend/app/Telegram/Handlers/Card/{HideSimilar,HideRuleTarget}.php` (new)
- `backend/app/Telegram/Keyboards/{HideSubmenuKeyboard,RadarChoiceKeyboard}.php` (new)
- `backend/config/bot.php` (`hide_rules.scope`), `backend/lang/{ru,uz,en}/bot.php` (`card.hide.*`)
- `backend/tests/Feature/Bot/Card/HideSimilarTest.php` (new)

## API contract

Bot API: `answerCallbackQuery`, `editMessageReplyMarkup`. Callbacks `k1:cd:<n>:hs`, `k1:cd:<n>:hc:<c>`,
`k1:cd:<n>:hd:<d>`, `k1:cd:<n>:ha`, `k1:cd:<n>:hx`. The radar choice keyboard repeats the chosen rule with the radar
as one more argument (`k1:cd:<n>:hc:<c>:<radar36>`), within the codec's four-argument limit and ≤ 64 bytes (unit test
with the longest numbers).

## Business rules

- Kept (scope `radar`): BR-BOT-063 storage per radar and the TXT-BOT-051 / TXT-BOT-052 toasts.
- `PROPOSED`: DEV-034 (user-wide rules shared with the Mini App; or ask which radar when ambiguous) — developer and
  product owner; tests of scope `user` are `todo` until approval. DEV-033 (remove one rule) is in KV-TG-043.
- Q-BOT-009 is closed by specification here (realtor row only for phone authors); record it in the PR.

## Acceptance criteria

- A card delivered by radar R stores the rule in R; the radar card of R shows `🙈 скрыто: @<канал>`.
- A card opened from `/fav` with two radars asks which radar; with one radar uses it; with none stores nothing and says
  so.
- `✖️ Отмена` restores the exact previous keyboard with no toast.
- Every submenu `callback_data` is ≤ 64 bytes.

## Tests

| # | Conversation | Expected |
| - | ------------ | -------- |
| 1 | radar push card → `press('Скрыть похожие')` | toast TXT-BOT-051; submenu with channel, district, `✖️ Отмена` |
| 2 | → `press('📢 Канал @<канал>')` | rule (radar R, channel) stored; toast TXT-BOT-052; card keyboard restored |
| 3 | → submenu → `press('✖️ Отмена')` | keyboard restored; `answerCallbackQuery` without text |
| 4 | `/fav` card, user with radars R1 and R2 → channel | radar choice keyboard; choose R2 → rule on R2 only |
| 5 | `/fav` card, no radars → district | toast `bot.card.hide.no_radar`; no rule |
| 6 | phone author → submenu | `👤 Этого риелтора` present; choosing it stores an author rule |
| 7 | same rule twice | one rule row |
| 8 | scope `user` (DEV-034, `todo`) → channel | blocked source for the user; appears in «Скрытое» of the Mini App |
| 9 | forged `k1:cd:<n>:hc:<channel of another listing>` | catch-all alert, nothing stored |

## Edge cases

- Starter list of a deleted radar: the delivering radar no longer exists → treated as "no delivering radar".
- Listing without a district: no district row.
- The radar was deleted between the submenu and the choice: stale alert, nothing stored.

## Security

- SEC-REQ-011 / SEC-REQ-014: the channel / district value is accepted only if it equals the listing's own value;
  radars are resolved through the actor's relation.
- SEC-REQ-015: idempotent rule writes.
- No personal data: author rules store an author id, never a phone.

## Definition of done

Tests green (`make ci-backend`), KV-QA-009 transcripts for the submenu pass, F-HIDE-004 parity-gate row updated (G5
waits for DEV-034), `09` row updated, PR reviewed by the other developer.
