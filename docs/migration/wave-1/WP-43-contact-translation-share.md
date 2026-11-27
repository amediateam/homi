# WP-43 — Contact, translation, share

| Field | Value |
| ----- | ----- |
| Stage | C |
| Status | WAITING (merged in #133, env keys #132; the call page's nginx location, `CALL_LINK_SIGNING_KEY` and the bot settings pending) |
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
  `request` gives its number only to a seeker whose request is `given`, else `404 contact_unavailable`, and a `hidden`
  one never; for a native number step 1 is WP-85's `NativeContact::read()`, the one reader of the owner listing's number
  (DEC-72, WP-84) and the only implementation of a native disclosure (WP-86's merged source answers `ContactUnavailable`
  for a native number), and variant A issues HOMI's call link; `ContactDisclosed` names the origin (`legacy` or
  `native`); a disclosure on a `given` request is counted against the quota and never refused by it (DEC-19 open;
  integrator default 23 of the owner-cabinet plan). `POST …/translation` of a native number answers `404 not_found` (no
  original text).

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

## As built

The package is built as designed, with these points decided in the code (rule 6). Each one corrects or completes
the design above; the AM rows are in `docs/ai/reports/phase-3-notes.md` §AL, the developer's decision DEC-111 in
`docs/migration/decisions/2026-11-27-developer-answers.md`. The operator's answers to WP-02 points 7 and 8 are open, so
the defaults are `contact.mode = auto` and `translation.via = locale`.

**Contact**

- **The order of `disclose()` asks the quota before legacy is paid** (corrects the steps of "Contact"):
  `ListingSource::hasContact()` (new on both drivers: the contact entry, else the card) → `ContactDisclosure::decide()`
  → `contact()` (variant B's `/call` request only now) → the answer → `record()` → `ContactDisclosed`. A refused user
  costs no `/call` request. A variant B listing whose `/call` then fails keeps its place in the day's set and raises no
  event.
- **The quota reserves in `decide()`**: check and reservation run under one lock, `record()` confirms; a listing whose
  answer then fails stays counted as asked for, a refused listing stays refused that day. Only an `Exception` of the
  cache store fails closed (`contact_unavailable`, a warning at most once a minute while the store can still count it);
  with the whole store down the route's limiter fails first (`500`, no number given).
- **Unblocking** a user who was never admitted deletes the row and with it a `contact_quota` flag (WP-40's
  `access:unblock`).
- **The quota flag never creates or widens access** (corrects "updateOrCreate … `admitted`/`open`", AM-124): it updates
  `flagged_at` and `flag_reason` of an **existing** `access_grants` row only, never `state`, `admitted_via` or seats. A
  user without a row (open mode without seats, an owner-list id) is reported by the once-a-day warning and
  `ContactQuotaExceeded` only; storing that flag needs a place without a `state` (a migration, not built). The event
  carries `asked` and `day` besides the user id; `ContactDisclosed` carries no origin yet (WP-85 adds it).
- **The contact entry** (completes "the encrypted phone entry"): `legacy:v1:listings:contact:<number>`, per number only,
  for `legacy.cache.card` seconds, `Crypt::encryptString` of `{p: E.164|null, d: phone_display|null, l: has a link}` —
  the variant marker keeps an expired entry apart from a link-only card. Under mode `link` it keeps legacy's
  `phone_display` (the variant B answer needs it) but no `p`. It is filed once, under the **answered** number; under
  the asked number of a merged duplicate `file()` stores a sealed pointer `{m: <answered>}` with no copy of the phone,
  and a read follows it one step. It is refilled under `singleFlight()`, dropped by `rememberGone()`; a decryption
  failure is a miss; a miss re-reads the card (legacy's daily limit → `503`) and caches it.
- **`has_phone`** follows `legacy.contact.mode`: `auto` and `link` — a phone `AuthorKey::e164()` reads as one number,
  or a call link; `phone` — the phone only. A phone that is not one number is noted as a coercion of `phone`.
- **Variant A** uses legacy's `phone_display` only when it reads as the same number, else HOMI's form
  `+998 XX XXX-XX-XX`; `ListingContact` is unchanged and `ContactService` fills `call_url` and `expires_at`.
- **Variant B links** (completes "Variant B"): a relative link is joined to the **origin** of `legacy.base_url`; an
  absolute one must be `https`, on the host **and port** of `legacy.base_url` (443 when it names none) or of an entry of
  `legacy.contact.link_hosts` (`LEGACY_CONTACT_LINK_HOSTS`: `host` on 443 or `host:port`; an entry of another form, an
  IPv6 one too, adds nothing), compared lower-cased and exactly, without user info or a backslash, at most 2 048 bytes,
  no control characters; a link without a port counts as 443, so `:0` and any other port are refused. It does not go
  through `LinkGuard` (the `?e=` of a signed link has ten digits). Another host or port → `404 contact_unavailable` and
  a warning `{path, host}` — `path` is legacy's endpoint template, the host lower-cased; never the link's port, path,
  query or token — at most once a minute per
  host, so the production track can fill `LEGACY_CONTACT_LINK_HOSTS`; a host that is not a DNS name (a trailing dot
  too) or has seven digits or more in all (a number split by hyphens or dots too) is logged as
  `{path, host_invalid: true}` under one fixed once-a-minute key, so no number's digits reach a log or a cache key. A
  port that is not digits only (`:443x`, `:+443`, which `parse_url()` reads as 443) is a contract error (`503`). `phone_display` passes only when it reads as one
  number, so a link-only answer never carries digits. The card can say `has_phone: true` while the contact answers
  `404` for a refused host.
- **A withdrawn listing** answers `contact_unavailable` at once: `contact()` checks the gone marker first. Every
  `404` of a card also writes `legacy:v1:listings:withdrawn:<number>` — whatever `legacy.cache.not_found` says — for
  `legacy.cache.card` plus one fill's time (107 s with the defaults) before it drops the entry; while it lives `file()`
  files nothing for the asked or the answered number and the entry (looked up again after a wait for the fill lock),
  a pointer to a withdrawn survivor and the contact of a card read in flight under either number are all refused, so
  a read in flight during the `404` neither files nor answers a phone. The marker and the drop of the entry come
  before the write to `listing_refs`, so a failing write leaves no number. A listing legacy withdraws between
  `hasContact()` and `contact()` keeps its reserved place in the day's set, as a failing variant B link does
  (accepted: no number is given). A listing
  re-published within those 107 s answers `contact_unavailable` although its card may say `has_phone: true`.
- **Native stubs** (decision of the integrator, the precedent of WP-42's overlay): while `sources.native_stubs` is on,
  `POST …/contact`, `…/translation` and `…/share` answer their stub fixtures exactly as WP-12 did (no quota, no token, no
  Bot API), so the e2e suite (`SOURCES_NATIVE_STUBS=true` in `frontend-e2e.yml`; `listing-contact.spec.ts` expects
  `call/stub-token-<n>`) stays deterministic; on a non-stub driver the contact then answers `503 source_unavailable`.
- **OpenAPI.** `ContactService::disclose()` names its exceptions in prose, not `@throws`: Scramble turned those tags into
  answers of the method.

**Call links and the call page**

- **The token's MAC has a purpose:** HMAC-SHA-256 over `'call-link.v1.'.<payload>`; the payload stays readable base64,
  so a forwarded link reveals the internal user id and the listing number (`u` selects the user's drivers). A blank or
  short `CALL_LINK_SIGNING_KEY`: in `local` and `testing` a key derived from `app.key`; elsewhere no link is issued or
  accepted and the contact answers `503 source_unavailable` with a warning at most once a minute, never a `500`. The
  previous key is accepted only while it is set and long enough.
- **The page reads the contact first**, then the title from the card that read cached — one card read when cold —
  through `SourceContext::foreground($locale)`: no user, no overlay, no view record, but a foreground call with the
  user path's limiter wait (a system context's background share would answer `503` as soon as it is busy). It reads the
  drivers chosen for the token's user; the reference read behind a card's districts keeps the context's foreground
  flag. A blocked user can still open a link issued before the block until it expires
  (≤ 660 s): accepted, the answer already carried the number.
- **Headers** (completes the list): `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline';
  frame-ancestors 'none'; base-uri 'none'; form-action 'none'`; `Cache-Control: no-store, private` (Symfony appends
  `private`); `429` reuses the `unavailable` view; a token outside `[A-Za-z0-9_.-]{1,512}` gets the framework's `404`
  without the page headers. The four views share `call/layout.blade.php`; the page is rendered to a string.
- **Telescope** drops a request entry answered by `CallPageController`, and one whose path — once `rawurldecode`d,
  leading slashes collapsed — matches `#^/+call(/|$)#i` (so `/call%2F<token>` and `//call/<token>` are dropped too); it
  hides `data.phone`, `data.phone_display` and `data.call_url` in every environment; Pulse ignores the `contact:` keys.

**Translation**

- **The route limiter** (corrects "`v1-translation` … inside the service", AM-125): the route sits under
  `throttle:v1-reads`; a `throttle:v1-translation` on the route would count every hit, and dropping a throttle from the
  route removes its `429` from the OpenAPI document. `TranslationService` counts `v1-translation`
  (`rate_limits.translation.per_hour`, 30) on misses only, before the source is asked, so a failed miss, a `404` and a
  native number count too; the miss is counted first and then compared (`RateLimiter::hit() > 30` → `429`), atomic on
  Redis, so parallel misses cannot pass the limit and a refused miss counts. The unused `RateLimiter::for('v1-translation')` is removed.
- **Cache key per driver and selector:** the stub's `stub:translation:<number>:<locale>`, legacy's
  `legacy:translation:<number>:<locale>:<via>[:<name>]`, so a changed `LEGACY_TRANSLATION_VIA` never serves a text cached
  under the old selector. `via=locale` while `LEGACY_LOCALE_VIA` sends no language answers `503 translation_unavailable`
  with a warning at most once a minute (legacy would answer its default language under every locale): the operator then
  sets `query` or `body`.
  A stub scenario skips the translation and share caches. The cached value is the masked array.
- **Outcomes:** legacy's `403 paused` passes as `403 access_denied` with `reason: paused`, like every legacy method (the
  Mini App shows any failure as its inline retry); the daily limit → `503`; a translate `404` does not mark the card
  gone; a non-string `text` is a contract error naming `text`; the 15 s is `legacy.timeout`.
- **A slow translator never opens the shared breaker** (completes "no retry, 15 s timeout"): the call is optional
  (`LegacyCall::$optional`) — refused while the breaker is open or waits for its probe, never the probe itself, and none
  of its outcomes (timeouts, `5xx`, `429`, `401/403`) is counted; a success neither closes the breaker nor resets the
  count. Each refused tap still uses one of the user's misses. A translation's `429` therefore does not slow the other calls down: its `Retry-After`
  is not applied.
- `LegacyClient::post()` gained an optional `$query`.

**Share**

- **The message:** an article result with a `url` button (not `web_app`) to `https://t.me/<bot>?startapp=l_<number>`,
  all four `allow_*_chats` flags on; the text is the Mini App's share text — title (bold, the only markup and the
  reason for `parse_mode: HTML`) · amount and period · price kind · district — masked and HTML-escaped, the labels in
  `lang/*/share.php` (DEC-111); a listing without title and price uses `share.untitled`. The button labels («Открыть
  объявление» / «Eʼlonni ochish» / «Open the listing») await the product owner's confirmation.
- **Outcomes:** the bot username must match `^[A-Za-z][A-Za-z0-9_]{4,31}$`; a user without a Telegram id → `502`; a
  failed preview stays `503 source_unavailable` or `403 paused`; an id expiring within 60 s is not cached; the cache key
  is `share:<user>:<number>:<locale>:<currency>:<driver>` (the text carries the price in the user's currency). The order
  is cache → the bot's token, address and username and the caller's Telegram id → preview → Bot API, so an unconfigured
  environment costs no legacy read and answers `502` even for an unknown number.
- **`TelegramClient`** (for WP-50): one attempt, no redirect, a `result` that is not an object throws, a blank timeout is
  15/5 s; any `Throwable` of the send becomes `TelegramException::transport()` without the original message (a malformed
  address made Guzzle quote the token); `TELEGRAM_API_BASE_URL` must be a bare origin — printable ASCII only after an
  ASCII trim (no non-breaking space, no non-ASCII letter, no backslash), `https` (plain `http` only in
  `local`/`testing`), a host, an optional port, no user info, path, query or fragment — so a Bot API proxy behind a
  path prefix is refused; every token-bearing frame is `#[\SensitiveParameter]`, and so are `call()`'s `$params` (the
  `user_id` and the text) and `result()`'s `$response` (a test walks every frame's arguments and reads the response's
  address). Telescope drops Bot API client requests; Pulse groups any token-shaped Bot API path as `/bot***/<method>`,
  behind any prefix; Telescope's Redis and cache watchers drop entries on translation, contact, card, preview and
  disclosure-day keys (one pattern, `SENSITIVE_KEYS`; the withdrawn marker holds no data).
- Bot API fields used (documentation of 22 November 2026, Bot API 10.5 by the implementer — the reviewer could not
  re-read it): `savePreparedInlineMessage(user_id, result, allow_user_chats, allow_bot_chats, allow_group_chats,
  allow_channel_chats)` → `PreparedInlineMessage {id, expiration_date}`; `InlineQueryResultArticle {type, id, title,
  input_message_content, reply_markup}`; `InputTextMessageContent {message_text, parse_mode}`.

**Configuration** — `config/contacts.php`: `call_link_signing_key` (`CALL_LINK_SIGNING_KEY`),
`call_link_signing_key_previous` (`CALL_LINK_SIGNING_KEY_PREVIOUS`), `soft_limit` (`CONTACT_SOFT_LIMIT`), `hard_limit`
(`CONTACT_HARD_LIMIT`), `call_link_ttl` (600, no env), `call_page_base` (config only, `null` = `app.url`);
`config/legacy.php`: `contact.mode` (`LEGACY_CONTACT_MODE`), `contact.link_ttl`, `contact.link_hosts`
(`LEGACY_CONTACT_LINK_HOSTS`), `translation.via` (`LEGACY_TRANSLATION_VIA`), `translation.name`
(`LEGACY_TRANSLATION_NAME`, beyond the spec, so the operator's answer stays an env change), `cache.translation`.

**Files outside the list.** `LegacyContact` (the one reading of a raw card's contact), `call/layout.blade.php`,
`lang/*/share.php`, `tests/Support/FailingCacheStore.php`, `tests/Pgsql/ContactFlagRaceTest.php`;
`PreparedShare` moved to `App\Services\Telegram` as the list says.

**Review.** One security review per stage by a `security-reviewer` subagent, each on a snapshot with its own probes.
Stage A (contact, call links, the page): two medium (the quota flag widened access, AM-124; the call token in nginx's
access log and the duplicate headers — the go-live gate of "Handoff"), one medium-low (variant B link hosts), eight low,
two info. Stage B (translation, share): one medium (a malformed Bot API address quoted the token
in an exception, AM-127), six low, one info. The integrator added two points (a slow translator must not open the shared
breaker; the warning names the refused host) and found that a `try_files` in the nginx snippet would still log the
token (AM-126). A narrow re-review of every fix found 22 of 23
fixed and one partly, plus six low and one info (the call-page filter of Telescope by an encoded or doubled slash, the
host in the warning, two trace arguments, the cache watcher, a withdrawn merged duplicate, the Bot API address's
characters; the port of a variant B link). A last scoped read of that round's contact paths found five low and one
info (a card read in flight under a withdrawn duplicate's number, the order of the withdrawal and `listing_refs`, the
lookup after the fill lock, the digits of a logged host, a port that is not digits; the card cached before the
refusal), fixed by the integrator; the reserved place of a listing withdrawn between the two reads is accepted. Every
fixed finding has a test that failed before its fix; the integrator re-ran every suite on the final commit.

## Handoff

In review (#133, env keys #132). The development track needs nothing more for this package after the merge.

**For the production track, in this order** (no `source.*` flag changes; the defaults stay `stub` until WP-48; with
`SOURCES_NATIVE_STUBS` unset the services already run on the stub driver on staging and production):

1. **nginx on the API host, before this code is deployed** — `location /` already forwards `/call/<token>` to PHP, but
   its `access_log` writes the request line, so every call token would be logged (SEC-REQ-026), and the server-level
   `add_header … always` lines add a second `Referrer-Policy` and `X-Content-Type-Options` to the page's own. Add, in
   `infra/production/nginx/api.homi.conf` and `infra/staging/nginx/api.staging.homi.conf` (the production track's
   files), above `location /`:

   ```nginx
   # HOMI's call page (WP-43): PHP straight from this block, as the dashboards do — after a try_files to /index.php
   # the request would finish in `location ~ \.php$` and be logged there with its token.
   location ^~ /call/ {
       access_log off;                      # or a log_format without $request / $request_uri
       add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
       add_header X-Frame-Options "DENY" always;
       fastcgi_pass  unix:/run/php/php8.5-fpm.sock;
       include       fastcgi_params;
       fastcgi_param SCRIPT_FILENAME $realpath_root/index.php;
       fastcgi_param SCRIPT_NAME     /index.php;
       fastcgi_param DOCUMENT_ROOT   $realpath_root;
       fastcgi_param HTTPS           on;
   }
   ```

   Any `add_header` inside the location stops the server-level ones from being inherited; the two above are the ones the
   page does not set itself (it sends its own CSP, `Referrer-Policy`, `X-Content-Type-Options`, `X-Robots-Tag`,
   `Cache-Control`). The error log stays (it holds no request line unless PHP-FPM fails). Check after the change:
   `curl -sI https://<api host>/call/x` answers `404` with one `Referrer-Policy: no-referrer`, and the access log has
   no `/call/` line.
2. **Env on staging and production:** `CALL_LINK_SIGNING_KEY` (random, at least 32 bytes, per environment;
   `CALL_LINK_SIGNING_KEY_PREVIOUS` blank — to rotate, the old value goes there for at least eleven minutes);
   `CONTACT_SOFT_LIMIT` and `CONTACT_HARD_LIMIT` stay **blank** (quota off until the product owner decides, DEC-19).
   Without the key, `POST …/contact` answers `503 source_unavailable` for a listing with a phone.
3. **The bot:** `TELEGRAM_BOT_TOKEN` and `TELEGRAM_BOT_USERNAME` of the staging and the production bot on their hosts
   (share uses `savePreparedInlineMessage`; either blank → every share answers `502` and the Mini App falls back to the
   plain `t.me` link). `TELEGRAM_API_BASE_URL` blank or a bare origin.
4. **Name the public origin of the call page** (`APP_URL` of the API, `call_page_base` is config only) to the
   development track; the Mini App's link allow-list already holds the API host.
5. When the operator answers WP-02 points 7 and 8: set `LEGACY_CONTACT_MODE`, `LEGACY_TRANSLATION_VIA` /
   `LEGACY_TRANSLATION_NAME` accordingly, and `LEGACY_CONTACT_LINK_HOSTS` from the host the warning «Legacy gave a call
   link to a host HOMI does not allow» names (`host`, or `host:port` when the operator's links name a port other than
   443 — the warning does not show the port; ask the operator). If the operator sends only call links (variant B), its host must also enter the Mini App's link allow-list (a
   frontend change).

**For the next packages:**
- WP-47 listens to `ContactDisclosed` (user id, number, channel) for the action log; WP-85 adds the origin.
- WP-50 extends `TelegramClient`: one attempt now, no `retry_after` handling, a `true` result refused (methods that
  return `true` need a variant); `call()`'s `$params` and `result()`'s `$response` are sensitive frames already. The
  base address still accepts a host with a trailing dot and an IPv6 literal (`https://[::1]:8081`) outside `local`;
  WP-50 may narrow it.
- WP-53 (the bot's «Показать номер») calls `ContactService::disclose()` with the channel `bot` and needs its own access
  check: `AccessGate::decide()` can write a seat admission, so `disclose()` makes no gate call.
- WP-85/86: the spec's paragraph naming `contact()` / `NativeContact::read()` as step 1 now maps to `hasContact()`.
- A place for a quota flag of a user without an `access_grants` row needs a migration (the developer's approval).
- The functional checklist: in variant B «Позвонить» and «Показать номер» open the operator's page (no digits).
- Product owner: the share message's button labels («Открыть объявление» / «Eʼlonni ochish» / «Open the listing») and
  the bold title.
