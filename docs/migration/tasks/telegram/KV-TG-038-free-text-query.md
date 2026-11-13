# KV-TG-038 — Free-text radar queries through the LLM parser

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend — Telegram bot (track: development) |
| Complexity | M |
| Feature IDs | F-BOT-009, F-PRIVACY-004 |
| Dependencies | KV-TG-034 (review screen), KV-TG-028 (wizard state); query parser of the Parsing module (GAP-003) behind the LLM gateway with PII masking and spend caps (SEC-REQ-042 … SEC-REQ-044, backend); DEC-03 (LLM vendor); KV-INF-006 (`llm` queue); DEV-028 (`PROPOSED`); Q-BOT-023 |

## Goal

Any private text that is not a command and not an awaited amount is parsed into radar filters. An understood phrase
gets a 👌 reaction and the review titled «Вот что я понял — проверьте», with notes about defaults and unknown places;
a phrase with nothing usable gets the hint with `➕ Новый радар` and `✉️ Написать в поддержку`. The text is masked
before the LLM call and never stored. After DEV-028, an unsupported city no longer silently becomes «весь Ташкент».

## Legacy reference

- BOT-054 (understood), BOT-055 (not understood), `tb:571–607`; state machine `04` §3.9.
- Texts: TXT-BOT-040 (title + review body), TXT-BOT-041 `Не назвали тип сделки — поставил по умолчанию, поправьте
  кнопками ниже.`, TXT-BOT-042 `Не понял, к какому району отнести: <Самарканд>. Районы можно выбрать кнопкой «✏️
  Районы».`, TXT-BOT-043 `Не понял, что искать. Опишите жильё, например: «двушка в Юнусабаде до 600$ без риелторов» —
  или настройте радар кнопками.`; buttons BTN-030, BTN-034.
- Rules: BR-BOT-051 (all non-command text except an awaited amount), BR-BOT-052 (👌 only when understood), BR-BOT-053
  (missing deal → rent_long + note), BR-BOT-054 (unsupported place → whole Tashkent + note), BR-BOT-055 (Gemini; text
  not stored), BR-BOT-088 (phones and handles masked first).
- Problem: LB-BOT-017 (wrong-city radar after skimming) → DEV-028. Unknown parser scope: Q-BOT-023.

## Implementation

1. Read `04` §3.9, `16` §4.10 and `.claude/skills/ai-sdk-development/`. Tests first
   (`php artisan make:test --pest Bot/FreeTextQueryTest`).
2. Router (KV-TG-006) routes text to `Telegram\Handlers\FreeTextQuery` when no amount is awaited; the handler checks the
   per-user LLM quota (30 / hour, SEC-REQ-010 — over quota → one notice per window from KV-TG-006) and dispatches
   `ParseUserQuery` on the `llm` queue with the chat id, message id and the text (job payload encrypted, deleted after
   the job; the text is never written to a table or a log).
3. `php artisan make:job Jobs/Telegram/ParseUserQuery`: call the query parser (`QueryParser::parse(text, locale)`) —
   masking, prompt, JSON schema and spend cap live in the gateway (backend). The result is a partial filter set plus
   notes (`deal_defaulted`, `unknown_places[]`) and is validated by the shared normaliser and the gazetteer codes
   (SEC-REQ-043); invalid fields are dropped.
4. Understood (at least one of deal / object / place / rooms / budget recognised): `setMessageReaction` 👌 on the user's
   message; create wizard state `{kind: wizard_new, sid, data: parsed draft, step: review, origin: text}` and send the
   review (KV-TG-034) as a NEW message titled TXT-BOT-040; notes: TXT-BOT-041 when the deal was defaulted to rent_long;
   for unknown places:
   - legacy (flag `bot.dev028` off): city Tashkent, whole city, note TXT-BOT-042 naming the place;
   - DEV-028 (`PROPOSED`): no city default — the wizard opens at the area step (KV-TG-030) as the new message, with
     the line `bot.freetext.unsupported_city` naming the place and the supported cities (new text).
5. Not understood: reply TXT-BOT-043 with `➕ Новый радар` (`k1:nw`) and `✉️ Написать в поддержку` (url to the support
   bot from `TELEGRAM_SUPPORT_BOT_USERNAME`, primary); no reaction.
6. Gateway unavailable or kill switch on (SEC-REQ-044): reply TXT-BOT-043 (its second half points to the buttons) and log
   the degradation; no retry storm (job tries 1 for user-facing parsing).
7. Golden phrase set `backend/tests/Fixtures/Bot/phrases.json` (ru, uz-Latn, en, synthetic) with expected filters, run
   against the parser fake in CI and, manually, against the chosen vendor (Q-BOT-023).

## Files

- `backend/app/Telegram/Handlers/FreeTextQuery.php`, `backend/app/Jobs/Telegram/ParseUserQuery.php` (new)
- `backend/lang/{ru,uz,en}/bot.php` (`freetext.*`)
- `backend/tests/Feature/Bot/FreeTextQueryTest.php`, `backend/tests/Fixtures/Bot/phrases.json` (new)

## API contract

Bot API: `setMessageReaction` (`reaction: [{type: emoji, emoji: 👌}]`), `sendMessage`. Internal: `QueryParser::parse`
→ `{filters, notes, confidence}` (shape owned by the Parsing module). No HTTP endpoint.

## Business rules

- Kept: BR-BOT-051, BR-BOT-052, BR-BOT-053, BR-BOT-055, BR-BOT-088; BR-BOT-054 until DEV-028 is approved.
- `PROPOSED`: DEV-028 (ask for the city instead of defaulting) — tests `todo` until approved.

## Acceptance criteria

- «двушка в Юнусабаде до 600$» → 👌 and a review equal to the `tb:579–591` sample (rent_long note, `💰 до $600/мес`).
- «привет» → TXT-BOT-043 with two buttons, no reaction.
- The provider fake never receives a phone number or `@handle` from a phrase that contains them.
- No table, log line or Telescope entry contains the phrase after processing (`telegram_updates` text stripped by
  KV-TG-003).

## Tests

| # | Conversation | Expected |
| - | ------------ | -------- |
| 1 | `send('двушка в Юнусабаде до 600$')` | reaction 👌; new review: TXT-BOT-040 title, `🏠 Аренда · квартира · 2 комн.`, `📍 Ташкент · Юнусабад`, `💰 до $600/мес`, `👤 все объявления`, flow line, TXT-BOT-041 |
| 2 | → `press('✅ Сохранить')` | radar created as in KV-TG-036 |
| 3 | `send('купить дом в Самарканде')` (legacy) | review with `📍 весь Ташкент` and TXT-BOT-042 naming `Самарканд` |
| 4 | same with DEV-028 (`todo`) | area step as a new message with `bot.freetext.unsupported_city` |
| 5 | `send('привет')` | TXT-BOT-043; buttons `➕ Новый радар`, `✉️ Написать в поддержку`; no reaction |
| 6 | `send('2к Чиланзар до 500 без риелторов +998000000001 @agent')` | gateway fake receives masked phone and handle |
| 7 | 31st phrase within an hour | one slow-down notice, no parse |
| 8 | gateway kill switch on | TXT-BOT-043, no LLM call |
| 9 | `send('650')` with no amount awaited | handled here (parsed as a budget-only phrase or not understood) |
| 10 | uz-Latn phrase «Yunusobodda 2 xonali 500$ gacha» | review in uz with Yunusobod |

## Edge cases

- A phrase while a wizard is open (not awaiting an amount): a new review is sent; the older wizard becomes stale.
- Parser returns a city plus districts of another city: the normaliser drops the foreign districts; the note lists them
  as unknown places.
- Edited messages (`edited_message`) are not subscribed (KV-TG-003) and never re-parsed.

## Security

- SEC-REQ-042 (masking before any call), SEC-REQ-043 (data not instructions; schema-validated output; no tools),
  SEC-REQ-044 (quota, spend cap, kill switch, audit without raw text), SEC-REQ-010 (per-user limit).
- BR-BOT-055 / SEC-REQ-036: the text is not stored; the job payload is encrypted and removed.

## Definition of done

Tests green (`make ci-backend`), KV-QA-009 free-text transcripts pass, the phrase set reviewed by the developer, F-BOT-009
and F-PRIVACY-004 parity-gate rows updated (G5 waits for DEV-028; G9 needs the vendor of DEC-03 on staging), `09` rows
updated, PR reviewed by the other developer and the `security-reviewer` agent.
