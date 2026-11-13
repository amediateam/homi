# KV-TG-008 — Russian bot text catalogue and the TXT-BOT key map

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend — Telegram bot (track: development) |
| Complexity | M |
| Feature IDs | F-LOCALE-004, F-BOT-015 |
| Dependencies | KV-TG-007 (`BotText`); KV-QA-007 (i18n completeness tests); KV-QA-009 (`texts.ru.json` fixture compares against this catalogue); Q-BOT-014 |

## Goal

`backend/lang/ru/bot.php` holds every legacy bot text, toast, alert and button label in Russian, verbatim, with named
placeholders, and `backend/tests/Fixtures/Bot/txt-keys.json` maps each TXT-BOT id and each BTN label to its key. Handler
tasks only reference keys; new texts introduced by a DEV are added by the task that implements that DEV.

## Legacy reference

- Text inventory: `04` §4.2 (TXT-BOT-001 … TXT-BOT-088), button labels `04` §4.1 (BTN-001 … BTN-076); long texts live
  in `$KVADRO_ROOT/docs/telegram-bot.md` at the lines `04` §4.2 cites (welcome `tb:195–212`, Tashkent hint `tb:338`,
  other hints `tb:345–347`, review `tb:458–481`, first-radar tip `tb:554–562`, card `tb:619–644`, radar card
  `tb:698–712`, settings `tb:773–786`, `/owner` intro `tb:818–825`, `/privacy` `tb:850–865`).
- Formatting conventions: `✅ ` prefix for the chosen option (BR-BOT-003), bold parts of the welcome (`tb:212`),
  number format BR-BOT-008.
- Texts never observed (no reference wording): TXT-BOT-038, TXT-BOT-047, TXT-BOT-071, TXT-BOT-081, TXT-BOT-084,
  TXT-BOT-086, TXT-BOT-087, TXT-BOT-088 (Q-BOT-010, Q-BOT-031, Q-BOT-006, Q-BOT-008, Q-BOT-001, Q-BOT-002, Q-BOT-003,
  Q-BOT-004).
- Profile texts set in BotFather, not sent in chat: TXT-BOT-001 … TXT-BOT-005 (used by KV-TG-056).

## Implementation

1. Read `04` §4.1–§4.2 and §7, ADR-0006, `.claude/skills/laravel-best-practices/` (localisation). Tests first
   (`php artisan make:test --pest --unit Telegram/RuCatalogueTest`).
2. `backend/lang/ru/bot.php`, nested by area: `profile`, `commands`, `common`, `welcome`, `app`, `help`, `ping`,
   `wizard.frame`, `wizard.deal`, `wizard.object`, `wizard.rooms`, `wizard.area`, `wizard.budget`, `wizard.amount`,
   `wizard.owner`, `wizard.tenant`, `wizard.pets`, `wizard.review`, `wizard.flow`, `wizard.cancel`, `radar.saved`,
   `radar.starter`, `radar.tip`, `free_text`, `card`, `toasts`, `subs`, `poll`, `fav`, `settings`, `owner`,
   `privacy`, `delivery`, `news`, `stale`, `buttons.*`.
3. Copy every text verbatim from `04` §4.2 or from the `tb` lines it cites (the legacy tree is read-only; copy text,
   never files). Live values become Laravel placeholders (`:active`, `:new`, `:city`, `:n`, `:m`, `:price`, …);
   counts that change the word form use `trans_choice` with the three Russian forms. Emoji stay part of the text.
4. Bold, italic and quote markup is **not** in the catalogue; renderers apply it with `Html::*` (KV-TG-007) so that
   escaping stays in one place. The catalogue therefore stores the plain sentences in the order the renderer joins them.
5. Unobserved texts get a key with a draft and a `// spec — Q-BOT-0NN` comment; the owning task finalises the wording
   with the product owner (they are spec-tested, `15` §2.6).
6. DEV wording (DEV-015, DEV-026, DEV-027, DEV-029, DEV-032, DEV-033, DEV-035, DEV-036 …) is **not** added here; each
   DEV task adds its keys, so the catalogue never runs ahead of an approval.
7. `backend/tests/Fixtures/Bot/txt-keys.json`: `{"TXT-BOT-006": "bot.welcome.body", …, "BTN-002": "bot.buttons.radar_on",
   …}`; BotFather-only texts map to `profile.*`; TXT-BOT-002 (banner image) maps to `asset:description_picture`.
8. `RuCatalogueTest`: every TXT-BOT id 001 … 088 and every BTN id 001 … 076 is in the map; every mapped key exists in
   `ru`; placeholders in the catalogue match the fixture of KV-QA-009 (`texts.ru.json`).

## Files

- `backend/lang/ru/bot.php` (new)
- `backend/tests/Fixtures/Bot/txt-keys.json` (new)
- `backend/tests/Unit/Telegram/RuCatalogueTest.php` (new)

## API contract

n/a — translation catalogue. Key naming: `bot.<area>.<name>`, snake case, no TXT ids inside keys.

## Business rules

- Kept verbatim: all TXT-BOT texts with status `DOCUMENTED_ONLY` in `04` §4.2; BR-BOT-003 (`✅ ` prefix produced by the
  keyboard builder, not stored in labels); BR-BOT-008 (numbers formatted by the formatter, not in the catalogue).
- Copy fixes `APPROVED` by policy and applied in `ru` here: none (LB-BOT-009 is DEV-015; the uz/en copy fixes are
  KV-TG-009).

## Acceptance criteria

- 88 TXT-BOT ids and 76 BTN ids are mapped; the test fails on any missing or extra id.
- Rendering each mapped key with the sample parameters of `texts.ru.json` reproduces the verbatim text of `04` §4.2
  (whitespace normalised, markup excluded).
- No key holds HTML tags.
- KV-QA-007's completeness test runs against the file (other locales may still be empty until KV-TG-009).

## Tests

| # | Case | Expected |
| - | ---- | -------- |
| 1 | map completeness | 88 TXT-BOT + 76 BTN entries, each key present in `ru` |
| 2 | `bot.welcome.body` with `active=18657`, `new=1050` | equals TXT-BOT-006 from `tb:195–210` after formatting |
| 3 | `bot.stale.alert` | `Форма устарела — начните заново: /new` (TXT-BOT-039) |
| 4 | `bot.toasts.saved` | `Сохранил ✅` (TXT-BOT-075) |
| 5 | `bot.wizard.flow.per_day` with 3 / `per_week` with 2 / `none` | the three variants of TXT-BOT-028 |
| 6 | `trans_choice` for 1, 2, 5, 21 listings | correct Russian forms |
| 7 | grep the file for `<` | no tags |
| 8 | keys flagged `spec` | exactly the eight unobserved TXT ids |

## Edge cases

- Texts that differ only by context (`✖️ Отмена` in the wizard, the delete confirmation and the hide submenu): one key
  per context, because other languages may need different words.
- `Весь <город>` (BTN-016) stays as the legacy pattern in `ru` until DEV-015 is approved.
- Legacy typos are kept verbatim in `ru` (none recorded besides LB-BOT-009); wording changes need a DEV.

## Security

- No personal data in the catalogue; placeholders are escaped by `BotText` (SEC-REQ-020).
- `/privacy` text (TXT-BOT-083) is a legal promise: copied verbatim here; changes only through KV-TG-048 with the
  product owner.

## Definition of done

Tests green (`make ci-backend`), KV-QA-007 and KV-QA-009 fixtures aligned, F-LOCALE-004 parity-gate row updated (G2
evidence: the key map), PR reviewed by the other developer.
