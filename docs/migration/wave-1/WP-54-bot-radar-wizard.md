# WP-54 — Radar wizard

| Field | Value |
| ----- | ----- |
| Stage | D |
| Status | TODO |
| Depends on | WP-53, WP-45 |
| Size | about 4 500 changed lines, L. Above the 3 000-line guide: two PRs. Part A = steps 1–9 (engine and wizard steps 1–8, reachable only in tests: `new` stays in the interim list). Part B = steps 10–16 (review, step edit, save, starter list, tip, `new` leaves the interim list). Production works after either part |
| Behaviour reference | `04` §2 (rows BOT-014, BOT-036 … BOT-053), §3.4 … §3.8, §4.1 (BTN-006 … BTN-033), §4.2, §4.3, §8 (BR-BOT-016 … BR-BOT-050, BR-BOT-104), §9 (LB-BOT-001, LB-BOT-002, LB-BOT-003, LB-BOT-005, LB-BOT-009, LB-BOT-015, LB-BOT-016, LB-BOT-018, LB-BOT-019, LB-BOT-030, LB-BOT-031); `09` §4.2 and §4.3; `11b` §2.3 rows 1 and 4; task files KV-TG-028 … KV-TG-037; rules of KV-BE-100, KV-BE-102, KV-BE-105 |
| Needs from the production track | (1) Approval of one migration: `users.first_radar_tip_sent_at` (nullable timestamp, additive). (2) After the deploy of part B, `php artisan telegram:assets:refresh` on staging and on production so the post-save sticker resolves for each bot (WP-51). (3) With the deploy of part B, in the server env of staging and production: `RADAR_STARTER_ENABLED=true` and `RADAR_REQUIRE_CHAT=true` (WP-45 left both `false` until this package, which sends the starter list and follows the reachability tracking of WP-52). `RADAR_CREATION_ENABLED` is **not** set here: radars stay switched off on the servers until WP-57 (DEC-51), so after this deploy `/new` answers the "soon" text there. No new queue or cron entry |

## Goal

`/new`, the welcome button and every «➕ Новый радар» button start the radar wizard of the legacy bot: eight steps at
most, a review with the weekly flow estimate and relax buttons, in-place edits, save, the starter list and the
first-radar tip. The wizard produces the same normalised filter object as the Mini App and saves through the radar
service of WP-45, so a radar made in the chat and a radar made in the app are the same thing.

## Scope

In:

- The wizard engine (frame, step graph, Back, Cancel, entry points, modes) and the steps deal, object, rooms, area,
  budget, typed amount, owner, tenant, pets.
- The review screen with the summary renderer, the flow estimate, the warnings and the relax buttons; the in-place
  step edit; saving a new radar; the post-save sticker.
- The starter list with its number grid and the first-radar tip with its two answers.
- The engine mode `edit-radar` (frame of TXT-BOT-011, return to an edit screen) as a hook; this package tests it with
  a fake entry.
- Removing `new` from `config('bot.interim_commands')` and taking over the callback action `nw`.

Out:

- Free text and voice into the review, `/subs`, the radar card, pause, mode, hidden rules, delete, the edit of an
  existing radar (its entry, its screen of TXT-BOT-033, its save) — WP-55.
- The listing card that a number button opens (`OpenListingByNumber`, `CardSender`) — WP-53.
- Radar storage, the limit, create-or-reactivate, starter selection — WP-45. The delivered set — WP-46.
- Instant pushes and digests of the saved radar — WP-57.
- The toast text «Сохранил ✅» (TXT-BOT-075) is owned by WP-56 and the alert of TXT-BOT-039 by WP-51; both are shown
  here.

## Decisions that bind this package

| # | Decision | Consequence here |
| - | -------- | ---------------- |
| 1 | DEC-43, `25` §6 — full parity of the bot | All 19 handlers, 28 buttons and 27 texts of the lists below are built; nothing is cut for size |
| 2 | DEC-36 and answer 5 of the developer («Все баги, кроме смены логики») | Defects of `09` §4.3 are fixed at once: LB-BOT-003, LB-BOT-005, LB-BOT-015, LB-BOT-016. A defect whose only fix is a `DEV` row of `09` §4.2 is built behind its flag, and the flag is off: LB-BOT-001, LB-BOT-002, LB-BOT-031 (DEV-026), LB-BOT-018 (DEV-029), LB-BOT-019 (DEV-006), LB-BOT-030 (DEV-017). The legacy behaviour is the default and is what the checklist tests |
| 10 | DEC-54 — the whole-city label | LB-BOT-009 is settled by decision: the label is `<Город> целиком`, built from the city's name in the reference data, on the area button and in the summary. No flag; callback data and stored filters are unchanged |
| 11 | DEC-51 — radars before delivery | The wizard is built and tested with `config('radar.creation_enabled')` on. Its registrations carry the `radar` mark of WP-51, so while the switch is off — on staging and production until WP-57 — every entry answers `bot.radar.soon` and creates nothing. `RadarService` of WP-45 refuses a write in that state as well |
| 3 | DEC-41, WP-12, WP-13 — one filter object | The draft is a `SearchFilters` value built only by `SearchFiltersNormaliser::normalise($raw, forRadar: true)`. The wizard stores no value the normaliser did not return |
| 4 | WP-13 — create-or-reactivate lives in the radar service | The bot shows the outcome the service reports (`created`, `existing`, `reactivated`). There is no `bot.dev009` flag: the contract already decided DEV-009 for every client of the service |
| 5 | `25` §4.3 … §4.5 — source drivers | Cities, districts, zones, presets and typical prices come from `ReferenceSource`; the flow estimate and the relax options from `ListingSource::flow`; starter rows from `ListingSource::previews`. On `stub` the wizard works on fixtures |
| 6 | `25` §4.1 — `source_unavailable` | A step that cannot load its data answers with `bot.common.source_unavailable` and keeps the state; the review renders without the flow line; save still works |
| 7 | `25` §5, Q-API-063 — listing references | Starter rows are recorded as delivered by number plus source channel and post, through WP-46 |
| 8 | DEC-45, `25` §11 | Every merge is on production. Part A must not expose a wizard without a review, hence the interim rule in "Size" |
| 9 | DEC-46, `25` §9 | The acceptance checklist below is run in ru, uz and en on staging and production |

## Design

### What comes from where

The specification of the named package is authoritative for names. If it differs, use its name and do not create a
second service.

| Need | Source | Call expected |
| ---- | ------ | ------------- |
| Cities with `has_metro`, `has_median`, districts, zones (localised names, codes) | `ReferenceSource` (WP-10, WP-11; legacy driver WP-41), cached ten minutes | `reference(SourceContext)` → `ReferenceData->cities` |
| Price presets and the typical price per city and deal | the same | `cities(SourceContext)` → `CityStats->price_presets[deal]`, `->typical_price[deal]` |
| Radar limit | HOMI's configuration, not the reference source (WP-11: `limits.*` of `GET /reference` come from `radar.max`) | `config('radar.max')` of WP-45 |
| Weekly flow and relax options of a draft | `ListingSource` (WP-10, WP-12; legacy driver WP-42), feature `source.listings.flow` | `flow(SearchFilters, SourceContext)` → `FlowEstimate` (`week`, `days`, `options[]` with `code`, `count`, `filters`) |
| Starter rows | `ListingSource`, feature `source.listings.card` | `previews(list<int>, SourceContext)` → `ListingSummary` per number |
| Create a radar | WP-45 | `RadarService::create(User, SearchFilters, RadarCreateContext)` with entry `bot_wizard` → `RadarMutation` (`radar`, `kind`, `Starter` with `count` and `numbers`); throws `RadarLimitReached` |
| Starter selection | WP-45 | the `Starter` of the mutation: at most one page of 20 numbers, newest first, last 3 days, not hidden, author not blocked, no hide rule, not delivered to this user. Empty while `config('radar.starter_enabled')` is false |
| Delivery mode | WP-45 | `RadarService::setMode(User, Radar, RadarMode)` |
| Radar key in callbacks | WP-45, WP-51 | the radar's ULID (26 characters; the codec of WP-51 allows it). The radar is always loaded through `$user->radars()`, so a foreign key is an unknown one |
| Record "delivered" | WP-46 | `DeliveryLedger::claim(User, ListingPointer, ?Radar, DeliveryOrigin::Starter)` per listed number before the send, `attachMessage()` after it, `release()` when the send failed |
| Open a card by number | WP-53 | `OpenListingByNumber`, data `k1:ln:<n>:s:<radar key>`, origin `Starter` |
| Stickers, replies, codec, conversation store | WP-51 | `StickerRegistry`, `Responder`, `CallbackCodec`, `ConversationStore` |
| Settings (digest hours, currency, locale) | WP-40 | `SettingsService::get(User)` |

`SourceContext` is built for the actor: `locale` from the bot locale, `currency` from the settings, `user` set. The
wizard reads the driver of each answer; nothing in this package depends on which driver answered.

One adapter keeps the steps free of source details: `App\Services\Telegram\WizardReference` with `cities()`,
`city(string $code)`, `districts(string $city)`, `zones(string $city)`, `presets(string $city, string $deal)`,
`typicalPrice(string $city, string $deal)`, `belowMedianAvailable(string $city, string $deal, array $types)`,
`radarLimit()`. It throws `SourceUnavailable` unchanged.

### Engine

`App\Telegram\Conversations\RadarWizard\`:

| Class | Role |
| ----- | ---- |
| `Wizard` | Starts a wizard, dispatches `k1:wz:<sid>:<op>[:<value>]`, renders the frame, applies a `Transition` |
| `WizardState` | Typed view of the conversation `data`: `filters` (the 25 keys), `mode`, `returnTo`, `snapshot`, `presets`, `relaxCodes`, `errorMessageId`, `seedRadarKey` |
| `Step` (interface) | `key()`, `isShown(WizardState)`, `render(WizardState): StepView`, `handle(string $op, ?string $value, WizardState): Transition` |
| `StepView` | question, hint lines, keyboard rows |
| `Transition` | `stay()`, `next()`, `to(string $step)`, `review()`, `newMessage()`, `stale()` |
| `StepGraph` | the ordered steps and their visibility; computes N and M |

- Conversation of WP-51: kind `WizardNew` (or `WizardEdit` when WP-55 seeds it), `step`, `message_id`, `awaiting`
  (`null` or `amount`), and `data` as above. `data` holds ids and enum values only (ENT-012).
- Modes: `create`, `edit_step` (one step opened from the review, `returnTo = review`), `edit_radar` (seeded by
  WP-55, `returnTo = edit_screen`). WP-55 registers the edit screen and the edit save; this package only calls
  `returnTo`.
- Start (`/new`, `k1:nw`): `ConversationStore::begin(WizardNew, …)` and a **new** message with step `deal`
  (BR-BOT-016). The message the button sat on is not edited. A newer start replaces the conversation, so buttons of
  the older message carry a `sid` that no longer matches and get the alert of TXT-BOT-039 with the keyboard removed
  (BOT-023, owned by WP-51).
- Every step press edits the wizard message and is answered silently (`04` §4.3). The one exception is the typed
  amount (`Transition::newMessage()`).
- An operation that is not valid for the current step, or a value outside the step's closed set, is `stale()`.
- Engine operations: `bk` (Back to the previous shown step, earlier choice ticked `✅`), `cx` (Cancel). Cancel in
  `edit_radar` mode is delegated to WP-55.

Step graph and numbering:

| Step key | Shown when | Operations |
| -------- | ---------- | ---------- |
| `deal` | always | `s1:<rl, rd or sl>` |
| `object` | always | `s2:<ap, ho, ah, rm, cm or ld>` |
| `rooms` | types are `apartment`, `house` or both (BR-BOT-022) | `s3:<1, 2, 3, 4p, 12, 23 or any>` |
| `area` | always | `ct:<city>`, `zn:<center, near_center or metro>`, `ds:<district>`, `wc`, `dn` |
| `budget` | always | `s5:<amount in base 36, or any>`, `bm`, `am` |
| `owner` | always | `s6:<any, na or ow>` |
| `tenant` | the normaliser of WP-12 allows `tenant` for the deal — today both rents, which is the legacy visibility (BR-BOT-037) | `s7:<fa, me, wo or any>` |
| `pets` | deal `rent_long` (BR-BOT-038) | `s8:<nf, al or any>` |
| `review` | after the last shown step | `ed:<step>`, `rx:<code>`, `sv` |

- Header (fix of LB-BOT-015 and LB-BOT-016): before a deal is chosen `📡 Новый радар · шаг 1` without a total;
  afterwards `📡 Новый радар · шаг N из M`, where M counts the shown steps of the branch and N the position among
  them. Examples: rent_long + apartment M = 8; rent_long + room M = 7; rent_daily + apartment M = 7; sale +
  apartment M = 6; sale + land M = 5. In `edit_radar` mode the header is `Изменение радара · шаг N из M`
  (TXT-BOT-011, scenario owned by WP-55).
- Context line (BR-BOT-018): `🏠 <Аренда|Посуточно|Покупка> · <объект или «любой объект»>[ · <комнаты>]`.
- City and district codes travel as the position of the item in the reference list of the rendered step, in base
  36, and the rendered list of codes is kept in `data`; a press is resolved against that list. This keeps every
  `callback_data` under 64 bytes whatever the code length (unit test over the longest keyboard, 22 districts).

### Draft and the filter object

| Wizard choice | Keys of `SearchFilters` (WP-12) |
| ------------- | -------------------------------- |
| Deal `🔑 Снять надолго` / `🌙 Снять посуточно` / `🏷 Купить` | `deal` = `rent_long` / `rent_daily` / `sale`. A change in `create` mode clears `types` and rooms |
| Object `Квартира` / `Дом` / `Квартира или дом` / `Комната / подселение` / `Помещение` / `Участок` | `types` = `[apartment]` / `[house]` / `[apartment, house]` / `[room]` / `[commercial]` / `[land]` |
| Rooms `1` / `2` / `3` / `4+` / `1–2` / `2–3` / `Не важно` | `rooms_min`, `rooms_max` = 1,1 / 2,2 / 3,3 / 4,none / 1,2 / 2,3 / none,none (the canonical form of "4 or more" is the normaliser's) |
| City | `city`; a change clears `districts`, `zones`, and `near_metro` when the city has no metro |
| Districts | `districts[]` (codes); exclusive with `zones` |
| `🏛 Центр`, `🏙 Ближе к центру` | `zones[]` = `center`, `near_center` |
| `🚇 Рядом с метро (до ~1 км)` | `near_metro` |
| `<Город> целиком` | `districts` and `zones` empty |
| Preset, typed amount, `Не важно` | `price_max` in whole USD, or empty |
| `📊 Не дороже рынка` | `below_median` |
| `Все объявления` / `Без риелторов` / `Только хозяева` | `owner` = `any` / `no_agents` / `owners` |
| `Семья` / `Парень / парни` / `Девушка / девушки` / `Не важно` | `tenant` = `family` / `men` / `women` / empty |
| `Не запрещены` / `Разрешены` / `Не важно` | `pets` = true / `pets_only` = true / both false |

All other keys keep their defaults. After every change the draft is normalised again; keys of a step that is no
longer shown are dropped by the normaliser, never kept silently.

### Review, flow and relax

- `App\Telegram\Rendering\RadarSummaryRenderer::rows(SearchFilters, BotLocale): list<string>` — the rows `🏠 📍 💰 👤
  👥` and the pets row. It is reused by the saved message here and by the radar card and the edit screen of WP-55.
  A line `bot.summary.extra_filters` is added when the filters hold keys the wizard cannot show (a radar made in the
  Mini App; Q-BOT-026).
- `App\Telegram\Rendering\FlowLine::for(int $week): string` — the three wordings of TXT-BOT-028: `week` = 0 → the
  "не было" line; 1 … 6 → `N объявления за неделю`; 7 and more → `≈round(week / 7) объявления в день`. Plural forms
  through `trans_choice`. DEV-021 (`bot.dev021`, off) would replace it by the shared flow formatter.
- The review asks `flow()` twice: for the draft, and for the base (deal, types and city only) to decide TXT-BOT-030.
  Both answers are cached 60 seconds by the canonical hash of the filters.
- Thresholds in `config/bot.php`: `review.too_broad_per_day` = 20 (TXT-BOT-029 when `week / 7` ≥ 20; BR-BOT-041,
  Q-BOT-039), `review.base_scarce_per_week` = 2 (TXT-BOT-030 when the base `week` ≤ 2).
- Relax: one button per `FlowEstimate->options[]` entry, at most three, label `✅ <bot.review.relax.<code>>`; a code
  without a catalogue key uses the option's own label. The codes offered are stored in `relaxCodes`. `rx:<code>`
  replaces the draft by the option's `filters` (normalised), recomputes and re-renders; the option is gone
  (BR-BOT-042). A code not in `relaxCodes` re-renders silently. Only the code `agents` («Вместе с риелторами») was
  observed (Q-BOT-039).

### Save, starter list, tip

- `RadarWizard\SaveRadar` handles `sv`. Lock `Cache::lock('bot:save:{sid}', 10)` (Redis on the servers, the
  `array` store in tests — no raw Redis command, CI has no Redis service); a second press while locked, or
  after the conversation is gone, is answered silently.
- Outcome of `RadarService::create`:

| Outcome | Bot answer |
| ------- | ---------- |
| `created` or `reactivated` | toast TXT-BOT-075; the review is edited into TXT-BOT-034 with `📡 Радар` (`k1:sb:0:ls`) · `➕ Новый радар` (`k1:nw`); the conversation is forgotten; the sticker `radar_saved` is sent; then the job `SendStarterList` is dispatched with the starter numbers of the mutation |
| `existing` (an active radar with the same filters) | toast `bot.radar.twin_exists`; the review is edited into the same text with the button `📡 Открыть радар` (`k1:sb:<radar key>:op`); no sticker, no list |
| `RadarLimitReached` | alert `bot.radar.limit_reached` with the limit; the review stays and can be saved after a radar is deleted (Q-BOT-007, closed by specification) |
| any other failure | toast `bot.common.error`; the review stays; nothing is written |

- Until WP-55 lands, the action `sb` has no handler. This package registers `sb` with `InterimHandler` (WP-52), as
  WP-52 did for `nw`; WP-55 replaces the registration.
- Job `App\Jobs\Telegram\SendStarterList` (queue `telegram`; user, radar, numbers, `withTip`): the starter list,
  then the tip, in that order, in one job, so they never interleave. After a save in the bot the handler dispatches
  it itself, after the sticker.
- For radars created, edited, switched on or relaxed through the API, the `starter` number of the v1 answer means
  "listings sent to the chat now" (WP-13, BR-API-079). `App\Listeners\Telegram\QueueStarterListOnRadarSaved`, a
  synchronous listener on `RadarSaved` of WP-45, dispatches the same job without the tip when the mutation carries
  starter numbers. Bot handlers call the radar service inside `App\Support\Telegram\BotRadarWrite::run()`, a
  scope guard the listener checks, so a save made in the bot is not listed twice.
- **Division with WP-46.** WP-46 does not plan or send starter listings: its outbox carries instant and digest
  items only. The legacy bot sends the starter as one list («Уже есть за последние 3 дня: N», BOT-052, BR-API-079),
  and that is the job above. Starter listings reach the delivered set through its ledger claims with origin
  `starter`, so the matcher never sends them again.
- `App\Telegram\Keyboards\NumberGridKeyboard::for(list<int> $numbers, string $origin, ?string $radarKey)` — five
  buttons per row, labels `1` … `N`, data `k1:ln:<n>:s:<radar key>`.
- The job claims each number in the ledger of WP-46 before the send and leaves out a number whose claim is refused;
  when the send fails for good it releases the claims, so nothing counts as delivered that never reached the chat.
- `App\Telegram\Handlers\FirstRadarTip` handles `k1:tp:<radar key>:<in or dg>`.

### Configuration

`backend/config/bot.php` (file of WP-51), added keys:

| Key | Default | Meaning |
| --- | ------- | ------- |
| `dev006` | `false` | budget in the user's currency |
| `dev017` | `false` | reserved: tenant and pets visibility follows the normaliser; the flag exists so the approval is one line |
| `dev021` | `false` | shared flow vocabulary |
| `dev026` | `false` | area step: zones and cities toggle in place |
| `dev029` | `false` | typed amount: more formats, one error message, commands leave the wait |
| `dev046` | `false` | new-build choice for sale |
| `dev052` | `false` | one availability rule for «Не дороже рынка» |
| `review.too_broad_per_day` | 20 | |
| `review.base_scarce_per_week` | 2 | |
| `amount.max_usd` | 10 000 000 | Q-BOT-024 |

New catalogue keys (ru, uz, en; legacy has no such texts): `wizard.frame.step_first`,
`wizard.area.zone_cleared_districts`, `wizard.object.new_builds`,
`summary.pets.not_forbidden`, `summary.pets.allowed`, `summary.extra_filters`, `review.relax.<code>`,
`radar.saved_none`, `radar.limit_reached`, `radar.twin_exists`, `radar.open`, `tip.digest_chosen`.

## Files

All paths under `backend/`.

- `app/Telegram/Conversations/RadarWizard/{Wizard,WizardState,Step,StepView,Transition,StepGraph}.php`
- `app/Telegram/Conversations/RadarWizard/{DealStep,ObjectStep,RoomsStep,AreaStep,BudgetStep,TypedAmountInput,AmountParser,OwnerStep,TenantStep,PetsStep,ReviewStep,SaveRadar}.php`
- `app/Telegram/Handlers/{NewRadarCommand,FirstRadarTip}.php`
- `app/Telegram/Keyboards/{AreaKeyboard,BudgetKeyboard,ReviewKeyboard,NumberGridKeyboard}.php`
- `app/Telegram/Rendering/{RadarSummaryRenderer,FlowLine,StarterListRenderer}.php`
- `app/Services/Telegram/WizardReference.php`
- `app/Jobs/Telegram/SendStarterList.php`, `app/Listeners/Telegram/QueueStarterListOnRadarSaved.php`,
  `app/Support/Telegram/BotRadarWrite.php`
- `app/Providers/TelegramServiceProvider.php` (registrations: command `new`, actions `nw`, `wz`, `tp`, interim `sb`,
  the awaited input `amount`; `new`, `nw`, `wz`, `tp` and `amount` with `radar: true`, the mark of WP-51)
- `config/bot.php` (keys above; `new` removed from `interim_commands`), `lang/{ru,uz,en}/bot.php` (new keys),
  `tests/Fixtures/Bot/txt-keys.json` (unchanged ids, new keys listed as "no legacy id")
- `database/migrations/<date>_add_first_radar_tip_sent_at_to_users_table.php` (neither WP-40 nor WP-45 has the
  column)
- `tests/Unit/Telegram/{StepGraphTest,AreaKeyboardTest,AmountParserTest,RadarSummaryRendererTest,FlowLineTest,NumberGridKeyboardTest}.php`
- `tests/Feature/Bot/Wizard/{WizardEngineTest,DealObjectRoomsTest,AreaStepTest,BudgetStepTest,TypedAmountTest,OwnerTenantPetsTest,ReviewTest,ReviewStepEditTest,RadarSaveTest,StarterListTest,RadarSwitchTest}.php`
- `tests/Fixtures/Bot/transcripts/{wizard-rent-long,wizard-rent-daily,wizard-sale,wizard-area,wizard-amount,wizard-review,wizard-save,starter-tip}.json`
- `docs/infrastructure/telegram-webhook.md` (registry rows of `nw`, `wz`, `tp`)

## Steps

Generators always with `--no-interaction`; tests are written first inside each step; `vendor/bin/pint --dirty
--format agent` after every PHP edit.

Part A (the wizard is not reachable by users: `new` stays in the interim list).

1. Read `.ai/agents/telegram-bot-engineer.md` rule 5, the specifications of WP-51 (codec, conversation store,
   replies), WP-12 (`SearchFilters`, the normaliser), WP-11 (reference data) and WP-45. Reconcile the names of the
   table "What comes from where"; write the differences into "Handoff".
2. `WizardReference` over the stub driver, with a test for each method and for `SourceUnavailable`.
3. Engine: `Wizard`, `WizardState`, `Step`, `StepView`, `Transition`, `StepGraph`; `StepGraphTest` (N and M of every
   branch) and `WizardEngineTest` with two fake steps (start, edit in place, Back, Cancel, stale `sid`, expiry).
4. `DealStep`, `ObjectStep`, `RoomsStep` and their catalogue keys; `DealObjectRoomsTest`.
5. `AreaStep` and `AreaKeyboard` in the legacy behaviour, then the `dev026` branch with its tests marked `todo`;
   the whole-city label `<Город> целиком` (DEC-54); `AreaStepTest`, `AreaKeyboardTest`, transcript
   `wizard-area.json`.
6. `BudgetStep` and `BudgetKeyboard`; `BudgetStepTest`.
7. `TypedAmountInput`, `AmountParser`, the awaited-input registration; `TypedAmountTest`, `AmountParserTest`.
8. `OwnerStep`, `TenantStep`, `PetsStep`; `OwnerTenantPetsTest`.
9. A test-only end step proves the three branches reach "after the last step". `make ci-backend`; PR A.

Part B.

10. `RadarSummaryRenderer`, `FlowLine` and their unit tests.
11. `ReviewStep`, `ReviewKeyboard`, relax; `ReviewTest`.
12. Step edit from the review (`ed`), snapshot and return rules, the deal-change rules; `ReviewStepEditTest`. The
    `edit_radar` mode is exercised with a fake return target.
13. `SaveRadar`, `BotRadarWrite`, the interim registration of `sb`; `RadarSaveTest` including the double press.
14. The migration, the job `SendStarterList`, `QueueStarterListOnRadarSaved`, `StarterListRenderer`, `NumberGridKeyboard`, `FirstRadarTip`; `StarterListTest`.
15. `NewRadarCommand` takes over `new` and `nw`; remove `new` from the interim list; update `InterimHandlerTest` of
    WP-52. The `radar` marks on the registrations; `RadarSwitchTest`. Transcripts of the three deal branches end to
    end.
16. Registry rows in `docs/infrastructure/telegram-webhook.md`; the uz and en keys added to the translation status
    file of WP-51; `make ci-backend`; PR B; deploy; the checklist inside Telegram on staging and production.

## Behaviour to reproduce

Owned: handlers BOT-014, BOT-036 … BOT-053; buttons BTN-006 … BTN-033; texts TXT-BOT-010, TXT-BOT-012 … TXT-BOT-032,
TXT-BOT-034 … TXT-BOT-038. Legacy texts are quoted from `04`; long texts are cited by their `tb` lines as `04` does
and are copied from there into the catalogue of WP-51.

### Start, frame, Back, Cancel

| # | Trigger | What the user sees | Notes |
| - | ------- | ------------------ | ----- |
| 1 | `/new` (BOT-014); `📡 Включить радар` of the welcome (BTN-002, owned by WP-52); `➕ Новый радар` (BTN-030) under the saved message, under `/subs` and under the not-understood reply | A new message: header, context line, question, keyboard of step 1 (BOT-036, TXT-BOT-010). The message that held the button is unchanged | Silent answer. A repeated start makes the older wizard message outdated |
| 2 | `◀️ Назад` (BTN-024), on every step except step 1 | The previous shown step, with the earlier choice ticked `✅` (BR-BOT-019) | Silent |
| 3 | `✖️ Отмена` (BTN-025) on any step, the amount prompt or the review (BOT-050) | The message becomes `Отменил. Новый радар — /new, список — /subs` (TXT-BOT-026), keyboard removed, nothing saved (BR-BOT-046) | Silent, no toast |
| 4 | Any button of an outdated wizard message | Alert `Форма устарела — начните заново: /new` (TXT-BOT-039), keyboard removed, no state change | Owned by WP-51 |

Every step except step 1 ends with the row `◀️ Назад` · `✖️ Отмена`; step 1 ends with `✖️ Отмена` alone.

While radars are switched off (DEC-51; staging and production until WP-57) none of the rows above runs: `/new`,
`📡 Включить радар`, `➕ Новый радар`, a button of a wizard message, a tip button and a typed amount each get the
message `bot.radar.soon` «Радар скоро заработает…» from the router of WP-51 — a callback also its silent answer —
and nothing is created or edited. Legacy has no such state. Everything below describes the bot with radars on.

### Steps 1–3 (BOT-037, BOT-038, BOT-039)

| Step | Text | Keyboard, as laid out | Default | Next |
| ---- | ---- | --------------------- | ------- | ---- |
| 1 deal | `Что ищете?` (TXT-BOT-012) | `🔑 Снять надолго` (BTN-006) / `🌙 Снять посуточно` (BTN-007) / `🏷 Купить` (BTN-008) / `✖️ Отмена`, one per row | none | 2 |
| 2 object, rent_long | `Какой объект?` (TXT-BOT-013), context `🏠 Аренда · любой объект` | `Квартира` · `Дом` / `Квартира или дом` · `Комната / подселение` / `Помещение` (BTN-009) | none ticked | 3 or 4 |
| 2 object, rent_daily | same, context `🏠 Посуточно · любой объект` | `Квартира` · `Дом` / `Комната / подселение` | none | 3 or 4 |
| 2 object, sale | same, context `🏠 Покупка · любой объект` | `Квартира` · `Дом` / `Квартира или дом` · `Участок` / `Помещение` | none | 3 or 4 |
| 3 rooms | `Сколько комнат?` (TXT-BOT-014) | `1` · `2` · `3` · `4+` / `1–2` · `2–3` · `✅ Не важно` (BTN-010) | `Не важно` (BR-BOT-023) | 4 |

- Single-choice buttons advance at once (BR-BOT-020). After step 3 the context reads for example
  `🏠 Аренда · квартира · 2 комн.` or `· 2–3 комн.`.
- `Дом` alone keeps the rooms step. Going back to step 1 and choosing another deal clears object and rooms.
- An object not allowed for the deal (a forged press) is outdated-button behaviour.
- DEV-046, flag `bot.dev046` off: for sale + apartment an extra row `🏗 Только новостройки` that sets
  `market = new`. Tests `todo`.

### Step 4 — area (BOT-040)

Text: `Какие районы? Отметьте один или несколько и нажмите «Готово».` (TXT-BOT-015) plus the hint of the city:
TXT-BOT-016 for Tashkent (`tb:338`: zones, the distance rule, listings without a place) or TXT-BOT-017 (`tb:345–347`:
variant a for the region, b for Andijan, Namangan and Fergana with the city name, c for Kokand).

Keyboard:

1. Cities, three per row, the current one `✅` (BTN-011): Ташкент, Ташкентская область, Андижан, Наманган, Коканд,
   Фергана (BR-BOT-024) — from the reference list, in the user's language; English names are the English exonyms of
   the reference data (LB-BOT-013, fixed in WP-51 and WP-52).
2. Tashkent only (BR-BOT-025): `🏛 Центр` (BTN-012), `🏙 Ближе к центру` (BTN-013), `🚇 Рядом с метро (до ~1 км)`
   (BTN-014). Shown when the city has zones, respectively `has_metro`.
3. Districts of the city, two per row, alphabetical in the user's language, ticked ones `✅` (BTN-015). Counts in
   legacy: Tashkent 12, region 22, Andijan 15, Namangan 13, Fergana 17, Kokand none (BR-BOT-026). The list comes from
   the reference data; a fixture test compares the stub fixture with these counts.
4. `✅ <Город> целиком` (BTN-016; for example `✅ Ташкент целиком`) · `Готово (N)` (BTN-017).
5. `◀️ Назад` · `✖️ Отмена`.

Legacy behaviour (default, `bot.dev026` off):

| Press | Effect |
| ----- | ------ |
| A district | Toggles in place. The first tick removes `✅` from `<Город> целиком`; unticking the last restores it; `Готово (N)` counts the ticks (BR-BOT-029) |
| `<Город> целиком` | Clears districts and zones, stays on the step |
| `Готово (N)` | Step 5. `N = 0` means the whole city (BR-BOT-028) |
| Another city | Selects it with the whole city and **jumps to step 5** (LB-BOT-002) |
| `🏛 Центр`, `🏙 Ближе к центру` | Toggles the zone, clears ticked districts without a notice (BR-BOT-030, LB-BOT-031) and **jumps to step 5** (LB-BOT-001) |
| `🚇 Рядом с метро` | Toggles `near_metro`, keeps districts, **jumps to step 5** (LB-BOT-001) |

With `bot.dev026` on (tests `todo` until DEV-026 is approved): city, zone and metro buttons re-render step 4 and only
`Готово (N)` advances; when a zone clears districts the text gains the line `wizard.area.zone_cleared_districts`; a
district ticked while a zone is on clears the zone.

Whole-city label (DEC-54): `<Город> целиком` — `wizard.area.whole_city` of WP-51 with `:city` = the city's name
from the reference data, for example «Ташкент целиком», «Фергана целиком»; `uz` `Butun :city` and `en`
`All of :city` are drafts for the proofreader (Q-BOT-014). Legacy says `Весь <город>` for every city, hence «Весь
Фергана» (LB-BOT-009); HOMI uses the decided wording, which needs no gender form. The operation `wc` and the
stored filters are the same as before.

Edge cases: Kokand has only the whole-city button and `Готово (0)`. Back from step 5 shows the city chosen last. A
district that left the reference list while the wizard was open is outdated-button behaviour. In `edit_step` and
`edit_radar` mode every press that would go to step 5 returns to `returnTo` instead.

### Step 5 — budget (BOT-041) and the typed amount (BOT-042, BOT-043)

| Deal | Question (TXT-BOT-018) | Median line (TXT-BOT-019) | Legacy presets seen, USD |
| ---- | ---------------------- | ------------------------- | ------------------------ |
| rent_long | `Бюджет в месяц — до скольки?` | `<Город>: половина квартир — до $<N> в месяц` | Tashkent 300, 400, 500, 600, 800, 1 000, 1 500; region 200, 250, 300, 450; Andijan 200, 300, 350, 500 |
| rent_daily | `Бюджет за сутки — до скольки?` | none | 30, 50, 80, 120 |
| sale | `Бюджет на покупку — до скольки?` | `<Город>: половина квартир — до $<N>` | Tashkent 40 000 … 200 000 (six values) |

- Keyboard: presets `до $<amount>` three per row and `✅ Не важно` (BTN-018); `✍️ Своя сумма` (BTN-019) · `✅ Не
  важно`; `📊 Не дороже рынка` (BTN-020); Back · Cancel. Default `Не важно`. Numbers are formatted for the locale
  (`$1 000` in ru, `$1,000` in en).
- The median line is shown when the source has a typical price for the city and deal, never for rent_daily. The
  toggle `📊 Не дороже рынка` and the paragraph of TXT-BOT-020 (`tb:382`) appear together, only for a city with
  `has_median` and the deals rent_long and sale (in legacy: Tashkent and the region; BR-BOT-032). The rule note of
  BR-BOT-032 and the table of `04` §3.6 disagree about the median line outside Tashkent; the table and the tests of
  KV-TG-031 are followed.
- A preset or `Не важно` sets or clears `price_max` and goes to step 6. The toggle stays on the step, shows `✅`, and
  survives a later preset (BR-BOT-034). A pressed amount must be one of the presets stored with the rendered step.
- The v1 reference data has presets per city and deal, not per number of rooms (BR-BOT-031 names rooms as well).
  The step uses what the contract gives; if WP-11 gains a rooms bucket, `WizardReference::presets` takes a third
  argument (Q-BOT-044).
- No presets for the city: only `✍️ Своя сумма` and `✅ Не важно`.
- `✍️ Своя сумма`: the message becomes `Напишите сумму в долларах одним числом, например 650 или 85000.`
  (TXT-BOT-021) with Back · Cancel, and `awaiting = amount`. While it is set, every text of the user goes to
  `TypedAmountInput`, not to free-text parsing (BR-BOT-051).
- A number (`650`): the prompt loses its keyboard; `price_max` is set; step 6 arrives as a **new** message, which is
  edited from then on (BR-BOT-035). Bounds: an integer greater than 0 and at most `amount.max_usd`; one number per
  message (Q-BOT-024, closed by specification).
- Anything else (`примерно шестьсот`, `0`, `-5`, two numbers): a **new** message `Не понял сумму. Напишите число в
  долларах, например 650.` (TXT-BOT-022) each time, and the wait continues (legacy; LB-BOT-018).
- Back on the prompt returns to the budget step. A voice or other non-text message while waiting gets TXT-BOT-022.
- A number typed when nothing is awaited is not handled here (WP-52 until WP-55, then free text).
- With `bot.dev029` on (tests `todo`): `650$`, `$650`, `85 000`, `85k`, `1,2 млн`, `1.2m` are accepted; one error
  message is edited in place; a command ends the wait and runs; a clear search phrase closes the wizard and goes to
  free text. With `bot.dev006` on and the user's currency UZS, presets and the typed amount are in soʻm and the
  draft keeps the currency (needs the filter contract to carry it).

### Steps 6–8 (BOT-044, BOT-045, BOT-046)

| Step | Text | Keyboard, one per row | Default | Next |
| ---- | ---- | --------------------- | ------- | ---- |
| 6 owner | `От кого объявления?` + the hint of `tb:429` (TXT-BOT-023) | `✅ Все объявления` / `Без риелторов` / `Только хозяева` (BTN-021) | `Все объявления` | 7 for rent, review for sale |
| 7 tenant | `Кто будет жить?` + `Скрою объявления «только девушкам / парням / семье», которые вам не подходят.` (TXT-BOT-024) | `👨‍👩‍👧 Семья` / `👨 Парень / парни` / `👩 Девушка / девушки` / `✅ Не важно` (BTN-022) | `Не важно` | 8 for rent_long, review for rent_daily |
| 8 pets | `🆕 Можно ли с животными?` + the hint of `tb:449` (TXT-BOT-025; the `🆕` is legacy text) | `🐾 Не запрещены` / `🐾 Разрешены` / `✅ Не важно` (BTN-023) | `Не важно` | review |

The tenant step on rent_daily is legacy behaviour and equals the normaliser rule of WP-12; LB-BOT-030 and DEV-017
change nothing in the bot unless that rule changes.

### Review (BOT-047), relax (BOT-049), step edit (BOT-048)

Text, in this order (TXT-BOT-027, layout `tb:458–470`):

1. Title `📡 Новый радар — проверьте`.
2. Summary rows: `🏠 Аренда · квартира · 2 комн.` (also `Посуточно · комната`, `Покупка · участок`); `📍 Ташкент ·
   Юнусабад, Чиланзар` or `Ташкент целиком` — the whole-city wording of DEC-54, where legacy wrote `весь Ташкент`
   (zones and metro named the same way); `💰 до $650/мес`, `до $100 000, не дороже рынка`, `любой бюджет`;
   `👤 все объявления` / `без риелторов` / `только хозяева`; `👥 для семьи` (absent
   for `Не важно`); the pets row absent for `Не важно`, otherwise `summary.pets.not_forbidden` or
   `summary.pets.allowed` (Q-BOT-010, closed by specification). BR-BOT-039.
3. Flow line (TXT-BOT-028), one of: `📡 По последней неделе — ≈3 объявления в день (дубли из разных каналов — одной
   карточкой).` / `📡 По последней неделе — 2 объявления за неделю: радар будет срабатывать нечасто.` / `📡 За
   последнюю неделю таких объявлений не было — радар будет срабатывать редко.` (BR-BOT-040).
4. When too broad: `Это много: сузьте условия или после сохранения включите «📬 Присылать подборкой» в /subs.`
   (TXT-BOT-029).
5. When the base is scarce: the text of `tb:494` (TXT-BOT-030).
6. When relax options exist: `Чтобы приходило больше:` and one line per option, `• вместе с риелторами — 2 за
   неделю` (TXT-BOT-031).
7. Closing `Радар будет проверять каналы и присылать новые объявления по этим условиям сразу, как они появляются.`
   (TXT-BOT-032).

Keyboard: relax buttons (BTN-027, for example `✅ Вместе с риелторами`); then the `✏️` buttons of the branch, two
per row (BTN-026); `✅ Сохранить` (BTN-028, style `primary`); `✖️ Отмена`.

| Branch | `✏️` buttons |
| ------ | ------------ |
| rent_long, apartment or house | Сделка, Объект / Комнаты, Районы / Бюджет, Риелторы / Кто живёт, Животные |
| rent_long, room or commercial | Сделка, Объект / Районы, Бюджет / Риелторы, Кто живёт / Животные |
| rent_daily, apartment or house | Сделка, Объект / Комнаты, Районы / Бюджет, Риелторы / Кто живёт |
| rent_daily, room | Сделка, Объект / Районы, Бюджет / Риелторы, Кто живёт |
| sale, apartment or house | Сделка, Объект / Комнаты, Районы / Бюджет, Риелторы |
| sale, land or commercial | Сделка, Объект / Районы, Бюджет / Риелторы |

Rules:

- The flow line is recomputed on every render (fix of LB-BOT-005).
- A relax button applies its weakening (`👤 без риелторов` → `👤 все объявления`), recomputes, and disappears.
- `✏️ <шаг>` opens that step in the same message with the normal header and the current choice ticked. A choice
  returns to the review; `◀️ Назад` returns to an identical review (BR-BOT-044). In the area step only `Готово (N)`
  returns (plus the legacy jumps, which return instead of going to step 5); in the budget step a preset or `Не
  важно` returns and the toggle stays; a typed amount returns with the review as a new message.
- A deal change resets the budget to `💰 любой бюджет` and drops tenant, pets and rooms where the new branch has no
  such step. If the object is not allowed for the new deal, the object step opens next; after the object is chosen
  the wizard returns to the review with rooms `Не важно` (BR-BOT-045; Q-BOT-041, closed by specification).
- An `ed:<step>` for a step the branch no longer has re-renders the review silently.
- The flow source is down: the review is shown without lines 3 … 6 and can be saved.

### Save (BOT-051)

1. `✅ Сохранить` → toast `Сохранил ✅` (TXT-BOT-075).
2. The message becomes `✅ Радар включён` + the summary rows + `Подходит уже сейчас: N — список ниже. Дальше радар
   будет присылать новые карточками, как только появятся.` (TXT-BOT-034) with `📡 Радар` (BTN-029) · `➕ Новый радар`
   (BTN-030). With `N = 0` the last paragraph is `radar.saved_none` (legacy unobserved; closed by specification).
3. A new message: the sticker (BOT-010, registry of WP-51). A failed sticker is logged and changes nothing.
4. The starter list, when `N > 0`.
5. The tip, after the user's first radar only (BR-BOT-047).

The radar is created with mode `instant`, active, entry `bot_wizard` (WP-45). Two presses create one radar. The 11th radar gets the
alert (BR-BOT-064; the limit is `config('radar.max')`, the value `GET /reference` reports as `limits.radars`).
`📡 Радар` turns the same message into the radar list (WP-55); `➕ Новый радар` starts a new wizard message.

### Starter list (BOT-052) and tip (BOT-053)

- Text (TXT-BOT-035): `🗂 Уже есть за последние 3 дня: N — свежие сверху`, rows `<n>. 2-комн. квартира · Юнусабад ·
  $700 · @<канал> · 30.10 17:00`, then `Нажмите номер, чтобы открыть карточку.` Row parts come from
  `ListingSummary`; the date is the listing's publication time in Asia/Tashkent as `dd.mm HH:MM`.
- Fix of LB-BOT-003: the 72-hour window and the label use the same time (the publication time the source gives), so
  a re-post of an old listing is not "new".
- Number buttons `1` … `N`, five per row (BTN-031). A number sends the card as a new message through WP-53; the list
  is not edited; the buttons work after the radar is deleted (BR-BOT-048).
- The list holds what the `Starter` of WP-45 holds: at most one page of 20 listings, and N is its count (Q-BOT-038,
  closed by the choice of WP-45).
- Every listed listing is recorded as delivered for the user, so no radar pushes it later (BR-BOT-049, BR-API-079).
- A row whose listing was withdrawn meanwhile opens the withdrawn variant of the card (WP-53, WP-57). Rows built
  from stub data carry no marker of their own; the card they open does (WP-53).
- Tip (TXT-BOT-036, `tb:554–562`, with the user's digest times): buttons `⚡ Сразу` (BTN-032) · `📬 Подборкой`
  (BTN-033). `⚡ Сразу`: keyboard removed, last paragraph replaced by `⚡ Хорошо — новые объявления буду присылать
  сразу, по одной. Поменять: /subs.` (TXT-BOT-037). `📬 Подборкой`: mode `digest`, keyboard removed, last paragraph
  `tip.digest_chosen` — `📬 Хорошо — пришлю подборкой в 09:00, 19:00. Поменять: /subs.` (TXT-BOT-038 was never
  observed; Q-BOT-010, closed by specification). Both answers are silent.
- The tip is sent once per user: `users.first_radar_tip_sent_at` is set when it is sent, and a user who deleted
  every radar does not get it again (BR-BOT-050).

### Defects and behaviour changes

| # | Item | What is done |
| - | ---- | ------------ |
| 1 | Wrong total on step 1; numbering when rooms are skipped | Fixed: LB-BOT-015, LB-BOT-016 (header rules above) |
| 2 | Starter list showed an old post first | Fixed: LB-BOT-003 |
| 3 | Estimate not recomputed after an object change | Fixed: LB-BOT-005 |
| 4 | «Весь Фергана» | Fixed by decision (DEC-54): `<Город> целиком` on the button and in the summary; LB-BOT-009 needs no flag |
| 5 | City, zone and metro buttons jump to step 5; «Центр» unticks districts silently | Legacy kept; LB-BOT-001, LB-BOT-002, LB-BOT-031 behind DEV-026, `bot.dev026` off |
| 6 | Typed amount accepts bare numbers only, errors stack | Legacy kept; LB-BOT-018 behind DEV-029, `bot.dev029` off |
| 7 | Budget always in dollars | Legacy kept; LB-BOT-019 behind DEV-006, `bot.dev006` off |
| 8 | Tenant asked on daily rent | Legacy kept and equal to the shared rule; LB-BOT-030, DEV-017 |
| 9 | Other flags | DEV-046 (`bot.dev046`), DEV-052 (`bot.dev052`), DEV-021 (`bot.dev021`): built, off, tests `todo` |

## Tests

Conversation tests use the runner of WP-51: a fake update goes in through the webhook, the Bot API calls that come
out are compared with the transcript. Sources run on the stub driver; `ListingSource::flow` and the services of
WP-45 and WP-46 are faked where a case needs a number. Every case runs with `radar.creation_enabled` on — the
value `phpunit.xml` has since WP-11; `RadarSwitchTest` alone sets it off through `config()`.

Unit (Pest):

| # | Test | Cases |
| - | ---- | ----- |
| 1 | `StepGraphTest` | N and M for the six branches; `tenant` and `pets` visibility; Back targets when rooms are skipped |
| 2 | `AreaKeyboardTest` | three cities per row; two districts per row; alphabetical per locale; every `callback_data` at most 64 bytes for the largest city; the label `<Город> целиком` for every city of the fixture in `ru`, `Butun <city>` in `uz`, `All of <city>` in `en`; the data of the button is the same `wc` operation |
| 3 | `AmountParserTest` | `650`, `85000` valid; `0`, `-5`, `99999999999`, `600 700`, `примерно шестьсот`, `1 000,5` invalid in legacy mode; the `dev029` dataset in ru, uz, en (`85k`, `85к`, `1,2 млн`) as `todo` |
| 4 | `RadarSummaryRendererTest` | every row variant of `04` §3.7; no `👥` and no pets row for "any"; `summary.extra_filters`; HTML escaping of names |
| 5 | `FlowLineTest` | 0, 1, 2, 6, 7, 21, 140 per week; plural forms in ru, uz, en |
| 6 | `NumberGridKeyboardTest` | 1, 5, 6, 11, 30 numbers; data shape |

Feature and conversation (Pest):

| # | Test | Cases |
| - | ---- | ----- |
| 1 | `WizardEngineTest` | `/new` → new message `📡 Новый радар · шаг 1`, three deal buttons and `✖️ Отмена`, no Back; a deal → same message edited, `шаг 2 из 8`; room → `шаг 3 из 7` (area); Back → object step with `✅`; Cancel → TXT-BOT-026, no keyboard, conversation gone; wizard A, then `/new`, press on A → alert, A loses its keyboard, B intact; idle past the TTL → alert; welcome button → new message, welcome not edited; a forged `sid` of another user → alert, no change |
| 2 | `DealObjectRoomsTest` | object options per deal; rooms step with `✅ Не важно`; `2–3` → context `· 2–3 комн.`; sale → `Участок` → area directly; forged `s2:ld` under rent_long → alert; `dev046` row (`todo`) |
| 3 | `AreaStepTest` | Tashkent: `✅ Ташкент`, three zone buttons, districts, `✅ Ташкент целиком`, `Готово (0)`; two districts → both ticked, whole city unticked, `Готово (2)`; `Готово` → step 5 with the districts; another city → step 5 with that city (legacy); `Центр` → step 5, districts cleared; metro → step 5, districts kept; Kokand; Fergana label `Фергана целиком`; Back → rooms with the tick, or object when rooms are skipped; `en` labels; the `dev026` cases (`todo`); reference source down → `bot.common.source_unavailable`, state kept |
| 4 | `BudgetStepTest` | question per deal; median line and toggle per fixture city; rent_daily without both; toggle stays and shows `✅`; preset → step 6 with `price_max` and `below_median`; `Не важно`; forged amount → alert; no presets → two buttons; `dev006` (`todo`) |
| 5 | `TypedAmountTest` | prompt replaces the step; `650` → keyboard removed, step 6 as a new message, later presses edit the new message; bad text → new error message, still waiting; bounds; Back; expiry while waiting → the text is not consumed; edit mode → review as a new message; `dev029` cases (`todo`) |
| 6 | `OwnerTenantPetsTest` | labels and defaults; rent_long shows all three; rent_daily ends after tenant; sale ends after owner; `Разрешены` sets `pets_only` only; forged `s8:al` under sale → alert |
| 7 | `ReviewTest` | the fixture review equals the sample; the three flow wordings; TXT-BOT-029 at 140 per week and not at 133; TXT-BOT-030; relax block and button; relax applied → `👤 все объявления`, recomputed, button gone; `✏️` sets of the six branches; flow source down → no flow lines, save works |
| 8 | `ReviewStepEditTest` | `✏️ Комнаты` → `3` → review; `✏️ Бюджет` → Back → byte-equal review; rent_long room → `✏️ Сделка` → `🏷 Купить` → object step → `Квартира` → review `Покупка · квартира`, `любой бюджет`, no `👥`; rent_long → `🌙 Снять посуточно` keeps the object and drops pets; `✏️ Районы` → tick → `Готово (2)`; stale `ed:pets` after a deal change |
| 9 | `RadarSaveTest` | one press → toast, edit to TXT-BOT-034 with `N`, two buttons, `sendSticker`, the starter job dispatched after the sticker; two callback ids within 50 ms → one radar, one edit; limit → alert, review intact; `N = 0` paragraph; `existing` → toast and `📡 Открыть радар`; `reactivated` → as created; service throws → `bot.common.error`; save on an outdated review → alert; `📡 Радар` before WP-55 → interim reply |
| 10 | `StarterListTest` | 11 matches → list with a 5/5/1 grid, then the tip (first radar); a number → card as a new message with origin `Starter`, list unchanged; radar deleted, number still opens; `⚡ Сразу`; `📬 Подборкой` → mode `digest` and the text with the user's hours; second radar → no tip; 20 matches → a 5/5/5/5 grid; a number whose ledger claim is refused is left out and N follows; listed listings are in the delivered set; a `403` on the list → claims released; a radar created through the API → the list only, once; a save in the bot → one list, not two; no row of kind `starter` appears in the outbox of WP-46 |
| 11 | `RadarSwitchTest` | with `radar.creation_enabled` off: `/new`, `k1:nw` (the welcome button and `➕ Новый радар`), a `wz` press of an older wizard message, a `tp` press and a number typed while an amount is awaited → `bot.radar.soon` in `ru`, `uz`, `en`, the pressed message unchanged, no conversation opened, no radar row, `RadarService::create` never called; a direct `RadarService::create` in that state throws `RadarsDisabled`; with the switch on `/new` opens step 1 |

Transcripts: the three deal branches from `/new` to the tip, in ru, with uz and en variants of the first and last
message. Security cases: every option value is from a closed set; the `sid` binds a press to the actor's own
conversation (SEC-REQ-011); filters reach the service only through the normaliser (SEC-REQ-017); names are escaped
(SEC-REQ-020); the radar belongs to the actor (SEC-REQ-014); the create is idempotent (SEC-REQ-015); the typed text
is not stored (BR-BOT-055).

## Acceptance checklist

Run in ru, uz and en on the staging bot and on the production bot; attach screenshots to the PR.

Radars are switched off on both bots until WP-57 (DEC-51). With this package's deploy only the first line can be
seen there; it is ticked then. The other lines are proven by the conversation tests when the PR is merged and are
run inside Telegram on the staging bot and on the production bot in WP-57, right after it switches radars on; the
screenshots go into that PR and are linked from this one.

- [ ] Radars switched off: `/new`, `📡 Включить радар` of the welcome and `➕ Новый радар` each answer «Радар скоро
      заработает…» in the user's language; no wizard message appears and no radar is created.
- [ ] `/new` sends a new wizard message with `шаг 1`, the three deal buttons and `✖️ Отмена`.
- [ ] `📡 Включить радар` of the welcome and `➕ Новый радар` under a saved radar each start a new wizard message and
      leave their own message unchanged.
- [ ] rent_long: object step shows five options in the legacy layout; the header shows `шаг 2 из 8` for a flat
      branch and the numbering has no gaps.
- [ ] rent_daily: object step shows three options; the branch ends after «Кто будет жить?».
- [ ] sale: object step shows five options with `Участок`; the branch ends after «От кого объявления?».
- [ ] Rooms step appears for `Квартира`, `Дом`, `Квартира или дом` only, with `✅ Не важно`.
- [ ] Area step: six cities, Tashkent zones and metro, districts two per row, `✅ Ташкент целиком`, `Готово (0)`.
- [ ] Ticking two districts unticks the whole city and shows `Готово (2)`; `Готово` goes to the budget.
- [ ] Another city, a zone and the metro button each go to the budget step (legacy behaviour).
- [ ] Fergana shows `Фергана целиком`, and the review of a whole-city radar reads `📍 Фергана целиком`; Kokand
      has no districts.
- [ ] Budget step: question by deal, median line, presets, `✍️ Своя сумма`, `✅ Не важно`; `📊 Не дороже рынка` and
      its paragraph only for Tashkent and the region, never for daily rent.
- [ ] The below-market toggle stays on the step and survives a preset.
- [ ] `✍️ Своя сумма` → prompt; `650` → prompt keyboard removed and the next step in a new message; a non-number →
      the error text in a new message and the wait continues.
- [ ] Steps 6, 7 and 8 show the legacy options and defaults.
- [ ] `◀️ Назад` returns to the previous step with the earlier choice ticked, on every step.
- [ ] `✖️ Отмена` on a step, on the amount prompt and on the review ends with the cancel text and no keyboard.
- [ ] A button of an older wizard message shows the alert «Форма устарела» and the keyboard disappears.
- [ ] Review: title, summary rows, flow line, closing; the three flow wordings were each seen.
- [ ] The «Это много» paragraph appears for a very broad radar.
- [ ] A relax button applies, the flow line changes, the button disappears.
- [ ] Each `✏️` button opens its step in place; a choice returns to the review; Back returns unchanged.
- [ ] Changing the deal from the review resets the budget and, when needed, asks for the object.
- [ ] `✅ Сохранить`: toast, «✅ Радар включён» with the summary and the count, sticker, starter list, tip.
- [ ] A double tap on save creates one radar.
- [ ] The 11th radar is refused with the alert.
- [ ] Saving the same conditions again answers "already on" and opens the existing radar.
- [ ] A starter number opens the card as a new message; the list does not change; it still works after the radar
      is deleted.
- [ ] `⚡ Сразу` and `📬 Подборкой` each end the tip with the right paragraph and no keyboard; the tip comes after the
      first radar only.
- [ ] A listing shown in the starter list is not pushed later by the radar.
- [ ] The radar made in the chat appears in the Mini App with the same conditions.
- [ ] `config('bot.interim_commands')` no longer contains `new`.
- [ ] Tests of this package are green; `make ci-backend` is green; the registry rows of `nw`, `wz`, `tp` are in
      `docs/infrastructure/telegram-webhook.md`.

## Handoff

Empty — nobody has started this package.
