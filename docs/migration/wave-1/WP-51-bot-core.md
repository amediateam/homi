# WP-51 — Router, locale, texts, reply conventions, callbacks, state, assets

| Field | Value |
| ----- | ----- |
| Stage | D |
| Status | TODO |
| Depends on | WP-50 |
| Size | about 5 000 changed lines, L; a third of it is catalogue text and fixtures. Above the 3 000-line guide: ship as two PRs, part A = steps 1–10 (router, actor, limits, locale, text helpers, brand layer, catalogues, key map), part B = steps 11–19 (replies, keyboards, callback codec, conversation store, assets, conversation runner). The bot stays silent after either part |
| Behaviour reference | `04` §1 (rows "Stickers", "Avatar"), §2 (BOT-009, BOT-010, BOT-023, BOT-026), §3 preamble and §3.17, §4.1 (labels), §4.2 (all 88 texts), §4.3, §7, §8 (BR-BOT-001 … BR-BOT-005, BR-BOT-008 … BR-BOT-011, BR-BOT-015, BR-BOT-016, BR-BOT-076, BR-BOT-085, BR-BOT-087), §9.1 (LB-BOT-009 … LB-BOT-013); `16` §4.2–§4.4 (SEC-REQ-010, SEC-REQ-011, SEC-REQ-014, SEC-REQ-019, SEC-REQ-020, SEC-REQ-036); `.ai/agents/telegram-bot-engineer.md` rules 5, 7, 10, 12, 13; task files KV-TG-006 … KV-TG-013, KV-QA-007, KV-QA-009 |
| Needs from the production track | No migration. (1) In the server env of staging and of production: `TELEGRAM_MINIAPP_URL` (`https://app.staging.homi.uz/`, `https://app.homi.uz/`) and `TELEGRAM_SUPPORT_USERNAME` (the key WP-11 introduced for `telegram.support.username`: the support contact the product owner names, without `@`; blank until then — confirm it is set); on staging also `BRAND_SITE_URL=https://staging.homi.uz`. Optional: `TELEGRAM_CONVERSATION_TTL` (default 1 800), `TELEGRAM_STICKER_SET`, `BRAND_PRIVACY_URL`. Then a Horizon restart. (2) `php artisan telegram:assets:refresh` after any change of the sticker configuration. (3) Nothing for Redis: conversation state and limit counters use the existing cache store; a Redis flush only makes open wizards outdated |

## Goal

Every stored update reaches exactly one handler through a router that knows who acts, in which language and within
which limits. Everything a handler needs to answer the way the legacy bot does exists: three catalogues with all
88 texts and every button label under keys, the brand layer, reply objects with one responder, keyboards, the
versioned callback codec with the «Форма устарела» alert, conversation state, the sticker registry, and the
conversation test runner. No command is built here: after this package the bot still answers nothing except that
alert, the slow-down notice and the apology after a failed update.

## Scope

**In.**

- Update router, actor resolution through WP-40, access guard, per-user limits (KV-TG-006).
- Locale resolution, the translator wrapper, HTML escaping and truncation, number and date formatting (KV-TG-007).
- The Russian catalogue and the key map (KV-TG-008); Uzbek and English texts with the glossary fixes (KV-TG-009).
- The brand layer `backend/config/brand.php` and the brand-word test.
- Reply conventions: reply objects, responder, inline and reply keyboards (KV-TG-010).
- The `callback_data` codec, the action registry and the catch-all alert (KV-TG-011, without a legacy decoder).
- The conversation store with TTL and staleness (KV-TG-012).
- The sticker and asset registry, `telegram:assets:refresh` (KV-TG-013).
- The conversation runner and the transcript format of KV-QA-009; the catalogue tests of KV-QA-007.
- Owned items: handlers BOT-009, BOT-010, BOT-023, BOT-026; text TXT-BOT-039.

**Out.**

| Not here | Where |
| -------- | ----- |
| Every command and scenario; `InterimHandler`, unknown commands, non-text messages, groups, chat reachability, the language switch and per-chat command menus | WP-52 |
| Cards, `/fav`; the wizard; `/subs`, free text, voice, the poll; settings, owner, privacy | WP-53; WP-54; WP-55; WP-56 |
| Send pacing, pushes, digests, broadcasts | WP-57 |
| `BotCoverageTest`, the coverage fixture, the security corpus, BotFather settings, bot action-log events | WP-58 |
| The parity check of a text against the audit | the package whose scenario shows it (column "Owner" of the key map) |
| Keys of flagged wording (`DEV` items) and of texts legacy does not have, other than the seven shared keys below | the package that owns the flag or the scenario |
| A decoder for legacy `callback_data`, a reset of menus left by another bot (KV-TG-058, KV-TG-057) | not built: this bot has no old messages (`25` §6) |
| The LLM gateway | WP-55 |
| The owner cabinet's bot texts, its callback actions `rq` and `mo`, the conversation kind `OwnerPhone` | WP-88 (the owner's phone), WP-89 (requests, answers, the operators' notice) (*added by the owner-cabinet plan*) |

## Decisions that bind this package

| Decision | Consequence here |
| -------- | ---------------- |
| Brand HOMI, same interface (DEC-40; `25` §2 rule 5) | No catalogue value names the product, the bot, the support bot or a domain. They come from `config/brand.php` through `:brand`, `:bot`, `:support`, `:site`. A test fails on a legacy or HOMI brand word in `backend/lang/**` |
| Texts copied verbatim except brand words (`25` §2 rule 6, `25` §6) | The catalogue is the audit's text. Each text keeps its audit id through `tests/Fixtures/Bot/txt-keys.json`, so a later change of the legacy bot can be found and applied |
| Defects fixed, behaviour changes off (DEC-36) | The Uzbek and English copy defects LB-BOT-010 … LB-BOT-013 are fixed in the catalogues. This package creates `backend/config/bot.php` and adds no flag of its own |
| The whole-city label (DEC-54) | LB-BOT-009 is settled by decision, without a flag: the label is built from the city's name — `:city целиком` in `ru`, with `uz` and `en` drafts — on the button and in the summary row. Callback data and stored values do not change |
| Radars before delivery (DEC-51) | While `config('radar.creation_enabled')` (WP-11) is off, no entry into the radar wizard or a radar screen runs: the router answers one text, `bot.radar.soon`. The rule and the text live here; later packages only mark their registrations |
| Full parity, open access, no admin panel (DEC-43) | The access guard only stops a `blocked` user. The limits protect an open bot from the first day |
| Every merge reaches production (DEC-45) | No handler is registered, so the deploy is silent. `ConversationSelfTest` proves the kit against a toy handler that exists only in tests |
| Functional parity (DEC-46) | The reply conventions of `04` §4.3 are built into the responder, so a handler cannot answer in another manner by accident |
| Dependencies (DEC-49, `25` §10) | No i18n, state-machine or Telegram library is added |
| Identity (`25` §5) | The bot creates and updates the same `users` row as the Mini App through the service of WP-40. No name or username is read |
| Bot tests (`25` §9) | Conversation tests: fake update in through the webhook, expected Bot API calls out. The runner and the transcript format are defined here; later packages add transcripts |
| Stub data visible on production (RK-27) | The keys `bot.welcome.demo_notice` and `bot.card.demo_marker` exist from this package on |
| Open translation question (Q-BOT-014) | Uzbek and English texts that were never captured are drafts, tracked in `translation-status.json`, until a person proofreads them |

## Design

### Update path

`ProcessTelegramUpdateJob` (WP-50) calls `UpdateProcessor::process()`. This package binds
`App\Telegram\Updates\UpdateRouter` to that interface in `TelegramServiceProvider`.

| Step | What the router does | Result when it stops here |
| ---- | -------------------- | ------------------------- |
| 1 | Builds `IncomingUpdate` from the stored payload and reads its `UpdateKind`: `Command`, `Text`, `Voice`, `Contact`, `Callback`, `ChatMember`, `OtherMessage`, `Ignored` | `Ignored` (no `from`, unsupported type): nothing |
| 2 | Chat type other than `private` → the non-private handler if one is registered (WP-52), else nothing. No user is created | — |
| 3 | Resolves the actor from `from.id` (below) and builds `BotContext` | — |
| 4 | Access guard: `AccessGate::decide($user)`; state `Blocked` → a callback is answered silently, nothing else is sent | — |
| 5 | Per-user limits (below) | dropped with or without a notice |
| 6 | Dispatch (table below) | — |
| 7 | `Responder` executes the replies the handler returned, in order | — |
| 8 | Callback guarantee: if no answer was sent, one silent `answerCallbackQuery`; never a second answer. `QueryTooOld` is ignored | — |

Dispatch order, the same as the table in WP-52:

| Order | Update | Goes to |
| ----- | ------ | ------- |
| 1 | Command with a registered `CommandHandler` | that handler, with the payload after the command |
| 2 | Any other command of this bot | the command fallback, if registered (WP-52: interim list, then unknown command); else nothing, logged once |
| 3 | Callback: `CallbackCodec::decode()`, the handler of its action, `accepts()` true | that handler |
| 4 | Any other callback | `StaleCallbackHandler` |
| 5 | `Text`, `Voice`, `Contact`: when the current conversation has `awaiting` set and an input handler is registered for its kind | that input handler |
| 6 | `Text`, `Voice`, `Contact`, `OtherMessage` with a registered `MessageHandler` for the kind | that handler |
| 7 | Any other private message | the message fallback, if registered (WP-52); else nothing |
| 8 | `ChatMember` | its `MessageHandler`, if registered (WP-52) |

Classes:

| Class | Content |
| ----- | ------- |
| `App\Telegram\Updates\IncomingUpdate` | `kind()`, `chatType()`, `fromId()`, `languageCode()`, `isForwarded()`, `command()` → name and payload. A command is `/[a-z_]+`, optionally `@<username>`; another bot's username, trailing characters in the name or Cyrillic look-alikes make it plain text |
| `App\Telegram\Updates\BotContext` | user, locale, chat id, message id, update id, callback query id, `TelegramBot`, `conversation()`, the `answered` flag |
| `App\Telegram\Updates\HandlerRegistry` | `command(name, class)`, `commandFallback(class)`, `callback(action, class)`, `message(UpdateKind, class)`, `input(ConversationKind, awaiting, class)`, `messageFallback(class)`, `nonPrivate(class)`. Registering an action or a command twice throws at boot |
| `App\Telegram\Handlers\Contracts\CommandHandler` | `handle(BotContext $ctx, string $payload): array` (list of replies) |
| `App\Telegram\Handlers\Contracts\CallbackHandler` | `accepts(BotContext $ctx, CallbackPayload $p): bool` (argument validation, no side effect) and `handle(BotContext $ctx, CallbackPayload $p): array` |
| `App\Telegram\Handlers\Contracts\MessageHandler` | `handle(BotContext $ctx, IncomingUpdate $update): array` |
| `App\Providers\TelegramServiceProvider` | binds the router, the registry (singleton), the conversation store and the sticker registry; each later package adds its registrations here |

**Radar switch (DEC-51).** `command()`, `callback()`, `message()` and `input()` of `HandlerRegistry` take an
optional last argument `radar: true`, which marks the registration as an entry into the radar wizard or a radar
screen. When the dispatch (rows 1, 3, 5 and 6) selects a marked registration while
`config('radar.creation_enabled')` is false, the router does not call the handler: it returns one `SendMessage`
with `bot.radar.soon` — plus the silent answer for a callback — opens no conversation and writes nothing. A text
or a voice gets that message at most once a minute per user; a command and a callback always get it. With the
switch on the mark has no effect. The marks are set by the packages that own the handlers: WP-54 (`new`, `nw`,
`wz`, `tp`, the awaited amount) and WP-55 (`subs`, `sb`, the text and the voice handler). The interim replies of
WP-52 are not marked — a command whose package has not landed keeps its interim reply — and no `/start` payload
opens the wizard, so links need no mark.

A handler exception propagates to the job, which retries (WP-50). Handlers are therefore written against the target
state, so a second run changes nothing. When the job gives up, `UpdateRouter::failed()` sends `bot.common.error`
once to a private chat (a toast for a callback that can still be answered), with the support button when a support
contact is configured; it never throws. The router logs the update id, the kind and the internal user id only.

### Actor, access, limits

- **Actor.** `App\Services\Identity\UserResolver` of WP-40 has `fromInitData()` only. This package adds
  `fromBotUpdate(int $telegramUserId, ?string $languageCode, bool $isPremium, bool $hasUsername): User` to that
  same service: the same `createOrFirst` on `users.telegram_user_id`, then an update of `is_premium`,
  `has_username`, `language_code` and `last_seen_at`, and on creation the `user_settings` row with WP-40's
  defaults. One row also under ten concurrent first updates. It does not touch `has_photo` (updates carry no photo
  flag), `first_start_param` or `bot_chat_state` (both WP-52). `first_name`, `last_name` and `username` are not in
  the payload at all (WP-50).
- **Access.** `App\Services\Access\AccessGate::decide(User): AccessDecision` and `App\Enums\AccessState` of
  WP-40. Only `Blocked` stops bot handlers; every other state is ignored here, and domain writes enforce the gate
  in their own services.
- **Limits** (`config('bot.limits')`, values proposed by SEC-REQ-010): `interactive_per_minute` 30 (commands,
  callbacks, contacts, other messages), `free_text_per_hour` 30, `voice_per_hour` 10, `silent_after_per_minute` 100.
  `RateLimiter` keys `bot:{user id}:{class}`; fixed windows (the window is not extended by later hits). Over the
  limit the update is dropped. The first drop of a window sends `bot.common.slow_down` (a toast for a callback);
  later drops of a callback get a silent answer only; from the 100th update of a minute nothing is sent at all.

The specifications of WP-40 (users, resolver, gate, settings) and WP-50 (client, ledger, test kit) are authoritative
for names; if a name differs from the text here, use theirs and do not create a second service.

### Locale, text and formatting

- `App\Telegram\Rendering\BotLocale`: `fromLanguageCode(?string): string` maps `uz*` → `uz`, `en*` → `en`,
  everything else and a missing code → `ru`. `for(User $user, ?string $languageCode): string` returns the locale
  of `user_settings` when the user chose it (`locale_chosen_at` is set; `SettingsService::get()` of WP-40).
  Otherwise it returns the mapped code of the update, or of `users.language_code` when the update has none. The
  bot never writes the locale itself: a choice is stored by the language buttons of WP-52 through
  `SettingsService::patch()`. WP-40 creates the settings row with the same mapping (`uz*` → `uz`, `en*` → `en`,
  else `ru`, not marked chosen, `config/settings.php`); the bot does not read that stored default, because the
  client language can change before the user chooses. The bot only knows `ru`, `uz`, `en`;
  `uz_Latn` exists only at the legacy boundary of WP-41 (CF-006). This closes Q-BOT-035 by specification; an
  observation of the legacy bot with an English or Uzbek Telegram client would change the mapping, nothing else.
- `App\Telegram\Rendering\BotText`: `get(string $key, array $params, string $locale): string` over
  `__('bot.'.$key)`. Every parameter is escaped unless wrapped in `Html::raw()`. The four brand placeholders are
  added to every call and cannot be overridden. `choice()` uses `trans_choice` (three Russian forms, one Uzbek, two
  English). A missing key throws under `testing`; elsewhere it falls back to `ru` and logs one warning per key.
- `App\Telegram\Rendering\Html`: `escape()` (`&`, `<`, `>`, and `"` inside attributes), `bold()`, `italic()`,
  `link(url, text)` (only `https` on the allow-list `t.me`, the Mini App host, the site host; otherwise plain
  text), `expandableQuote()`, `raw()`, `truncate(html, limit)` (counts UTF-16 units as Telegram does, never cuts
  inside a tag or an entity, closes open tags, appends `…`). Limits: 4 096 for a text, 1 024 for a caption.
- `App\Telegram\Rendering\BotFormat`: `number()`, `money()`, `dateTime()`. Rules of BR-BOT-008: `ru` and `uz`
  `18 657` and `$1 000`, `en` `18,657`; every date and time in Asia/Tashkent. If an earlier package (expected
  WP-42) already has a server-side display formatter, `BotFormat` delegates to it and adds no second set of rules.
- Bold, italic and quotes are never in the catalogue. Renderers apply them with `Html`, so escaping has one place.

### Brand layer

`backend/config/brand.php` (create it; if an earlier package did, add only missing keys):

| Key | Value | Placeholder |
| --- | ----- | ----------- |
| `name` | `HOMI` | `:brand` |
| `bot_username` | `TELEGRAM_BOT_USERNAME` (the value `telegram.bot.username` reads) | `:bot` → `@<username>` |
| `support_username` | `config('telegram.support.username')`, env `TELEGRAM_SUPPORT_USERNAME` (both created by WP-11; no second env name) | `:support` → `@<username>`; empty string and one warning when unset |
| `site_url` | `BRAND_SITE_URL`, default `https://homi.uz` | `:site` → the host, for example `homi.uz` |
| `miniapp_url` | `TELEGRAM_MINIAPP_URL`, default in `.env.example` `https://app.homi.loc/` | — (buttons, WP-52) |
| `privacy_url` | `BRAND_PRIVACY_URL`; blank means `<site_url>/privacy` (WP-61 is authoritative for the path) | — |

`App\Support\Brand` gives typed access (`name()`, `bot()`, `support()`, `site()`, `miniAppUrl()`, `privacyUrl()`).

Every text and label of the audit that names the product, the bot, the support bot or a domain
(`rg -n -i "kvadro" docs/migration/04-telegram-bot-audit.md`):

| Key | Item | Legacy text or value | Replacement |
| --- | ---- | -------------------- | ----------- |
| `bot.profile.name` | display name (BOT-001), WP-58 | «kvadro² [brand → `:brand`] · поиск жилья» | `:brand · поиск жилья` |
| — (`brand.bot_username`) | username (BOT-001); links `t.me/KvadroAppBot?start=…` and `?startapp=…` | `@KvadroAppBot` [bot → `:bot`] | links are built in code from `brand.bot_username`, never stored in a text |
| `bot.buttons.open_app` | BTN-001 | `📱 Открыть kvadro²` [brand → `:brand`], EN `📱 Open kvadro²` | `📱 Открыть :brand`, `📱 Open :brand` |
| `bot.found.answers.here` | BTN-061 | `🎉 Да, через kvadro²` [brand → `:brand`] | `🎉 Да, через :brand` |
| `bot.found.question_hint` | TXT-BOT-068 | «Подскажите одной кнопкой — так мы поймём, помогает ли kvadro² [brand → `:brand`] искать.» | the same sentence with `:brand` |
| `bot.owner.no_listings` | TXT-BOT-078, reused by TXT-BOT-079 | «Объявлений с этим номером пока нет. Когда оно появится в одном из каналов, которые читает kvadro² [brand → `:brand`], метка встанет сама — обычно за несколько минут.» | the same paragraph with `:brand` |
| `bot.help.body` | TXT-BOT-082 | «✉️ Вопрос, жалоба или идея — напишите в поддержку: @KvadroSupportBot [support → `:support`]. Ответим там же.» | the same sentence with `:support` |
| `bot.buttons.write_support` | BTN-034 | the label `✉️ Написать в поддержку` has no brand word; its address is `https://t.me/KvadroSupportBot` [support] | address built from `brand.support_username` |
| `bot.profile.short_description` | TXT-BOT-003 (`tb:72–76`) | Russian line + support bot [support → `:support`] + site [site → `:site`], as the BOT-003 row describes it | scanned when copied |
| `bot.profile.description` | TXT-BOT-001 (`tb:57–68`) | links the support bot (BOT-011 row) | scanned when copied |
| `asset:description_picture` | TXT-BOT-002 | a banner with a phone mock-up; its two captions carry no brand word | new HOMI artwork from the product owner |
| — (`brand.miniapp_url`) | BTN-001, BTN-004, BTN-005, BTN-035, menu button BOT-004, Main Mini App BOT-005 | `app.kvadro.app` [domain] | `TELEGRAM_MINIAPP_URL` |
| — (`brand.privacy_url`) | privacy link of the profile (BOT-006) | target never opened | the landing privacy page |
| — (not a text) | poll answer code `kvadro` (BR-BOT-070) and its callback code `kv` | stored code | defined by the contract of WP-13 and WP-44; the catalogues do not contain it |

**To be scanned when copied.** The audit cites these texts only by `tb` line range, so their wording could not be
inspected here: TXT-BOT-001, TXT-BOT-003, TXT-BOT-006, TXT-BOT-007, TXT-BOT-016, TXT-BOT-017, TXT-BOT-020,
TXT-BOT-023 (`tb:429`), TXT-BOT-025 (`tb:449`), TXT-BOT-027, TXT-BOT-030, TXT-BOT-036, TXT-BOT-040, TXT-BOT-044,
TXT-BOT-060, TXT-BOT-074 (three languages), TXT-BOT-076, TXT-BOT-083, and the English command descriptions of
TXT-BOT-005 (`tb:96–105`). The BOT-011 row says the support bot is linked from the description, the bio and
`/privacy`. Whoever copies a text replaces each brand word by its placeholder and adds a row to the table above.

`BrandWordsTest` walks every key and value under `backend/lang/**` and fails on any of the strings `kvadro`,
`KvadroAppBot`, `KvadroSupportBot`, `kvadro.app` (compared without case), and also on `homi`, `t.me/` and `@`
followed by a letter, because HOMI's own name, links and handles must come from the brand layer too.

### Catalogues and the key map

`backend/lang/{ru,uz,en}/bot.php`, nested by area: `profile`, `commands`, `common`, `interim`, `welcome`,
`handoff`, `app`, `help`, `ping`, `wizard` (`frame`, `context`, `deal`, `object`, `rooms`, `area`, `budget`,
`amount`, `owner`, `tenant`, `pets`), `review`, `summary`, `radar`, `starter`, `tip`, `freetext`, `card`, `subs`,
`found`, `fav`, `settings`, `owner`, `privacy`, `digest`, `stale`, `toasts`, `buttons`.

Rules:

1. Copy each text verbatim from `04` §4.2, or from the `tb` lines it cites (`$KVADRO_ROOT/docs/telegram-bot.md`,
   read-only: copy text, never files). Emoji stay in the text.
2. Live values become placeholders (`:active`, `:new`, `:city`, `:n`, `:m`, `:price`, `:channel`, …). A count that
   changes the word form uses `trans_choice`. Numbers are formatted by `BotFormat`, never in the catalogue.
3. A part the renderer formats on its own (a bold heading, an italic last line, a repeated row) is its own key.
4. A text never observed in legacy gets a draft and the comment `// spec — <question id>`. Its owner package
   finalises the wording with the product owner.
5. The same words in different contexts get one key per context (`✖️ Отмена` exists four times), because another
   language may need different words.
6. The `✅ ` prefix of a selected option is added by the keyboard builder, never stored.
7. Key names are `bot.<area>.<name>` in snake case, without audit ids and without brand words.
8. `uz` is Latin script with `ʻ` (U+02BB) in `oʻ` and `gʻ` and `ʼ` (U+02BC) for the glottal stop; never ASCII `'`
   or `‘`; no Cyrillic except the label `🇷🇺 Русский`. `en` uses English place names and sentence case on
   buttons.

`backend/tests/Fixtures/Bot/txt-keys.json` holds the map below in the form
`{"texts": {"<text id>": ["<key>", …]}, "buttons": {"<button id>": ["<key>", …]}, "new": ["<key>", …]}`, plus
`"decided": ["<id>", …]` for the ids whose wording a decision changed — DEC-54: BTN-016, and any text id whose
sample in `texts.ru.json` shows the whole-city form of the summary row.
`backend/tests/Fixtures/Bot/texts.{ru,uz,en}.json` hold the verbatim texts by id with sample parameters: `ru` for
every text quoted in `04` §4.2, `uz` and `en` only for captured texts. `translation-status.json` maps every key of
`uz` and `en` to `captured`, `draft` or `proofread`.

Key map of the 88 texts. "Owner" is the package that shows the text and checks its parity.

| Key (`bot.` + …) | Text | Owner | Note |
| ---------------- | ---- | ----- | ---- |
| `profile.description` | TXT-BOT-001 | WP-58 | one trilingual text; set in the profile, not sent in chat |
| `asset:description_picture` | TXT-BOT-002 | WP-58 | an image, not a catalogue key |
| `profile.short_description` | TXT-BOT-003 | WP-58 | |
| `profile.menu_button` | TXT-BOT-004 | WP-58 | `Открыть` |
| `commands.{start,app,new,subs,fav,settings,owner,help,privacy,ping}` | TXT-BOT-005 | WP-58 | EN captured; UZ draft |
| `welcome.counters`, `welcome.heading`, `welcome.body` | TXT-BOT-006 | WP-52 | `:active`, `:new`, `:cities`; bold parts are their own keys |
| the same keys, locale `en` | TXT-BOT-007 | WP-52 | captured EN text; city names through `:cities` (fix of LB-BOT-013) |
| `handoff.body` | TXT-BOT-008 | WP-52 | `:title` |
| `app.body` | TXT-BOT-009 | WP-52 | |
| `wizard.frame.step`, `wizard.frame.step_first`, `wizard.context.*` | TXT-BOT-010 | WP-54 | `:n`, `:m` |
| `radar.edit_step` | TXT-BOT-011 | WP-55 | rendered by the wizard engine of WP-54 |
| `wizard.deal.question` | TXT-BOT-012 | WP-54 | |
| `wizard.object.question` | TXT-BOT-013 | WP-54 | |
| `wizard.rooms.question` | TXT-BOT-014 | WP-54 | |
| `wizard.area.question` | TXT-BOT-015 | WP-54 | |
| `wizard.area.hint_tashkent` | TXT-BOT-016 | WP-54 | |
| `wizard.area.hint_region`, `hint_city`, `hint_kokand` | TXT-BOT-017 | WP-54 | variants (a), (b), (c); `:city` |
| `wizard.budget.question.{rent_long,rent_daily,sale}` | TXT-BOT-018 | WP-54 | |
| `wizard.budget.median_month`, `median_total` | TXT-BOT-019 | WP-54 | `:city`, `:price` |
| `wizard.budget.below_market_hint` | TXT-BOT-020 | WP-54 | |
| `wizard.amount.prompt` | TXT-BOT-021 | WP-54 | |
| `wizard.amount.invalid` | TXT-BOT-022 | WP-54 | |
| `wizard.owner.question`, `wizard.owner.hint` | TXT-BOT-023 | WP-54 | |
| `wizard.tenant.question`, `wizard.tenant.hint` | TXT-BOT-024 | WP-54 | |
| `wizard.pets.question`, `wizard.pets.hint` | TXT-BOT-025 | WP-54 | the `🆕` prefix is legacy text |
| `wizard.cancelled` | TXT-BOT-026 | WP-54 | also shown by WP-55 |
| `review.title`, `summary.*` | TXT-BOT-027 | WP-54 | one key per summary row |
| `review.flow.per_day`, `per_week`, `none` | TXT-BOT-028 | WP-54 | plural forms |
| `review.too_broad` | TXT-BOT-029 | WP-54 | |
| `review.almost_nothing` | TXT-BOT-030 | WP-54 | |
| `review.broaden_title`, `review.broaden_option` | TXT-BOT-031 | WP-54 | |
| `review.closing` | TXT-BOT-032 | WP-54 | |
| `radar.edit_title` | TXT-BOT-033 | WP-55 | |
| `radar.saved`, `radar.saved_matches` | TXT-BOT-034 | WP-54 | `:n`; also shown by WP-55 |
| `starter.title`, `starter.row`, `starter.footer` | TXT-BOT-035 | WP-54 | |
| `tip.body` | TXT-BOT-036 | WP-54 | |
| `tip.instant` | TXT-BOT-037 | WP-54 | |
| `tip.digest` | TXT-BOT-038 | WP-54 | spec — Q-BOT-010 |
| `stale.alert` | TXT-BOT-039 | WP-51 | shown by every package with callbacks |
| `freetext.review_title` | TXT-BOT-040 | WP-55 | |
| `freetext.note_deal_default` | TXT-BOT-041 | WP-55 | |
| `freetext.note_unknown_place` | TXT-BOT-042 | WP-55 | `:place` |
| `freetext.not_understood` | TXT-BOT-043 | WP-55 | shown by WP-52 until WP-55 lands |
| `card.body.*` | TXT-BOT-044 | WP-53 | one key per card row; also the radar push of WP-57 |
| `card.venue.title`, `card.venue.address` | TXT-BOT-045 | WP-53 | |
| `card.rented.line` | TXT-BOT-046 | WP-53 | |
| `card.withdrawn` | TXT-BOT-047 | WP-57 | spec — Q-BOT-031 |
| `card.fav.added` | TXT-BOT-048 | WP-53 | toast |
| `card.fav.removed` | TXT-BOT-049 | WP-53 | toast |
| `card.photos_unavailable` | TXT-BOT-050 | WP-53 | toast |
| `card.hide.prompt` | TXT-BOT-051 | WP-53 | toast |
| `card.hide.saved` | TXT-BOT-052 | WP-53 | toast |
| `card.agent.voted` | TXT-BOT-053 | WP-53 | toast |
| `card.agent.already` | TXT-BOT-054 | WP-53 | toast |
| `card.rented.marked` | TXT-BOT-055 | WP-53 | toast |
| `card.rented.undone` | TXT-BOT-056 | WP-53 | toast |
| `subs.empty` | TXT-BOT-057 | WP-55 | |
| `subs.list_title`, `subs.list_hint` | TXT-BOT-058 | WP-55 | `:k` |
| `subs.title.*` | TXT-BOT-059 | WP-55 | parts of the radar title |
| `subs.card.*` | TXT-BOT-060 | WP-55 | |
| `subs.delete_confirm` | TXT-BOT-061 | WP-55 | `:title` |
| `subs.paused` | TXT-BOT-062 | WP-55 | toast |
| `subs.resumed` | TXT-BOT-063 | WP-55 | toast |
| `subs.mode_digest` | TXT-BOT-064 | WP-55 | toast |
| `subs.mode_instant` | TXT-BOT-065 | WP-55 | toast |
| `subs.hidden_shown` | TXT-BOT-066 | WP-55 | toast |
| `subs.deleted` | TXT-BOT-067 | WP-55 | toast |
| `found.question`, `found.question_hint` | TXT-BOT-068 | WP-55 | names the product |
| `found.where`, `found.where_hint` | TXT-BOT-069 | WP-55 | |
| `found.thanks` | TXT-BOT-070 | WP-55 | |
| `found.searching`, `found.stopped` | TXT-BOT-071 | WP-55 | spec — Q-BOT-006 |
| `fav.empty` | TXT-BOT-072 | WP-53 | |
| `fav.title`, `fav.row`, `fav.footer` | TXT-BOT-073 | WP-53 | |
| `settings.panel.*` | TXT-BOT-074 | WP-56 | captured in three languages; fixes of LB-BOT-010 and LB-BOT-011 |
| `toasts.saved` | TXT-BOT-075 | WP-56 | `Сохранил ✅`, `Saqlab qoʻydim ✅`, `Saved ✅`; also shown by WP-54 and WP-55 |
| `owner.intro` | TXT-BOT-076 | WP-56 | |
| `owner.declined` | TXT-BOT-077 | WP-56 | |
| `owner.verified`, `owner.no_listings` | TXT-BOT-078 | WP-56 | names the product |
| `owner.status` (with `owner.no_listings`) | TXT-BOT-079 | WP-56 | |
| `owner.removed` | TXT-BOT-080 | WP-56 | |
| `owner.verified_with_listings`, `owner.refused_realtor`, `owner.refused_many_flats`, `owner.not_own_contact` | TXT-BOT-081 | WP-56 | spec — Q-BOT-008 |
| `help.body` | TXT-BOT-082 | WP-52 | names the support bot |
| `privacy.text` | TXT-BOT-083 | WP-56 | legal text: copied verbatim, changed only by WP-56 with the product owner |
| `privacy.delete_confirm`, `privacy.deleted` | TXT-BOT-084 | WP-56 | spec — Q-BOT-001 |
| `ping.details` | TXT-BOT-085 | WP-52 | `🏓 pong · БД: ок · PostGIS: :version` |
| `card.radar_line` | TXT-BOT-086 | WP-57 | spec — Q-BOT-002; the body is `card.body.*` |
| `digest.header`, `digest.header_morning`, `digest.row`, `digest.more` | TXT-BOT-087 | WP-57 | spec — Q-BOT-003 |
| `content:broadcast` | TXT-BOT-088 | WP-57 | no catalogue key: the operator supplies the text per broadcast (Q-BOT-004) |

Button labels of `04` §4.1 are keyed here as well, verbatim, so the brand scan and the proofreading list are complete
in one PR. Labels that are data (city and district names, amounts, numbers, radar titles) have no key.

| Keys (`bot.` + …) | Buttons | Owner |
| ----------------- | ------- | ----- |
| `buttons.open_app`, `radar_on`, `open_flat`, `open_application`, `write_support` | BTN-001, BTN-002, BTN-004, BTN-005, BTN-034 | WP-52 |
| `buttons.lang_ru`, `lang_uz`, `lang_en` (same in every locale) | BTN-003, BTN-070 | WP-52, WP-56 |
| `buttons.back`, `buttons.new_radar` | BTN-024, BTN-030 | WP-54 |
| `wizard.deal.{rent_long,rent_daily,sale}`, `wizard.object.{flat,house,flat_or_house,room,commercial,land}`, `wizard.rooms.any` | BTN-006 … BTN-010 | WP-54 |
| `wizard.area.{zone_center,zone_near_center,near_metro,whole_city,done}` | BTN-012 … BTN-014, BTN-016, BTN-017 | WP-54 |
| `wizard.budget.{preset,any,own_amount,below_market}` | BTN-018 … BTN-020 | WP-54 |
| `wizard.owner.{any,no_agents,owners}`, `wizard.tenant.{family,men,women,any}`, `wizard.pets.{not_forbidden,allowed,any}`, `wizard.cancel` | BTN-021 … BTN-023, BTN-025 | WP-54 |
| `review.edit.{deal,object,rooms,area,budget,owner,tenant,pets}`, `review.relax.with_agents`, `review.save` | BTN-026 … BTN-028 | WP-54 |
| `radar.open_list`, `tip.button_instant`, `tip.button_digest` | BTN-029, BTN-032, BTN-033 | WP-54 |
| `card.buttons.{open_in_app,map,original,more_photos,fav_add,fav_on,agent,rented,not_rented,hide_similar}` | BTN-035 … BTN-044 | WP-53 |
| `card.hide.{channel,district,realtor,cancel}` | BTN-045 … BTN-048 | WP-53 |
| `subs.row_active`, `subs.row_paused`, `subs.buttons.{pause,resume,mode_digest,mode_instant,show_hidden,edit,delete,delete_yes,delete_cancel,to_list}`, `radar.edit_save` | BTN-049 … BTN-060 | WP-55 |
| `found.answers.{here,elsewhere,searching,stopped}`, `found.where_options.{telegram,olx,site,agent,friends,street,other}` | BTN-061 … BTN-065 | WP-55 |
| `settings.headers.{quiet,digest,language,currency,news}`, `settings.quiet.off`, `settings.digest.and`, `settings.currency.{usd,uzs}`, `settings.news.{on,off}` | BTN-067 … BTN-069, BTN-071, BTN-072 | WP-56 |
| `owner.share_number`, `owner.cancel`, `owner.remove`, `privacy.delete_button` | BTN-073 … BTN-076 | WP-56 |

Without a key: BTN-011 and BTN-015 (names from `ReferenceSource`), BTN-031 (numbers), BTN-066 (the row
`fav.row`). The realtor row BTN-047 was never shown in legacy; its label is a draft (`// spec — Q-BOT-009`).

Shared keys legacy does not have (`"new"` in the fixture). Russian wording proposed here, in the voice of the legacy
texts; `uz` and `en` are drafts:

| Key | Russian text | Used by |
| --- | ------------ | ------- |
| `bot.common.source_unavailable` | «Не смог загрузить объявления — источник сейчас не отвечает. Попробуйте ещё раз через минуту.» | every handler that reads the listing source |
| `bot.common.error` | «Что-то сломалось на моей стороне — простите. Попробуйте ещё раз чуть позже.» (with the support button) | the router, after a failed update |
| `bot.common.slow_down` | «Слишком много запросов — подождите минуту.» | the router |
| `bot.common.unknown_command` | «Не знаю такой команды. Новый радар — /new, список — /subs, избранное — /fav, настройки — /settings, помощь — /help.» | WP-52, behind its flag |
| `bot.interim.use_app` | «Этот раздел в боте ещё не готов. Всё то же самое уже есть в приложении:» | `InterimHandler` of WP-52 |
| `bot.welcome.demo_notice` | «🧪 Часть разделов пока работает на тестовых данных — объявления в них ненастоящие.» | WP-52 |
| `bot.card.demo_marker` | «🧪 Демо-данные» (the wording of `demo.label` in the Mini App, WP-20) | WP-53, WP-57 |
| `bot.radar.soon` | «Радар скоро заработает. Мы включим уведомления о новых объявлениях в ближайшее время.» (the two sentences of `radar.soon.*` in the Mini App, WP-30; drafts: `uz` «Radar tez orada ishga tushadi. Yangi eʼlonlar haqidagi bildirishnomalarni yaqin orada yoqamiz.», `en` «Radar is coming soon. We’ll turn on alerts about new listings shortly.») | the router, while radars are switched off (DEC-51) |

Glossary fixes applied to the captured Uzbek and English texts:

| Defect | Legacy | Catalogue |
| ------ | ------ | --------- |
| Two dots (LB-BOT-010) | `oʻch..` | `oʻch.` |
| Two terms for quiet hours (LB-BOT-011) | header `Sokinlik soatlari`, text `Sokin soatlar` | `Sokin soatlar` in the header and in the text (the proofreader confirms) |
| Currency label (LB-BOT-012) | UZ `Sumi`, EN `Soʻm` | UZ `Soʻm` on the button and `soʻm` in running text; EN `Soʻm` |
| City names in the English welcome (LB-BOT-013) | `Toshkent`, `Andijon`, `Qoʻqon`, `Fargʻona` next to «Tashkent Region» | none in the catalogue: the welcome takes the names through `:cities` (WP-52 renders them from the reference data) |
| «Весь Фергана» (LB-BOT-009) | `Весь <город>` | `:city целиком` in `ru` (DEC-54), on the button `wizard.area.whole_city` and in the whole-city form of the `📍` summary row; `uz` `Butun :city` and `en` `All of :city` are drafts for the proofreader (Q-BOT-014). The name comes from the city dictionary through `:city` |

### Replies and keyboards

`backend/app/Telegram/Replies/` holds readonly reply objects and one `Responder`:

| Reply | Bot API call |
| ----- | ------------ |
| `SendMessage(text, keyboard?, silent = false)` | `sendMessage`, `parse_mode: HTML` |
| `EditMessage(text, keyboard?)` | `editMessageText` on the pressed message |
| `EditKeyboard(keyboard?)` | `editMessageReplyMarkup`; `null` removes the keyboard |
| `Toast(text)`, `Alert(text)`, `SilentAnswer` | `answerCallbackQuery` with text, with `show_alert: true`, or empty |
| `SendSticker(name)` | `sendSticker` through `StickerRegistry` |
| `React(emoji)` | `setMessageReaction` |
| `SendVenue(…)`, `SendMediaGroup(…)` | `sendVenue`, `sendMediaGroup` |

Later packages add reply classes to the same folder when they need one (for example a photo with a caption, WP-53).

`Responder::send(BotContext $ctx, array $replies)`: at most one of `Toast`, `Alert`, `SilentAnswer` per callback (a
second one throws under `testing`); `MessageNotModified` is success; `MessageNotFound` and `MessageCantBeEdited` on
an edit are logged at `info` and skipped; `ChatUnreachable` dispatches the event
`App\Events\Telegram\ChatUnreachable` (the class exists since WP-46, whose listener deletes the user's unsent
outbox rows; use its constructor as it is; WP-52 adds a second listener) and stops the list; a failed sticker is
skipped with one warning per day and the next reply is still sent.

`App\Telegram\Keyboards\InlineKeyboard` (builder): `row()`, `callback(label, data)`, `url(label, url)` (only `https`
on the allow-list), `webApp(label, url)` (only `brand.miniapp_url`), `primary()`, `danger()` (the Bot API field
`style`), `selected(bool)` (prefix `✅ `), `maxPerRow(n)`. It refuses `callback_data` longer than 64 bytes when the
keyboard is built. `App\Telegram\Keyboards\ReplyKeyboard`: `requestContact(label)`, `text(label)`, `remove()`.

### Callback grammar and registry

```text
k1:<action>[:<arg>]{0,4}      whole string at most 64 bytes (UTF-8)
action  [a-z]{2,4}
arg     [A-Za-z0-9_-]{1,26}
```

- The prefix `k1` is the grammar version, `:` the only separator. One regular expression checks the whole string
  before any split. Listing numbers, dictionary ids and amounts travel in base 36; a radar travels as its ULID (26
  characters, the primary key of WP-45), which is why an argument may be 26 characters long.
- `App\Telegram\Callbacks\CallbackCodec`: `encode(action, ...args): string`, `decode(string): ?CallbackPayload`,
  `toBase36(int)`, `fromBase36(string)`. `CallbackPayload` holds the action and the arguments.
- An action belongs to exactly one handler, registered with `HandlerRegistry::callback()`. A handler never trusts an
  id: it finds a radar through the actor's relations and a listing through the listing source, and "not found" and
  "not yours" look the same (SEC-REQ-014). Buttons that change a state carry the target state (`fv:1`, `fv:0`), so
  pressing an older copy sets that state instead of toggling (BR-BOT-010; the fix of LB-BOT-007 is in WP-53).
- There is no legacy decoder and no `LegacyCallbackDecoder` class.

`StaleCallbackHandler` answers `Alert(bot.stale.alert)` and `EditKeyboard(null)` on the pressed message, ignores a
failed removal, and writes nothing. It is used for: a string the codec cannot decode; an action without a handler; a
version other than `k1`; `accepts()` false; a wizard button whose `sid` is not the current conversation's; an object
that does not exist for the actor. For the last case a handler returns
`StaleCallbackHandler::replies(bool $removeKeyboard = true)`; WP-53 passes `false` for a card whose listing is not
found, so the card keeps its buttons.

Registry of actions. Each package registers its rows and adds them to `docs/infrastructure/telegram-webhook.md`.

| Action | Data | Registered by |
| ------ | ---- | ------------- |
| `lg` | `k1:lg:<ru, uz or en>` | WP-52 (language buttons of the welcome and of `/settings`) |
| `nw` | `k1:nw` (start a wizard) | WP-52 with `InterimHandler`, then WP-54 |
| `wz` | `k1:wz:<sid>:<op>[:<value>]`; operations `s1:<rl, rd or sl>`, `s2:<object>`, `s3:<1, 2, 3, 4p, 12, 23 or any>`, `ct:<city>`, `zn:<center, near_center or metro>`, `ds:<district>`, `wc`, `dn`, `s5:<amount or any>`, `bm`, `am`, `s6:<any, na or ow>`, `s7:<fa, me, wo or any>`, `s8:<nf, al or any>`, `bk`, `cx`, `ed:<step>`, `rx:<code>`, `sv` | WP-54; WP-55 uses the same action in edit mode |
| `tp` | `k1:tp:<radar>:<in or dg>` (first-radar tip) | WP-54 |
| `ln` | `k1:ln:<listing number>:<f, s or n>[:<radar>]` (open a card by number; the origin is the `/fav` list, a starter list or another number button) | WP-53; reused by the starter list of WP-54 and the digest of WP-57 |
| `fl` | `k1:fl:<page>` (`/fav` paging) | WP-53 |
| `cd` | `k1:cd:<listing number>:<op>[:<value>]`; operations `map`, `ph`, `fv:<1 or 0>`, `rt:<1 or 0>`, `ag:<1 or 0>`, `hs`, `hc[:<radar>]`, `hd[:<radar>]`, `ha[:<radar>]`, `hx`, `ct` (show the author's number, DEC-52) (the channel, district and author are read from the listing, never from the data) | WP-53 |
| `sb` | `k1:sb:<radar or 0>:<op>[:<value>]`; operations `ls` (with radar `0`), `op`, `ps`, `on`, `dg`, `in`, `ra`, `ray`, `hr`, `rr:<rule>`, `ed`, `dl`, `dly`, `dln` | WP-55 |
| `fp` | `k1:fp:<p or d>:<hm, el, se or st>` and `k1:fp:w:<tg, ol, si, ag, fr, st or ot>` (the trigger only: `found_answers` of WP-44 has no radar column) | WP-55 |
| `st` | `k1:st:<q, d, c or n>:<value>` | WP-56 |
| `nop` | `k1:nop` (settings section headers, answered silently) | WP-56 |
| `ow` | `k1:ow:<rm, rmy or rmn>` | WP-56 |
| `pv` | `k1:pv:<dl, dly or dln>` | WP-56 |
| `rq` | `k1:rq:<request ULID>:<gv, dc, rf, ra, ud or lt>` (the owner's answer to a contact request) | WP-89 (*added by the owner-cabinet plan*) |
| `mo` | `k1:mo:<owner listing ULID>:<hd, hdy or hdn>` (the operators' «Снять») | WP-89 (*added by the owner-cabinet plan*) |

The rows of WP-52 and WP-53 repeat their specifications; the others come from the earlier task files. The
specification of the registering package is authoritative for its operations; the grammar and the rule "one action,
one handler" are fixed here.

### Conversation store

One active conversation per user, on the server, with a TTL (`.ai/agents/telegram-bot-engineer.md` rule 5).

| Item | Contract |
| ---- | -------- |
| Store | cache store `telegram.conversation.store`, default `redis`, `array` under `testing` |
| Key | `bot:conv:{bot_id}:{telegram_user_id}` |
| Payload (JSON) | `{kind, sid, message_id, step, data, awaiting, edit_radar, updated_at}` |
| `kind` | enum `App\Enums\Telegram\ConversationKind`: `WizardNew`, `WizardEdit`, `Owner`, `PrivacyDelete` |
| `sid` | six random characters of `[a-z0-9]`, new for every `begin()`; every button of the conversation carries it |
| `message_id` | the message the conversation edits (BR-BOT-016) |
| `data` | the draft of the owning package: ids and enum values only; never a name, a phone or a message text |
| `awaiting` | `null`, or the free-form input the conversation waits for (`amount` in the wizard, `contact` in `/owner`); the router sends matching messages to the registered input handler |
| TTL | `telegram.conversation.ttl` from `TELEGRAM_CONVERSATION_TTL`, default 1 800 s; every `update()` refreshes it |
| API | `begin(kind, messageId, data = [], editRadar = null): Conversation` (replaces any current one), `current(): ?Conversation`, `update(Conversation)`, `forget()`, `matches(string $sid): bool` |

**What makes a wizard message outdated** (Q-BOT-018, closed by specification): its buttons get the alert of
TXT-BOT-039 when (a) the user started another conversation of any kind after it (superseded), (b) the conversation
was idle longer than the TTL (expired), or (c) no conversation exists (finished, cancelled, erased, or Redis was
flushed). In each case `matches($sid)` is false. An observation of the legacy bot (start wizard A, then B, press A;
leave one wizard for a day) would change only the TTL value or drop case (a).

- Plain commands without state (`/subs`, `/settings`, `/fav`, `/start`) do not touch the conversation: an open
  wizard keeps working after a repeated `/start` (BR-BOT-011).
- Two presses of one user are serialised by the per-chat order of WP-50, so read-modify-write needs no lock.
- `forget()` is called by the erasure flow of WP-56.
- Difference from KV-TG-012: the typed-amount wait is the field `awaiting` of the wizard conversation, not a kind of
  its own, because a second conversation would replace the wizard it belongs to.

### Assets

`config('telegram.assets')`:

| Entry | Value | Used by |
| ----- | ----- | ------- |
| `stickers.welcome`, `stickers.radar_saved` (BOT-010) | `{set: <sticker set name>, index: <n>}` (a public set works for every bot; the set name may come from `TELEGRAM_STICKER_SET`) or `{file: resources/telegram/stickers/<name>.webp}`, or `null` | WP-52 (`SendSticker('welcome')`), WP-54 (`SendSticker('radar_saved')`) |
| `profile.avatar` (BOT-009), `profile.description_picture` | repository path of the source file, or `null` | the BotFather checklist of WP-58; no Bot API call sets them |

`App\Telegram\Assets\StickerRegistry::fileId(string $name): ?string`: cache key `bot:asset:{bot_id}:{name}` without
expiry, because a `file_id` belongs to one bot. A `set` entry calls `getStickerSet` once and takes the sticker at
`index`. A `file` entry returns `null` the first time, so `SendSticker` uploads the file and stores the `file_id`
from Telegram's answer. A `400` on a cached id drops the entry. `telegram:assets:refresh` clears the entries of the
current bot and is safe in every environment.

The legacy mascot stickers, avatar and banner belong to the legacy product and are not copied (`25` §2 rule 3).
HOMI's artwork is a product-owner input (Q-BOT-022, closed by specification): until it exists the entries are `null`
and the bot sends text only. Asset files enter the repository only with the product owner's permission.

### Conversation runner

`backend/tests/Support/Bot/Conversation.php`, helper `conversation(user: 'A', locale: 'ru')` in
`backend/tests/Pest.php`. An update goes in through the real webhook route (`UpdateFactory::post()`, queue `sync`);
`FakeBotApi` captures what comes out.

| Group | Methods |
| ----- | ------- |
| Input | `send(text)`, `press(label)` (finds the button in the last captured keyboard and posts its `callback_data`), `pressOn(messageIndex, label)` (an older message), `pressData(data)` (forged data), `sendContact()`, `sendForwardedContact()`, `sendVoice(duration)`, `sendPhoto()`, `chatMember(status)`, `wait(minutes)` (time travel), `as(user)` |
| Expectations | `expectNew(text, keyboard)`, `expectEdit(text, keyboard)`, `expectToast(key)`, `expectAlert(key)`, `expectSilent()`, `expectSticker(name)`, `expectReaction(emoji)`, `expectKeyboardRemoved()`, `expectNothing()` |
| Text matchers | a catalogue key with parameters, or a text id resolved through `txt-keys.json`; compared in the conversation's locale with whitespace normalised |
| Always asserted | every callback answered exactly once; the validators of `FakeBotApi`; `message_id` continuity for edits |

Transcripts are JSON files in `backend/tests/Fixtures/Bot/transcripts/`, run by `TranscriptTest`:

```json
{
  "name": "stale-callback",
  "covers": {"handlers": ["BOT-023"], "buttons": [], "texts": ["TXT-BOT-039"]},
  "oracle": "audit",
  "user": "A",
  "locale": "ru",
  "steps": [
    {"in": {"press_data": "garbage"},
     "out": [{"call": "answerCallbackQuery", "text": "bot.stale.alert", "show_alert": true},
             {"call": "editMessageReplyMarkup", "keyboard": null}]}
  ]
}
```

`covers` feeds the coverage test of WP-58. `oracle` is `audit` for observed behaviour and `spec` for behaviour closed
by specification. `in` takes one input method in snake case; `out` lists the expected calls in order.

## Files

New:

- `backend/config/brand.php`, `backend/config/bot.php` (`limits`; a comment block on the `devNNN` convention)
- `backend/app/Support/Brand.php`
- `backend/app/Telegram/Updates/{UpdateRouter,IncomingUpdate,BotContext,HandlerRegistry}.php`
- `backend/app/Enums/Telegram/{UpdateKind,ConversationKind}.php`
- `backend/app/Telegram/Handlers/Contracts/{CommandHandler,CallbackHandler,MessageHandler}.php`
- `backend/app/Telegram/Handlers/StaleCallbackHandler.php`
- `backend/app/Providers/TelegramServiceProvider.php` (`backend/app/Events/Telegram/ChatUnreachable.php` is not
  new: WP-46 created it)
- `backend/app/Telegram/Rendering/{BotLocale,BotText,BotFormat,Html}.php`
- `backend/lang/{ru,uz,en}/bot.php`
- `backend/app/Telegram/Replies/{SendMessage,EditMessage,EditKeyboard,Toast,Alert,SilentAnswer}.php`,
  `backend/app/Telegram/Replies/{SendSticker,React,SendVenue,SendMediaGroup,Responder}.php`
- `backend/app/Telegram/Keyboards/{InlineKeyboard,ReplyKeyboard}.php`
- `backend/app/Telegram/Callbacks/{CallbackCodec,CallbackPayload}.php`
- `backend/app/Telegram/Conversations/{ConversationStore,Conversation}.php`
- `backend/app/Telegram/Assets/StickerRegistry.php`,
  `backend/app/Console/Commands/Telegram/AssetsRefreshCommand.php`
- `backend/tests/Support/Bot/Conversation.php`
- `backend/tests/Fixtures/Bot/{txt-keys,translation-status,texts.ru,texts.uz,texts.en}.json`
- `backend/tests/Fixtures/Bot/transcripts/{stale-callback,first-contact-locale,rate-limit,blocked-user}.json`,
  `backend/tests/Fixtures/Bot/transcripts/radar-soon.json`
- `backend/tests/Feature/Bot/{UpdateRouterTest,StaleCallbackTest,ConversationSelfTest,TranscriptTest}.php`
- `backend/tests/Unit/Telegram/{IncomingUpdateTest,BotLocaleTest,BotTextTest,BotFormatTest,HtmlTest}.php`,
  `{RuCatalogueTest,UzEnCatalogueTest,BrandWordsTest}.php`,
  `{KeyboardBuilderTest,ResponderTest,CallbackCodecTest,ConversationStoreTest,StickerRegistryTest}.php`
- `backend/tests/Unit/I18n/{CatalogueParityTest,RussianPluralsTest}.php`,
  `backend/tests/Feature/I18n/MissingKeyFallbackTest.php` (extend them if an earlier package created them)
- `backend/tests/Arch/TelegramArchTest.php`, `backend/tests/Pgsql/FirstContactRaceTest.php`

Changed:

- `backend/bootstrap/providers.php` (the new provider), `backend/config/telegram.php` (`conversation.store`,
  `conversation.ttl`, `assets`), `backend/phpunit.xml` (test suite `Arch`; `TELEGRAM_MINIAPP_URL` and
  `TELEGRAM_SUPPORT_USERNAME` test values; `TELEGRAM_BOT_USERNAME` is there since WP-50), `backend/tests/Pest.php`
  (helper)
- `backend/app/Services/Identity/UserResolver.php` of WP-40 (new method `fromBotUpdate()`),
  `backend/app/Providers/AppServiceProvider.php` (the `NullUpdateProcessor` binding of WP-50 is removed; the class
  stays for tests)
- `docs/infrastructure/telegram-webhook.md`: sections "Handler registry", "Reply conventions",
  "callback_data registry", "Conversation state", "Assets"
- Shared files, in a small separate PR reviewed by the other developer, merged first: `backend/.env.example`
  (`TELEGRAM_MINIAPP_URL=https://app.homi.loc/`, `TELEGRAM_CONVERSATION_TTL=1800`, `TELEGRAM_STICKER_SET=`,
  `BRAND_SITE_URL=https://homi.loc`, `BRAND_PRIVACY_URL=`; `TELEGRAM_SUPPORT_USERNAME` is there since WP-11) and the
  names in
  `docs/infrastructure/environments.md`; skip a name an earlier package already added

## Steps

Create classes with `php artisan make:* --no-interaction`. Write the tests of a step first. Run
`vendor/bin/pint --dirty --format agent` after every PHP edit.

1. Shared-file PR: the env names.
2. `config/brand.php`, `App\Support\Brand`, `config/bot.php` with `limits`.
3. `BotLocale` with `BotLocaleTest`; `Html` with `HtmlTest` (the corpus of SEC-REQ-020); `BotFormat` with its test.
4. `backend/lang/{ru,uz,en}/bot.php` with the eight shared keys only; `BotText` with `BotTextTest`;
   `CatalogueParityTest`, `RussianPluralsTest`, `MissingKeyFallbackTest`.
5. The Russian catalogue: all 88 texts and every button label, `txt-keys.json`, `texts.ru.json`, `RuCatalogueTest`.
   Record in the PR which `tb` lines each long text came from. The whole-city label is written in its decided
   wording (DEC-54), and `txt-keys.json` lists the ids it touches under `"decided"`, so the test compares them
   with that wording and not with the audit's.
6. `BrandWordsTest`; replace every brand word it reports and extend the brand table of this specification.
7. The Uzbek and English catalogues: captured texts with the glossary fixes, drafts for the rest,
   `translation-status.json`, `texts.{uz,en}.json`, `UzEnCatalogueTest`. List the draft keys in the PR for the
   proofreader.
8. `UpdateKind`, `IncomingUpdate` with `IncomingUpdateTest`.
9. `HandlerRegistry`, the handler contracts, `BotContext`, `UpdateRouter` (actor, guard, limits, dispatch, the
   radar switch, failure notice), `TelegramServiceProvider`. `UpdateRouterTest` uses handlers defined in the test.
10. `TelegramArchTest`, part 1 (formatting and translation rules). **End of part A.**
11. Reply objects and `Responder` with `ResponderTest`; the dispatch of the existing event `ChatUnreachable`.
12. `InlineKeyboard`, `ReplyKeyboard` with `KeyboardBuilderTest`; `TelegramArchTest`, part 2.
13. `CallbackCodec`, `CallbackPayload` with `CallbackCodecTest` (round trip and length for every registered shape).
14. `ConversationKind`, `ConversationStore`, `Conversation` with `ConversationStoreTest`.
15. `StaleCallbackHandler` and its place in the router; `StaleCallbackTest`.
16. `StickerRegistry`, the sticker path of `Responder`, `telegram:assets:refresh`, `StickerRegistryTest`.
17. The conversation runner, `ConversationSelfTest` against a toy handler (echo, edit, keyboard, alert, sticker),
    `TranscriptTest` and the four transcripts.
18. `docs/infrastructure/telegram-webhook.md`: the five sections, with the tables of this specification.
19. `make ci-backend`; review of the guard, the limits and the codec by the `security-reviewer` agent; PR description
    with the env names, the draft keys and the list of texts whose wording is a specification.

## Behaviour to reproduce

Run every scenario in `ru`, `uz` and `en`.

### First contact and language (BOT-026)

| # | Trigger | Result |
| - | ------- | ------ |
| 1 | The first update of a Telegram account | one `users` row (Telegram id, `language_code`, `is_premium`, `has_username`) and its `user_settings` row; no name (BR-BOT-085, BR-BOT-087) |
| 2 | `language_code` `uz`, `uz-UZ`, `en-GB`, `ru`, `de`, missing, and no language chosen yet | replies in `uz`, `uz`, `en`, `ru`, `ru`, `ru` |
| 3 | A user who chose a language, whose client reports another | the chosen language wins |
| 4 | The language is chosen in the Mini App | the next bot reply uses it (same settings row) |

Legacy behaviour was never observed (`UNVERIFIED`, Q-BOT-035); rows 2 and 3 are the specification's answer.

### Outdated buttons (BOT-023, TXT-BOT-039)

| # | Trigger | Result |
| - | ------- | ------ |
| 1 | A button of a conversation that a newer one replaced | alert «Форма устарела — начните заново: /new» (`show_alert`); the keyboard of that message is removed; nothing is changed (BR-BOT-009) |
| 2 | A button of a conversation idle longer than the TTL | the same |
| 3 | A button after Redis lost the state | the same |
| 4 | Forged, truncated or 65-byte data; an unknown action; a version `k2` | the same |
| 5 | Data that names a radar of another user | the same; the other user's radar is unchanged |
| 6 | The message of the button was deleted | the alert; the failed keyboard removal is ignored |
| 7 | The answer arrives after Telegram's window (queue lag) | `QueryTooOld` is ignored; the keyboard is still removed; the update ends `done` |

Drafts of TXT-BOT-039 for the proofreader: `uz` «Shakl eskirgan — qaytadan boshlang: /new», `en` «This form is
outdated — start again: /new».

### Reply conventions (`04` §4.3)

| Convention | Rule | Source |
| ---------- | ---- | ------ |
| Edit or new | A callback edits the message it came from. A new message is sent only for: the wizard step after a typed amount, a card opened by number or from `/fav`, the starter list, the first-radar tip, the venue, the photo album, the poll — and two answers legacy does not have: the number shown by `📞 Показать номер` (WP-53) and `bot.radar.soon` | BR-BOT-001 |
| Toast | `answerCallbackQuery` with text: TXT-BOT-048 … TXT-BOT-056, TXT-BOT-062 … TXT-BOT-067, TXT-BOT-075 | BR-BOT-002 |
| Alert | `show_alert`: TXT-BOT-039 only | BR-BOT-002 |
| Silent | 14 kinds: wizard step buttons, `✏️`, `◀️ Назад`, `✖️ Отмена`, the welcome language buttons, `✏️ Изменить`, `🗑 Удалить` (first step), `◀️ К списку`, poll answers, number buttons, `📍 На карте`, `📷` (on success), `🗑 Убрать номер`, `/settings` headers | BR-BOT-002 |
| Selected option | prefix `✅ `; in the district list every ticked item | BR-BOT-003 |
| Button styles | `primary`: BTN-001, BTN-035, BTN-004, BTN-034, BTN-028, BTN-056; `danger`: BTN-058; all others default | BR-BOT-004 |
| Reply keyboard | only in `/owner`; every other button is inline | BR-BOT-005 |
| Unchanged re-render | "message is not modified" counts as success and the callback is still answered | BR-BOT-076 |
| Numbers and time | `ru` `18 657`, `$1 000`; `en` `18,662`; Asia/Tashkent | BR-BOT-008 |

A client that does not render `style` shows default buttons; that is harmless.

### Stickers and avatar (BOT-010, BOT-009)

| # | Trigger | Result |
| - | ------- | ------ |
| 1 | `SendSticker('welcome')` or `SendSticker('radar_saved')` with a configured asset | the sticker is sent by the environment's own bot; the `file_id` is resolved once per bot |
| 2 | The asset is missing, or Telegram refuses it | no sticker, no error; the following text is sent |
| 3 | The avatar and the description picture | listed in `telegram.assets.profile` for the BotFather checklist of WP-58 |

### Limits and access

| # | Trigger | Result |
| - | ------- | ------ |
| 1 | The 31st command or callback of a user within a minute | dropped; `bot.common.slow_down` once (a toast for a callback) |
| 2 | The 32nd to the 99th | dropped; a callback gets a silent answer |
| 3 | From the 100th | dropped; nothing is sent |
| 4 | A user whose access state is `blocked` | no message; a callback is answered silently |
| 5 | A group chat | no user is created; nothing is sent by this package |
| 6 | An update that fails three times | one `bot.common.error` with the support button |

These are security requirements (SEC-REQ-010, SEC-REQ-011), not flagged behaviour changes; legacy limits are
unknown.

### Radars switched off (DEC-51)

| # | Trigger, while `radar.creation_enabled` is off | Result |
| - | ---------------------------------------------- | ------ |
| 1 | A command, a text or a voice whose registration is marked `radar` | one new message `bot.radar.soon`; nothing is created; for text and voice at most once a minute |
| 2 | A callback whose registration is marked `radar` | a silent answer and the same new message; the pressed message is not edited |
| 3 | Any other update | handled as usual |

Legacy has no such state: its radars work from the first day. HOMI's bot says "soon" until the sending package
switches radars on (WP-57). No handler of this package is marked; the rows are proven with handlers of the test.

### Defects fixed and behaviour changes

- Fixed here: LB-BOT-010, LB-BOT-011, LB-BOT-012, LB-BOT-013 (table "Glossary fixes").
- Fixed here by decision (DEC-54): LB-BOT-009 — the whole-city label is `:city целиком` (table "Glossary fixes");
  WP-54 renders it. Legacy says `Весь <город>`, hence «Весь Фергана».
- Not here: LB-BOT-007 → target-state callbacks, WP-53; the codec supports them.
- No `DEV` flag is read by this package.

## Tests

Layers of `25` §9. All run on the fake Bot API of WP-50. A file listed under `tests/Unit/Telegram/` or
`tests/Unit/I18n/` that needs a facade, `config()`, `__()` or the container is created under
`tests/Feature/Telegram/` or `tests/Feature/I18n/` instead (`tests/Pest.php` binds the test case to `Feature` only;
the rule of WP-41 and WP-50) — here every one except `IncomingUpdateTest`, `HtmlTest` and `CallbackCodecTest`, as
far as those take plain values. On the `sync` queue of the test run one exception already
fails the job and surfaces in the webhook response, so the retry cases (feature cases 10 and 11) call the job's
`handle()` and `failed()` directly, as `ProcessUpdateJobTest` of WP-50 does.

**Pest unit**

| # | Test | Cases |
| - | ---- | ----- |
| 1 | `HtmlTest` | `escape('a < b & c')` → `a &lt; b &amp; c`; `link('http://evil.example', 'x')` → plain `x`; an allow-listed `https://t.me/…` link → `<a>`; `truncate` of `<b>` + 5 000 characters at 1 024 → at most 1 024 units, `</b>` closed, ends with `…`; emoji at the limit → no split surrogate pair; the corpus `<b>`, `</blockquote>`, `&amp;`, `<a href="tg://…">` renders literally and passes the `FakeBotApi` validator |
| 2 | `BotLocaleTest` | the six `language_code` cases; a chosen locale wins; the unchosen default of WP-40 does not; `users.language_code` is used when the update has none |
| 3 | `BotTextTest` | a parameter `<script>` comes out escaped; `Html::raw()` is not escaped; brand placeholders filled and not overridable; a missing key throws under `testing`; `choice()` for 1, 2, 5, 21 |
| 4 | `BotFormatTest` | 18657 → `18 657` (`ru`, `uz`), `18,657` (`en`); `$1 000`; a UTC time shown in Asia/Tashkent |
| 5 | `RuCatalogueTest` | 88 text ids and 76 button ids mapped, none missing or extra; every mapped key exists; each key rendered with the sample parameters of `texts.ru.json` equals the audit text (whitespace normalised), except the ids listed under `"decided"`, which equal their decided wording: `bot.wizard.area.whole_city` with `:city` = `Фергана` is `Фергана целиком` (DEC-54); `bot.stale.alert` is `Форма устарела — начните заново: /new`; `bot.toasts.saved` is `Сохранил ✅`; no value contains `<`; exactly eight text ids are marked `spec` |
| 6 | `UzEnCatalogueTest` | the key sets and placeholder names of `ru`, `uz`, `en` are identical; `uz` has no ASCII `'`, no `‘`, no Cyrillic except `🇷🇺 Русский`; the quiet-hours line has `oʻch.` with one dot; one quiet-hours term; no `Sumi`; `en` has none of `Toshkent`, `Andijon`, `Qoʻqon`, `Fargʻona`; captured texts equal `texts.{uz,en}.json`; `translation-status.json` lists every key |
| 7 | `BrandWordsTest` | none of the forbidden strings under `backend/lang/**`; a fixture file with `kvadro²` makes the scanner report it |
| 8 | `CatalogueParityTest`, `RussianPluralsTest` | every file of `lang/ru` exists in `uz` and `en` with the same keys; plural strings for 1, 2, 5, 11, 12, 14, 21, 22, 25, 101, 111 |
| 9 | `IncomingUpdateTest` | `/start@<this bot> s_web` → command `start`, payload `s_web`; `/start@OtherBot` → text; a Cyrillic look-alike → text; each kind from its `UpdateFactory` update; no `from` → `Ignored` |
| 10 | `KeyboardBuilderTest` | the button JSON with `style`; `selected(true)` on `выкл` → `✅ выкл`; an `http://` or foreign URL throws; 65 bytes of data throw; `webApp()` accepts only the configured address |
| 11 | `ResponderTest` | `[EditMessage, Toast]` → `editMessageText`, then one answer with text; `[EditMessage, Alert]` → `show_alert: true`; two toasts throw; "not modified" → no error and the answer is still sent; `403` → the event `ChatUnreachable` |
| 12 | `CallbackCodecTest` | round trip of every row of the registry with maximal arguments, each at most 64 bytes; garbage, 65 bytes, `k2:…`, an upper-case action and five arguments decode to `null`; base 36 both ways |
| 13 | `ConversationStoreTest` | `begin()` then `matches(sid)`; a second `begin()` invalidates the first `sid`; `update()` at 1 700 s keeps it alive at 3 000 s; no update → gone at 1 801 s; `begin(Owner)` during a wizard; two bot ids are independent; `forget()`; the stored JSON has no name, phone or text |
| 14 | `StickerRegistryTest` | a `set` asset: one `getStickerSet`, two sends with the same `file_id`; a `file` asset: multipart upload, then the cached id; two bot ids resolve separately; `getStickerSet` answers `400` → skipped, one warning, the next reply sent; `telegram:assets:refresh` clears the current bot only |

**Arch — `TelegramArchTest`**: nothing under `App\Telegram` calls `htmlspecialchars`, `number_format`, `strip_tags`,
`__()` or `trans()` outside `Rendering`; only `App\Telegram\Client` uses the HTTP client; `ReplyKeyboard` is used
only by the classes of an allow-list in the test (the `/owner` handlers of WP-56).

**Pest feature — `UpdateRouterTest`, `StaleCallbackTest`**

| # | Case | Expected |
| - | ---- | -------- |
| 1 | `/start` from a new id, a test handler registered | one user row without a name; the handler invoked once |
| 2 | ten concurrent first updates — `backend/tests/Pgsql/FirstContactRaceTest.php`, `concurrently()` of WP-03, each task calls `UserResolver::fromBotUpdate()` with the same Telegram id | one user row, one `user_settings` row |
| 3 | a command with no handler and no fallback | nothing sent; one log record |
| 4 | a callback whose handler returns no answer | one silent `answerCallbackQuery` |
| 5 | a group message | no user row, nothing sent |
| 6 | a blocked user presses a button | a silent answer only; no edit, no message |
| 7 | 31 callbacks in a minute (frozen clock) | the 31st gets the `slow_down` toast and no handler; the 32nd a silent answer |
| 8 | 100 updates in a minute | the 100th: no call at all |
| 9 | `from` with `is_premium` | the flag stored; no username column or value anywhere |
| 10 | the handler throws once, then succeeds | one visible effect; nothing answered twice |
| 11 | the handler throws three times | `bot.common.error` once; the row `failed` |
| 12 | text while the conversation has `awaiting` set | the input handler, not the text handler |
| 13 | two handlers register the action `cd` | an exception at boot |
| 14 | stale cases 1–7 of "Outdated buttons" | the alert, the keyboard removed, and `DB::listen` sees no `insert`, `update` or `delete` outside the ledger row and the actor's own `users` row (`fromBotUpdate()` refreshes `last_seen_at`) |
| 15 | log records of the run | no Telegram id, no message text |
| 16 | a command, a callback, a text and a voice registered with `radar: true`, `radar.creation_enabled` off | no handler is invoked; each gets one `bot.radar.soon` message, the callback a silent answer; no conversation, and `DB::listen` sees no write outside the ledger row and the actor's `users` row; a second text within a minute gets nothing |
| 17 | the same four with the switch on; an unmarked registration with the switch off | every handler is invoked; no `bot.radar.soon` |

**Conversation tests — `ConversationSelfTest`, `TranscriptTest`**

| # | Transcript or case | Expected |
| - | ------------------ | -------- |
| 1 | self-test: `send('/echo hi')` → `expectNew`, `press('Edit')` → `expectEdit`, `press('Alert')` → `expectAlert` | the DSL matches methods, texts, keyboards and answers of the toy handler |
| 2 | self-test: a toy handler that answers a callback twice | the runner fails the test |
| 3 | `stale-callback.json` in `ru`, `uz`, `en` | the alert text of the locale; the keyboard removed |
| 4 | `first-contact-locale.json` | the toy reply in the language of each `language_code` |
| 5 | `rate-limit.json` | the notice once, in the user's language |
| 6 | `blocked-user.json` | no outgoing call except silent answers |
| 7 | `radar-soon.json` in `ru`, `uz`, `en`: a marked toy command and a marked toy button with the switch off | the text of the locale as a new message each time; the button's message is unchanged |

## Acceptance checklist

Functional lines are checked in `ru`, `uz` and `en`. The alert on real buttons is seen inside Telegram for the first
time in WP-52 and WP-54, whose checklists repeat it; here it is proven by the conversation tests.

- [ ] A first contact creates one user without a name and is answered in the language of the Telegram client
      (`uz*` → `uz`, `en*` → `en`, else `ru`); a chosen language wins (BOT-026).
- [ ] A button of a replaced conversation shows the alert of TXT-BOT-039, loses its keyboard and changes nothing
      (BOT-023).
- [ ] A button of a conversation idle longer than `TELEGRAM_CONVERSATION_TTL` does the same.
- [ ] Forged, 65-byte, unknown-action, other-version and foreign-object callbacks do the same, with no database
      write.
- [ ] Every callback in every test is answered exactly once: toast, alert or silent.
- [ ] A handler that returns an edit and a toast produces exactly `editMessageText` and one `answerCallbackQuery`.
- [ ] A selected option carries `✅ `; `primary()` and `danger()` send the `style` field; a reply keyboard cannot be
      built outside the `/owner` handlers.
- [ ] `SendSticker` works per bot from a set or a file and is skipped without an error when the asset is missing
      (BOT-010); the avatar entry exists for WP-58 (BOT-009).
- [ ] The 31st interactive update of a minute gets the slow-down notice once; a blocked user gets nothing.
- [ ] With `radar.creation_enabled` off a registration marked as a radar entry is answered with `bot.radar.soon`
      and its handler is not called; with it on the mark changes nothing.
- [ ] The whole-city label reads `:city целиком` in `ru`; its `uz` and `en` wordings are drafts on the
      proofreader's list.
- [ ] All 88 texts and all 76 button ids are mapped in `txt-keys.json`; `ru`, `uz` and `en` have the same keys and
      placeholders.
- [ ] Russian texts quoted in `04` §4.2 are reproduced verbatim except brand words; no catalogue value holds a
      brand word, a bot name, a domain or an HTML tag.
- [ ] The brand table of this specification lists every text that was found to name the product, the bot, the
      support bot or a domain, including those found while copying the long texts.
- [ ] Uzbek texts use `ʻ` and `ʼ`, one term for quiet hours, `oʻch.` and `soʻm`; the English welcome has no Uzbek
      city name.
- [ ] `translation-status.json` lists every key; the draft keys are named in the PR for the proofreader
      (Q-BOT-014).
- [ ] The eight texts never observed are drafts marked `spec`, each with its question id.
- [ ] `docs/infrastructure/telegram-webhook.md` has the handler registry, the reply conventions, the callback
      registry, the conversation contract and the asset list.
- [ ] The env names are in `backend/.env.example` and `docs/infrastructure/environments.md` (shared-file PR
      merged).
- [ ] `make ci-backend` exits 0; the `Pgsql` suite (`make test-pgsql`) is green; no dependency was added.
- [ ] On staging, then on production, with the production track: the env values are set; `telegram:health` exits
      0; a message sent to the bot creates one user row with the right locale and no name, the ledger row ends
      `done`, and the bot sends nothing.

## Handoff

Empty — nobody has started this package.
