# WP-85 — Contact requests: native service and the owner's answers

| Field | Value |
| ----- | ----- |
| Stage | C |
| Status | TODO |
| Depends on | WP-84, WP-43 |
| Size | about 2 400 changed lines with tests, L |
| Behaviour reference | `02` BR-API-179 … BR-API-187; `08` API-047 … API-049, API-054; `03` BR-APP-090, BR-APP-098, BR-APP-099, LB-APP-076; `16` SEC-039, SEC-REQ-053; `09` DEV-060 |
| Needs from the production track | Approval of the migrations `contact_requests`, `owner_seeker_blocks` (the per-owner seeker blocks) and `request_blocks`. Env keys `REQUEST_LIMIT_DAY`, `REQUEST_LIMIT_WEEK`, `REQUEST_PAUSE_MINUTES`, `REQUEST_EXPIRE_HOURS` blank (defaults), through a shared-file PR |

## Goal

A seeker's request on a native owner listing is stored, limited and answered: the owner sees it in «Отклики» with
the seeker's first name and answers it, the answer can be undone for ten minutes, an unanswered request expires,
and a let flat closes its requests. The card of a native listing shows its request state to that seeker only, and a
`given` request lets that seeker, and only that seeker, ask for the number through the counted contact method.

## Scope

In:

- `contact_requests`, `owner_seeker_blocks` and `request_blocks` with their models and factories.
- The real body of `POST /listings/{number}/contact-request` for native numbers (WP-80 fixes its contract), with the
  seeker's first name from verified launch data.
- The limits (a day, a week, the pause after several in a row) as `429 rate_limited` with a `reason`; the global
  block (`requests_blocked`) and the per-owner block after `reason_agent` or `late`.
- The owner's side: `GET /owner/listings/{id}/requests`, `POST /owner/requests/{id}/answer` with the ten-minute undo
  window, «Оказался риелтором» within seven days; `owner.pending` of `GET /me`; the request counts of the owner
  listing's `stats`; `owner.response_minutes`.
- Expiry, and one new request after it (DEV-060); `rented` cancels the pending requests.
- The overlay part of the card: `contact.request` and, for a `request`-mode listing, `contact.has_phone`, on every
  number; `owner.mine` and `owner.listing_id` on every native number.
- The rule inside `ContactService::disclose()` (WP-43, "Contact: two variants, one shape"): a `request`-mode listing
  gives its number only to a seeker whose request is `given`; that disclosure is counted and never refused. The one
  implementation of a native number's disclosure, `NativeContact`.
- The events `ContactRequested`, `RequestAnswered`, `RequestDeclined`, `RequestsCancelledByRent`, `RequestExpired`,
  with no listener until WP-89.
- Erasure entries (as seeker and as owner), the retention rule and the erasure of the request texts 90 days after a
  request closed; the leak protections of WP-84 extended to `contact_requests`.

Out:

- The relay of a request on a legacy `gate` listing — WP-87; until it lands such a request answers `409
  request_closed` (WP-80) and the card shows `contact.mode: hidden` (DEC-75).
- Every bot message: the request to the owner, his answers in the chat, the soft refusal, the «flat let» notice, the
  expiry notice and «📞 Показать номер» — WP-89.
- The screens: the request sheet and the CTA states (WP-83), «Отклики» and the red dot (WP-82).

## Decisions that bind this package

- DEC-52: the number reaches a seeker only through `POST /listings/{number}/contact` after a tap; a `given` request
  makes that method answer, it never puts the number on the card or into a chat unasked.
- DEC-70: native requests are stored in HOMI's own tables, next to the native listings of WP-84.
- DEC-74: DEV-060 (one new request after `expired`, not after `declined`) and DEV-059 (the request tip leads to the
  requests; the client's part, served by `owner.pending`) are on without flags.
- DEC-76: the owner sees the seeker's Telegram first name, read from the signed launch data at the time of the
  request, stored with the request and erased with it; nothing else of the seeker is shown. SEC-039 and SEC-REQ-053
  apply.
- DEC-85: a seeker whom an owner closed his flats to (`reason_agent`, `late`: an `owner_seeker_blocks` row) learns
  it only from `409 request_closed` on that owner's other listings, the same answer as for a let flat, as legacy
  answers `closed` (BR-API-181, BR-API-185); recorded for WP-70's review.
- DEC-19 (open): the thresholds of the disclosure quota are not decided. A `given` number is counted by the quota and
  never refused by it (integrator default 23 of the owner-cabinet plan).
- SEC-REQ-003 names the v1 sign-in as the only body that accepts `initData`. By DEC-76 and the default below the
  request method is a second one: JSON body only, never a query or a header, it issues no token, does not touch the
  exchange counter of sign-in, and logs only the fingerprint. Its verification window never changes the exchange
  window of sign-in (SEC-REQ-002): a value accepted here is not accepted by `POST /auth/telegram` after that
  method's own window. The raw value stays out of Telescope (WP-84, "Leak protections") and of the Mini App's logs,
  error reports and analytics (WP-83). The security review of WP-70 records it.
- *Integrator defaults, listed for the reviewer* (the owner-cabinet plan's defaults, not decisions of the developer;
  listed in that PR):
  - the request limits answer `429 rate_limited` with `reason` `requests_fast`, `requests_day` or `requests_week` and
    `Retry-After`, following WP-10's one-code-per-limit rule;
  - the first name of DEC-76: the Mini App sends the current launch's `initData` with the request; the server verifies
    it with WP-40's verifier (window = the session's lifetime, same user as the token) and keeps `first_name` only;
  - the request lifecycle (integrator default 13): expiry after 48 h (configuration); the soft refusal at the end of
    the 10-minute undo window; «Оказался риелтором» for 7 days after `given`;
  - a `given` number counts against the disclosure quota of DEC-19 and is never refused by it (integrator default
    23);
  - the request texts (`seeker_first_name`, `message`, `move_in`) are erased 90 days after the request closed; the
    row keeps its status and times for the owner's stats;
  - while `config('owner.public')` is false (`OWNER_LISTINGS_PUBLIC`, WP-86) the seeker's side of every native number
    is closed: the request method answers `409 request_closed` and the disclosure `404 contact_unavailable`; the
    owner's cabinet and his answers to requests already open keep working, and a number given meanwhile is disclosed
    once the switch is on again (integrator default 31);
  - defaults of this specification: `undo` returns the previous answer; the pause (`requests_fast`) follows three
    requests within ten minutes (`owner.limits.requests.burst`), because legacy's texts say only «несколько
    подряд»; a day is the Tashkent calendar day and a week the last seven times 24 hours; the counts come from
    `contact_requests`, not from a cache entry; a listing takes at most 30 new requests a Tashkent day
    (`owner.limits.requests.per_listing_day`), then `409 request_closed`; the global block is an operator command
    (`requests:block`), because HOMI has no rule for legacy's `blocked` and `harvest` (Q-API-089);
    `response_minutes` is the median answer time of the owner's last 20 answers, `null` below three; a request on a
    listing that was removed or withdrawn is left to expire; the first name is normalised before it is stored
    ("The seeker's first name").
- `agent` shows to the seeker as `declined`: legacy behaviour (BR-APP-098), not a default.

## Design

The request method and the owner's request methods keep the routes, form requests and resources of WP-80 and get
real bodies; the stub bodies move into `NativeStubs` (WP-40, "Stub mode for the end-to-end suite"). Services live in
`App\Services\Requests`; models in `App\Models`. Every owner query is scoped to the caller through the owner listing
(`OwnerListing::query()->whereBelongsTo($user)`), so another user's request id answers `404 not_found`.

### Tables

| Table | Columns | Notes |
| ----- | ------- | ----- |
| `contact_requests` | `id` (ULID); `owner_listing_id` (foreign key to `owner_listings`, cascade); `listing_number` (`unsignedBigInteger`); `seeker_id`, `owner_id` (foreign keys to `users`, cascade); `who` (string 16); `people` (smallint); `move_in` (string 32, nullable); `message` (string 500, nullable); `seeker_first_name` (string 64, nullable); `status` (string 16); `reason` (`found`, `agent`, `late`, nullable); `previous_status` (string 16, nullable); `agent_marked` (boolean, default false); `answered_at`, `undo_until`, `late_until`, `expires_at`, `closed_at`, `texts_erased_at` (`timestampTz`, nullable); `consent_version` (string 16, nullable: `config('owner.consent_version')` when the request was sent); timestamps | index (`owner_listing_id`, `created_at`); index (`seeker_id`, `listing_number`, `created_at`); index (`seeker_id`, `created_at`) for the limits; index (`status`, `expires_at`); on PostgreSQL a partial unique index on (`seeker_id`, `listing_number`) where `status <> 'expired'` |
| `owner_seeker_blocks` | `owner_id`, `seeker_id` (foreign keys to `users`, cascade); `reason` (`agent`, `late`); `created_at` | primary key (`owner_id`, `seeker_id`) |
| `request_blocks` | `user_id` (primary key, foreign key, cascade); `reason` (string 64); `by` (string 64); `system_user` (string 64: `SUDO_USER`, else the process owner); `created_at` | the global block of `requests_blocked` |

`php artisan make:model ContactRequest --factory --migration` and the same for `OwnerSeekerBlock` and `RequestBlock`
(the latter two with migrations only and factories). `ContactRequest` uses `HasUlids`; `message`, `move_in` and
`seeker_first_name` are in `$hidden`, which keeps them out of `toArray()` only. The leak protections of WP-84
("Leak protections") already name `contact_requests` and `ContactRequest`: Telescope records no request, job, query
or model entry of them and hides `init_data`, `message` and `move_in`; a `QueryException` on the table becomes
`PersonalDataWriteFailed`, and every write of this package runs through `PersonalWrites::run()`.

### Creating a request (`ContactRequestService`)

`create(User $seeker, int $number, RequestForm $form, string $initData): ContactRequestResult` — behind the
controller of WP-80 for a native number (`ListingNumber::isNative()`); a legacy number goes to WP-87's relay, which
answers `409 request_closed` until it exists. In this order, before anything is written:

1. The owner listing by number; none → `404 not_found`. While `config('owner.public')` is false (WP-86) a native
   number answers `RequestClosed` (`409 request_closed`) here, before steps 2 and 3 (integrator default 31).
2. The caller's own listing → `OwnListing` (`409 own_listing`).
3. `contact_mode: phone` → `ContactOpen` (`409 contact_open`).
4. The listing is not `active`, or it is `held` or `withdrawn`, or its owner blocked this seeker
   (`owner_seeker_blocks`), or it already took `owner.limits.requests.per_listing_day` (30) new requests this Tashkent
   day → `RequestClosed` (`409 request_closed`); the seeker is not told why.
5. The caller's existing request on this listing whose status is not `expired` → that request's status, `200`
   (a repeat creates nothing; after `declined` the answer is `declined`; the seeker form of `agent` is `declined`).
6. `request_blocks` holds the caller → `RequestsBlocked` (`403 requests_blocked`).
7. `RequestLimiter::check($seeker)` → `RequestLimitReached` (`429 rate_limited`, `reason`, `Retry-After`).
8. `ChatReachability::canWrite($seeker)` of WP-45 false → `NoChat` (`409 no_chat`): the owner's answer reaches the
   seeker only through the bot (BR-API-186), so the check runs always; the client asks for write access and repeats
   once (BR-API-184).
9. `SeekerFirstName::from($initData, $seeker)` (below); a failure → `422 validation_failed` naming `init_data`.
10. One transaction under a lock on (`seeker_id`, `listing_number`): insert `pending` with `expires_at = now +
    owner.requests.expire_hours`; `RequestLimiter::hit($seeker)`; after commit `ContactRequested` (request id). Answer
    `201` with `{status: "pending"}`.

A request after `expired` is a new row (DEV-060); the expired one stays for the owner's list.

### The seeker's first name (`SeekerFirstName`)

`from(string $raw, User $seeker): ?string`:

1. `TelegramInitDataVerifier::verify($raw, $window)` of WP-40 ("Verifier"), with `$window` the lifetime of a
   session token (24 hours, `docs/api/README.md`, "Session"); `InvalidInitData` or `InitDataExpired` → the `422`
   above. This window serves the request only; the exchange window of `POST /auth/telegram` stays its own.
2. `telegramUserId` of the result must equal `$seeker->telegram_user_id`; another user → the `422`.
3. Only after the verification, the `user` pair of the raw value is decoded once more and its `first_name` read —
   never `last_name`, `username` or `photo_url`. Verify the field name against the Bot API documentation
   (`WebAppUser`). The name is normalised: Unicode NFC; control, format (`Cf`: bidi marks and overrides,
   zero-width characters) and private-use characters removed; runs of whitespace collapsed to one space; trimmed;
   cut at 64 characters. Absent or empty after that → `null`.

The name goes into `contact_requests.seeker_first_name` and nowhere else: neither `users` nor `TelegramInitData`
holds it (WP-40, "Verifier"), it is not logged, and the raw `init_data` is never stored, logged or echoed (logs carry
the fingerprint only, SEC-REQ-003). The owner's request object shows it as `name`.

### Limits (`RequestLimiter`)

| Reason | Rule | `Retry-After` |
| ------ | ---- | ------------- |
| `requests_fast` | `owner.limits.requests.burst` (3) requests within `pause_minutes` (10) | until the oldest of them is `pause_minutes` old |
| `requests_day` | `day` (10) requests in the current day in Asia/Tashkent | until the next Tashkent midnight |
| `requests_week` | `week` (30) requests in the last 7 × 24 hours | until the oldest of them leaves the window |

- The counts come from `contact_requests` (the `created_at` of the seeker's rows of the last seven days, through the
  index (`seeker_id`, `created_at`)), so a flushed or evicted cache never resets a seeker's day or week. The cache
  only memoises them: one entry per seeker, `requests:<user id>`, read and written through the `Cache` facade under
  `Cache::lock`, as the disclosure quota of WP-43 does ("Disclosure quota"), because the tests and CI run on the
  `array` store; `hit()` forgets it after a new row. WP-87 stores its relayed requests in the same table, so one
  count serves both (Q-API-089 asks whether legacy counts per person or per key).
- `check()` tests the three rules in the order of the table and throws the first that applies. A database or cache
  that cannot answer fails closed with `503 source_unavailable`, logged once; never a `500`.
- Per listing: at most `owner.limits.requests.per_listing_day` (30) new requests a Tashkent day reach one listing
  (step 4 of "Creating a request"), so a crowd of fresh accounts cannot flood one owner.
- When one seeker has been marked `agent` or `late` by three different owners within 30 days, the service logs one
  `warning` with his user id (an alert input of WP-70's monitoring); it never blocks him by itself.
- `config/owner.php`: `limits.requests.day` ← `REQUEST_LIMIT_DAY` (10), `week` ← `REQUEST_LIMIT_WEEK` (30),
  `pause_minutes` ← `REQUEST_PAUSE_MINUTES` (10), `burst` (3, new), `per_listing_day` (30, new); `GET /reference`
  serves `day`, `week` and `pause_minutes` (WP-80), so the sheet's texts follow the configuration (fix of LB-APP-057
  for the request limits).
- Global block: `php artisan requests:block {user} --reason= --by=` and `requests:unblock {user} --by=`, logged with
  who and the system user (`request_blocks.system_user`); legacy's `blocked` and `harvest` both become
  `requests_blocked` (BR-API-185).

### The owner's answers (`RequestAnswers`)

`answer(User $owner, string $requestId, OwnerRequestAction $action): ContactRequest`, under a row lock:

| Action | Allowed when | Result |
| ------ | ------------ | ------ |
| `give` | `pending` | `given`; `answered_at`, `undo_until` = now + `owner.requests.undo_minutes` (10), `late_until` = now + `owner.requests.late_days` (7); `RequestAnswered` |
| `decline` | `pending` | `declined`; `undo_until` = now + 10 min; `FinalizeDecline` is queued for `undo_until`; `RequestAnswered` |
| `reason_found` | `declined`, no reason yet | `reason: found`; status stays `declined` |
| `reason_agent` | `pending`, or `declined` with no reason | `agent`, `reason: agent`, `agent_marked: true`; an `owner_seeker_blocks` row |
| `late` | `given` and now < `late_until` | `agent`, `reason: late`, `agent_marked: true`; an `owner_seeker_blocks` row |
| `undo` | now < `undo_until` of the last `give` or `decline` | the previous answer (`previous_status`, `pending` today); `reason` cleared; `undo_until` cleared |

Anything else, and a request that changed since the owner's list was read, → `RequestAnswerClosed` (`409
request_answer_closed`). The flags of the owner request object: `can_undo` = now < `undo_until`; `can_reason` =
`declined` without a reason; `can_late` = `given` and now < `late_until`. Answers work while the cabinet switch is off
(DEC-81).

- `FinalizeDecline` (queue `default`, delayed to `undo_until`): when the request is still `declined`, it dispatches
  `RequestDeclined` (request id, reason) — WP-89 sends the soft refusal with a few similar listings on it
  (BR-API-181, `UNVERIFIED` in legacy; the content is WP-89's). After an undo it does nothing.
- `RequestAnswered` (request id, action) is dispatched after commit for every action; WP-89 tells the seeker on
  `give` (with «📞 Показать номер», which discloses through `ContactService`, DEC-52).
- `agent` appears to the seeker as `declined` (BR-APP-098); his later requests on this owner's listings answer `409
  request_closed` (DEC-85).

### Expiry and the let flat

- `php artisan requests:expire`, scheduled every five minutes (`onOneServer`): every `pending` request with
  `expires_at` in the past becomes `expired` with `closed_at`; one `RequestExpired` (request id) per row. Legacy's own
  expiry is unknown (Q-API-075); 48 hours is this package's default, `owner.requests.expire_hours` ←
  `REQUEST_EXPIRE_HOURS`.
- A listener on `OwnerListingRented` (WP-84) sets every `pending` request of that listing to `cancelled` with
  `closed_at` and dispatches `RequestsCancelledByRent` (listing id, or `null` for a relayed request of WP-87; request
  ids) — WP-89 tells the waiting seekers that the flat is let (BR-API-176). `given` requests stay `given`.
- A paused, held, removed or withdrawn listing takes no new request (step 4) and its pending requests run to expiry.

### What the owner sees

- `GET /owner/listings/{id}/requests`: the requests of that listing, newest first, in the cursor form of the personal
  lists (WP-13, "Favourites and history"), 20 a page; each as the owner request object of WP-80, with `name` =
  `seeker_first_name` and the flags computed at read.
- `owner.pending` of `GET /me`: the number of `pending` requests on the caller's owner listings, one indexed count;
  the client reads it on launch with `GET /me`, so no separate call runs for every user (fix of LB-APP-066;
  BR-API-179). `App\Services\Requests\RequestCounts` also gives WP-84's `OwnerStats` the listing's `pending`,
  `requests` (all) and `given`.
- `owner.response_minutes` of the card: `ResponseTime::forOwner(User): ?int`, the median of `answered_at −
  created_at` in minutes over the owner's last 20 answered requests (`give`, `decline`, `reason_agent`), `null` below
  three; cached per owner for ten minutes. WP-86's presenter reads it; its display in hours and days is WP-83's.

### The card and the disclosure

- `App\Services\Requests\RequestStates::forUser(User $user, list<int> $numbers): array<int, ContactRequestState>` —
  the caller's latest request per listing number, native or legacy (the relayed rows of WP-87 are in the same
  table), mapped to the seeker form (`agent` → `declined`) with `sent_at` = `created_at`. The overlay of WP-42
  ("Overlay") writes `contact.request` from it for every card and, for a `request`-mode listing, sets
  `contact.has_phone` to `true` only when that state is `given`. The same overlay step writes `owner.mine` (the
  number is one of the caller's owner listings, WP-84) and `owner.listing_id` (that listing's ULID, else `null`) for
  every native number. Like `favorite` and `viewed`, the per-user part is never cached with the card, and while
  `sources.native_stubs` is on the fixed values of the fixtures stay.
- `ContactService::disclose()` of WP-43 gains one rule before its step 1: for a listing whose `contact.mode` is
  `request`, the caller's request must be `given`, else `404 contact_unavailable`; a `hidden` listing always answers
  it. A disclosure on a `given` request is recorded by `ContactDisclosure::record()` (counted against the quota of
  DEC-19) and skips the refusal of `decide()` (never refused by it; integrator default 23). `ContactDisclosed` gains
  `origin` (`legacy` or `native`). A `phone`-mode native listing is disclosed like any listing, under the quota.
- A native number's disclosure has one implementation: `App\Services\Requests\NativeContact::read(int $number):
  ListingContact` — WP-84's `OwnerListing::phoneForDisclosure()` of an `active` listing that is not `held` or
  `withdrawn`, while `config('owner.public')` is true (WP-86; integrator default 31), in the shape of variant A
  (HOMI's call link, WP-43), else `ContactUnavailable`. It is the only caller of `phoneForDisclosure()`.
  `ContactService::disclose()` takes step 1 from it for `ListingNumber::isNative()` numbers instead of
  `ListingSource::contact()`; WP-86's merged source answers `ContactUnavailable` for a native number and reads the
  number nowhere.

### Events

`App\Events\Requests\{ContactRequested, RequestAnswered, RequestDeclined, RequestsCancelledByRent, RequestExpired}`:
ids and the action or reason only — no name, no message, no number. They are dispatched after commit and have no
listener until WP-89, which sends the bot's messages as paced jobs with its own ledger `bot_notices` (WP-89, "Notices
— how a cabinet message leaves the bot"; not the radar outbox).

### The scenarios of WP-80 in real code

Each request scenario of the stub has a real condition that produces the same answer, so the end-to-end suite of
WP-83 and the tests here describe one behaviour:

| Stub scenario or number | Real condition |
| ----------------------- | -------------- |
| `10000001` → `201 pending` | an `active` native listing in `request` mode, no request of the caller |
| `10000002` … `10000004` → `200` with the status | the caller's request exists (`pending`, `given`, `declined`) |
| `10000005` → `201 pending` | the caller's only request is `expired` (DEV-060) |
| `10000006`, `request_closed` | the listing is `rented`, paused, held, removed or withdrawn, or its owner blocked the caller |
| `10000007`, `contact_open` | `contact_mode: phone` |
| `10000008`, `own_listing` | the caller's own listing |
| `no_chat` | `users.bot_chat_state` is not `active` |
| `request_limit_fast`, `request_limit_day`, `request_limit_week` | the three rules of "Limits" |
| `requests_blocked` | a `request_blocks` row |
| `100024` → `409 request_closed`; `relay_on` | a legacy number: WP-87 |
| `request_answer_closed` (answer) | an action outside the table of "The owner's answers" |

### Controllers

- `ListingContactRequestController` routes by number: `ListingNumber::isNative()` → `ContactRequestService::create()`;
  a legacy number → WP-87's relay when it is bound, else `RequestClosed`. It answers `ContactRequestResultResource`
  with `201` or `200` through `sourced()`: `meta.source = native` for a native number; WP-86 and WP-87 give a legacy
  number its driver.
- `OwnerRequestController@index` reads the owner listing scoped to the caller, then its requests with
  `ListPersonalRequest`'s cursor and limit; `@answer` reads the request through the caller's owner listings and calls
  `RequestAnswers::answer()`.
- `MeController` adds `RequestCounts::pendingFor($user)` to the `owner` object of WP-84's `OwnerSummary`.
- The form request `StoreContactRequestRequest` of WP-80 is unchanged: the verification of `init_data` happens in
  the service, after the listing's checks, so a request on a closed listing never costs a verification.

### Configuration

`backend/config/owner.php` (WP-80, extended by WP-84) gains here: `limits.requests.day`, `.week` and
`.pause_minutes` read from their env keys, `limits.requests.burst` (3), `limits.requests.per_listing_day` (30),
`requests.expire_hours` (← `REQUEST_EXPIRE_HOURS`, 48), `requests.undo_minutes` (10), `requests.late_days` (7),
`requests.response_sample` (20), `requests.response_minimum` (3) and `requests.texts_retention_days` (90);
`consent_version` is WP-84's. Every value is a default of this package or of the plan; changing one is a
configuration change.

### Erasure and retention

- `config/erasure.php` (WP-47, "Erasure — the service the bot calls"): `contact_requests` by `seeker_id` and by
  `owner_id` (strategy `delete`, before `owner_listings` and `users`), `owner_seeker_blocks` by `owner_id` and by
  `seeker_id`, `request_blocks` by `user_id`; the cache key `requests:<user id>` joins the keys forgotten after
  commit. The foreign keys cascade as well, so a listing deleted by its owner takes its requests with it.
- `config/retention.php` (WP-47, "Retention"): `contact_requests` go with their owner listing; when WP-84's purge
  erases a listing 90 days after it left the feed, its requests are deleted in the same run. Before that,
  `requests:prune-texts` (daily, registered as the executor) sets `seeker_first_name`, `message` and `move_in` to
  `null` and `texts_erased_at` 90 days (`owner.requests.texts_retention_days`) after a request closed (`closed_at`,
  else `answered_at`); the row keeps its status and times for the owner's stats. `owner_seeker_blocks` and
  `request_blocks` are kept while both users exist.
- WP-89's `SeekerNoticeEraser` is registered before the `contact_requests` entry: while a seeker's requests still
  exist it edits every sent `request_new` notice about them to a text without his name and message (WP-89,
  "Configuration, erasure, retention"). This entry therefore stays after it in `config/erasure.php`, and
  `requests:prune-texts` leaves sent notices to WP-89's retention of `bot_notices`.

## Files

- Three migrations; `backend/app/Models/{ContactRequest,OwnerSeekerBlock,RequestBlock}.php` with factories and seeders
- `backend/app/Services/Requests/{ContactRequestService,ContactRequestResult,RequestForm,SeekerFirstName,RequestLimiter,RequestAnswers,RequestStates,RequestCounts,ResponseTime,NativeContact}.php`
- `backend/app/Jobs/Requests/FinalizeDecline.php`; `backend/app/Listeners/Requests/CancelRequestsOnRent.php`
  (discovered, not registered by hand)
- `backend/app/Events/Requests/{ContactRequested,RequestAnswered,RequestDeclined,RequestsCancelledByRent,RequestExpired}.php`
- `backend/app/Console/Commands/Requests/{ExpireRequests,PruneRequestTexts,BlockRequests,UnblockRequests}.php`;
  `backend/routes/console.php` (the schedules of `requests:expire` and `requests:prune-texts`)
- Real bodies: `backend/app/Http/Controllers/Api/V1/Listings/ListingContactRequestController.php`,
  `backend/app/Http/Controllers/Api/V1/Owner/OwnerRequestController.php` (WP-80), `MeController.php`; the stub bodies
  into `backend/app/Services/Sources/Stub/NativeStubs.php` (WP-40)
- Created by earlier packages and changed here: `backend/app/Services/Listings/{ContactService,ListingOverlay}.php`
  (WP-43, WP-42), `backend/app/Events/Listings/ContactDisclosed.php` (WP-43), `backend/app/Services/Owner/OwnerStats.php`
  (WP-84)
- `backend/config/owner.php` (WP-80), `backend/config/{erasure,retention}.php` (WP-47)
- `backend/tests/Feature/Requests/{CreateRequestTest,SeekerFirstNameTest,RequestLimiterTest,RequestAnswersTest,ExpiryTest,RentCancelsTest,RequestStatesTest,DisclosureTest,ResponseTimeTest,RequestErasureTest,RequestTextsRetentionTest,RequestLeakTest}.php`,
  `backend/tests/Feature/Api/V1/Owner/RequestIdorTest.php`, `backend/tests/Pgsql/Requests/OneOpenRequestRaceTest.php`
- `backend/.env.example` (the four `REQUEST_*` keys, blank), `docs/infrastructure/environments.md` — separate
  shared-file PR

## Steps

1. Read `02` BR-API-179 … BR-API-187, `03` BR-APP-090, BR-APP-098, BR-APP-099 and WP-80 again; take no rule from
   legacy that this specification does not name.
2. The shared-file PR for the four env keys.
3. Migrations and models; the Pgsql race test of one open request (`concurrently()` of `tests/Pest.php`).
4. `SeekerFirstName` with tests built by `InitDataSigner` of WP-40 (a valid value, another user, an expired one, no
   `first_name`).
5. `RequestLimiter` with time-travel tests; the two block commands.
6. `ContactRequestService` and the controller body of the request method; its scenarios of WP-80 now answered by
   real code.
7. `RequestAnswers`, `FinalizeDecline`, the owner's list and answer controllers; the IDOR rows.
8. `requests:expire` and its schedule; the listener on `OwnerListingRented`.
9. `RequestStates`, `owner.mine` and `owner.listing_id` in the overlay; `NativeContact` and the rule in
   `ContactService::disclose()`; `ContactDisclosed` with `origin`.
10. `RequestCounts` in `GET /me` and in `OwnerStats`; `ResponseTime`.
11. Erasure and retention entries, `requests:prune-texts`; the registry tests pass.
12. Pint, PHPStan, `make ci-backend`, `make test-pgsql`; the PR names the migrations and the env keys.

## Behaviour to reproduce

- The pending count is always a number and is known on every launch (BR-API-179); here it travels in `GET /me` (fix
  of LB-APP-066).
- The owner's list per listing: the seeker's Telegram name, `who`, `people`, `move_in`, `message`, the status and the
  flags by which the server decides which answers remain (BR-API-180; the name's storage in legacy is unknown,
  Q-API-077).
- The actions `give`, `decline`, `reason_found`, `reason_agent`, `undo` and `late`; `409` when an action is no longer
  possible; the soft refusal ten minutes after a decline, which is also the undo window; a realtor mark closes this
  owner's flats to the seeker (BR-API-181, `UNVERIFIED`; BR-APP-090).
- A request needs `who`; `people` 1 … 20; `move_in` 32 and `message` 500 characters (BR-API-183; BR-APP-099).
- `no_chat` before anything is created (BR-API-184).
- The refusals `limit_fast`, `limit_day`, `limit_week`, `blocked`, `harvest`, `closed`, `own`, `open` (BR-API-185)
  become `rate_limited` with a `reason`, `requests_blocked`, `request_closed`, `own_listing` and `contact_open`.
- The statuses `pending`, `given`, `declined`, `agent`, `expired`, `cancelled`; the seeker reads his on his own card
  only, and `agent` looks like `declined` (BR-API-186; BR-APP-098).
- After `given` the seeker gets the number from the contact method (BR-API-187; fix of LB-APP-074 with DEC-52).
- After `expired` one new request is allowed, after `declined` none (DEV-060, fix of LB-APP-076).

## Tests

- Create: a valid request → `201 pending`, one row, `ContactRequested` once; a repeat → `200 pending`, no new row;
  after `declined` → `200 declined`; after `agent` → `200 declined`; after `expired` → `201 pending`, a second row;
  the caller's own listing → `409 own_listing`; `phone` mode → `409 contact_open`; a paused, held, removed or
  withdrawn listing, an owner who blocked the seeker, and the thirty-first request of a Tashkent day on one listing
  (from 31 seekers) → `409 request_closed`; a legacy number → `409
  request_closed`; an unknown number → `404`; `bot_chat_state` `never` → `409 no_chat` and no row; a blocked seeker →
  `403 requests_blocked`.
- First name: a value signed for the seeker → the name stored; signed for another user, expired, with a bad hash, or
  over 4 096 bytes → `422` naming `init_data`, no row; without `first_name` → `null`; a name of 80 characters → 64;
  a name with a right-to-left override, a zero-width space and a private-use character is stored without them; a
  name of spaces only → `null`; the `users` row and every log line of the test hold no name and no `init_data` (a
  scan of the test's log output).
- Limits (time travel, Asia/Tashkent): the third request within ten minutes → `429` with `reason: requests_fast` and
  the right `Retry-After`; the eleventh of a day → `requests_day`, allowed again after Tashkent midnight; the
  thirty-first of a week → `requests_week`; the counter is shared with a second `hit()` from another caller of the
  class; after `Cache::flush()` the eleventh request of the day is still refused; a cache store that throws → `503`;
  three owners marking one seeker `agent` within 30 days → one `warning`, no block.
- Answers: each row of the table from each allowed state, and every other combination → `409
  request_answer_closed`; `undo` at 9 min 59 s works, at 10 min 1 s does not; `late` at day 6 works, at day 8 does
  not; `FinalizeDecline` dispatches `RequestDeclined` when the request is still declined and nothing after an undo;
  `reason_agent` creates the block and the seeker's next request on another listing of that owner → `409
  request_closed`.
- Expiry (time travel): a request at 47 h 59 min stays `pending`, at 48 h 1 min becomes `expired` with one
  `RequestExpired`; the command is idempotent.
- Rent: `OwnerListingRented` cancels the two pending requests, leaves the `given` one, dispatches one
  `RequestsCancelledByRent`.
- Card: `contact.request` shows the caller's own state only (user B sees `null` on A's request), on a native and on a
  legacy number; `agent` reads `declined`; `contact.has_phone` is `true` only with a `given` request on a
  `request`-mode listing; `owner.mine` and `owner.listing_id` are set for the owner's own native listing only.
- Disclosure: a `request`-mode listing without a `given` request → `404 contact_unavailable`; with one → the number
  through variant A, counted by the quota and answered above the soft limit; a `hidden` listing → `404`; a held or
  withdrawn native listing → `404 contact_unavailable`; `ContactDisclosed` carries `origin`; `NativeContact` is the
  only caller of `phoneForDisclosure()` (`PhoneLeakTest` of WP-84).
- Public switch: with `owner.public` false a request on an `active` native listing → `409 request_closed` and no row
  (a `phone`-mode one too, never `contact_open`); the disclosure of a `phone`-mode native listing and of a `given`
  request → `404 contact_unavailable`; the owner's answer to a pending request works; back to true, the given number
  is disclosed.
- `GET /me`: `owner.pending` counts pending requests of the caller's listings only. `ResponseTime`: two answers →
  `null`; five answers → their median in minutes.
- IDOR (`RequestIdorTest`): the list and the answer with another owner's listing or request id → `404`, nothing
  changes.
- Erasure: erasing a seeker deletes his requests and their names; erasing an owner deletes the requests on his
  listings and his blocks; `ErasureRegistryTest` passes with the new `owner_id` and `seeker_id` columns. Texts
  (`RequestTextsRetentionTest`, time travel): 90 days − 1 s after a request closed its name, message and `move_in`
  stay, at + 1 s they are `null` and the status and times stay; an open request keeps them.
- Leak (SEC-REQ-053): after a request, an answer and an expiry, no log line, job payload, analytics event, Telescope
  entry (WP-84's `TelescopeRedactionTest` configuration) or forced `QueryException` holds the message, `move_in`,
  the first name or `init_data`.
- Pgsql: two concurrent requests of one seeker on one listing create one row.

## Acceptance checklist

- [ ] Every request scenario of WP-80 answers from native code locally and in CI, with `meta.source = native`.
- [ ] A repeat answers the current status; a new request is possible only after `expired`.
- [ ] The three limits answer `429 rate_limited` with their `reason` and a correct `Retry-After`, counted from the
      table; a listing takes at most 30 new requests a day.
- [ ] The owner sees the seeker's first name and the form's answers, nothing else; the name exists only in
      `contact_requests`, normalised, and is erased 90 days after the request closed, or with the request, the
      listing or either user.
- [ ] `undo` works for ten minutes; the decline becomes final after it; «Оказался риелтором» works for seven days
      after `given` and closes that owner's flats to the seeker.
- [ ] An unanswered request expires after 48 hours; «Сдано» cancels the pending requests.
- [ ] The card shows the caller's own request state only; the number of a native listing comes only from the
      contact method through `NativeContact`, and in `request` mode only after `given`, counted and never refused by
      the quota.
- [ ] The five events are dispatched with ids only.
- [ ] `owner.pending` of `GET /me` is correct; no separate pending call exists.
- [ ] The migrations and the env keys are named in the PR; `make ci-backend` and `make test-pgsql` are green.

## Handoff

Empty.
