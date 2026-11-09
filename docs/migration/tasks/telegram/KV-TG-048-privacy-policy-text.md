# KV-TG-048 — `/privacy` policy text

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend — Telegram bot (track: development) |
| Complexity | S |
| Feature IDs | F-PRIVACY-001 |
| Dependencies | KV-TG-008, KV-TG-009 (catalogue); the retention and deletion ADR (DEC-12, CF-019) for the promise check; DEV-041 (`PROPOSED`, localised privacy URLs on the landing); product owner for any wording change (BR-API-132) |

## Goal

`/privacy` answers with the full privacy text in the user's language and the `🗑 Удалить мои данные` button, and every
promise the text makes is traced to the HOMI mechanism and test that keeps it. HOMI ports the legacy text as it is; any
change to a promise needs the product owner and the retention ADR first.

## Legacy reference

- Command: BOT-020; profile link to the policy BOT-006 (BotFather setting, handled by KV-TG-056); state machine
  `04` §3.16.
- Text: TXT-BOT-083 (`$KVADRO_ROOT/docs/telegram-bot.md:850-865`); button BTN-076 (flow in KV-TG-049).
- Landing page with the same promises: `$KVADRO_ROOT/demo/landing/site/privacy.html` (F-PRIVACY-001, URL-010, DEV-041).
- Promises: BR-BOT-085 … BR-BOT-094; public-promise rule BR-API-132; finding SEC-018 (promises untested).

## Implementation

1. Read `04` §3.16, `16` §4.9 and the retention ADR draft (DEC-12). Tests first
   (`php artisan make:test --pest Bot/PrivacyCommandTest`).
2. `php artisan make:class Telegram/Handlers/PrivacyCommand`: `sendMessage` with TXT-BOT-083 in the user's locale
   (`bot.privacy.text`, HTML, escaped placeholders) and one inline button `🗑 Удалить мои данные` (`k1:pv:dl`, handled by
   KV-TG-049). The support bot handle comes from `TELEGRAM_SUPPORT_BOT_USERNAME`; the site link from the landing base
   URL (`kvadro.app` until S6).
3. Length: if the escaped text exceeds 4 096 characters in any locale, split at a paragraph boundary into two messages;
   the button goes on the last one (the `Html` truncation helper of KV-TG-007 is not used — no promise may be cut).
4. Promise trace: write `backend/tests/Feature/Bot/PrivacyPromisesTest.php` with one `it()` per promise that asserts
   the mechanism exists (config value, scheduled task, or the test that proves it); a promise whose mechanism is not
   built yet is `->todo()` naming the blocking task or decision:

   | # | Promise | Mechanism in HOMI |
   | - | ------- | ----------------- |
   | 1 | stored data list, no names or contacts (BR-BOT-085) | identity schema without name columns (SEC-REQ-036) |
   | 2 | action log 180 days, no texts (BR-BOT-086) | KV-TG-061 + partition purge (KV-DB-028, `14` §8) |
   | 3 | three profile flags + account age (BR-BOT-087) | Telegram user resolution of F-ACCESS-003 |
   | 4 | phones and @handles masked before Gemini (BR-BOT-088) | LLM gateway masking (SEC-REQ-042), KV-TG-038 |
   | 5 | geolocation never sent (BR-BOT-089) | no location handler stores coordinates (KV-TG-020) |
   | 6 | PostHog under a random id, erase on deletion (BR-BOT-090) | F-ANALYTICS-002 distinct id; KV-TG-049 |
   | 7 | support data 90 days / 1 year (BR-BOT-091) | out of scope until DEC-21 — text kept only if the support bot stays with the legacy operator |
   | 8 | takedown → cards edited «Объявление снято» (BR-BOT-092) | KV-TG-054 |
   | 9 | withdrawn listings 90 days then erased (BR-BOT-093) | KV-DB-028 purge |
   | 10 | delete at once, backups ~2 weeks (BR-BOT-094) | KV-TG-049 + KV-INF-026 (14-day backup expiry) |

5. If DEC-12 changes any promise, the new text is written by the product owner in three languages and replaces
   `bot.privacy.text`; the test table changes in the same PR.
6. DEV-041 (localised `privacy.html` URLs) concerns the landing; the bot links the URL of the user's language once
   DEV-041 is approved, the Russian URL otherwise.

## Files

- `backend/app/Telegram/Handlers/PrivacyCommand.php` (new)
- `backend/lang/{ru,uz,en}/bot.php` (`privacy.text`, `privacy.delete_button`)
- `backend/tests/Feature/Bot/PrivacyCommandTest.php`, `backend/tests/Feature/Bot/PrivacyPromisesTest.php` (new)

## API contract

Bot API `sendMessage` (HTML, inline keyboard). No HTTP endpoint.

## Business rules

- Kept as public promises: BR-BOT-085 … BR-BOT-094, BR-API-132.
- Deviation: DEV-041 (`PROPOSED`) only for the linked URL.
- No wording change without the product owner (Migration policy: user-visible flow).

## Acceptance criteria

- `/privacy` in `ru` reproduces TXT-BOT-083 verbatim (escaped), in `uz` and `en` the approved translations.
- Every promise row has a passing test or an explicit `todo` naming the blocking decision (DEC-12, DEC-21).
- The button `🗑 Удалить мои данные` is present on the last message.

## Tests

| # | Case | Expected |
| - | ---- | -------- |
| 1 | `send('/privacy')` locale `ru` | one message equal to the TXT-BOT-083 fixture; button `k1:pv:dl` |
| 2 | locale `en` | English text; button label `bot.privacy.delete_button` in English |
| 3 | text length > 4 096 in a locale (fixture-forced) | two messages, split at a paragraph, button on the second |
| 4 | text contains `<` in a placeholder value | escaped, `FakeBotApi` HTML validation passes |
| 5 | `PrivacyPromisesTest` | 10 rows: green or `todo(DEC-…)` |

## Edge cases

- `/privacy` from a blocked user (access gate): legacy behaviour unknown; privacy information is always answered
  (proposal: privacy and deletion bypass the access gate, recorded for the security review).
- A group chat: ignored (KV-TG-020).

## Security

- The text is a legal promise (ЗРУ-547 work in `16` §4.15, SEC-REQ-050); SEC-018 is closed only when the promise tests
  pass.
- SEC-REQ-020: the HTML is static, placeholders escaped.

## Definition of done

Tests green (`make ci-backend`), parity-gate cells of F-PRIVACY-001 updated, the promise table reviewed by the
`security-reviewer` agent and the product owner, `09` row F-PRIVACY-001 updated, PR reviewed by the other developer.
