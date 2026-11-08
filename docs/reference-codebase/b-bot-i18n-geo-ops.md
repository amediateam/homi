# `app.uz` module cards B — Telegram bot, i18n, geo, tests, ops

Index and rules: [`../reference-codebase.md`](../reference-codebase.md). Paths are relative to `app.uz/backend/`; numbers in parentheses are line counts.

## B1 — Telegram webhook intake, Bot variant

- **Paths**: `Controllers/Bot/V1/Webhook/TelegramWebhookController.php` (25); `Services/Bot/WebhookDispatcher.php` (187); `Models/Bot/BotUpdateLog.php` (62); migrations `bots/2026_04_22_150005_create_bot_updates_log_table.php` (+ `…_add_ai_response_text…`); `Jobs/Bot/ProcessBotUpdateJob.php` (655); limiter `AppServiceProvider.php:238`; route `routes/bot/v1.php`.
- **Flow**: `POST /bot/v1/webhook/telegram/{username}` (`throttle:bot-webhook` 6000/min/IP) → resolve bot → `TelegramChannel::verifyWebhook` compares header `X-Telegram-Bot-Api-Secret-Token` with the bot's `webhook_secret` via `hash_equals` (fail-closed) → INSERT raw update → queue `ProcessBotUpdateJob($logId)` → 200. Unique violation (23505) → 200 (idempotent ack); bad secret → 403; unknown bot → 404 (its comment says 200 — decide explicitly). `answerCallbackQuery` is called synchronously to stop button spinners.
- **Table `bot_updates_log`**: `id, bot_id FK, external_update_id bigint null, event_type varchar(40), headers jsonb, body jsonb, ip varchar(45), signature_valid bool, processing_time_ms, processed bool, processing_error varchar, created_at` (+ AI columns); indexes `(bot_id, created_at)`, `(bot_id, processed)`, partial UNIQUE `(bot_id, external_update_id) WHERE external_update_id IS NOT NULL`; `bots:prune` deletes rows older than 14 days.
- **Job**: `$timeout = 30`, `$tries = 3`, `$backoff = 10`, queue `bot-handler`; exits early if `processed`; no `failed()`; on exception rolls back, `report()`, writes `processing_error`, rethrows. Handler resolution = `if` chain over ~20 product handlers.
- **Coupling**: job imports Curso, Media, Landing, Lendo, SmartAgent, Gramir; model bound to the multi-DB `bots` connection. Dispatcher is clean except the `HANDLER_ACKED_CALLBACKS` constant.
- **Tests**: `tests/Feature/Bot/WebhookPipelineTest.php` (7), `CallbackAckTest.php` (6), `StickyLanguageTest.php` (4).
- **Status**: controller, dispatcher, model, migration READY (small edits); job NOT_PORTABLE.
- **Port plan**: see B2 — HOMI uses the Gramir shape with this variant's table design (partial unique index, jsonb payload, timestamps in UTC, no AI columns); handler registry keyed by bot type instead of the `if` chain; Horizon supervisor for the bot queue; 14-day prune.

## B2 — Telegram webhook intake, Gramir variant (preferred)

- **Paths**: `Controllers/Gramir/Webhooks/TelegramBotWebhookController.php` (80); `Middleware/Gramir/VerifyTelegramBotSecret.php` (37); `Models/Gramir/WebhookEvent.php` (27); `Jobs/Gramir/Channels/ProcessTelegramBotUpdateJob.php` (62); migration `gramir/2026_10_09_000003_create_webhook_events_table.php` (55); `routes/gramir/webhooks.php`.
- **Public API**: route `POST /webhooks/telegram-bot/{account}` (`whereNumber`), middleware `throttle:gramir-webhook` (6000/min/IP) then `VerifyTelegramBotSecret`; `TelegramBotWebhookController::receive(Request): Response`; `VerifyTelegramBotSecret::handle(Request, Closure): Response`. Table `webhook_events`: `id, provider varchar(20), external_event_id varchar(191), payload jsonb, status varchar(20) default 'received', error text null, processed_at ts null, timestamps`; UNIQUE `(provider, external_event_id)`; partial index on `created_at WHERE status = 'received'`.
- **Behaviour**: dedup key `"{accountId}:{update_id}"` via `insertOrIgnore` (no TTL, no prune); secret from `Account.credentials['webhook_secret']`, fail-closed 403; limiter runs before the secret check; plain `OK` 200 even for malformed/duplicate updates; inline `answerCallbackQuery` (3 s timeout, non-fatal). Job: `tries = 3`, `backoff = [5, 30]`, `failed(Throwable)` sets `status = 'failed'`, queue `gramir-webhooks`.
- **Coupling**: `Gramir\Account` + credentials array, `GramirResponse` envelope, `gramir` log channel.
- **Tests**: `tests/Feature/Gramir/Webhooks/TelegramBotWebhookTest.php` (11); `tests/Feature/Gramir/Channels/TelegramBotUpdatesTest.php` (32).
- **Status**: NEEDS_ADAPTATION — the cleaner pattern (~150 lines).
- **Port plan**: middleware + controller (`insertOrIgnore`) + job; table `telegram_updates(bot_id, update_id bigint, payload jsonb, status received|processing|done|failed, error, processed_at, timestampsTz)` with composite unique `(bot_id, update_id)`; secret per bot from config (dev/staging/prod), not DB; keep `failed()` and `[5, 30]` backoff; add the prune command app.uz lacks; port the Pest cases (bad secret, duplicate, malformed, callback ack failure); route on `hook.homi.uz` `/telegram/{bot}`.

## B3 — Telegram Bot API client

- **Paths**: `Services/Bot/Channels/Telegram/TelegramClient.php` (91), `TelegramException.php` (20), `TelegramChannel.php` (552), `TelegramTypingNudger.php` (82); `Services/Bot/Contracts/BotChannel.php` (52) + DTOs; `Services/Bot/BotChannelManager.php` (64); `Services/Bot/Support/BotCredentials.php` (30).
- **Public API**: `TelegramClient::__construct(HttpFactory)`; `call(string $token, string $method, array $payload = [], ?int $timeoutSeconds = null, int $retries = 2): array`; `callRaw(string $token, string $method, array $payload = []): array`; `TelegramException extends BotException(string $message, int $telegramCode = 0, ?int $retryAfter = null)`. `TelegramChannel`: `getMe`, `setWebhook(Bot, BotCredentials, string $url, string $secret)` (payload: `url`, `secret_token`, `max_connections 40`, `allowed_updates [message, edited_message, callback_query, my_chat_member, chat_member, channel_post, edited_channel_post]`, `drop_pending_updates false`, `ip_address` via DNS), `deleteWebhook`, `verifyWebhook(Request, Bot): ?bool`, `parseUpdate`, `send`, `setMyCommands`, `acknowledgeCallback`, `editMessageText`. `getWebhookInfo` exists only in `Services/Qulay/Telegram/BotApi.php` and inline in `SetupWebhookCommand`.
- **Retry policy**: `Http::retry(2, 200ms)` only for `ConnectionException`, no retry on 429/5xx; timeouts from `config/bots.php` (`http_timeout 15`, `http_connect_timeout 5`); `retry_after` surfaced on the exception. Outgoing limits in config: 30/s global, 1/s per chat, 20/min per group.
- **Commands (patterns)**: `qulay:tg:webhook {action: set|delete|info} {--bot=} {--all}` (217) — the model for HOMI's command; ARM endpoints `POST {bot}/webhook/install|uninstall|rotate-secret`.
- **Tests**: `tests/Feature/Bot/TelegramChannelTest.php` (13, `Http::fake` style), `TelegramTypingNudgerTest.php` (5).
- **Status**: `TelegramClient`/`TelegramException` READY; channel/strategy layer NEEDS_ADAPTATION.
- **Port plan**: port the client and exception as-is, add retry on 429 (honour `retry_after`, capped) and 5xx, add `getWebhookInfo`; skip the multi-channel strategy — one `TelegramBot` service with `verifyWebhook`, `setWebhook`, `deleteWebhook`, `webhookInfo`, `send`, `editMessageText`, `acknowledgeCallback`; one command `telegram:webhook {set|delete|info} {--bot=}` with the production guard (master prompt §8.6), URL on `hook.homi.uz`, secret per bot; keep the `allowed_updates` default, `max_connections 40`, `drop_pending_updates false` except dev/staging; port the `Http::fake` test style.

## B4 — Credentials vault

- **Paths**: `Services/Bot/CredentialsVault.php` (59); `Services/Bot/Support/BotCredentials.php` (30); `Console/Commands/Bots/GenerateKeyCommand.php` (43); config `bots.encryption_key`.
- **Public API**: `CredentialsVault::__construct()` (throws if key empty); `encrypt(array $data): string`; `decrypt(string $blob): array`; `BotCredentials::token(): string`, `credential(string $key, mixed $default = null)`; command `bots:generate-key {--show}`. Storage: `bots.credentials` (encrypted JSON) + plain `webhook_secret` (varchar 64) + `internal_api_token`.
- **Encryption**: `Illuminate\Encryption\Encrypter` instantiated directly (AES-256-CBC) with a dedicated key — but falls back to `APP_KEY` when unset, defeating the rotation goal.
- **Tests**: none dedicated (exercised via harnesses).
- **Status**: READY.
- **Port plan**: port with a **required** dedicated key (no fallback) or use Eloquent `encrypted:array` cast + `APP_PREVIOUS_KEYS`; keep `webhook_secret` as a plain column so verification needs no decrypt; unit tests for round trip / wrong key / empty blob; port `bots:generate-key`. Relevant only if bot credentials live in the DB; with three fixed bots per environment, env-based config is enough at first.

## B5 — Telegram notification channel

- **Paths**: `Notifications/Channels/TelegramChannel.php` (27); `Services/Telegram/TelegramBotService.php` (182); siblings `SlackWebhookChannel.php`, `WebhookChannel.php`.
- **Public API**: `TelegramChannel::send(object $notifiable, Notification $notification): void`; expects `$notifiable->routeNotificationForTelegram()` (chat id, falsy = skip) and `$notification->toTelegram($notifiable): array{text, keyboard?}`.
- **Coupling**: `TelegramBotService` is tied to the shop product and a single global token; only one notification uses the channel.
- **Tests**: `tests/Feature/App/TelegramTest.php` (7).
- **Status**: channel READY (trivial re-implementation); service NOT_PORTABLE.
- **Port plan**: re-implement the channel on the ported `TelegramClient`; `toTelegram` returns a small DTO (`text`, `parse_mode`, `reply_markup`, optional bot); handle 403 (blocked → mark chat) and 429 (`release(retry_after)`); notifications `ShouldQueue` on queue `notifications`; Pest test with `Http::fake`.

## B6 — i18n: jsonb translations + locale registry

- **Paths**: `Support/Localization/HasTranslations.php` (173), `LocaleRegistry.php` (50); `Services/Landing/LanguageResolver.php` (96, `?lang=` → `Accept-Language` q-values → default); `lang/{ru,uz}/*.php` (no `en`).
- **Public API**: `final LocaleRegistry { const SUPPORTED = ['ru','uz','en']; const DEFAULT = 'ru'; supported(); default(); isSupported(?string); coerce(?string) }` (`uz-Latn` → `uz`). `trait HasTranslations { getTranslation(string $attribute, ?string $locale = null, bool $fallback = true): string; getTranslations(string $attribute): array; setTranslation(string $attribute, string $locale, ?string $value): self; setTranslations(string $attribute, array $values): self; getTranslatableAttributes(): array; isTranslatableAttribute(string): bool }` — model declares `protected array $translatable`, column cast `array`; plain string assignment wraps as `[ru => value]`; fallback chain requested → `ru` → first non-empty → `''`.
- **Facts**: no global `SetLocale` middleware; `config/app.php` locale defaults to `en` (disagrees with the registry); Uzbek is Latin script.
- **Tests**: `tests/Feature/Localization/HasTranslationsTest.php` (7); none for `LocaleRegistry`.
- **Status**: READY.
- **Port plan**: copy both files unchanged; `APP_LOCALE=ru`, `APP_FALLBACK_LOCALE=ru` (ADR-0006); add `SetLocale` middleware (`?lang=` / `X-Locale` header → `Accept-Language` via the `LanguageResolver` parser → `ru`, through `LocaleRegistry::coerce`); jsonb columns with GIN index only where searched; API resources return the resolved string, admin endpoints the full map; `lang/{ru,uz,en}/`; port `HasTranslationsTest`, add a registry test.

## B7 — Geo: regions, districts, enums, seeder

- **Paths**: `Models/SmartAgent/Region.php` (43), `District.php` (44); migrations `smartagent/2026_08_23_100001_create_regions_table.php`, `…100002_create_districts_table.php`; `database/seeders/SmartAgent/SmartAgentGeoSeeder.php` (88); `Enums/SmartAgent/DealType.php` (`Rent`, `Sale`), `PropertyType.php` (`Apartment`, `House`, `Commercial`, `Land`, `NewBuilding`).
- **Schema**: `regions(id, code varchar(32) UNIQUE, name jsonb, sort_order smallint, is_active bool, timestamps)` + index `(is_active, sort_order)`; `districts(id, region_id FK cascade, code varchar(48), name jsonb, sort_order, is_active, timestamps)` + UNIQUE `(region_id, code)`. `title(string $locale)` falls back locale → ru → code (does not use `HasTranslations`).
- **Seed**: 14 regions (ru/uz only), 12 districts for Tashkent city only; idempotent `updateOrCreate` by code.
- **Tests**: none dedicated (indirect via SmartAgent bot flows).
- **Status**: READY (schema, seeder shape, enums); data incomplete.
- **Port plan**: migrations on the default connection with `timestampsTz`; models use `HasTranslations` and gain `en`; complete districts for every region from a reviewed official source; HOMI enums `DealType`, `PropertyType` (+ `Room` for the product's "комната" type), each with `label(string $locale)`; seeder runs in every environment; seeder test (counts, idempotent re-run, `title()` fallback).

## B8 — Testing and tooling shape

- **Paths**: `tests/Pest.php` (169); `tests/Helpers/*` (21 files); `tests/Unit/Arch/ProductBoundariesTest.php` (83); `phpunit.xml` (86); `.github/workflows/tests.yml` (56), `lint.yml` (49); `pint.json`.
- **Facts**: Pest binds `TestCase + RefreshDatabase` to `Feature`, Dusk to `Browser`; global helper `actingAsProject()`; arch test forbids cross-product namespace use (`toUse`) and keeps `ApiController`/`IdentifyProject` product-free. Tests run on SQLite in memory (not PG). CI: PHP 8.3/8.4/8.5 matrix (stale vs `^8.5`), Node 22, no caching; `lint.yml` runs `pint` **without** `--test` (never fails). No PHPStan, no Rector. 813 test files, ~6,800 cases.
- **Status**: `pint.json` READY; CI NEEDS_ADAPTATION; arch test pattern only; helpers NOT_PORTABLE.
- **Port plan (HOMI already differs)**: HOMI runs Pint `--test`, Larastan level 7 and `composer ci:check` in CI on PHP 8.5 with Node from `.node-version`; add PostgreSQL 18 + Redis service containers in Phase 6 so tests can run on PG for jsonb/PostGIS features; write a HOMI arch test "modules do not import each other" (overview §module boundaries); `actingAsUser()` helper modelled on `ProjectActor`.

## B9 — Ops shape

- **Paths**: `config/horizon.php` (489); `routes/console.php` (555, 69 schedule entries); `config/logging.php`; `config/sentry.php`; `config/backup.php`; `bootstrap/app.php`.
- **Facts**: Horizon environments `production` and `local` only (no staging); defaults `queues high/default/low, balance auto, tries 3, timeout 90, memory 128, maxTime 3600, maxJobs 500`; production supervisors per workload (`bot-handler` simple 4–8, `bot-broadcasts` 2–6 tries 1, `media` 1–3 timeout 300, backups timeout 0, userbot, gramir-*, lendo-*). Schedule examples: `horizon:snapshot` every 5 min, `bots:prune` daily 03:30, `backup:run --only-db` 02:00, `backup:clean` 03:00, `backup:monitor` 04:00, `telescope:prune`, `sanctum:prune-expired`. Logging: stack/single/daily/`gramir`/slack/stderr… **No request-id middleware.** Sentry config present but no `Integration::handles` in `bootstrap/app.php`. Backup: `spatie/laravel-backup` to `local` + off-site S3 `backups` disk, monitor age ≤ 1 day, size ≤ 5000 MB.
- **Status**: structure NEEDS_ADAPTATION; product wiring NOT_PORTABLE.
- **Port plan**: Horizon with `local`, `staging`, `production` and 3–4 supervisors (`default`, `ingest`, `bot`, `notifications`, `media`), `balance simple` for latency-critical queues (ADR-0005); `RequestId` middleware (honour inbound `X-Request-Id`, else ULID; `Log::withContext`, response header, Sentry scope); wire Sentry explicitly if adopted (PROPOSED, paid); schedule in UTC: `horizon:snapshot`, `telegram:updates:prune`, `sanctum:prune-expired`, `telescope:prune`, backups; logging stack `daily + stderr` plus a `bot` channel; backups: one PG database + media disk to an off-site S3 disk (Phase 6).
