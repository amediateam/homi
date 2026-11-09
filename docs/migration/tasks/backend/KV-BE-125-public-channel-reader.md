# KV-BE-125 — Collectors: reader of public channel pages

| Field | Value |
| ----- | ----- |
| Status | TODO (code and fixture tests now; live reading BLOCKED by DEC-02 and the production-track reachability test) |
| Owner | Backend (track: development); live runs, schedule activation and host checks **[PT]** |
| Complexity | L |
| Feature IDs | F-PIPELINE-001 |
| Dependencies | KV-BE-120 (acquisition ADR), KV-BE-122 (`IntakeAcceptService`), KV-BE-126 (channel registry); DEC-02; CF-007 data items 1, 2, 4 |

## Goal

An isolated `Collectors` module reads the public web preview of each active channel (`https://t.me/s/<handle>`) on a
schedule, turns new and edited posts into intake payloads v2 (source `homi_channels`) and hands them to
`IntakeAcceptService` — the same entry an external collector reaches over HTTP — without Telegram accounts, without
subscribing, politely, and with a per-channel cursor; it never touches Listings models.

## Legacy reference

- BR-API-042 (217 open channels through public pages without subscribing; 🔶 `t.me/s/<channel>`), BR-SEO-037,
  Q-SEO-019, Q-API-017 (channel list, polling cadence, blocking), BR-SEO-029 (methodology statement «217 открытых
  каналов… без подписки»); `$KVADRO_ROOT/docs/about.md:117`, `:169`; `$KVADRO_ROOT/docs/seo-pages.md:244-247`.
- Target: `10` §3.8 option C ("B written as an isolated module `App\Collectors\…` that may call only the Intake
  application service"), §4.2 (Collectors owns `collector_cursors`), §4.10 (`collect` queue, per-host politeness, one
  worker per channel shard), §4.11 (every 1–2 min per shard), §4.14 ("Public channel pages — politeness and blocking
  tested from the production host").
- Freshness target: "within minutes" (NFR-02 in `10` §3.8 data item 2), measured by KV-BE-142.

## Implementation

1. Read the KV-BE-120 ADR, `.ai/agents/intake-pipeline-engineer.md` (rules 6, 7 — politeness; "Excluded on purpose":
   no evasion, no proxy or user-agent rotation), `.claude/skills/laravel-queues/`. Tests first, against saved HTML
   fixtures only (`Http::preventStrayRequests()`).
2. Migration `create_collector_cursors_table` (`php artisan make:model CollectorCursor -m --no-interaction`):
   `channel_id` FK `source_channels` (PK), `last_post_id bigint`, `last_seen_post_ids bigint[]` (recent window for edit
   detection, pgsql; json fallback), `last_success_at`, `last_error_at`, `error_count`, `next_poll_at`, `shard smallint`.
3. `php artisan make:class Collectors/TelegramChannels/PublicPageClient --no-interaction`: `GET
   https://t.me/s/<handle>` (optionally `?before=<post_id>` for back-fill), Laravel HTTP client, honest `User-Agent`
   (`config('collectors.user_agent')`, names HOMI and a contact URL), 10 s timeout, no cookies, retries only on 429/5xx
   with `2^attempt` s + jitter, max 5 (agent rule 6), `Retry-After` honoured; a per-host rate limiter (≥ 500 ms between
   requests, ≤ 3 concurrent, agent rule 7) via `RateLimiter::attempt` on Redis.
4. `php artisan make:class Collectors/TelegramChannels/PublicPageParser --no-interaction`: parses the HTML with PHP's
   `DOMDocument`/`DOMXPath` (no new dependency) into `ChannelPost` DTOs: `post_id` (from `data-post="handle/123"`),
   `posted_at` (`time[datetime]`), `edited` flag, text (HTML → plain text with line breaks; links kept as text),
   photo URLs (background-image of `tgme_widget_message_photo_wrap`), video flag, forwarded-from handle + post id,
   `grouped` albums merged into one post. Unknown markup → `ParseFailure` with the channel and post id, never a crash;
   a parser version constant is stored on every payload.
5. `php artisan make:class Collectors/TelegramChannels/PublicChannelReader --no-interaction`:
   `read(SourceChannel $channel): ReadResult` — fetch the newest page, collect posts with `post_id > last_post_id` and
   edits inside the recent window (changed text hash), build `IntakePayload` v2 (`external_id` =
   `<handle>:<post_id>`, `source_version` = edit timestamp or post id), call `IntakeAcceptService::accept()` for the
   batch with a deterministic idempotency key (`homi_channels:<handle>:<min>-<max>`), advance the cursor only after the
   accept call returns. Posts that disappeared from the recent window while their neighbours are present → a
   `post_deleted` lifecycle event (KV-BE-123/KV-BE-137) after two consecutive misses (avoid false deletion on a partial
   page).
6. Jobs: `php artisan make:job Collectors/ReadChannelPage --no-interaction` (queue `collect`, unique per channel,
   `timeout` 30); `php artisan make:command Collectors/PollChannels --no-interaction` → `collectors:poll {--shard=}`
   dispatches due channels (`next_poll_at <= now`, active, not opted out); scheduled every minute per shard
   `->onOneServer()->withoutOverlapping()` **only when** `config('collectors.enabled')` (default `false`; enabling in
   staging/production is a **[PT]** action after DEC-02). Back-off per channel: errors double `next_poll_at` up to 1 h;
   a `404`/private channel → channel flagged `unreachable` for review (KV-BE-126), never retried in a loop.
7. Boundaries: `arch()` test `CollectorsArchitectureTest` — `App\Collectors` may use only `App\Services\Intake`,
   `App\Domain\Intake`, `App\Models\SourceChannel`, `App\Models\CollectorCursor` and framework classes; nothing outside
   `App\Collectors` imports it.
8. Horizon: new `supervisor-collect` (queue `collect`, `maxProcesses` 2, `timeout` 30) — shared file, announce in the
   PR; config `backend/config/collectors.php` (`enabled`, `user_agent`, `shards`, `poll_interval_seconds` 90,
   `min_delay_ms` 500, `max_concurrency` 3, `recent_window` 50).
9. Reachability check **[PT]**: a read-only `collectors:probe {handle}` command prints status, latency and post count
   for one channel; the production track runs it from the production host (CF-007 data item 4) — no runs from developer
   machines against production schedules.

## Files

- `backend/app/Collectors/TelegramChannels/{PublicPageClient,PublicPageParser,PublicChannelReader,ChannelPost,ReadResult}.php` (new)
- `backend/app/Jobs/Collectors/ReadChannelPage.php`, `backend/app/Console/Commands/Collectors/{PollChannels,ProbeChannel}.php` (new)
- `backend/app/Models/CollectorCursor.php`, migration `create_collector_cursors_table`, `backend/config/collectors.php` (new)
- `backend/config/horizon.php`, `backend/routes/console.php` (shared files)
- `backend/tests/Fixtures/collectors/tme_s/*.html` (synthetic pages), `backend/tests/Unit/Collectors/PublicPageParserTest.php`,
  `backend/tests/Feature/Collectors/PublicChannelReaderTest.php`, `backend/tests/Arch/CollectorsArchitectureTest.php` (new)

## API contract

n/a (outbound reader). Outbound requests: `GET https://t.me/s/<handle>[?before=<id>]`, honest `User-Agent`, no
authentication. Inbound: none — the reader calls the Intake service in-process.

## Business rules

- BR-API-042 (public pages, no subscription), BR-API-043 / BR-DATA-022 (opted-out channels are never polled, and the
  Intake service refuses their posts as a second line), BR-SEO-029 (the methodology text stays true), BR-DATA-020
  (`(channel, post_id)` identity), BR-API-067 (deleted post → `post_deleted`).

## Acceptance criteria

- Given a fixture page with 20 posts and a cursor at post 15, exactly posts 16–20 are handed to Intake, the cursor
  ends at 20, and a second run with the same page hands over nothing.
- An edited post (same id, changed text) inside the recent window produces an `updated` payload with a higher
  `source_version`.
- No request leaves the test suite; the reader never imports a Listings class (arch test).
- With `collectors.enabled = false` the scheduler dispatches nothing.

## Tests

- `PublicPageParserTest`: `parses_post_id_date_text_and_photos`, `merges_album_into_one_post`, `extracts_forward_origin`,
  `detects_edited_marker`, `unknown_markup_returns_parse_failure_not_exception`, `plain_text_keeps_line_breaks`,
  `uz_cyrl_and_latin_text_preserved_nfc`.
- `PublicChannelReaderTest` (`Http::fake` with fixtures): `hands_only_new_posts_to_intake`, `cursor_advances_after_accept`,
  `cursor_not_advanced_when_accept_throws`, `edit_in_window_becomes_updated_payload`,
  `missing_post_twice_becomes_post_deleted_event`, `single_miss_is_not_deletion`, `opted_out_channel_never_fetched`,
  `429_honours_retry_after`, `404_flags_channel_unreachable`, `politeness_delay_between_requests` (fake clock),
  `idempotency_key_deterministic_per_range`.
- `CollectorsArchitectureTest`: `collectors_use_only_intake`, `nothing_imports_collectors`.
- Scheduler: `poll_disabled_by_default`, `poll_shard_selects_due_channels`.

## Edge cases

- Telegram changes the page markup: parse failures spike → KV-BE-142 alert; the parser version lets KV-BE-124
  re-process raw payloads after a fix.
- A channel renames its handle: matched by `telegram_id` when the page exposes it; otherwise flagged for review in
  KV-BE-126 (never two channel rows for one channel).
- A post with only a photo and no text: payload with empty text; extraction yields nothing, the listing is not
  published (no price, no deal) — stored as `rejected: no_offer_fields`.
- Back-fill: `?before=` pages only on an explicit `collectors:backfill {handle} --pages=N` (not scheduled), to avoid
  re-reading history that the migration already carries (`14` §2.1 option C).
- Rate limiting or blocking of the production IP: the circuit opens per host, all shards pause, an operator alert is
  raised; no evasion is attempted (agent "Excluded on purpose").

## Security

- SEC-REQ-023 (photo URLs are only recorded here; fetching follows KV-BE-127), SEC-REQ-047 (no post text or phones in
  logs; errors log handle and post id), SEC-REQ-049 (no new parser package; `DOMDocument` is core PHP). Legal basis for
  copying public posts: Q-SEC-007 (product owner); no credentials of any kind are stored (agent rule 14).

## Definition of done

Tests green (`make ci-backend`), live activation recorded as a **[PT]** step in the PR with DEC-02 referenced, Horizon
and scheduler changes announced, `09` row F-PIPELINE-001 updated, PR reviewed by the other developer.
