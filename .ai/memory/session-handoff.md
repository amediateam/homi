---
updated: 2026-11-08 (Phase 3 started, paused by the developer)
source-of-truth: this session; overwritten every session
---

# Session handoff

## State at handoff
- Phases 0–2 complete (PR #1, #2, #3 open; CI green on #3). Phase 2 report: `docs/ai/reports/phase-2.md`.
- **Phase 3 (CDN & webhook) is IN PROGRESS on `chore/phase-3-cdn-webhook`** (stacked on phase-2). The developer approved the PROPOSED packages and then asked to pause: "закончи потом остановись — у нас много дел до написания кодов". Next session starts with that conversation, not with code.

## Done in Phase 3 so far (committed as WIP)
- Packages installed (approved): `league/flysystem-aws-s3-v3` 3.35, `intervention/image` 4.4, `dedoc/scramble` 0.13.53; registry regenerated.
- Config: `filesystems.php` (disks `local`/`public`/`tmp` + `s3_public`/`s3_private`/`s3_tmp`), `media.php`, `telegram.php`, `intake.php`, `horizon.php` (queues `default+notifications`, `telegram`, `media`, `ingest`; `staging` env added), `scramble.php` (`api_path api/v1`, export to `docs/api/openapi.json`). `.env.example` + local `.env` keys: `MEDIA_*_DISK`, `MEDIA_PUBLIC_BUCKET`; removed `AWS_BUCKET`, `AWS_URL`, `SANCTUM_TOKEN_EXPIRATION` (global Sanctum expiry would kill collector tokens — per-token `expires_at` instead).
- Schema (migrated locally): `media_files`, `telegram_updates`, `sources`, `source_listings`, `intake_requests`, `intake_events`; models, factories, `SourceSeeder`, enums in `app/Enums`.
- Implemented with tests (47/47 green, PHPStan clean): `AssignRequestId` middleware (global, `X-Request-Id`, `Log::shareContext`), `ApiController` envelope + `paginated()` (ADR-0007), `ApiExceptionRenderer` (401/403/404/422/429/500 envelopes for `api/*`), Media module: `HashedUploader` (sniff → decode → orient → re-encode → `originals/{sha256}.{ext}`), `GenerateImageVariantsJob` (`derived/{sha}/{w}.webp`, queue `media`, tries 3), `MediaUrlBuilder` (CDN URL or signed temporary URL), `MediaController` (store/show/destroy), `PresignController` (presign on S3 disks only → 409 locally; `register` promotes tmp uploads), `MediaFileResource`, routes `/api/v1/media*` (Sanctum + `ability:media:write` + `throttle:uploads`), rate limiters `api|uploads|intake|telegram-webhook`, `routes/hooks.php` (group `hooks`, route `POST /telegram/webhook` → stub controller + stub middleware).
- `User` now uses `HasApiTokens`; `Source` is a Sanctum tokenable.

## Not done (Phase 3 remaining)
1. Telegram webhook: `VerifyTelegramSecretToken`, `TelegramWebhookController` (insertOrIgnore dedup → `telegram` queue), `ProcessTelegramUpdateJob`, `TelegramClient`/`TelegramBot`/`TelegramException`, `telegram:webhook set|info|delete` with production guard, prune schedule — tests first (see plan below).
2. Intake accept layer: `StoreIntakeListingsRequest` (payload v1 from `docs/api/intake-sources.md`), `IntakeListingController` (batch 1–100, `Idempotency-Key` → `intake_requests` replay, `source_listings` upsert, `intake_events` raw store, 202), `IntakeEventController`, `SourceListingResource`, `intake:token` command, routes under `/api/v1/intake/*` (`ability:intake:write`, `throttle:intake`).
3. OpenAPI: `scramble:export` → `docs/api/openapi.json` + CI drift check; Gate `viewApiDocs`.
4. Infra: `infra/server/nginx/{cdn,hook}.homi.uz.conf` templates + MinIO provisioning script (needs the CDN mirror facts — subagent `cdn-mirror-facts` was running at handoff; its report, if captured, is in `docs/ai/reports/phase-3-notes.md`).
5. Docs: `docs/infrastructure/cdn.md`, `telegram-webhook.md`, `docs/api/intake.md`, ADR-0013 (media stack + Scramble), overview/environments updates, `docs/ai/reports/phase-3.md`; `make dev-check` additions (media health, Horizon queues).
6. Local `.env`: `TELEGRAM_*` values are still empty — set the dev bot token/secret before webhook tests (never commit).

## Gotchas learned this session
- Intervention Image 4.4: `new ImageManager(new Gd\Driver)`, `decodeBinary()`, `encode(new WebpEncoder(quality:))` — no `read()`/`toJpeg()`/`ImageManager::gd()`.
- `Storage::fake()` replaces `temporaryUrl()` with a dummy `?expiration=` URL; test signed local URLs with the real `local` driver on a temp root (see `PrivateMediaAccessTest`).
- `Log::withContext` is per-channel; use `Log::shareContext` for request ids.
- Pest `--compact` prints one JSON line; errored tests are not listed under `failures` — run plain `php artisan test` when counts don't add up.
- zsh: `$VAR="php artisan"` does not word-split — use a function.

## Active subagent work at handoff
- None. Both read-only subagents returned; their facts are condensed in `docs/ai/reports/phase-3-notes.md` (CDN/MinIO host conventions, web host conventions, app.uz porting caveats). The verbatim app.uz dump lived only in the session scratchpad — re-fetch via a read-only subagent if needed.
