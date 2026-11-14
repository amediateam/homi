# WP-59 — Support bot

| Field | Value |
| ----- | ----- |
| Stage | D |
| Status | TODO |
| Depends on | WP-58 (and through it WP-50, WP-51, WP-47: the webhook pipeline, the text and locale layer, the erasure and retention registries, the profile command) |
| Size | about 1 800 changed lines, M |
| Behaviour reference | `24` §8.1 (DEC-56), `25` §6 "Support bot"; answers 50 and 51 of `decisions/2026-11-14-developer-answers.md`; `10` (GAP-026: the legacy support bot was not audited, so there is no legacy behaviour to copy); WP-50 (request path, ledger, redaction, client), WP-51 (locale, texts, limits), WP-47 (registries), WP-58 (profile); `16` §4 (SEC-REQ-008, SEC-REQ-027, SEC-REQ-036, SEC-REQ-047) |
| Needs from the production track | (1) A support bot per environment, created in BotFather by the owner of the bots: one for staging, one for production; group privacy stays on; the bot is not added to any group. (2) Server env of staging and of production, separate values each: `TELEGRAM_SUPPORT_BOT_TOKEN`, `TELEGRAM_SUPPORT_WEBHOOK_URL` (`https://hook.staging.homi.uz/telegram/support/webhook`, `https://hook.homi.uz/telegram/support/webhook`), `TELEGRAM_SUPPORT_WEBHOOK_SECRET` (random, at least 32 characters), `TELEGRAM_SUPPORT_OPERATOR_IDS` (Telegram user ids of the operators, comma-separated; the product owner names them). (3) Approval of one migration with three new empty tables. (4) After the deploy: `setWebhook` for the support bot with the server-side script that track owns, `allowed_updates` `message` and `my_chat_member`. (5) Each operator presses Start in the support bot once. (6) Only after the check inside Telegram: set `TELEGRAM_SUPPORT_USERNAME` (the key exists since WP-11) — this is what makes the support buttons appear. No nginx change is expected: `location ^~ /telegram/` of the hook vhosts already covers the new path; confirm it |

## Goal

HOMI has its own support bot. A person writes to it; the bot relays the message to the private chats of the
operators and relays an operator's reply back. The support buttons of the Mini App, the main bot and the landing
lead to it. HOMI stores who talked and when, never what was said.

## Scope

In: a second bot on the webhook pipeline of WP-50 (route, secret, ledger, job, client); threads, relays and
operators; the user flow and the operator flow with four operator commands; texts in three languages; limits;
erasure and retention entries; the profile of the support bot; a status command; tests.

Out: an operators' workplace outside Telegram (the admin panel is after Wave 1, DEC-43); operators' groups or forum
topics (answer 51 chose private chats); automatic summaries or answers by a language model (legacy had summaries;
not decided for HOMI); a takedown workflow inside the bot — an operator who receives an author's request runs
`php artisan delivery:withdraw {number} --cause=takedown` of WP-57 on the server; any change to the main bot's
handlers.

## Decisions that bind this package

- HOMI's own support bot, operators answer in their private chat with it (DEC-56, answers 50 and 51).
- This is not a parity item: legacy's support bot was never audited (GAP-026). The acceptance is the checklist of
  this file, not a comparison with legacy.
- One bot per environment, as for the main bot (`25` §11): a token of staging never works on production.
- Personal data (SEC-REQ-036, SEC-REQ-047): no message text, name or username is written to a table or a log. The
  ledger keeps the redacted, encrypted update only until it is processed (WP-50).
- Tests never reach Telegram: `FakeBotApi` and `UpdateFactory` of WP-50 only.
- No new dependency. Bot API facts (method and field names, limits, error descriptions) could not be confirmed
  offline: verify each against the Bot API documentation before writing it.

## Design

### Two bots on one pipeline

WP-50 built the pipeline for one bot. This package gives every piece a bot key, `main` or `support`; `main` is the
default everywhere, so no caller of WP-50 … WP-58 changes.

| Piece of WP-50 | Change |
| -------------- | ------ |
| `TelegramBotIdentity` | `for(string $bot = 'main'): self`; the token comes from `telegram.bot.token` or `telegram.support.token` |
| `TelegramClient`, `TelegramBot` | constructed with the bot key (never with the token; the token is still read from config at call time); `TelegramBot::fromConfig(string $bot = 'main')`. The container singleton `TelegramBot` stays the main bot. New wrapper `copyMessage` |
| Route | a second route `POST /telegram/support/webhook`, name `hooks.telegram.support`, in the same domain group and with the same middleware as `hooks.telegram`, each parameterised with `support` |
| `VerifyTelegramSecretToken` | takes the bot key as a middleware parameter; for `support` it compares with `telegram.support.webhook_secret`. The secret of one bot is refused on the route of the other (`403`). No previous-secret window for the support bot |
| Limiter `telegram-webhook` | the key uses the bot id of the route's bot |
| `UpdateLedger::accept()` | second parameter `string $bot = 'main'`; `bot_id` and the list of allowed updates come from that bot (`support`: `message`, `my_chat_member`) |
| `ProcessTelegramUpdateJob` | already carries `$botId`. It asks `App\Telegram\Updates\UpdateProcessorResolver::for(int $botId): UpdateProcessor`, which returns the bound `UpdateProcessor` (the router of WP-51) for the main bot and `SupportUpdateProcessor` for the support bot; an unknown bot id marks the row `failed` |
| `telegram:webhook`, `telegram:health`, `telegram:profile` | option `--bot=main\|support` (default `main`); `telegram:health` checks the support bot too when its token is set |

While `telegram.support.token` is blank the support route answers `403` to everything (unconfigured secret), the
health check skips the bot, and `GET /reference` carries no support name, so no support button is shown anywhere.

### Configuration

`backend/config/telegram.php`, block `support` (the key `support.username` exists since WP-11):

| Config key | Env name | Default |
| ---------- | -------- | ------- |
| `support.token` | `TELEGRAM_SUPPORT_BOT_TOKEN` | blank |
| `support.webhook_url` | `TELEGRAM_SUPPORT_WEBHOOK_URL` | blank; must be on the host of `telegram.webhook.host` |
| `support.webhook_secret` | `TELEGRAM_SUPPORT_WEBHOOK_SECRET` | blank |
| `support.operator_ids` | `TELEGRAM_SUPPORT_OPERATOR_IDS` | empty list; parsed from a comma-separated string, positive integers only |
| `support.operator_locale` | — | `ru` |
| `support.limits.user_messages_per_hour` | — | 20 |
| `support.header_gap_minutes` | — | 30 |
| `support.receipt_gap_hours` | — | 12 |

### Tables

One migration, `create_support_tables`.

| Table | Columns |
| ----- | ------- |
| `support_threads` | `id`; `telegram_chat_id` bigint, unique — the person's private chat with the support bot; `user_id` nullable, foreign key to `users`, `nullOnDelete`; `locale` string 5; `listing_number` unsigned bigint, null; `status` string 16 (`open`, `closed`); `chat_state` string 16 (`active`, `blocked`); `blocked_at` timestampTz null; `last_user_message_at`, `last_operator_message_at` timestampTz null; timestamps |
| `support_relays` | `id`; `thread_id` foreign key, `cascadeOnDelete`; `operator_chat_id` bigint; `operator_message_id` bigint; `created_at`. Unique (`operator_chat_id`, `operator_message_id`); index `thread_id` |
| `support_operators` | `telegram_user_id` bigint primary key; `chat_state` string 16 (`unknown`, `active`, `blocked`); `last_seen_at` timestampTz null; timestamps |

A relay row means: "this message in this operator's chat belongs to this thread". It is what turns an operator's
reply into an answer to the right person. Enums `App\Enums\Support\{ThreadStatus,ChatState}` (run
`php artisan make:enum Support/ThreadStatus --string`; the folder `app/Enums` exists, so the class lands in
`App\Enums\Support`). Models `SupportThread`, `SupportRelay`, `SupportOperator` with factories.

`user_id` is a lookup, not a sign-up: when a HOMI user with the same Telegram id exists (the identity columns of
WP-40) the thread points at it; the support bot never creates a `users` row. Use a read-only lookup on
`UserResolver` (`findByTelegramId(int $id): ?User`; add it if WP-40 has none).

### `SupportUpdateProcessor` (`App\Telegram\Support`)

Implements `UpdateProcessor`. It receives the redacted update of WP-50: user and chat objects carry only ids and
`language_code`; the message body is present until the job finishes.

1. Not a private chat → `leaveChat` and stop (the support bot serves private chats only).
2. `my_chat_member` → set `chat_state` on the thread, or on the operator row when the sender is an operator.
3. The sender's id is in `support.operator_ids` → operator flow. Otherwise → user flow.

**User flow.**

| Step | Rule |
| ---- | ---- |
| Thread | `SupportThread::firstOrCreate` on `telegram_chat_id` (`createOrFirst`, race-safe); a `closed` thread becomes `open`; `locale` is the HOMI user's language when `user_id` is set, else from `language_code` by the resolver of WP-40 (`uz`, `en`, otherwise `ru`); `last_user_message_at` is set |
| `/start`, `/start l_<number>` | the payload `l_<number>` (positive integer, the form `supportUrl()` of the Mini App builds — see "Files", WP-21) stores `listing_number`; any other payload is ignored. Answer `support.welcome`. Nothing is relayed |
| Blocked thread | `blocked_at` set → answer `support.blocked` at most once per 24 hours (cache key per thread), relay nothing |
| Limit | more than `user_messages_per_hour` messages in the last hour (`RateLimiter`, key per thread) → answer `support.too_many` once per hour, relay nothing |
| Kind | text, photo, document, voice, video are relayed; anything else (sticker, contact, location, poll, …) → answer `support.unsupported`, relay nothing |
| Relay | for every operator whose `chat_state` is not `blocked`: when the last relay of this thread to that operator is older than `header_gap_minutes` (or there is none), first `sendMessage` the header; then `copyMessage` the person's message into the operator's chat. Every sent message gives one `support_relays` row. `ChatUnreachable` (the operator blocked the bot or the account is gone) or a `BadRequest` that says the chat was not found (the operator never pressed Start) sets that operator's `chat_state` to `blocked` and continues with the others; the exception classes are those of WP-50 |
| Nobody reachable | no operator configured, or every send failed → answer `support.unavailable`, log `support.no_operator` at `error` level with the thread id only (it raises the existing error alert) |
| Receipt | when at least one relay succeeded and the previous message of this person is older than `receipt_gap_hours` (or this is the first) → answer `support.received`; otherwise no answer |

The header, in the operators' language: thread number, the person's language, `HOMI user #<id>` or "not a HOMI
user", the listing number when the thread has one. No name, no username, no phone: the redacted update does not
contain them and the header must not look them up.

**Operator flow.**

| Message of an operator | Effect |
| ---------------------- | ------ |
| `/start`, `/help` (not a reply) | upsert `support_operators` with `chat_state = active`; answer `support.operator.hello` (how to answer, the four commands) |
| A reply to a relayed message (`reply_to_message.message_id` found in `support_relays` for this chat) | `copyMessage` the operator's message to the thread's `telegram_chat_id`; set `last_operator_message_at`; then tell every other reachable operator: `sendMessage` `support.operator.answered` (thread number) and `copyMessage` the answer, each with a relay row, so they can continue the same thread. When the person has blocked the bot (`ChatUnreachable`) → set the thread's `chat_state` and answer `support.operator.user_unreachable` |
| `/close` as a reply | thread `closed`; answer `support.operator.closed`. The person is told nothing; their next message reopens the thread |
| `/block`, `/unblock` as a reply | set or clear `blocked_at`; answer `support.operator.blocked` or `support.operator.unblocked` |
| `/who` as a reply | answer the header again |
| Anything that is not a reply, or a reply to a message without a relay row | answer `support.operator.hint` |

An operator id never gets a thread of its own. `failed()` of the processor answers `support.error` to the sender
inside a `try` that swallows and logs.

### Texts

`backend/lang/{ru,uz,en}/support.php`, rendered with `BotText`, `BotLocale` and `Html` of WP-51 (no second text
layer). Operator texts are rendered in `support.operator_locale`. Russian values:

| Key | ru |
| --- | -- |
| `welcome` | «Здравствуйте! Это поддержка :brand. Напишите вопрос одним сообщением — оператор ответит здесь.» |
| `received` | «Сообщение получено. Оператор ответит в этом чате.» |
| `unavailable` | «Сейчас не можем принять сообщение. Попробуйте, пожалуйста, позже.» |
| `too_many` | «Слишком много сообщений подряд. Подождите немного — мы уже читаем предыдущие.» |
| `unsupported` | «Мы принимаем текст, фото, документы, голосовые и видео. Отправьте, пожалуйста, в одном из этих видов.» |
| `blocked` | «Переписка с поддержкой приостановлена.» |
| `error` | «Что-то пошло не так. Попробуйте ещё раз.» |
| `operator.hello` | «Вы оператор поддержки :brand. Отвечайте реплаем на сообщение пользователя. Команды реплаем: /close — закрыть, /block и /unblock — остановить и вернуть переписку, /who — кто пишет.» |
| `operator.header` | «Обращение №:number · язык :locale · :who:listing» |
| `operator.answered` | «Оператор ответил в обращении №:number:» |
| `operator.hint` | «Ответьте реплаем на сообщение пользователя.» |
| `operator.user_unreachable` | «Пользователь остановил бота: ответ не доставлен.» |
| `operator.closed`, `operator.blocked`, `operator.unblocked` | «Обращение №:number закрыто.» / «Переписка №:number остановлена.» / «Переписка №:number возобновлена.» |

The uz and en values of the seven user-facing keys are written in this package and marked for proofreading in
`backend/tests/Fixtures/Bot/translation-status.json` (the file of WP-51; Q-BOT-014). The operator keys exist in
`ru` only; the catalogue parity test of WP-51 gets an allow-list entry for the `operator.*` group.

### Profile, status, action log

- `backend/config/telegram_profile.php` gets a block `support`: name `:brand · поддержка` (per language), a
  description and a short description from `support.php` (`profile.*` keys), one command `/start`, the default menu
  button. `telegram:profile diff --bot=support` and `sync --bot=support` follow the rules of WP-58.
- `php artisan telegram:support status`: one line per configured operator (id, `chat_state`, `last_seen_at`), the
  number of open threads and of threads without an operator answer for more than 24 hours. No names, no text.
- Action log (WP-47): `ActionChannel` gains the case `Support`; events `support_thread_opened`,
  `support_message_relayed`, `support_reply_sent` are added to `config/analytics.php` with no properties other than
  `kind` (the message kind). They are recorded only when the thread has a `user_id`.

### Erasure and retention

- `config/erasure.php`: `support_threads` by `user_id` and by the Telegram id of the erased user — strategy
  `delete` (relays go with the cascade). The «Удалить мои данные» of the main bot (WP-56) thereby removes the
  person's support thread.
- `config/retention.php`: `support_relays` older than 90 days by `created_at` → `delete`; `support_threads` with
  status `closed`, or without a message from either side for 180 days → `delete`.
- The registry tests of WP-47 must pass with the three new tables (`support_operators` holds staff ids, not users:
  it is listed in the allow-list with that reason).
- Note for the privacy text (Q-SEC-021, product owner): messages sent to the support bot are passed to the
  operators' Telegram accounts and are not stored by HOMI.

## Files

New:

- `backend/database/migrations/<date>_create_support_tables.php`
- `backend/app/Models/{SupportThread,SupportRelay,SupportOperator}.php` with factories
- `backend/app/Enums/Support/{ThreadStatus,ChatState}.php`
- `backend/app/Telegram/Support/{SupportUpdateProcessor,SupportRelayService,SupportOperators,SupportHeader}.php`
- `backend/app/Telegram/Updates/UpdateProcessorResolver.php`
- `backend/app/Console/Commands/Telegram/SupportStatusCommand.php`
- `backend/lang/{ru,uz,en}/support.php`
- `backend/tests/Feature/Support/{SupportWebhookTest,SupportUserFlowTest,SupportOperatorFlowTest,SupportPrivacyTest,SupportStatusCommandTest}.php`,
  `backend/tests/Pgsql/SupportThreadRaceTest.php`

Changed:

- `backend/config/telegram.php` (block `support`), `backend/config/telegram_profile.php`,
  `backend/config/erasure.php`, `backend/config/retention.php`, `backend/config/analytics.php`
- `backend/routes/hooks.php` (the second route)
- `backend/app/Http/Middleware/VerifyTelegramSecretToken.php`,
  `backend/app/Http/Controllers/Webhooks/TelegramWebhookController.php`,
  `backend/app/Jobs/Telegram/ProcessTelegramUpdateJob.php`, `backend/app/Providers/AppServiceProvider.php` (the
  limiter key)
- `backend/app/Telegram/Client/{TelegramClient,TelegramBot,TelegramBotIdentity}.php`,
  `backend/app/Telegram/Updates/UpdateLedger.php`
- the three commands `telegram:webhook`, `telegram:health`, `telegram:profile` (option `--bot`)
- `backend/app/Enums/Analytics/ActionChannel.php`; `backend/app/Services/Identity/UserResolver.php` (the lookup, if
  missing)
- `backend/tests/Fixtures/Bot/translation-status.json`; `backend/phpunit.xml` (test values of the four support keys)
- `frontend/app/lib/telegram/build.ts` only if `supportUrl(username, number)` of WP-21 does not already build
  `https://t.me/<username>?start=l_<number>`: align it and its test
- `docs/infrastructure/telegram-webhook.md`: section "Support bot" (route, env keys, operator onboarding, the
  commands)
- Shared files, in a small separate PR merged first: `backend/.env.example` (the four `TELEGRAM_SUPPORT_*` keys,
  blank) and their names in `docs/infrastructure/environments.md`

## Steps

1. Read WP-50 "Request path", "Ledger", "Redaction and encryption", "The job", "Bot API client"; WP-51 "Locale,
   text and formatting"; WP-47 on the two registries; the skills `.claude/skills/laravel-best-practices/` and
   `.claude/skills/laravel-testing/`; the agent rules in `.ai/agents/telegram-bot-engineer.md`.
2. The shared-file PR for the env keys.
3. Tests first: `SupportWebhookTest` (the route, the two secrets, the ledger keeps the two bots apart). See them
   fail.
4. The bot key through the client, the identity, the middleware, the ledger, the controller and the job;
   `UpdateProcessorResolver`. Run the whole suite of WP-50 … WP-58: nothing of the main bot may change.
5. Migration, enums, models, factories.
6. `SupportUpdateProcessor` with the user flow; then the operator flow; texts in `ru`; then `uz` and `en`.
7. Erasure and retention entries; the `ActionChannel` case and the three events.
8. Profile block and the `--bot` option of the three commands; `telegram:support status`.
9. `vendor/bin/pint --dirty --format agent`, `composer types:check`, `php artisan test --compact`,
   `make test-pgsql`.
10. Ask `.ai/agents/security-reviewer.md` for a review of the diff (personal data, the second secret, operator
    authority).
11. After merge and deploy: the production track's steps of the field table on staging, then the check inside
    Telegram below; repeat on production; only then `TELEGRAM_SUPPORT_USERNAME`.

## Behaviour to reproduce

There is no legacy behaviour (GAP-026). Rules that must hold:

- Only a Telegram id listed in `support.operator_ids` can answer a person, close or block a thread. A person who
  replies to the bot's own messages, or who sends `/close`, is in the user flow.
- An operator's answer reaches exactly the person whose message was replied to — resolved by the relay row of that
  operator's chat, never by text or by "the last thread".
- Nothing a person or an operator wrote is in any table after the job has finished, and never in a log line.
- The two bots are separate: an update of one is never processed by the handlers of the other, and the same
  `update_id` on both gives two ledger rows.
- A failure to reach one operator does not stop the relay to the others.

Edge cases:

- The first two messages of a new person arrive together: one thread (`SupportThreadRaceTest`).
- Two operators answer the same message at the same moment: the person gets both answers; each operator is told
  about the other's.
- An operator is removed from `support.operator_ids`: their next message is handled as a user's; old relay rows of
  their chat no longer give authority (the id check comes first).
- A person deletes their data in the main bot: the thread and its relays disappear; a later message opens a new
  thread.
- A person blocks the support bot: the operator who answers is told; the thread keeps `chat_state = blocked` until
  a `my_chat_member` update or a new message arrives.

## Tests

Pest, `FakeBotApi`, `UpdateFactory`; feature tests (they need the application).

- `SupportWebhookTest`: the support route with the support secret → `200` and a row with the support `bot_id`; with
  the main secret → `403`; the main route with the support secret → `403`; blank support token → `403`; an
  `edited_message` on the support route → `200`, no row; the same `update_id` on both routes → two rows.
- `SupportUserFlowTest`: `/start` → `support.welcome`, nothing relayed; `/start l_51358` stores the number;
  `/start l_abc` stores nothing; a text with two reachable operators → two headers and two copies, four relay rows,
  `support.received`; a second text within the gaps → two copies, no header, no receipt; a photo is copied; a
  sticker → `support.unsupported`; the 21st message in an hour → `support.too_many` once; a blocked thread →
  `support.blocked` once per day; one operator unreachable → marked `blocked`, the other still served; no operator
  → `support.unavailable` and one `error` log `support.no_operator`; a group chat → `leaveChat`; locale from the
  HOMI user, from `language_code` `uz` and `en`, default `ru`.
- `SupportOperatorFlowTest`: a reply → the person receives the copy, the other operator receives the notice and a
  copy with relay rows; a reply by the second operator to that copy reaches the same person; a non-reply →
  `support.operator.hint`; `/close` then a new user message → `open` again; `/block` → later user messages are not
  relayed; `/unblock`; `/who` → the header; the person blocked the bot → `support.operator.user_unreachable`; a
  former operator's reply is handled as a user message and reaches nobody as an answer.
- `SupportPrivacyTest`: after a full exchange no column of the three tables, of `telegram_updates` and of the
  action log contains the message texts used; no log record contains them or a name; `ErasureService` for the user
  deletes the thread and its relays; the retention rules delete what they name; the registry tests of WP-47 pass.
- `SupportStatusCommandTest`: the output lists operators and counts, and contains no text of a message.
- `SupportThreadRaceTest` (group `pgsql`, helper `concurrently()` of WP-03): ten parallel first messages of one
  person → one thread.
- The suites of WP-50 … WP-58 stay green without a change to their assertions.

## Acceptance checklist

- [ ] A person's message reaches every reachable operator; an operator's reply reaches that person; the other
      operators see that it was answered.
- [ ] Only configured operator ids can answer, close, block and unblock.
- [ ] `/start l_<number>` from the Mini App's support button shows the listing number in the header.
- [ ] No message text, name or username is stored or logged (`SupportPrivacyTest`); the erasure of a user removes
      their thread.
- [ ] The main bot is unchanged: its suites pass untouched; a support secret does not open the main route and the
      reverse.
- [ ] With a blank support token nothing is reachable and no support button is shown.
- [ ] `make ci-backend` exits 0; the `pgsql` group is green; no dependency was added.
- [ ] The security review has no open finding.
- [ ] Inside Telegram on staging, then on production: a real exchange between a test account and two operators,
      both directions, with a photo; `/close`, `/block`, `/unblock`; `telegram:support status` shows both
      operators `active`.
- [ ] `TELEGRAM_SUPPORT_USERNAME` is set on that environment after its check, and the support buttons of the Mini
      App, the main bot and the landing open the support bot.

## Handoff

Empty.
