# WP-52 — Start, commands, language, reachability

| Field | Value |
| ----- | ----- |
| Stage | D |
| Status | TODO |
| Depends on | WP-51 |
| Size | ≈ 2 800 changed lines (about half of them tests and transcripts), L. If it grows past 3 000, cut after step 9: the first PR ships reachability, `/start`, payloads, the hand-off and the interim handler with `app`, `help` and `ping` temporarily in the interim list; the second PR ships steps 10–13 and removes those three names |
| Behaviour reference | `04` §2 (rows of the eighteen handlers below), §3.1, §3.2, §3.3, §4.1, §4.2, §4.3, §6.1, §6.2, §7, §8, §9; `11b` §2.3; `05` TMA-010 … TMA-013, TMA-033; task files KV-TG-014 … KV-TG-021. Taken from the tasks: handlers, buttons, texts, rules, edge cases, tests, class names. Not taken: resets of menus left by another bot, migrated users, invite links, the legacy route group, parity-gate rows |
| Needs from the production track | (1) One new key in the server env files of staging and production: `TELEGRAM_ADMIN_USER_IDS` (comma-separated Telegram ids of the people who may see `/ping` details; may stay blank), then a Horizon restart. (2) Before this deploy the two keys WP-51 asked for must hold real values: `TELEGRAM_MINIAPP_URL` and the support contact — while the contact is blank, `/help` answers a fallback line without a button. (3) Nothing new for the webhook: `my_chat_member` is in the `allowed_updates` list WP-50 asked for; `php artisan telegram:health` must report that list as correct. (4) Approval of two additive migrations on production: the new table `user_attributions` and the columns `users.bot_commands_locale`, `users.bot_commands_version`. (5) The regular deploy to staging and production; the developer then runs the checklist of this file inside Telegram on both |

## Goal

HOMI's bot answers everything a user can do before touching a listing or a radar: `/start` with the sticker, the
live counters and the three button rows; every `/start` payload that HOMI's landing and Mini App build, with the
arrival source stored and the listing hand-off message; the language switch with the per-chat command menu; `/app`,
`/help`, `/ping`; unknown commands, non-text messages and group chats; and the chat-reachability state that radar
writes and deliveries read. Commands whose package has not landed yet are answered by one interim handler that sends
the user to the Mini App, so production never shows a dead command.

## Scope

**In.**

- Handlers: `/start` (BOT-012) with payloads BOT-027 … BOT-034, the hand-off message (BOT-031, BOT-033), the language
  switch (BOT-025), `/app` (BOT-013), `/help` (BOT-019) and the link to the support contact (BOT-011), `/ping`
  (BOT-021), unknown commands (BOT-022), non-text messages (BOT-057), group chats (BOT-058). BOT-035 is recorded as
  "not built" (see "Behaviour to reproduce", section 9).
- Buttons BTN-001 … BTN-005 and BTN-034; texts TXT-BOT-006 … TXT-BOT-009, TXT-BOT-082, TXT-BOT-085.
- `InterimHandler` with the list `config('bot.interim_commands')`, and the demo notice of the welcome.
- `BotCommandList` with `applyToChat`, `resetChat` and `syncChat`; `LanguageSwitcher`.
- `ChatReachability` and the writes of `users.bot_chat_state` that WP-45 (the `no_chat` answer of radar writes) and
  WP-57 (deliveries) read.
- Attribution storage `user_attributions`.
- Shared helpers later bot packages reuse: `MiniAppUrl`, `SupportButton`, `NotUnderstoodReply`, `ListingTitleLine`,
  `DemoDataState`.

**Out.**

- Webhook, update ledger, Bot API client, the fake Bot API — WP-50.
- Router, actor resolution and first-contact user creation, initial language (BOT-026), the text catalogue, the
  brand layer, reply classes, keyboards, the callback codec and its stale-button alert (TXT-BOT-039), stickers
  (BOT-010) — WP-51.
- Listing cards, `/fav` — WP-53. The wizard behind `/new`, `📡 Включить радар` and `➕ Новый радар` — WP-54.
  `/subs`, free text and voice parsing (TXT-BOT-043 is owned there) — WP-55. `/settings` (its language row BTN-070
  uses the action `lg` of this package), `/owner`, contacts, `/privacy`, erasure — WP-56.
- Default command scopes, bot name, descriptions, menu button (BotFather profile as code), the action-log events of
  the bot, the coverage test — WP-58.
- The mass reset of per-chat menus (KV-TG-057), invite links (`inv_<token>`; the access gate runs in mode `open`),
  a support bot of HOMI's own — not built in Wave 1.
- Joining the stored visit id to PostHog — WP-47.

## Decisions that bind this package

| # | Decision or plan section | Consequence here |
| - | ------------------------ | ---------------- |
| 1 | DEC-40 — a new bot, HOMI's brand, no users moved | No chat holds a menu or a message of another bot: nothing is reset at start. Every payload is one that HOMI's own landing (WP-61) and Mini App (WP-23, WP-30) build. Brand words, the bot name and the support contact come from `config/brand.php` placeholders only |
| 2 | DEC-43 — full bot parity, open access, no admin panel | All eighteen handlers are built. Because the bot is open to everyone from the first merge, commands of later packages get the interim reply instead of silence. "Admin" for `/ping` is an env list of Telegram ids, not a role |
| 3 | DEC-36 — defects fixed, behaviour changes off | Fixed here: LB-BOT-013 (English place names) and the information disclosure of LB-BOT-027 (security requirement SEC-REQ-011, not flagged). Behind flags that are off: DEV-027, DEV-036, DEV-037 |
| 4 | DEC-45 — every merge reaches production; checks inside Telegram on staging and production | The interim handler and the demo notice are part of this package, not a later clean-up. No tunnel: locally the bot is tested with the fake Bot API |
| 5 | DEC-33 — only HOMI's servers call legacy | Tests and local runs use the `stub` driver of the listing source; nothing here knows a legacy address |
| 6 | DEC-38 — SEO pages are Wave 3 | `s_seo…` payloads are parsed and stored, but nothing in Wave 1 builds them; the formal grammar of DEV-049 is not built |
| 7 | DEC-46 — functional parity | The acceptance checklist below is the proof; texts equal the audit except brand words |
| 8 | `25` §3.2 "Launch" | The hand-off button opens `<Mini App address>?listing=<number>`; the Mini App redirects it to the listing route |
| 9 | `25` §4.1, §4.3, §4.5 — listing source and `source_unavailable` | Welcome counters and the hand-off title come from `ListingSource` through `SourceManager` of WP-10; an unavailable source never fails `/start`. Counter refreshes are background calls and stay inside the background share of the legacy limiter (RK-25) |
| 10 | `25` §4.4 and RK-27 — demo marker | The welcome carries `bot.welcome.demo_notice` while any listing method resolves to the `stub` driver for this user |
| 11 | `25` §5 and Q-API-063 — number plus source channel and post | `user_attributions` stores `listing_number`, `source_channel`, `source_post_id` |
| 12 | `25` §6 — KV-TG-057 is not built | Per-chat command menus are set only where the bot language differs from the menu the client would show by default; `resetChat` exists for the erasure flow of WP-56; a changed command list reaches such chats lazily (`syncChat`) |
| 13 | `25` §11 and `docs/handoff/parallel-work.md` §1, §3, §6 | The new env key goes through a separate shared-file PR; migrations are flagged for the production track |

## Design

The specifications of WP-10 (sources), WP-11 and WP-12 (data objects), WP-40 (users, settings, access), WP-50
(client, test kit) and WP-51 (router, registry, catalogue, replies, codec, brand) are authoritative for names; if a
name differs from the text here, use theirs and do not create a second service.

### Dispatch order and what this package registers

The router of WP-51 dispatches in the order below (the same table as in WP-51). Registrations go into
`TelegramServiceProvider` through `HandlerRegistry`.

| Order | Update | Goes to | Registered here |
| ----- | ------ | ------- | --------------- |
| 0 | Chat type other than `private` | the non-private handler | `nonPrivate(GroupChatHandler::class)` |
| 1 | Command with a registered `CommandHandler` | that handler | `command('start' \| 'app' \| 'help' \| 'ping', …)` |
| 2 | Any other command of this bot | the command fallback | `commandFallback(CommandFallback::class)`: a name in `config('bot.interim_commands')` → `InterimHandler`, any other → `UnknownCommandHandler` |
| 3 | Callback with a registered action whose `accepts()` is true | its handler | `callback('lg', LanguageCallback::class)`, `callback('nw', InterimHandler::class)` |
| 4 | Any other callback | `StaleCallbackHandler` of WP-51 | — |
| 5 | Text, voice or contact awaited by the current conversation | the input handler | — |
| 6 | Message kind with a registered `MessageHandler` | that handler | — (later: the parsers of WP-55, the contact handler of WP-56) |
| 7 | Any other private message | the message fallback | `messageFallback(NonTextMessageHandler::class)` |
| 8 | `my_chat_member` in a private chat | its `MessageHandler` | `message(UpdateKind::ChatMember, ChatMemberHandler::class)` |

A registered command always wins over the interim list (row 1 before row 2), and the fallback of row 7 is reached
only when no handler accepts the message, so a later package needs no switch for message kinds: registering its
handler is enough. An action can be registered once: WP-54 replaces the `nw` line with its own handler in the PR
that removes `new` from the interim list.

One addition to `UpdateRouter`: after the access guard, every private message or callback — not
`UpdateKind::ChatMember`, whose handler sets the state itself — calls `ChatReachability::markActive($user)`
(section 8 below).

Interim list at the end of this package, and who empties it:

| Command | Answered by `InterimHandler` until | Also covers |
| ------- | ---------------------------------- | ----------- |
| `new` | WP-54 | callback `k1:nw` of `📡 Включить радар` (BTN-002) and of `➕ Новый радар` (BTN-030, owned by WP-54) |
| `subs` | WP-55 | — |
| `fav` | WP-53 | — |
| `settings`, `owner`, `privacy` | WP-56 | — |

Not in the list but answered by the fallback of row 7 until their handler exists: plain text and forwarded text
(WP-55), voice (WP-55), contact (WP-56). WP-58 asserts that `config('bot.interim_commands')` is empty.

### Configuration and env keys

| Key | File | Value |
| --- | ---- | ----- |
| `interim_commands` | `backend/config/bot.php` (created by WP-51) | `['new', 'subs', 'fav', 'settings', 'owner', 'privacy']` |
| `dev027`, `dev036`, `dev037` | `backend/config/bot.php` | `false` each (typed `bool`, no env) |
| `welcome.counters_ttl`, `welcome.counters_keep`, `welcome.counters_calls_per_second` | `backend/config/bot.php` | `600` s fresh; `86400` s last good value; `2` |
| `attribution.max_rows` | `backend/config/bot.php` | `100` rows per user |
| `limits.out_of_scope_per_minute` | `backend/config/bot.php` (next to the limits of WP-51) | `1` |
| `admin_user_ids` | `backend/config/telegram.php` | list of integers parsed from `TELEGRAM_ADMIN_USER_IDS`; empty list when unset |

Env key in `backend/.env.example` (shared file, separate PR, name added to
`docs/infrastructure/environments.md`): `TELEGRAM_ADMIN_USER_IDS=`. The Mini App address and the support contact are
read through `App\Support\Brand` (`miniAppUrl()`, `support()`) of WP-51; this package adds no env key for them.

### Tables and columns

Both migrations are additive and are created with `php artisan make:migration … --no-interaction`.

| Object | Columns | Notes |
| ------ | ------- | ----- |
| `user_attributions` (new) | `id` bigint identity; `user_id` → `users`, cascade on delete; `kind` string(16); `raw_payload` string(64); `source` string(40) null; `tag` string(40) null; `seo_lang` string(2) null; `seo_slice` string(64) null; `visit_id` char(10) null; `listing_number` bigint null; `source_channel` string(64) null; `source_post_id` bigint null; `touched_at` timestamp with time zone | Index `(user_id, touched_at)`; index `(visit_id)`. Model `App\Models\UserAttribution` with a factory. One row per `/start` that carries a storable payload. WP-40 keeps the first Mini App `start_param` in `users.first_start_param`; this table is the bot-side record, and WP-47 reads both. Registered in the erasure registry of WP-47; the cascade is the last guard |
| `users.bot_commands_locale`, `users.bot_commands_version` (new) | string(2) null; string(8) null | The locale and the list version of the per-chat command menu this bot set for the chat; both `null` = the chat uses the default scopes |
| `users.bot_chat_state` (exists, WP-40) | string(16), default `never` | Values `never`, `active`, `blocked` = `App\Enums\Telegram\BotChatState`. WP-40 sets `active` at sign-in when Telegram reports write access; every other change is made here |

### Classes

| Class | Role |
| ----- | ---- |
| `App\Telegram\Handlers\StartCommand` | Command `start`. Order: parse the payload → record attribution → `BotCommandList::syncChat` → replies: sticker, welcome, hand-off |
| `App\Telegram\Rendering\WelcomeRenderer` | Builds the welcome text (counters, heading, body, optional demo notice) and its keyboard for a user and a locale; used by `StartCommand` and `LanguageCallback` |
| `App\Services\Telegram\WelcomeCounters`, `App\Jobs\Telegram\RefreshWelcomeCounters` | The two live numbers, cached; see "Welcome counters" |
| `App\Services\Telegram\DemoDataState` | `listingsOnStub(User): bool` — `SourceSelector::driverFor($feature, $user)` of WP-10 for `source.listings.feed`, `.count`, `.flow`, `.map`, `.card`; `true` when any is `SourceDriver::Stub`. `isStub(SourceDriver): bool` for single answers (used by WP-53 for cards) |
| `App\Telegram\DeepLinks\StartPayloadParser`, `StartPayload`, `App\Enums\Telegram\StartPayloadKind` | Strict parser; readonly value `{kind, source, tag, seoLang, seoSlice, visitId, listingNumber, raw, storable}`; kinds `Web`, `Seo`, `Friend`, `Source`, `AppListing`, `Unknown` |
| `App\Services\Telegram\AttributionRecorder` | `record(User, StartPayload, ?string $sourceChannel, ?int $sourcePostId): void` |
| `App\Telegram\Handlers\ListingHandoff` | Third message for a payload with a listing number |
| `App\Telegram\Rendering\CityNames` | `name(string $cityCode, string $referenceName, string $locale): string` — the catalogue value `bot.city_names.<code>` when the key exists, otherwise the reference name (fix of LB-BOT-013) |
| `App\Telegram\Rendering\ListingTitleLine` | `<title> · <district> · <price>` from a `ListingSummary` of WP-12 (`title`, `district.name`, `price.display`), in the viewer's locale and currency; reused by WP-53 (venue, `/fav`) and WP-54 (starter list) |
| `App\Telegram\DeepLinks\MiniAppUrl` | `home(): ?string`, `listing(int $number): ?string`, `radar(string $id): ?string` (DEC-61); see "Mini App addresses" |
| `App\Services\Telegram\LanguageSwitcher` | `switch(User, string $locale): void` → `SettingsService::patch($user, ['locale' => …])` of WP-40 (`locale` ∈ `ru`, `uz`, `en`; it marks the locale as chosen) → `BotCommandList::syncChat` |
| `App\Services\Telegram\BotCommandList` | `for(string $locale): list<array{command, description}>`; `version(): string`; `applyToChat(User, string $locale)`; `resetChat(User)`; `syncChat(User)` |
| `App\Telegram\Handlers\LanguageCallback`, `App\Telegram\Handlers\Contracts\LanguageSwitchView`, `App\Telegram\Handlers\WelcomeLanguageView` | Callback action `lg`; see "Callback actions" |
| `App\Listeners\Telegram\SyncBotCommandsOnLocaleChange` | Queued on `telegram`; listens to `App\Events\Identity\SettingsChanged` of WP-40 and calls `syncChat` when `locale` is among the changed keys |
| `App\Telegram\Handlers\AppCommand`, `HelpCommand`, `PingCommand` | Commands `app`, `help`, `ping` |
| `App\Telegram\Keyboards\SupportButton` | The `url` button to the support contact (BTN-034); `null` when `Brand::support()` is empty or not a valid username. If WP-51 already has a helper for the support button of `bot.common.error`, this class wraps it |
| `App\Telegram\Replies\NotUnderstoodReply` | The message TXT-BOT-043 with BTN-030 and BTN-034, one button per row; WP-55 reuses it for its own "not understood" case |
| `App\Telegram\Handlers\CommandFallback`, `InterimHandler`, `UnknownCommandHandler`, `NonTextMessageHandler`, `GroupChatHandler` | Out-of-scope input and interim replies |
| `App\Enums\Telegram\BotChatState`, `ChatReachability`, `App\Events\Telegram\ChatReachabilityChanged`, `App\Listeners\Telegram\MarkChatBlocked`, `App\Telegram\Handlers\ChatMemberHandler` | Reachability; see section 8 of "Behaviour to reproduce". `ChatReachability` has `canWrite(User): bool`, `markActive(User): void`, `markBlocked(User, string $reason): void` |

One class answers "can the bot write to this user": `App\Services\Radar\ChatReachability`, created by WP-45 with
`canWrite(User)` (the radar service reads it before a write, rule of KV-BE-100). This package adds `markActive` and
`markBlocked` to that class and binds nothing new; no `App\Services\Telegram\ChatReachability` is created.
`App\Events\Telegram\ChatUnreachable` is the event that
`Responder` of WP-51 dispatches when a send is refused (the class itself is created earlier, by WP-46, whose
listener drops the user's pending deliveries); `MarkChatBlocked` listens to it.

`BotCommandList` in detail:

- `for($locale)` returns the commands in the order of TXT-BOT-005 (shown here, owned by WP-58): `start`, `app`,
  `new`, `subs`, `fav`, `settings`, `owner`, `help`, `privacy`, `ping`, with descriptions from the catalogue keys
  `bot.commands.<name>`; `ping` is left out when `config('bot.dev036')` is `true`. WP-58 uses the same method for the
  default scopes.
- `version()` is the first eight hex characters of a hash over the lists of all three locales.
- `applyToChat` calls `TelegramBot::setMyCommands` with `scope = {type: "chat", chat_id: <the user's Telegram id>}`
  and stores locale and version; it makes no call when both already match. The exception `ChatUnreachable` of WP-50
  marks the chat blocked and leaves the two columns unchanged.
- `resetChat` calls `deleteMyCommands` with the same scope and sets both columns to `null`. WP-56 calls it during
  erasure; errors are ignored.
- `syncChat` decides whether a call is needed. The wanted locale is `BotLocale::for($user, null)` of WP-51. (a) The
  stored locale equals it and the version is current → nothing. (b) Nothing is stored and the wanted locale equals
  `BotLocale::fromLanguageCode($user->language_code)` — the variant of the default scopes the client shows anyway
  (WP-58 sets `ru`, `uz`, `en` variants) → nothing. (c) Otherwise `applyToChat`. It never calls Telegram for a chat
  that is not `active`.

### Welcome counters

- Source: `ListingSource::count(SearchFilters, SourceContext)` of WP-12 — the method behind
  `GET /api/v1/listings/count` — resolved with `SourceManager::listings('source.listings.count', SourceContext::system())`.
  `active` is the sum of the counts over every city of `ReferenceSource::reference()` and the three deals, with
  `types` set to every type the deal allows (an empty list means "apartments" in the filter rules of WP-12) and
  every other filter empty. `new` is the same sum with `posted_days = 1`. These definitions close Q-BOT-036 by
  specification; the operator's definition would change the two filter sets, nothing else.
- `/start` never calls the source. `WelcomeCounters::get(): ?WelcomeCounts` reads the cache key
  `bot:welcome:counts` (`active`, `new`, the driver that answered, the time). When the value is older than
  `welcome.counters_ttl` it dispatches the unique job `RefreshWelcomeCounters` on the queue `default` and returns
  the stored value meanwhile.
- The job makes its calls one after another, at most `welcome.counters_calls_per_second` a second (36 calls for six
  cities, about twenty seconds): the legacy driver of WP-41 gives background callers a share of its outbound limit
  and answers `SourceUnavailable` beyond it instead of waiting. One `SourceUnavailable` is retried once after a
  second; a second one ends the run, keeps the previous value and logs once. The next `/start` after the TTL starts
  a new run. Job settings: `tries = 1`, `timeout = 90`, unique for 120 s.
- Shown when the source is unavailable: the last good value while it is younger than `welcome.counters_keep`; with no
  such value the counters key is left out and the rest of the welcome is sent. The first welcome after an empty
  cache therefore has no counters.
- If the 36 calls prove too many for the legacy limiter on staging (Q-API-059), take `active` from the per-deal
  `counts` of `ReferenceSource::cities()` — one cached answer — keep `count()` for `new`, and record the change in
  "Handoff".

### Mini App addresses

`MiniAppUrl` reads `Brand::miniAppUrl()` only (SEC-REQ-019). `home()` returns it; `listing($n)` appends
`listing=<n>` with `?` or, when the address already has a query, `&`; `radar($id)` appends `radar=<id>` the same
way (DEC-61: the launch link of a radar, legacy since `index-CIa0Ldj2.js`; HOMI's radar ids are ULIDs, legacy's are
integers; its first caller is WP-57). All three return `null` when the address is empty or not `https`; a handler
then sends its text without the `web_app` row and logs an error once per hour. Every `web_app` button of the bot is
built through this class. `InlineKeyboard::webApp()` of WP-51 accepts only the configured address; if its check is
an exact match, relax it here to "same scheme, host and path", so the queries of `listing()` and `radar()` pass.
WP-88 adds `ownerNew()` (the page query `owner=new`, TMA-046) and `startApp(string $param)`, a
`https://t.me/<bot username>?startapp=<param>` link sent as a `url` button for the start parameters `o_<id>` and
`c_<number>` of the owner cabinet (WP-88, "Mini App addresses"; *added by the owner-cabinet plan*).

### Callback actions registered here

| Data | Handler | Answer |
| ---- | ------- | ------ |
| `k1:lg:<ru\|uz\|en>` | `LanguageCallback` → `WelcomeLanguageView` | silent; edits the pressed welcome |
| `k1:lg:<ru\|uz\|en>:s` | `LanguageCallback` → the view WP-56 registers for origin `s` (the `/settings` panel: re-render and toast) | until WP-56 lands `accepts()` is false: stale-button alert |
| `k1:nw` | `InterimHandler` while `new` is in the interim list | silent; new message |

`LanguageCallback` validates the language code, calls `LanguageSwitcher::switch`, then returns the replies of the
`LanguageSwitchView` registered for the origin argument (`views: array<string, class-string<LanguageSwitchView>>`,
filled in `TelegramServiceProvider`; no argument = the welcome). The view contract is one method,
`replies(BotContext $ctx): array`. Any other language code or an unregistered origin fails `accepts()`.

## Files

New, under `backend/`:

- `app/Telegram/Handlers/{StartCommand,ListingHandoff,LanguageCallback,WelcomeLanguageView,AppCommand,HelpCommand,PingCommand}.php`
- `app/Telegram/Handlers/{CommandFallback,InterimHandler,UnknownCommandHandler,NonTextMessageHandler,GroupChatHandler,ChatMemberHandler}.php`
- `app/Telegram/Handlers/Contracts/LanguageSwitchView.php`
- `app/Telegram/Rendering/{WelcomeRenderer,ListingTitleLine,CityNames}.php`
- `app/Telegram/DeepLinks/{StartPayloadParser,StartPayload,MiniAppUrl}.php`, `app/Enums/Telegram/{StartPayloadKind,BotChatState}.php`
- `app/Telegram/Keyboards/SupportButton.php`, `app/Telegram/Replies/NotUnderstoodReply.php`
- `app/Services/Telegram/{WelcomeCounters,WelcomeCounts,DemoDataState,AttributionRecorder,LanguageSwitcher,BotCommandList}.php`
- no new reachability class: `app/Services/Radar/ChatReachability.php` of WP-45 is changed (see "Changed")
- `app/Jobs/Telegram/RefreshWelcomeCounters.php`,
  `app/Listeners/Telegram/{SyncBotCommandsOnLocaleChange,MarkChatBlocked}.php`
- `app/Events/Telegram/ChatReachabilityChanged.php`
- `app/Models/UserAttribution.php`, `database/factories/UserAttributionFactory.php`
- `database/migrations/<date>_create_user_attributions_table.php`,
  `<date>_add_bot_commands_columns_to_users_table.php`
- `tests/Unit/Telegram/{StartPayloadParserTest,MiniAppUrlTest,BotCommandListTest,WelcomeRendererTest,ListingTitleLineTest}.php`
- `tests/Feature/Bot/{StartCommandTest,WelcomeCountersTest,StartAttributionTest,ListingHandoffTest,LanguageSwitchTest,AppHelpCommandTest,PingCommandTest,OutOfScopeMessagesTest,ChatReachabilityTest,InterimHandlerTest}.php`
- `tests/Fixtures/Bot/transcripts/{start,start-payloads,handoff,language,app,help,ping,out-of-scope,reachability,interim}.json`

Changed:

- `backend/config/bot.php`, `backend/config/telegram.php` (`admin_user_ids`)
- `backend/app/Providers/TelegramServiceProvider.php` (registrations), `backend/app/Telegram/Updates/UpdateRouter.php`
  (the `markActive` call), `backend/app/Models/User.php` (casts, relation),
  `backend/app/Services/Radar/ChatReachability.php` (`markActive`, `markBlocked`), `backend/config/erasure.php` of
  WP-47 (entry `user_attributions`, strategy `delete`) and `backend/config/retention.php` of WP-47
  (`user_attributions`: `kept`, "the user's own record, removed by erasure") — without the two entries
  `ErasureRegistryTest` and `RetentionRegistryTest` of WP-47 fail
- `backend/lang/{ru,uz,en}/bot.php` — only keys this package adds: `ping.public`, `ping.db_error`,
  `help.unavailable`, `city_names.<code>` for every city code of the reference data; each goes into the `new` list of
  `tests/Fixtures/Bot/txt-keys.json` and into `translation-status.json`
- `backend/app/Telegram/Keyboards/InlineKeyboard.php` — only if the `webApp()` check must be relaxed
- `docs/infrastructure/telegram-webhook.md` — callback registry rows `lg`, `nw`; the interim list
- Separate shared-file PR: `backend/.env.example`, `docs/infrastructure/environments.md`

## Steps

Tests are written first inside each step (`php artisan make:test --pest …`). Run `vendor/bin/pint --dirty --format agent`
after every PHP edit.

1. Shared-file PR: `TELEGRAM_ADMIN_USER_IDS`; announce it to the production track in the PR description.
2. Config keys in `config/bot.php` and `config/telegram.php`; a unit test that every flag is a `bool` and `false`.
3. Migrations, `BotChatState`, `UserAttribution` with its factory, `User` casts.
4. `ChatReachability`, `ChatReachabilityChanged`, `MarkChatBlocked`, `ChatMemberHandler`, the `markActive` call in
   the router; `ChatReachabilityTest`.
5. `MiniAppUrl`, `SupportButton`, `NotUnderstoodReply`, `ListingTitleLine`, `CityNames` with their unit tests.
6. `CommandFallback`, `InterimHandler`, the interim list, the `nw` registration; `InterimHandlerTest`.
7. `WelcomeCounters`, `RefreshWelcomeCounters`, `DemoDataState`; `WelcomeCountersTest`.
8. `WelcomeRenderer` and `StartCommand` without payloads; `StartCommandTest`, transcript `start.json`.
9. `StartPayloadParser`, `AttributionRecorder`, `ListingHandoff`; the three test files and two transcripts.
10. `BotCommandList`, `LanguageSwitcher`, `LanguageCallback` with `WelcomeLanguageView`, the listener;
    `LanguageSwitchTest`, `BotCommandListTest`.
11. `AppCommand`, `HelpCommand`, `PingCommand` with their tests and transcripts.
12. `UnknownCommandHandler`, `NonTextMessageHandler` as the message fallback, `GroupChatHandler`;
    `OutOfScopeMessagesTest`.
13. Remaining transcripts (each with its `covers` list and `oracle`: `audit` for observed behaviour, `spec` for the
    rest), the registry rows in `docs/infrastructure/telegram-webhook.md`, the audit rows of `04` that this package
    settles by specification (Q-BOT-012, Q-BOT-013, Q-BOT-032, Q-BOT-036, Q-BOT-043), then `make ci-backend`, the
    PR with the ticked checklist, and the check inside Telegram after the deploy.

## Behaviour to reproduce

Texts are quoted as audit `04` quotes them. A word in square brackets marks a brand word and the placeholder that
replaces it. Long texts are cited by their `tb` lines; the catalogue of WP-51 holds them under the keys named here.

### Coverage

| # | Kind | Items | Section |
| - | ---- | ----- | ------- |
| 1 | Handlers (18) | BOT-012; BOT-027, BOT-028, BOT-029, BOT-030, BOT-032, BOT-034; BOT-031, BOT-033; BOT-025; BOT-013, BOT-019, BOT-011; BOT-021; BOT-022, BOT-057, BOT-058; BOT-035 (not built) | 1; 2; 3; 4; 5; 6; 7; 9 |
| 2 | Buttons (6) | BTN-001, BTN-002, BTN-003 (welcome); BTN-004 (hand-off); BTN-005 (`/app`); BTN-034 (`/help` and the not-understood reply) | 1; 3; 5 |
| 3 | Texts (6) | TXT-BOT-006, TXT-BOT-007 (welcome), TXT-BOT-008 (hand-off), TXT-BOT-009 (`/app`), TXT-BOT-082 (`/help`), TXT-BOT-085 (`/ping`) | 1; 3; 5; 6 |
| 4 | Shown here, owned elsewhere | TXT-BOT-043 and BTN-030 (WP-55, WP-54); TXT-BOT-039 (WP-51); TXT-BOT-005 (WP-58); the welcome sticker BOT-010 (WP-51) | 1, 4, 7 and "Design" |

### 1. `/start` welcome

Trigger: `/start`, `/start <payload>`, the client's Start button. State machine: `04` §3.1.

| Step | Sent | Details |
| ---- | ---- | ------- |
| 1 | Sticker `welcome` | `SendSticker('welcome')`; skipped without an error while no asset is configured (WP-51 registry) |
| 2 | New message, HTML | TXT-BOT-006 (`tb:195–210`; bold on the active count and on «Чем удобнее каналов», `tb:212`), built from the keys `welcome.counters`, `welcome.heading`, `welcome.body` in the order of the legacy text; English TXT-BOT-007 (`tb:1070–1085`); Uzbek is a draft of WP-51 (Q-BOT-014). Counters `:active` and `:new` through `BotFormat::number()` (`18 657` in `ru`, `18,657` in `en`, BR-BOT-008). `:cities` is the list of city names of `ReferenceSource::reference()` in the user's locale, each passed through `CityNames` |
| 3 | Keyboard, three rows | Row 1: `📱 Открыть kvadro²` [brand → `:brand`] · EN `📱 Open kvadro²` [brand → `:brand`] — `web_app`, style `primary`, `MiniAppUrl::home()` (BTN-001, key `buttons.open_app`). Row 2: `📡 Включить радар` · EN `📡 Turn on radar` — callback `k1:nw` (BTN-002, `buttons.radar_on`). Row 3: the two languages other than the current one, in the fixed order `🇷🇺 Русский` · `🇺🇿 Oʻzbekcha` · `🇬🇧 English` (labels are the same in every language) — callbacks `k1:lg:<code>` (BTN-003, `buttons.lang_*`) |

Rules and edge cases:

- A repeated `/start` sends both messages again and resets nothing: radars, favourites, settings and an open
  conversation stay (BR-BOT-011). BTN-002 sends a new message and leaves the welcome untouched (BR-BOT-001).
- The chat is marked `active` by the router before the handler runs, so a waiting Mini App (the `no_chat` retry of
  TMA-033, an access gate that requires a chat, BR-API-013) sees the change at once.
- Demo notice: when `DemoDataState::listingsOnStub($user)` is `true`, or the cached counters were answered by the
  `stub` driver, `bot.welcome.demo_notice` is appended as the last paragraph — also on the re-render after a
  language switch.
- Counters unavailable: see "Welcome counters". The source being down never delays or fails `/start`.
- LB-BOT-013 fixed: `CityNames` replaces a reference name by the catalogue value `bot.city_names.<code>`; the `en`
  catalogue holds `Tashkent`, `Tashkent Region`, `Andijan`, `Namangan`, `Kokand`, `Fergana`, so the English welcome
  never shows Uzbek spellings whatever the listing source returns. With no reference data available the catalogue
  names alone are used.
- No personal data is in the welcome; names are never read from the update (SEC-REQ-036).

### 2. Payloads and attribution

Formats and lengths: `04` §6.1. Builders in HOMI: the landing buttons (`s_web`, `s_web_<tag>`, the `--v<visit>`
suffix; WP-61), the no-access screen of the Mini App (`s_<source>--l<number>`; WP-23), the survey share (`s_friend`;
WP-30). The no-access screen writes `s_seo_en` / `s_seo_uz` when the source is `seo` and the interface is en / uz
(legacy since `index-CIa0Ldj2.js`; built by WP-36); row 4 of the table below reads both. The SEO pages' own
payloads have no builder until Wave 3.

Parser order: (1) longer than 64 bytes or a character outside `[A-Za-z0-9_-]` → `Unknown`, not storable; (2) strip
one trailing `--v[a-z0-9]{10}` → `visitId`; (3) strip one trailing `--l<digits>` (positive integer) →
`listingNumber`; (4) lower-case the rest and match the prefix. The kind follows the prefix; a listing number may
accompany any `s_…` kind.

| # | Payload | Parsed as | Reply |
| - | ------- | --------- | ----- |
| 1 | `s_web` (BOT-027) | `Web`, source `web`, no tag | welcome |
| 2 | `s_web_<tag>`, tag `[a-z0-9_-]{1,40}` (BOT-028) | `Web`, source `web`, tag | welcome |
| 3 | any `s_…` with `--v<visit>` (BOT-029) | as without the suffix, plus `visitId` | welcome |
| 4 | `s_seo`, `s_seo_<uz\|en>`, `s_seo_<slice>`, `s_seo_<uz\|en>_<slice>` (BOT-030) | `Seo`, source `seo`, `seoLang` (`ru` when absent), `seoSlice` (rest or `null`) | welcome |
| 5 | `s_friend` (BOT-032) | `Friend`, source `friend` | welcome |
| 6 | `s_<source>` with another source, for example `s_share`, `s_fb12` | `Source`, source as given | welcome |
| 7 | `s_<source>--l<number>` (BOT-031) | kind by prefix, plus `listingNumber` | welcome, then section 3 |
| 8 | `l_<number>` (BOT-033) | `AppListing`, `listingNumber` | welcome; section 3 only while `bot.dev037` is on |
| 9 | anything else, `l_abc`, a tag with a wrong character (BOT-034) | `Unknown` | welcome |
| 10 | `owner_new`, `owner-new` (TMA-046) | `OwnerNew`, built by WP-88 | welcome, then a Mini App button to the owner form (`MiniAppUrl::ownerNew()`, the page query `owner=new`); while `OWNER_CABINET_ENABLED` is off the welcome only (DEC-81) (*added by the owner-cabinet plan*) |
| 11 | `owner_phone` | `OwnerPhone`, built by WP-88 | welcome, then the share prompt of the owner cabinet for a client below 6.9 (WP-88, "Clients below 6.9") (*added by the owner-cabinet plan*) |

Storage (BR-BOT-096, BR-BOT-098):

- One `user_attributions` row per `/start` with a storable payload: `kind`, `raw_payload`, `source`, `tag`,
  `seo_lang`, `seo_slice`, `visit_id`, `listing_number`, `touched_at`; `source_channel` and `source_post_id` are
  filled when the hand-off of section 3 resolved the listing. `Unknown` stores the raw value only. A payload that is
  not storable and `/start` without a payload store nothing.
- First touch is the earliest row, last touch the latest; which one analytics reports is decided in WP-47
  (Q-BOT-032, closed by specification: every payload gets the ordinary welcome and is stored as above).
- Bound (SEC-REQ-022): when the user already has `attribution.max_rows` rows, the newest row is overwritten instead
  of inserting, so the first touch is never lost.
- No name, no text beyond the payload; the rows are in the erasure scope (SEC-REQ-039).
- DEV-040 needs no code and no flag: `s_web_qr` is an ordinary tag. DEV-049 (formal `s_seo` grammar) is not built in
  Wave 1; `seo_lang` and `seo_slice` keep everything it would need.

### 3. Listing hand-off

Trigger: after the welcome, when the payload carries a listing number and its kind is not `AppListing`; for
`AppListing` only while `config('bot.dev037')` is `true` (DEV-037; until then BR-BOT-097 holds: welcome only).

1. Read `ListingSource::preview($number, $context)` through `SourceManager::listings('source.listings.card', …)`
   with a `SourceContext` of the user (locale, currency). A preview records no view. Hidden lists and blocked authors
   do not apply: the user asked for this listing.
2. Listing found and active (`status_text` is `null`) → third message, new: TXT-BOT-008 (`handoff.body`)
   `Квартира, по которой вы пришли: <2-комн. квартира · Юнусабад · $600>. Откройте её кнопкой ниже 👇`, the part
   in angle brackets being `ListingTitleLine` (escaped), with one button `🏠 Открыть квартиру` — `web_app`, style
   `primary`, `MiniAppUrl::listing(<number>)` (BTN-004, `buttons.open_flat`, BR-BOT-095, BR-BOT-004).
3. The source answers with another number than the one asked (a duplicate merged at the source): title and button
   use the number of the answer.
4. `SourceNotFound`, or a withdrawn listing → nothing more is sent, no error.
5. `SourceUnavailable` → third message `bot.common.source_unavailable` with the same button for the number asked
   (the address needs no source), logged once; the attribution row is already written.
6. The message is not a listing card: no demo marker, no row in the delivered-card log of WP-53.

### 4. Language switch and per-chat command menus

State machine: `04` §3.2. Rules BR-BOT-013, BR-BOT-014, BR-BOT-015.

| Step | Trigger | Result |
| ---- | ------- | ------ |
| 1 | A language button of the welcome (BTN-003, `k1:lg:<code>`) | Locale saved through `SettingsService::patch`; the same message is edited into the welcome of the new language with current counters; its third row now shows the two other languages; the callback is answered silently — no toast |
| 2 | Same press, command menu | `BotCommandList::syncChat` → one `setMyCommands` with the chat scope and the list of the new language; none when the chat already shows that list |
| 3 | Any later reply | In the new language |
| 4 | Pressing back to the first language | The first welcome again (`tb:236`), menu switched back |
| 5 | Locale changed in the Mini App (`PATCH /api/v1/settings`) | The queued listener calls `syncChat`; it is idempotent, so a change that came from the bot costs no second call (Q-BOT-043, closed by specification: bot and app stay consistent) |
| 6 | `/start` of a user whose bot language differs from the menu of the chat, or whose stored list version is old | `syncChat` applies the list; this covers a user who chose a language in the Mini App before starting the bot |

- Locale codes inside HOMI are `ru`, `uz`, `en`; `uz_Latn` exists only at the legacy boundary (`25` §4.5).
- `setMyCommands` refused with `ChatUnreachable` → the chat is marked `blocked`, the locale stays saved.
- The per-chat scope wins over the default scopes of WP-58 by the Bot API's scope order, so a user whose Telegram
  language differs from the bot language sees the bot language.
- The `/settings` language row (BTN-070, WP-56) sends `k1:lg:<code>:s`: the same `LanguageSwitcher`, then the view
  WP-56 registers re-renders its panel and adds its toast.

### 5. `/app` and `/help`

| Command | Message | Button |
| ------- | ------- | ------ |
| `/app` (BOT-013) | TXT-BOT-009 (`app.body`) `Лента объявлений, карточки с галереей и избранное — в приложении:` | `📱 Открыть приложение` — `web_app`, default style, `MiniAppUrl::home()` (BTN-005, `buttons.open_application`) |
| `/help` (BOT-019) | TXT-BOT-082 (`help.body`) `✉️ Вопрос, жалоба или идея — напишите в поддержку: @KvadroSupportBot. Ответим там же.` [`@KvadroSupportBot` → `:support`] | `✉️ Написать в поддержку` — `url`, style `primary`, `https://t.me/<support username>` (BTN-034, `buttons.write_support`, BR-BOT-004) |

- The support username comes from `Brand::support()` and must match `[A-Za-z0-9_]{5,32}` (SEC-REQ-019). Empty or
  invalid: `/help` answers `bot.help.unavailable` (Russian draft: «Поддержка скоро появится. Пока все вопросы — в
  приложении.») without a button, and `SupportButton` returns `null` wherever it is used.
- BOT-011: every link to the support contact in the bot (this button, the not-understood reply, the error apology
  of WP-51, later `/privacy`) is built by `SupportButton` and the `:support` placeholder.
- Both commands leave an open conversation untouched; `/help@<bot username>` is the same command.

### 6. `/ping`

| Sender | Reply (one plain message) |
| ------ | ------------------------- |
| Telegram id in `config('telegram.admin_user_ids')` | TXT-BOT-085 (`ping.details`) format `🏓 pong · БД: ок · PostGIS: 3.5.2`: `select 1` gives `БД: ок`, a failure gives `bot.ping.db_error`; the version is `postgis_lib_version()` when the extension exists, otherwise `PostGIS: —` |
| Anyone else | `bot.ping.public`: `🏓 pong` — no database state, no version digits, no timing, no error text |

- The split is the security requirement SEC-REQ-011 (finding SEC-007) and applies whatever the DEV flags say.
  LB-BOT-027 is a `decision` item whose remaining part — taking `/ping` out of the command menu — is DEV-036:
  `config('bot.dev036')` is `false`, so `BotCommandList` still lists `ping` («Проверка связи»); the command works
  when typed in both states.
- An empty id list makes everyone a non-admin. The ids are never echoed or logged.

### 7. Unknown commands, non-text messages, group chats

| # | Input | Behaviour |
| - | ----- | --------- |
| 1 | Unknown command such as `/foo` (BOT-022) | `config('bot.dev027')` off: no reply (BR-BOT-006). On: one message `bot.common.unknown_command` (DEV-027, the fix of LB-BOT-014) |
| 2 | A command addressed to another bot (`/start@OtherBot`); the router of WP-51 passes it on as text | The fallback sends nothing for a text that starts with `/` |
| 3 | Photo, sticker, animation, video, video note, audio, document, location, venue, poll, dice, a forwarded post without text (BOT-057); also voice and contact while no handler of WP-55 or WP-56 accepts them | `NotUnderstoodReply`: TXT-BOT-043 (`freetext.not_understood`) `Не понял, что искать. Опишите жильё, например: «двушка в Юнусабаде до 600$ без риелторов» — или настройте радар кнопками.` with `➕ Новый радар` (BTN-030, `k1:nw`) and `✉️ Написать в поддержку` (BTN-034) — at most one reply per user per minute (`bot:{user id}:out_of_scope`) |
| 4 | Plain text or a forwarded post with text, while no handler of WP-55 accepts it | The same reply on every message, as legacy answers every phrase it does not understand (BOT-055, owned by WP-55); only the router's per-user limits apply |
| 5 | A service message without user content (`write_access_allowed`, a pinned message and the like) | No reply |
| 6 | Any update from a `group`, `supergroup` or `channel` chat (BOT-058) | No reply; no user is created |
| 7 | `my_chat_member` that adds the bot to such a chat | One `leaveChat` |

- Q-BOT-013 is closed by specification with rows 3, 6 and 7 (legacy was never observed); a capture on a test
  account could still change them.
- A location is never read or stored (BR-BOT-089); the update ledger of WP-50 strips it after processing.
- No reply keyboard is ever sent here (BR-BOT-005).

### 8. Chat reachability

| # | Input | Effect |
| - | ----- | ------ |
| 1 | User created by the Mini App sign-in only | `never` (or `active` when Telegram reported write access at sign-in — WP-40) |
| 2 | Any private message or callback of the user | `markActive` in the router (compared in memory first; one write only on change) |
| 3 | `my_chat_member` with the new status `kicked` | `markBlocked('user_blocked')` |
| 4 | `my_chat_member` with the new status `member` | `markActive` |
| 5 | A message carrying `write_access_allowed` (the user granted write access from the Mini App, TMA-033) | `markActive` through row 2. Check the field name against the Bot API documentation when implementing and note the date in the PR |
| 6 | Any send refused with `ChatUnreachable` (blocked bot, deactivated account) | `Responder` dispatches the event of WP-51; `MarkChatBlocked` calls `markBlocked('send_403')`. Senders that call `TelegramBot` directly (`BotCommandList`, later `CardSender`) catch the exception and do the same |

- The write is a conditional update (`where bot_chat_state <> <new value>`); only when it changed a row is
  `ChatReachabilityChanged` dispatched, so ten parallel refusals change the state once and raise one event. A
  listener of that event flushes the access-gate cache of WP-40: the gate caches a decision per user for 2 s and
  names no hook for a state change made outside its own code, so this package adds the listener and, if WP-40 did
  not ship one, a `forget(User): void` method on `AccessGate`.
- Updates of one chat are applied in update order (WP-50), so a late `my_chat_member` cannot undo a newer message.
- Consumers: radar writes of WP-45 answer the conflict code `no_chat` when `canWrite` is `false` (BR-BOT-099,
  BR-API-021) — that package owns the answer, this one owns the state. WP-45 keeps the check behind
  `config('radar.require_chat')` (`RADAR_REQUIRE_CHAT`, `false` on the servers until WP-54 asks the production track
  to set it); this package does not change the switch and tests the answer with the config set to `true`.
  Deliveries of WP-57 skip `never` and `blocked` users.
- Q-BOT-012 is closed by specification: a blocked user's radars stay active, nothing is sent, and after unblocking
  delivery resumes without re-sending what was missed.

### 9. Interim replies and what is not built

- `InterimHandler`: for a command of the interim list — one new message `bot.interim.use_app` with the button
  `📱 Открыть приложение` (`web_app`, `MiniAppUrl::home()`). For callback `k1:nw` — a silent answer and the same
  new message; the welcome stays as it is.
- The radar switch of WP-51 (DEC-51) does not touch the interim replies: none of this package's registrations is
  marked as a radar entry. `/new`, `/subs` and `📡 Включить радар` answer `bot.interim.use_app` while they are
  interim; from the packages that take them over (WP-54, WP-55) they answer `bot.radar.soon` until WP-57 switches
  radars on. No `/start` payload of the table in section 2 opens the wizard.
- BOT-035 (`t.me/<support>?start=l_<number>`) is a payload sent to the support contact, not to this bot. HOMI has
  no support bot of its own in Wave 1 (DEC-21 and Q-BOT-016 are open), so nothing handles it; the Mini App builds
  the link from the same support username (WP-26). Recorded as "not built".
- Invite payloads are not parsed: `inv_…` is `Unknown`.

### Defects, flags and questions

| # | Item | Status here |
| - | ---- | ----------- |
| 1 | LB-BOT-013, English place names in the welcome | Fixed (`CityNames`), tested |
| 2 | LB-BOT-027 / SEC-REQ-011, `/ping` details | Fixed for non-admins, not flagged; menu removal behind `dev036` (off) |
| 3 | LB-BOT-014 → DEV-027, hint for unknown commands | Built behind `dev027` (off); tests of the hint are Pest `todo` until the DEV is approved |
| 4 | LB-BOT-028 → DEV-037, `l_<number>` opens the listing | Built behind `dev037` (off); tests `todo` |
| 5 | DEV-040, DEV-049 | No flag: see section 2 |
| 6 | Q-BOT-012, Q-BOT-013, Q-BOT-032, Q-BOT-036, Q-BOT-043 | Closed by specification as stated above |
| 7 | Q-BOT-011, exact `web_app` addresses of the legacy bot | Not needed: HOMI's addresses are its own (`MiniAppUrl`) |

## Tests

Layers of `25` §9. Feature and conversation tests run on `FakeBotApi` and `UpdateFactory` of WP-50 with the listing
source on the `stub` driver; conversation tests use the runner of WP-51 (`conversation(user: 'A', locale: 'ru')`)
and store their transcripts as JSON.

### Pest unit

| # | Test | Cases |
| - | ---- | ----- |
| 1 | `StartPayloadParserTest` | `s_web` → Web; `s_web_insta_1` → tag `insta_1`; `s_web_Insta--vabc123def4` → tag `insta`, visit `abc123def4`; `s_seo` → `ru`, no slice; `s_seo_tashkent_yunusobod_2k` → `ru`, slice; `s_seo_uz_kv_yunusobod-minor--v0123456789` → `uz`, slice, visit; `s_friend`; `s_web--l51358` → Web + listing 51358; `s_fb12--l51358` → Source `fb12` + listing; `s_share` → Source, no listing; `l_51358` → AppListing; `l_abc`, `l_0` → Unknown; 70 characters → Unknown, not storable; `s_web_qr` → tag `qr`; `--v` twice → only the trailing one counts; a tag with `!` → Unknown |
| 2 | `MiniAppUrlTest` | plain address; address with a query (appends with `&`); empty and `http` → `null`; `radar()` appends `radar=<id>` with `?` or `&` (DEC-61) |
| 3 | `BotCommandListTest` | ten commands in order per locale; nine without `ping` when `dev036` is on (`todo`); `version()` changes when a description changes |
| 4 | `WelcomeRendererTest` | bold spans; number format per locale; rows and styles of the keyboard; third row per current locale; demo notice on and off; no counters without a value; `en` text contains none of `Toshkent`, `Andijon`, `Qoʻqon`, `Fargʻona` even when the reference data returns them |
| 5 | `ListingTitleLineTest` | title · district · price; missing district; escaping of `<`, `&` |

### Pest feature

| # | Test | Cases |
| - | ---- | ----- |
| 1 | `WelcomeCountersTest` | fresh value → no job; stale value → job dispatched once, old value returned; job sums cities × deals with every type of the deal; one `SourceUnavailable` is retried, a second keeps the old value; value older than `counters_keep` → `null` |
| 2 | `StartAttributionTest` | one row per storable payload; three starts → three rows, first and last derivable; no payload → no row; not storable → no row; row 101 overwrites the newest; listing payload fills channel and post after the hand-off |
| 3 | `ListingHandoffTest` | active listing → third message with the title and `?listing=<n>`; the merged stub number `100016` → number `100001`; the withdrawn stub number `100015` and the unknown `999404` → nothing; `999503` → generic text with the button; `l_<n>` with the flag off → nothing; with the flag on (`todo`) → third message; locale `en` with currency UZS → title from the answer |
| 4 | `LanguageSwitchTest` | edit of the same message, silent answer; one `setMyCommands` with chat scope; none on a repeat; none when the new language equals the client's default-scope variant and nothing was stored; `ChatUnreachable` → blocked, locale saved; listener on a Mini App change; no call for a `never` chat; `/start` applies a stale version; `resetChat` clears both columns; `k1:lg:uz:s` without a registered view → stale-button alert |
| 5 | `PingCommandTest` | non-admin → exactly `🏓 pong`, no `\d+\.\d+`; admin → TXT-BOT-085 format; no PostGIS (SQLite) → `PostGIS: —`; database error → marker, no exception text; empty id list |
| 6 | `OutOfScopeMessagesTest` | `/foo` silent; hint with the flag on (`todo`); `/start@OtherBot` ignored; photo → reply with two buttons; twenty stickers → one reply; text → reply; `write_access_allowed` → no reply, chat `active`; group message → nothing, no user row; bot added to a group → one `leaveChat`; stored update has no location |
| 7 | `ChatReachabilityTest` | the six inputs of section 8; one event per change; ten parallel refusals → one change (this case lives in `tests/Pgsql/ChatReachabilityRaceTest.php` and uses `concurrently()` of WP-03) |
| 8 | `InterimHandlerTest` | each of the six commands → interim message with the Mini App button; `k1:nw` → silent answer + new message; a command with a registered handler never reaches the fallback; empty list → the command is unknown |
| 9 | `AppHelpCommandTest` | texts and buttons; configured username in text and address; empty username → `bot.help.unavailable`, no button; an open conversation survives both commands |

### Conversation tests (fake update in → expected Bot API calls out)

| # | Transcript | Conversation | Expected |
| - | ---------- | ------------ | -------- |
| 1 | `start.json` | `/start` in `ru`, `uz`, `en` | `sendSticker` (with a test asset), then `sendMessage` with the welcome of the locale, three rows, `primary` on row 1 |
| 2 | `start.json` | `/start` twice with a favourite stored in between | the two replies twice; the favourite is still there |
| 3 | `start.json` | `/start`, stub driver on | welcome ends with the demo notice |
| 4 | `start-payloads.json` | one `/start <payload>` per row of the payload table | welcome each time; attribution as in the table |
| 5 | `handoff.json` | `/start s_web--l<n>` for an active stub listing | sticker, welcome, hand-off with `🏠 Открыть квартиру` |
| 6 | `language.json` | `/start` → `🇺🇿 Oʻzbekcha` → `🇷🇺 Русский` → `/help` | two edits of one message, `answerCallbackQuery` without text, `setMyCommands` per switch, `/help` in Russian |
| 7 | `app.json`, `help.json`, `ping.json` | each command, `/ping` as admin and as non-admin | one `sendMessage` each, texts and buttons of sections 5 and 6 |
| 8 | `out-of-scope.json` | `/foo`; a photo; `привет` | nothing; TXT-BOT-043 reply; TXT-BOT-043 reply |
| 9 | `interim.json` | `/new`; `/start` → `📡 Включить радар` | interim message; silent answer and interim message, welcome not edited |
| 10 | `reachability.json` | `my_chat_member` kicked, then `/start` | state `blocked`, then `active`; welcome sent |

## Acceptance checklist

Run every functional line in `ru`, `uz` and `en` on staging, then on production (DEC-45); `uz` and `en` wording is a
draft until proofread (Q-BOT-014).

- [ ] `/start` sends the sticker (when an asset is configured) and then the welcome with two live numbers in the
      number format of the language.
- [ ] The welcome keyboard has three rows: the Mini App button (highlighted), the radar button, two language buttons.
- [ ] The Mini App button opens the Mini App of this environment.
- [ ] A second `/start` sends both messages again and loses no radar, favourite or setting.
- [ ] While a listing method runs on the stub driver, the welcome ends with the demo notice; without stubs it does not.
- [ ] With the listing source down and no cached value, the welcome arrives without the counters.
- [ ] The English welcome names places `Tashkent`, `Tashkent Region`, `Andijan`, `Namangan`, `Kokand`, `Fergana`.
- [ ] A landing button (`s_web`, with and without a tag and a visit suffix) gives the ordinary welcome and one stored row.
- [ ] `s_friend`, an `s_seo…` payload and an unknown payload each give the ordinary welcome; none fails.
- [ ] «Перейти в бота» from the Mini App with a listing gives sticker, welcome and the hand-off message naming it.
- [ ] `🏠 Открыть квартиру` opens that listing in the Mini App.
- [ ] A hand-off for a withdrawn or unknown listing sends the welcome only.
- [ ] With the listing source down, the hand-off sends the "source unavailable" text with the listing button
      (shown by `ListingHandoffTest`; not reproducible by hand).
- [ ] `/start l_<number>` sends the welcome only (flag `dev037` off).
- [ ] A language button edits the same welcome into that language, shows the two other languages, and shows no toast.
- [ ] After the switch the command menu of the chat is in the new language, and `/help` answers in it.
- [ ] Switching back restores the first language and its menu.
- [ ] Changing the language in the Mini App changes the bot's replies and the chat's command menu.
- [ ] `/app` sends its line with `📱 Открыть приложение`, which opens the Mini App.
- [ ] `/help` sends the support line with the configured contact and a highlighted button that opens it.
- [ ] `/ping` answers `🏓 pong` to an ordinary user and the line with database state and PostGIS version to an admin.
- [ ] `/foo` gets no reply (flag `dev027` off).
- [ ] A photo, a sticker and a location each get the not-understood reply with two buttons, at most once a minute.
- [ ] Plain text gets the not-understood reply (until WP-55 lands).
- [ ] `/new`, `/subs`, `/fav`, `/settings`, `/owner`, `/privacy` and `📡 Включить радар` each get the interim
      message with the Mini App button (for the commands whose package has not landed).
- [ ] Added to a group, the bot leaves and writes nothing.
- [ ] Blocking the bot sets the state to `blocked`; unblocking or `/start` sets it to `active`; for a user whose
      state is not `active` a radar write answers `no_chat` when `radar.require_chat` is on (shown by
      `ChatReachabilityTest`; on the servers the switch is turned on with WP-54).
- [ ] No web_app or url button points anywhere but the configured Mini App address and `https://t.me/…`.
- [ ] Tests of this package are green; `make ci-backend` is green; the DEV tests are `todo`, not skipped silently.
- [ ] Every transcript of the list above exists and passes; `txt-keys.json` still maps all 88 texts and lists the
      new keys.
- [ ] The env key is in `.env.example` and `docs/infrastructure/environments.md`; the migrations are named in the
      PR description for the production track.
- [ ] The queue, the audit rows touched in step 13 and the session handoff are updated.

## Handoff

Empty — nobody has started this package.
