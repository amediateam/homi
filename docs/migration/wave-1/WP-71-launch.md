# WP-71 — Launch and watch

| Field | Value |
| ----- | ----- |
| Stage | F |
| Status | TODO |
| Depends on | WP-70 |
| Size | about 500 changed lines, S: one read-only command with its test, three documents |
| Behaviour reference | `25` §4.3 (flags), §8 (release intake), §9 (definition of done of a package), §14 (definition of done of the wave); `24` §3 (rollback by flag), §8.2 (Q-SYS-009), §8.3 (RK-25 … RK-28), §9; `18` §5.4, §9, §10 (only the watch signals and the communication table; its stages are replaced); task file KV-QA-022; the specifications of WP-10, WP-48, WP-52, WP-57, WP-58, WP-70 |
| Needs from the production track | (1) The production deploy of the final state of `main`. (2) On production: `php artisan launch:check`, `php artisan sources:list`, `php artisan telegram:profile diff`, `php artisan security:check`, `php artisan radar:status` — and their outputs sent to the developer. (3) Confirmation that every alert of WP-70 is armed on production and who receives it. (4) Through the product owner: the operator's contact, and the operator posting the announcement in the old bot on the agreed day (Q-SYS-009). (5) During the watch period: the daily numbers of the table "Watch", and the switch actions of "Rollback" when asked, each logged with who and why. No migration, no env change |

## Goal

The product is declared launched when one checklist is green on production: no method answers from a stub, the bot
and the Mini App and the landing have passed their checklists, deliveries were observed, the security checks hold.
The old bot's users are told where to go. For two weeks the numbers are watched against thresholds with a known
action for each, and anyone on duty knows how to switch a method or a bot function off without a deploy.

## Scope

In:

- `php artisan launch:check`, a read-only command that verifies the machine-checkable lines of the launch checklist.
- The launch checklist, the go or no-go record, the announcement drafts, the watch plan, the rollback procedure —
  as documents under `docs/launch/`.
- Closing the wave: the queue, the session handoff, the trigger for the Wave 2 plan.

Out:

- Any feature work: a failed line goes back to the package that owns it.
- Posting in the old bot, and closing it — the legacy operator's acts (the closing is Wave 3).
- Moving users' data from the old bot: not done (DEC-40).
- Marketing beyond the one announcement.

## Decisions that bind this package

| # | Decision | Consequence here |
| - | -------- | ---------------- |
| 1 | `25` §14 | The eight items of the definition of done are the backbone of the checklist; none can be waived by the developers alone |
| 2 | DEC-45 | Everything is already on production by continuous deployment. "Launch" is a declaration and an announcement, not a deploy; there is no freeze and no point of no return |
| 3 | DEC-35, `24` §3 | A method is moved by its flag: reversible, logged, without a deploy. Personal data is native and is never affected by a switch |
| 4 | DEC-40 | Users start empty in the new bot. The announcement says so and promises no transfer |
| 5 | DEC-42, RK-28 | Without the service key the listing methods cannot leave the stub; then the launch is not declared (section "If the service key is missing") |
| 6 | DEC-13, Q-SEC-021 | Without the signed legal texts of WP-70 the launch is not declared |
| 7 | DEC-37, `25` §8 | Following legacy releases does not stop at the launch; it stops per surface when HOMI no longer reads it from legacy |
| 8 | Q-SYS-009 (open) | The date of the announcement depends on the operator; the checklist is valid without it and the announcement follows when the operator is ready |

## Design

### `launch:check`

`App\Console\Commands\Launch\LaunchCheck` — read-only, prints one row per check with `ok` or `FAIL` and exits 1 on
any failure. It prints names and states only, never a secret value.

| # | Check | Passes when |
| - | ----- | ----------- |
| 1 | Source flags | every feature of `config/sources.php` resolves to `legacy` or `native` for a system context and for a sample user; no stored rule names `stub`; `sources.allow_stub` is false |
| 2 | Driver binding | the result of `sources:check` |
| 3 | Legacy reachability | the result of `legacy:ping` (WP-41) |
| 4 | Radar switches | `radar.matching_enabled`, `radar.starter_enabled`, `radar.require_chat` are true; the sender bound for `RadarSender` is not the null one |
| 5 | Bot interim list | `config('bot.interim_commands')` is empty |
| 6 | Bot profile | `telegram:profile diff` reports no change |
| 7 | Webhook | `telegram:health` reports the expected address, no recent error, a low pending count |
| 8 | Scheduler and queues | the heartbeat is fresh; no failed job in the last hour; every Horizon supervisor of `config/horizon.php` is running |
| 9 | Secrets and dashboards | the result of `security:check` (WP-70) |
| 10 | Safety switches | `delivery:pause` is off; `telegram.broadcast_enabled` is false; the LLM feature state is printed (on or off, both pass) |
| 11 | Behaviour flags | every `bot.devNNN` and every flag of `frontend/*/lib/flags.ts` exported to the API config is off — a flag that is on is listed and needs a named approval in the go record |

### Expected driver of every method on production

From `25` §4.2. `meta.source` of a live call must equal the column.

| Method | Feature | Expected `meta.source` |
| ------ | ------- | ---------------------- |
| `POST /auth/telegram`, `GET /me`, `GET` and `PATCH /settings` | none | `native` |
| `GET /reference` | `source.reference` | `legacy` |
| `GET /cities` | `source.cities` | `legacy` |
| `GET /listings` | `source.listings.feed` | `legacy` |
| `GET /listings/count` | `source.listings.count` | `legacy` |
| `GET /listings/flow` | `source.listings.flow` | `legacy` |
| `GET /listings/map` | `source.listings.map` | `legacy` |
| `GET /listings/{number}` | `source.listings.card` | `legacy` |
| `POST /listings/{number}/contact` | `source.listings.contact` | `legacy` |
| `POST /listings/{number}/translation` | `source.listings.translation` | `legacy` |
| `POST /listings/{number}/share` | none | `native` |
| Favourites, history, hidden listings, blocked authors, the hidden list | none | `native` |
| `POST /listings/{number}/reports`, the two survey methods | none | `native` |
| The six radar methods | none | `native` |
| `POST /events` | none | `native` |
| `GET /landing/live` | `source.landing.live` | `legacy` |
| `GET /landing/pins` | `source.landing.pins` | `legacy` |

### Launch checklist

`docs/launch/checklist.md` — the list of "Acceptance checklist" below, each line with its evidence (command output,
link to a signed PR checklist, screenshot, date). The go or no-go decision is taken by the product owner with both
developers on that document and recorded in `docs/launch/go-record.md`: date, who, the lines that were accepted
with a remark, the flags that are on and who approved them.

### If the service key is missing

RK-28: the key is a change the operator must make in legacy. If it has not arrived when every other line is green:

- The listing methods stay refused on servers (`503 source_unavailable` since WP-48 switched stubs off), or on stubs
  if WP-48 itself could not be finished. Either way lines 1 … 3 of `launch:check` fail, and so do the checklist
  lines for the Mini App on real data, the three deliveries, and the landing's live blocks.
- The launch is **not** declared and no announcement is sent. Native parts (sign-in, settings, personal lists,
  radars, the bot's commands) stay deployed.
- The fallback of `24` §8.3 is a decision of the product owner, not of this package: import the operator's dumps
  into HOMI and serve listings natively, which is Wave 2 work brought forward. It is recorded as a queue row; this
  package stays `WAITING (service key)`.

### Announcement in the old bot

HOMI holds neither the old bot nor its token: the legacy operator posts the text as a service-news message of the
old bot. HOMI supplies the text and the link. Asked of the operator through the product owner, at least a week
ahead: the day and hour; the audience (users who did not opt out of service news); one repeat a week later; and,
for Wave 3, the closing of the old bot, which is the operator's own act and is not promised in the text.

Drafts — to be approved by the product owner and read by a proofreader (the Uzbek text in particular). Placeholders:
`<HOMI bot link>` = `https://t.me/<production bot username>?start=s_oldbot`, so arrivals are attributed (the payload
is an ordinary source tag for the parser of WP-52); `<date>` only if the operator has fixed one, otherwise the last
line is left out.

Russian:

> kvadro² переезжает и теперь называется HOMI.
>
> Поиск жилья продолжается в новом боте: <HOMI bot link>
> Там те же лента, карта, радары и избранное.
>
> Что сделать: откройте новый бот и нажмите «Старт». Радары и избранное не переносятся — настройте их заново, это
> пара минут.
>
> Этот бот работает до <date>.

Uzbek:

> kvadro² koʻchmoqda va endi HOMI deb ataladi.
>
> Uy-joy qidirish yangi botda davom etadi: <HOMI bot link>
> Unda oʻsha lenta, xarita, radarlar va sevimlilar bor.
>
> Nima qilish kerak: yangi botni oching va «Start» tugmasini bosing. Radarlar va sevimlilar koʻchirilmaydi — ularni
> qaytadan sozlang, bu bir necha daqiqa oladi.
>
> Bu bot <date> gacha ishlaydi.

English:

> kvadro² is moving and is now called HOMI.
>
> The housing search continues in a new bot: <HOMI bot link>
> It has the same feed, map, radars and favourites.
>
> What to do: open the new bot and press Start. Radars and favourites are not transferred — please set them up
> again; it takes a couple of minutes.
>
> This bot will keep working until <date>.

The text makes no promise the plan does not make: no data transfer, no date unless the operator gives one, no
statement about prices or features beyond "the same". The welcome of HOMI's bot (WP-52) needs no special variant
for these arrivals.

### Watch

Proposed length: 14 days from the announcement (or from the go record if there is no announcement yet) — the first
72 hours with both developers reachable within 15 minutes for a paging alert, then a daily look. The alerts of
WP-70 run all the time; this table is what a person reads once a day, in `docs/launch/watch-log.md`.

| Signal | Where to read it | Threshold | Action |
| ------ | ---------------- | --------- | ------ |
| `/api/v1` errors per method | metrics, nginx | `5xx` above 0.5 % of an hour's requests, or one method above 2 % | find the method; native → fix and deploy; legacy-backed → the rows below |
| `source_unavailable` rate; legacy breaker | metrics | above 5 % over 10 minutes; breaker open longer than 5 minutes | check `legacy:ping` and the limiter refusals; lower `LEGACY_RATE_PER_SECOND` if legacy throttles (RK-25); tell the operator; no switch helps while the source is down |
| Legacy latency | Pulse, outgoing requests | p95 above twice the baseline of WP-70 | as above; raise cache lifetimes within `25` §4.5 only by a PR |
| `LegacyContractError` | log lines at `error` | any | legacy changed: open a release-intake row (`25` §8), fix the translator first |
| Sign-in failures | metrics | `401` on sign-in above 5 % | verifier, bot token or clock; check `security:check` |
| Webhook | `telegram:health` | pending above 100; a new last error | Horizon `telegram` supervisor; the hook vhost; never re-register the webhook from a developer machine |
| Update processing lag | queue wait of `telegram` | above 10 s for 2 minutes | scale the supervisor; check for a stuck handler |
| Send failures | `telegram_send_total` | `429` above 20 a minute; other non-`403` failures above 1 % | the pacer rates; `delivery:pause on` if it keeps growing |
| Blocked chats | `bot_alert_blocked` per day against `bot_alert_sent` | above 5 % | review what was sent the day before: too many cards per radar, a wrong digest hour |
| Delivery lag | `delivery_lag_seconds`, `radar:status` | p95 above poll interval + 5 minutes; due rows above 500 | the `radar` and `notifications` supervisors; the legacy share of background calls |
| Digest and quiet hours | the first digest hours and the first morning after the announcement | a digest later than 10 minutes after its hour | look at the first three slots by hand |
| Re-sent cards | user reports; `delivery_unlogged_claims` | any confirmed duplicate | `delivery:pause on`; find the cause before resuming |
| LLM | spend and failure metrics | spend at 80 % of the cap before the evening; failures above 20 % | `llm:feature query-parsing off` |
| Queues | Horizon | any failed job | read it the same day |
| Mini App errors | `app_error` in the action log and PostHog | above 1 % of sessions | by client and version; fix forward |
| Landing | Core Web Vitals in PostHog or a Lighthouse run; the live blocks | LCP above 2.5 s at p75; blocks without numbers | the landing data methods; the media proxy |
| Product numbers (no threshold) | action log | new users, radars created, cards sent, favourites per day | the daily note to the product owner |

A day without a look is written down as such. After 14 days the developers and the product owner review the log:
incidents, numbers, the questions it closed (for example Q-API-059 from measured load), and what moves into Wave 2.

### Rollback

`docs/launch/rollback.md`. Every action names who ran it and why; `sources:*` commands require `--by` and
`--reason` and write to `source_flag_changes`.

Moving one method to another driver:

1. `php artisan sources:list` — the feature, its default here, its stored rule, the bound drivers.
2. Change it for the smallest scope that helps: named users (`sources:set <feature> <driver> --user=<id> …`), a
   share (`--share=<percent>`), or everyone (no option). Undo with `sources:reset <feature> --user=<id>`, `--share`
   or `--all`; after `--all` the configured default runs again at the next request.
3. Verify: call the method and read `meta.source`; `sources:list`; `sources:check`.

What a rollback can mean in Wave 1:

| Situation | What is possible |
| --------- | ---------------- |
| A listing method misbehaves on `legacy` | There is no `native` driver yet. The product degrades by design: the client shows "could not load", the bot answers `bot.common.source_unavailable`, pushes wait and expire after 36 hours, the landing hides its numbers. Moving back to `stub` is refused on servers (`SOURCES_ALLOW_STUB=false`); allowing it again shows demo data to real users with the marker (RK-27) — only as an emergency, by the product owner's decision, through the production track, and it is entered in the go record |
| A wrong default was merged | revert the defaults PR and deploy; or override at once with `sources:set` |
| Wave 2, a method newly on `native` | `sources:reset` puts it back on `legacy` in one command; this is the case the flag exists for |

Personal data is never lost by any of this: users, settings, lists, radars, the delivered set and the action log
are HOMI's own tables whatever driver serves listings (`24` §3).

Switching off single functions without a deploy:

| Function | Switch | Effect |
| -------- | ------ | ------ |
| All outbound sending | `php artisan delivery:pause on` (WP-57) | pushes, digests, edits and broadcasts wait; replies to users continue |
| Radar matching | `RADAR_MATCHING_ENABLED=false` (production track, config reload) | no new matches are planned; nothing is lost that was not found |
| Free text and voice | `php artisan llm:feature query-parsing off` (WP-55) | every phrase gets the not-understood reply |
| Broadcasts | `TELEGRAM_BROADCAST_ENABLED=false` (the default) | `confirm` refuses on production |
| The whole bot | the production track removes the webhook; Telegram keeps updates for a limited time | last resort; note the time, re-register with the script of WP-50 |
| Access for everyone | the access gate mode (WP-40) | the Mini App shows the no-access screen; the bot answers by the gate |

A code revert and a redeploy are needed when the fault is in native code or a bot handler (there is no flag for
those), when a migration misbehaves (forward fix only — a merged migration is never edited), or when a `DEV` flag
that someone switched on must go back and it is a configuration default.

### Closing the wave

1. `wave-1/README.md`: every package `DONE`, with the date of the go record under the table of stage F.
2. `.ai/memory/session-handoff.md`, `.ai/memory/current-state.md`, `HANDOFF.md`: Wave 1 done; what runs where; the
   switches and their current values.
3. `24` §9 item 5: the Wave 2 plan is due — the trigger is the collector owner's answer and the operator's dump
   (RK-24); the watch log's numbers on legacy load are its first input.
4. Release intake continues (`25` §8): each legacy release is still a queue row for the surfaces HOMI reads from
   legacy — the reference data, the listing methods, the landing files.

## Files

- `backend/app/Console/Commands/Launch/LaunchCheck.php`, `backend/tests/Feature/Launch/LaunchCheckTest.php`
- `docs/launch/{checklist.md,go-record.md,announcement.md,watch-log.md,rollback.md}`
- `docs/migration/wave-1/README.md` (statuses), `.ai/memory/{session-handoff,current-state}.md`, `HANDOFF.md`
  (shared files: by the usual small PR)

## Steps

1. Through the product owner, ask the operator for the announcement day and send the three drafts for approval and
   proofreading. This has the longest lead time.
2. `LaunchCheck` with one test per row of its table (each failing condition makes the command exit 1 and prints no
   secret).
3. Write `docs/launch/checklist.md`, `rollback.md` and an empty `watch-log.md`; review with the first developer —
   the switches are run by that track.
4. Deploy. Ask the production track for the five command outputs on staging; fix or route back every `FAIL`.
5. The same on production. Call one method of each row of the driver table and record `meta.source`.
6. Collect the evidence for every checklist line; open issues for the red ones in their packages.
7. Rehearse on staging: one `sources:set` for a named user and its reset; `delivery:pause on` and `off`;
   `llm:feature query-parsing off` and `on`. Record the times in `rollback.md`.
8. Go or no-go with the product owner; write `go-record.md`.
9. The operator posts the announcement; start the watch; write the log daily for 14 days.
10. The review after 14 days; close the wave (the four points above); run the `save-session` skill.

## Behaviour to reproduce

This package reproduces no legacy behaviour. It proves that the reproduction is complete, by the definition of
done of `25` §14:

| # | Item of `25` §14 | Proof |
| - | ---------------- | ----- |
| 1 | Every work package is done | the queue; each PR with its signed checklist |
| 2 | No method answers from a stub on production | `launch:check` rows 1 … 3; the driver table with observed `meta.source` |
| 3 | All 45 screens and all bot scenarios have a signed checklist | WP-33 and the packages of stage B; `docs/testing/bot-pass.md` of WP-58 |
| 4 | The Mini App works on iOS, Android, Desktop and Web, in cookie mode and header mode | the device pass of WP-33, repeated on production data after WP-48 |
| 5 | An instant card, a digest and a quiet-hours release were each observed on production | the checklist line of WP-57 with date and radar |
| 6 | The landing is live with the privacy page | WP-61; the page answers on `homi.uz` in three languages |
| 7 | The security checks pass; nothing sensitive in logs or analytics | `docs/security/checklist.md` and the scan results of WP-70 |
| 8 | Both CI gates are green on `main`; the audit describes the pinned legacy release | the CI runs; WP-02 and the release-intake rows |

## Tests

| # | Layer | Test | Cases |
| - | ----- | ---- | ----- |
| 1 | Feature (Pest) | `LaunchCheckTest` | all green → exit 0; a feature resolving to `stub` → row 1 fails; a stored rule naming `stub`; `allow_stub` true; an unbound driver; `radar.starter_enabled` false; the null sender bound; a non-empty interim list; a profile difference (fake Bot API); a stale heartbeat; a failed job; `delivery:pause` on; a `bot.devNNN` flag on is listed; no output line contains a configured secret value |
| 2 | On servers | the five commands of the field table | outputs attached to the checklist for staging and production |
| 3 | Rehearsal | the three switch drills on staging | each takes effect within a minute and is undone; `source_flag_changes` holds the rows |
| 4 | In Telegram | a last short pass on production after the go record: `/start`, a card, a radar saved, the Mini App opened from the bot, the landing button into the bot | screenshots in the go record |

## Acceptance checklist

- [ ] `php artisan launch:check` exits 0 on production; its output is attached.
- [ ] `sources:list` on production shows `legacy` for the eleven features, empty rules, and no `stub`; a call of
      each method of the driver table shows the expected `meta.source`.
- [ ] The "demo data" marker of the Mini App and the landing, and `bot.welcome.demo_notice`, are not shown anywhere
      on production.
- [ ] `config('bot.interim_commands')` is empty; every command of the menu answers with its real scenario.
- [ ] The production bot's profile is synced (`telegram:profile diff` exits 0) and the manual BotFather items are
      done: avatar, description picture, Main Mini App, privacy link, inline off, groups off.
- [ ] The welcome text was read on production in ru, uz and en; it names HOMI and nothing of the old product.
- [ ] All 45 screens and every bot scenario have a signed checklist; the links are in `docs/launch/checklist.md`.
- [ ] The Mini App was opened from the production bot on iOS, Android, Desktop and Web, in cookie mode and in
      header mode, on legacy data.
- [ ] An instant card, a digest and a quiet-hours release were each observed on production (date and radar).
- [ ] `https://homi.uz` is live in three languages with the privacy page; its buttons open the production bot.
- [ ] The checks of WP-70 pass: the security checklist, the leak scans on production logs, the alerts armed, the
      restore drill, the signed legal texts.
- [ ] `make ci-backend` and `make ci-frontend` are green on `main`; the audit documents describe the pinned legacy
      release and no release-intake row is older than a week.
- [ ] No `DEV` flag is on, or each one that is on has a named approval in the go record.
- [ ] The three switch drills were rehearsed on staging and their times are in `docs/launch/rollback.md`.
- [ ] The go record is written and signed by the product owner and both developers.
- [ ] The announcement was approved in three languages, proofread, and posted by the operator — or the go record
      says why it waits and who follows it up.
- [ ] The watch log has an entry for each of the 14 days and the closing review is written.
- [ ] The queue shows every package `DONE`; the session handoff and `HANDOFF.md` say that Wave 1 is finished and
      what starts Wave 2.

## Handoff

Empty — nobody has started this package.
