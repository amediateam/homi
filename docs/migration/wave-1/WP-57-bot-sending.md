# WP-57 — Sending: pacing, outbox, quiet hours, digest, withdrawn cards, broadcasts

| Field | Value |
| ----- | ----- |
| Stage | D |
| Status | TODO |
| Depends on | WP-53, WP-46 |
| Size | about 3 000 changed lines, L, plus about 150 for the launch link `?radar=<id>` in the Mini App (DEC-61, added by the intake of `index-CIa0Ldj2.js`). If it grows: two PRs. Part A = steps 1–7 (pacer, the sender for cards and digests, the changes in the outbox job). Part B = steps 8–12 (withdrawn edits, recheck, broadcasts). Production works after either part |
| Behaviour reference | `04` §2 (rows BOT-062, BOT-081 … BOT-084), §5, §4.2 (TXT-BOT-047, TXT-BOT-086 … TXT-BOT-088), §8 (BR-BOT-007, BR-BOT-073 … BR-BOT-080, BR-BOT-092, BR-BOT-100, BR-BOT-101); `11b` §2.3 row 9; `16` (SEC-REQ-029, SEC-REQ-040, SEC-REQ-046, SEC-REQ-047); `25` §5 row "Matching and delivery planning", §14 item 5; task files KV-TG-050 … KV-TG-055; the specification of WP-46 ("Outbox — the seam for the bot") |
| Needs from the production track | (1) Approval of two additive migrations: tables `broadcasts`, `broadcast_recipients`; column `listing_marks.taken_down_at`. (2) Review of the shared-file PR that gives the queue `notifications` its own `supervisor-delivery` in `backend/config/horizon.php`; a Horizon restart after its deploy. (3) The scheduler must run every minute on staging and production (asked by WP-46 and WP-50); two entries arrive with this package. (4) In the server env: `TELEGRAM_SEND_RATE_GLOBAL` (default 25), `TELEGRAM_SEND_RATE_PER_CHAT` (default 1), `TELEGRAM_BROADCAST_ENABLED` (default `false`); after part A of this package is deployed, switch radars on (DEC-51): set `RADAR_CREATION_ENABLED=true` and `RADAR_MATCHING_ENABLED=true` together and restart Horizon — on staging first, and on production after the staging checks of "Switching radars on" have passed (both keys were left off until a sender exists); confirm that `RADAR_STARTER_ENABLED` and `RADAR_REQUIRE_CHAT` are `true` (WP-54). (5) Before the deploy of part A: run `php artisan radar:status` and note the number of pending outbox rows — rows older than 36 hours are expired by the first run, not sent. (6) Alerts on the metrics named in "Metrics" (request detailed in WP-70). (7) For each real broadcast on production: `TELEGRAM_BROADCAST_ENABLED=true` for that run, with the first developer's approval |

## Goal

Everything the bot writes on its own reaches the user inside Telegram's limits and exactly once: a new listing that
matches a radar is pushed as a card, held during quiet hours and released as one morning digest, or collected into
the digest of the user's digest times; a card whose listing was withdrawn is edited to «Объявление снято»; the team
can send service news to users who did not opt out. WP-46 decides what is due and keeps the outbox; this package is
the sender behind it.

## Scope

In:

- `TelegramRadarSender`, the implementation of the `RadarSender` contract of WP-46: instant cards and digests.
- The send pacer: global and per-chat rate, `retry_after`, circuit breaker, an incident pause switch.
- Use of the deferral that WP-46 built into its outbox job for pacing (listed in "Design").
- Finding out that a delivered listing was withdrawn, and the edit of every delivered copy.
- Service-news broadcasts with dry run, confirmation, pacing, resume and opt-out.
- *Added by the intake of legacy release `index-BnFvC-Ft.js`:* the native body of `POST /settings/card-sample`
  (API-036, BOT-085), which replaces its stub: the sample card of WP-53 in the user's saved `card_style`, sent through
  `CardSender` and the pacer like any card; `sent: false` when the chat cannot be written or the pacer refuses. A
  per-user limit follows Q-API-067. Pushes and digests use the recipient's `card_style` too.
- The radar launch link `?radar=<id>`, end to end (DEC-61; legacy since `index-CIa0Ldj2.js`): the bot's button and
  the Mini App's reading of the link, about 150 changed lines of the Mini App on top of the size above ("Radar
  launch link" in "Design").

Out:

- Polling, matching, the delivered set, planning (instant, quiet hold, digest slot), eligibility, the outbox table,
  the claim, the release command `radar:release`, the job `DeliverRadarItems`, dropping rows when a radar is paused
  or deleted or a chat becomes unreachable — WP-46.
- The listing card, `CardSender`, the delivered-card log `bot_listing_messages`, the card buttons — WP-53.
- The starter list — WP-54 (it does not go through the outbox).
- The settings rows for quiet hours, digest times and service news — WP-56. Radar mode buttons — WP-55.
- Cut-over tools of the earlier plan (`telegram:intake …`, `delivery:cap …`, the re-send dry-run against a migrated
  log): not built; HOMI's bot has no predecessor.
- An operator screen for broadcasts and takedowns: the admin panel is not in Wave 1 (DEC-43); artisan commands
  stand in.
- The owner cabinet's request messages and the operators' notice — WP-89. They are not outbox items of WP-46 (its
  outbox is unique per user and listing and groups digests): they leave as paced jobs on `notifications` through
  this package's `TelegramPacer` and `PaceTelegramSends`, with a ledger of their own (`bot_notices`), and stop with
  `delivery:pause` like every paced send (*added by the owner-cabinet plan*).

## Decisions that bind this package

| # | Decision | Consequence here |
| - | -------- | ---------------- |
| 1 | DEC-43 — radars with delivery are in Wave 1 | All five outbound handlers are built. None was ever observed in legacy (`04` §5), so each format is closed by specification with its question cited, and can change when someone captures the legacy message |
| 2 | `25` §5 — the matcher polls the listing source | A match appears when the poll of WP-46 finds the listing (every five minutes per filter set), not when it was published. `delivery_lag_seconds` is measured from publication and includes the poll interval |
| 3 | DEC-51, WP-45, WP-46, WP-48 — radar creation and matching stay off until this package is deployed | No radar can exist on staging or production before the switch, so the outbox is empty at the first run. This package switches both on, together, after its part A is deployed (section "Switching radars on"), and from then on the Mini App and the bot offer radars. The age guard still exists for rows planned while the sender was missing, paused or failing: an item older than `delivery.max_age_hours` (36) is failed as `expired`, never sent |
| 4 | `25` §4.5 — `source_unavailable` | A send that needs the listing source and cannot get it fails as transient; the outbox retries after 1, 5 and 15 minutes and gives up at the fifth attempt (WP-46) |
| 5 | `25` §4.4, RK-27 — demo marker | A push or digest built from stub data carries the marker through the renderer of WP-53. Matching itself is off while the feed is on the stub driver (WP-46) |
| 6 | DEC-33 | Tests and local runs use the fake Bot API and the stub source |
| 7 | DEC-20 (open: cap on instant cards per radar per hour) | Off (`delivery.instant_cap_per_radar_per_hour` of WP-46 is `null`). The pacer does not know radars |
| 8 | DEC-22 (open: operator roles) | Until roles exist a broadcast needs a one-time token and, on production, the env switch set by the production track |
| 9 | `25` §14 item 5 | The wave is done only when an instant card, a digest and a quiet-hours release were each observed on production; the checklist has a line for each |
| 10 | DEC-45, DEC-46 | Checked inside Telegram on staging and production |
| 11 | DEC-61 — the launch link `?radar=<id>` is built with the bot | This package builds both halves: the `web_app` button that carries the link and the Mini App's reading of it. Whether the legacy bot sends such links, and from which message, is open (`04` Q-BOT-050) |

## Design

### What WP-46 provides, as written there

| Piece | Name | Used here for |
| ----- | ---- | ------------- |
| Outbox contract | `App\Services\Delivery\Contracts\RadarOutbox`: `dueUsers`, `dueFor`, `claim`, `markSent`, `markFailed` | not called here; the job of WP-46 calls `defer` when this sender defers |
| Sender contract | `App\Services\Delivery\Contracts\RadarSender`: `sendCard(User, OutboxItem): SentMessage`, `sendDigest(User, list<OutboxItem>): SentMessage` | implemented here; the binding replaces `NullRadarSender` |
| Item and result | `OutboxItem` (`id`, `userId`, `radarId`, `listing`, `kind`, `matchedAt`, `releaseAt`), `SentMessage` (`chatId`, `messageId`) | |
| Failure signal | `App\Exceptions\Delivery\SendFailed` (`reason`, `permanent`) | thrown by the sender |
| Delivery job | `App\Jobs\Radar\DeliverRadarItems`, unique per user until processing starts (`ShouldBeUniqueUntilProcessing`, WP-46): claims each due item, calls the sender, marks the result; groups `quiet_hold` and `digest` items of one `release_at` into one digest | unchanged; its deferral path is described below |
| Release | `radar:release` every minute; the listener on `DeliveryDue` | unchanged |
| Chat lost | `App\Events\Telegram\ChatUnreachable` and its listener | the sender raises the event through `ChatReachability` of WP-52 |
| Ledger | `DeliveryLedger` with table `radar_deliveries` | read by `delivery:reconcile` |

The claim (with eligibility and the ledger insert) happens in WP-46 before the sender is called, so a retry, a
duplicate `DeliveryDue` or a crash after Telegram accepted a message cannot produce a second card: the ledger row
stays, and a second claim is refused as `duplicate`.

### What WP-46 already provides for pacing

| # | Already in WP-46 | Why |
| - | ---------------- | --- |
| 1 | `RadarOutbox::defer(OutboxItem $item, int $seconds): void` and its implementation in `DatabaseRadarOutbox`: clears the claim and the ledger claim as a transient failure does, sets `release_at = now + seconds`, counts **no** attempt | Waiting for a free slot of the pacer is not a failure. With `markFailed` a large fan-out would use up the five attempts and drop deliveries |
| 2 | `DeliverRadarItems` catches `App\Exceptions\Delivery\SendDeferred` (a subclass of `SendFailed` with `retryIn`): it defers the item (for a digest, every item of the group), stops the loop for this user and dispatches itself again with that delay | One job, one message; the rest of the user's items follow at the per-chat rate |
| 3 | `DeliverRadarItems` runs on the queue `notifications`, not on `telegram` | `telegram` processes users' updates. A fan-out of thousands of delivery jobs in front of them would make the bot slow to answer |

The queue `notifications` exists today inside `supervisor-default`. The shared-file PR gives it `supervisor-delivery`
(connection `redis`, two processes locally and on staging, four on production, `tries` 1, `timeout` 60).

### Sender

`App\Services\Delivery\TelegramRadarSender implements RadarSender`. Before any Bot API call it runs the guards in
this order; each stops the send by throwing:

| # | Guard | Throws |
| - | ----- | ------ |
| 1 | `matchedAt` older than `delivery.max_age_hours` (36) | `SendFailed('expired', permanent: true)` |
| 2 | `DeliveryPause::isOn()` (the incident switch) | `SendDeferred(60)` |
| 3 | now is inside the user's quiet window (`QuietWindow` of WP-40) | `SendDeferred(seconds until the window ends)` — the planner normally prevents this; the guard covers a window switched on after planning |
| 4 | `TelegramPacer::reserve($chatId)` is not `allowed` | `SendDeferred($retryIn)` |

`sendCard()`: `CardSender::send($user, $number, CardOrigin::Instant, $radar, heading: null)` of WP-53, which renders
the card, sends it and writes the row of `bot_listing_messages`; returns `SentMessage`.

`sendDigest()`: `DigestComposer` builds the message from `ListingSource::previews()` of the items' numbers; one
`sendMessage`; then one row of `bot_listing_messages` per listed listing with origin `Digest` and the digest's
`message_id`; returns `SentMessage`.

How outcomes become signals for the outbox:

| Outcome | Signal |
| ------- | ------ |
| sent | `SentMessage` |
| `429` with `retry_after` | the pacer stores `tg:pause_until`; `SendDeferred(retry_after)` |
| `403` (bot blocked, user deactivated) | `ChatReachability::markBlocked()` of WP-52 and the event `ChatUnreachable`; `SendFailed('chat_unreachable', true)` |
| another `400` | `SendFailed('bad_request', true)` |
| `5xx`, transport error | one breaker failure; `SendFailed('telegram_unavailable', false)` |
| card lookup: source unavailable | `SendFailed('source_unavailable', false)` |
| card lookup: listing withdrawn or unknown | `SendFailed('listing_gone', true)`; for a digest the row is left out, and a digest with no row left is `SendFailed('empty', true)` |
| the user no longer exists | `SendFailed('user_gone', true)` |

A permanent failure releases the ledger claim (WP-46), so nothing counts as delivered that never reached the chat.

`DigestComposer` (`App\Services\Delivery\DigestComposer`):

| Part | Content |
| ---- | ------- |
| Header | `digest.header` — «📬 Подборка: N новых»; `digest.header_morning` when the group holds a `quiet_hold` item (TXT-BOT-087, never observed; Q-BOT-003, closed by specification; the product owner approves the wording) |
| Groups | when the items belong to several radars, rows under each radar's title (`RadarTitle` of WP-55) |
| Rows | the row format of the starter list (TXT-BOT-035, WP-54): `<n>. 2-комн. квартира · Юнусабад · $700 · @<канал> · 30.10 17:00`, newest first, price in the user's currency, every value escaped |
| Buttons | numbers five per row, data `k1:ln:<n>:n` — `OpenListingByNumber` of WP-53 sends the card as a new message with origin `Number` |
| Cap | `delivery.digest_max_rows` = 30 and never more than fits 4 096 characters; then the line `digest.more` with a `web_app` button to the Mini App: `MiniAppUrl::radar(<radar id>)` when the digest belongs to one radar, else `MiniAppUrl::home()` (DEC-61). Items beyond the cap were claimed by the outbox and count as delivered, so they do not flood the next digest |

One digest per user and slot across all radars (the grouping of WP-46); a single held item still arrives as a digest
of one; an empty digest is never sent (Q-BOT-003, closed by specification). Pushes are sent with sound. A heading
with the radar title is added to a push only when `config('delivery.show_radar_title')` is true (default false;
Q-BOT-002).

### Radar launch link (DEC-61)

Legacy reads the page query `?radar=<id>` since `index-CIa0Ldj2.js` and opens the search with that radar's filters
(`03` BR-APP-107; its defects: LB-APP-079, LB-APP-080). HOMI builds the link and its reader together, here.

- **Bot.** The `web_app` button of the digest's `digest.more` line opens `MiniAppUrl::radar(<radar id>)` of WP-52
  when the digest belongs to one radar, and `MiniAppUrl::home()` otherwise. A radar push gets such a button only if
  the operator's answer says that legacy has one (`04` Q-BOT-050). HOMI's radar ids are ULIDs.
- **Mini App.** `lib/deeplinks/parse.ts` reads `radar` (a ULID; anything else is ignored). `lib/deeplinks/launch.ts`
  and `features/shell/LaunchRedirector.tsx` replace the address by the radar's feed (`radarFeedHref` without
  `from=radar`, so there is no return state) when the launch names no listing, radars are on and `GET /radars` holds
  the id. A miss, an error and a launch that names a listing change nothing: the listing link wins.
- This closes row 36 of `wave-1/baseline.md` ("Built code behind the pin").

### Pacer

- `App\Services\Delivery\TelegramPacer::reserve(int $chatId): PaceDecision` — `allowed`, or `retryIn(seconds)`.
  Laravel's `RateLimiter` and `Cache` on the default cache store — Redis on the servers, `array` in tests; no raw
  Redis command, because CI starts no Redis service. Keys: `tg:pace:global:{bot_id}` (per second),
  `tg:pace:chat:{bot_id}:{chat_id}` (per second), `tg:pause_until:{bot_id}` (set after a `429`),
  `tg:breaker:{bot_id}`, `tg:pace:waiting:{bot_id}` (a counter of deferred sends).
- `retryIn` when the global rate is used up is `ceil(waiting / global_per_second)`, at least 1 and at most
  `max_release_seconds`, so a large fan-out spreads out instead of every job retrying in the same second.
- Config `telegram.pacing`: `global_per_second` (`TELEGRAM_SEND_RATE_GLOBAL`, 25 — the rest of Telegram's about 30
  per second stays for replies to user actions, which do not pass the pacer), `per_chat_per_second`
  (`TELEGRAM_SEND_RATE_PER_CHAT`, 1), `breaker_threshold` (20 failures of kind `429` or `5xx` in 60 seconds),
  `breaker_open_seconds` (60), `max_release_seconds` (60).
- Breaker open: `reserve()` answers `retryIn(breaker_open_seconds)`; one log line and one metric per opening; after
  the open time one probe send goes through and closes it on success.
- `App\Services\Delivery\DeliveryPause` with `php artisan delivery:pause on|off|status` (cache key
  `delivery:paused`). While on, nothing paced is sent and items stay due. It is an incident switch (WP-71 uses it),
  not a rate cap.
- `App\Jobs\Middleware\PaceTelegramSends` applies the same pacer to the jobs of this package that are not outbox
  items (`EditCardWithdrawn`, `SendBroadcastBatch`): not allowed → `$job->release($seconds)`; `429` → release for
  `retry_after`; `403` → `ChatUnreachable`, no retry; another `400` → failed, no retry; `5xx` → release after 5, 15,
  60 seconds. These jobs: queue `notifications`, `tries` 5, `retryUntil` 6 hours.
- No job ever sleeps (architecture test over `app/Jobs`).

### Switching radars on (DEC-51)

Until here `config('radar.creation_enabled')` (WP-11) and `config('radar.matching_enabled')` (WP-46) are off on
staging and production: the radar methods refuse writes (WP-13, WP-45), the Mini App shows "soon" (WP-30) and the
bot answers `bot.radar.soon` (WP-51). Once part A is deployed and the sender is bound, per environment, staging
first:

1. `php artisan radar:status` — no pending rows are expected; note the number.
2. The production track sets `RADAR_CREATION_ENABLED=true` and `RADAR_MATCHING_ENABLED=true` in the server env and
   restarts Horizon. php-fpm reads the env on every request, so the API follows at once; the Horizon workers,
   which run the bot's handlers and the poll jobs, read it only at start (`docs/infrastructure/deployment.md`).
3. Check: `GET /api/v1/reference` reports `radars_enabled: true`; `/new` opens the wizard; the Mini App shows the
   radar tab instead of "soon" once its cached reference data has expired (about ten minutes, WP-22).
4. Run the passes inside Telegram that waited for this switch: the radar lines of the Mini App (WP-30 — the
   follow nudge, the return banner and the radar card in the search list among them, rows 26 … 31, 40, 46 and 47
   of WP-33 — with the lines of WP-45 and of WP-48 part D that point here), the wizard (WP-54), the radar screens and free text
   (WP-55). Then the delivery lines of this package's checklist.
5. Production: steps 1 – 4 again, after staging passed.

Going back is the same two keys unset and a Horizon restart: writes are refused again, the lists answer empty
(the radars stay stored and come back with the next switch-on) and no new match is planned. If cards are going
out wrongly, `delivery:pause on` comes first. `RADAR_STARTER_ENABLED` and `RADAR_REQUIRE_CHAT` are not touched
here: WP-54 switched them on.

### Withdrawn listings

How HOMI learns of a withdrawal in Wave 1 — legacy sends no events:

1. Event `App\Events\Listings\ListingWithdrawn(int $number, string $cause)` with `cause` ∈ `source`, `takedown`.
   No earlier package defines it; this package creates it.
2. `App\Jobs\Delivery\RecheckDeliveredListings`, command `delivery:recheck-delivered`, scheduled every 15 minutes:
   takes listing numbers that have `sent` rows in `bot_listing_messages` younger than `delivery.recheck_days` (14)
   and were not checked for `delivery.recheck_interval_hours` (6), asks `ListingSource::previews()` in batches of
   50, at most `delivery.recheck_max_batches` (10) per run, in `SourceContext::system()` so the calls take the
   background share of the legacy budget (WP-41). A listing that is withdrawn, or that the source no longer knows
   (it is marked gone in `listing_refs`, WP-42), dispatches `ListingWithdrawn($number, 'source')`. The time of the
   last check is kept per number as the cache key `delivery:rechecked:{number}` with a TTL of
   `recheck_interval_hours` (a number is skipped while its key exists; no Redis sorted set, see "Pacer"). When the
   legacy breaker is open the run ends at once.
3. `php artisan delivery:withdraw {number} --cause=takedown` for an author's request made to HOMI: dispatches the
   event and marks the listing so that HOMI stops showing it. WP-44 has no mark kinds: `listing_marks` holds
   `listing_number` and `rented_at` only. This PR adds the nullable column `listing_marks.taken_down_at` (additive
   migration) and makes `EloquentOverlayData::rentedByVotes()` of WP-44 return such numbers too, also while the
   rented detector is off. Until the admin panel exists this is the operator's tool (SEC-REQ-040).
4. The status changes of a HOMI owner listing (WP-84) raise the same event through WP-89's listener: `source` when it
   is removed, let or held (by the operators or by votes), `takedown` when the operators withdraw it (votes only hold
   it), nothing when it is paused. So its sent cards become «Объявление снято» as any other listing's
   (*added by the owner-cabinet plan*).

Editing:

- `App\Listeners\Delivery\FanOutWithdrawnEdits` (queued on `notifications`) walks the `sent` rows of the number in
  chunks of 500 and dispatches one `App\Jobs\Delivery\EditCardWithdrawn` per message (paced by the middleware). It
  also deletes the unsent outbox rows of that listing number.
- `App\Services\Delivery\CardEditor`: a card message is edited to the withdrawn variant of WP-53 — the title row
  plus `card.withdrawn` «🚫 Объявление снято» (TXT-BOT-047, never observed; Q-BOT-031, closed by specification) and
  no keyboard: `editMessageCaption` for a photo card, `editMessageText` for a text card.
- Cause `takedown`: a photo card is edited with `editMessageMedia` to the neutral placeholder of the asset registry
  (WP-51); the original text, the photo and any phone do not remain in the message (BR-BOT-092).
- A digest message is re-rendered from its log rows with the withdrawn row replaced by `<n>. digest.row_withdrawn`
  and its number button removed; several withdrawals of one digest within a minute are one edit.
- Result per row: state `edited_withdrawn` with `edited_at`; `400 message is not modified` the same; `message can't
  be edited` or `message to edit not found` → `edit_failed`, no retry; `403` → `ChatUnreachable`. The two states are
  added to `CardMessageState` of WP-53.
- A second event for the same number finds no `sent` row and does nothing. A listing that becomes active again does
  not revert edited cards.

### Broadcasts

- Tables: `broadcasts` (`id` ULID, `audience` string 32, `texts` json with `ru`, `uz`, `en`, `created_by` string
  64, `dry_run_count`, `confirm_token_hash`, `confirmed_at`, `status` string 16: `draft`, `counted`, `running`,
  `paused`, `done`, timestamps) and `broadcast_recipients` (`broadcast_id`, `user_id`, `status` string 16:
  `pending`, `sent`, `blocked`, `failed`, `skipped`, `message_id`, `attempted_at`; unique `broadcast_id` +
  `user_id`). Models with factories. `broadcast_recipients` is added to `config/erasure.php` of WP-47 (strategy
  `delete`), and both tables to `config/retention.php` (`kept`: "audit of what was sent, no text of a user";
  `RetentionRegistryTest` of WP-47 fails without the entries).
- `App\Services\Delivery\BroadcastService`: `draft()` (texts in all three languages, Telegram HTML allow-list only,
  `https` links to allow-listed hosts only, at most 4 096 characters), `dryRun()` (stores the count, returns a
  one-time token), `confirm($token)`, `start()` (materialises recipients in chunks, dispatches
  `App\Jobs\Delivery\SendBroadcastBatch` of at most 100 recipients, paced), `pause()`, `resume()`.
- Audience `service_news`: users with `service_news = true` (WP-56), `bot_chat_state` active (WP-52), not refused
  by the access gate. A new audience is added only in code.
- `SendBroadcastBatch` checks the opt-out and reachability again per recipient at send time (`skipped`), sends the
  text of the recipient's language, records the result; a restarted batch skips rows that are not `pending`.
- Commands: `telegram:broadcast draft --audience= --ru= --uz= --en=`, `dry-run {id}`, `confirm {id} --token=
  --i-understand`, `status {id}`, `pause {id}`, `resume {id}`. On `APP_ENV=production` `confirm` refuses unless
  `config('telegram.broadcast_enabled')` (`TELEGRAM_BROADCAST_ENABLED`, default `false`; the key WP-71 checks) is
  true.
- The message body is never logged; logs and metrics carry counts. The content of a broadcast (TXT-BOT-088) is
  written by the team for each sending and is not a catalogue text.

### Metrics, schedule, configuration

Metrics through `BotMetrics` of WP-50, no user or chat id as a label: `telegram_send_total{method, result}`,
`telegram_breaker_open_total`, `telegram_send_deferred_total{cause}`, `delivery_lag_seconds` (publication → send),
`delivery_release_lag_seconds` (now − `releaseAt`), `delivery_failed_total{reason}`, `delivery_unlogged_claims`,
`card_edit_total{result}`, `broadcast_recipients_total{status}`.

`php artisan delivery:reconcile`, every ten minutes: counts rows of `radar_deliveries` with origin `instant` or
`digest`, without a message id, older than ten minutes — a claim whose send never reported back. It sets the metric
`delivery_unlogged_claims` and writes one log line with the number. It never re-sends.

`backend/routes/console.php`: `delivery:reconcile` every ten minutes; `delivery:recheck-delivered` every fifteen
minutes.

`backend/config/delivery.php` (file of WP-46), added keys: `max_age_hours` (36), `show_radar_title` (false),
`digest_max_rows` (30), `recheck_days` (14), `recheck_interval_hours` (6), `recheck_max_batches` (10).

New catalogue keys (ru, uz, en): `digest.row_withdrawn`, `card.withdrawn_toast`. `digest.header`,
`digest.header_morning`, `digest.row`, `digest.more` and `card.withdrawn` are keyed by WP-51 as drafts; this package
finalises their wording.

## Files

All paths under `backend/`.

- `app/Services/Delivery/{TelegramRadarSender,TelegramPacer,PaceDecision,DeliveryPause,DigestComposer,CardEditor,BroadcastService}.php`
- `app/Jobs/Middleware/PaceTelegramSends.php` (`app/Exceptions/Delivery/SendDeferred.php` is not new: WP-46
  creates it next to `SendFailed.php`)
- `app/Jobs/Delivery/{RecheckDeliveredListings,EditCardWithdrawn,SendBroadcastBatch}.php`
- `app/Listeners/Delivery/FanOutWithdrawnEdits.php`, `app/Events/Listings/ListingWithdrawn.php`
- `app/Console/Commands/Delivery/{PauseCommand,ReconcileDeliveries,RecheckDeliveredCommand,WithdrawCommand}.php`,
  `app/Console/Commands/Telegram/BroadcastCommand.php`
- `app/Models/{Broadcast,BroadcastRecipient}.php`, their factories,
  `database/migrations/<date>_create_broadcasts_tables.php`
- Code of WP-46, not changed: `RadarOutbox::defer`, the deferral path and the queue `notifications` of
  `app/Jobs/Radar/DeliverRadarItems.php` exist since WP-46 ("What WP-46 already provides for pacing");
  `app/Models/ListingMark.php` and `app/Services/Personal/EloquentOverlayData.php` of WP-44 are changed
  (`taken_down_at`), with `database/migrations/<date>_add_taken_down_at_to_listing_marks_table.php`
- `app/Enums/Delivery/CardMessageState.php` (two states added), `app/Providers/AppServiceProvider.php` (binding
  `RadarSender` → `TelegramRadarSender`)
- `config/telegram.php` (`pacing`), `config/delivery.php`, `config/erasure.php`, `config/retention.php`,
  `routes/console.php`,
  `lang/{ru,uz,en}/bot.php`
- Shared files, each in its own small PR: `config/horizon.php` (`supervisor-delivery`), `.env.example` (three keys)
- `tests/Unit/Telegram/PaceDecisionTest.php`, `tests/Unit/Delivery/DigestComposerTest.php`,
  `tests/Arch/NoSleepInJobsTest.php`
- `tests/Feature/Delivery/{TelegramPacerTest,TelegramRadarSenderTest,InstantDeliveryTest,QuietHoursDeliveryTest,DigestDeliveryTest,OutboxDeferTest,DeliveryReconcileTest,RecheckDeliveredTest,WithdrawnCardEditTest,BroadcastTest,RadarSwitchOnTest}.php`
- `tests/Fixtures/Bot/transcripts/{push,digest,digest-morning,card-withdrawn}.json`
- `docs/infrastructure/telegram-webhook.md` (section "Outbound sending": limits, switches, commands)
- Mini App, for the radar launch link (paths under `frontend/app/`): `lib/deeplinks/{parse,launch}.ts`,
  `features/shell/LaunchRedirector.tsx`, `tests/deeplinks/*`, one case in `e2e/launch.spec.ts`

## Steps

Generators always with `--no-interaction`; tests first inside each step; Pint after every PHP edit.

Part A.

1. Read the specification and the code of WP-46 (the outbox contracts, `DeliverRadarItems`, its tests) and of WP-53
   (`CardSender`); read `.ai/agents/telegram-bot-engineer.md` rule 8 and the skills `laravel-queues` and
   `configuring-horizon`. Write into "Handoff" anything that differs from "What WP-46 provides".
2. The shared-file PRs: `supervisor-delivery`; the three env keys.
3. `TelegramPacer`, `PaceDecision`, `DeliveryPause`, `delivery:pause`, `PaceTelegramSends`; `TelegramPacerTest`,
   `NoSleepInJobsTest`.
4. Confirm in the code of WP-46 that `SendDeferred`, `RadarOutbox::defer` and the deferral path of
   `DeliverRadarItems` on the queue `notifications` exist as its specification says; add only what is missing and
   say so in the PR; `OutboxDeferTest`. The tests of WP-46 stay green.
5. `TelegramRadarSender::sendCard` with the guards and the outcome table; `TelegramRadarSenderTest`,
   `InstantDeliveryTest` (through the real job of WP-46), transcript `push.json`.
6. `DigestComposer`, `TelegramRadarSender::sendDigest`; `DigestComposerTest`, `DigestDeliveryTest`,
   `QuietHoursDeliveryTest` on a frozen clock in Asia/Tashkent; transcripts.
7. Bind the sender; `delivery:reconcile`; `RadarSwitchOnTest`; `make ci-backend`; PR A; deploy. Then the procedure
   of "Switching radars on", on staging and after it on production: the two env keys, the passes that waited for
   the switch, and the delivery checks — a radar that matches fresh listings shows one instant card; the same
   radar in digest mode shows a digest at the next slot; with quiet hours covering the current hour nothing
   arrives until the window ends, then one morning digest.

Part B.

8. `ListingWithdrawn`, `RecheckDeliveredListings` with its schedule entry; `RecheckDeliveredTest`.
9. `CardEditor`, `FanOutWithdrawnEdits`, `EditCardWithdrawn`, the two states, the press on a withdrawn copy
   (`card.withdrawn_toast` in the card handler of WP-53); `WithdrawnCardEditTest`, transcript.
10. `delivery:withdraw` with the mark of WP-44.
11. The broadcasts migration, models, `BroadcastService`, `SendBroadcastBatch`, `telegram:broadcast`, the erasure
    entry; `BroadcastTest`.
12. The outbound section of `docs/infrastructure/telegram-webhook.md`; `make ci-backend`; review by the
    `security-reviewer` agent (pacing, broadcast safety, logs); PR B; deploy; a broadcast to the developers' own
    accounts on staging.

## Behaviour to reproduce

Owned: handlers BOT-062, BOT-081 … BOT-084; texts TXT-BOT-047, TXT-BOT-086 … TXT-BOT-088. No buttons. The card and
its buttons (TXT-BOT-044) belong to WP-53.

| # | Scenario | What the user sees | Rules, questions |
| - | -------- | ------------------ | ---------------- |
| 1 | A new listing matches an active radar in instant mode, outside quiet hours (BOT-081) | One card per listing, as a new message with sound, the same card a number button opens (TXT-BOT-086 = the card). No radar name | BR-BOT-100, BR-BOT-101; Q-BOT-002 |
| 2 | The same listing matches two radars of the user, or the due signal arrives twice | One card | the outbox and the ledger are unique per user and listing |
| 3 | The match falls into the user's quiet hours (BOT-083) | Nothing during the window. Within about a minute after its end one message «📬 Подборка…» in the morning variant with everything held, newest first | BR-BOT-077; Q-BOT-003 |
| 4 | The radar is in digest mode (BOT-082) | At the user's digest hours (Asia/Tashkent) one digest for all digest radars: header, rows, number buttons; a number opens the card as a new message and the digest does not change | BR-BOT-074, BR-BOT-078; Q-BOT-003 |
| 5 | Nothing new for a slot | No message | closed by specification |
| 6 | More than 30 new listings for a slot | 30 rows and the line `digest.more` with a button to the Mini App; the rest counts as delivered | closed by specification |
| 7 | A delivered listing is withdrawn at the source (BOT-062) | Every copy in the chat — push, opened by number, from `/fav`, by deep link — becomes the title row and «🚫 Объявление снято» (TXT-BOT-047) without buttons, within the recheck interval. A digest row becomes «снято» and loses its number button | BR-BOT-092; Q-BOT-031 |
| 8 | A listing is taken down at the author's request | As row 7, and the photo is replaced by a neutral image; the original text and phone are gone from the message | BR-BOT-092, SEC-REQ-040 |
| 9 | A button is pressed on a copy that could not be edited | Toast `card.withdrawn_toast`, the keyboard is removed | closed by specification |
| 10 | The team sends service news (BOT-084) | Users with «Новости сервиса: Присылать» get the text in their language (TXT-BOT-088); users with «Не присылать» get nothing, also when they switched it after the sending started | BR-BOT-080; Q-BOT-004 |
| 11 | The user blocked the bot | Nothing is sent again; the user's pending items are dropped by WP-46; radars stay as they are (Q-BOT-012, closed by specification) | BR-BOT-007 |

Edge cases and limits:

- The bot writes on its own only for pushes, digests, news and the poll of WP-55 (BR-BOT-007). Pacing never adds a
  message.
- Never more than `global_per_second` paced sends in a second and never two paced messages to one chat within a
  second. After a `429`, no paced call before `retry_after` has passed (SEC-REQ-029).
- A listing × thousands of users: the jobs are deferred in waves by the pacer; no item is failed for waiting.
- A radar switched from digest to instant keeps its pending digest rows for the next slot; no burst of cards.
- A paused or deleted radar: its unsent rows are deleted by WP-46; one that slips through fails the claim.
- The scheduler was down over a slot: the next `radar:release` run sends the overdue group once; a group older than
  36 hours is expired instead.
- Price changes and re-posts do not trigger a delivery in Wave 1: only listings new to the poll do (WP-46;
  Q-BOT-033).
- Favourite notifications (price drop, removal) do not exist in legacy and are not built (`04` §5).
- Messages too old for Telegram to edit end as `edit_failed`; they are counted, never retried in a loop.
- All times are Asia/Tashkent wall-clock, stored in UTC; there is no per-user time zone.

No legacy defect of `04` §9 concerns this package, and it has no `DEV` flag.

## Tests

Bot API through `FakeBotApi` of WP-50; clock frozen with `travelTo` in Asia/Tashkent; outbox rows created through
the planner of WP-46 and delivered through its real job; the listing source on the stub driver.

| # | Test | Cases |
| - | ---- | ----- |
| 1 | `TelegramPacerTest` | 30 reservations for 30 chats in one second at 25 per second → 25 allowed, 5 with `retryIn` ≥ 1; three for one chat → one per second; after a `429` with `retry_after=3` nothing is allowed for three seconds; 21 failures in a minute → breaker open, one log line; a minute later one probe closes it; `retryIn` grows with the waiting counter and stops at the maximum; pause on → nothing allowed |
| 2 | `OutboxDeferTest` | `defer` clears the claim and the ledger claim, moves `release_at`, leaves `attempts` unchanged; the job stops after a `SendDeferred`, re-dispatches itself with the delay and sends the item on the next run; ten deferrals do not fail an item; the job runs on `notifications` |
| 3 | `TelegramRadarSenderTest` | each row of the guard table and of the outcome table: the exception class, `reason`, `permanent`, and for `403` one `ChatUnreachable`; an item matched 37 hours ago → `expired`, no Bot API call; inside a quiet window switched on after planning → deferred to its end |
| 4 | `InstantDeliveryTest` | one due item → one `sendPhoto`, the outbox row sent, the ledger row with chat and message id, a log row with origin `Instant`; `DeliveryDue` twice → one send; one listing, two radars → one send; `403` → the ledger claim released, `ChatUnreachable`; an exception after the fake accepted the send → the retry sends nothing; user erased → nothing; source unavailable → retried by the outbox, permanent at the fifth attempt; stub data → the card carries the demo marker; three due cards for one chat → one per second |
| 5 | `QuietHoursDeliveryTest` | quiet 23–8, match at 23:30 → nothing at 23:31, 03:00, 07:59; one morning digest at 08:00; three held matches → one digest of three; quiet 0–9, match at 23:59 → sent at once; quiet 22–8, matches at 21:59 and 22:00 → sent and held; a property test with random matches never calls the Bot API inside a window |
| 6 | `DigestComposerTest` (unit) | header with N; morning header; two radar groups; row format; 5-per-row grid; 30-row cap with the overflow line; stops before 4 096 characters; escaping; `uz` with soʻm; the overflow button opens `radar=<id>` for a digest of one radar and the plain address for several (DEC-61) |
| 7 | `DigestDeliveryTest` | digest hour 19, three items → one message at 19:00, three log rows with one `message_id`; press `2` → card as a new message, digest unchanged; 45 items → 30 rows, 45 outbox rows sent; the job run twice → one message; `429` → sent once after the wait; `403` → claims released; every listing withdrawn before the send → no message |
| 8 | `DeliveryReconcileTest` | a ledger row older than ten minutes without a message id is counted; nothing is sent |
| 9 | `RecheckDeliveredTest` | a delivered number the source reports withdrawn → one event; unknown number → one event; active → none; a number checked an hour ago is skipped; at most ten batches per run; breaker open → no call |
| 10 | `WithdrawnCardEditTest` | photo card → `editMessageCaption`, text card → `editMessageText`, both with the withdrawn text and no keyboard; the same event again → no call; a digest row replaced and its button removed; two rows of one digest → one edit; takedown → `editMessageMedia` to the placeholder and no original text in the payload; `can't be edited` → `edit_failed`; `403` → `ChatUnreachable`; 1 000 rows → every row final, one edit per message; unsent outbox rows of the number are gone; a press on a failed copy → toast and keyboard removed |
| 11 | `BroadcastTest` | five users (three opted in, one opted out, one blocked) → count three, three sends; start without confirm → refused; wrong token → refused; opt-out while queued → `skipped`; one `403` → `blocked`, others continue; a batch killed after 40 of 100 → 60 more, no duplicate; a text with a script tag or an `http` link → draft refused; a `uz` user gets the `uz` text; production without the switch → refused; 10 000 recipients stay under the rate |
| 12 | `NoSleepInJobsTest` (arch) | no class under `app/Jobs` calls `sleep` or `usleep` |
| 13 | `RadarSwitchOnTest` | with `radar.creation_enabled` and `radar.matching_enabled` on and the feed on the fixture-backed legacy driver: a radar created through `POST /radars` gets its filter set, a poll that finds a new listing plans one item, and the sender delivers one card; with both off: `POST /radars` → `403 radars_disabled`, `radar:poll` dispatches nothing, nothing is sent; `GET /reference` reports `radars_enabled` accordingly |
| 14 | Mini App: `tests/deeplinks/*` (Vitest) and one Playwright case | `radar=<ULID>` is parsed and anything else ignored; a launch with the id of the user's radar replaces the address by that radar's feed; an unknown id, a failed `GET /radars`, radars switched off and a launch that also names a listing leave the launch as it was (DEC-61) |

## Acceptance checklist

Run on the staging bot and on the production bot with a real radar; ru, uz and en for the texts of the digest and
the withdrawn card. Attach screenshots to the PR.

- [ ] Before the switch on each environment `radar:status` was run and its pending count noted (expected 0: no
      radar could exist); any row older than 36 hours was expired by the first run, not sent.
- [ ] `RADAR_CREATION_ENABLED=true` and `RADAR_MATCHING_ENABLED=true` were set together, with a Horizon restart,
      on staging and then on production; there `GET /reference` answers `radars_enabled: true`, the «Радар» tab of
      the Mini App offers radars instead of "soon", and `/new` opens the wizard.
- [ ] The passes inside Telegram that waited for the switch were run on staging and then on production, with
      their screenshots: the radar lines of WP-30 (and the lines of WP-45 and WP-48 that point here), the checklist
      of WP-54 and the checklist of WP-55 (its free-text lines once the team has configured a provider).
- [ ] An instant card arrives for a new matching listing, once, with the full card and its buttons.
- [ ] A listing that matches two radars arrives once.
- [ ] With quiet hours covering the current time no card arrives; after the window ends one morning digest arrives
      with the held listings.
- [ ] A radar in digest mode produces one digest at the next digest hour; a number opens the card; the digest does
      not change.
- [ ] No digest arrives when there is nothing new.
- [ ] The button under a digest of one radar that overflowed opens the Mini App on that radar's search; a launch
      with an unknown radar id opens the default search; a launch that names a listing opens the listing (DEC-61).
      Row 36 of `wave-1/baseline.md` is marked closed.
- [ ] A listing shown in a starter list, a push or a digest is not delivered a second time.
- [ ] The bot keeps answering commands without delay while a large test fan-out is being sent.
- [ ] A withdrawn listing: its delivered copies show «Объявление снято» without buttons; its digest row shows
      «снято».
- [ ] `delivery:withdraw` on staging replaces the photo of a delivered card and removes the original text.
- [ ] A broadcast on staging reaches the opted-in test accounts in their languages and skips the opted-out one;
      without the token nothing is sent.
- [ ] `delivery:pause on` stops pushes; `off` lets the waiting ones out, once each.
- [ ] After blocking the bot from a test account nothing more is attempted for it.
- [ ] On production: an instant card, a digest and a quiet-hours release were each observed (`25` §14 item 5); the
      date and the radar are noted in the PR.
- [ ] The metrics of this package are visible to the production track and the alerts of WP-70 can be bound to them.
- [ ] Tests of this package and of WP-46 are green; `make ci-backend` is green; the security review is recorded in
      the PR.

## Handoff

Empty — nobody has started this package.
