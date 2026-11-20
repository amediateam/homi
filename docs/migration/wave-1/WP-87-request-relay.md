# WP-87 — Relay of requests on legacy `gate` listings

| Field | Value |
| ----- | ----- |
| Stage | C |
| Status | WAITING (operator, points 14 – 21 of the addendum) |
| Depends on | WP-85, WP-41, WP-50 (`BotMetrics`, the metrics of this package) |
| Size | about 1 500 changed lines with tests, M |
| Behaviour reference | `08` API-054; `02` BR-API-183 … BR-API-189; `24` §8.2 (Q-API-075 … Q-API-078, Q-API-087 … Q-API-089, Q-SEC-021); `decisions/2026-11-14-operator-request.md` points 14 – 21; `16` SEC-039, SEC-REQ-053 |
| Needs from the production track | After the operator's answer: (1) the scope of the service key for the write route, as the operator grants it; (2) if the operator chooses a callback, an nginx location for it on the API host (described under "Outcome channel"), and `LEGACY_RELAY_CALLBACK_SECRET` in the server env (random, at least 32 bytes, per environment, shared with the operator; on a rotation the old value goes to `LEGACY_RELAY_CALLBACK_SECRET_PREVIOUS` for 24 hours, then is removed); (3) `LEGACY_RELAY_ID_KEY` (random, at least 32 bytes, per environment, in the password manager, never rotated without a plan: a new key gives every user a new identity on the operator's side); (4) approval of one additive migration of `contact_requests`; (5) `LEGACY_RELAY_ENABLED=true` only after the legal gate of `25` §5 (gate 1) and the product owner's go, on staging first |

## Goal

A HOMI seeker's request on a legacy owner listing in `gate` mode reaches the owner through the operator (DEC-71),
and its outcome reaches the seeker through HOMI's bot. The request is the same sheet and the same method as on a
HOMI owner listing (`POST /listings/{number}/contact-request`, WP-80); HOMI stores it in WP-85's table, counts it
against the same limits, and turns every outcome it learns into WP-85's events, so the bot's messages of WP-89 work
unchanged. Until the relay is switched on, such a listing shows the neutral bar of DEC-75.

## Scope

In:

- The legacy side of the request method: `LegacyRequestRelay`, bound behind WP-85's request controller for a legacy
  number (WP-85, "Controllers").
- The per-user identity that the operator receives instead of a Telegram id (`RelayIdentity`).
- The error mapping of BR-API-185 onto the codes of WP-80.
- The outcome channel the operator chooses (point 16): a per-user card read, a callback, or a status read by id —
  written below as three alternatives; the package implements the one the operator names.
- `given` → `contact.has_phone: true` for that seeker, and the disclosure through `ContactService::disclose()` of
  WP-43 with the identity of the caller.
- The payload: the first name (with every relayed request, DEC-76; left out only if the operator refuses to receive
  it, point 15) and the four answers of the form (SEC-REQ-053).
- One limit counter per seeker shared with native requests (WP-85's limiter).
- `contact.mode` of such listings: `hidden` while the relay is off, `request` once it is on (DEC-75, item 3).
- Erasure: relayed requests leave with the seeker's data; a deletion notice to the operator when point 15 offers one.
- The switch `LEGACY_RELAY_ENABLED` (item 14) and the metrics of the relay.

Out:

- Everything native: requests on HOMI owner listings, their answers and expiry — WP-85.
- The bot's messages to the seeker (given, soft refusal, the flat let, expiry) — WP-89; it reads the events this
  package dispatches. The owner of a legacy listing gets nothing from HOMI's bot: he is legacy's user.
- The request sheet and the CTA states in the Mini App — WP-83 (on stubs with `100024` and the scenario `relay_on`).
- Reports of a realtor: HOMI's reports and votes are its own and are not relayed (DEC-48).
- What the operator builds on its side.

## Decisions that bind this package

- DEC-71: a seeker's request on a legacy owner listing in `gate` mode is relayed to the operator through the service
  key. Planned now, the operator asked in parallel (points 14 – 21); until the relay works, DEC-75 applies.
- DEC-75: while the relay does not work — or if the operator refuses it — such a listing is shown in the feed and on
  the map, and its card has no contact action and a neutral bar (WP-42, WP-83). This package is the only place that
  changes `hidden` into `request`.
- DEC-76: the seeker's Telegram first name is read from the signed launch data at the time of the request and stored
  with the request (WP-85); it goes to the operator with every relayed request. `relay.send_first_name` is switched
  off only if the operator refuses to receive it in its answer to point 15.
- DEC-48: reports and votes are HOMI's; nothing of them reaches legacy.
- DEC-33, DEC-42: the service key exists only in the server env of staging and production; tests and local runs use
  the fixture server of WP-41.
- DEC-52: no number is stored or pushed by this package; the seeker gets it only through `POST
  /listings/{number}/contact` or «📞 Показать номер», both through `ContactService::disclose()`.
- Q-SEC-021 (gate 1 of `25` §5): the relay passes a HOMI user's data to the operator; the switch stays off on
  production until the legal basis and the privacy text name it (WP-56, WP-61, WP-70).
- *Integrator defaults, listed for the reviewer:* item 2 (the request limits answer `429 rate_limited` with `reason`
  `requests_fast`, `requests_day` or `requests_week` and `Retry-After`), item 3 (`contact.mode: hidden` while the
  relay is off), item 7 (the first name from verified launch data), item 14 (the relay's own switch
  `LEGACY_RELAY_ENABLED`, off by default). That the seeker sees an `agent` answer as `declined` is legacy's behaviour
  (BR-APP-098), not a default. Defaults of this specification, in the same list: the identity is an HMAC of HOMI's
  user id with `LEGACY_RELAY_ID_KEY`; relayed requests live in `contact_requests` with an empty owner; HOMI never
  expires a relayed request by its own clock; legacy's `no_chat` is a contract error; the number of a `given` relayed
  request is read per disclosure and never stored; the callback of alternative B is signed over a timestamp and the
  body, carries an event id, is applied only in event order and has its own limiter (60 a minute per source address);
  the callback secret is at least 32 bytes and a previous one is accepted for 24 hours during a rotation; without an
  outcome channel (point 16 (d)) the relay is not built and the package stays `WAITING`.

## Design

Where this text names a class, method or event of WP-41, WP-42, WP-43, WP-45 or WP-85, the specification of that
package is authoritative for the name. If it differs, use its name and do not create a second one.

### What the operator's answers decide

| Point | Question (`decisions/2026-11-14-operator-request.md`) | What it fixes here |
| ----- | ------------------------------------------------------ | ------------------ |
| 14 | the write route under the service key; the answer in place of `no_chat` | `relay.path`, the scope of the key, the error table |
| 15 | the per-user identity, the name, the legal basis, retention, erasure | `relay.identity.*`, `relay.send_first_name`, `relay.erasure.path` |
| 16 | the outcome channel, the number on `given`, the statuses, expiry, a new request after `expired` or `declined` | the alternative of "Outcome channel"; the status table |
| 17 | what the owner sees; how a realtor is reported | nothing in code: a HOMI seeker reports through HOMI's votes (DEC-48) |
| 18 | limits per person or per key; a total cap of the key | the error table; the alert on `legacy_relay_blocked_total` |
| 19 | `blocked` and `harvest` | the error table; the alert |
| 20 | the owner fields in service reads | WP-42's translator (`owner_self`, `contact_mode`); a missing field keeps the listing `hidden` |
| 21 | change notice; the final privacy text | the contract tests below; the privacy texts of WP-56 and WP-61 |

Each answer changes configuration values or one alternative below; nothing else in the design waits for it.

### Configuration (`backend/config/legacy.php`, keys `relay.*`)

| Key | Env | Default | Meaning |
| --- | --- | ------- | ------- |
| `relay.enabled` | `LEGACY_RELAY_ENABLED` | `false` | the switch (item 14) |
| `relay.path` | — | `/api/listings/{id}/contact` | the write route (API-054; point 14) |
| `relay.identity.header` | — | `X-Homi-User` | header that carries the identity (point 15) |
| `relay.identity.key` | `LEGACY_RELAY_ID_KEY` | empty | empty ⇒ the relay is unavailable, whatever `enabled` says |
| `relay.send_first_name` | — | `true` | send the first name (DEC-76); set to `false` only if the operator refuses it (point 15) |
| `relay.first_name_field` | — | `name` | its body field |
| `relay.outcome` | — | `card` | `card`, `callback` or `status` (point 16) |
| `relay.poll.interval_minutes`, `relay.poll.max_hours`, `relay.poll.max_per_minute` | — | 15, 72, 30 | alternatives A and C |
| `relay.callback.secret` | `LEGACY_RELAY_CALLBACK_SECRET` | empty | alternative B; empty ⇒ the route answers `404`; at least 32 bytes (`security:check`, WP-70) |
| `relay.callback.previous_secret` | `LEGACY_RELAY_CALLBACK_SECRET_PREVIOUS` | empty | alternative B; also accepted during a rotation, removed after 24 hours |
| `relay.callback.max_skew_seconds`, `relay.callback.per_minute` | — | 300, 60 | alternative B: the accepted age of a timestamp; the limiter per source address |
| `relay.status.path` | — | `null` | alternative C |
| `relay.erasure.path` | — | `null` | the operator's deletion route, if any (point 15) |

`App\Services\Sources\Legacy\RelaySwitch::on(): bool` — `relay.enabled` and a non-empty identity key. Everything below
asks it; nothing else reads the two keys.

### `contact.mode` of a legacy self-placed listing

WP-42's translator maps legacy's self fields to `owner {}` and `contact.mode` (WP-42, "Design"): a listing with
`owner_self: true` and `contact_mode: gate` and no phone becomes `hidden`. This package changes that one rule: while
`RelaySwitch::on()` it becomes `request`. A listing whose service read lacks `owner_self` or `contact_mode` (point
20) stays as WP-42 maps it. The card cache holds the shared part only, so the switch takes effect within the cache
lifetime of a card (60 s).

### Sending (`App\Services\Sources\Legacy\LegacyRequestRelay`)

`send(User $seeker, int $number, RequestForm $form, string $initData): ContactRequestResult` — the same contract as
WP-85's native service (its specification is authoritative for the names of the form and the result). In this
order, before anything is sent:

1. `RelaySwitch::on()` false → `RequestClosed` (`409 request_closed`).
2. The card of WP-42 (cached shared part): not found → `404 not_found`; its `contact.mode` is not `request` →
   `RequestClosed`; `contact.has_phone` true → `ContactOpen` (`409 contact_open`).
3. The caller's request on this number whose status is not `expired` → that status, `200`; nothing is sent again
   (one open request per user and listing, WP-80).
4. `request_blocks` holds the caller → `RequestsBlocked` (`403 requests_blocked`).
5. WP-85's limiter `check()` → `RequestLimitReached` (`429 rate_limited`, `reason`, `Retry-After`): one counter for
   native and relayed requests.
6. `ChatReachability::canWrite()` (WP-45) false → `NoChat` (`409 no_chat`): the outcome reaches the seeker only
   through HOMI's bot; the client asks for write access and repeats once (BR-API-184).
7. The first name through WP-85's verification of `init_data` (WP-85, "The seeker's first name"); a failure →
   `422 validation_failed` naming `init_data`.
8. Insert the row (below) with `status: pending`, `relay_state: sending`; commit.
9. `LegacyClient::post(relay.path, body, call)` (WP-41, "`LegacyClient`"): the body `{who, people, move_in, message}`
   and the first name under `relay.first_name_field` (left out only while `relay.send_first_name` is off); the header
   `relay.identity.header: RelayIdentity::for($seeker)`; `LegacyCall` with `background: false` and the detail codes of
   the error table, so the client returns them as `LegacyDetailError` instead of its generic mapping. No retry (WP-41
   never retries a `POST`).
10. Success → `relay_state: sent`, `relay_ref` from the answer when the operator returns a request id
    (alternative C), the limiter's `hit()`, and WP-85's `ContactRequested` after commit; answer `201 {status:
    "pending"}` (or the status legacy answered, mapped by the status table). Failure → the row is deleted and the
    error is mapped.

A row left in `sending` by a crash between steps 8 and 10 is shown to the seeker as `pending`. `php artisan
relay:reconcile` (every ten minutes) settles one older than ten minutes: under alternatives A and C it becomes
`relay_state: sent`, and the next poll learns whether the operator has it; under B, where HOMI cannot ask, it is
deleted, and the seeker can send again. Nothing is logged of the body; a log line carries the request id, the
listing number, the result code and the first 8 hex of the identity.

### Error mapping (BR-API-185, BR-API-184)

Legacy's HTTP statuses for these codes are not documented, so the relay reads `detail` first, whatever the status.

| Legacy `detail` | v1 answer | Note |
| --------------- | --------- | ---- |
| `limit_fast` | `429 rate_limited`, `reason: requests_fast`, `Retry-After` from legacy, else the value WP-85's limiter gives for that reason | item 2 |
| `limit_day` | `429 rate_limited`, `reason: requests_day`, `Retry-After` as above | item 2 |
| `limit_week` | `429 rate_limited`, `reason: requests_week`, `Retry-After` as above | item 2 |
| `blocked`, `harvest` | `403 requests_blocked` | one answer for both, because legacy's texts show one text for both; `legacy_relay_blocked_total` + 1 |
| `closed` | `409 request_closed` | |
| `own` | `409 own_listing` | a HOMI user who placed the listing in legacy |
| `open` | `409 contact_open` | the client reads the card again |
| `no_chat` | `503 source_unavailable` | a contract error: HOMI checked its own chat in step 6, and legacy's check of its own bot's chat cannot apply (point 14) |
| a `422` (array `detail`) | `503 source_unavailable` | HOMI validated first, so this is drift (WP-41) |
| anything else, timeout | `503 source_unavailable` | WP-41's mapping and breaker |

The detail codes do not count as breaker failures. `legacy_relay_blocked_total` reaching five in an hour, across
users, fires one `critical` log line "the relay may be blocked for the key" (an alert input of WP-70; Q-API-089).

### Storage (an additive migration of WP-85's `contact_requests`)

- `owner_listing_id` and `owner_id` become nullable: a relayed request has no owner in HOMI.
- New columns: `channel` (string 8, default `native`; `relay` for this package; named apart from the card's
  `origin`, whose values are `legacy` and `native`), `relay_ref` (string 64, nullable,
  unique), `relay_state` (string 8: `sending`, `sent`, `final`; nullable), `relay_checked_at` (`timestampTz`,
  nullable).
- A relayed row has `expires_at: null`: WP-85's `requests:expire` selects rows with `expires_at` in the past, so it
  never expires a relayed request by HOMI's clock; only the operator's answer moves it (Q-API-088).
- The owner-side reads of WP-85 (the owner's list, `owner.pending`, the response time) select through owner
  listings and never see a relayed row. WP-89's owner-side messages skip a request without an owner.

### Outcome channel (point 16) — three alternatives

All three end in `App\Services\Sources\Legacy\RelayOutcome::apply(ContactRequest $request, string $legacyStatus,
?string $at)`, under a row lock:

| Legacy status (BR-API-186) | Row | Event of WP-85 (after commit) |
| -------------------------- | --- | ----------------------------- |
| `pending` | unchanged | none |
| `given` | `given`, `answered_at` | `RequestAnswered` (action `give`) |
| `declined` | `declined`, `answered_at` | `RequestAnswered` (action `decline`), then `RequestDeclined` |
| `agent` | `agent`, `reason: agent`, `agent_marked: true`, `answered_at` (the seeker sees `declined`, BR-APP-098, legacy) | `RequestAnswered` (action `reason_agent`), then `RequestDeclined` |
| `expired` | `expired`, `closed_at` | `RequestExpired` |
| `cancelled` | `cancelled`, `closed_at` | `RequestsCancelledByRent` (with this request; it has no owner listing) |
| any other | unchanged; one contract-error log line | none |

A final status sets `relay_state: final` and ends the polling of that row. A status that goes back (legacy's undo within
its window, `declined` → `pending`, Q-API-088) restores `pending` without an event, and only from a status time newer
than the one the row last applied (under B also a new event id), so a replayed or late `given` never re-opens a
disclosure the owner withdrew. Legacy's own soft refusal and its own «Квартиру сдали» message go to legacy's bot users;
a HOMI seeker gets WP-89's messages from these events. While `RelaySwitch::on()` is false nothing new is sent, but the
chosen channel keeps applying the statuses of rows already sent (A and C keep polling them, B keeps accepting
callbacks), so a seeker still learns the answer.

**A — per-user card read** (point 16 (a)). `App\Jobs\Relay\PollRelayedRequest`, queue `default`, unique per request:
every `relay.poll.interval_minutes` for each row with `relay_state: sent`, at most `relay.poll.max_per_minute` per
minute (`relay:poll`, scheduled every minute with `onOneServer()`), `GET /api/listings/{id}` with the identity
header, `background: true` (the background share of WP-41's limiter), never through the card cache (the answer is
per user). It reads `my_request` (BR-API-186). Each poll is a card read: if the daily limit of opened listings counts
the key (Q-API-080, point 24), the poll would use up the users' budget, so this alternative is built only with the
operator's answer to point 24, and with `preview=1` if the operator says the preview carries `my_request`. Polling
stops at a final status or after `relay.poll.max_hours`; then the row stays `pending` for the seeker, and its card
shows the state as WP-83 draws it.

**B — callback** (point 16 (b)). `POST /api/internal/legacy/relay` in `backend/routes/api.php`, outside the `v1`
group and its `auth:sanctum` middleware (as WP-70's `internal/metrics`, "Requests to the production track"):
`App\Http\Controllers\Internal\LegacyRelayCallbackController`. The header `X-Homi-Timestamp` carries Unix seconds
and `X-Homi-Signature` the hex HMAC-SHA-256 of `"<timestamp>.<raw body>"` with `LEGACY_RELAY_CALLBACK_SECRET` (or,
during a rotation, `LEGACY_RELAY_CALLBACK_SECRET_PREVIOUS`), compared with `hash_equals` before the body is decoded;
a missing or wrong signature, or a timestamp more than `relay.callback.max_skew_seconds` (300) from the server
clock → `403`; an empty secret → `404`. The body names the request by `relay_ref`, or by the listing number and the
identity, and carries an event id, the status and its time. An event id already applied, or a status time not newer
than the row's last applied one, answers `204` and changes nothing. The route has its own limiter,
`relay.callback.per_minute` (60) per source address, besides the nginx allow-list. The operator's field names are
configuration. Request to the production track:

```nginx
location = /api/internal/legacy/relay {          # on the API host of each environment
    limit_except POST { deny all; }
    allow <the operator's addresses>; deny all;   # from the operator's answer
    client_max_body_size 16k;
    access_log off;                                # the body names a user's request
    # PHP as in the host's dashboard location (infra/<env>/nginx/api.*.conf):
    fastcgi_pass  unix:/run/php/php8.5-fpm.sock;
    include       fastcgi_params;
    fastcgi_param SCRIPT_FILENAME $realpath_root/index.php;
    fastcgi_param SCRIPT_NAME     /index.php;
    fastcgi_param DOCUMENT_ROOT   $realpath_root;
    fastcgi_param HTTPS           on;
}
```

**C — status read by id** (point 16 (c)). The create answer returns the operator's request id, stored as
`relay_ref`; `PollRelayedRequest` reads `relay.status.path` with that id instead of the card, on the schedule of A,
with the identity header if the operator requires it.

**D — no outcome channel** (point 16 (d)). The relay is not built: a request would stay `pending` for ever. The
package stays `WAITING`, the listings keep the neutral bar of DEC-75, and RK-35 records it.

### `given` and the disclosure

- `contact.has_phone` of a `request`-mode card is `true` only for the seeker whose request is `given`: the overlay
  writes it from WP-85's request states for every number, legacy ones included (WP-85, "The card and the
  disclosure").
- HOMI never stores a legacy owner's number. `ContactService::disclose()` (WP-43) reaches
  `LegacyListingSource::contact()`; for a number on which the caller has a `given` relayed request, this package
  makes that call send the caller's identity header, so the operator answers the number or the call link for that
  user (variant A or B of WP-43, decided per answer as today). The disclosure is counted against the quota of
  DEC-19 and never refused by it (WP-85's rule, item 23 of the plan's defaults; DEC-19 itself is open).
- A callback that carries a number (alternative B) is not stored: only its status is applied, and the number is read
  at the disclosure.

### Identity (`App\Services\Sources\Legacy\RelayIdentity`)

`for(User $user): string` — the first 32 hex of HMAC-SHA-256 of `"relay|<user id>"` with `LEGACY_RELAY_ID_KEY`:
stable per HOMI user, opaque, not the Telegram id (point 15 proposes exactly this). It is never logged in full (the
first 8 hex at most), never stored (it is recomputed), and never sent anywhere but to the operator. A user who
erases his data and returns is a new user with a new identity.

### Erasure (WP-47, "Erasure — the service the bot calls")

- The seeker's relayed rows go with WP-85's registry entry for `contact_requests`.
- `config/erasure.php` gains, before that entry, `legacy_relay` — strategy `custom`,
  `App\Services\Sources\Legacy\RelayEraser`: it computes the identity and collects the `relay_ref` values while the
  user still exists, and queues `App\Jobs\Relay\NotifyLegacyOfErasure` (identity and refs only; retried like WP-47's
  PostHog deletion) when `relay.erasure.path` is set; it deletes nothing itself.
- `config/retention.php`: `contact_requests` keeps WP-85's rule; a final relayed row is kept as long as a native one.

### Metrics

Through `BotMetrics` of WP-50 (the counters every package writes, read by WP-70's `GET /api/internal/metrics`;
hence WP-50 under "Depends on"), no user id as a label: `legacy_relay_total{result}` (each code of the error table
and `sent`), `legacy_relay_outcome_total{status}`, `legacy_relay_blocked_total`, `legacy_relay_poll_total{result}`,
`legacy_relay_callback_total{result}`.

### Observability

The relay's values stay out of the observability tools as the owner's number does (WP-84 ships those filters, and the
staging switch-on waits for them, `25` §5 gate 5): the callback path is not recorded by Telescope; the legacy client's
relay calls and the per-user card reads of alternative A, which carry the identity header and, after `given`, a number,
are not recorded with their bodies (the client-request watcher ignores the legacy API host, which every call of WP-41
reaches with the service key anyway); a failed call is reported with its detail code and status only, never with the
response body.

## Files

- `backend/app/Services/Sources/Legacy/{LegacyRequestRelay,RelaySwitch,RelayIdentity,RelayOutcome,RelayEraser,LegacyDetailError}.php`
- `backend/app/Services/Sources/Legacy/{LegacyClient,LegacyCall,LegacyListingSource}.php` (WP-41, WP-42: the detail
  codes, the identity header on `contact()`)
- `backend/app/Services/Sources/Legacy/Translators/ListingDetailsTranslator.php` and `ListingSummaryTranslator.php`
  (WP-42: `hidden` → `request` with the switch)
- `backend/app/Jobs/Relay/{PollRelayedRequest,NotifyLegacyOfErasure}.php`
- `backend/app/Console/Commands/Relay/{PollCommand,ReconcileCommand}.php` (`relay:poll`, `relay:reconcile`)
- `backend/app/Http/Controllers/Internal/LegacyRelayCallbackController.php`, its route in `backend/routes/api.php`
  and its limiter `legacy-relay-callback` beside the others in `backend/app/Providers/AppServiceProvider.php`
  (alternative B only)
- `backend/app/Http/Controllers/Api/V1/Listings/ListingContactRequestController.php` (WP-80, WP-85: the binding of
  the relay for a legacy number)
- `backend/database/migrations/<date>_add_relay_columns_to_contact_requests_table.php`
- `backend/config/legacy.php` (`relay.*`), `backend/config/erasure.php`, `backend/routes/console.php`
- `backend/resources/fixtures/legacy/relay/*.json` (the operator's answers, recorded; until then synthetic, named
  `*.draft.json`)
- `backend/.env.example` (`LEGACY_RELAY_ENABLED`, `LEGACY_RELAY_ID_KEY`, `LEGACY_RELAY_CALLBACK_SECRET`,
  `LEGACY_RELAY_CALLBACK_SECRET_PREVIOUS`, blank) —
  separate shared-file PR, with `docs/infrastructure/environments.md`
- Tests: `backend/tests/Unit/Sources/Legacy/{RelayIdentityTest,RelayOutcomeTest}.php`;
  `backend/tests/Feature/Relay/{RelaySendTest,RelayErrorMappingTest,RelaySwitchTest,RelayLimitSharedTest,RelayOutcomeCardTest,RelayCallbackTest,RelayStatusReadTest,RelayDisclosureTest,RelayErasureTest,RelayLeakTest}.php`
  (only the files of the chosen alternative among the three outcome tests)

## Steps

Generators always with `--no-interaction`; tests first inside each step; Pint after every PHP edit.

1. Wait for the operator's written answer to points 14 – 21 (the status `WAITING` of the queue). Record it in
   `decisions/2026-11-14-operator-request.md` (Answers table) and choose the alternative of "Outcome channel"; if
   the answer is (d) or a refusal, close this package as not built and say so in the PR of the queue row.
2. Record fixtures of every answer the operator documents (success, each detail code, each status, the callback
   body); sanitise them; extend `LegacyFakeServer`.
3. `RelaySwitch`, `RelayIdentity` with their unit tests; the configuration; the env PR.
4. The detail codes in `LegacyClient` and `LegacyDetailError`; `RelayErrorMappingTest`.
5. The migration; `LegacyRequestRelay::send()`; the binding in the request controller; `RelaySendTest`,
   `RelayLimitSharedTest`.
6. The translator rule `hidden` → `request`; `RelaySwitchTest`.
7. `RelayOutcome` and the chosen alternative (poll job and commands, or the callback route, or the status read);
   its test; `relay:reconcile`.
8. The identity header on `contact()`; `RelayDisclosureTest`.
9. `RelayEraser`, `NotifyLegacyOfErasure`, the registry entry; `RelayErasureTest`; `RelayLeakTest`.
10. `make ci-backend`; review by the `security-reviewer` agent (a user's data passed to a third party, the callback
    route); PR; deploy with the switch off; the nginx request in the PR text; the checklist on staging with the
    operator's test account.

## Behaviour to reproduce

- The request carries `who` (`one`, `couple`, `family`, `students`, `friends`, required), `people` 1 … 20, `move_in`
  at most 32 characters and `message` at most 500, both nullable (BR-API-183); HOMI validates them before the
  operator sees anything (WP-80's form request).
- `409 no_chat` is answered before a request is created, and the client asks for write access and repeats once
  (BR-API-184): here the chat is HOMI's bot's.
- The refusals of BR-API-185 reach the seeker as the codes of WP-80, so the sheet of WP-83 shows the same texts for a
  relayed and a native request.
- The statuses of BR-API-186; the seeker never sees `agent` (BR-APP-098).
- After `given` the seeker can call: legacy expects `phone` on the seeker's card (BR-API-187); HOMI gives it only
  through the counted contact method (DEC-52).
- The card fields of a self-placed legacy listing (BR-API-188) come from the service read if the operator sends them
  (point 20, Q-API-078); the owner label prefix the server writes (BR-API-189, `inferred`) is WP-42's to drop.
- What legacy does on its side — what the owner sees of a HOMI request, its expiry time, whether a user may ask again
  after `declined` (Q-API-075 … Q-API-077, Q-API-087 … Q-API-089) — is the operator's; HOMI applies the statuses it
  receives and adds no rule of its own on a relayed request.

## Tests

Pest with `Http::preventStrayRequests()`; the legacy side through `LegacyFakeServer` with the fixtures of step 2;
time frozen with `travelTo` in Asia/Tashkent.

| # | Test | Cases |
| - | ---- | ----- |
| 1 | `RelayIdentityTest` (unit) | the same user → the same 32 hex; two users → different values; no digit run of the Telegram id; an empty key → the switch is off |
| 2 | `RelaySendTest` | a `request`-mode legacy card → one `POST` to `relay.path` with exactly `who`, `people`, `move_in`, `message` and the identity header, `201 pending`, one row `channel: relay`, `ContactRequested`; by default the first name is added under its field, with `relay.send_first_name` off it is absent; a repeat → the current status, no second `POST`; `has_phone` true → `409 contact_open`, nothing sent; a legacy failure → the row deleted, `503` |
| 3 | `RelayErrorMappingTest` | each row of the error table, under three HTTP statuses (`400`, `409`, `429`) → the listed v1 answer; the detail codes do not open the breaker; five `blocked` in an hour → one `critical` line |
| 4 | `RelaySwitchTest` | switch off → `contact.mode: hidden` on the card of a self-placed `gate` listing, the request answers `409 request_closed`, no `POST`; switch on and key set → `request`; switch on and key empty → off |
| 5 | `RelayLimitSharedTest` | nine native requests and one relayed in a Tashkent day → the eleventh, of either kind, `429 rate_limited` with `reason: requests_day` and `Retry-After`; the relayed request counts only after legacy accepted it |
| 6 | `RelayOutcomeCardTest` (alternative A) | the poll reads the card with the identity header in the background share, never from the card cache; `given` → `RequestAnswered` once; `declined` → `RequestAnswered` and `RequestDeclined`; `agent` → the seeker form `declined`; `expired`, `cancelled`; a final status stops the poll; `max_hours` stops it; at most `max_per_minute` reads a minute |
| 7 | `RelayCallbackTest` (alternative B) | a correct signature → `204` and the status applied; wrong or missing → `403`, nothing applied; a timestamp 301 s old → `403`; the previous secret during a rotation → accepted; secret empty → `404`; the same body twice → applied once; an old `given` replayed after the row went back to `pending` → not applied; a body naming another user's request through a forged identity → nothing applied; the 61st call in a minute from one address → `429` |
| 8 | `RelayStatusReadTest` (alternative C) | `relay_ref` stored from the create answer; the status read applies each status as in test 6 |
| 9 | `RelayDisclosureTest` | after `given`, `POST /listings/{number}/contact` of that seeker reaches legacy with his identity header and answers the number or the link; another seeker → `404 contact_unavailable`; nothing of the number is stored in any table |
| 10 | `RelayErasureTest` | «Удалить мои данные» of a seeker with two relayed requests → the rows gone; with `relay.erasure.path` one queued notice carrying the identity and the two refs only; without it none |
| 11 | `RelayLeakTest` | after a send, a poll, a callback and a disclosure, the logs, `failed_jobs`, the Horizon payloads and `telescope_entries` (Telescope on with its configuration of WP-84, as in WP-84's leak test) hold no request text, no first name, no full identity and no digit run of a number; a failed legacy call leaves no response body in the exception message (SEC-REQ-053) |

## Acceptance checklist

- [ ] The operator's answer to points 14 – 21 is recorded in the log, and the chosen alternative is named in the PR.
- [ ] With the switch off (the default), every self-placed `gate` listing shows the neutral bar of DEC-75 and no
      request reaches the operator.
- [ ] Every request the relay sends holds exactly the four answers, the identity and the first name (left out only
      if the operator refused it, point 15).
- [ ] Every refusal of legacy reaches the seeker as the code of WP-80; `no_chat` of legacy is logged as a contract
      error.
- [ ] One limit counter covers native and relayed requests.
- [ ] `given`, `declined`, `expired` and `cancelled` of a relayed request each produce WP-85's event once.
- [ ] No legacy owner's number is stored by HOMI; a `given` seeker gets it only through the counted contact method.
- [ ] Erasure removes the seeker's relayed requests and, where the operator offers it, tells the operator.
- [ ] The nginx location (alternative B) and the four env keys are in the PR description; the migration is named.
- [ ] On staging, with the switch on, the operator's test account and the product owner's approval: a test seeker's
      request on a legacy `gate` listing reaches the owner, and its outcome is applied to the row and raises WP-85's
      event; the number is given only through `POST /listings/{number}/contact`. That the outcome reaches the seeker
      in HOMI's bot is checked in WP-89's checklist, once both packages are merged.
- [ ] The switch stays off on production until gate 1 of `25` §5 is closed.
- [ ] `make ci-backend` is green; the security review is recorded in the PR.

## Handoff

Empty.
