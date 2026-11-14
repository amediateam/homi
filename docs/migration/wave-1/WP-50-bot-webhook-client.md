# WP-50 — Webhook, update ledger, Bot API client

| Field | Value |
| ----- | ----- |
| Stage | D |
| Status | TODO |
| Depends on | WP-40, WP-43 (its minimal `TelegramClient` is moved and extended here) |
| Size | about 4 000 changed lines, L. Above the 3 000-line guide: ship as two PRs, part A = steps 1–9 (webhook, ledger, privacy, prune), part B = steps 10–17 (client, commands, health, metrics, document). Production works after either part |
| Behaviour reference | `04` §1 (row "Webhook" and the paragraph "Bot API features the bot depends on"), `04` §8 (BR-BOT-055, BR-BOT-081, BR-BOT-085, BR-BOT-094); `16` §4.2 and §4.9 (SEC-REQ-008 … SEC-REQ-010, SEC-REQ-013, SEC-REQ-034, SEC-REQ-036 … SEC-REQ-038, SEC-REQ-047, SEC-REQ-048; findings SEC-030, SEC-031); `11b` §2.3 rows 2 and 6; `HANDOFF.md` §4 T1; `.ai/agents/telegram-bot-engineer.md` rules 1–4; task files KV-TG-001 … KV-TG-005, KV-TG-059, KV-QA-003 |
| Needs from the production track | (1) Approval of two migrations on the empty table `telegram_updates`. (2) In the server env of staging and of production, separate values each: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_WEBHOOK_URL`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_UPDATES_ENCRYPTION_KEY`, `PHONE_HMAC_PEPPER`; then a Horizon restart. (3) The `hook.*` vhost keeps forwarding only `/telegram/*` and `/up` with the original `Host` and the secret header, body limit `1m`. (4) A `schedule:run` cron entry every minute in both environments. (5) `setWebhook` for the staging bot and the production bot, from the server, with the secret and `allowed_updates` = `message`, `callback_query`, `my_chat_member`. (6) The alert target of `telegram:health`: its `ERROR` log line and its Redis gauges. Exact actions: "Design → What the production track does" |

## Goal

An update that Telegram posts to `hook.*` with the environment's secret is stored once in an encrypted, redacted
ledger, acknowledged at once and processed exactly once on the `telegram` queue. Every outbound call of the nine bot
packages goes through one in-house Bot API client that cannot leak the token. A developer can register their own dev
bot, the production track gets a read-only health check on a schedule, and every later bot test has `UpdateFactory`
and `FakeBotApi`. The package sends nothing to users: processing ends in a no-op until WP-51 plugs in the router.

## Scope

**In.**

- Webhook authenticity: secret header in constant time, fail closed, route bound to the hook host, body limits, the
  limiter keyed by bot and IP (KV-TG-001).
- Update ledger: `insertOrIgnore` on (`bot_id`, `update_id`), fast `200`, job on the `telegram` queue, per-chat
  order, atomic claim, retry and failure (KV-TG-002).
- Ledger privacy: redaction before storing and after processing, encryption with its own key, `allowed_updates`
  reduced to three types, scheduled prune (KV-TG-003).
- The Bot API client: `TelegramClient`, `TelegramBot`, the exception classes, token redaction (KV-TG-004).
- `telegram:webhook` for the dev bot only (KV-TG-005); `telegram:health` and the bot metrics (KV-TG-059).
- The base test kit of KV-QA-003: `UpdateFactory`, `FakeBotApi`, `Http::preventStrayRequests()`.
- `docs/infrastructure/telegram-webhook.md`, application side.

**Out.**

| Not here | Where |
| -------- | ----- |
| Router, actor resolution, per-user limits, texts, replies, keyboards, callbacks, conversation state, stickers | WP-51 |
| Any command, button or message | WP-52 … WP-57 |
| Send pacing, `retry_after` handling for bulk sends, the circuit breaker (SEC-REQ-029) | WP-57 |
| `telegram:profile sync`, BotFather settings | WP-58 |
| The `initData` verifier and its test signer (`backend/tests/Support/InitDataSigner.php`) | WP-40 |
| The global log redaction processor and the metrics endpoint of SEC-REQ-047 and SEC-REQ-048 | WP-70 |
| Token rotation or custody of the legacy bot, pending updates at a switch, the pause switch of KV-TG-060 | not built: HOMI's bots are new and nothing of the legacy bot is taken over (DEC-40) |
| The `legacy_phone_hash` field of KV-TG-003 (legacy-hash window, DEC-29) | not built: no legacy owner hashes are migrated |

## Decisions that bind this package

| Decision | Consequence here |
| -------- | ---------------- |
| A new permanent bot per environment (DEC-40) | The ledger holds rows of HOMI's own three bots only, keyed by `bot_id`. Nothing in this package mentions a second receiver, a token hand-over or a backlog of another bot |
| Full parity, open access (DEC-43) | The client covers every Bot API method the 84 handlers need (table in "Design"). The webhook takes real traffic from the first day, so the limiter, the fast acknowledgement and the health check are not optional |
| One PR per package, every merge on staging and production, checks inside Telegram there, no tunnel tool (DEC-45) | Locally and in CI the bot is tested against `FakeBotApi` only. `telegram:webhook` exists for a developer's optional own dev bot and refuses the server environments. The pass inside Telegram is run with the production track |
| Defects are fixed, behaviour changes stay off (DEC-36) | SEC-030 and SEC-031 are defects of the existing HOMI stubs and are fixed here. The package has no `DEV` item and no flag in `config/bot.php` |
| Dependencies (DEC-49, `25` §10: "nothing new is known to be needed") | No Telegram SDK. The client is built on Laravel's HTTP client. A library would need approval and is not proposed |
| Secrets and personal data (`25` §2 rule 7) | The token and the secret never reach a log, an exception message, a job payload or command output. The ledger keeps no name, username or phone, and no text after processing |
| The bot (`25` §6) | KV-TG-057, KV-TG-058 and KV-TG-060 are not built: the job has no pause check and the webhook command has no pending-update policy |
| Tests (`25` §9) | Pest unit and feature tests here; the kit built here is the base of the conversation tests of WP-51 |
| Environments (`25` §11) and `docs/handoff/parallel-work.md` §1, §3, §6, §7 | Server env, webhooks, nginx, cron and monitoring are the production track's. New env names go into `backend/.env.example` in a small shared-file PR and into `docs/infrastructure/environments.md`. Both migrations are flagged in the PR |
| Horizon (`backend/config/horizon.php`, shared file) | No new queue or supervisor: the job uses the existing `telegram` queue and `supervisor-telegram` (timeout 30 s) |

## Design

### Request path

```text
Telegram → nginx hook.* → POST /telegram/webhook (route name hooks.telegram)
  1. Route::domain(config('telegram.webhook.host'))          other host → 404
  2. group `hooks`: RecordWebhookMetrics, throttle:telegram-webhook, bindings   over the limit → 429
  3. VerifyTelegramSecretToken                                 missing, wrong or unconfigured secret → 403
  4. LimitTelegramBody                                         > 1 MB → 413; not application/json → 415
  5. TelegramWebhookController → UpdateLedger::accept()        200 / 400 / 503
        UpdateRedactor::beforeStore → encrypt → insertOrIgnore → ProcessTelegramUpdateJob (afterCommit)
```

- **Host.** `telegram.webhook.host` is the host of `TELEGRAM_WEBHOOK_URL`. When the URL is empty the value is
  `hook.invalid`, so an unconfigured environment answers `404` on every host. The domain is read when routes are
  registered; servers run without a route cache today (`docs/infrastructure/deployment.md`), and a later
  `route:cache` needs the env present at cache time.
- **Limiter.** `telegram-webhook` in `AppServiceProvider` becomes
  `Limit::perMinute(config('telegram.webhook.rate_limit'))->by($botId.'|'.$request->ip())` (SEC-031, SEC-REQ-027).
- **Secret.** `VerifyTelegramSecretToken` reads the header `X-Telegram-Bot-Api-Secret-Token` and calls `abort(403)`
  with no message when the configured secret is empty, the header is missing or empty, or `hash_equals` fails. It
  runs before `$request->getContent()` is touched. No normalisation: Telegram sends the value exactly as set.
- **Previous secret.** A second secret is accepted only while `now() < secret_rotated_at + 300 s`, and never when
  the timestamp is missing. It stays in this package because KV-TG-001 and SEC-REQ-008 describe it as the ordinary
  rotation of HOMI's own webhook secret: between writing the new secret to the server env and Telegram applying
  `setWebhook`, updates in flight still carry the old one, and without the window they would be refused. It has
  nothing to do with a bot token or with the legacy bot.
- **Body.** `LimitTelegramBody`: a `Content-Length` above `telegram.webhook.max_body_bytes`, or an actual body
  longer than that (requests without a length), → `413`; a media type other than `application/json` → `415`. nginx
  enforces `client_max_body_size 1m` as well.
- **Controller.** Decodes the body. Not a JSON object, or `update_id` missing or not a positive integer →
  `400 {"ok":false}`, logged with the request id only. Then `UpdateLedger::accept(array $update): LedgerResult`
  (`Stored`, `Duplicate`, `Ignored`) decides the answer. An exception from the insert (database down, encryption key
  missing) is not caught: the answer is `5xx`, Telegram delivers the update again later, and the error is logged.
  This is the only case where the webhook answers non-2xx to an authentic request.

| Case | Status | Body | Side effect |
| ---- | ------ | ---- | ----------- |
| New update of an allowed type | 200 | `{"ok":true}` | one row `received`, one job |
| Same (`bot_id`, `update_id`) again | 200 | `{"ok":true,"duplicate":true}` | none |
| Type outside `allowed_updates` | 200 | `{"ok":true}` | none |
| Body not an object, no valid `update_id` | 400 | `{"ok":false}` | none |
| Secret missing, wrong, another environment's, or not configured | 403 | JSON error body with no detail about the failed check: the ADR-0007 envelope when the request accepts JSON (`postJson()` in tests), Laravel's default `{"message": …}` otherwise, because `ApiExceptionRenderer::isApiRequest()` matches `api/*` and JSON requests only | none |
| Correct secret on another host (`api.*`) | 404 | — | none |
| Body over 1 MB | 413 | — | none |
| Media type not JSON | 415 | — | none |
| Over the limiter | 429 | — | none |
| A handler throws later | 200 (already answered) | — | row `failed` after the budget |

### Configuration

`backend/config/telegram.php`. "New" keys with an env name are added to `backend/.env.example` (blank or default).

| Config key | Env name | Default | State |
| ---------- | -------- | ------- | ----- |
| `bot.token`, `bot.username` | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME` | — | exist |
| `webhook.url`, `webhook.secret` | `TELEGRAM_WEBHOOK_URL`, `TELEGRAM_WEBHOOK_SECRET` | — | exist |
| `webhook.host` | derived from `webhook.url` | `hook.invalid` | new |
| `webhook.secret_previous` | `TELEGRAM_WEBHOOK_SECRET_PREVIOUS` | blank | new |
| `webhook.secret_rotated_at` | `TELEGRAM_WEBHOOK_SECRET_ROTATED_AT` (ISO 8601, UTC) | blank | new |
| `webhook.allowed_updates` | — | `message`, `callback_query`, `my_chat_member` | changed: `edited_message` and `chat_member` removed |
| `webhook.rate_limit` | — | 3 000 per minute | new |
| `webhook.protected_hosts` | — | `hook.homi.uz`, `hook.staging.homi.uz` | new |
| `webhook.max_connections`, `webhook.max_body_bytes` | `TELEGRAM_WEBHOOK_MAX_CONNECTIONS`, — | 40, 1 048 576 | exist |
| `updates.encryption_key` | `TELEGRAM_UPDATES_ENCRYPTION_KEY` (`base64:` + 32 random bytes) | blank | new |
| `updates.processing_timeout` | — | 60 s | new |
| `updates_retention_days` | `TELEGRAM_UPDATES_RETENTION_DAYS` | 14 | exists; the name moves into `.env.example` |
| `phone_hmac_pepper` | `PHONE_HMAC_PEPPER` (at least 32 random bytes) | blank | new |
| `metrics.driver` | — | `redis` (`array` under `testing`) | new |
| `http.*`, `queue` | as today | as today | exist; comments added for `retries` and `max_retry_after` |

### Ledger

`telegram_updates` after the two migrations of this package:

| Column | Type | Note |
| ------ | ---- | ---- |
| `id` | bigint | |
| `bot_id` | unsigned bigint | `TelegramBotIdentity::id()`: the digits of the token before `:` |
| `update_id` | unsigned bigint | unique with `bot_id` (exists) |
| `update_type` | varchar(32), null | new: the first key of the update other than `update_id` |
| `chat_id` | bigint, null | new: `message.chat.id`, `callback_query.message.chat.id` or `my_chat_member.chat.id`; clear text, needed for ordering and erasure |
| `payload` | text | was `jsonb`: now the encrypted JSON of the redacted update |
| `status` | varchar(16) | `received` → `processing` → `done`, or `failed` (enum `TelegramUpdateStatus`, exists) |
| `error` | text, null | exception class and a short message without payload data |
| `processed_at`, `created_at`, `updated_at` | timestamptz | |

Indexes: unique (`bot_id`, `update_id`) and (`status`, `created_at`) exist; new (`bot_id`, `chat_id`, `update_id`).

Migrations (names of `11b` §2.3 row 2): `add_type_and_chat_to_telegram_updates_table` (additive) and
`change_payload_to_text_on_telegram_updates_table`. The second drops and re-adds `payload` as `text`; it first
checks that the table is empty and throws otherwise, so it cannot destroy data. The table is empty everywhere
because the stub refuses every request.

### Redaction and encryption

`App\Telegram\Updates\UpdateRedactor`:

- `beforeStore(array $update): array`
  - every object that describes a user or a chat (`from`, `chat`, `sender_chat`, `via_bot`, `my_chat_member.from`,
    `new_chat_member.user`, `old_chat_member.user`, `callback_query.from`, and the same keys inside
    `reply_to_message` and `callback_query.message`) is rebuilt from an allow-list: `id`, `type`, `is_bot`,
    `language_code`, `is_premium`, plus `has_username: bool`. `first_name`, `last_name`, `username` and `title` are
    never stored (BR-API-007, SEC-REQ-036);
  - `forward_origin`, `forward_from`, `forward_from_chat`, `forward_sender_name` are replaced by
    `is_forwarded: true`;
  - `message.contact` becomes `{"user_id": <id or null>, "phone_hmac": "<hex>"}`: the number is normalised (digits
    only, leading `+`) and passed through `PhoneHmac::of()` (HMAC-SHA-256 with `PHONE_HMAC_PEPPER`); `first_name`,
    `last_name`, `vcard` and the raw number are dropped.
- `afterProcessing(array $update): array` removes from every message object `text`, `caption`, `entities`,
  `caption_entities`, `voice`, `audio`, `contact`, `location`, `venue`, `reply_to_message`, `photo`, `document`,
  `sticker`, `video`, `video_note`, `animation`, and `callback_query.data`. Ids, type and dates stay.

The controller stores the result of `beforeStore()`. The job saves the result of `afterProcessing()` when the row
becomes `done`. A `failed` row keeps its (redacted, encrypted) payload until the prune, so a failure can be studied.

`App\Casts\EncryptedJsonPayload` encrypts with a dedicated `Illuminate\Encryption\Encrypter` built from
`telegram.updates.encryption_key` (cipher `aes-256-cbc`, never `APP_KEY`). `insertOrIgnore` bypasses Eloquent
casts, so `UpdateLedger` calls the cast's static `seal(array): string` itself. A missing key makes `seal()` throw.

The keyed HMAC is a security requirement (SEC-REQ-036), not a flagged behaviour change: legacy's hash scheme is not
visible to users, and DEV-011 only records the difference.

### The job

`App\Jobs\Telegram\ProcessTelegramUpdateJob(int $botId, int $updateId)` on queue `telegram`, dispatched with
`afterCommit()`. `$tries = 0`, `retryUntil()` = 10 minutes, `$maxExceptions = 3`, `$timeout = 25`,
`$backoff = [2, 10]`. `handle()`:

1. Load the row. Missing (pruned or erased) → return.
2. **Order per chat.** When `chat_id` is set and a row of the same `bot_id` and `chat_id` with a smaller
   `update_id` is `received` or `processing` → `release(1)`. Releases do not use the exception budget.
3. **Atomic claim.** One `UPDATE … SET status = 'processing', updated_at = now() WHERE id = ? AND (status =
   'received' OR (status = 'processing' AND updated_at < now() - processing_timeout))`. Zero rows → return.
   The second branch re-claims a row whose worker was killed: `processing_timeout` (60 s) is above the job timeout
   (25 s) and below the queue's `retry_after` (90 s), so the re-delivered job finds an orphan, never a live run.
4. Decrypt the payload and call `app(UpdateProcessor::class)->process(array $update, TelegramUpdate $row)`.
5. Save `afterProcessing()`, set `done` and `processed_at`, count the metric. An update that matches no row — the
   handler erased the user and with it the ledger rows of the chat (WP-56) — is not an error.

On an exception the row goes back to `received` and the exception is rethrown. `failed(Throwable $e)` sets `failed`
and writes the exception class and the first 200 characters of its message to `error`, after replacing anything
token-shaped; then it calls the processor's `failed()` inside a `try` that swallows and logs.

`App\Telegram\Updates\UpdateProcessor` is an interface with two methods:
`process(array $update, TelegramUpdate $row): void` and
`failed(array $update, TelegramUpdate $row, Throwable $e): void` (tells the user, must not throw). This package
binds `NullUpdateProcessor` (does nothing, metric result `ignored`). WP-51 binds its `UpdateRouter` instead.

### Bot API client

All classes in `backend/app/Telegram/Client/`. Before writing them, read the current Bot API documentation and
record its version and the date in the PR and in `telegram-webhook.md`; confirm the inline button field `style`
and the `expandable_blockquote` entity (`04` §1 names them as Bot API 9.x features). Every Bot API fact in this and
the eight later bot specifications — method and field names, length limits, the error descriptions of the
exception table, `secret_token`, `allowed_updates` — could not be confirmed offline: verify it against the Bot API
documentation before writing it.

| Class | Role |
| ----- | ---- |
| `TelegramClient` | `call(string $method, array $params = [], array $files = []): mixed` builds `{base_url}/bot{token}/{method}` internally, sends JSON (multipart when `$files` is set), returns `result` when `ok` is true. `downloadFile(string $filePath): string` reads `{base_url}/file/bot{token}/{path}`. Timeouts from `telegram.http`. Retries (`http.retries`) only on connection errors and `5xx`. Never sleeps on `429` |
| `TelegramBot` | Typed wrappers (table below). `TelegramBot::fromConfig()`; bound as a singleton. Parameters are arrays shaped as the Bot API expects, so a new Bot API field needs no client release |
| `TelegramBotIdentity` | `id(): int` (token prefix; `0` when the token is empty or malformed, so the limiter key never throws — `UpdateLedger::accept()` throws on bot id `0`, which is the `5xx` case), `username(): ?string` |
| `TelegramException` and `Exceptions\*` | One hierarchy callers can branch on (mapping below). Messages are built from the method name and Telegram's `description` only |

The token is read from config at call time. It is never a constructor argument, a property or part of a serialised
job. A transport exception is caught and rethrown as `TransportError` with the URL rewritten to `/bot***/`.

**WP-43 created a minimal client first**: `App\Services\Telegram\TelegramClient` with `call(string $method, array
$params): array`, and `App\Exceptions\TelegramException`, for `savePreparedInlineMessage`. This package moves that
class to `App\Telegram\Client\TelegramClient` and its exception to `App\Telegram\Client\TelegramException` (the
base class of the error classes), keeps the first two parameters of `call()` and widens the return type from
`array` to `mixed` (many Bot API methods answer `true`), grows it into the client described here, and updates the
imports in `ShareService` and in the tests of WP-43. `backend/app/Services/Telegram/TelegramClient.php` and
`backend/app/Exceptions/TelegramException.php` no longer exist afterwards: one client, one exception hierarchy,
and the tests of WP-43 stay green.

| Group | Methods of `TelegramBot` | First used by |
| ----- | ------------------------ | ------------- |
| Messages | `sendMessage`, `sendPhoto`, `sendMediaGroup`, `sendSticker`, `sendVenue`, `deleteMessage` | WP-51 (responder), WP-53 (photo, album, venue), WP-57 |
| Edits | `editMessageText`, `editMessageCaption`, `editMessageMedia`, `editMessageReplyMarkup` | WP-51, WP-53, WP-57 |
| Callbacks and reactions | `answerCallbackQuery`, `setMessageReaction` | WP-51, WP-55 |
| Files | `getFile`, `downloadFile` | WP-55 (voice) |
| Stickers | `getStickerSet` | WP-51 |
| Chats | `leaveChat` | WP-52 |
| Commands and menu | `setMyCommands`, `getMyCommands`, `deleteMyCommands`, `setChatMenuButton`, `getChatMenuButton` | WP-52, WP-56, WP-58 |
| Profile | `getMe`, `getMyName`, `setMyName`, `getMyDescription`, `setMyDescription`, `getMyShortDescription`, `setMyShortDescription` | this package (`getMe`), WP-58 |
| Webhook | `setWebhook`, `getWebhookInfo`, `deleteWebhook` | this package |
| Sharing | `savePreparedInlineMessage` | WP-43 |

| Telegram answer | Exception |
| --------------- | --------- |
| `429` with `parameters.retry_after` | `TooManyRequests` (`retryAfter(): int`) |
| `403` "bot was blocked by the user", "user is deactivated", "bot was kicked" | `ChatUnreachable` |
| `400` "message is not modified" | `MessageNotModified` |
| `400` "message to edit not found" | `MessageNotFound` |
| `400` "message can't be edited" | `MessageCantBeEdited` |
| `400` "query is too old" | `QueryTooOld` |
| other `400` | `BadRequest` |
| `401`, or `404` for an unknown token | `Unauthorized` |
| `5xx` after the retries | `ServerError` |
| connection failure after the retries | `TransportError` |
| `200` with `ok: false` | the class of its `error_code` |

`telegram.http.max_retry_after` (5 s) is the limit for interactive replies: a `429` that asks for a longer wait is
not retried by a handler. Bulk senders release their job instead (WP-57). Each call counts
`telegram_send_total{method,result}`.

### Commands

**`telegram:webhook {action : set, info or delete} {--drop-pending}`** —
`App\Console\Commands\Telegram\WebhookCommand`.

1. The first statement of `handle()`: when `app()->environment(['staging', 'production'])`, print
   `Webhooks of staging and production are set by the production track from the server (the first developer
   approves).` and return exit code 1. This happens before the client is resolved, so no request can leave.
2. `set` also refuses (exit 1) when `telegram.webhook.secret` is empty, when the URL is not `https`, or when the
   URL's host is in `telegram.webhook.protected_hosts` (a dev machine must never point a bot at a server host).
3. `set` calls `setWebhook` with `url`, `secret_token`, `allowed_updates` and `max_connections` from config and
   `drop_pending_updates` = the option (default `false`). A `.loc` host gets a warning, because Telegram cannot
   reach it, and the call is still sent.
4. `info` prints `getWebhookInfo`: URL, `pending_update_count`, `last_error_date` in Asia/Tashkent,
   `last_error_message`, `max_connections`, `allowed_updates`. `delete` calls `deleteWebhook`.
5. No action prints the token or the secret. A Bot API error ends with exit 1 and a message without the token.

**`telegram:health {--json}`** — `App\Console\Commands\Telegram\HealthCommand`. Allowed in every environment,
because it only calls `getMe` and `getWebhookInfo`.

| Check | Passes when |
| ----- | ----------- |
| `token` | `getMe` answers; `Unauthorized` is reported as `token_invalid` |
| `username` | `getMe.username` equals `telegram.bot.username` |
| `url` | the webhook URL equals `telegram.webhook.url` |
| `allowed_updates` | the list equals `telegram.webhook.allowed_updates` |
| `last_error` | `last_error_date` is not newer than the one remembered from the previous run (cache key `telegram:health:last_error:{bot_id}`) |
| `pending` | `pending_update_count` < 100 |
| `stuck` | no ledger row has been `processing` for more than 10 minutes |

Exit 0 when all pass, else 1. `--json` prints the same fields. Each run sets the gauges below. A failed run writes
one log record at `error`, `telegram.health.failed`, with the names of the failed checks and no secret. When the
Bot API cannot be reached the run fails and `telegram_health_last_run_timestamp` is not updated.

### Metrics and schedule

`App\Services\Telegram\Metrics\BotMetrics` (interface: `increment(name, labels, by)`, `gauge(name, value,
labels)`, `read(name)`) with `RedisBotMetrics` and `ArrayBotMetrics`, chosen by `telegram.metrics.driver`. The
Redis driver keeps one hash per metric on the default connection, key `ops:metrics:<metric>`, field = the sorted
`label=value` pairs joined by commas (`_` without labels). This is the storage KV-INF-011 describes, so the
endpoint or exporter of WP-70 can publish the values without a change here. Labels never hold a user or chat id.

| Metric | Kind | Set by |
| ------ | ---- | ------ |
| `webhook_requests_total{status}` | counter | `RecordWebhookMetrics`, the outermost middleware of the `hooks` group |
| `telegram_updates_processed_total{type,result}`, result `done`, `failed`, `ignored`, `duplicate` | counter | the ledger and the job |
| `telegram_send_total{method,result}`, result `ok`, `429`, `403`, `400`, `401`, `5xx`, `transport` | counter | `TelegramClient` |
| `telegram_webhook_pending_updates`, `telegram_webhook_last_error_age_seconds`, `telegram_webhook_url_ok`, `telegram_webhook_allowed_updates_ok`, `telegram_updates_stuck`, `telegram_health_last_run_timestamp` | gauges | `telegram:health` |

`backend/routes/console.php` (conventions of KV-INF-007: `onOneServer()`, `withoutOverlapping()`, a time zone for
fixed hours):

| Entry | When | Environments |
| ----- | ---- | ------------ |
| `model:prune --model=App\Models\TelegramUpdate` | daily 03:30 Asia/Tashkent | all |
| `telegram:health` | every five minutes | `staging`, `production` |

### Test kit

`backend/tests/Support/Telegram/` (new folder; WP-40 keeps its `InitDataSigner` one level up, in
`backend/tests/Support/`, and it is not moved):

- `UpdateFactory`: `command('/start', payload)`, `text()`, `callback(data, messageId)`, `contact(userId, phone)`
  (default the synthetic `+998000000001`), `forwardedContact()`, `voice()`, `photo()`, `myChatMember(status)`,
  `inGroup()`, `editedMessage()`, `inlineQuery()`, `fromUser(id, languageCode, username, premium)`, `post()` (sends
  the update to the webhook with the test secret and host). `update_id` rises per factory instance; user ids are
  synthetic (`10_000_001` and up).
- `FakeBotApi`: installs `Http::fake()` for `{base_url}/bot*/*` and `{base_url}/file/bot*/*`, records
  `[method, params]`, and validates every call: text at most 4 096 and caption at most 1 024 characters,
  `callback_data` at most 64 bytes, HTML well formed with only the tags Telegram allows, `url` and `web_app`
  buttons `https`, a media group of two to ten items. The checks apply to every method that carries a text, a
  caption or a keyboard (`sendMessage`, `sendPhoto`, `sendVenue`, `sendMediaGroup`, `editMessageText`,
  `editMessageCaption`, `editMessageMedia`, `editMessageReplyMarkup`). Programmable answers: `ok`, `429` with
  `retry_after`, `403` blocked, `400` not modified, `401`, `500`, connection failure. Assertions: `assertSent()`,
  `assertSentInOrder()`, `assertNothingSent()`, `calls()`. When `parse_mode` is absent the HTML rules are not
  applied.
- `backend/tests/TestCase.php` calls `Http::preventStrayRequests()` in `setUp()` (no earlier package adds it
  there: WP-41 and WP-42 call it per test file).
- `backend/tests/Pest.php` binds `Tests\TestCase` to `Feature` only, so a file under `tests/Unit` has no
  application (the rule WP-41 states in its step 1). A test file that this and the later bot specifications list
  under `tests/Unit/Telegram/` but that needs a facade (`Http`, `Redis`, `Cache`), `config()`, `__()` or the
  container is created under `tests/Feature/Telegram/` with the same name; only tests of pure values
  (`UpdateRedactorTest` with an injected pepper) stay in `tests/Unit`.
- `backend/phpunit.xml` gets the synthetic values `config/telegram.php` reads: a username,
  `TELEGRAM_WEBHOOK_URL=https://hook.homi.test/telegram/webhook`, a secret, a ledger key and a pepper. The
  format-valid fake token is there since WP-40. No real value is ever used.

### What the production track does

| # | When | Action on the server | Check |
| - | ---- | -------------------- | ----- |
| 1 | Before the deploy | Approve the two migrations (`homi-deploy production --migrate`). `telegram_updates` must be empty: `select count(*)` returns 0 | the deploy log |
| 2 | Before the deploy | Put into `backend/.env` of staging and of production, from the password manager: `TELEGRAM_BOT_TOKEN` and `TELEGRAM_BOT_USERNAME` (present if the request of WP-40 was done), `TELEGRAM_WEBHOOK_URL` (`https://hook.staging.homi.uz/telegram/webhook`, `https://hook.homi.uz/telegram/webhook`), `TELEGRAM_WEBHOOK_SECRET` (at least 32 characters of `A-Z a-z 0-9 _ -`), `TELEGRAM_UPDATES_ENCRYPTION_KEY` (`php artisan key:generate --show` prints a suitable value without writing it), `PHONE_HMAC_PEPPER` (at least 32 random bytes). Values differ between the two environments. Then `systemctl restart horizon-homi-staging` and `horizon-homi` | `grep -o '^[A-Z_]*=' backend/.env` lists the six names |
| 3 | Once | Confirm `infra/staging/nginx/hook.staging.homi.conf` and `infra/production/nginx/hook.homi.conf` are live as committed: only `location ^~ /telegram/` and `= /up` reach PHP, `client_max_body_size 1m`, the request `Host` is passed unchanged (`fastcgi_params`), and no rule strips `X-Telegram-Bot-Api-Secret-Token` | `curl -X POST https://hook.<env>/telegram/webhook` answers `403`; the same path on `api.<env>` answers `404` |
| 4 | Once | Add the cron entry for `www-data` in both checkouts: `* * * * * php artisan schedule:run` (none existed on 2026-11-09, `docs/infrastructure/deployment.md`). WP-40 already asks that the scheduler runs; skip if it does | `php artisan schedule:list` shows the prune and `telegram:health` |
| 5 | After the deploy, staging first, the first developer approves each call | `setWebhook` for the environment's bot with the server-side script that track owns (`infra/server/**`; the token is read from the env file and never echoed): `url` = `TELEGRAM_WEBHOOK_URL`, `secret_token` = `TELEGRAM_WEBHOOK_SECRET`, `allowed_updates` = `["message","callback_query","my_chat_member"]`, `max_connections` = 40 | `php artisan telegram:health` exits 0 |
| 6 | Once | Alerting. Nothing new is required for production: the `ERROR` record `telegram.health.failed` raises the existing `HomiLaravelErrors` alert. Recommended in `homi-metrics`: read `<redis prefix>ops:metrics:telegram_health_last_run_timestamp` (alert when older than 15 minutes) and `…:telegram_webhook_pending_updates` (alert at 100 or more) | a deliberately wrong `TELEGRAM_WEBHOOK_URL` on staging makes `telegram:health` exit 1 |
| 7 | When the webhook secret is rotated | Write the new secret to `TELEGRAM_WEBHOOK_SECRET`, the old one to `TELEGRAM_WEBHOOK_SECRET_PREVIOUS`, the current UTC time to `TELEGRAM_WEBHOOK_SECRET_ROTATED_AT`; run `setWebhook` with the new `secret_token` within five minutes; remove the two extra keys afterwards | `telegram:health` exits 0 |

After step 5 the bot accepts updates and answers nothing until WP-52 is deployed. That is expected: the Mini App is
opened from the bot's profile, which does not need the webhook.

### Names other packages rely on

The specifications of WP-40 (test token in `phpunit.xml`, `tests/Support/InitDataSigner.php`) and of WP-43 (the
share service) are authoritative for their names; if they differ from the text above, use their names and do not
create a second class.

| Consumer | Uses |
| -------- | ---- |
| WP-43 | `TelegramClient::call('savePreparedInlineMessage', …)` or `TelegramBot::savePreparedInlineMessage()` |
| WP-47, WP-56 (erasure) | `TelegramUpdate::scopeForChat(int $chatId)` to delete a user's ledger rows (SEC-REQ-039) |
| WP-51 | `UpdateProcessor`, `TelegramBot`, the exception classes, `UpdateFactory`, `FakeBotApi`, `BotMetrics` |
| WP-56 (owner verification) | `message.contact.phone_hmac` in the stored update, `App\Services\Telegram\PhoneHmac::of(string $phone)` |
| WP-57 | `TooManyRequests::retryAfter()`, `ChatUnreachable`, `telegram_send_total` |
| WP-58 | the profile and command methods of `TelegramBot` |
| WP-70 | the `ops:metrics:*` hashes; the global log processor of SEC-REQ-047 is built there |

## Files

New:

- `backend/app/Http/Middleware/{LimitTelegramBody,RecordWebhookMetrics}.php`
- `backend/app/Telegram/Updates/{UpdateLedger,LedgerResult,UpdateRedactor,UpdateProcessor,NullUpdateProcessor}.php`
- `backend/app/Casts/EncryptedJsonPayload.php`, `backend/app/Services/Telegram/PhoneHmac.php`
- `backend/app/Telegram/Client/{TelegramBot,TelegramBotIdentity}.php`; `TelegramClient.php` and
  `TelegramException.php` in the same folder are moved from `backend/app/Services/Telegram/` and
  `backend/app/Exceptions/` (WP-43), not created
- `backend/app/Telegram/Client/Exceptions/{TooManyRequests,ChatUnreachable,MessageNotModified,MessageNotFound}.php`,
  `{MessageCantBeEdited,QueryTooOld,BadRequest,Unauthorized,ServerError,TransportError}.php` in the same folder
- `backend/app/Console/Commands/Telegram/{WebhookCommand,HealthCommand}.php`
- `backend/app/Services/Telegram/Metrics/{BotMetrics,RedisBotMetrics,ArrayBotMetrics}.php`
- `backend/database/migrations/<date>_add_type_and_chat_to_telegram_updates_table.php`,
  `<date>_change_payload_to_text_on_telegram_updates_table.php`
- `backend/tests/Support/Telegram/{UpdateFactory,FakeBotApi}.php`
- `backend/tests/Feature/Bot/{WebhookAuthenticityTest,WebhookLedgerTest,ProcessUpdateJobTest}.php`,
  `{UpdateLedgerPrivacyTest,WebhookCommandTest,TelegramHealthTest}.php` in the same folder
- `backend/tests/Pgsql/WebhookLedgerRaceTest.php`
- `backend/tests/Unit/Telegram/{UpdateRedactorTest,TelegramClientTest,TelegramBotTest}.php`,
  `{TelegramExceptionMappingTest,UpdateFactoryTest,FakeBotApiTest,BotMetricsTest}.php` in the same folder
- `docs/infrastructure/telegram-webhook.md`

Changed:

- `backend/app/Http/Middleware/VerifyTelegramSecretToken.php`,
  `backend/app/Http/Controllers/Webhooks/TelegramWebhookController.php`,
  `backend/app/Jobs/Telegram/ProcessTelegramUpdateJob.php`, `backend/app/Models/TelegramUpdate.php` (cast, new
  columns, `scopeForChat`), `backend/database/factories/TelegramUpdateFactory.php` (no names in the sample payload)
- `backend/routes/hooks.php` (domain), `backend/routes/console.php` (two schedule entries; the `inspire` sample goes
  if it is still there), `backend/bootstrap/app.php` (`hooks` group), `backend/app/Providers/AppServiceProvider.php`
  (limiter key, bindings), `backend/config/telegram.php`
- `backend/tests/TestCase.php`, `backend/phpunit.xml`
- `backend/app/Services/Telegram/ShareService.php` and the share tests of WP-43 (imports of the moved client and
  exception); `backend/config/erasure.php` of WP-47 (the `custom` entry of `telegram_updates` becomes
  `TelegramUpdate::forChat($telegramId)->delete()`)
- Shared files, in a small separate PR reviewed by the other developer, merged first: `backend/.env.example`
  (`TELEGRAM_WEBHOOK_SECRET_PREVIOUS`, `TELEGRAM_WEBHOOK_SECRET_ROTATED_AT`, `TELEGRAM_UPDATES_ENCRYPTION_KEY`,
  `TELEGRAM_UPDATES_RETENTION_DAYS=14`, `PHONE_HMAC_PEPPER`), `docs/infrastructure/environments.md` (the names),
  `docs/infrastructure/local-development.md` (one line linking the new document; it still mentions a tunnel, which
  DEC-45 dropped), `HANDOFF.md` (T1 done)

## Steps

Create classes with `php artisan make:* --no-interaction` (`make:class` for plain classes). Write the tests of a
step first. Run `vendor/bin/pint --dirty --format agent` after every PHP edit. Generator facts of the installed
framework: `make:enum` and `make:exception` write under `App\Enums` (the folder exists) and `App\Exceptions`, so
`LedgerResult` (an enum) and the classes of `app/Telegram/Client/Exceptions/` are created with `make:class
Telegram/…` and edited by hand; `make:interface Telegram/Updates/UpdateProcessor` writes to `App\Telegram\Updates`
only while neither `app/Contracts` nor `app/Interfaces` exists — check, else use `make:class`; the classes under
`backend/tests/Support/` have no generator and are written by hand.

1. Shared-file PR: the env names in `backend/.env.example` and `docs/infrastructure/environments.md`.
2. Test kit, part 1: `UpdateFactory`, `Http::preventStrayRequests()`, the synthetic values in `phpunit.xml`,
   `UpdateFactoryTest`.
3. `TelegramBotIdentity`; `config/telegram.php` (`webhook.host`, previous secret, `rate_limit`, three
   `allowed_updates`).
4. Authenticity: `VerifyTelegramSecretToken`, `LimitTelegramBody`, the domain in `routes/hooks.php`, the limiter
   key. `WebhookAuthenticityTest` green. The controller still answers `501`.
5. Migration `add_type_and_chat_to_telegram_updates_table`; model and factory.
6. `UpdateLedger` and the controller: decode, type filter, `insertOrIgnore`, dispatch. `WebhookLedgerTest` green.
7. The job: order per chat, atomic claim with orphan recovery, `UpdateProcessor` with the null implementation,
   failure handling. `ProcessUpdateJobTest` green.
8. Privacy: `PhoneHmac`, `UpdateRedactor`, `EncryptedJsonPayload`, the migration
   `change_payload_to_text_on_telegram_updates_table`, `scopeForChat`, the `telegram_updates` entry of
   `config/erasure.php` (WP-47 left it to this package). `UpdateRedactorTest` and `UpdateLedgerPrivacyTest` green.
9. Schedule the prune. **End of part A**: the pipeline stores and completes updates; nothing is sent.
10. `BotMetrics` with both drivers; `RecordWebhookMetrics`; counters in the ledger and the job.
11. `TelegramException` and its subclasses; `TelegramClient` (or the extension of the WP-43 class);
    `TelegramExceptionMappingTest`, `TelegramClientTest`.
12. Test kit, part 2: `FakeBotApi` with its validators and `FakeBotApiTest`.
13. `TelegramBot` wrappers; `TelegramBotTest` asserts method names and parameters through `FakeBotApi`.
14. `telegram:webhook` with `WebhookCommandTest`.
15. `telegram:health`, its gauges and its schedule entry, `TelegramHealthTest`.
16. `docs/infrastructure/telegram-webhook.md`: the flow, the response table, ledger states, stored data, env keys,
    the client and the Bot API version checked, both commands, the meaning of each health check, secret rotation,
    and the section "Production track" (the table above). Link it from `local-development.md`.
17. `make ci-backend`; `make test-pgsql` (the `Pgsql` suite of WP-03, against `homi_test`); security review by the
    `security-reviewer` agent (secrets, phones, retention); fill the PR description (migrations, env names, new
    scheduled tasks, new commands); mark T1 done in `HANDOFF.md` through the shared-file PR.

## Behaviour to reproduce

The legacy receiver cannot be observed (its source is not available), so there is no legacy screen to copy. What
this package must keep are the properties the bot's users were promised and the scenarios of the later packages
depend on.

| Property | Source | How it is kept |
| -------- | ------ | -------------- |
| One update has one effect, also when Telegram delivers it twice | SEC-REQ-009; `04` §3 relies on it for every scenario | unique (`bot_id`, `update_id`), `insertOrIgnore`, atomic claim |
| Updates of one chat are applied in order | wizard steps and card buttons assume it | the per-chat check of the job |
| Telegram never sees a handler failure | SEC-REQ-010 | `200` after the insert; failures end in a `failed` row |
| "Имя и контакты бот не хранит" | BR-BOT-085, the `/privacy` text | allow-list redaction before the insert |
| "Сами сообщения и голос бот не сохраняет" | BR-BOT-055 | `afterProcessing()` removes texts, captions and media |
| The owner's number is kept only as a hash | BR-BOT-081 | `phone_hmac` replaces the number before the insert |
| Deletion on request includes raw updates | BR-BOT-094, SEC-REQ-039 | `scopeForChat()` for the erasure service; retention of 14 days |
| The Bot API feature set of the legacy bot | BR-API-141, `04` §1 | the method table of `TelegramBot` |

Defects fixed (both are findings on the existing HOMI stubs):

- The route has no host constraint and the limiter is keyed by IP only (SEC-031) → domain binding, key `bot + IP`.
- The ledger stores raw updates, is never pruned, and subscribes to `edited_message` and `chat_member` (SEC-030) →
  redaction, encryption, the scheduled prune, three update types.

Edge cases:

- A callback delivered again after its row was pruned is a new row; handlers stay idempotent on the target state
  (WP-51 and later).
- `from` missing (channel posts): stored without a user object; the router of WP-51 ignores it.
- A contact shared by another person is hashed like any other; the owner handler of WP-56 refuses it later. The raw
  number is never stored either way.
- Rotation of `TELEGRAM_UPDATES_ENCRYPTION_KEY`: rows written with the old key cannot be decrypted; unprocessed
  ones end `failed` and are gone after 14 days. Rotate when the `telegram` queue is empty.
- `chat_id` in a private chat equals the Telegram user id. It is personal data covered by the retention and the
  erasure scope, and it is never a log field or a metric label.
- Two developers sharing one dev bot overwrite each other's webhook (`docs/handoff/parallel-work.md` §7).

No `DEV` item and no text, button or handler belong to this package.

## Tests

Layers of `25` §9: Pest unit and Pest feature. The conversation layer starts in WP-51. Synthetic tokens and secrets
only; the token must not appear in any captured log record of the run.

**Feature — `WebhookAuthenticityTest`**

| # | Case | Expected |
| - | ---- | -------- |
| 1 | no header | 403, no row, nothing queued (`Queue::fake()`) |
| 2 | wrong header | 403 |
| 3 | the header holds another environment's secret | 403 |
| 4 | configured secret empty, request without header | 403 |
| 5 | configured secret empty, request with an empty header | 403 |
| 6 | correct secret, host `api.homi.test` | 404 |
| 7 | correct secret, 2 MB body | 413 |
| 8 | correct secret, `text/plain` | 415 |
| 9 | `webhook.rate_limit` set to 3, four requests from one IP | the fourth 429; a second bot id has its own bucket |
| 10 | previous secret at rotation + 4 min and + 6 min (`travelTo`); previous secret without the timestamp | passes, 403, 403 |
| 11 | correct secret on the hook host | reaches the controller |
| 12 | `TELEGRAM_WEBHOOK_URL` empty at boot | 404 on every host |
| 13 | captured log records of cases 1–11 | neither secret appears |

**Feature — `WebhookLedgerTest`, `ProcessUpdateJobTest`**

| # | Case | Expected |
| - | ---- | -------- |
| 1 | `UpdateFactory::command('/start')` posted once | 200 `{"ok":true}`, one row `received`, one job on `telegram` |
| 2 | the same update posted twice | second answer `duplicate:true`; one row; one job |
| 3 | the same update accepted ten times in parallel — `backend/tests/Pgsql/WebhookLedgerRaceTest.php`, base class and helper `concurrently()` of WP-03; each task is a static closure that calls `UpdateLedger::accept()` in a child process and returns its `LedgerResult` | one `Stored`, nine `Duplicate`, one row |
| 4 | same `update_id`, second synthetic token | two rows, both processed |
| 5 | `edited_message`, `inline_query`, `chat_member` | 200, no row |
| 6 | body `[]`, body without `update_id`, `update_id: -1` | 400, no row |
| 7 | the job run twice for one row | the second run claims nothing |
| 8 | jobs for updates 11 and 10 of one chat, 11 first (`withFakeQueueInteractions()`) | 11 is released with delay 1 until 10 is `done` |
| 9 | a row of another chat still `received` | does not block this chat |
| 10 | the processor throws three times (the update is posted under `Queue::fake()`; the test then calls `handle()` three times and, as the worker does after the third exception, `failed($e)`) | after each throw the row is `received` again; at the end `failed`; `error` holds the class and no payload text; the webhook had answered 200 |
| 11 | a row left `processing` 61 s ago, job delivered again | re-claimed and finished |
| 12 | a row `processing` for 5 s, job delivered again | not claimed |
| 13 | insert fails (ledger key missing) | 5xx, no job, one error record |

**Feature — `UpdateLedgerPrivacyTest`; unit — `UpdateRedactorTest`**

| # | Case | Expected |
| - | ---- | -------- |
| 1 | `contact(userId: A, phone: '+998000000001')` stored | `phone_hmac` present; no `phone_number`, no `first_name` |
| 2 | the same number with spaces and without `+` | the same `phone_hmac` |
| 3 | `from` with a username | `has_username: true`, no `username` key |
| 4 | a forwarded message with a named origin | `is_forwarded: true`; a recursive scan finds none of `first_name`, `last_name`, `username`, `title`, `vcard`, `phone_number` |
| 5 | a text message processed | no `text` afterwards; `update_id` and `date` kept |
| 6 | a callback processed | no `data` and no message text afterwards |
| 7 | a text message whose processor fails three times | row `failed`, payload encrypted, text present until the prune |
| 8 | the raw column read with `DB::table()` | not JSON; decrypts with the ledger key; decrypting with `APP_KEY` throws |
| 9 | `travelTo(now()->addDays(15))`, `artisan('model:prune', ['--model' => [TelegramUpdate::class]])` (not `schedule:run`: a scheduled command runs in a child process, which cannot see the in-memory SQLite database; case 11 covers the schedule) | rows older than 14 days gone, newer kept |
| 10 | `scopeForChat($chatId)->delete()` | only that chat's rows gone |
| 11 | `Schedule::events()` | the prune and the health check use `onOneServer` and `withoutOverlapping`; the prune names `Asia/Tashkent` |

**Unit — client and kit**

| # | Case | Expected |
| - | ---- | -------- |
| 1 | `sendMessage` with `parse_mode: HTML` and an inline keyboard with `style: primary` | captured parameters match; validators pass |
| 2 | fake answers `429 retry_after=3` | `TooManyRequests`, `retryAfter() === 3`, no second request |
| 3 | fake answers `500` twice, then `200`, `retries = 2` | result after three requests |
| 4 | each row of the exception table | the named class |
| 5 | connection exception | `TransportError`; the message contains `/bot***/` and not the synthetic token |
| 6 | `setMyCommands` with `scope: {type: chat, chat_id}` and `language_code: uz` | parameters as documented |
| 7 | `sendPhoto` with a file | multipart request with caption and `parse_mode` |
| 8 | `downloadFile()` fails | exception message without the token |
| 9 | `serialize()` of a job that holds `TelegramBot` | no token substring |
| 10 | every method of the method table | sends its Bot API method name (dataset) |
| 11 | `FakeBotApi`: a 65-byte `callback_data`, a 4 097-character text, `<script>`, an unclosed `<b>`, an `http://` button | each rejected with a clear message |
| 12 | a test that makes a real HTTP request | fails because of `preventStrayRequests()` |
| 13 | `UpdateFactory` | ascending unique `update_id`; a contact belongs to `from.id` unless forwarded |
| 14 | `BotMetrics` array and Redis drivers; the Redis driver runs against a mocked `Redis` facade, because CI starts no Redis service (`.github/workflows/backend.yml` has PostgreSQL only) | the same values for the same calls; the hash key and the sorted label field are the documented ones |

**Feature — `WebhookCommandTest`, `TelegramHealthTest`**

| # | Case | Expected |
| - | ---- | -------- |
| 1 | `APP_ENV=production`, `telegram:webhook set` | exit 1, the refusal line, `assertNothingSent()` |
| 2 | `APP_ENV=staging`, `info` and `delete` | exit 1, nothing sent |
| 3 | `local`, secret empty, `set` | exit 1, "secret is not configured" |
| 4 | `local`, URL host `hook.homi.uz` | exit 1, nothing sent |
| 5 | `local`, `set` | `setWebhook` with the URL, `secret_token`, three `allowed_updates`, `max_connections=40`, `drop_pending_updates=false` |
| 6 | `local`, `set --drop-pending` | `drop_pending_updates=true` |
| 7 | `local`, `info` with a fake `last_error_date` | the date in Asia/Tashkent; the output has neither secret nor token |
| 8 | fake answers `401` | exit 1, message without the token |
| 9 | health: URL equals config, pending 0, no error | exit 0; `telegram_webhook_url_ok` 1 |
| 10 | health: another URL; pending 150; `allowed_updates` with `edited_message`; a username mismatch | exit 1 each, with the matching gauge |
| 11 | health: `last_error_date` two minutes ago, the previous run saw none; then a third run with the same date | exit 1, age 120; then exit 0 |
| 12 | health: a row `processing` for 11 minutes | exit 1, `telegram_updates_stuck` 1 |
| 13 | health `--json` | valid JSON with the listed fields, no token |
| 14 | health with `APP_ENV=production` | only `getMe` and `getWebhookInfo` in `FakeBotApi::calls()` |
| 15 | the job processes three updates, one fails | `telegram_updates_processed_total{type="message",result="done"}` 2, `result="failed"` 1 |

## Acceptance checklist

- [ ] Every refused case of the response table leaves `telegram_updates` empty and queues nothing.
- [ ] A repeated update, in sequence and in parallel on PostgreSQL, gives one row and one job (Phase 7 scenario F
      of `HANDOFF.md` T1).
- [ ] Two updates of one chat are processed in `update_id` order even when the later job runs first.
- [ ] A failing processor gives `200` to Telegram and a `failed` row with no payload text in `error`.
- [ ] After a contact update is stored and processed, the decrypted payload holds no digit sequence of the phone,
      no name, no username and no text; the raw column is ciphertext that `APP_KEY` cannot open.
- [ ] `php artisan schedule:list` shows the daily prune and, on the servers, `telegram:health` every five minutes.
- [ ] Every method of the client table sends the documented method name; each Telegram answer maps to its class.
- [ ] No test output, exception message, log record or serialised job contains the synthetic token or secret.
- [ ] `telegram:webhook` exits 1 without a request under `staging` and `production`.
- [ ] `telegram:health` makes no write call in any environment and exits 1 for each failing check.
- [ ] `docs/infrastructure/telegram-webhook.md` exists, is linked from `local-development.md`, names the Bot API
      version that was checked, and its "Production track" section was read by the first developer.
- [ ] The env names are in `backend/.env.example` and `docs/infrastructure/environments.md` (shared-file PR merged).
- [ ] `make ci-backend` exits 0; the `Pgsql` suite is green in CI; the package registry is unchanged (no dependency).
- [ ] On staging, then on production, with the production track: the migrations ran; `telegram:health` exits 0;
      `getWebhookInfo` lists exactly `message`, `callback_query`, `my_chat_member`; a message sent to the bot from a
      phone produces one row that reaches `done` within seconds, with a redacted payload; the bot sends no reply.
- [ ] `HANDOFF.md` T1 is marked done; the queue row is `DONE`.

## Handoff

Empty — nobody has started this package.
