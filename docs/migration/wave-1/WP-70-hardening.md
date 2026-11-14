# WP-70 — Hardening: security, performance, monitoring, legal texts

| Field | Value |
| ----- | ----- |
| Stage | F |
| Status | TODO |
| Depends on | WP-48, WP-58, WP-61 |
| Size | about 2 000 changed lines, M: tests, scans, three small commands, one endpoint, documents |
| Behaviour reference | `16` §3 (findings), §4 (SEC-REQ-001 … SEC-REQ-050), §5 (test plan), §6.1; `25` §2 rule 7, §3.9, §3.10, §9, §14 item 7; `24` §8.2 (Q-SEC-021), §8.3 (RK-25, RK-27); `17` §12 (signals); task files KV-QA-015, KV-QA-016, KV-QA-017, KV-QA-020, KV-QA-022, KV-INF-004, KV-INF-011, KV-INF-012, KV-INF-013, KV-INF-025, KV-INF-026 |
| Needs from the production track | Every item of "Requests to the production track" in "Design": (1) scrape `GET /api/internal/metrics` and arm the alert rules of the table; (2) the scheduler heartbeat check; (3) PostgreSQL backups with point-in-time recovery, nothing older than 14 days, a timed restore drill; (4) nginx: the header set per host, no second CSP header, access logs without query strings on `api.*`, `app.*`, `hook.*`; framing of `app.*` by Telegram Web allowed; (5) `TELESCOPE_ENABLED=false` on production, a review of the basic-auth users of the dashboard locations (the gate exists: nginx basic auth plus `App\Http\DashboardAccess`), `METRICS_TOKEN` and `METRICS_ALLOWED_IPS` in the server env; (6) run `php artisan security:check` after every change of a server env file and send the output (names only); (7) confirm the log retention of each log on the servers. No migration |

## Goal

Before the product is announced, every security requirement that applies to it is tied to a test or a recorded
check; no secret, `initData`, token, phone or message text can be found in a log, a failed job, an analytics event
or a client bundle; the limits, the budgets and the alerts have numbers; backups keep the promise of the privacy
text; and the privacy page and the bot's `/privacy` text say what HOMI really does.

## Scope

In:

- The security checklist over the fifty requirements of `16` and the tests or checks it still lacks.
- A log redaction processor, the leak scans, the secret scan in CI, `security:check`.
- The header and CSP checks for the Mini App and the landing; the CORS test.
- The limiter matrix, the IDOR matrix and their tests.
- Performance measurements against budgets.
- The metrics endpoint the alerts read; the requests to the production track for monitoring, alerting and backups.
- The final legal texts in three languages, in the bot catalogue and on the landing.
- The dependency audit.

Out:

- Fixing a finding inside another package's feature: it goes to that package as a small PR; this package records it.
- Servers, alert rules, backup jobs, nginx — the production track; this package states what is needed and checks the
  result from outside.
- The admin panel and its sign-in (not in Wave 1); a penetration test by a third party (product owner's decision).
- The launch itself — WP-71.

## Decisions that bind this package

| # | Decision | Consequence here |
| - | -------- | ---------------- |
| 1 | `25` §14 item 7 | The wave is done only when the checks of this package pass and no `initData`, token or phone appears in logs or analytics; the leak scans are the proof |
| 2 | DEC-40 — a new product with its own users | Requirements written for taking over the legacy bot, its token, its routes and its data are marked "not applicable" or "changed" with the reason; nothing is silently dropped |
| 3 | DEC-33, DEC-42 | The legacy service key is a secret of the servers only; the scans cover it |
| 4 | DEC-44, `25` §3.4, §3.10 | The Mini App session is a partitioned cookie or an in-memory token; its CSP is nonce-based in `proxy.ts`; the landing's policy has no nonce (WP-61) |
| 5 | DEC-13, Q-SEC-021 (open) | The legal basis, the operator's name and the hosting statement come from the product owner with a lawyer. Without them the texts stay marked "pending legal review" and WP-71 cannot declare the launch |
| 6 | DEC-47 | PostHog checks run against HOMI's own projects |
| 7 | DEC-49, `docs/handoff/parallel-work.md` §4 | No new dependency: scans are scripts in the repository; a dedicated scanner or a load-test tool is proposed, not installed |
| 8 | DEC-45 | Checks that need a server are run on staging first, then repeated on production read-only |

## Design

### Security checklist

"Where" names the package that implements the requirement; "Check" is what this package runs or adds. A requirement
without a passing check keeps the package open. Status: A = applies as written, C = applies in a changed form,
N = not applicable to the new product.

| # | Requirement in short | Id | Status | Where | Check |
| - | -------------------- | -- | ------ | ----- | ----- |
| 1 | One `initData` verifier | SEC-REQ-001 | C — one sign-in method, no legacy `tma` guard | WP-40 | verifier tests: forged hash, another bot's token, missing field |
| 2 | `auth_date` window | SEC-REQ-002 | A | WP-40 | expired `initData` → `401`; value from config |
| 3 | Replay containment of `initData` | SEC-REQ-003 | C — sent once in the body of the sign-in call; removed from the address before analytics | WP-21, WP-40 | Playwright: no `initData` in the address, storage or any request except sign-in; log scan |
| 4 | Tokens through Sanctum | SEC-REQ-004 | C — v1 only; tokens expire | WP-40 | expired and revoked token → `401`; abilities of the intake token do not open user routes |
| 5 | Status semantics | SEC-REQ-005 | C — the v1 envelope: `401`, `403` with a reason, `404` | WP-10, WP-40 | `AuthStatusMatrixTest` |
| 6 | Access gate everywhere | SEC-REQ-006 | A (mode open) | WP-40, WP-51 | a route-walking test: every protected route has the gate; the bot guard test with mode closed |
| 7 | Token never persisted in the client | SEC-REQ-007 | C — cookie `HttpOnly`, `Secure`, `SameSite=None`, `Partitioned`, or memory | WP-21 | Playwright: cookie attributes; `localStorage` and `sessionStorage` hold no token in both modes |
| 8 | Webhook authenticity | SEC-REQ-008 | A | WP-50 | existing tests; an external probe of `hook.*` without the secret → `403` on staging and production |
| 9 | `update_id` idempotency | SEC-REQ-009 | A | WP-50 | existing tests |
| 10 | Fast acknowledgement, isolation, per-user bot limits | SEC-REQ-010 | A | WP-50, WP-51 | acknowledgement time in the budget table; limiter matrix |
| 11 | Bot authorisation by `from.id` | SEC-REQ-011 | A | WP-51 … WP-56 | `BotForgeryTest` of WP-58 |
| 12 | Custody of the bot token | SEC-REQ-012 | C — HOMI never holds the legacy token; its own tokens are in the inventory with a rotation procedure | production track | secrets inventory; rotation steps reviewed |
| 13 | Token and secrets never logged | SEC-REQ-013 | A | WP-50, WP-41 | leak scans |
| 14 | Owner-scoped resolution | SEC-REQ-014 | A | WP-40, WP-44, WP-45, bot | IDOR matrix |
| 15 | Idempotent, race-safe writes | SEC-REQ-015 | A | WP-44, WP-45, WP-46 | the PostgreSQL race tests of those packages run in CI |
| 16 | Media ownership | SEC-REQ-016 | A | WP-00 | re-run; row in the IDOR matrix |
| 17 | One filter normaliser | SEC-REQ-017 | A | WP-12, WP-54 | arch test: only `SearchFiltersNormaliser` builds `SearchFilters` |
| 18 | Safe labels and display strings | SEC-REQ-018 | C — the strings come from legacy and are treated as text end to end | WP-42, WP-24 … WP-28 | injection corpus through the translators → rendered literally (Playwright) |
| 19 | Server-emitted addresses allow-listed | SEC-REQ-019 | A | WP-42, WP-43, WP-53 | translator test: `javascript:`, `http:`, foreign hosts dropped |
| 20 | Bot output encoding | SEC-REQ-020 | A | WP-51 | `BotInjectionTest` of WP-58 |
| 21 | Web output as text | SEC-REQ-021 | A | WP-20, WP-61 | lint rule: no `dangerouslySetInnerHTML` outside the JSON-LD component |
| 22 | Telemetry input limits | SEC-REQ-022 | A | WP-47 | body over 8 KB, unknown name, free-text property → rejected or dropped |
| 23 | Photo ingestion rules | SEC-REQ-023 | N — HOMI fetches no photos in Wave 1; the proxies have one fixed upstream | Wave 2 | nginx review: no variable in `proxy_pass` |
| 24 | Signed legacy media route | SEC-REQ-024 | N — legacy signs its own addresses; HOMI passes the query through | WP-42 | — |
| 25 | Erasure-compatible photo storage | SEC-REQ-025 | C — no stored copies; proxy cache of at most 24 hours | WP-42, WP-60 | nginx cache lifetimes confirmed by the production track |
| 26 | Call page and tokens | SEC-REQ-026 | C — a call link exists only in the answer of the counted contact method (DEC-52): HOMI's own page and token when the source gives the raw number, the source's link when it gives only that (WP-43) | WP-43 | the call-page and token tests of WP-43; no phone in logs or analytics after a contact (leak scan) |
| 27 | Limiters | SEC-REQ-027 | A | several | limiter matrix |
| 28 | Phone-disclosure quota | SEC-REQ-028 | C — counted on the contact method, the only place a number is given; beyond the soft limit it answers `contact_unavailable` instead of emptying card fields (DEC-52); thresholds are DEC-19 | WP-43 | quota test; alert input |
| 29 | Outbound Telegram pacing | SEC-REQ-029 | A | WP-57 | pacer tests; a 10 000-recipient run against the fake |
| 30 | CSP for the unchanged legacy Mini App | SEC-REQ-030 | N — not served by HOMI | — | — |
| 31 | CSP for the Mini App and the landing | SEC-REQ-031 | A | WP-21, WP-61 | header checks |
| 32 | CORS with explicit origins | SEC-REQ-032 | A — browsers call their own origin; the API allows no origin on servers | `backend/config/cors.php` | `CorsTest`; a cross-origin request from a foreign origin gets no allow header |
| 33 | Headers on every host | SEC-REQ-033 | A | nginx, apps | `scripts/security/check-headers.sh` on the five hosts of each environment |
| 34 | Secret inventory per environment | SEC-REQ-034 | A | production track | inventory below; `security:check` |
| 35 | Secret scanning | SEC-REQ-035 | A | this package | `scripts/security/scan-secrets.sh` in CI and as a documented pre-commit hook |
| 36 | Minimisation per field | SEC-REQ-036 | C — the user fields as written; the listing author's number is not stored by HOMI in Wave 1, never travels with a card, is masked in listing texts, and is returned only by the counted contact method after a tap (DEC-52) | WP-40, WP-50, WP-56; WP-12, WP-42, WP-43 | schema test: no name, username, phone or e-mail column in any user table; the card tests of WP-12, WP-42 and WP-48 find no raw number in a card answer of any driver; Playwright: no number in the page before a tap (WP-26) |
| 37 | Raw updates encrypted and redacted | SEC-REQ-037 | A | WP-50 | existing tests; a staging row decrypted by the production track holds no text |
| 38 | Retention, scheduled and tested | SEC-REQ-038 | C — action log 180 days, updates 14 days, LLM call log 180 days, vote details 180 days, backups 14 days; the rule for withdrawn listings does not apply (none stored) | WP-47, WP-50, WP-55 | `RetentionRegistryTest`; time-travel test per rule |
| 39 | Deletion on request | SEC-REQ-039 | A | WP-47, WP-56 | the database-wide scan after erasure |
| 40 | Rights of listing authors | SEC-REQ-040 | C — takedown by the operator command; the request is also passed to the service the listing comes from | WP-57, WP-44, WP-60 | staging drill: one listing withdrawn → cards edited, absent from feed, map, landing within an hour |
| 41 | Handling of the legacy dump | SEC-REQ-041 | N in Wave 1 — no data is migrated; the dump for Wave 2 is handled under this requirement then | Wave 2 | the repository and the developers' machines hold no dump (statement in the PR) |
| 42 | Masking before any LLM call | SEC-REQ-042 | A | WP-55 | existing tests |
| 43 | Prompt-injection containment | SEC-REQ-043 | A | WP-55 | existing tests |
| 44 | LLM quotas and audit | SEC-REQ-044 | A | WP-55 | existing tests; cap value set on servers |
| 45 | No public suspicion labels | SEC-REQ-045 | A | WP-44, WP-53, WP-60 | review of every label a user can see about another person |
| 46 | Operator access | SEC-REQ-046 | C — no admin panel; operator actions are server commands; a broadcast needs a token and the env switch; dashboards are gated | WP-57, this package | dashboards answer `403` to an ordinary user on staging and production |
| 47 | Logging without personal data | SEC-REQ-047 | A | all | redaction processor; leak scans |
| 48 | Monitoring and incident readiness | SEC-REQ-048 | A | production track, this package | each alert fired once on staging |
| 49 | Dependency audit in CI | SEC-REQ-049 | A | this package | CI steps |
| 50 | Legal readiness before real users | SEC-REQ-050 | A — earlier than planned (Q-SEC-021) | product owner, this package | legal texts section |

Counts: 32 apply as written, 14 apply in a changed form, 4 are not applicable (rows 23, 24, 30, 41).

### Logging without personal data

`App\Logging\RedactSecrets` — a Monolog processor added to every channel in `backend/config/logging.php` (a shared
file: its production-relevant part goes in a separate small PR). The `processors` key of a channel is read only by
the `monolog` driver (`LogManager::createMonologDriver`); the channels `single`, `daily`, `syslog` and `errorlog`
ignore it, so the processor is pushed by a `tap` class (`App\Logging\AddRedaction`, listed under `tap` of every
channel), and a test logs through each configured channel. It replaces values, in the message and the context,
that match:

| Kind | Pattern or key |
| ---- | -------------- |
| Bot token | the token shape, also inside a `api.telegram.org/bot…` address |
| `initData` | keys `initData`, `init_data`, `tgWebAppData`; a `hash=` with 64 hex characters next to `auth_date=` |
| Bearer tokens | `Authorization` values; the Sanctum token shape |
| Webhook secret, service key, the key of every provider in `config/ai.php` that has one, PostHog keys, metrics token | the configured values themselves, read at boot |
| Phones | the phone patterns of `PhoneMasker` (WP-12), the list `PiiMasker` of WP-55 shares |
| Contact and message payloads | keys `contact`, `text`, `caption`, `voice` under an update |

Where a value could leak, and the check for each channel:

| Channel | Risk | Check |
| ------- | ---- | ----- |
| Laravel log | exception messages with addresses or payloads | `LogLeakTest`: drive sign-in, a webhook with a contact, a legacy call that fails, an LLM failure, an erasure; grep the log for the seeded token, `initData`, phone and phrase |
| Failed jobs | serialised job payloads | `FailedJobLeakTest`: fail each queued job class once; scan `failed_jobs.payload` and `exception` |
| Telescope | request and job recordings | off on production (`TELESCOPE_ENABLED=false`); on staging the watchers hide `Authorization`, cookies and the update body; test of the hidden-parameter list |
| Pulse, Horizon | job names and tags | tags are ids only; a test asserts no tag contains a digit run of phone length or a token shape |
| nginx access log | query strings | request: no query strings logged on `api.*`, `app.*`, `hook.*`; the app puts no secret in a query (test over route definitions and the BFF) |
| PostHog | autocapture, addresses, replay | Playwright against a capturing stub: no event contains `initData`, a token, a phone; replay masks everything (WP-32) |
| Next.js server log | fetch errors with headers | a test of the API client's error formatter; staging log grep after the Mini App scenario run |
| Action log, LLM call log | properties, inputs | closed property sets (WP-47, WP-58); no text column (WP-55) |

`scripts/security/scan-logs.sh <dir>` greps a log directory for the token shape, the `initData` shape, phone
patterns and the configured secret values (read from the environment, never printed). The production track runs it
on staging and production logs after the pass inside Telegram and sends the counts.

### Headers, CSP, CORS

| Host | Expected |
| ---- | -------- |
| `app.*` | CSP with a per-request nonce from `proxy.ts`, allowing the Telegram SDK host, the media host, the tile host, the PostHog host; no `X-Frame-Options: SAMEORIGIN`; `frame-ancestors` allowing Telegram Web (`25` §3.10, Q-SEC-012) |
| `homi.uz` | the policy of WP-61, exactly one CSP header, `frame-ancestors 'none'` |
| `api.*` | `nosniff`, no CORS allow header for a foreign origin, JSON only |
| `hook.*` | only `/telegram/*` and `/up` answer |
| `cdn.*` | `nosniff`; `noindex` on the proxy locations |
| all | HSTS, `Referrer-Policy`, `X-Content-Type-Options` |

`scripts/security/check-headers.sh <env>` requests each host and compares with `docs/security/headers.<env>.txt`.
Playwright (`frontend/app/e2e/security.spec.ts`, `frontend/landing/e2e/csp.spec.ts`): the full scenario runs with
zero CSP violations; an injected inline script and a foreign image are blocked.

### Rate limits

`docs/security/rate-limits.md` is written from the code, one row per limiter: name, key (user, IP, chat), value,
window, answer, package. `RateLimitMatrixTest` has one case per row: the last allowed request passes, the next is
refused with the documented answer, another key is unaffected. The rows it must contain:

| Limiter | Key | Value | Package |
| ------- | --- | ----- | ------- |
| Sign-in | IP and Telegram user | as set there | WP-40 |
| API per user (read, write) | user | as set there | WP-40 |
| `POST /events` | user | as set there | WP-47 |
| Contact disclosure quota | user, distinct listings per day | as set there | WP-43 |
| Landing methods | IP | 120 per minute | WP-60 |
| Webhook | bot id and IP | 3 000 per minute (`telegram-webhook`, `telegram.webhook.rate_limit`) | WP-50 |
| Bot per user: messages, callbacks, radar writes | Telegram user | as set there | WP-51 |
| LLM text, voice | user | 30 and 10 per hour; daily spend cap | WP-55 |
| Outbound to legacy | global, with a background share | `LEGACY_RATE_PER_SECOND` | WP-41 |
| Outbound to Telegram | bot and chat | 25 per second, 1 per second per chat | WP-57 |

A limiter keyed by IP must see the client address, not nginx's. The servers call PHP-FPM from nginx through
FastCGI, so `REMOTE_ADDR` already is the client; `backend/bootstrap/app.php` configures no trusted proxies today,
and WP-40 adds `config/trustedproxy.php` with `TRUSTED_PROXIES`, which stays unset on these servers. The test
asserts that with no trusted proxy a forged `X-Forwarded-For` header does not change the key.

### IDOR matrix

Actors: A (owner), B (another user), U (unknown id), N (no token). Expected: A → success; B and U → `404` in the
envelope with no state change for A and the same query count; N → `401`. `IdorMatrixTest` — the file WP-44 created
at `backend/tests/Feature/Api/V1/` and WP-45 extended, not a new class — walks the table; its coverage case fails
when a route with a bound `{id}` or `{number}` under the user group is missing from it.

| Resource | Methods | Extra check |
| -------- | ------- | ----------- |
| Me, settings | `GET /me`, `GET`, `PATCH /settings` | no parameter can address another user |
| Favourites | `GET /favorites`, `PUT`, `DELETE /favorites/{number}` | B's write never changes A's rows |
| History | `GET`, `DELETE /history` | only own rows |
| Hidden listings, blocked authors | `PUT`, `DELETE /hidden/listings/{number}`, `PUT`, `DELETE /listings/{number}/blocked-author`, `GET /hidden`, `DELETE /hidden/authors/{id}`, `DELETE /hidden` | a listing number passed as an author id does nothing |
| Reports, surveys | `POST /listings/{number}/reports`, `POST /surveys/found`, `/surveys/found/where` | the "where" answer attaches to the caller's own row |
| Radars | `GET`, `POST /radars`, `PUT`, `PATCH`, `DELETE /radars/{id}`, `POST /radars/{id}/relax` | A's filters and state unchanged after B's call; `no_chat` is evaluated for the caller |
| Events | `POST /events` | the user id comes from the token, never from the body |
| Share, contact | `POST /listings/{number}/share`, `/contact` | prepared for the requester only; counts towards the requester's quota |
| Media | `GET`, `DELETE /media/{id}` | B cannot read A's private temporary address (WP-00) |
| Bot callbacks | every action that carries a radar, a rule or a conversation id | `BotForgeryTest` of WP-58, referenced, not repeated |
| Bot `/owner` | contact message | a forwarded contact is refused (WP-56) |

### Secrets inventory

`docs/security/secrets.md` — names only, never a value.

| Secret | Env name | Used by | Rotation |
| ------ | -------- | ------- | -------- |
| Application key | `APP_KEY` | backend | planned only: invalidates encrypted columns unless a previous key is configured |
| Database, Redis | `DB_PASSWORD`, `REDIS_PASSWORD` | backend | production track |
| Bot token | `TELEGRAM_BOT_TOKEN` | backend | BotFather revoke → env → `setWebhook`; signs `initData`, so every session ends |
| Webhook secret | `TELEGRAM_WEBHOOK_SECRET` (and the previous one during rotation) | backend | steps of WP-50 |
| Ledger encryption key | `TELEGRAM_UPDATES_ENCRYPTION_KEY` | backend | after the ledger retention has passed |
| Phone HMAC pepper | `PHONE_HMAC_PEPPER` | backend | never without a plan: verifications stop matching |
| Erasure subject key | `ERASURE_SUBJECT_KEY` | backend | never without a plan (WP-47) |
| Legacy service key | `LEGACY_SERVICE_KEY` | backend | by the operator |
| LLM keys | the key of each language-model provider the team has configured, under the name the published `config/ai.php` gives it (DEC-55) | backend | that provider's console; a provider that is no longer used loses its key from the env |
| PostHog keys | `POSTHOG_PERSONAL_API_KEY`, project keys | backend, apps (the project key is public by design) | PostHog console |
| Metrics token | `METRICS_TOKEN` | backend, scraper | production track |

- `php artisan security:check` (names only): every required name is present and long enough for the environment;
  the bot token has the token shape; the webhook secret uses the allowed alphabet; `TELESCOPE_ENABLED` is off on
  production; `SOURCES_ALLOW_STUB` is false on servers. Exit 1 on a failure.
- `scripts/security/scan-secrets.sh`: patterns for Telegram bot tokens, Google and other provider keys, private key
  headers, `.env` files, and the names above followed by a value; over the working tree and, in CI, over the
  commits of the PR. A dedicated scanner is a proposal for the first developer, not part of this package.
- Client bundles: after `pnpm -r build`, the script greps `frontend/*/.next` for the same patterns and for any
  `NEXT_PUBLIC_` name that is not on the allow-list of `docs/security/public-env.md`.

### Performance budgets

| Measure | Budget | How it is measured |
| ------- | ------ | ------------------ |
| Native API methods (me, settings, personal lists, radars, events) | p95 ≤ 300 ms on staging | `php artisan perf:burst <method>`: 200 requests at concurrency 1 and 10; results in `docs/testing/performance.md` |
| Legacy-backed methods, HOMI's own share | p95 ≤ 150 ms added to the source's time | Pest benchmark with the fake legacy server answering at once |
| Legacy-backed methods, end to end | recorded as the baseline; alert at twice the baseline; hard ceiling 15 s (timeout, `25` §4.5) | `perf:burst` on staging through the real driver, inside the outbound limit |
| Webhook acknowledgement | p95 ≤ 200 ms, never above 1 s | the request timing metric of WP-50 |
| Update processing without LLM | p95 ≤ 1 s from receipt to the first Bot API call | ledger timestamps |
| Match to push | poll interval (5 min) + 60 s at p95 | `delivery_lag_seconds` of WP-57 |
| Digest fan-out | 10 000 users within 10 minutes | the fake-API run of WP-57 |
| Mini App | LCP ≤ 2.5 s at p75 on a mobile profile, CLS ≤ 0.1; JavaScript per route recorded, CI fails on a growth above 10 % | Lighthouse by hand on staging in a Telegram-sized viewport; `scripts/perf/bundle-size.mjs` over the build output |
| Landing | LCP ≤ 2.5 s, CLS ≤ 0.1 on `/` | Lighthouse on staging |

A missed budget is a finding: fixed in the owning package, or accepted in writing by the reviewer with the measured
number. Lighthouse and a load generator are run as tools on the developer's machine against staging; adding either
to the repository needs approval.

### Requests to the production track

The application side built here: `GET /api/internal/metrics` on `api.*` (the route sits in `routes/api.php`,
whose routes carry the `api` prefix of `bootstrap/app.php`; text exposition of the `ops:metrics:*` hashes
of WP-50, WP-57 and the sources; bearer `METRICS_TOKEN`, allow-list `METRICS_ALLOWED_IPS`, `404` otherwise), and
the scheduler heartbeat: a `Schedule::call` in `backend/routes/console.php`, every minute, sets the gauge
`scheduler_heartbeat_timestamp` through `BotMetrics` of WP-50 (no earlier package writes one).

The dashboard gates are not built here: they exist. `App\Http\DashboardAccess` lets `/horizon` and `/telescope`
through only when nginx authenticated the request with basic auth and passed `HOMI_DASHBOARD_USER`
(`infra/<env>/nginx/api.*.conf`; gates in `HorizonServiceProvider` and `TelescopeServiceProvider`; test
`backend/tests/Feature/Http/DashboardAccessTest.php`). `/pulse` is not in that nginx location and the application
defines no `viewPulse` gate, so outside `local` Pulse's own default refuses it. This package adds no id list and
no new gate; it extends `DashboardAccessTest` with the `/pulse` case and checks the three paths from outside.

| Signal | Threshold (proposed) | Source |
| ------ | -------------------- | ------ |
| Health | `/up` not `200` for 1 minute, per host | external probe |
| Webhook | `pending_update_count` > 100, or a new `last_error_date` | `telegram:health` (WP-50) |
| Webhook refusals | any non-`2xx` answered to Telegram's addresses | metrics |
| Queue wait | `telegram` > 10 s, `notifications` > 60 s, `radar` > 120 s, for 2 minutes | Horizon metrics |
| Failed jobs | any new failed job in 10 minutes | metrics |
| Scheduler | heartbeat older than 5 minutes | metrics |
| Send failures | `429` more than 20 a minute; other non-`403` failures above 1 % over 10 minutes; breaker open | `telegram_send_total` |
| Delivery lag | due outbox rows above 500 for 10 minutes | `radar:status` numbers in metrics |
| Listing source | `source_unavailable` above 5 % of requests over 10 minutes; legacy breaker open longer than 5 minutes; "legacy refused the service key" once | metrics, the `critical` log line of WP-41 |
| A stub in use | any feature resolving to `stub` on production after WP-48 | `sources:check` in the deploy smoke |
| API errors | `5xx` above 1 % over 5 minutes; `401` at five times the hourly norm | nginx or metrics |
| LLM | spend at 80 % of the daily cap; failures above 20 % over 10 minutes | metrics |
| Certificates | expiry within 14 days, every host | external probe |
| Backups | newest backup older than 26 hours | backup exporter |
| Disk and Redis memory | above 80 % | host metrics |

- Each alert is fired once on staging from a scripted trigger and the result recorded; no alert text carries a user
  id, a chat id or a text.
- Backups: PostgreSQL with point-in-time recovery; **no backup or log segment older than 14 days** (the privacy
  text promises "about two weeks"); encrypted; a restore into an isolated database, timed, before WP-71 and monthly.
  Not backed up, by design: Redis (conversations, pacer state, caches — all rebuildable), the nginx photo caches.
- An incident note `docs/security/incident.md`: who is told, how to stop sending (`delivery:pause`), how to move a
  method back (`sources:reset`), how to revoke the bot token and the service key.

### Legal texts

One source for the facts, `docs/legal/privacy-facts.md`, signed by the product owner; the bot text (`bot.privacy.*`
of WP-51, WP-56) and the landing page (WP-61) are written from it in ru, uz and en and changed together.

| Fact the text must state | Source of truth |
| ------------------------ | --------------- |
| Who operates HOMI, the contact, where the servers are | product owner (DEC-13) |
| The legal basis for processing and for showing phones and photos taken from another service | lawyer's note (Q-SEC-021) |
| Data stored per user: Telegram id, three profile flags, language and settings, radars, favourites, marks, opened listings, received cards, arrival source, the action log; the phone hash when an owner verifies | WP-40, WP-44, WP-45, WP-47, WP-52, WP-53, WP-56 |
| Not stored: name, username, phone number, message texts, voice, location | WP-40, WP-50, WP-55 |
| Processors: HOMI's PostHog project and its region; the language-model provider configured at the time, with masking — the team may change it (DEC-55), and the text is changed in the same step (`BRAND_LLM_VENDOR`, WP-56); the listing service that supplies listings, phones and photos | DEC-47, WP-55, DEC-42 |
| Retention: action log 180 days, raw updates 14 days, backups 14 days | WP-47, WP-50, production track |
| Deletion: «Удалить мои данные» in the bot, immediate in the database; what an author of a listing can ask for | WP-56, WP-57 |
| The site: no cookies, a visit number that travels into the bot | WP-61 |

The step is done when the three languages are approved, the "pending legal review" marks are removed from the
translation status file, and `PrivacyPromisesTest` of WP-56 has no `todo` left. If the lawyer's answer is missing,
the package records it under "Handoff" as the open item that blocks WP-71.

### Dependency audit

`composer audit` and `pnpm audit --audit-level=high` as CI steps in `.github/workflows/{backend,frontend}.yml`
(fail on high and critical; a time-boxed exception file `docs/security/audit-exceptions.md` with owner and expiry);
`make registry-check`; a licence list of production dependencies in `docs/security/licences.md`; a review of
packages nothing imports (`composer why`, `pnpm why`), removed by a separate approved PR; no `latest` or open
range for a runtime dependency of the three apps.

## Files

- `backend/app/Logging/{RedactSecrets,AddRedaction}.php`, `backend/config/logging.php` (separate small PR)
- `backend/app/Console/Commands/Security/SecurityCheck.php`, `backend/app/Console/Commands/Perf/Burst.php`
- `backend/app/Http/Controllers/Internal/MetricsController.php`, `backend/routes/api.php` (the route
  `internal/metrics` outside the `v1` group and its `auth:sanctum` middleware), `backend/routes/console.php` (the
  heartbeat entry)
- `backend/tests/Feature/Security/{AuthStatusMatrixTest,RateLimitMatrixTest,CorsTest,LogLeakTest,FailedJobLeakTest,TelescopeHiddenParametersTest,SchemaMinimisationTest,MetricsEndpointTest,SecurityCheckCommandTest}.php`
- changed, not new: `backend/tests/Feature/Api/V1/IdorMatrixTest.php` (created by WP-44 with its coverage case,
  extended by WP-45 — the rows of the table below that it lacks are added there, no second matrix class) and
  `backend/tests/Feature/Http/DashboardAccessTest.php` (the `/pulse` case)
- `backend/tests/Arch/SearchFiltersBoundaryTest.php`
- `frontend/app/e2e/security.spec.ts`, `frontend/landing/e2e/csp.spec.ts` (extended), an ESLint rule entry for
  `dangerouslySetInnerHTML`
- `scripts/security/{scan-secrets.sh,scan-logs.sh,check-headers.sh}`, `scripts/perf/bundle-size.mjs`
- `.github/workflows/{backend,frontend}.yml` (audit and scan steps)
- `docs/security/{checklist.md,rate-limits.md,secrets.md,public-env.md,headers.staging.txt,headers.production.txt,incident.md,audit-exceptions.md,licences.md}`,
  `docs/testing/performance.md`, `docs/legal/privacy-facts.md`
- `backend/lang/{ru,uz,en}/bot.php` (`privacy.*`), `frontend/packages/i18n/messages/privacy/{ru,uz,en}.json`
- Shared file, separate small PR: `backend/.env.example` (`METRICS_TOKEN`, `METRICS_ALLOWED_IPS`)

## Steps

1. Send the requests to the production track and the legal questions to the product owner on the first day: both
   have the longest lead time.
2. Copy the checklist table into `docs/security/checklist.md`; for each row find the existing test and link it;
   list the rows without one.
3. `RedactSecrets` and its wiring; `LogLeakTest`, `FailedJobLeakTest`, `TelescopeHiddenParametersTest`.
4. The missing rows of the existing `IdorMatrixTest` (WP-44); `AuthStatusMatrixTest`; `CorsTest`;
   `SchemaMinimisationTest`; `SearchFiltersBoundaryTest`.
5. `docs/security/rate-limits.md` from the code; `RateLimitMatrixTest`.
6. `security:check`; `scan-secrets.sh` with its CI step; the bundle scan; `docs/security/secrets.md`,
   `public-env.md`.
7. The metrics endpoint and the scheduler heartbeat with their tests; the `/pulse` case of `DashboardAccessTest`.
8. Header files and `check-headers.sh`; the two Playwright security specs.
9. The audit steps in CI; licences; the unused-dependency review.
10. `perf:burst`, `bundle-size.mjs`; measure on staging; write `docs/testing/performance.md`.
11. With the production track: fire each alert on staging; the restore drill; `scan-logs.sh` after a full pass;
    record the results in the checklist.
12. Legal texts: the facts file, the three languages, bot and page together; remove the review marks.
13. `make ci-backend`, `make ci-frontend`; review by the `security-reviewer` agent; PR; repeat the read-only checks
    on production.

## Behaviour to reproduce

Nothing of the legacy product is reproduced here. The findings of `16` §3 are legacy behaviours that must **not**
come back; each is closed by a row of the checklist. The ones that matter most for a new product with its own
users:

| # | Legacy finding | What HOMI must show instead |
| - | -------------- | --------------------------- |
| 1 | Server strings injected as HTML into map labels (SEC-001) | rows 18 and 21 |
| 2 | Phone numbers reachable without a quota (SEC-002, SEC-003, SEC-015) | rows 26, 28 and 36: no number travels with a card or its texts, and the one method that gives it is counted per user |
| 3 | Bot output without consistent escaping (SEC-024) | row 20 |
| 4 | Contact ownership never checked in `/owner` (SEC-009) | the IDOR matrix row "Bot `/owner`" |
| 5 | Promises of the privacy text never tested (SEC-018) | the legal texts section and `PrivacyPromisesTest` |
| 6 | Raw updates kept with personal data (SEC-030, SEC-031) | row 37 |
| 7 | Media readable and deletable by anyone signed in (SEC-026, SEC-027) | row 16 |
| 8 | Unsigned photo copies kept without end (SEC-014) | row 25 |

## Tests

| # | Layer | Test | Cases |
| - | ----- | ---- | ----- |
| 1 | Feature | `AuthStatusMatrixTest` | no token, malformed, expired, revoked, another ability → the documented status and envelope on one route of each group |
| 2 | Feature | `IdorMatrixTest` | every row × A, B, U, N; the coverage case |
| 3 | Feature | `RateLimitMatrixTest` | every row of the limiter document |
| 4 | Feature | `CorsTest` | foreign origin, the app origin, a preflight |
| 5 | Feature | `LogLeakTest`, `FailedJobLeakTest` | the seeded token, `initData`, phone and phrase are absent after each driven flow |
| 6 | Feature | `SchemaMinimisationTest` | no forbidden column name in any table with a user link |
| 7 | Feature | `MetricsEndpointTest`, `DashboardAccessTest` (existing, extended), `SecurityCheckCommandTest` | token and address checks; `/horizon` and `/telescope` with and without `HOMI_DASHBOARD_USER`, `/pulse` refused outside `local`; each failing rule exits 1 without printing a value |
| 8 | Arch | `SearchFiltersBoundaryTest` | only the normaliser constructs `SearchFilters` |
| 9 | End to end | `security.spec.ts`, `csp.spec.ts` | zero violations in the full scenario; storage and cookie checks in cookie mode and header mode; no `initData` in any address |
| 10 | Static | secret scan, bundle scan, audits | a planted fake token fails the scan; a `NEXT_PUBLIC_` name off the list fails the build check |
| 11 | On servers | header check, alert drills, restore drill, log scan | results recorded per environment |

## Acceptance checklist

- [ ] `docs/security/checklist.md` has fifty rows, each "applies" row with a passing check and a link; the counts
      are 34, 12 and 4, or the difference is explained.
- [ ] The leak tests are green, and `scan-logs.sh` finds nothing on staging and production after a full pass.
- [ ] The IDOR, status, limiter and CORS matrices are green; the coverage case knows every per-user route.
- [ ] The Mini App and the landing run their full scenarios with zero CSP violations; the header check passes on
      every host of both environments; `app.*` opens inside Telegram Web.
- [ ] `security:check` exits 0 on staging and production; the secret scan and the bundle scan are part of CI.
- [ ] Telescope is off on production; `/horizon` and `/pulse` refuse an ordinary user.
- [ ] Every budget of the table has a measured number in `docs/testing/performance.md`; none is missed without a
      signed acceptance.
- [ ] Every alert of the table was fired once on staging and is armed on production.
- [ ] A restore drill succeeded and its duration is recorded; the backup retention is 14 days or less.
- [ ] `composer audit` and `pnpm audit` are CI steps and pass; the registry check passes.
- [ ] The privacy facts file is signed; the bot text and the landing page are final in ru, uz and en and say the
      same; `PrivacyPromisesTest` has no `todo`. If this line cannot be ticked, the reason is in "Handoff".
- [ ] `make ci-backend` and `make ci-frontend` are green; the security review is recorded in the PR.

## Handoff

Empty — nobody has started this package.
