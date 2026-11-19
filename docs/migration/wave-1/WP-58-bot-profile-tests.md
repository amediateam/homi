# WP-58 — Bot profile as code, action log, conversation tests, pass inside Telegram

| Field | Value |
| ----- | ----- |
| Stage | D |
| Status | TODO |
| Depends on | WP-52 … WP-57, WP-88, WP-89 (*added by the owner-cabinet plan*) |
| Size | about 2 200 changed lines, M; half of it is transcripts and fixtures |
| Behaviour reference | `04` §1 (identity table), §2 (rows BOT-001 … BOT-008), §4.2 (TXT-BOT-001 … TXT-BOT-005), §8 (BR-BOT-085, BR-BOT-086, BR-BOT-090); `11b` §2.1 (exit criteria of the bot milestone), §6.3; `25` §9 (rows "Bot" and "In Telegram"); task files KV-TG-056, KV-TG-061, KV-QA-009, KV-QA-003, KV-QA-022; the catalogue rule of WP-47 |
| Needs from the production track | (1) After the deploy, on staging and then on production, with `TELEGRAM_PROFILE_SYNC_ALLOWED=true` set for the run: `php artisan telegram:profile diff`, then `php artisan telegram:profile sync --approved`, then `diff` again (must exit 0). (2) In @BotFather, for the staging bot and the production bot — the Bot API cannot set these: the avatar, the description picture, the Main Mini App address (`https://app.staging.homi.uz/`, `https://app.homi.uz/`), the privacy policy address (the landing privacy page of WP-61), inline mode off, "Allow groups" off. The two image files come from the product owner through the development track. (3) No migration, no new queue, no cron entry. (4) The developer who runs the pass needs the staging bot and the production bot to be reachable from four Telegram clients with their own accounts; nothing else |

## Goal

The bot looks like a finished product in every chat list — name, description, command menu, menu button — and that
profile is defined in the repository and applied by one command. Every interaction leaves an action-log entry
without texts. A coverage test proves that each of the 85 handlers (BOT-085, the sample card, since the intake of
legacy release `index-BnFvC-Ft.js`), 76 buttons and 88 texts of the legacy bot is exercised by a conversation test or
named as an exception, and the whole bot is walked through by hand inside
Telegram on staging and production.

## Scope

In:

- `telegram:profile dump|diff|sync` and the profile definition; the manual BotFather checklist.
- The bot's action-log events: the catalogue names and the single emitter.
- The coverage fixture and `BotCoverageTest`; transcripts that earlier packages left out; the injection and forgery
  corpus; the three-locale check; the assertion that no interim reply is left.
- The pass inside Telegram: its checklist document, the first full run, the evidence.
- The owner cabinet's bot side (WP-88, WP-89): the coverage fixture gains the six handler ids BOT-086 … BOT-091,
  whose transcripts cover BOT-086 … BOT-090; BOT-091 is named as an exception (a later broadcast). Its events (the
  callback actions `rq` and `mo`, the payloads `owner_new` and `owner_phone`) join the catalogue, and its signed lines
  join the pass document. These handlers have no observed legacy text, so their lines check behaviour, not parity
  (*added by the owner-cabinet plan*).

Out:

- The test kit itself: `UpdateFactory` and `FakeBotApi` (WP-50), the conversation runner and the transcript format
  (WP-51). The transcripts of each scenario (WP-52 … WP-57).
- The action log table, `ActionLogger`, retention, PostHog forwarding (WP-47).
- Per-chat command menus on a language switch (WP-52). The reset of menus an old bot left behind is not built:
  HOMI's bots have no predecessor.
- The Mini App pass on devices (WP-33) and the launch checklist (WP-71).

## Decisions that bind this package

| # | Decision | Consequence here |
| - | -------- | ---------------- |
| 1 | DEC-40 — HOMI's own bot and brand | The profile is HOMI's: the legacy name, description and bio are the source of the wording, every brand word comes from the brand layer of WP-51. All three bots (dev, staging, production) get the profile — production too, which the earlier plan left untouched |
| 2 | DEC-43, `25` §14 item 3 — full parity, signed checklist for every bot scenario | `BotCoverageTest` must print 84/84, 76/76, 88/88 with each exception named; the pass document collects the signed lines of WP-52 … WP-57 |
| 3 | DEC-36 | DEV-036 (`/ping` out of the command menu) is built behind `bot.dev036`, off: the menu has ten commands as in legacy |
| 4 | DEC-45, `25` §9 row "In Telegram" | The pass is run on staging and on production after the deploy, on iOS, Android, Desktop and Web, in ru, uz and en. There is no tunnel and no pass on a local bot |
| 5 | DEC-47, WP-47 | Bot events are written through `ActionLogger` with channel `Bot`, names prefixed `bot_`, properties from closed sets only |
| 6 | `25` §2 rule 7, SEC-REQ-047 | No event, dump file or test fixture holds a text a user typed, a phone, a name, a username, a Telegram id or the bot token |
| 7 | `docs/handoff/parallel-work.md` §7 | The development track never runs `sync` against the staging or the production bot; the command refuses without the switch that only the production track sets |

## Design

### Profile as code

`backend/config/telegram_profile.php` — the desired profile. Texts come from `lang/{ru,uz,en}/bot.php` (`profile.*`,
`commands.*`, keyed by WP-51) and from the brand layer.

| Setting | Bot API | Value |
| ------- | ------- | ----- |
| Name | `setMyName` (default and `ru`, `uz`, `en`) | `profile.name` — legacy `kvadro² [brand → :brand] · поиск жилья`; the uz and en names are new texts (Q-BOT-019, closed by specification: one name per language) |
| Description (empty chat) | `setMyDescription` (default and per language) | `profile.description` — TXT-BOT-001. Legacy has one text with ru, uz and en blocks (`tb:57–68`); HOMI keeps that trilingual text as the default and sets the single-language block for each `language_code` |
| Short description | `setMyShortDescription` (default and per language) | `profile.short_description` — TXT-BOT-003 (`tb:72–76`): one line, the support contact `:support`, the site `:site` |
| Commands | `setMyCommands`, scope `default`, for no language and for `ru`, `uz`, `en` | `BotCommandList::for($locale)` of WP-52 — the same source the per-chat menus use; descriptions TXT-BOT-005 |
| Menu button | `setChatMenuButton` (default) | type `web_app`, label `profile.menu_button` — legacy `Открыть` (TXT-BOT-004), address `MiniAppUrl::home()`. The Bot API has one default label for all languages; a label per chat is not built (Q-BOT-020 stays open, legacy unobserved) |

- `App\Telegram\Profile\BotProfile` (value object) and `BotProfileSync`: `current(): BotProfile` (all `get*` calls
  per language), `diff(BotProfile $desired): list<ProfileChange>`, `apply(list<ProfileChange>)` — at most one write
  call per second. Lengths are validated before any call (name 64, description 512, short description 120, command
  description 256 characters).
- `App\Console\Commands\Telegram\ProfileCommand`:

| Call | Effect |
| ---- | ------ |
| `telegram:profile dump` | writes `storage/app/telegram-profile-<bot username>-<date>.json`: name, descriptions, commands per language, menu button. No token |
| `telegram:profile diff` | read-only; prints the changes and the manual checklist; exit 1 when the profile differs — used by the launch checklist of WP-71 |
| `telegram:profile sync` | applies the differences only. On `APP_ENV` `staging` or `production` it refuses unless `--approved` is given **and** `config('telegram.profile_sync_allowed')` (`TELEGRAM_PROFILE_SYNC_ALLOWED`) is true. Locally it refuses a bot whose username is in `config('telegram.profile_protected_usernames')` — a new list in `config/telegram.php` (no env) that holds the usernames of the staging and the production bot; the production track names them, and while the list is empty only the environment check protects |

- The manual checklist, printed by `diff` and kept in `docs/infrastructure/telegram-webhook.md`, section "Bot
  profile":

| Setting | Legacy | For HOMI |
| ------- | ------ | -------- |
| Avatar (BOT-009) | not described | HOMI logo; the same file the asset registry of WP-51 names |
| Description picture (TXT-BOT-002) | banner «Вся аренда из Telegram — в одной ленте» / «Telegramdagi barcha ijara — bitta lentada» with a phone mock-up | the same two captions on a HOMI banner |
| Main Mini App (BOT-005) | `OPEN APP` in the profile | the Mini App address of the environment |
| Privacy policy link (BOT-006) | exists, target unknown (Q-BOT-021) | the landing privacy page of WP-61 |
| Inline mode (BOT-008) | off | off |
| Groups | unknown | joining off (WP-52 makes the bot leave a group anyway) |
| Username (BOT-001) | `@KvadroAppBot` | fixed when the bot was created; equals `TELEGRAM_BOT_USERNAME` and the username `GET /api/v1/reference` returns |

### Action-log events

`App\Telegram\Analytics\BotEvents` is the only class under `app/Telegram`, `app/Services/Telegram` and
`app/Services/Delivery` that writes analytics (architecture test). Each method validates its properties against the
closed sets below, buffers the event, and the buffer is written with `ActionLogger::recordMany($user,
ActionChannel::Bot, …)` after the handler's replies were sent — one insert per update or per delivery job, never
before a reply. The names are added to `config/analytics.php` → `events` of WP-47.

| # | Name | Emitted where | Properties (closed sets) |
| - | ---- | ------------- | ------------------------ |
| 1 | `bot_started` | `StartCommand` (WP-52) | `source` (payload kind), `has_tag`, `has_visit`, `has_listing` (`yes`, `no`) |
| 2 | `bot_command` | router (WP-51) | `command` (the ten commands, or `unknown`) |
| 3 | `bot_callback` | router (WP-51) | `action` (registry code), `outcome` (`ok`, `stale`) |
| 4 | `bot_radar_created`, `bot_radar_updated`, `bot_radar_deleted`, `bot_radar_paused`, `bot_radar_resumed` | WP-54, WP-55 | `deal`, `mode`, `via` (`wizard`, `text`, `voice`, `card`) |
| 5 | `bot_card_opened` | `CardSender` (WP-53) | `origin` (values of `CardOrigin`) |
| 6 | `bot_card_action` | card handlers (WP-53) | `op` (`fav_on`, `fav_off`, `rented`, `rented_undo`, `agent`, `agent_undo`, `hide_channel`, `hide_district`, `hide_author`, `map`, `photos`, `phone`) |
| 7 | `bot_alert_sent`, `bot_alert_blocked` | `TelegramRadarSender` (WP-57) | `kind` (`instant`, `digest`) |
| 8 | `bot_language_switched` | `LanguageSwitcher` (WP-52) | `from`, `to` (`ru`, `uz`, `en`) |
| 9 | `bot_owner_verified`, `bot_owner_removed` | WP-56 | `outcome` (values of `OwnerOutcome`) |
| 10 | `bot_found_answered` | `FoundPoll` (WP-55) | `answer`, `place`, `trigger` |
| 11 | `bot_text_parsed` | `ParseUserQuery`, `TranscribeVoiceQuery` (WP-55) | `understood` (`yes`, `no`), `kind` (`text`, `voice`) |

- A number shown by `📞 Показать номер` (WP-53, DEC-52) leaves two rows: `bot_card_action` with `op` `phone` from
  this class, and `contact_disclosed` with the listing number, which the listener of WP-47 writes for the app and
  the bot alike — it is not one of the bot's own names and is not emitted here.
- No listing number, radar id, message text, payload string or Telegram id is a property. A property outside its
  set is dropped before the write.
- Nothing is written for a user who was erased during the update (WP-56): the buffer is discarded when the user
  row is gone.
- The log keeps 180 days (WP-47), which is the promise of the privacy text (BR-BOT-086).

### Coverage and the remaining tests

- `backend/tests/Fixtures/Bot/coverage.json`: for every handler, button and text id — the owner package and either
  the transcript files whose `covers` list names it, or `spec` with the test that covers it, or `exception` with a
  reason. The tables in "Behaviour to reproduce" are the source of the owner column.
- `backend/tests/Feature/Bot/BotCoverageTest.php`: fails unless the fixture has exactly 85 handler ids, 76 button
  ids and 88 text ids, every transcript named exists and names the id in `covers`, every `spec` test exists, and the
  number of exceptions equals the list below. It prints `85/85 handlers, 76/76 buttons, 88/88 texts` and the
  exceptions.
- Expected exceptions (each with its reason in the fixture): BOT-035 (payload of a support bot HOMI does not run);
  TXT-BOT-002 (an image, checked by hand in the pass); TXT-BOT-088 (content written by the team per broadcast);
  BTN-047 (the realtor row of «Скрыть похожие», shown only when `config('radar.author_hide_rules')` is on, which it
  is not). The profile ids BOT-001 … BOT-008 and TXT-BOT-001 … TXT-BOT-005 are `spec`, covered by `ProfileSyncTest`.
- `backend/tests/Fixtures/Bot/injection-corpus.json` and `BotInjectionTest`: listing titles, district names,
  channel handles and radar titles containing `<b>`, `&`, `</blockquote>`, an unclosed tag, a `tg://` link — each
  rendered literally in a card, a starter list, a digest and a radar card (SEC-REQ-020).
- `BotForgeryTest`: for every registered action, a callback built with another user's radar ULID or conversation
  `sid`, a 65-byte string, the prefix `k2:`, and a value outside the option set — each ends in the alert of
  TXT-BOT-039 or a silent answer, and no row of the other user changes (SEC-REQ-011, SEC-REQ-014).
- `BotLocaleSweepTest`: every transcript is replayed in uz and en; no outgoing text contains a raw catalogue key
  (`bot.` followed by a key path), a `:placeholder` left unfilled, or a brand word of the legacy product.
- `InterimListTest`: `config('bot.interim_commands')` is empty and no action is bound to `InterimHandler`.
- `RadarSwitchSweepTest` (DEC-51): the registrations `new`, `nw`, `wz`, `tp`, `subs`, `sb`, the text handler, the
  voice handler and the awaited amount carry the `radar` mark of WP-51, and no other registration does. With
  `radar.creation_enabled` off, the first step of every wizard, radar-screen, free-text and voice transcript is
  answered by `bot.radar.soon` alone and leaves no radar, no conversation and no `llm_calls` row; the transcripts
  of `/start`, cards, `/fav`, `/settings`, `/owner` and `/privacy` pass unchanged in that state. Every other test
  of the bot runs with the switch on (the `phpunit.xml` value of WP-11).

### The pass inside Telegram

`docs/testing/bot-pass.md` — a table per environment and run: date, bot, build (commit), client and version,
locale, the scenario block, pass or fail, link to the screenshot, notes.

| Block | Source of the lines | Clients |
| ----- | ------------------- | ------- |
| Profile: name, description, picture, bio, menu button, command menu in three languages, Main Mini App, privacy link | this package | all four |
| Start, payloads, hand-off, language, `/app`, `/help`, `/ping`, unknown input | acceptance checklist of WP-52 | all four; payloads on one |
| Cards, card buttons, `📞 Показать номер`, `/fav` | WP-53 | all four (photo cards and `web_app` buttons differ per client) |
| Wizard, three deal branches, review, save, starter list, tip | WP-54 | iOS and Android in full; Desktop and Web: one branch |
| Free text, voice, `/subs`, radar card, poll, edit | WP-55 | all four; voice on a phone |
| `/settings`, `/owner`, `/privacy`, deletion | WP-56 | all four; the contact share on a phone (Desktop and Web cannot share a contact the same way) |
| Push, digest, quiet hours, withdrawn card, broadcast | WP-57 | one phone |

- The lines are not copied: the document links each block to the checklist of its package and records the result.
- The pass runs with radars switched on: WP-57 has set `RADAR_CREATION_ENABLED` on both environments (DEC-51).
  The blocks of WP-54 and WP-55 could not be seen inside Telegram before that switch; WP-57 ran them first, and
  this pass repeats them with the rest of the bot.
- Who runs it: the developer who holds the relay, with their own accounts, after the production track deployed and
  synced the profile. Staging first, then production. On production the data-deletion line uses a throw-away
  account, and no broadcast is sent.
- A failed line: an issue with the screenshot; the fix goes to the package that owns the scenario (a small PR with
  its transcript); the block is run again. The package is not `DONE` with an open failed line, unless the reviewer
  accepts it in writing as a visual difference (DEC-46).
- The run is also entered in `docs/testing/verification-log.md` in its table format.

### Configuration

`backend/config/bot.php`: `dev036` (`false`). `backend/config/telegram.php`: `profile_sync_allowed` from
`TELEGRAM_PROFILE_SYNC_ALLOWED` (default `false`; `.env.example` is a shared file, separate small PR).

## Files

All paths under `backend/` unless they start with `docs/`.

- `config/telegram_profile.php`, `config/telegram.php`, `config/bot.php`, `config/analytics.php` (event names)
- `app/Telegram/Profile/{BotProfile,BotProfileSync,ProfileChange}.php`
- `app/Console/Commands/Telegram/ProfileCommand.php`
- `app/Telegram/Analytics/BotEvents.php`; one call added in each emitter named in the events table
- `lang/{ru,uz,en}/bot.php` (only if a `profile.*` key is missing)
- `tests/Feature/Bot/{ProfileSyncTest,ActionLogEventsTest,BotCoverageTest,BotInjectionTest,BotForgeryTest,BotLocaleSweepTest,InterimListTest,RadarSwitchSweepTest}.php`
- `tests/Arch/BotAnalyticsTest.php`
- `tests/Fixtures/Bot/{coverage.json,injection-corpus.json}`, `tests/Fixtures/Bot/transcripts/*.json` (the missing
  ones)
- `docs/infrastructure/telegram-webhook.md` (section "Bot profile"), `docs/testing/bot-pass.md` (new),
  `docs/testing/verification-log.md`
- Shared file, separate small PR: `.env.example` (`TELEGRAM_PROFILE_SYNC_ALLOWED=false`)

## Steps

Generators always with `--no-interaction`; tests first inside each step; Pint after every PHP edit.

1. Read the current Bot API documentation of `setMyName`, `setMyDescription`, `setMyShortDescription`,
   `setMyCommands`, `setChatMenuButton` and note the date and the limits in the PR. Read the specifications of
   WP-47 (catalogue rules) and WP-51 (transcript format, `covers`).
2. `config/telegram_profile.php`, `BotProfile`, `BotProfileSync`; the `get*` and `set*` methods on the client of
   WP-50 if any is missing; `ProfileSyncTest`.
3. `ProfileCommand` with `dump`, `diff`, `sync` and the refusals; the manual checklist section in the document.
4. `BotEvents`, the catalogue names, the calls in the emitters; `ActionLogEventsTest`, `BotAnalyticsTest`.
5. `coverage.json` from the tables below; `BotCoverageTest`. Run it; write the transcripts that are missing until it
   prints the three totals.
6. `injection-corpus.json`, `BotInjectionTest`, `BotForgeryTest`.
7. `BotLocaleSweepTest`; fix every key it finds in the package that owns it.
8. `InterimListTest`; delete what is left of the interim list. `RadarSwitchSweepTest`.
9. `docs/testing/bot-pass.md`; `make ci-backend`; PR; deploy.
10. Ask the production track for the profile sync and the BotFather actions on staging; run the pass on staging;
    then the same on production. Tick the checklist with the screenshots; the reviewer signs.

## Behaviour to reproduce

Owned: handlers BOT-001 … BOT-008; texts TXT-BOT-001 … TXT-BOT-005. Brand words in quoted legacy texts are marked.

### Profile (BOT-001 … BOT-008)

| # | Where the user sees it | Legacy | HOMI |
| - | ---------------------- | ------ | ---- |
| 1 | Chat list and profile: name and username (BOT-001) | `kvadro² [brand → :brand] · поиск жилья`, `@KvadroAppBot` [bot → :bot] | `HOMI · поиск жилья` in ru; the uz and en names are new; the username of the environment's bot |
| 2 | Empty chat before the first `/start` (BOT-002) | the trilingual description (TXT-BOT-001) with the banner (TXT-BOT-002) and the client's Start button | the same text with the brand words replaced; per-language blocks for clients that send a `language_code` |
| 3 | Profile bio (BOT-003) | TXT-BOT-003: a Russian line, the support bot, the site | the same line, `:support`, `:site`; uz and en variants |
| 4 | Menu button left of the input field (BOT-004) | `Открыть` (TXT-BOT-004), opens the Mini App | the same label, HOMI's Mini App |
| 5 | Profile → `OPEN APP` (BOT-005) | Main Mini App | manual BotFather setting per environment |
| 6 | Profile → privacy policy (BOT-006) | a link, target unknown | the landing privacy page |
| 7 | The `/` command menu (BOT-007) | ten commands with descriptions (TXT-BOT-005): `Начало`, `Открыть приложение`, `Новый радар`, `Радар`, `Избранное`, `Настройки`, `Я хозяин: подтвердить номер`, `Помощь и связь`, `Конфиденциальность`, `Проверка связи` for `/start`, `/app`, `/new`, `/subs`, `/fav`, `/settings`, `/owner`, `/help`, `/privacy`, `/ping`; English in `tb:96–105`; Uzbek never captured (Q-BOT-014) | the same ten in ru and en; Uzbek descriptions are new texts for the proofreader. The menu of a chat follows the user's bot language (WP-52); the default lists set here serve a chat before its first `/start` |
| 8 | Typing the bot's username in another chat (BOT-008) | inline mode off: no hint, no results | off |

- A second `sync` makes no write call. A profile that already matches reports "no changes".
- With `bot.dev036` on, `/ping` leaves the menus (DEV-036); the command itself still answers (WP-52).
- The description picture and the avatar are checked by eye in the pass; they cannot be read through the Bot API.

### Coverage: every handler, button and text → package

Every handler, button and text of the audit belongs to exactly one package. A text is owned by the package whose
scenario shows it; all text keys are created by WP-51. "Earlier task" names the task file the behaviour was taken
from.

**Handlers (84).** The owner follows `11b` §6.3, regrouped into the nine bot packages.

| # | Trigger (audit `04` §2) | Handler | Package | Earlier task |
| - | ----------------------- | ------- | ------- | ------------ |
| 1 | Bot profile: name and username | BOT-001 | WP-58 | KV-TG-056 |
| 2 | Empty chat before the first /start (description + description picture) | BOT-002 | WP-58 | KV-TG-056 |
| 3 | Bot profile bio (short description) | BOT-003 | WP-58 | KV-TG-056 |
| 4 | Chat menu button (left of the input field) | BOT-004 | WP-58 | KV-TG-056 |
| 5 | Bot profile → `OPEN APP` (Main Mini App) | BOT-005 | WP-58 | KV-TG-056 |
| 6 | Bot profile → Privacy Policy link | BOT-006 | WP-58 | KV-TG-056, KV-TG-048 |
| 7 | Command menu (`/`) | BOT-007 | WP-58 | KV-TG-056 |
| 8 | Inline query `@KvadroAppBot …` | BOT-008 | WP-58 | KV-TG-056 |
| 9 | Bot profile avatar | BOT-009 | WP-51 | KV-TG-013 |
| 10 | sendSticker in /start and after a radar is saved | BOT-010 | WP-51 | KV-TG-013 |
| 11 | Links to `@KvadroSupportBot` (url buttons, texts) | BOT-011 | WP-52 | KV-TG-018 |
| 12 | `/start` without payload (also the client Start button) | BOT-012 | WP-52 | KV-TG-014 |
| 13 | `/app` | BOT-013 | WP-52 | KV-TG-018 |
| 14 | `/new` | BOT-014 | WP-54 | KV-TG-028 |
| 15 | `/subs` | BOT-015 | WP-55 | KV-TG-041 |
| 16 | `/fav` | BOT-016 | WP-53 | KV-TG-027 |
| 17 | `/settings` | BOT-017 | WP-56 | KV-TG-045 |
| 18 | `/owner` | BOT-018 | WP-56 | KV-TG-046 |
| 19 | `/help` | BOT-019 | WP-52 | KV-TG-018 |
| 20 | `/privacy` | BOT-020 | WP-56 | KV-TG-048 |
| 21 | `/ping` | BOT-021 | WP-52 | KV-TG-019 |
| 22 | Unknown command (checked `/foo`) | BOT-022 | WP-52 | KV-TG-020 |
| 23 | Callback from a wizard message started earlier | BOT-023 | WP-51 | KV-TG-011, KV-TG-012 |
| 24 | Callback from an older copy of a listing card | BOT-024 | WP-53 | KV-TG-011, KV-TG-024 |
| 25 | Language button BTN-003 (welcome) or BTN-070 (/settings); Mini App `PUT /api/settings` with `locale` (inferred) | BOT-025 | WP-52 | KV-TG-017 |
| 26 | First contact of a new user | BOT-026 | WP-51 | KV-TG-007 |
| 27 | `/start s_web` | BOT-027 | WP-52 | KV-TG-015 |
| 28 | `/start s_web_<tag>` | BOT-028 | WP-52 | KV-TG-015 |
| 29 | Suffix `--v<visit>` on any `s_…` payload | BOT-029 | WP-52 | KV-TG-015 |
| 30 | `/start s_seo[_<lang>][_<slice>]` | BOT-030 | WP-52 | KV-TG-015 |
| 31 | `/start s_<source>--l<id>` | BOT-031 | WP-52 | KV-TG-016 |
| 32 | `/start s_friend` | BOT-032 | WP-52 | KV-TG-015 |
| 33 | `/start l_<id>` | BOT-033 | WP-52 | KV-TG-016 |
| 34 | `/start <unknown or malformed payload>` | BOT-034 | WP-52 | KV-TG-015 |
| 35 | `t.me/<support bot>?start=l_<id>` (support bot, not @KvadroAppBot) | BOT-035 | WP-52 | KV-TG-018 (link only; the support bot itself is not built) |
| 36 | Wizard start: `/new`, BTN-002, BTN-030 | BOT-036 | WP-54 | KV-TG-028 |
| 37 | Wizard step 1 — deal | BOT-037 | WP-54 | KV-TG-029 |
| 38 | Wizard step 2 — object | BOT-038 | WP-54 | KV-TG-029 |
| 39 | Wizard step 3 — rooms (apartment, house, apartment-or-house only) | BOT-039 | WP-54 | KV-TG-029 |
| 40 | Wizard step 4 — city, zones, districts (multi-select) | BOT-040 | WP-54 | KV-TG-030 |
| 41 | Wizard step 5 — budget | BOT-041 | WP-54 | KV-TG-031 |
| 42 | Wizard step 5a — typed-amount prompt (after BTN-019) | BOT-042 | WP-54 | KV-TG-032 |
| 43 | Text received while waiting for an amount | BOT-043 | WP-54 | KV-TG-032 |
| 44 | Wizard step 6 — listings from whom | BOT-044 | WP-54 | KV-TG-033 |
| 45 | Wizard step 7 — who will live (rent_long, rent_daily) | BOT-045 | WP-54 | KV-TG-033 |
| 46 | Wizard step 8 — pets (rent_long only) | BOT-046 | WP-54 | KV-TG-033 |
| 47 | Review screen (after the last step, or after free text BOT-054) | BOT-047 | WP-54 | KV-TG-034 |
| 48 | In-place edit of one step from review or the edit screen (BTN-026) | BOT-048 | WP-54 | KV-TG-035 |
| 49 | Relax option on the review (BTN-027) | BOT-049 | WP-54 | KV-TG-034 |
| 50 | Cancel (BTN-025) on any step, the amount prompt, the review or the edit screen | BOT-050 | WP-54 | KV-TG-028 |
| 51 | Save a new radar (BTN-028) | BOT-051 | WP-54 | KV-TG-036 |
| 52 | Starter list after save | BOT-052 | WP-54 | KV-TG-037 |
| 53 | First-radar tip (only after the user's first radar) | BOT-053 | WP-54 | KV-TG-037 |
| 54 | Text that is not a command and not an awaited amount — understood | BOT-054 | WP-55 | KV-TG-038 |
| 55 | Free text — not understood (`привет`) | BOT-055 | WP-55 | KV-TG-038 |
| 56 | Voice message | BOT-056 | WP-55 | KV-TG-039 |
| 57 | Non-text messages: photo, sticker, location, document, forwarded post, contact outside /owner | BOT-057 | WP-52 | KV-TG-020 |
| 58 | Bot added to a group chat | BOT-058 | WP-52 | KV-TG-020 |
| 59 | Listing card (from BTN-031, BTN-066; inferred also from a radar push, BOT-081) | BOT-059 | WP-53 | KV-TG-022 |
| 60 | Card in state «rented by me» (after BTN-042) | BOT-060 | WP-53 | KV-TG-024 |
| 61 | Card hide-similar submenu (after BTN-044) | BOT-061 | WP-53 | KV-TG-026 |
| 62 | Listing taken down (author request, rented, sold, deleted) | BOT-062 | WP-57 | KV-TG-054 |
| 63 | /subs — no radars | BOT-063 | WP-55 | KV-TG-041 |
| 64 | /subs — radar list (also BTN-029, BTN-060, after BTN-058) | BOT-064 | WP-55 | KV-TG-041 |
| 65 | Radar card (BTN-049; edits the list message) | BOT-065 | WP-55 | KV-TG-041 |
| 66 | Edit radar screen «Радар — что изменить?» (BTN-055) | BOT-066 | WP-55 | KV-TG-044 |
| 67 | Save an edited radar (BTN-056) | BOT-067 | WP-55 | KV-TG-044 |
| 68 | Delete confirmation (BTN-057) | BOT-068 | WP-55 | KV-TG-043 |
| 69 | Poll «Нашли жильё?» — new message after pause (after delete: not observed) | BOT-069 | WP-55 | KV-TG-040 |
| 70 | Poll step «Где нашли?» (BTN-062) | BOT-070 | WP-55 | KV-TG-040 |
| 71 | Poll answers `🎉 Да, через kvadro²`, `🔎 Ещё ищу`, `🙅 Больше не ищу` | BOT-071 | WP-55 | KV-TG-040 |
| 72 | /fav — empty | BOT-072 | WP-53 | KV-TG-027 |
| 73 | /fav — list | BOT-073 | WP-53 | KV-TG-027 |
| 74 | /settings option pressed (BTN-068…BTN-072) | BOT-074 | WP-56 | KV-TG-045 |
| 75 | /owner — not verified | BOT-075 | WP-56 | KV-TG-046 |
| 76 | /owner — `Отмена` pressed (arrives as text) | BOT-076 | WP-56 | KV-TG-046 |
| 77 | /owner — contact received (BTN-073) | BOT-077 | WP-56 | KV-TG-046 |
| 78 | /owner — already verified | BOT-078 | WP-56 | KV-TG-047 |
| 79 | Remove number (BTN-075) | BOT-079 | WP-56 | KV-TG-047 |
| 80 | Delete my data (BTN-076) | BOT-080 | WP-56 | KV-TG-049 |
| 81 | New listing matches an active radar in instant mode | BOT-081 | WP-57 | KV-TG-051 |
| 82 | Digest time of the user (09:00 / 19:00 / 12:00 / 20:00) for radars in digest mode | BOT-082 | WP-57 | KV-TG-053 |
| 83 | End of the user's quiet hours | BOT-083 | WP-57 | KV-TG-052 |
| 84 | Service-news broadcast | BOT-084 | WP-57 | KV-TG-055 |

**Buttons (76).**

| # | Button (audit `04` §4.1) | Button id | Package | Earlier task |
| - | ------------------------ | --------- | ------- | ------------ |
| 1 | web_app, primary button: `📱 Открыть kvadro²` · EN `📱 Open kvadro²` | BTN-001 | WP-52 | KV-TG-014 |
| 2 | callback button: `📡 Включить радар` · EN `📡 Turn on radar` | BTN-002 | WP-52 | KV-TG-014 |
| 3 | callback button: Two of `🇷🇺 Русский` · `🇺🇿 Oʻzbekcha` · `🇬🇧 English` (always the two other languages) | BTN-003 | WP-52 | KV-TG-014 |
| 4 | web_app, primary button: `🏠 Открыть квартиру` | BTN-004 | WP-52 | KV-TG-016 |
| 5 | web_app button: `📱 Открыть приложение` | BTN-005 | WP-52 | KV-TG-018 |
| 6 | callback button: `🔑 Снять надолго` | BTN-006 | WP-54 | KV-TG-029 |
| 7 | callback button: `🌙 Снять посуточно` | BTN-007 | WP-54 | KV-TG-029 |
| 8 | callback button: `🏷 Купить` | BTN-008 | WP-54 | KV-TG-029 |
| 9 | callback button: `Квартира`, `Дом`, `Квартира или дом`, `Комната / подселение`, `Помещение`, `Участок` (set per deal, B… | BTN-009 | WP-54 | KV-TG-029 |
| 10 | callback button: `1` `2` `3` `4+` `1–2` `2–3` `Не важно` (default `✅ Не важно`) | BTN-010 | WP-54 | KV-TG-029 |
| 11 | callback button: `Ташкент` `Ташкентская область` `Андижан` / `Наманган` `Коканд` `Фергана` (current one `✅`) | BTN-011 | WP-54 | KV-TG-030 |
| 12 | callback button: `🏛 Центр` | BTN-012 | WP-54 | KV-TG-030 |
| 13 | callback button: `🏙 Ближе к центру` | BTN-013 | WP-54 | KV-TG-030 |
| 14 | callback button: `🚇 Рядом с метро (до ~1 км)` | BTN-014 | WP-54 | KV-TG-030 |
| 15 | callback button: District name (per-city list, tb l.351-358; two per row, alphabetical) | BTN-015 | WP-54 | KV-TG-030 |
| 16 | callback button: `<Город> целиком` (e.g. `✅ Ташкент целиком`, `Фергана целиком`; legacy `Весь <город>`, reworded by DEC-54) | BTN-016 | WP-54 | KV-TG-030 |
| 17 | callback button: `Готово (N)` | BTN-017 | WP-54 | KV-TG-030 |
| 18 | callback button: `до $<amount>` presets (per city/deal/rooms, §3.6) and `✅ Не важно` | BTN-018 | WP-54 | KV-TG-031 |
| 19 | callback button: `✍️ Своя сумма` | BTN-019 | WP-54 | KV-TG-032 |
| 20 | callback button: `📊 Не дороже рынка` | BTN-020 | WP-54 | KV-TG-031 |
| 21 | callback button: `Все объявления` (default `✅`) · `Без риелторов` · `Только хозяева` | BTN-021 | WP-54 | KV-TG-033 |
| 22 | callback button: `👨‍👩‍👧 Семья` · `👨 Парень / парни` · `👩 Девушка / девушки` · `✅ Не важно` | BTN-022 | WP-54 | KV-TG-033 |
| 23 | callback button: `🐾 Не запрещены` · `🐾 Разрешены` · `✅ Не важно` | BTN-023 | WP-54 | KV-TG-033 |
| 24 | callback button: `◀️ Назад` | BTN-024 | WP-54 | KV-TG-028 |
| 25 | callback button: `✖️ Отмена` | BTN-025 | WP-54 | KV-TG-028 |
| 26 | callback button: `✏️ Сделка` `✏️ Объект` `✏️ Комнаты` `✏️ Районы` `✏️ Бюджет` `✏️ Риелторы` `✏️ Кто живёт` `✏️ Животные…` | BTN-026 | WP-54 | KV-TG-035 |
| 27 | callback button: Relax option, e.g. `✅ Вместе с риелторами` (others unknown, Q-BOT-039) | BTN-027 | WP-54 | KV-TG-034 |
| 28 | callback button: `✅ Сохранить` (primary) | BTN-028 | WP-54 | KV-TG-036 |
| 29 | callback button: `📡 Радар` | BTN-029 | WP-54 | KV-TG-036 |
| 30 | callback button: `➕ Новый радар` | BTN-030 | WP-54 | KV-TG-028 |
| 31 | callback button: `1` … `N` (five per row) | BTN-031 | WP-54 | KV-TG-037 |
| 32 | callback button: `⚡ Сразу` | BTN-032 | WP-54 | KV-TG-037 |
| 33 | callback button: `📬 Подборкой` | BTN-033 | WP-54 | KV-TG-037 |
| 34 | url button: `✉️ Написать в поддержку` (primary) | BTN-034 | WP-52 | KV-TG-018 |
| 35 | web_app, primary button: `📱 Открыть в приложении` (primary) | BTN-035 | WP-53 | KV-TG-022 |
| 36 | callback button: `📍 На карте` | BTN-036 | WP-53 | KV-TG-023 |
| 37 | url button: `🔗 Открыть оригинал` | BTN-037 | WP-53 | KV-TG-022 |
| 38 | callback button: `📷 Ещё N фото` | BTN-038 | WP-53 | KV-TG-023 |
| 39 | callback button: `⭐ В избранное` | BTN-039 | WP-53 | KV-TG-024 |
| 40 | callback button: `★ В избранном` | BTN-040 | WP-53 | KV-TG-024 |
| 41 | callback button: `Это риелтор` | BTN-041 | WP-53 | KV-TG-025 |
| 42 | callback button: `Уже сдано` | BTN-042 | WP-53 | KV-TG-024 |
| 43 | callback button: `↩️ Не сдано` | BTN-043 | WP-53 | KV-TG-024 |
| 44 | callback button: `Скрыть похожие` | BTN-044 | WP-53 | KV-TG-026 |
| 45 | callback button: `📢 Канал @<канал>` | BTN-045 | WP-53 | KV-TG-026 |
| 46 | callback button: `📍 Район <район>` | BTN-046 | WP-53 | KV-TG-026 |
| 47 | callback button: Realtor row (label unknown; «этого риелтора» in the tip text) | BTN-047 | WP-53 | KV-TG-026 |
| 48 | callback button: `✖️ Отмена` | BTN-048 | WP-53 | KV-TG-026 |
| 49 | callback button: `▶️ <название>` / `⏸ <название>` (TXT-BOT-059) | BTN-049 | WP-55 | KV-TG-041 |
| 50 | callback button: `⏸ Пауза` | BTN-050 | WP-55 | KV-TG-042 |
| 51 | callback button: `▶️ Включить` | BTN-051 | WP-55 | KV-TG-042 |
| 52 | callback button: `📬 Присылать подборкой` | BTN-052 | WP-55 | KV-TG-042 |
| 53 | callback button: `📡 Присылать сразу` | BTN-053 | WP-55 | KV-TG-042 |
| 54 | callback button: `🙉 Показать скрытое` | BTN-054 | WP-55 | KV-TG-043 |
| 55 | callback button: `✏️ Изменить` | BTN-055 | WP-55 | KV-TG-044 |
| 56 | callback button: `✅ Сохранить` (primary) | BTN-056 | WP-55 | KV-TG-044 |
| 57 | callback button: `🗑 Удалить` | BTN-057 | WP-55 | KV-TG-043 |
| 58 | callback button: `🗑 Да, удалить` (danger) | BTN-058 | WP-55 | KV-TG-043 |
| 59 | callback button: `✖️ Отмена` | BTN-059 | WP-55 | KV-TG-043 |
| 60 | callback button: `◀️ К списку` | BTN-060 | WP-55 | KV-TG-041 |
| 61 | callback button: `🎉 Да, через kvadro²` | BTN-061 | WP-55 | KV-TG-040 |
| 62 | callback button: `🏠 Да, в другом месте` | BTN-062 | WP-55 | KV-TG-040 |
| 63 | callback button: `🔎 Ещё ищу` | BTN-063 | WP-55 | KV-TG-040 |
| 64 | callback button: `🙅 Больше не ищу` | BTN-064 | WP-55 | KV-TG-040 |
| 65 | callback button: `📢 Telegram-канал` · `🛒 OLX` / `🌐 Uybor, Uysot…` · `🤝 Риелтор` / `👥 Знакомые` · `🪧 На доме, на улице`… | BTN-065 | WP-55 | KV-TG-040 |
| 66 | callback button: `<n>. <комнаты>-комн. квартира · <район> · $<цена>` | BTN-066 | WP-53 | KV-TG-027 |
| 67 | callback button: `🌙 Тихие часы` `📬 Время подборок` `🌐 Язык` `💱 Валюта` `📰 Новости сервиса` · EN `🌙 Quiet hours` `📬 Dige…` | BTN-067 | WP-56 | KV-TG-045 |
| 68 | callback button: `выкл` `22:00–08:00` `23:00–08:00` / `00:00–09:00` `23:00–07:00` · EN `off` · UZ `oʻch.` | BTN-068 | WP-56 | KV-TG-045 |
| 69 | callback button: `09:00` `09:00 и 19:00` / `12:00 и 20:00` `19:00` · EN `and` · UZ `va` | BTN-069 | WP-56 | KV-TG-045 |
| 70 | callback button: `🇷🇺 Русский` `🇺🇿 Oʻzbekcha` `🇬🇧 English` | BTN-070 | WP-56 | KV-TG-045 |
| 71 | callback button: `Доллары, $` `Сумы` · EN `Dollars, $` `Soʻm` · UZ `Dollar, $` `Sumi` | BTN-071 | WP-56 | KV-TG-045 |
| 72 | callback button: `Присылать` `Не присылать` · EN `Send` `Don’t send` · UZ `Yuborish` `Yubormaslik` | BTN-072 | WP-56 | KV-TG-045 |
| 73 | request_contact button: `📱 Поделиться номером` | BTN-073 | WP-56 | KV-TG-046 |
| 74 | reply button: `Отмена` | BTN-074 | WP-56 | KV-TG-046 |
| 75 | callback button: `🗑 Убрать номер` | BTN-075 | WP-56 | KV-TG-047 |
| 76 | callback button: `🗑 Удалить мои данные` | BTN-076 | WP-56 | KV-TG-049 |

**Texts (88).**

| # | Where shown (audit `04` §4.2) | Kind | Text id | Owner package | Also shown by |
| - | ----------------------------- | ---- | ------- | ------------- | ------------- |
| 1 | Description, empty chat (BOT-002) | profile | TXT-BOT-001 | WP-58 | — |
| 2 | Description banner (BOT-002) | image | TXT-BOT-002 | WP-58 | — |
| 3 | Bio (BOT-003) | profile | TXT-BOT-003 | WP-58 | — |
| 4 | Menu button (BOT-004) | label | TXT-BOT-004 | WP-58 | — |
| 5 | Command descriptions (BOT-007) | menu | TXT-BOT-005 | WP-58 | — |
| 6 | Welcome (BOT-012) | message | TXT-BOT-006 | WP-52 | — |
| 7 | Welcome, EN | message | TXT-BOT-007 | WP-52 | — |
| 8 | Third message of `s_<source>--l<id>` | message | TXT-BOT-008 | WP-52 | — |
| 9 | `/app` | message | TXT-BOT-009 | WP-52 | — |
| 10 | Wizard step frame | frame | TXT-BOT-010 | WP-54 | — |
| 11 | Edit-radar step header | frame | TXT-BOT-011 | WP-55 | — |
| 12 | Step 1 | prompt | TXT-BOT-012 | WP-54 | — |
| 13 | Step 2 | prompt | TXT-BOT-013 | WP-54 | — |
| 14 | Step 3 | prompt | TXT-BOT-014 | WP-54 | — |
| 15 | Step 4 | prompt | TXT-BOT-015 | WP-54 | — |
| 16 | Step 4, Tashkent | hint | TXT-BOT-016 | WP-54 | — |
| 17 | Step 4, other cities: (a) region, (b) Andijan/Namangan/Fergana with the city name, (c) Kokand | hint | TXT-BOT-017 | WP-54 | — |
| 18 | Step 5 question by deal | prompt | TXT-BOT-018 | WP-54 | — |
| 19 | Step 5 median line | hint | TXT-BOT-019 | WP-54 | — |
| 20 | Step 5 below-market explanation | hint | TXT-BOT-020 | WP-54 | — |
| 21 | Typed-amount prompt | prompt | TXT-BOT-021 | WP-54 | — |
| 22 | Typed amount not a number | error | TXT-BOT-022 | WP-54 | — |
| 23 | Step 6 | prompt | TXT-BOT-023 | WP-54 | — |
| 24 | Step 7 | prompt | TXT-BOT-024 | WP-54 | — |
| 25 | Step 8 | prompt | TXT-BOT-025 | WP-54 | — |
| 26 | Cancel | message | TXT-BOT-026 | WP-54 | WP-55 (edit cancelled) |
| 27 | Review | message | TXT-BOT-027 | WP-54 | — |
| 28 | Flow estimate | line | TXT-BOT-028 | WP-54 | — |
| 29 | Review, too broad | line | TXT-BOT-029 | WP-54 | — |
| 30 | Review, almost nothing | line | TXT-BOT-030 | WP-54 | — |
| 31 | Review, broaden options | line | TXT-BOT-031 | WP-54 | — |
| 32 | Review closing | line | TXT-BOT-032 | WP-54 | — |
| 33 | Edit screen title | message | TXT-BOT-033 | WP-55 | — |
| 34 | Radar saved | message | TXT-BOT-034 | WP-54 | WP-55 (edited radar saved) |
| 35 | Starter list | message | TXT-BOT-035 | WP-54 | — |
| 36 | First-radar tip | message | TXT-BOT-036 | WP-54 | — |
| 37 | Tip after `⚡ Сразу` | line | TXT-BOT-037 | WP-54 | — |
| 38 | Tip after `📬 Подборкой` | line | TXT-BOT-038 | WP-54 | — |
| 39 | Outdated wizard button | alert | TXT-BOT-039 | WP-51 | every package with callbacks |
| 40 | Free-text review title | message | TXT-BOT-040 | WP-55 | — |
| 41 | Parse note, deal defaulted | line | TXT-BOT-041 | WP-55 | — |
| 42 | Parse note, unknown place | line | TXT-BOT-042 | WP-55 | — |
| 43 | Free text not understood | message | TXT-BOT-043 | WP-55 | WP-52 (non-text messages and the interim free-text reply) |
| 44 | Listing card body | message | TXT-BOT-044 | WP-53 | WP-57 (radar push) |
| 45 | `📍 На карте` venue | venue | TXT-BOT-045 | WP-53 | — |
| 46 | Card, rented by me | line | TXT-BOT-046 | WP-53 | — |
| 47 | Card after takedown | message | TXT-BOT-047 | WP-57 | — |
| 48 | `⭐ В избранное` | toast | TXT-BOT-048 | WP-53 | — |
| 49 | `★ В избранном` | toast | TXT-BOT-049 | WP-53 | — |
| 50 | `📷 Ещё N фото` without photos | toast | TXT-BOT-050 | WP-53 | — |
| 51 | `Скрыть похожие` | toast | TXT-BOT-051 | WP-53 | — |
| 52 | Hide rule saved | toast | TXT-BOT-052 | WP-53 | — |
| 53 | `Это риелтор` | toast | TXT-BOT-053 | WP-53 | — |
| 54 | `Это риелтор` again | toast | TXT-BOT-054 | WP-53 | — |
| 55 | `Уже сдано` | toast | TXT-BOT-055 | WP-53 | — |
| 56 | `↩️ Не сдано` | toast | TXT-BOT-056 | WP-53 | — |
| 57 | `/subs` empty | message | TXT-BOT-057 | WP-55 | — |
| 58 | `/subs` list | message | TXT-BOT-058 | WP-55 | — |
| 59 | Radar title | label | TXT-BOT-059 | WP-55 | — |
| 60 | Radar card | message | TXT-BOT-060 | WP-55 | — |
| 61 | Delete confirmation | message | TXT-BOT-061 | WP-55 | — |
| 62 | `⏸ Пауза` | toast | TXT-BOT-062 | WP-55 | — |
| 63 | `▶️ Включить` | toast | TXT-BOT-063 | WP-55 | — |
| 64 | `📬 Присылать подборкой` | toast | TXT-BOT-064 | WP-55 | — |
| 65 | `📡 Присылать сразу` | toast | TXT-BOT-065 | WP-55 | — |
| 66 | `🙉 Показать скрытое` | toast | TXT-BOT-066 | WP-55 | — |
| 67 | `🗑 Да, удалить` | toast | TXT-BOT-067 | WP-55 | — |
| 68 | Poll | message | TXT-BOT-068 | WP-55 | — |
| 69 | Poll, where | message | TXT-BOT-069 | WP-55 | — |
| 70 | Poll, thanks | message | TXT-BOT-070 | WP-55 | — |
| 71 | Poll replies to kvadro / searching / stopped | message | TXT-BOT-071 | WP-55 | — |
| 72 | `/fav` empty | message | TXT-BOT-072 | WP-53 | — |
| 73 | `/fav` list | message | TXT-BOT-073 | WP-53 | — |
| 74 | `/settings` panel | message | TXT-BOT-074 | WP-56 | — |
| 75 | Any `/settings` option; radar save | toast | TXT-BOT-075 | WP-56 | WP-54 (radar saved), WP-55 (radar edited) |
| 76 | `/owner` intro | message | TXT-BOT-076 | WP-56 | — |
| 77 | `/owner` declined | message | TXT-BOT-077 | WP-56 | — |
| 78 | `/owner` verified, no listings | message | TXT-BOT-078 | WP-56 | — |
| 79 | `/owner` already verified | message | TXT-BOT-079 | WP-56 | — |
| 80 | Number removed | message | TXT-BOT-080 | WP-56 | — |
| 81 | `/owner` with listings found / refusals | message | TXT-BOT-081 | WP-56 | — |
| 82 | `/help` | message | TXT-BOT-082 | WP-52 | — |
| 83 | `/privacy` | message | TXT-BOT-083 | WP-56 | — |
| 84 | Delete-my-data confirmation / result | message | TXT-BOT-084 | WP-56 | — |
| 85 | `/ping` | message | TXT-BOT-085 | WP-52 | — |
| 86 | Radar push | message | TXT-BOT-086 | WP-57 | — |
| 87 | Digest | message | TXT-BOT-087 | WP-57 | — |
| 88 | Service news | message | TXT-BOT-088 | WP-57 | — |

**Totals per package.**

| Package | Handlers | Buttons | Texts |
| ------- | -------- | ------- | ----- |
| WP-50 | 0 | 0 | 0 |
| WP-51 | 4 | 0 | 1 |
| WP-52 | 18 | 6 | 6 |
| WP-53 | 7 | 15 | 14 |
| WP-54 | 19 | 28 | 27 |
| WP-55 | 13 | 17 | 21 |
| WP-56 | 10 | 10 | 10 |
| WP-57 | 5 | 0 | 4 |
| WP-58 | 8 | 0 | 5 |
| Total | 84 | 76 | 88 |

## Tests

| # | Test | Cases |
| - | ---- | ----- |
| 1 | `ProfileSyncTest` | the fake returns the desired profile → `diff` exit 0, "no changes"; a different Russian command list → `diff` lists it, `sync` calls `setMyCommands` for `ru` once; a missing Uzbek list → set; `sync` twice → no write the second time; `APP_ENV=production` without the switch → refused, no `set*` call; with the switch and without `--approved` → refused; with both → applied; a local run against the production username → refused; `dump` → JSON without a token string; a description over the limit → validation error before any call; `dev036` on (`todo`) → `/ping` absent from every list |
| 2 | `ActionLogEventsTest` | `/start` with a tagged payload → `bot_started` with `source` and the three flags, `bot_command` with `start`; `/foo` → `bot_command` with `unknown`; a wizard to save → one `bot_callback` per press and one `bot_radar_created`; a free text → `bot_text_parsed`, and no column holds the text; an outdated button → `outcome` `stale`; an instant card, then a `403` → `bot_alert_sent`, `bot_alert_blocked`; `/owner` with the own contact → `bot_owner_verified`, no phone or hash; `📞 Показать номер` → `bot_card_action` with `op` `phone` and one `contact_disclosed` row of WP-47 with channel `bot`, neither holding the number; an unknown property → dropped; a user erased in the same update → no row; the rows are written after the Bot API calls of the update |
| 3 | `BotAnalyticsTest` (arch) | only `BotEvents` uses `ActionLogger` in the bot namespaces |
| 4 | `BotCoverageTest` | the three totals; a transcript removed from the fixture → failure naming the id; exactly the listed exceptions |
| 5 | `BotInjectionTest` | every corpus entry rendered literally in the four renderers; `FakeBotApi` accepts the HTML |
| 6 | `BotForgeryTest` | per action: foreign radar, foreign `sid`, 65 bytes, `k2:`, value outside the set → no state change |
| 7 | `BotLocaleSweepTest` | uz and en replays: no raw key, no unfilled placeholder, no legacy brand word |
| 8 | `InterimListTest` | empty list; no action bound to `InterimHandler` |
| 9 | `RadarSwitchSweepTest` | the list of marked registrations is exact; with radars off every radar entry answers `bot.radar.soon` and creates nothing, every other scenario is unchanged |

## Acceptance checklist

- [ ] `telegram:profile diff` exits 0 on the staging bot and on the production bot after the production track's sync.
- [ ] In Telegram, on each of the two bots: the name, the description with its picture before the first `/start`,
      the bio, the menu button and the avatar are HOMI's, in ru, uz and en clients.
- [ ] The `/` menu shows ten commands with descriptions in the client's language, and follows a language switch
      made in the bot.
- [ ] The profile opens the Mini App and the privacy page; inline mode shows nothing; the bot cannot be added to a
      group.
- [ ] `BotCoverageTest` prints `85/85 handlers, 76/76 buttons, 88/88 texts` and names four exceptions.
- [ ] The injection, forgery, locale-sweep, interim-list and radar-switch tests are green.
- [ ] A sample of the action log on staging after the pass shows the eleven event groups (and `contact_disclosed`
      for the numbers shown) and no text, phone, name or Telegram id in any property.
- [ ] `docs/testing/bot-pass.md` holds a complete run for staging and for production: every block, four clients,
      three languages as the table says, each line pass or an accepted difference signed by the reviewer.
- [ ] The acceptance checklists of WP-52 … WP-57 are all ticked and signed (`25` §14 item 3).
- [ ] `make ci-backend` is green.

## Handoff

Empty — nobody has started this package.
