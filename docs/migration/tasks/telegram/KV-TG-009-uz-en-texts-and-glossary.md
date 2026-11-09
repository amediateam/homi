# KV-TG-009 — Uzbek and English bot texts and the glossary fixes

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend — Telegram bot (track: development); proofreading by a person named by the product owner |
| Complexity | M |
| Feature IDs | F-LOCALE-004 |
| Dependencies | KV-TG-008; KV-QA-007; city names in three languages from the geo dictionaries (KV-DB-006, `14` §8); Q-BOT-014 |

## Goal

`backend/lang/uz/bot.php` (Uzbek, Latin script) and `backend/lang/en/bot.php` contain every key of the Russian catalogue.
Texts captured from the legacy bot are copied verbatim with the recorded copy fixes; the rest are drafted, marked as
drafts, and proofread by a person before the F-LOCALE-004 gate closes.

## Legacy reference

- Captured EN: welcome TXT-BOT-007 (`tb:1070–1085`), its buttons BTN-001/BTN-002/BTN-003 (`tb:1087`), settings panel
  TXT-BOT-074 (`tb:1092–1105`) and buttons BTN-067 … BTN-072 (`tb:1107–1109`), command descriptions TXT-BOT-005
  (`tb:96–105`), toast TXT-BOT-075 `Saved ✅` (`tb:231–232`).
- Captured UZ: settings panel TXT-BOT-074 (`tb:1114–1127`), buttons BTN-067 … BTN-072 (`tb:1129–1132`), toast TXT-BOT-075
  `Saqlab qoʻydim ✅`; the trilingual description TXT-BOT-001 (`tb:57–68`).
- Not captured: all other uz/en texts and the uz command descriptions (`04` §7, Q-BOT-014).
- Copy fixes (`09` §4.3, `APPROVED` by policy): LB-BOT-010 (`oʻch..` → `oʻch.`), LB-BOT-011 (one term for quiet hours),
  LB-BOT-012 (`Sumi` → `soʻm`), LB-BOT-013 (EN welcome uses Uzbek city names next to «Tashkent Region»).

## Implementation

1. Read `04` §7, ADR-0006, `.ai/agents/telegram-bot-engineer.md` rule 10 (Uzbek apostrophes). Tests first
   (`php artisan make:test --pest --unit Telegram/UzEnCatalogueTest`).
2. Copy the captured texts verbatim into `uz` / `en`, then apply the copy fixes:
   - `oʻch.` with one dot (LB-BOT-010);
   - one term for quiet hours in buttons and text — proposal `Sokin soatlar` (the proofreader confirms, LB-BOT-011);
   - `soʻm` in UZ, `Soʻm` kept in EN (LB-BOT-012);
   - EN city names are English exonyms from the city dictionary (Tashkent, Tashkent Region, Andijan, Namangan, Kokand,
     Fergana) — the welcome takes them from KV-DB-006 data through a `:cities` placeholder, not from the catalogue
     (LB-BOT-013).
3. Draft every other key in both languages; mark each with `// draft` until proofread. Record the state in
   `backend/tests/Fixtures/Bot/translation-status.json` (`key → captured | draft | proofread`).
4. Uzbek rules: Latin script only, `ʻ` (U+02BB) in `oʻ` / `gʻ`, `ʼ` (U+02BC) for the glottal stop, never ASCII `'` or
   `‘`; `soʻm`. Exceptions to "no Cyrillic in uz": the language button `🇷🇺 Русский` only.
5. English rules: one convention for places (exonyms), sentence case on buttons as captured (`📱 Open kvadro²`,
   `📡 Turn on radar`), thousands separator from the formatter (`18,662`).
6. Placeholders and plural forms mirror `ru` (`trans_choice`: uz has one form, en two).
7. Hand the draft list to the proofreader (the PR description lists the keys); the gate cell G10 of F-LOCALE-004 stays
   `open` while any key is `draft`.

## Files

- `backend/lang/uz/bot.php`, `backend/lang/en/bot.php` (new)
- `backend/tests/Fixtures/Bot/translation-status.json` (new)
- `backend/tests/Unit/Telegram/UzEnCatalogueTest.php` (new)

## API contract

n/a — translation catalogues with the same keys as `ru`.

## Business rules

- Kept: BR-BOT-015 (three languages), BR-BOT-008 (EN number format), BR-BOT-013 and BR-BOT-014 (switching behaviour is
  KV-TG-017; texts must exist for it).
- Copy fixes without a DEV: LB-BOT-010, LB-BOT-011, LB-BOT-012, LB-BOT-013.
- Cyrillic Uzbek stays unsupported (`04` §7) — not a deviation.

## Acceptance criteria

- `uz` and `en` have exactly the keys of `ru`, with the same placeholders.
- Captured texts equal `tb` §13 verbatim except the four listed copy fixes.
- The apostrophe and script checks pass for every `uz` value.
- `translation-status.json` lists every key; no `draft` remains when the PR that closes F-LOCALE-004 is merged.

## Tests

| # | Case | Expected |
| - | ---- | -------- |
| 1 | key parity ru/uz/en | identical key sets and placeholder names |
| 2 | `bot.settings.panel` in `uz` with quiet `off` | contains `oʻch.` with one dot (LB-BOT-010) |
| 3 | `bot.buttons.currency_uzs` in `uz` / `en` | `Soʻm` per the glossary, never `Sumi` |
| 4 | `uz` values scanned | no ASCII `'`, no `‘`, no Cyrillic except the `🇷🇺 Русский` label |
| 5 | `bot.welcome.body` in `en` rendered with dictionary cities | `Tashkent, Tashkent Region, Andijan, Namangan, Kokand, Fergana` |
| 6 | `bot.toasts.saved` | `Saqlab qoʻydim ✅` / `Saved ✅` |
| 7 | `conversation(user: 'A', locale: 'en')->send('/settings')` | panel text equals TXT-BOT-074 EN (`tb:1092–1105`) |

## Edge cases

- A proofreader rewrites a captured text: allowed only as a copy fix (meaning unchanged) and recorded in the PR;
  otherwise it needs a DEV.
- Keys added later by DEV tasks must ship with all three languages (completeness test fails otherwise).
- Uzbek plural with numbers (`3 ta e'lon`) needs no plural form, but the apostrophe rule applies (`eʼlon`).

## Security

- No personal data. The `/privacy` translation (TXT-BOT-083) is a legal text: the product owner signs it off
  (KV-TG-048).

## Definition of done

Tests green (`make ci-backend`), proofreading recorded (who, date) in the PR, F-LOCALE-004 parity-gate row updated,
PR reviewed by the other developer.
