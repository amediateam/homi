# WP-45 — Radars: service, limits, relax, previews

| Field | Value |
| ----- | ----- |
| Stage | C |
| Status | REVIEW |
| Depends on | WP-42, WP-44 |
| Size | about 2 400 changed lines, L |
| Behaviour reference | WP-13 (the shapes — unchanged here); `25` §5 (radars); `08` §1.8 and the rows of API-018 … API-023; `02` BR-API-086; `03` §4 (BR-APP-012, BR-APP-041, BR-APP-042, BR-APP-044, BR-APP-047, BR-APP-048, BR-APP-063, BR-APP-073); `15` §3.1 rows 1–3, §3.4 rows 1, 2 and 6, §3.6 rows 2 and 3; `16` SEC-REQ-014, SEC-REQ-015, SEC-REQ-017; tasks `tasks/backend/KV-BE-100-radar-service-core.md`, `KV-BE-101-…`, `KV-BE-102-radar-starter-and-options.md`, `KV-BE-103-…`, `KV-BE-104-…`, `KV-BE-105-…`, `KV-BE-106-radar-hide-rules.md` (rules, limits, edge cases — not their routes, serializers or SQL predicates) |
| Needs from the production track | Approve two migrations on production (`radars`, `radar_hide_rules`, new and empty). Server env: leave `RADAR_MAX` blank (default 10); set `RADAR_REQUIRE_CHAT=false` and `RADAR_STARTER_ENABLED=false` now — both are switched to `true` when the bot's radar wizard package (WP-54) is deployed: it sends the starter list, and the bot's reachability tracking (WP-52) is live by then. `RADAR_CREATION_ENABLED` (key of WP-11) stays **unset** on staging and production: radars cannot be created or changed there until the bot's sending package sets it (WP-57, DEC-51) |

## Goal

Radars are HOMI's own saved searches. A user can list, create, replace, pause, resume, switch mode, relax and delete
them through the methods of WP-13, with the legacy rules: one limit, no twin radars, a "no chat" check before any
change, starter counts, relax options, hide rules and previews. Everything a later package needs to match and
deliver is stored and announced by events.

## Scope

In: the two tables and models; `RadarService` and its helpers; starter selection, relax options and previews on top
of `ListingSource`; hide rules; the "ask found" policy; controllers with real bodies; the policy and the IDOR rows.

Out: matching new listings, the delivered set, quiet hours, digests and the outbox (WP-46); sending anything to a
chat (WP-57); the bot's wizard and radar screens, which call the same service (WP-54, WP-55).

## Decisions that bind this package

- Radars are stored, matched and delivered by HOMI (DEC-43); nothing about a radar is sent to legacy.
- Radars cannot be created or changed until the bot can deliver them (DEC-51): the switch
  `config('radar.creation_enabled')` of WP-11 is off on staging and production until WP-57. This package is built
  and tested with the switch on, and it enforces the off state in the service, so no caller — API or bot — can
  write a radar around it.
- Create-or-reactivate is a server rule (`25` §5); the result says what happened in `kind` (WP-13).
- Behaviour changes stay off (DEC-36): radars keep `posted_days` as received (DEV-005), price bounds stay USD
  (DEV-006), hide rules stay per radar (DEV-034), unhide clears all rules of the radar at once (DEV-033).
- In Wave 1 listings come from the listing source, so starter lists, relax options and previews are computed through
  `ListingSource`, not through SQL over HOMI's tables (`25` §5, matching row).
- Load and care for the service key (RK-25): previews and options are cached per filter set and shared by users.

## Design

### Tables

`radars`: `id` (ULID, primary key), `user_id` (foreign key, cascade), `active` (boolean, default true), `mode`
(string 8, default `instant`), `filters` (`json`, the 25-key object), `filters_hash` (char 64), `city` (string 64),
`deal` (string 16), `entry` (string 16, nullable), `relax_code` (string 32, nullable), `hidden_count` (integer,
default 0), `paused_at` (`timestampTz`, nullable), timestamps. Unique (`user_id`, `filters_hash`); index (`active`,
`filters_hash`) for the matcher; index (`user_id`, `created_at`). A rent radar may carry `area_min` / `area_max`:
the area range is a filter of every deal (DEC-62). The canonical hash of step 3 below is computed as before, over
the 25 keys.

`radar_hide_rules`: `id`, `radar_id` (foreign ULID, cascade), `kind` (string 8: `channel`, `district`, `author`),
`target` (string 96: channel name, district code or author key), `created_at`. Unique (`radar_id`, `kind`, `target`).

Models `Radar` (casts `filters` to array, `mode` to `App\Enums\Radar\RadarMode`; the `saving` hook refuses a filters
array that does not have exactly the 25 keys) and `RadarHideRule`, both with factories. `User::radars()`.

### `RadarService` (`App\Services\Radar`)

```php
public function create(User $user, SearchFilters $filters, RadarCreateContext $context): RadarMutation;
public function update(User $user, Radar $radar, SearchFilters $filters, ?string $relaxed): RadarMutation;
public function setActive(User $user, Radar $radar, bool $active): RadarMutation;
public function setMode(User $user, Radar $radar, RadarMode $mode): Radar;
public function relax(User $user, Radar $radar, string $code): RadarMutation;
public function delete(User $user, Radar $radar): void;
```

`RadarCreateContext`: `entry` (`filters`, `empty`, `few`, `prompt`, `feed`, `return` — the last two from the radar
card in the feed and the return banner of legacy release `index-DY_DH7h-.js`, BR-API-086, BR-APP-073 — and for the
bot later `bot_wizard`, `bot_text`), `relaxed`, `locale`, `currency`. `RadarMutation`: the radar, `kind` (`created`,
`existing`, `reactivated`, `updated`, `resumed`, `paused`), the `Starter`, the options and the `relaxed` hints.

Every write follows this order:

0. **Switch.** While `config('radar.creation_enabled')` is false, `create`, `update`, `setActive`, `setMode` and
   `relax` throw `App\Exceptions\Radar\RadarsDisabled` (the exception of WP-13: `403 radars_disabled`) before
   anything else — no chat check, no lock, no source call. `delete` is never refused. On the API the middleware
   `EnsureRadarsEnabled` of WP-13 has already answered, also for `PATCH {"unhide": true}`; the check is repeated
   here because the bot calls the service directly (WP-54, WP-55).
1. **Chat.** `ChatReachability::canWrite($user)` — `users.bot_chat_state === 'active'`. When
   `config('radar.require_chat')` is true and the answer is no: `App\Exceptions\Radar\NoChat` (`409 no_chat`), before
   any lock or write. Checked for `create`, `update`, `setActive(true)` and `relax`; never for pause, mode, unhide or
   delete. The flag is false until the bot maintains the chat state (WP-52) and sends the starter list; it is
   switched on with the deploy of WP-54, as the field table says.
2. **Lock.** One lock per user for the transaction: `pg_advisory_xact_lock(hashtext('radar:' || user id))` on
   PostgreSQL, `Cache::lock("radar:{$user->id}", 5)->block(3)` elsewhere.
3. **Twin.** The canonical hash of the filters (WP-12: `posted_days`, key order and array order ignored) is looked up
   among the user's radars. `create`: an active twin → `existing`, nothing written; a paused twin → continue as a
   resume of that radar and keep the new `entry` and `relax_code` (`reactivated`). `update` and `relax`: the new hash
   equals another radar of the user → `RadarDuplicate` (`409 radar_duplicate`); equals its own → no write, `updated`
   with an empty starter. The unique key is the backstop: a concurrent insert that loses re-reads the winner.
4. **Limit.** `config('radar.max')` (`RADAR_MAX`, default 10 — the value `GET /reference` reports as
   `limits.radars`), counted on **active** radars. Creating or resuming beyond it → `RadarLimitReached`
   (`409 radar_limit`). Pause, mode and delete are never limited.
5. **Write**, then after commit dispatch `App\Events\Radar\RadarSaved` (radar id, user id, kind, starter numbers) or
   `RadarDeleted` (radar id, user id). WP-46 and the bot listen.

`update` replaces the filters and never changes `active`. `setActive(false)` sets `paused_at`. `delete` removes the
radar; its hide rules cascade.

### Starter (`StarterSelector`)

`forCreate`, `forUpdate`, `forRelax`, `forResume` return `Starter { count, numbers }`:

- Candidates: `ListingSource::feed()` with the radar's filters, `posted_days = 3` (the bot's "за последние 3 дня";
  the legacy window in the app is unknown, Q-API-033), `sort = new`, one page of 20.
- Removed: listings the user hid, listings of blocked authors and vote-marked listings (`ListingOverlay`), listings
  the radar's hide rules exclude (each one adds 1 to `hidden_count`), and listings already delivered to the user
  through the contract `App\Services\Delivery\Contracts\DeliveredSet::delivered(User, list<int>): list<int>`. This
  package binds a null implementation that returns nothing; WP-46 binds the ledger.
- `forResume` also removes listings in the user's view history — "which you have not seen" (API-021).
- While `config('radar.starter_enabled')` is false, the selector returns an empty starter without calling the
  source, so the API never claims that cards are "already in the chat" before the bot can send them.
- `existing`, `paused` and mode changes carry an empty starter.

### Relax options (`RadarRelaxOptions`)

Offered only when the starter is empty. In Wave 1 the options are the ones the listing source computes:
`ListingSource::flow($filters)->options`, at most 5, each `{code, label, rate, filters, count}`. A missing `count` is
filled with `ListingSource::count()` of the option's filters with `posted_days = 3`. An option whose filters equal
the radar's is dropped. The offered set is remembered for 15 minutes under `radar:<id>:options` (code → filters).

- `relax($code)`: the code must be in the remembered set, or in a freshly computed one when the cache expired;
  otherwise `422 validation_failed` (`errors.code`). The option's filters are normalised again (`forRadar`), then
  the rules of `update` apply; `relax_code` is stored; the answer carries the new starter.
- `relaxed` in the create and replace bodies is the code of a flow option the user picked in the filters sheet. It is
  stored as `relax_code` for statistics and never applied (fix of LB-API-035).
- `relaxed` in results: always an array. Empty when the starter is not empty or options exist; otherwise one hint
  `{"text": …}` from the radar's own flow, when `week > 0`: «≈N в день» when `week / days ≥ 1`, else «N за неделю»
  (the wording rule of BR-APP-044), from `backend/lang/{ru,uz,en}/radar.php`.

### Hide rules (`RadarHideRuleService`)

- `add(User, Radar, HideRuleKind, string $target)` — idempotent.
- `addFromListing(User, int $number, HideRuleKind, ?Radar $origin)` — the bot's «Скрыть похожие» (WP-53). The
  target comes from `listing_refs`: channel, district code or author key (`author` only when
  `config('radar.author_hide_rules')`, default false). With an origin radar the rule goes there; without one, to
  every active radar of the user (a specification choice, Q-BOT-028). An unknown channel or district adds nothing
  and returns `false`.
- `clearAll(Radar)` — `PATCH {"unhide": true}`: deletes the radar's rules and sets `hidden_count` to 0.
- `rulesFor(Radar): HideRuleSet` and `HideRuleSet::excludes(?string $channel, ?string $districtCode, ?string
  $authorKey): bool`, used by the starter selector, the previews and the matcher of WP-46.
- `hidden` in the radar object is `hidden_count`: the number of listings held back by this radar's rules since they
  were last cleared. The legacy definition is unknown (Q-API-032); this one needs no extra source call.

### Previews (`RadarPreviews`)

Only for `GET /radars?include=previews`. Per distinct `filters_hash` of the user's radars: the first legacy page by
`sort = new`, the count and the flow. The shared part is cached for `config('radar.preview_ttl')` (120 s) per hash,
locale and currency; per user the overlay and the radar's hide rules are applied and the first 5 items kept. A
failure, or exceeding the total budget of `config('radar.preview_budget_ms')` (4 000), yields `preview: null` for
the remaining radars; the list itself never fails because of previews.

### Ask about "found" (`FoundAskPolicy`)

`shouldAsk(User, 'pause'|'delete'): bool` — true when the user has no `found_answers` row in the last
`config('radar.found_cooldown_days')` (30) days and was not asked in the last 24 hours (cache key
`found:asked:<user id>`, set when the answer is true). The legacy rule is unknown (Q-API-030). The bot uses the same
policy, so the app and the bot never ask twice.

### Controllers and authorisation

`RadarController` and `RadarRelaxController` of WP-13 get real bodies and answer with `meta.source = native`; their
stub bodies move into `NativeStubs` (the rule of WP-40).
A radar is always loaded as `$request->user()->radars()->findOrFail($id)` — one query for own, foreign and unknown
ids — and then passed to `Gate::authorize` against `App\Policies\RadarPolicy` (`view`, `update`, `delete`).
`PATCH`: `active: true` → resume with `starter`; `active: false` → pause with `ask_found`; `mode` → `setMode`;
`unhide: true` → `clearAll`. `DELETE` answers `{"ask_found": …}`; a second call is `404`. The radar rows are added to
`IdorMatrixTest` (WP-44). While the switch of step 0 is off, `GET /radars` answers `[]` without a query and
without previews, even for a user who has radars — the state before the first switch-on, when nobody has one;
`DELETE` answers as usual; the four write routes keep the middleware of WP-13. The stub bodies that moved into
`NativeStubs` follow the same rule, so the end-to-end suite of stage B sees the same switched-off state.

Configuration `backend/config/radar.php` (the file exists since WP-11 with `max` and `creation_enabled`; the other
keys are added here): `max`, `creation_enabled`, `limit_scope` (`active`), `require_chat`, `starter_enabled`,
`starter_window_days` (3), `starter_max` (20), `options_max` (5), `preview_ttl`, `preview_budget_ms`,
`author_hide_rules`, `found_cooldown_days`.

Tables with a user link, for the erasure registry of WP-47: `radars` (rules cascade); cache keys `radar:<id>:options`
and `found:asked:<user id>`.

## Files

- Two migrations; `backend/app/Models/{Radar,RadarHideRule}.php` with factories; `backend/app/Models/User.php`
- `backend/app/Enums/Radar/{RadarMode,HideRuleKind,RadarMutationKind}.php`
- `backend/app/Services/Radar/{RadarService,RadarCreateContext,RadarMutation,ChatReachability,StarterSelector,Starter,RadarRelaxOptions,RadarHideRuleService,HideRuleSet,RadarPreviews,FoundAskPolicy}.php`
- `backend/app/Services/Delivery/Contracts/DeliveredSet.php`, `backend/app/Services/Delivery/NullDeliveredSet.php`
- `backend/app/Exceptions/Radar/{NoChat,RadarLimitReached,RadarDuplicate}.php` (`RadarsDisabled` exists since WP-13);
  `backend/app/Events/Radar/{RadarSaved,RadarDeleted}.php`
- `backend/app/Policies/RadarPolicy.php`; `backend/app/Http/Controllers/Api/V1/Radars/{RadarController,RadarRelaxController}.php`
- `backend/config/radar.php`; `backend/lang/{ru,uz,en}/radar.php`
- `backend/tests/Feature/Radar/{RadarServiceTest,StarterSelectorTest,RadarRelaxOptionsTest,RadarHideRuleServiceTest,RadarPreviewsTest,FoundAskPolicyTest}.php`,
  `backend/tests/Feature/Api/V1/Radars/{RadarListTest,RadarWriteTest,RadarPatchDeleteTest,RadarRelaxTest}.php`,
  `backend/tests/Pgsql/RadarConcurrencyTest.php`, `backend/tests/Feature/Api/V1/IdorMatrixTest.php`
- `backend/.env.example` (`RADAR_MAX`, `RADAR_REQUIRE_CHAT`, `RADAR_STARTER_ENABLED`; `RADAR_CREATION_ENABLED` is
  there since WP-11) — separate shared-file PR

## Steps

1. Read the seven task files for rules, edge cases and test names; skip their SQL predicates and legacy
   serializers. Tests first in every step.
2. Migrations, models, enums, relations (`php artisan make:model Radar --factory --migration --no-interaction`).
3. `ChatReachability`, the three exceptions, `RadarService::create` with the switch, lock, twin and limit; the
   events.
4. `update`, `setActive`, `setMode`, `delete`.
5. `DeliveredSet` with its null binding; `StarterSelector`.
6. `RadarRelaxOptions` and `RadarService::relax`; the hint texts in three locales.
7. `RadarHideRuleService` and `HideRuleSet`.
8. `RadarPreviews`; `FoundAskPolicy`.
9. Controllers, `RadarPolicy`, the IDOR rows; the `pgsql` concurrency cases.
10. Pint, PHPStan, `make ci-backend`; the env PR; deploy. On the servers creation, the chat check and the starter
    all stay off.

## Behaviour to reproduce

- Turning on a radar for a search that already has an active radar changes nothing and says so; a paused one comes
  back on (BR-APP-041). "The same search" ignores `posted_days` (BR-APP-012).
- The limit answer and the "no chat" answer are different codes, and neither leaves a half-made radar: the client's
  single repeat after the user grants write access creates exactly one (fix of LB-API-013 and LB-API-033).
- After a create or a replace the toast depends on `starter`, then on `options` (the first with `count ≥ 7`, else
  the last), then on `relaxed[0].text` (BR-APP-042); `relaxed` and `options` are always arrays (fix of LB-API-014).
- An edit sends only listings the user has not received; a resume only those not seen (API-020, API-021).
- «Скрыто: N» appears only when `hidden > 0`, and unhide brings it to 0 (BR-APP-047).
- Pause and delete may open the survey; resume goes through the chat check, pause does not (BR-APP-048).
- Each filters object returned has 25 keys and only type codes valid for its deal (fix of LB-API-005, LB-API-006).
- Different from legacy by decision (DEC-51): while radars are switched off nothing can be created, replaced,
  paused, resumed, relaxed or re-moded, and the list is empty; legacy has no such state.

Edge cases: lowering `RADAR_MAX` below a user's count keeps existing radars and refuses only new activations; a
`PUT` that changes nothing writes nothing; two quick relax requests relax twice (each from the then-current
filters); a daily-rent radar gets daily options because the source computes them from its filters.

## Tests

- Switch (`config(['radar.creation_enabled' => false])`; every other case runs with it on, as `phpunit.xml` sets
  it): `create`, `update`, `setActive(true)`, `setActive(false)`, `setMode` and `relax` throw `RadarsDisabled`
  with no query, no lock and no source call; `delete` removes the radar; `GET /radars` → `[]` for a user with two
  radars, with and without `include=previews`, and no source call; each write route → `403 radars_disabled`.
- Service (SQLite): `no_chat` before any write for chat states `never` and `blocked` when the flag is on, and not
  checked for pause, mode and delete; with the flag off nothing is refused; limit counts active radars only; the
  eleventh active radar and a resume at the limit are refused; active twin → `existing` without a write; paused twin
  → `reactivated` with the new `entry`; `entry` `feed` and `return` are stored as given; update into a twin → `radar_duplicate`; update keeps `active`; hash ignores
  `posted_days`; stored filters have 25 keys; events only after commit, none on rollback.
- Starter (fake `ListingSource`): window and sort passed to the source; hidden, blocked, vote-marked, hide-ruled and
  delivered listings removed; resume removes viewed ones; `count` equals the numbers returned; disabled switch →
  empty and no source call.
- Relax: options only with an empty starter; missing `count` filled; an option equal to the radar dropped; a code
  outside the offered set → `422`; after cache expiry the set is recomputed; relax into a twin → `409`; `relaxed`
  always an array; hint wording for `week = 0`, `week / days < 1` and `≥ 1` in three locales.
- Hide rules: add is idempotent; from a listing with and without an origin radar; author rules refused while the
  switch is off; `clearAll` zeroes the counter; `excludes` per kind.
- Previews: one source round per distinct hash for two radars with equal filters; cached for two minutes; overlay
  applied per user; a source failure → `preview: null` and a `200` list; without `include` no source call at all.
- Routes: every method of WP-13 with its statuses and codes; `PATCH` body rules; `DELETE` twice; `meta.source =
  native`; user B on A's radar id → the same `404` body and query count as an unknown id, and A's radar unchanged
  (`15` §3.1 rows 1–3).
- `pgsql` group: 10 identical concurrent creates → one radar, every answer names the same id; 20 concurrent creates
  at 9 active radars → exactly 10, the others get `radar_limit`; resume racing create at the limit → the limit holds.
- Limits: the 31st radar write in a minute → `429`.

## Acceptance checklist

- [ ] The six radar methods answer in the WP-13 shapes with `meta.source = native`.
- [ ] With `radar.creation_enabled` off no radar can be written through the API or the service, the list is empty
      and `DELETE` works.
- [ ] `no_chat`, `radar_limit` and `radar_duplicate` are raised in the specified order and leave no partial write.
- [ ] Twin handling returns `existing` or `reactivated`; the concurrency cases of the `pgsql` group pass.
- [ ] Starter, options and `relaxed` follow the rules above; with `RADAR_STARTER_ENABLED=false` the starter is 0.
- [ ] `GET /radars?include=previews` costs one source round per distinct filter set and never fails the list.
- [ ] Hide rules exist per radar, are cleared by `unhide`, and drive `hidden`.
- [ ] Radar rows are in the IDOR matrix; foreign equals unknown.
- [ ] The PR names the migrations, the three env keys, the two switches that WP-54 turns on, and that
      `RADAR_CREATION_ENABLED` stays unset on the servers until WP-57.
- [ ] `make ci-backend` and the `pgsql` group are green.
- [ ] Inside Telegram on staging, then production, where radars are still switched off: the «Радар» tab shows the
      "soon" state and no button offers a radar. The pass with radars on — create a radar from the filters, see it
      on the «Радар» tab with its preview, pause, resume, change mode, edit, delete; the limit toast at the
      eleventh radar — is run on the local stack now (`backend/.env.example` has the switch on) and inside Telegram
      on staging and production in WP-57, right after it switches radars on.

## As built

The package is built as designed, with these points decided in the code (rule 6). Each one corrects or completes the
design above; the AM row is in `docs/ai/reports/phase-3-notes.md` §AM. No developer decision was needed.

**Tables, models and configuration**

- Exactly two migrations, `2026_11_28_013015_create_radars_table` and `2026_11_28_013016_create_radar_hide_rules_table`,
  both additive and empty. Radar ids are upper-case ULIDs; `{id}` is upper-cased before the lookup.
- `config/radar.php` reads `RADAR_MAX`, `RADAR_CREATION_ENABLED`, `RADAR_REQUIRE_CHAT` and `RADAR_STARTER_ENABLED`
  with a blank value as the safe default: a blank `RADAR_MAX` is 10 (it read as 0), a blank, spaced or `no`
  `RADAR_CREATION_ENABLED` is off (it read as on).
- The two service namespaces stay apart: `App\Services\Radar` holds the service and its helpers, `App\Services\Radars`
  the WP-13 answer objects (`Radar`, `RadarMutation`, `RadarChange`, `RadarPreview`), which gain `fromModel()` and
  `fromService()`.

**`RadarService`**

- Order of every write but delete: `RadarsDisabled` (no query, no lock, no source call), then `NoChat` from the loaded
  user (create, update, switch on, relax; not pause, mode or delete), then the per-user lock —
  `pg_advisory_xact_lock(hashtext('radar:' || <user id>))` on PostgreSQL, `Cache::lock("radar:<user id>", 5)->block(3)`
  elsewhere — inside which the radar is read again through the user's radars and the twin and the active-radar limit are
  read; `createOrFirst` re-reads a concurrent insert that won the unique key.
- `RadarSaved` and `RadarDeleted` carry ids, kind and starter numbers, implement `ShouldDispatchAfterCommit`, and are
  not dispatched for a write that changed nothing or for a mode change.
- The starter and the relax options are read after the transaction. A source failure there keeps the write, with an
  empty starter or no options, and logs only the radar id and kind.

**Starter, options and hide rules**

- `StarterSelector` reads one page of 20 in a new context with the user (the write's locale and currency, else his
  settings) and runs HOMI's overlay on every driver; each listing a hide rule holds back adds 1 to `hidden_count`,
  counted after the overlay and the delivered set.
- `RadarRelaxOptions` remembers the offered set (code → filters, as arrays) under `radar:<id>:options`; a filters change
  or a delete forgets it, so two quick relaxes relax twice. A code whose filters the reference no longer accepts is
  `422` on `code` like an unknown one.
- A channel rule is stored without `@`, in lower case; `addFromListing()` takes the target `listing_refs` files for the
  listing's survivor.

**Previews (`RadarPreviews`)**

- The shared part is asked in a context without a user (`foreground`, since a person waits), so legacy's pager leaves
  out no caller's listings and no item carries a caller's flags; the caller's overlay and the radar's hide rules (all
  radars' rules in one query) run per user, then the first five are kept.
- The cache key is `radar:previews:v1:<feed>-<count>-<flow drivers>:<filters_hash>:<posted_days>:<locale>:<currency>`
  (and the stub scenario when set): `filters_hash` leaves `posted_days` out, but the feed, count and flow depend on it
  (AM-132). The entry holds arrays only through the new `ListingSummary::toArray()` (with `toArray()` on `PriceInfo`,
  `GeoPoint` and `SourceRef`), the exact inverse of `fromArray()`, checked over the whole stub catalogue; an entry of
  another shape is a miss, and a failure is never cached. There is no fill lock: the feed page costs what `GET
  /listings` costs on every visit, and the legacy count and flow are single-flight in the driver's own cache (WP-42).
- A read never moves `hidden_count`: only a starter counts what the rules hold back.
- The budget is measured on the application clock and checked before each source round; after a failure or once it is
  spent, every remaining radar that is not cached gets `preview: null`. Any error of a round is caught there (a
  `SourceUnavailable` silently, any other reported).

**Controllers and authorisation**

- A radar is read through `$request->user()->radars()->findOrFail()`, then checked with
  `Gate::inspect($ability, $radar)->authorize()`: `Gate::authorize()` would make the OpenAPI export document a `403`
  these routes never answer. `docs/api/openapi.json` is unchanged by the package.
- The six radar routes have real rows in `IdorMatrixTest`, and the matrix compares the `radars` table of the owner
  too (a blocked user stores no radar).
- The 31st radar write of a user in a minute is `429 rate_limited` on the radar routes themselves (`v1-radars`, shared
  with the settings writes).

## Handoff

In review. The development track needs nothing more for this package after the merge; WP-46 (matching and delivery
planning) is next in queue order.

**For the production track** (no nginx change, no `source.*` flag change):

1. **Approve the two migrations** `2026_11_28_013015` and `2026_11_28_013016`: the new tables `radars` and
   `radar_hide_rules`, additive and empty; they run with the deploy (`php artisan migrate --force`), before the code
   serves.
2. **Server env** (the separate env PR adds the keys to `backend/.env.example` and the environments page): leave
   `RADAR_MAX` blank (default 10); set `RADAR_REQUIRE_CHAT=false` and `RADAR_STARTER_ENABLED=false` now — both are
   switched to `true` with the bot's radar wizard (WP-54). `RADAR_CREATION_ENABLED` stays **unset** on staging and
   production until WP-57 (DEC-51): until then the list is `[]`, the four writes answer `403 radars_disabled`, and
   `DELETE` works.
3. **Cache keys** (Redis): `radar:<id>:options` (15 minutes), `radar:previews:v1:…` (`radar.preview_ttl`, 120 s),
   `found:asked:<user id>` (24 hours), and the lock `radar:<user id>` outside PostgreSQL.

**For the next packages:**
- **WP-46** implements `DeliveredSet` (bound to `NullDeliveredSet` now) and matches with `HideRuleSet::excludes()`;
  it listens to `RadarSaved` and `RadarDeleted`.
- **WP-47** registers for erasure `radars` (its rules cascade) and the cache keys `radar:<id>:options` and
  `found:asked:<user id>`.
- **WP-53 … WP-55** call the same `RadarService`, `RadarHideRuleService::addFromListing()` and `FoundAskPolicy`; the
  policy's abilities are `view`, `update` and `delete`.
