# WP-56 — Settings, owner verification, privacy, erasure

| Field | Value |
| ----- | ----- |
| Stage | D |
| Status | TODO |
| Depends on | WP-52, WP-47 |
| Size | about 2 400 changed lines, M |
| Behaviour reference | `04` §2 (rows BOT-017, BOT-018, BOT-020, BOT-074 … BOT-080), §3.14, §3.15, §3.16, §4.1 (BTN-067 … BTN-076), §4.2, §6.3 item 4, §8 (BR-BOT-073 … BR-BOT-094, BR-BOT-103), §9 (LB-BOT-010, LB-BOT-011, LB-BOT-012, LB-BOT-023, LB-BOT-026, LB-BOT-029); `16` (SEC-REQ-011, SEC-REQ-036 … SEC-REQ-039, SEC-REQ-045, SEC-REQ-047); `24` §8.2 (Q-SEC-021); task files KV-TG-045 … KV-TG-049; rules of KV-BE-045 and KV-BE-050 |
| Needs from the production track | (1) Approval of two additive migrations: column `user_settings.service_news`, table `owner_verifications`. (2) `PHONE_HMAC_PEPPER` is already requested by WP-50; confirm it is set on staging and production, is different per environment, and is kept in the password manager: if it changes or is lost, every stored verification stops matching and owners must verify again. (3) The backup retention the privacy text promises (about two weeks) is confirmed by the production track before the text goes live (request of WP-70). Nothing else |

## Goal

`/settings`, `/owner` and `/privacy` work as in the legacy bot: one settings panel that saves on every press, owner
verification by the user's own phone number of which only a keyed hash is kept, and the privacy text with «Удалить
мои данные», which erases the user through the single erasure service of WP-47 after a confirmation. Every promise
of the privacy text is tied to the HOMI mechanism that keeps it, or is reworded where HOMI works differently.

## Scope

In:

- `/settings`: the panel, its five rows, saving, the toast, the re-render; the language row through
  `LanguageSwitcher` of WP-52; the bot-only setting "service news".
- `/owner`: the intro with the reply keyboard, the contact check, the stored verification, the outcomes, the status
  of a verified owner, the removal.
- `/privacy`: the text in three languages, the promise table and its test.
- «Удалить мои данные»: confirmation, the erasure call, the chat-side clean-up, the reply.
- Removing `settings`, `owner` and `privacy` from `config('bot.interim_commands')`.

Out:

- The effect of quiet hours and digest times on sending, and the service-news broadcast itself — WP-57.
- The settings record, its options and defaults, `GET` and `PATCH /api/v1/settings` — WP-40.
- The erasure procedure, its registry, the PostHog person deletion — WP-47.
- Redaction of contact updates and `PhoneHmac` — WP-50.
- The landing privacy page — WP-61. The final legal wording and the answer to Q-SEC-021 — WP-70.
- Showing an owner badge on listings read from legacy: an open point, see "Owner verification" in "Design".

## Decisions that bind this package

| # | Decision | Consequence here |
| - | -------- | ---------------- |
| 1 | DEC-43, `25` §6 | All 10 handlers, 10 buttons and 10 texts of the lists below are built |
| 2 | DEC-36 and answer 5 of the developer | Copy defects are fixed (LB-BOT-010, LB-BOT-011, LB-BOT-012, in the catalogue of WP-51; checked here). LB-BOT-029 is fixed by the keyed hash, which changes nothing the user sees. Two design decisions whose fix is a `DEV` row stay legacy behind a flag that is off: LB-BOT-023 (DEV-032), LB-BOT-026 (DEV-035) |
| 3 | DEC-40 — brand and own users | The texts name HOMI through the brand layer. There are no legacy hashes and no migrated verifications: DEC-29 and the transition window of DEV-011 do not apply |
| 4 | `25` §5 "Settings" | One record for bot and Mini App: the bot reads and writes through `SettingsService` of WP-40 with the option lists of the v1 contract (WP-11). A change made in the app is visible in the next `/settings` |
| 5 | `25` §5 "Erasure" | The bot calls `ErasureService` of WP-47 and deletes nothing itself except its own chat-side state |
| 6 | `25` §2 rule 7, SEC-REQ-047 | No phone number, contact name or Telegram id of an erased user is written to a log, a job payload or a table |
| 7 | Q-SEC-021, DEC-13 (open) | The privacy text ships as the legacy text adapted to what HOMI really does and is marked for the lawyer's review; WP-70 delivers the final wording. The package does not wait for it |
| 8 | DEC-45, DEC-46, `25` §9 | One PR; the checklist is run in ru, uz and en on staging and production |

## Design

The specification of the named package is authoritative for names. If it differs, use its name and do not create a
second service.

### What comes from where

| Need | Package | Call expected |
| ---- | ------- | ------------- |
| Read and write settings | WP-40 | `SettingsService::get(User)`, `patch(User, array)` with `quiet_hours` (`null` or `{from, to}`), `digest_hours` (list), `currency`, `locale` |
| Option lists | WP-11, WP-40 | the `options.quiet_hours` and `options.digest_hours` lists the settings answer carries (BR-BOT-103) — never a constant in the handler |
| Language switch | WP-52 | `LanguageSwitcher::switch`, action `lg` with origin `s`, contract `LanguageSwitchView` |
| Per-chat command menu | WP-52 | `BotCommandList::resetChat(User)` |
| Contact hash | WP-50 | the stored update holds `contact.user_id` and `contact.phone_hmac`; the handler never sees the number |
| Erasure | WP-47 (rules of KV-BE-050) | `ErasureService::erase(User, string $source): ErasureReceipt`; a registry where a package lists its tables with a user link |
| Conversation state, reply keyboards, replies | WP-51 | `ConversationStore` kinds `Owner` and `PrivacyDelete`; `ReplyKeyboard::requestContact`, `remove()` |
| Brand values | WP-51 | `:brand`, `:bot`, `:support`, `:site`, the privacy address |

### Settings panel

- `App\Telegram\Handlers\SettingsCommand` (command `settings`, new message) and `SettingsCallback` (action `st`).
- `App\Telegram\Rendering\SettingsPanelRenderer::render(UserSettingsData, BotLocale): PanelMessage` — the text of
  TXT-BOT-074 with the current values, and the keyboard.
- `App\Telegram\Handlers\SettingsLanguageView` implements `LanguageSwitchView` of WP-52 for origin `s`: after the
  switch it re-renders the panel in the new language and answers with the toast in the new language.
- Callback data: `k1:st:<row>:<value>` with rows `q` (quiet hours), `d` (digest), `c` (currency), `n` (service
  news); `k1:lg:<ru, uz or en>:s` for the language row; `k1:nop` for the section headers.

| Row | Values in the data | Stored through |
| --- | ------------------ | -------------- |
| `q` | the index of the option in `options.quiet_hours` (`0` = off) | `quiet_hours` |
| `d` | the index of the option in `options.digest_hours` | `digest_hours` |
| `c` | `USD`, `UZS` | `currency` |
| `n` | `1`, `0` | `service_news` |

A value outside the current option list is outdated-button behaviour (SEC-REQ-011).

Service news is a bot-only setting (BR-BOT-080): column `user_settings.service_news` (boolean, default `true` —
the value seen on the legacy test account, BR-BOT-075), added by this package. `SettingsService::patch` accepts the
key; the request class of `PATCH /api/v1/settings` does not, so the Mini App contract is unchanged.

### Owner verification

- Table `owner_verifications`: `id`, `user_id` (unique, foreign key, cascade), `phone_hmac` (char 64, indexed),
  `verified_at` (timestamp with time zone), timestamps. Model `OwnerVerification` with a factory. No raw number, no
  name, no contact payload anywhere (SEC-REQ-036, SEC-REQ-037; fix of LB-BOT-029: the hash is an HMAC with
  `PHONE_HMAC_PEPPER`, so it cannot be reversed by trying numbers without the key).
- `App\Services\Owner\OwnerVerificationService`: `statusOf(User): ?OwnerVerification`, `verify(User, string
  $phoneHmac): OwnerOutcome`, `remove(User): void`. Enum `App\Enums\Owner\OwnerOutcome`: `VerifiedNoListings`,
  `VerifiedWithListings`, `RefusedManyFlats`, `RefusedRealtor`.
- **Open point (Q-API-062).** A badge «Хозяин · номер подтверждён» needs the phone of a listing to compare hashes.
  In Wave 1 listings are read from legacy, which gives a masked label and a call link, not the number. Therefore
  `verify()` returns `VerifiedNoListings` in Wave 1, the three other outcomes are keyed and unit-tested but not
  reachable, and no badge is written. The verification is stored so that it takes effect when the listing source can
  supply a comparable hash (the operator's answer to Q-API-062, or HOMI's own listings in Wave 2). No matcher is
  built here. The owner badge the Mini App shows on a legacy listing is the one legacy computed.
- `App\Telegram\Handlers\OwnerCommand` (command `owner`), `ContactMessage` (every private `message.contact`, with
  or without a conversation), `OwnerCancelInput` (the text `Отмена` while `awaiting = contact`),
  `OwnerRemoveCallback` (action `ow`: `rm`, `rmy`, `rmn`).
- Conversation: kind `Owner`, `awaiting = contact`. Any other text while it is open ends it and is handled normally.

### Privacy and erasure

- `App\Telegram\Handlers\PrivacyCommand` (command `privacy`) and `PrivacyDeleteCallback` (action `pv`: `dl`, `dly`,
  `dln`). Conversation kind `PrivacyDelete` holding the message id of the policy message.
- The text is `bot.privacy.text` with placeholders from the brand layer: `:brand`, `:support`, `:site`, the privacy
  address of the user's language, and `:llm` (`config('brand.llm_vendor')`, the vendor WP-55 really calls). A text
  longer than 4 096 characters in a language is sent as two messages cut at a paragraph; the button sits on the last.
- `/privacy` and the deletion are answered whatever the access gate says.
- Erasure order inside `pv:dly`, when the conversation matches the pressed message:

| # | Action | Why in this order |
| - | ------ | ----------------- |
| 1 | Remember the chat id, the message id and the locale | the user row is about to disappear |
| 2 | `BotCommandList::resetChat($user)` | needs the user; harmless if a later step fails, the next `/start` applies the menu again |
| 3 | `ErasureService::erase($user, 'bot')` | one transaction of WP-47: every registered table, the ledger rows of the chat (`TelegramUpdate::scopeForChat`), tokens; the PostHog person deletion is queued by WP-47 |
| 4 | `ConversationStore::forget()` and the cache keys of the user (limiter buckets, save locks) | Redis is outside the transaction |
| 5 | Edit the message into `bot.privacy.deleted`, no buttons, in the remembered locale | the user sees the result even though no user exists any more |

- This package adds to the erasure registry of WP-47 (`config/erasure.php`): `owner_verifications`, strategy
  `delete` (by `user_id`); and to `config/retention.php` the entry `owner_verifications`: `kept`, "the user's own
  record, removed by erasure" (`RetentionRegistryTest` of WP-47 fails without it). `user_settings` goes
  with the settings row of WP-40. The delivered-card log, attribution rows and radars are registered by WP-53,
  WP-52 and WP-45.
- Jobs already queued for the user (a held card, a starter list) find no user and end silently (WP-57 and WP-54
  check; this package adds the test).
- The job that processes the current update writes its final status after the handler; the ledger row is gone by
  then, and WP-50 tolerates the missing row.
- A later `/start` of the same Telegram account creates a new user with default settings (`UserResolver` of WP-40).
- No action-log event with the Telegram id is written after step 3 (WP-58).

### Configuration

`backend/config/bot.php`, added keys: `dev032`, `dev035` (both `false`). `backend/config/brand.php`: `llm_vendor`.

New catalogue keys (ru, uz, en; legacy has no such texts or they were never observed): `owner.not_own_contact`,
`owner.verified_with_listings`, `owner.refused_many_flats`, `owner.refused_realtor`, `owner.remove_confirm`,
`privacy.delete_confirm`, `privacy.deleted`, and the button labels `🗑 Да, убрать`, `🗑 Да, удалить всё`.

## Files

All paths under `backend/`.

- `app/Telegram/Handlers/{SettingsCommand,SettingsCallback,SettingsLanguageView,OwnerCommand,ContactMessage,OwnerCancelInput,OwnerRemoveCallback,PrivacyCommand,PrivacyDeleteCallback}.php`
- `app/Telegram/Rendering/SettingsPanelRenderer.php`
- `app/Services/Owner/OwnerVerificationService.php`, `app/Enums/Owner/OwnerOutcome.php`
- `app/Models/OwnerVerification.php`, `database/factories/OwnerVerificationFactory.php`
- `database/migrations/<date>_add_service_news_to_user_settings_table.php`,
  `database/migrations/<date>_create_owner_verifications_table.php`
- `app/Services/Identity/SettingsService.php`, `UserSettingsData.php` (WP-40; changed: `service_news`)
- `config/erasure.php` and `config/retention.php` of WP-47 (entries `owner_verifications`)
- `app/Providers/TelegramServiceProvider.php` (commands `settings`, `owner`, `privacy`; actions `st`, `nop`, `ow`,
  `pv`; the `s` view of `lg`; the `Contact` message handler; the input handler of kind `Owner`)
- `config/bot.php`, `config/brand.php`, `lang/{ru,uz,en}/bot.php`
- `tests/Feature/Bot/{SettingsPanelTest,OwnerVerifyTest,OwnerStatusTest,PrivacyCommandTest,PrivacyPromisesTest,PrivacyDeleteTest}.php`
- `tests/Unit/Owner/OwnerVerificationServiceTest.php`
- `tests/Fixtures/Bot/transcripts/{settings,owner-verify,owner-remove,privacy,privacy-delete}.json`
- `docs/infrastructure/telegram-webhook.md` (registry rows of `st`, `nop`, `ow`, `pv`)

## Steps

Generators always with `--no-interaction`; tests first inside each step; Pint after every PHP edit.

1. Read the specifications of WP-40 (settings), WP-47 (erasure), WP-52 (language), WP-50 (redaction); reconcile the
   names of "What comes from where" and write the differences into "Handoff".
2. Migration `service_news`; `SettingsService` and `UserSettingsData` accept and return it; a test that `PATCH
   /api/v1/settings` still rejects the key.
3. `SettingsPanelRenderer`, `SettingsCommand`, `SettingsCallback` with the legacy header buttons; remove `settings`
   from the interim list; `SettingsPanelTest`, transcript `settings.json` in ru, uz, en.
4. `SettingsLanguageView` registered for origin `s`; the language cases of `SettingsPanelTest`.
5. The `dev035` layout (titles in the text, no header buttons) with `todo` tests.
6. Migration and model `owner_verifications`; `OwnerVerificationService` with its unit test.
7. `OwnerCommand`, `ContactMessage`, `OwnerCancelInput`; remove `owner` from the interim list; `OwnerVerifyTest`.
8. `OwnerRemoveCallback` in the legacy behaviour (removal at once), then the `dev032` confirmation with `todo`
   tests; `OwnerStatusTest`.
9. `PrivacyCommand` with the adapted text in three languages; remove `privacy` from the interim list;
   `PrivacyCommandTest`.
10. `PrivacyPromisesTest`: one case per row of the promise table below.
11. `PrivacyDeleteCallback`, the registry entry, the clean-up order; `PrivacyDeleteTest` with a user that has every
    relation.
12. Registry rows; `make ci-backend`; review by the `security-reviewer` agent (phones, erasure, public promises);
    PR; deploy; the checklist on staging and production. On production the deletion is tested with a throw-away
    account.

## Behaviour to reproduce

Owned: handlers BOT-017, BOT-018, BOT-020, BOT-074 … BOT-080; buttons BTN-067 … BTN-076; texts TXT-BOT-074 …
TXT-BOT-081, TXT-BOT-083, TXT-BOT-084. Brand words in quoted legacy texts are marked.

### `/settings` (BOT-017, BOT-074)

The panel is one message (TXT-BOT-074; Russian `tb:773–786`, English `tb:1092–1105`, Uzbek `tb:1114–1127`): a bold
heading, for each setting its title and current value, an italic last line (times are Asia/Tashkent).

| Row | Header button (BTN-067) | Option buttons | Rule |
| --- | ----------------------- | -------------- | ---- |
| Quiet hours | `🌙 Тихие часы` | `выкл` · `22:00–08:00` · `23:00–08:00` / `00:00–09:00` · `23:00–07:00` (BTN-068) | BR-BOT-073, BR-BOT-077 |
| Digest times | `📬 Время подборок` | `09:00` · `09:00 и 19:00` / `12:00 и 20:00` · `19:00` (BTN-069) | BR-BOT-074, BR-BOT-078 |
| Language | `🌐 Язык` | `🇷🇺 Русский` · `🇺🇿 Oʻzbekcha` · `🇬🇧 English` (BTN-070) | handler BOT-025 is owned by WP-52 |
| Currency | `💱 Валюта` | `Доллары, $` · `Сумы` (BTN-071) | BR-BOT-079 |
| Service news | `📰 Новости сервиса` | `Присылать` · `Не присылать` (BTN-072) | BR-BOT-080 |

- The current value of each row carries `✅ ` (BR-BOT-003). The option labels are built from the option lists of the
  settings contract, so a list change needs no bot change (BR-BOT-103).
- Any option press — also the current one — saves, answers with the toast `Сохранил ✅` (TXT-BOT-075; `Saqlab
  qoʻydim ✅`, `Saved ✅`) and re-renders the same message (BR-BOT-076). Telegram's "message is not modified" answer
  counts as success.
- A language press saves the language, re-renders the panel in the new language, switches the command menu of the
  chat, and the toast is in the new language.
- A header press does nothing and is answered silently (legacy; LB-BOT-026). With `bot.dev035` on (DEV-035, tests
  `todo`) the titles are part of the text and the keyboard has option rows only.
- A new user sees the defaults of WP-40 for quiet hours, digest times and currency, and `✅ Присылать`. A stored
  value that is not in the option list is shown as text and no option is ticked.
- Currency changes how the bot formats prices from then on (cards of WP-53; Q-BOT-015).
- Two panels in the chat both work on the server state; only the pressed one is re-rendered.
- Uzbek copy: `oʻch.` with one dot, one term for quiet hours in header and text, `soʻm` (LB-BOT-010, LB-BOT-011,
  LB-BOT-012).
- Settings writes share the per-user write limit of the bot (SEC-REQ-027).

### `/owner` (BOT-018, BOT-075 … BOT-079)

| # | Trigger | What the user sees |
| - | ------- | ------------------ |
| 1 | `/owner`, not verified (BOT-075) | The intro (TXT-BOT-076, `tb:818–825`) with a reply keyboard: `📱 Поделиться номером` (BTN-073, `request_contact`) / `Отмена` (BTN-074). The only reply keyboard of the bot (BR-BOT-005) |
| 2 | `Отмена` — arrives as text (BOT-076) | `Хорошо, номер не подтверждаем. Вернуться — /owner.` (TXT-BOT-077); the reply keyboard is removed |
| 3 | The user shares the contact; it is the sender's own (BOT-077) | `✅ Номер подтверждён` + `Объявлений с этим номером пока нет. Когда оно появится в одном из каналов, которые читает kvadro² [brand → :brand], метка встанет сама — обычно за несколько минут.` (TXT-BOT-078); the reply keyboard is removed in the same reply (Q-BOT-037, closed by specification) |
| 4 | A contact that is not the sender's own: forwarded, without `user_id`, or another user's | `owner.not_own_contact`; nothing is stored (SEC-REQ-011; Q-BOT-008, closed by specification). A contact sent in a group gets no reply at all: group updates never reach a handler (WP-51 router, WP-52 `GroupChatHandler`) |
| 5 | `/owner`, already verified (BOT-078) | `✅ Ваш номер подтверждён` + the paragraph of TXT-BOT-078 (TXT-BOT-079) with the inline button `🗑 Убрать номер` (BTN-075) |
| 6 | `🗑 Убрать номер` (BOT-079) | The verification is deleted at once and the message becomes `Номер убран, метка «номер подтверждён» снята. Подтвердить снова — /owner.` (TXT-BOT-080), no buttons; silent (BR-BOT-084, legacy; LB-BOT-023) |

- Only the keyed hash and the date are stored (BR-BOT-081). The user's contact message stays in the chat history,
  as in legacy; the stored update holds no number (WP-50).
- A contact that arrives with no open `/owner` conversation is handled as row 3 or 4.
- Sharing the same number again refreshes the date; a different own number replaces the hash.
- Any other text while the intro is open ends the conversation and is handled normally (free text of WP-55).
- The outcomes "listings found", "three or more flats" and "realtor number" (TXT-BOT-081, never observed; BR-BOT-082,
  BR-BOT-083) have their texts in the catalogue and are not reachable in Wave 1 (open point above). The sentence
  «метка встанет сама — обычно за несколько минут» of TXT-BOT-078 promises a badge HOMI cannot set yet: the catalogue
  text of HOMI says the number is confirmed and the mark will appear when HOMI can match listings; the product owner
  approves the wording.
- A second press of `🗑 Убрать номер` on an old copy shows TXT-BOT-080 again without an error. The action carries no
  id and acts on the presser only.
- With `bot.dev032` on (DEV-032, tests `todo`): `🗑 Убрать номер` first shows `owner.remove_confirm` with `🗑 Да,
  убрать` (style `danger`) · `✖️ Отмена`.

### `/privacy` (BOT-020) and the promises

`/privacy` sends the policy (TXT-BOT-083, `tb:850–865`) with the button `🗑 Удалить мои данные` (BTN-076). The legacy
text names the product, the support bot, the site and the LLM vendor; all four come from the brand layer.

Promise table — one test case each in `PrivacyPromisesTest`; a row whose mechanism belongs to a later package is a
Pest `todo` that names it.

| # | Promise of the legacy text | Rule | True for HOMI in Wave 1? | Mechanism and test |
| - | -------------------------- | ---- | ------------------------ | ------------------ |
| 1 | Stored: Telegram id, language and settings, radars, favourites, card marks, opened listings, received cards, arrival source, an action log. No name, no contacts | BR-BOT-085 | yes | `users` has no name column (WP-40); the ledger is redacted (WP-50); a schema test lists the columns of every user table |
| 2 | The action log (what was pressed, without texts) is kept 180 days | BR-BOT-086 | yes, if WP-47 keeps 180 days | retention value of WP-47 asserted; bot events carry ids only (WP-58) |
| 3 | Three profile flags and the account age for weighing votes | BR-BOT-087 | yes | `users.is_premium`, `has_username`, `has_photo` (WP-40), vote weights (WP-44) |
| 4 | Phones and handles are masked before text goes to the LLM vendor | BR-BOT-088 | yes; the vendor name is `:llm` | `PiiMaskerTest`, `LlmGatewayTest` (WP-55) |
| 5 | Geolocation stays in the app and is never sent or stored | BR-BOT-089 | yes | the redactor drops `location` (WP-50); no API method takes the user's position |
| 6 | Analytics in PostHog under a random id; erased on deletion | BR-BOT-090 | yes, with HOMI's own project (DEC-47); the hosting region named in the text is the real one | distinct id rule and person deletion of WP-47; `PrivacyDeleteTest` asserts one deletion request |
| 7 | Support bot: mapping 90 days, texts until the conversation ends, summary one year | BR-BOT-091 | **no** — HOMI runs no support bot; the support contact is `:support` | the paragraph is replaced by one sentence that says who answers and that those messages are not processed by the bot; the product owner supplies the facts |
| 8 | After an author's request the listing leaves feed, map, site and broadcasts, and sent cards become «Объявление снято» | BR-BOT-092 | partly: cards are edited when the listing source withdraws the listing (WP-57). A request made to HOMI is passed to the service the listing comes from | `WithdrawnCardEditTest` (WP-57); the paragraph is reworded |
| 9 | Removed listings are kept 90 days, then phone, text and photos are erased | BR-BOT-093 | **no** — HOMI stores no listings in Wave 1, only listing numbers in the user's lists and short-lived caches | the paragraph is replaced by: listings, phones and photos are shown from another service and are not stored by HOMI |
| 10 | «Удалить мои данные» deletes at once; backups keep data about two weeks | BR-BOT-094 | yes, when the production track confirms the backup retention | `PrivacyDeleteTest`; the retention value is a request of WP-70 |

- The adapted text is written in Russian by the developer from the legacy text with rows 7, 8 and 9 reworded and one
  sentence added that listings come from another service; `uz` and `en` follow. All three are marked
  "pending legal review" in the translation status file of WP-51.
- No promise is cut for length. The legal basis and the operator's name and address are added by WP-70.

### «Удалить мои данные» (BOT-080)

The legacy handler was never pressed (Q-BOT-001); the flow below is closed by specification from SEC-REQ-039 and the
promises of the text.

| # | Trigger | What the user sees |
| - | ------- | ------------------ |
| 1 | `🗑 Удалить мои данные` | The keyboard of the policy message becomes `🗑 Да, удалить всё` (style `danger`) · `✖️ Отмена`, with the text `privacy.delete_confirm` (TXT-BOT-084): what is deleted — radars, favourites, settings, marks, the owner verification, the history of received cards — and that backups age out in about two weeks. Silent |
| 2 | `✖️ Отмена` | The button `🗑 Удалить мои данные` again; nothing deleted |
| 3 | `🗑 Да, удалить всё` on the message of the open confirmation | Everything is erased (order in "Design"); the message becomes `privacy.deleted`, no buttons |
| 4 | The same press again, or on an older policy message, or a forged `k1:pv:dly` | Alert of TXT-BOT-039; nothing deleted |
| 5 | `/start` afterwards | The welcome of a first contact; a new user |

- The PostHog deletion is asynchronous (BR-BOT-090): the reply does not wait for it; WP-47 retries it.
- The user blocked the bot between the press and the reply: the erasure stands; the failed edit is ignored.
- Cards already in the chat stay there (Telegram messages are not deleted); their buttons act for the new user the
  account becomes after the next `/start`.

### Defects and behaviour changes

| # | Item | What is done |
| - | ---- | ------------ |
| 1 | Uzbek typos and mixed terms in the panel | Fixed in the catalogue: LB-BOT-010, LB-BOT-011, LB-BOT-012 |
| 2 | Plain hash of the phone could be reversed | Fixed: keyed HMAC (LB-BOT-029, SEC-REQ-036) |
| 3 | Number removed without confirmation | Legacy kept; LB-BOT-023 behind DEV-032, `bot.dev032` off |
| 4 | Header buttons that do nothing | Legacy kept; LB-BOT-026 behind DEV-035, `bot.dev035` off |
| 5 | Deletion without a known confirmation | A confirmation is required (SEC-REQ-039); not a `DEV`, legacy unobserved |

## Tests

Conversation tests use the runner of WP-51; contacts come from `UpdateFactory::contact` of WP-50 with the synthetic
number `+998000000001`.

| # | Test | Cases |
| - | ---- | ----- |
| 1 | `SettingsPanelTest` | `/settings` → new message with five rows and `✅` on the stored values; `23:00–08:00` → toast, same message, `quiet_hours` = 23–8 in the record and in `GET /api/v1/settings`; the same press again → toast, "not modified" not logged as an error; `12:00 и 20:00` → `[12, 20]`; `Сумы` → `UZS`; `Не присылать` → `service_news` false; `🇬🇧 English` → panel in English, toast `Saved ✅`, one `setMyCommands` for the chat; header press → silent, no edit; `uz` panel copy; a forged index → alert, nothing saved; a value changed through the API shows in the next panel; a stored value outside the options → shown as text, nothing ticked; `PATCH /api/v1/settings` with `service_news` → rejected |
| 2 | `OwnerVerificationServiceTest` (unit) | verify stores hash and date; same number again refreshes the date; another number replaces the hash; remove deletes the row; the outcome is `VerifiedNoListings` |
| 3 | `OwnerVerifyTest` | `/owner` → intro with the reply keyboard; own contact → TXT-BOT-078, `remove_keyboard`, one row; forwarded contact → `owner.not_own_contact`, no row; contact without `user_id`; contact in a group → no reply, no row, no user; `Отмена` → TXT-BOT-077, keyboard removed, conversation gone; own contact without a conversation; another text ends the conversation; the same `update_id` twice → one row, one reply; afterwards no table, payload or log line contains the digits of the number |
| 4 | `OwnerStatusTest` | verified `/owner` → TXT-BOT-079 with the button; press → TXT-BOT-080, row deleted; press again on the old message → TXT-BOT-080, no error; a forged `k1:ow:rm` from a user without verification → TXT-BOT-080 for that user, other rows untouched; `dev032` cases (`todo`) |
| 5 | `PrivacyCommandTest` | `ru` text equals the fixture, button `k1:pv:dl`; `en` and `uz`; a text forced over 4 096 characters → two messages, button on the second; a placeholder value with `<` is escaped; answered for a user the access gate refuses; no brand word of the legacy product in any language |
| 6 | `PrivacyPromisesTest` | the ten rows of the promise table: a passing assertion or a `todo` naming the package |
| 7 | `PrivacyDeleteTest` | confirm keyboard with `danger`; cancel restores the button; confirm → `privacy.deleted`, `ErasureService` called once, `deleteMyCommands` with chat scope; two callback ids for the confirm → one erasure, second gets the alert; a user with a radar, favourites, owner verification, delivered cards and a held delivery → a search of every table and JSON column finds neither the user id nor the Telegram id (helper of WP-47); the held send job sends nothing; confirm on an older message → alert; `/start` afterwards → new user; the PostHog fake got one deletion request; the fake throws → the erasure still completes |

## Acceptance checklist

Run in ru, uz and en on the staging bot and on the production bot; attach screenshots to the PR.

- [ ] `/settings` shows one panel with five rows and `✅` on the current value of each.
- [ ] Each quiet-hours and digest option saves with the toast and moves the `✅`; the text line changes.
- [ ] `Сумы` and `Доллары, $` save; a listing card opened afterwards shows prices in the chosen currency.
- [ ] `Не присылать` and `Присылать` save.
- [ ] A language option re-renders the panel in that language, the toast is in that language, and the command menu
      of the chat switches.
- [ ] Pressing the current option still shows the toast.
- [ ] A change made in the Mini App settings is shown by the next `/settings`, and the other way round.
- [ ] `/owner` shows the intro and the reply keyboard; `Отмена` answers and removes the keyboard.
- [ ] Sharing the own number answers «✅ Номер подтверждён» and removes the keyboard.
- [ ] A forwarded contact of another person is refused.
- [ ] `/owner` again shows the status with `🗑 Убрать номер`; pressing it removes the number and shows the removal
      text.
- [ ] `/privacy` shows the HOMI text in the user's language with `🗑 Удалить мои данные`; it names HOMI, the HOMI
      support contact and the real vendors.
- [ ] `🗑 Удалить мои данные` asks for a confirmation; `✖️ Отмена` restores the button.
- [ ] `🗑 Да, удалить всё` (throw-away account) shows the result text; `/subs`, `/fav` and `/owner` afterwards show
      the empty states; the Mini App opens as for a new user; the command menu is the default one.
- [ ] The production track confirms: no row with the Telegram id of that account in the database, and the backup
      retention matches the text.
- [ ] `config('bot.interim_commands')` no longer contains `settings`, `owner`, `privacy`.
- [ ] Tests of this package are green; `make ci-backend` is green; the security review is recorded in the PR.

## Handoff

Empty — nobody has started this package.
