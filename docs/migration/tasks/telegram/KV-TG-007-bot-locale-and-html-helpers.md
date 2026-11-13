# KV-TG-007 — Bot locale resolution, translator wrapper, HTML escaping and number formatting

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend — Telegram bot (track: development) |
| Complexity | M |
| Feature IDs | F-LOCALE-004, F-BOT-015 |
| Dependencies | KV-TG-006; server display formatter of F-LOCALE-003 (CF-017, `backend/lang` catalogues); ADR-0006 (locales, `Asia/Tashkent`); CF-006 (`uz` inside, `uz_Latn` at the legacy boundary); Q-BOT-035 |

## Goal

Every bot reply is produced in the user's language through one translator wrapper, every interpolated value is
HTML-escaped by one helper, long texts are truncated without breaking Telegram HTML, and numbers, money and dates use the
shared server formatter in `Asia/Tashkent` — so the handler tasks never format or escape by hand.

## Legacy reference

- Languages and codes: `04` §7 (`ru`, `uz_Latn`, `en`; Cyrillic Uzbek not supported), BR-BOT-015; initial language of a
  new user unknown — BOT-026, Q-BOT-035; Mini App detector `uz*` → uz, `en*` → en, else ru (BR-API-149, DEV-020).
- Number format: RU `18 657`, `$1 000`; EN `18,662` (BR-BOT-008, `tb:185`); all times in `Asia/Tashkent` (BR-API-150,
  `tb:785`); DEV-014 (product dates in Tashkent).
- HTML: bold title and price, italic source, original post in an expandable blockquote (BR-BOT-056, `tb:617`); escaping
  of third-party text unknown in legacy (SEC-024).
- Telegram limits: text 4 096, caption 1 024 characters (`15` §2.6).

## Implementation

1. Read ADR-0006, `10` §3.7 and §3.17, `16` §4.4 (SEC-REQ-020, SEC-REQ-019). Tests first
   (`php artisan make:test --pest --unit Telegram/HtmlTest`, `Telegram/BotLocaleTest`).
2. `php artisan make:class Telegram/Rendering/BotLocale`: `for(User $user): string` → stored settings locale (`ru`,
   `uz`, `en`) or, if none is stored yet, the mapping of CF-006 from the update's `language_code` (`uz*` → `uz`,
   `en*` → `en`, anything else → `ru`). The identity resolver stores that locale on first contact (F-ACCESS-003); the
   bot never writes `uz_Latn`.
3. `php artisan make:class Telegram/Rendering/BotText`: `get(string $key, array $params, string $locale): string` over
   `__('bot.'.$key, …, $locale)`; every param is escaped unless wrapped in `Html::raw()` (reserved for fragments built
   by the renderers themselves); `choice()` for plural forms (`trans_choice`); a missing key throws in `testing` and
   falls back to `ru` with one warning elsewhere.
4. `php artisan make:class Telegram/Rendering/Html`: `escape()` (`&`, `<`, `>`, and `"` inside attributes),
   `bold()`, `italic()`, `link(url, text)` — only `https` URLs on the allow-list of SEC-REQ-019 (`t.me`, the configured
   Mini App and site hosts) else plain text, `expandableQuote()`, `truncate(string $html, int $limit)` — counts
   visible characters in UTF-16 code units as Telegram does, never cuts inside a tag or an entity, closes open tags,
   appends `…`.
5. Numbers, money, distances and dates: call the display formatter of F-LOCALE-003 (`ru` `18 657`, `en` `18,662`,
   currency per the user's setting); this task adds no second formatter. Dates and times always in `Asia/Tashkent`.
6. Uzbek strings keep `ʻ` / `ʼ` (`.ai/agents/telegram-bot-engineer.md` rule 10); `BotText` does no transliteration.

## Files

- `backend/app/Telegram/Rendering/{BotLocale,BotText,Html}.php` (new)
- `backend/lang/{ru,uz,en}/bot.php` (created empty with a header comment if KV-TG-008 has not landed)
- `backend/tests/Unit/Telegram/{HtmlTest,BotLocaleTest,BotTextTest}.php` (new)

## API contract

n/a — internal helpers. Output contract: Telegram HTML parse mode with only the tags Telegram allows (`b`, `i`, `u`,
`s`, `a`, `code`, `pre`, `blockquote`, `blockquote expandable`, `tg-spoiler`).

## Business rules

- Kept: BR-BOT-008, BR-BOT-015 (codes at the legacy boundary only), BR-BOT-056 (formatting primitives), BR-API-150.
- DEV-014 and DEV-020 (`PROPOSED`): one Tashkent time zone and one language detector, shared with the Mini App.
- Q-BOT-035: the initial bot language follows the detector until the legacy behaviour is known; spec-tested.

## Acceptance criteria

- `language_code` `uz`, `uz-UZ`, `en-GB`, `ru`, `de`, missing → `uz`, `uz`, `en`, `ru`, `ru`, `ru`; a stored locale always
  wins.
- The SEC-REQ-020 corpus (`<b>`, `</blockquote>`, `&amp;`, `<a href="tg://…">`, a 5 000-character text) renders
  literally and passes the `FakeBotApi` HTML validator; truncation leaves well-formed HTML ≤ the limit.
- `BotText` with `count = 18657` renders `18 657` in `ru` and `18,657` in `en` through the shared formatter.
- No handler in `app/Telegram` calls `htmlspecialchars` or `number_format` directly (arch test).

## Tests

| # | Case | Expected |
| - | ---- | -------- |
| 1 | `Html::escape('a < b & c')` | `a &lt; b &amp; c` |
| 2 | `Html::link('http://evil.example', 'x')` | plain `x`, no `<a>` |
| 3 | `Html::link('https://t.me/somechannel/123', 'пост')` | `<a href="https://t.me/somechannel/123">пост</a>` |
| 4 | `truncate` of `<b>` + 5 000 characters at 1 024 | ≤ 1 024 visible units, `</b>` closed, ends with `…` |
| 5 | emoji-heavy text at the limit | counted in UTF-16 units; no split surrogate pair |
| 6 | `BotText::get('welcome.counters', ['active' => '<script>'], 'ru')` | `&lt;script&gt;` in the output |
| 7 | user with stored `uz` and `language_code: en` | `uz` |
| 8 | missing key in `testing` | exception naming the key |
| 9 | arch test over `app/Telegram` | no `htmlspecialchars`, `number_format`, `strip_tags` |

## Edge cases

- `language_code` absent (some clients): `ru`.
- A listing text that already contains HTML entities (`&amp;`): escaped again, so it shows literally as the author typed.
- RTL or zero-width characters in third-party text: kept but escaped; truncation counts them.
- A city or district name missing in the user's locale: the dictionary's fallback (`ru`) is used, never a raw code.

## Security

- SEC-REQ-020 (single escaping helper, safe truncation), SEC-REQ-019 (link allow-list), SEC-024 (third-party text in
  bot HTML).
- No personal data handled; logs never contain rendered texts.

## Definition of done

Tests green (`make ci-backend`), the arch test enforced, F-LOCALE-004 and F-BOT-015 parity-gate rows updated, PR
reviewed by the other developer.
