# Developer's answers of 2026-11-27

Conventions: [`../README.md`](../README.md). The record of the questions asked on 2026-11-27, while WP-42 (listings
through legacy) was being built. Answers are quoted in Russian as the option chosen. DEC-111 was asked by WP-43 (contact, translation, share) the
same day.

## How long a page of previews may wait for the legacy limiter (DEC-110)

Question (asked in Russian): the personal lists (favourites, history; WP-29, WP-44) read their cards through
`previews()` 20 a page, one legacy call per number. The outbound limiter of WP-41 allows 5 calls a second by default
(the operator's real number is open, Q-API-059) and a user's call waits for it at most 0.5 s, so on a cold cache at
most 10 previews arrive and the others are silently left out — a favourite would vanish from its page until the page
is opened again. How should it work?

Options:

- Wait up to 4 s, no omissions (recommended): the previews of one page share a limiter budget of 4 s, so a cold page of
  20 loads within 4 s and then a minute from the card cache; when legacy did not give one of them for any reason other
  than a removed listing, the whole page answers «Не загрузилось — повторить», and no favourite is lost silently. With
  the operator's real limit the wait gets shorter.
- Keep 0.5 s, with omissions: WP-41's rule "nothing waits for legacy" holds and the answer is fast, but a cold page of
  favourites lacks up to half of its cards until it is opened again.
- Pages of 10: the personal lists give 10 cards instead of 20; fast and without omissions, but the list contract of
  WP-29 and WP-44 changes and the Mini App loads pages more often.

Answer: «Ждать до 4 с, без пропусков (Рекомендуется)». Registered as **DEC-110**. Consequences: `previews()` has its
own limiter budget `legacy.previews.max_wait_ms` (4 000) for the whole batch, an exception to WP-41's 0.5 s for user
calls; a number legacy answered `404` is left out, any other miss makes the call `503 source_unavailable` after the
good previews are cached; a pause of legacy stays `403` with the reason `paused`. The budget is shared with every
other legacy call of the second: under other traffic (a review measured 3 calls a second of other users) a cold page of
20 can still answer `503` after caching the ten that arrived, and the Mini App's «Повторить» then mostly succeeds from
the card cache; the operator's real rate removes the case.

## Where the texts of HOMI's call page live (DEC-111)

Question (asked in Russian): WP-43 adds HOMI's call page (`GET /call/{token}`) with its texts in ru, uz and en. Its
specification puts them in a new folder `backend/lang/{ru,uz,en}/call.php` — Laravel's default translation path, which
does not exist yet; a new folder under `backend/` needs the developer's approval. Create it?

Options:

- Create `backend/lang` (recommended): Laravel's default path, read by `__()` without configuration; the bot's and the
  mails' texts can go there later.
- Texts in the Blade views: no new folder; the three languages as an array inside `resources/views/call/*`, for this
  page only.
- Texts in `resources/lang`: a non-default path set with `useLangPath()` in `bootstrap/app.php`; also a new folder, but
  inside `resources/`.

Answer: «Создать backend/lang (Рекомендуется)». Registered as **DEC-111**. Consequences: WP-43 creates `backend/lang/`
with `ru`, `uz` and `en` and the file `call.php` in each; later packages put their server-side texts there too.

