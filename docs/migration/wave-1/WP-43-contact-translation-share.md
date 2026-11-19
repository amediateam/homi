# WP-43 — Contact, translation, share

| Field | Value |
| ----- | ----- |
| Stage | C |
| Status | TODO |
| Depends on | WP-42 |
| Size | about 1 800 changed lines without fixtures, M |
| Behaviour reference | WP-12 (the shapes — unchanged here); `25` §4.2, §4.5; `24` §8.2 (Q-API-062) and the answers log of WP-02 (points 7 and 8); `08` rows of API-009, API-010, API-017 and RES-005; `03` §4 (BR-APP-032 … BR-APP-035, BR-APP-038); `16` SEC-REQ-014, SEC-REQ-020, SEC-REQ-026, SEC-REQ-027, SEC-REQ-028, SEC-REQ-047; tasks `tasks/backend/KV-BE-035-phone-disclosure-quota.md`, `KV-BE-037-call-links.md`, `KV-BE-046-share.md`, `KV-BE-048-translation.md` (rules, limits, edge cases only) |
| Needs from the production track | 1. Server env on staging and production: `CALL_LINK_SIGNING_KEY` (random, at least 32 bytes, per environment), `CALL_LINK_SIGNING_KEY_PREVIOUS` (blank), `CONTACT_SOFT_LIMIT` and `CONTACT_HARD_LIMIT` (blank = quota off until the product owner decides, DEC-19). 2. nginx on the API host: forward `GET /call/*` to Laravel, and write the access log of that location without the path (the token must not be logged, SEC-REQ-026). 3. Confirm that the staging and production bots are the ones whose token is in `TELEGRAM_BOT_TOKEN` (share uses the Bot API). 4. Tell the development track the public origin of the call page, for the link allow-list of the Mini App |

## Goal

The three remaining listing actions work for real. The author's number is given only by `POST …/contact`, after a
tap, under a per-user disclosure limit — in either of the two forms the operator may offer; the card only says
whether a number exists. `POST
…/translation` returns a machine translation fetched through legacy and cached. `POST …/share` prepares an inline
message of HOMI's bot. Shapes are those of WP-12.

## Scope

In: `ContactService` with both variants, the disclosure quota, HOMI's call links and call page; `contact()` and
`translation()` of `LegacyListingSource`; `TranslationService` with its cache and per-user limit; a minimal Bot API
client and `ShareService`; the three controllers.

Out: the Mini App side of calling and sharing (stage B, done); the bot's own cards and the full Bot API client
(WP-50, which extends the client created here instead of adding a second one); the bot's «Показать номер» button,
which calls the service built here (WP-53); the action-log row of a disclosure (WP-47 listens to the event raised
here); HOMI's own translation through an LLM (Wave 2).

## Decisions that bind this package

- The contact method's form depends on the operator's answer (Q-API-062, `25` §4.2). Both variants are built behind
  one response shape; a configuration value picks one, with automatic detection as the default.
- The author's number is given only after a tap (DEC-52): the card carries no number and its texts are masked
  (WP-12). The contact method is the one disclosure; each is counted by a per-user quota (SEC-REQ-028) and reported
  for the action log. The thresholds of the quota stay a product decision (DEC-19).
- Translation goes through legacy in Wave 1 (`25` §4.2); nothing is sent to an LLM by HOMI.
- Share is native: a prepared message of HOMI's bot with HOMI's link (DEC-40, `25` §4.2).
- Phones, tokens and translated texts never reach logs or analytics (SEC-REQ-047).

## Design

### Contact: two variants, one shape

`config/legacy.php` → `contact.mode` (`LEGACY_CONTACT_MODE`): `auto` (default), `phone`, `link`; `contact.link_ttl`
(600 s). `auto` decides per card: a raw phone in the legacy card → variant A; no phone but a call link → variant B;
neither → no contact.

| | Variant A — the service key gets the raw phone | Variant B — the service key gets only a call link |
| - | ---------------------------------------------- | -------------------------------------------------- |
| `contact.has_phone` on the card | `true` | `true` |
| `phone` in the answer of `POST …/contact` | the number in E.164 | `null` |
| `phone_display` there | legacy `phone_display`, else HOMI's formatting | legacy `phone_display` if present, else `null` |
| `call_url` there | HOMI's call page: `<call page base>/call/<token>` | the legacy link, made absolute against `legacy.base_url` |
| `expires_at` there | issue time + `contacts.call_link_ttl` (600 s) | receipt time + `contact.link_ttl` |
| What `POST …/contact` does | issues a new HOMI token; no legacy call while the phone entry below is cached | `GET /api/listings/{id}/call` through `LegacyClient`, answer `{url}` |
| Client effect | `tel:` first on Android, call page elsewhere (BR-APP-033); «Показать номер» and a masked number in the text show the digits after the tap (WP-26) | every call opens the link; no `tel:` attempt, and «Показать номер» opens the link because there are no digits to show — a difference to record in the functional checklist |
| Brand | HOMI page | the operator's page is shown to HOMI's user; say so in the PR and in `docs/api/README.md` |

The card itself carries no number in either variant (WP-12). The details translator of WP-42 sets
`contact.has_phone` to `true` when the legacy card has a phone or a call link; `contact_url` and `contact_paid` are
passed through untouched. Reading a card asks no quota and is not a disclosure.

`App\Services\Listings\ContactService` has one entry:

- `disclose(User $user, int $number, SourceContext $context, string $channel): ListingContact` — behind
  `POST …/contact` (`$channel` = `app`) and behind the bot's «Показать номер» (`bot`, WP-53). In this order:
  1. the source's contact for the listing (`ListingSource::contact()`); no phone and no link → `404
     contact_unavailable`;
  2. `ContactDisclosure::decide()`; refused → `404 contact_unavailable`;
  3. the answer: variant A issues a call link of HOMI, variant B takes the link of step 1;
  4. `ContactDisclosure::record()`;
  5. `App\Events\Listings\ContactDisclosed` (user id, listing number, channel) is dispatched. WP-47 writes the
     action-log row from it; until WP-47 is merged the event has no listener.
- `LegacyListingSource::contact(int, SourceContext)` implements the variant B request and, for variant A, returns
  the phone of the card.
- The owner cabinet adds one rule (WP-85; *added by the owner-cabinet plan*): a listing whose `contact.mode` is
  `request` gives its number only to a seeker whose request is `given`, else `404 contact_unavailable`, and a
  `hidden` one never; for a native number step 1 reads the owner listing's number (DEC-72, WP-84) and variant A
  issues HOMI's call link; `ContactDisclosed` names the origin (`legacy` or `native`); a disclosure on a `given`
  request is counted against the quota and never refused by it (DEC-19 open). `POST …/translation` of a native number
  answers `404 not_found` (no original text).

The card cache of WP-42 holds no number (WP-12). For variant A the details translator keeps the phone of the legacy
card in a second cache entry of the same lifetime, encrypted with `Crypt`; `contact()` reads that entry and reads
the card again when it has expired.

### Disclosure quota (`App\Services\Listings\ContactDisclosure`)

- `decide(User, int $number): bool` and `record(User, int $number): void`. A cache entry
  `contact:<user id>:<Y-m-d in Asia/Tashkent>` that holds the set of listing numbers, expiring one hour after the end
  of that Tashkent day; it is read and written through the `Cache` facade under `Cache::lock`, not with raw Redis set
  commands, because the tests and CI run on the `array` store and CI has no Redis service
  (`backend/phpunit.xml`, `.github/workflows/backend.yml`). Distinct listings count once; a number already disclosed
  today is always allowed again.
- `config/contacts.php`: `soft_limit` (`CONTACT_SOFT_LIMIT`), `hard_limit` (`CONTACT_HARD_LIMIT`); `null` disables.
  Values are a product decision (DEC-19, Q-SEC-003); production starts with them blank and the PR says so.
- Above the soft limit: `disclose()` answers `404 contact_unavailable` for a listing not yet disclosed that day.
  At the hard limit, once per day: set `access_grants.flagged_at` and
  `flag_reason = 'contact_quota'`, log a warning with the internal user id only, dispatch
  `App\Events\Listings\ContactQuotaExceeded`. In open mode without seats a user has no `access_grants` row (WP-40),
  so this is an `updateOrCreate`: a missing row is created with `state = admitted` and `admitted_via = open`.
  Blocking stays an operator action (`access:block`).
- Only `disclose()` counts; reading a card counts nothing, because it carries no number. The day's set holds
  every listing a contact was asked for, the refused ones included: the first `soft_limit` listings are answered,
  later ones are refused, and asking on is what reaches the hard limit. A second disclosure of a listing already
  answered that day — a stale link fetched again, the bot after the Mini App — is always allowed and counts once.
- Cache store unavailable: fail closed (`contact_unavailable`) and log once; never a `500`.

### HOMI's call links and call page (variant A)

`App\Services\Listings\CallLinkService`:

- `issue(User, int $number, string $locale): CallLink` — token = base64url of `{"n": number, "u": user id, "l":
  locale, "x": expiry}` + `.` + base64url of HMAC-SHA-256 over that payload with `CALL_LINK_SIGNING_KEY`. The token
  never contains the phone. Stateless: no table.
- `verify(string $token): ?CallLinkClaims` — `hash_equals`; the previous key is accepted while it is set (rotation);
  valid until `x` + 60 s.

Route `GET /call/{token}`, name `call.show`, registered in `bootstrap/app.php` next to the hooks group with a
middleware group `public-pages` that holds only the limiter `call-page` (30 per minute per address): no session, no
cookie, no Inertia. `App\Http\Controllers\Pages\CallPageController` (invokable):

| Case | Answer |
| ---- | ------ |
| valid token, listing has a phone | `200` Blade view `call/show`: HOMI name, listing title, formatted number, one `tel:` link |
| expired | `410` view `call/expired` «Ссылка устарела — откройте объявление в приложении ещё раз» in the token's locale |
| bad signature, unknown listing, no phone, erased user | `404` view `call/missing` |
| listing source unavailable | `503` view `call/unavailable` |

The page reads the title through `ListingSource::preview()` and the phone through `ListingSource::contact()`, both
in a system context (the caches make this cheap). Opening the page is not a second disclosure: its token was
issued by one. Headers on every answer: `X-Robots-Tag: noindex`, `Cache-Control: no-store`,
`Referrer-Policy: no-referrer`, `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'`,
`X-Content-Type-Options: nosniff`. No
script, no external asset, inline CSS only. Texts in `backend/lang/{ru,uz,en}/call.php`. The page base is
`config('contacts.call_page_base')`, default `config('app.url')`.

### Translation (`App\Services\Listings\TranslationService`)

`translate(User, int $number, SourceContext $context): ListingTranslation`:

1. Locale `ru` → `422 translation_not_needed` (the client never asks, BR-APP-034).
2. Cache `legacy:translation:<number>:<locale>` for `legacy.cache.translation` (86 400 s). A hit is free.
3. A miss first passes the per-user limiter `v1-translation` (30 per hour, `RateLimiter::attempt` inside the
   service, so hits never consume it); over the limit → `429 rate_limited` with `Retry-After`, without a `reason`:
   `reason: "daily"` belongs to the listing-open cap of WP-40 only (DEC-59), and the disclosure quota above keeps
   its own answer too.
4. `LegacyListingSource::translation()` → `POST /api/listings/{id}/translate`, no retry, 15 s timeout. How legacy
   picks the target language under the service key is open (WP-02 point 8). `legacy.translation.via`
   (`LEGACY_TRANSLATION_VIA`): `locale` (default — the same header or query as every other call, with `uz_Latn`),
   `query` or `body` (name in `legacy.translation.name`, default `lang`), `unsupported`.
5. Legacy `404` → `404 not_found`; any other failure, an empty text, or `unsupported` → `503
   translation_unavailable` (the client shows its inline "failed" state with retry).

The text lives only in the cache; it is never written to the database or a log. `ListingTranslation::fromArray()`
masks phone numbers in it like in every listing text (WP-12), so the cache holds the masked text. Two concurrent
first requests may both reach legacy; the second result overwrites the first.

### Share (`App\Services\Telegram\ShareService`)

`prepare(User, int $number, SourceContext $context): PreparedShare`:

1. Cache `share:<user id>:<number>:<locale>`; a hit returns the stored id until one minute before its expiry.
2. Miss: `ListingSource::preview()` for the text «title · price · kind · district» (BR-APP-038), HTML-escaped
   (SEC-REQ-020), no phone. Bot API `savePreparedInlineMessage` with the user's Telegram id, an article result whose
   message is that text, one inline button with the URL `https://t.me/<bot username>?startapp=l_<number>`, and all
   chat types allowed. Verify the method and field names in the current Bot API documentation before coding.
3. Store the returned id until the returned expiry; answer `PreparedShareResource` with `meta.source = native`.
4. Any Bot API error or timeout → `502 share_failed`, no retry inside the request; unknown listing → `404`.

`App\Services\Telegram\TelegramClient` (minimal, created here): `call(string $method, array $params): array` over
the HTTP client with `config('telegram.http')`; `App\Exceptions\TelegramException` carries the Bot API error code and
description with the token replaced by `bot***`. An empty bot token fails closed. WP-50 extends this class.

### Controllers and sources

The three stub controllers of WP-12 get real bodies; the stub answer of share moves into `NativeStubs` (the rule of
WP-40). `ListingController@show` is not changed: the card answer has `contact.has_phone` from the translator and no
number. `ListingContactController` calls `ContactService::disclose()` with the channel `app`.
`meta.source` is the driver of `source.listings.contact` or `source.listings.translation`, and `native` for share.
With the stub driver the same services run on stub data, so the quota and the limits behave alike in every
environment.

## Files

- `backend/app/Services/Listings/{ContactService,ContactDisclosure,CallLinkService,CallLink,CallLinkClaims,TranslationService}.php`
- `backend/app/Services/Telegram/{TelegramClient,ShareService,PreparedShare}.php`, `backend/app/Exceptions/TelegramException.php`
- `backend/app/Events/Listings/{ContactQuotaExceeded,ContactDisclosed}.php`
- `backend/app/Services/Sources/Legacy/LegacyListingSource.php` (`contact`, `translation`); the details translator
  (`has_phone`, the encrypted phone entry)
- `backend/app/Http/Controllers/Api/V1/Listings/{ListingController,ListingContactController,ListingTranslationController,ListingShareController}.php`
- `backend/app/Http/Controllers/Pages/CallPageController.php`; `backend/resources/views/call/{show,expired,missing,unavailable}.blade.php`;
  `backend/lang/{ru,uz,en}/call.php` (the folder `backend/lang/` does not exist today; it is Laravel's default
  language path and is created here — name it in the PR, a new folder under `backend/` needs approval);
  `backend/routes/pages.php` (new) and `backend/bootstrap/app.php`
- `backend/config/{contacts,legacy}.php`; `backend/app/Providers/AppServiceProvider.php` (limiter `call-page`)
- `backend/resources/fixtures/legacy/{call.json,translate.uz_Latn.json,translate.en.json,listing.link_only.json}`
- `backend/tests/Feature/Listings/{ContactServiceTest,ContactDisclosureTest,CallLinkServiceTest,CallPageTest,TranslationServiceTest}.php`,
  `backend/tests/Feature/Telegram/ShareServiceTest.php`, `backend/tests/Feature/Api/V1/Listings/{ContactTest,TranslationTest,ShareTest}.php`
- `backend/.env.example` (the four keys plus `LEGACY_CONTACT_MODE`, `LEGACY_TRANSLATION_VIA`) — separate shared-file PR

## Steps

1. Read the four task files for rules and edge cases, `.ai/agents/security-reviewer.md` and
   `.ai/agents/telegram-bot-engineer.md`. Check the answers log of WP-02 for points 7 and 8; if they are answered,
   set the defaults of `contact.mode` and `translation.via` accordingly and say so in the PR.
2. `ContactDisclosure` with tests (array cache, frozen clock).
3. `CallLinkService`, the call page route, views and headers, with tests.
4. `ContactService::disclose()` for variant A, then variant B with the fixture `listing.link_only.json`; the
   encrypted phone entry; `LegacyListingSource::contact()`; the event `ContactDisclosed`.
5. `has_phone` in the details translator; `POST …/contact`.
6. `TranslationService`, `LegacyListingSource::translation()`, the controller.
7. `TelegramClient`, `ShareService`, the controller; every test fakes HTTP and prevents stray requests.
8. Pint, PHPStan, `make ci-backend`; the security-reviewer agent reads the diff; the env PR; the nginx request in
   the PR text.

## Behaviour to reproduce

- The primary action of the card: `has_phone` → «Позвонить»; a contact link → «Написать» (or «Номер платный» when
  `contact_paid`); otherwise «Открыть пост» (BR-APP-032). The API only has to keep the fields truthful.
- Different from legacy by decision (DEC-52): legacy sends the number and a call link with every card and limits
  nothing. HOMI gives the number only when the user taps «Позвонить», «Показать номер» or a masked number, counts
  every listing whose number a user received that day, and answers `contact_unavailable` beyond the soft limit.
- A call link works for at least ten minutes and can be refreshed two minutes early (API-009).
- A token for listing A never shows listing B; a withdrawn listing answers `404` at once even with a valid token.
- Translation is offered only outside `ru`; the first tap fetches, later taps toggle locally (BR-APP-034).
- Share falls back on the client to the plain `t.me` link whenever the method does not answer `200` (BR-APP-038).
- Two taps on share within the cache window give the same prepared id (fix of LB-API-046).

## Tests

- Quota: soft 3 and hard 5 → `POST …/contact` for listings 1–3 answers the number, for the 4th `404
  contact_unavailable`, the 6th flags the user once; a second request for listing 1 still answers its number and
  counts nothing; reading ten cards counts nothing; reset at 00:00 Asia/Tashkent (19:00 UTC), not at UTC midnight;
  limits `null` → no refusal; two users have separate counters; a disclosure with the channel `bot` and one with
  `app` share one counter; the flag log line has no phone and no Telegram id; cache failure →
  `contact_unavailable`, no `500`.
- Call links: valid at +600 s and +659 s, expired at +661 s; altered payload or signature → `404`; previous key
  accepted; token of listing A with the number changed → `404`; no phone in the address.
- Call page: `200` with one `tel:` link and no `<script>` or external address; `410` in the token's locale; headers
  exactly as listed; no `Set-Cookie`; the 31st request in a minute → `429`; source unavailable → `503`.
- Contact, variant A: the card has `has_phone: true` and no number in any field; `POST …/contact` returns phone,
  display, HOMI link and expiry, and a second call a new token without a legacy request while the phone entry is
  cached. Variant B: the card has `has_phone: true`; the method calls legacy once and returns `phone: null` with
  an absolute legacy link; legacy failure → `503 source_unavailable`. No phone and no link → `has_phone: false`
  and `404 contact_unavailable`. `auto` picks per fixture. Each `200` dispatches one `ContactDisclosed` with the
  user, the number and the channel; a refused or failed request dispatches none. The cached card and the cached
  translation hold no raw number; the phone entry is unreadable without the application key.
- Translation: `uz` and `en` reach legacy with the configured language selection; second call → no request and no
  limiter use; `ru` → `422`; legacy `404` → `404`; timeout → `503 translation_unavailable`; the 31st miss in an hour
  → `429`, hits still work; `unsupported` → `503`; the text is absent from logs.
- Share: first call → one Bot API request with the caller's Telegram id and the `startapp=l_<number>` button; second
  call → same id, no request; another locale → a new request; a title with `<b>` and `&` is escaped; Bot API `400`,
  `403`, `429`, `500` and a timeout → `502 share_failed`; the bot token never appears in an exception or a log;
  user B never receives A's cached id.
- Limits: `v1-contact` and `v1-share` at their values.

## Acceptance checklist

- [ ] The card and `POST …/contact` answer in the WP-12 shape in both variants; `auto` chooses per card; no card
      answer holds a phone number.
- [ ] `POST …/contact` is the only place a number is given; each answer is counted and raises `ContactDisclosed`.
- [ ] The disclosure quota refuses and flags as specified and is off when the limits are blank.
- [ ] HOMI's call page shows the number only through a valid, unexpired token and sends the listed headers.
- [ ] Translation is cached per listing and locale, limited per user on misses, and never stored or logged.
- [ ] Share returns a prepared message id of HOMI's bot and reuses it within its lifetime.
- [ ] No phone, call token, translated text or bot token appears in logs (log-spy tests).
- [ ] The env keys and the nginx request are in the PR; the security review has no open finding.
- [ ] `make ci-backend` is green.
- [ ] Inside Telegram on staging, then production, once the features are on a real source: «Позвонить» works on iOS
      and Android; «Показать номер» shows the digits only after the tap and the numbers in the original text are
      masked before it; a `uz` profile gets a translation; «Поделиться» opens Telegram's share sheet and the shared
      message opens the listing in HOMI's Mini App.

## Handoff

Empty.
