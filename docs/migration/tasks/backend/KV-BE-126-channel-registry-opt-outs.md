# KV-BE-126 — Channel registry, channel-list import and channel opt-outs

| Field | Value |
| ----- | ----- |
| Status | TODO (real channel list BLOCKED by Q-API-017 / Q-DATA-033 — product owner) |
| Owner | Backend (track: development); import of the real list **[PT]** |
| Complexity | M |
| Feature IDs | F-PIPELINE-001, F-ADMIN-002 |
| Dependencies | KV-DB-008 (`source_channels`), KV-BE-122; Q-API-017, Q-DATA-033 |

## Goal

HOMI knows which channels it reads and how to treat them: the ~217 legacy channels are imported with handle, Telegram
id, city, owner hashtags and new-build flag; unknown channels seen through other sources are registered for review;
an opt-out by a channel admin stops reading at once, makes Intake refuse the channel's posts and removes the channel's
listings from every public surface — and they never come back.

## Legacy reference

- BR-API-042 (217 channels), BR-API-043 (a channel admin can ask that nothing is taken —
  `$KVADRO_ROOT/demo/landing/site/privacy.html:73`), BR-DATA-022 (taken-down listings and opted-out channels never
  reappear in feed, map, site or radars), BR-API-046 / BR-SEO-010 (owner hashtags `#хозяин`, `#собственник` per
  channel), BR-SEO-016 (new build «так сказано в объявлении или в канале»).
- ENT-040 (`06` §2.5), `06` §4.2 `source_channels` row; Q-API-017, Q-DATA-033; GAP-001, GAP-023 (operations without ARM).
- SEC-REQ-040 (channel opt-out stops re-ingestion).

## Implementation

1. Read the KV-DB-008 `SourceChannel` model, `.ai/agents/intake-pipeline-engineer.md` (rule 12 onboarding checklist)
   and `.ai/agents/security-reviewer.md`. Tests first.
2. `php artisan make:class Services/Listings/ChannelRegistry --no-interaction`:
   - `resolve(string $handle, ?int $telegramId): SourceChannel` — match by `telegram_id`, else by lower-cased handle;
     an unknown channel is created with `review_state = pending` (additive column via
     `php artisan make:migration add_review_state_to_source_channels_table --no-interaction`; values `pending`,
     `approved`, `rejected`, `unreachable`); posts of `pending` channels are stored and parsed but not published until
     approved, except when the source is `telegram_uz`/`datahub_uz` and `config('channels.auto_approve_trusted')`;
   - `rename(SourceChannel, string $newHandle)` keeps one row per channel (handle history in `aliases`);
   - `optOut(SourceChannel, string $via, ?string $note)` — sets `opted_out_at`, records a `takedown_requests` row with
     scope `channel` (KV-DB-032), dispatches `ChannelOptedOut` → listener hides every active listing whose only active
     publications are from this channel (status `taken_down`, cause `takedown`, through KV-BE-137/KV-BE-138); listings
     with publications in other channels lose only this channel's publications from `sources[]`;
   - `optIn` exists only for an operator mistake within 24 h (audited), never automatic.
3. Commands until ARM (GAP-023): `php artisan make:command Channels/ImportChannels --no-interaction` →
   `channels:import {file.csv}` (columns `handle,telegram_id,title,city,owner_hashtags,is_new_build,opted_out`;
   idempotent upsert, report of created/updated/unchanged; the file is never committed — it comes from the product
   owner) **[PT]** for the real list; `channels:opt-out {handle} --via=support|email|arm`; `channels:review {handle}
   --approve|--reject`; `channels:list --state=`.
4. Intake guard: `IntakeAcceptService` (KV-BE-122) calls `ChannelRegistry::isOptedOut()`; the reader (KV-BE-125) skips
   opted-out and `rejected` channels; the search predicate (KV-BE-023) already excludes opted-out channels
   (BR-DATA-022) — this task adds the regression test across the three layers.
5. Synthetic seed `ChannelSeeder` (10 fake channels `@test_rent_1…`, owner hashtags on two, one new-build channel)
   for local development; no real handles in the repository.
6. Audit: every opt-out, opt-in, approve and reject writes an `admin_audit` line (actor = operator name or `cli`,
   never a Telegram id) — the table of KV-BE-011 if it exists, else a log channel `audit`.

## Files

- `backend/app/Services/Listings/ChannelRegistry.php`, `backend/app/Events/Listings/ChannelOptedOut.php`,
  `backend/app/Listeners/Listings/HideOptedOutChannelListings.php` (new)
- `backend/app/Console/Commands/Channels/{ImportChannels,OptOutChannel,ReviewChannel,ListChannels}.php` (new)
- migration `add_review_state_to_source_channels_table`; `backend/database/seeders/ChannelSeeder.php`;
  `backend/config/channels.php` (new)
- `backend/tests/Feature/Listings/ChannelRegistryTest.php`, `backend/tests/Feature/Listings/ChannelOptOutTest.php` (new)

## API contract

n/a (commands; the ARM API for the same operations comes with M9/ARM, GAP-023).

## Business rules

- BR-API-043, BR-DATA-022 (never reappear), BR-API-046 (owner hashtags are channel data used by KV-BE-128),
  BR-SEO-016 (new-build channel flag used by KV-BE-131 for `market = new`).

## Acceptance criteria

- After `channels:opt-out @x`, a new post of `@x` is refused by Intake (`channel_opted_out`), the reader never fetches
  `@x`, and no listing that exists only through `@x` appears in feed, count, map, radars, SEO or landing data.
- Importing the same CSV twice changes nothing the second time.
- A renamed channel keeps one row and its listings keep their `sources[]` handle history.

## Tests

- `ChannelRegistryTest`: `resolves_by_telegram_id_before_handle`, `unknown_channel_created_pending`,
  `pending_channel_posts_not_published`, `trusted_source_auto_approves_when_configured`, `rename_keeps_single_row`,
  `import_is_idempotent`, `import_reports_counts`.
- `ChannelOptOutTest`: `opt_out_refuses_new_posts`, `opt_out_hides_single_channel_listings`,
  `listing_with_second_channel_stays_active`, `opted_out_listing_absent_from_search_and_matching` (feed, count, map,
  radar predicate), `opted_out_channel_never_reappears_after_reprocess` (`intake:reprocess` of an old event → still
  refused, BR-DATA-022), `opt_out_writes_takedown_request_and_audit`.

## Edge cases

- A channel opts out while its post is in the middle of processing: `Publish` (KV-BE-134) re-checks the opt-out inside
  its transaction and stores the listing `taken_down`.
- The same flat posted in an opted-out channel and another channel: the publication from the opted-out channel is not
  shown in `sources[]`; the price history keeps only the other channel's points.
- A channel that becomes private (`404` on its page): `unreachable`, its listings stay until their own lifecycle ends
  (not an opt-out).

## Security

- SEC-REQ-040 (opt-out blocks re-ingestion, audited), SEC-REQ-046 (operator actions become ARM actions with roles
  later), SEC-REQ-047 (no channel post text in logs). The channel list is business data from the product owner and is
  not committed.

## Definition of done

Tests green (`make ci-backend`), the import procedure written in `docs/api/intake.md` (sources section), `09` rows
F-PIPELINE-001 and F-ADMIN-002 updated, PR reviewed by the other developer.
