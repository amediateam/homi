# WP-53 — Listing cards and card actions

| Field | Value |
| ----- | ----- |
| Stage | D |
| Status | TODO |
| Depends on | WP-52, WP-42, WP-43, WP-44, WP-45 (WP-43: `ContactService::disclose()` behind `📞 Показать номер`) |
| Size | ≈ 3 000 changed lines (about half of them tests and transcripts), L. If it grows past 3 000, cut after step 8: the first PR ships the table, the card, the sender, `/fav`, the number buttons, the map and the photos, with keyboard rows 3 and 4 not rendered (`config('bot.card.actions')` = `false`); the second PR ships steps 9–12 and turns the key on |
| Behaviour reference | `04` §2 (rows of the seven handlers below), §3.10, §3.13, §3.17, §4.1, §4.2, §4.3, §5 ("Migration constraint"), §8, §9, §10; `25` §4.5; task files KV-TG-022 … KV-TG-027 (handlers, buttons, texts, rules, edge cases, tests, class names) and KV-BE-038, KV-BE-040, KV-BE-041, KV-BE-043, KV-BE-106 (rules and service names of favourites, hidden listings, blocked authors, votes, hide rules). Not taken: the `listings` table and the alias resolver, signed legacy media addresses, the migrated card log, legacy `callback_data`, parity-gate rows |
| Needs from the production track | (1) The media host that serves listing photos (the nginx proxy and cache of `25` §4.5, set up for WP-42) must be reachable by Telegram's servers on staging and production: public `https` with a valid certificate, no IP allow-list and no authentication, `200 image/jpeg` for the photo addresses the API returns. (2) Approval of the additive migration `create_bot_listing_messages_table` on production (WP-46 does not create this table). (3) `TELEGRAM_MEDIA_UPLOAD` stays unset or `false` in the server env files. (4) The regular deploy to staging and production; the developer then runs the checklist of this file inside Telegram on both |

## Goal

The bot can show a listing: one renderer builds the card — photo with caption or text, the rows of TXT-BOT-044, four
button rows — from the listing source plus the viewer's own state, and one `CardSender` sends it and logs every sent
copy with `chat_id` and `message_id`. Every card button works: map, photos, favourite, «Уже сдано» with undo,
«Это риелтор», the «Скрыть похожие» submenu; `/fav` lists the favourites and opens their cards. The packages that
follow (starter lists, radar pushes, digests, withdrawn edits) send cards only through these classes.

## Scope

**In.**

- Handlers: the card (BOT-059), the «rented by me» state (BOT-060), the hide submenu (BOT-061), buttons on an older
  copy of a card (BOT-024), `/fav` with its empty state and list (BOT-016, BOT-072, BOT-073).
- Buttons BTN-035 … BTN-048 and BTN-066; texts TXT-BOT-044 … TXT-BOT-046, TXT-BOT-048 … TXT-BOT-056, TXT-BOT-072,
  TXT-BOT-073.
- The button `📞 Показать номер` and its handler (DEC-52): a HOMI addition, not one of the 76 audited buttons.
- The table `bot_listing_messages`, `ListingCardRenderer`, `ListingCardKeyboard`, `CardSender`,
  `OpenListingByNumber` (the handler behind every "open this listing" button of the bot).
- The demo marker on cards built from stub data and the `source_unavailable` answers of every handler here.
- Removing `fav` from `config('bot.interim_commands')`.

**Out.**

- The listing source, the per-user overlay, the media address of photos — WP-42. Favourites, hidden listings, blocked
  authors, votes with weights and thresholds — WP-44. Radar hide rules — WP-45.
- The starter list and its number buttons (BTN-031) — WP-54; it calls `OpenListingByNumber` from this package.
- The radar card line `🙈 скрыто: …` and «Показать скрытое» — WP-55.
- Radar pushes, digests, send pacing, the edit of delivered copies when a listing is withdrawn and its text
  TXT-BOT-047 — WP-57; it calls `CardSender` and reads the log of this package.
- Erasure of the log rows — WP-47 (procedure) and WP-56 (the bot's button).
- Action-log events of card buttons, the coverage test — WP-58.
- Call links and sharing are not part of the bot's card. The author's number is not in the card either: its text
  arrives masked, and one button gives the number through the contact service of WP-43 (DEC-52).

The queue lists WP-52, WP-42, WP-44 and WP-45 under "Depends on": this package calls the radar hide-rule service
of WP-45, so do not start before WP-45 is `DONE`. It also calls `ContactService` of WP-43, which the strict order
of the queue has finished long before (stage C).

## Decisions that bind this package

| # | Decision or plan section | Consequence here |
| - | ------------------------ | ---------------- |
| 1 | DEC-40 — a new bot, no data moved | The log holds only cards this bot sent; there is no migrated log, no re-send check against one, and no button of another bot to decode |
| 2 | DEC-42, `25` §4.1 — listings come from the listing source and are addressed by number | No `Listing` model. A card is `ListingSource` data read through the application service of WP-42; callbacks and the log carry the public number |
| 3 | `25` §4.5 "Per-user overlay", "Locale and currency", "Photos", "Caching" | `favorite` comes from the overlay; display strings are used as given, raw values feed the rows the bot composes itself; photos are HOMI media addresses; a card answer may be up to one minute old |
| 4 | `25` §5 and Q-API-063 — number plus source channel and post | `bot_listing_messages` stores `listing_number`, `source_channel`, `source_post_id` |
| 5 | DEC-48 — reports and votes live in HOMI only | «Уже сдано» and «Это риелтор» call `VoteService`; nothing is sent to legacy; thresholds change only what HOMI shows |
| 6 | DEC-36 — defects fixed, behaviour changes off | Fixed here: LB-BOT-004, LB-BOT-006, LB-BOT-007. Behind switches that are off: DEV-010 (`bot.dev010`), DEV-034 (`bot.hide_rules.scope`) |
| 12 | DEC-52 — the author's number only after a tap | The card prints no phone number: the quote of the post is masked by the source (WP-12). `📞 Показать номер` gives the number through `ContactService::disclose()` of WP-43 — the same service, quota and log as the Mini App. On by decision, no flag |
| 13 | DEC-53 — favourites paged by 20 | `/fav` reads its pages through `FavoriteService::page()`, the method behind `GET /api/v1/favorites`, 20 per page |
| 7 | DEC-43 — full parity, open access | Every button of the card is built, including the submenu row legacy never showed |
| 8 | DEC-45 — every merge reaches production | `/fav` leaves the interim list in this PR; cards from stub data carry the demo marker (`25` §4.4, RK-27) |
| 9 | DEC-33 — only servers call legacy | Tests use the `stub` driver and the fake Bot API; photos are uploaded as files locally and in tests |
| 10 | DEC-46 — functional parity | The checklist below; texts equal the audit except brand words (none in this package) and the fixed deposit row |
| 11 | `docs/handoff/parallel-work.md` §3, §6 | One additive migration, flagged; one env key through a shared-file PR |

## Design

Names of other packages are expectations taken from the KV-BE and KV-TG task files. The specifications of WP-42,
WP-44, WP-45, WP-46, WP-50, WP-51 and WP-52 are authoritative for names; if one differs, use its name and do not
create a second service.

### Where a card comes from

`App\Telegram\Rendering\ListingCardDataFactory::for(User $viewer, int $number): CardLookup` returns
`Found(ListingCardData)`, `NotFound` or `SourceUnavailable`. It makes two reads:

1. The single-card read `GET /api/v1/listings/{number}` uses (rules of KV-BE-034 and KV-BE-036). WP-42 has no
   single service for it: its controller resolves the source — `SourceManager::resolve('source.listings.card',
   $context)` of WP-10, a `ResolvedSource` whose `driver` becomes `metaSource` — calls `details($number, $context)`
   on it and then the card step of `App\Services\Listings\ListingOverlay`. The factory
   makes the same two calls with a `SourceContext` of the viewer (locale, currency) and does **not** call
   `ViewRecorder`, so no view is recorded (history is "listings opened in the app", BR-BOT-085). The overlay
   returns the card of a hidden listing with its flags (WP-42, "Overlay" rule 2), which the «rented by me» card
   needs. No second reader is written here.
2. The viewer's own active votes for this listing. `VoteService` of WP-44 (`App\Services\Personal`) has `report()`
   and `withdraw()` only, so this package adds `activeReasons(User, ListingPointer): list<ReportReason>` to it.

`ListingCardData` (readonly). "Display" is a string the answer already formatted for the viewer's locale and
currency; "raw" is the value next to it (`25` §4.5). Field names of the v1 card resource are fixed by WP-12 and
WP-42; the legacy names of `08` §1.8 are given for orientation.

| Field | Kind | Source |
| ----- | ---- | ------ |
| `number` | raw | the number of the **answer** (it differs from the number asked when the source merged a duplicate) |
| `sourceChannel`, `sourcePostId` | raw, nullable | the first source of the answer (`sources[0]`, `original_url`) |
| `metaSource` | raw | `meta.source` of the answer: `stub`, `legacy` or `native` |
| `status` | raw | active or withdrawn (legacy: `status_text` not null, `post_deleted`) |
| `title`, `dealLabel` | display | `short_title` or the first part of `title`; deal name from the catalogue by raw `deal_type` |
| `price` | display + raw | `price`; raw `price_usd` |
| `market` | raw, nullable | `median_delta`, `median_value`, `median_n`, `median_scope`, `median_near_class`, `median_radius_km`, `median_district`, `median_metric`; `null` when the answer has no comparison |
| `district`, `districtCode`, `place` | display, raw, display | `district_name`; its code; `place` or `landmark` |
| `metro`, `metroKm`, `centerKm` | display, raw, raw | `metro`, `metro_km`, `center_km` |
| `area`, `floor`, `floorsTotal` | raw | `area_total`, `floor`, `floors_total` |
| `renovation`, `furniture` | display, nullable | values of `facts` with the keys `renovation`, `furniture` |
| `deposit` | raw | `DepositState`: `Required`, `NotRequired`, `Unknown`. From the raw deposit value of the answer; when the contract carries none, always `Unknown` — list that gap in the PR |
| `summary`, `originalText` | display, nullable | `summary`, `original_text`; phone numbers in both are already masked to their last two digits by the data object (`PhoneMasker` of WP-12) |
| `sources`, `duplicates` | raw | list of `{handle, url}`; `duplicates` = their count minus one |
| `publishedAt`, `age` | raw + display | publication time; `age` |
| `photos` | raw | ordered HOMI media addresses (`photos`); the first one is the cover |
| `lat`, `lon` | raw, nullable | `lat`, `lon` |
| `authorKind`, `authorKey`, `isOwner`, `ownerVerified` | raw | `author.kind` (`phone`, `source` or none); the author key WP-44 uses for blocked authors; `is_owner`; `owner_verified` |
| `hasPhone` | raw | `contact.has_phone`: the contact method can give a number or a call link. The card data holds no number |
| `favorite` | raw | overlay flag |
| `rentedByViewer`, `agentVotedByViewer` | raw | read 2 above: an active, not withdrawn vote of the viewer |
| `locale`, `currency` | raw | the viewer's settings |

`ListingCardData::ref()` returns the `App\Services\Listings\ListingPointer` of WP-42 (number, source channel,
source post) that `FavoriteService`, `HiddenService` and `VoteService` of WP-44 take; "ref" in the sections below
means this object.

### Rendering

`App\Telegram\Rendering\ListingCardRenderer::render(ListingCardData, ?string $heading = null): CardMessage`;
`CardMessage {bool $isPhoto, ?string $photo, string $html, InlineKeyboard $keyboard}`. The variant is derived from the
data on every render: withdrawn → `Withdrawn`; `rentedByViewer` → `Rented`; otherwise `Default`. `$heading` is an
optional first line for WP-57 (whether a push names its radar is its decision, Q-BOT-002).

Rows, in the order of `tb:619–634` (variants `tb:638–644`); every interpolated value goes through the escaping
helper of WP-51, and a row whose value is missing is left out, never printed empty:

| # | Row | Content |
| - | --- | ------- |
| 0 | marker lines | `bot.card.demo_marker` when `metaSource` is `stub`; then `$heading`; then TXT-BOT-046 in the `Rented` variant |
| 1 | `🏠` | title (bold) · deal |
| 2 | `💰` | price (bold) |
| 3 | `📊` | market comparison composed from `market` (BR-BOT-059), for example `на 20% ниже обычного у 12 ближайших в обычных домах (до ~0,3 км, ~$625/мес)` or `на уровне обычного (Юнусабад, ~$640/мес)`; per square metre where the metric says so (`~$11/м²/мес`) |
| 4 | blank line | |
| 5 | `📍` | district · place; the distance to the centre stands here when there is no metro |
| 6 | `🚇` | station · distance to the centre |
| 7 | blank line | |
| 8 | `🏢` | area · floor |
| 9 | `🛠` | renovation (· furniture) |
| 10 | deposit | `bot.card.deposit.required` or `bot.card.deposit.not_required`; nothing for `Unknown` (fix of LB-BOT-004) |
| 11 | `📝` | summary |
| 12 | blank line | |
| 13 | `🔗` (italic) | channel handle linked to the post · `ещё N` when `duplicates` > 0 · `🕐` time in Asia/Tashkent, age (BR-BOT-058, BR-BOT-008) |
| 14 | quote | the original post in `<blockquote expandable>`, as the source gives it: with its phone numbers masked (`+998 ** *** ** NN`, WP-12) |

- Photo variant when `photos` is not empty and the listing is not flagged "photos gone" (see "Photos"): the first
  photo with the card as caption. Text variant otherwise, with the link preview disabled (BR-BOT-056).
- Limits: `App\Telegram\Rendering\CaptionLimiter` keeps the visible text (tags stripped, entities decoded, counted in
  UTF-16 code units as Telegram counts) within 1 024 for a caption and 4 096 for a text. It shortens the quote first
  (ending in `…`), drops it when nothing useful is left, then shortens the summary; it never cuts inside a tag or an
  entity, and rows 1 and 2 are never shortened.
- The `Withdrawn` variant is the title row plus `bot.card.withdrawn` (TXT-BOT-047, keyed by WP-51, owned by WP-57)
  and no keyboard — the same body WP-57 edits delivered copies into.

### Keyboard

`App\Telegram\Keyboards\ListingCardKeyboard` (BR-BOT-057, BR-BOT-004). A row left without buttons is dropped.

| Variant | Rows |
| ------- | ---- |
| `Default` | `[📱 Открыть в приложении][📍 На карте]` / `[🔗 Открыть оригинал][📷 Ещё N фото]` / `[⭐ В избранное` or `★ В избранном][Это риелтор]` / `[Уже сдано][Скрыть похожие]` / `[📞 Показать номер]` |
| `Rented` | rows 1 and 2 as above / `[⭐ В избранное` or `★ В избранном][↩️ Не сдано]` / `[📞 Показать номер]` |
| `HideSubmenu` | `[📢 Канал @<канал>]` / `[📍 Район <район>]` / `[👤 Этого риелтора]` / `[✖️ Отмена]`, one per row |
| `RadarChoice` | one row per radar of the user (title, at most 40 characters, newest first) / `[✖️ Отмена]` |
| `Withdrawn` | none |

| Button | Type | Shown when | Data or address |
| ------ | ---- | ---------- | --------------- |
| `📱 Открыть в приложении` (BTN-035) | `web_app`, `primary` | always | `MiniAppUrl::listing(number)` of WP-52 |
| `📍 На карте` (BTN-036) | callback | `lat` and `lon` present | `k1:cd:<n>:map` |
| `🔗 Открыть оригинал` (BTN-037) | `url` | channel and post known | `https://t.me/<channel>/<post>`; host allow-list `t.me` (SEC-REQ-019) |
| `📷 Ещё N фото` (BTN-038) | callback | photos deliverable; N = number of photos | `k1:cd:<n>:ph` |
| `⭐ В избранное` (BTN-039) | callback | `favorite` is `false` | `k1:cd:<n>:fv:1` |
| `★ В избранном` (BTN-040) | callback | `favorite` is `true` | `k1:cd:<n>:fv:0` |
| `Это риелтор` (BTN-041) | callback | always while `bot.dev010` is off | `k1:cd:<n>:ag:1` |
| `Уже сдано` (BTN-042) | callback | `Default` variant | `k1:cd:<n>:rt:1` |
| `↩️ Не сдано` (BTN-043) | callback | `Rented` variant | `k1:cd:<n>:rt:0` |
| `Скрыть похожие` (BTN-044) | callback | `Default` variant | `k1:cd:<n>:hs` |
| `📢 Канал @<канал>` (BTN-045) | callback | submenu, channel known | `k1:cd:<n>:hc` |
| `📍 Район <район>` (BTN-046) | callback | submenu, district known | `k1:cd:<n>:hd` |
| `👤 Этого риелтора` (BTN-047, new label `bot.card.hide.realtor`) | callback | submenu, `authorKind` is `phone` **and** the service of WP-45 accepts author rules (`config('radar.author_hide_rules')`, default `false`) | `k1:cd:<n>:ha` |
| `✖️ Отмена` (BTN-048) | callback | submenu and radar choice | `k1:cd:<n>:hx` |
| radar title | callback | radar choice | the pressed rule with the radar: `k1:cd:<n>:hc:<r>`, `…:hd:<r>`, `…:ha:<r>` |
| `<n>. <title> · <district> · <price>` (BTN-066) | callback | `/fav` list | `k1:ln:<n>:f` |
| `📞 Показать номер` (no audit id; new label `bot.card.show_phone`) | callback | `Default` and `Rented` variants, `hasPhone` is `true`; always the last row, so the four audited rows keep their layout | `k1:cd:<n>:ct` |

`<n>` is the listing number in base 36; `<r>` is the radar's ULID, the primary key of WP-45 (26 characters; the
codec of WP-51 allows an argument of that length). The channel, the district and the author are never taken
from callback data: the handler reads them from the listing (SEC-REQ-011).

### Callback handlers

Three action codes are registered with the codec of WP-51.

- `cd` → `App\Telegram\Handlers\Card\CardCallback`. It validates the operation and its argument (table above; `fv`
  and `rt` take `1` or `0`; `ag` takes `1`, and `0` only while `bot.dev010` is on), loads the card once through
  `ListingCardDataFactory`, and calls one of `ShowOnMap`, `ShowPhotos`, `ToggleFavourite`, `MarkRented`,
  `VoteRealtor`, `HideSimilar`, `ShowContact` (operation `ct`, no argument). Common answers, before any operation
  runs:
  `NotFound` → alert TXT-BOT-039 (owned by WP-51) with the keyboard left as it is; `SourceUnavailable` → toast
  `bot.common.source_unavailable`, no state change, one log line; an invalid operation or argument → the stale-button
  handler of WP-51.
- `ln` → `App\Telegram\Handlers\OpenListingByNumber`, data `k1:ln:<n>:<o>[:<r>]`. Origin `<o>`: `f` = `/fav` list,
  `s` = starter list (WP-54 builds `k1:ln:<n>:s:<r>` with the radar that produced the list), `n` = any other number
  button (digest lists of WP-57). It sends the card as a **new** message through `CardSender` and answers silently;
  the list message is not touched (BR-BOT-001). A radar key that is not a radar of the actor is ignored (the card is
  logged without a radar — starter lists keep working after their radar is deleted). `NotFound` and
  `SourceUnavailable` as for `cd`.
- `fl` → `App\Telegram\Handlers\FavCommand` (paging, data `k1:fl:<page>`).

### `CardSender`

`App\Services\Delivery\CardSender`:

- `send(User $user, int $number, CardOrigin $origin, ?Radar $radar = null, ?int $replyTo = null, ?string $heading = null): CardSendResult`
  — looks the card up, renders, sends through the Bot API client of WP-50 and writes the log row. Result:
  `Sent(messageId)`, `Blocked`, `NotFound`, `SourceUnavailable`. A `403` raises `ChatUnreachable` (WP-52), writes a
  row with `state = failed` and no `message_id`, and throws nothing to the router. Any other error propagates so the
  job retries; a retry after a successful send but a failed insert can send a second copy — accepted for cards a user
  opens; WP-57 guards pushes with the claim of `DeliveryLedger`.
- `rerender(BotContext $context, ListingCardData $card): void` — edits the pressed copy from the server state: a
  photo message with `editMessageCaption`, a text message with `editMessageText`, both with the new keyboard. Whether
  the copy is a photo is read from the callback's message. "Message is not modified" counts as success; an edit
  Telegram refuses is logged at `info` and changes nothing else.
- `App\Enums\Delivery\CardOrigin`: `Instant`, `Digest`, `Starter`, `Fav`, `Number` — the origin of a row of the
  card log. WP-46 has its own enum `DeliveryOrigin` (`instant`, `digest`, `starter`) for the delivered set; the two
  are kept apart. Only radar origins enter the delivered set of WP-46; `Fav` and `Number` cards are logged here and never
  claimed there.

### Photos

`App\Services\Delivery\CardPhotoSource` decides what is handed to Telegram for photo `i` of listing `n`:

1. A cached `file_id` — cache key `tg:photo:{bot_id}:{n}:{i}`, kept 30 days. A `file_id` belongs to one bot, hence
   the bot id in the key.
2. Otherwise, with `config('telegram.media.upload')` `false` (staging, production): the HOMI media address itself;
   Telegram fetches it.
3. Otherwise (`true`: local machines, tests, CI): the bytes, read by the backend from the same address (timeout
   10 s, at most 10 MB) and sent as a multipart upload. Telegram cannot reach `*.homi.loc`.

After a successful send the `file_id` of the answer is cached. When Telegram rejects a cached `file_id`, the key is
dropped and the send is repeated once from step 2. When the cover is rejected at card time, the card is sent once as
the text variant and the listing is flagged "photos gone" (`tg:photos-gone:{n}`, 24 hours), so the text card has no
`📷` button (LB-BOT-006). `TELEGRAM_MEDIA_UPLOAD=true` goes into `backend/.env.example` (shared file, separate PR);
`phpunit.xml` sets it to `true`.

### The delivered-card log

Table `bot_listing_messages`, created here: no earlier package has it. `DeliveryLedger` of WP-46 is a different
table (`radar_deliveries`, the delivered set).

| Column | Type | Meaning |
| ------ | ---- | ------- |
| `id` | bigint identity | |
| `user_id` | → `users`, cascade on delete | the recipient |
| `chat_id` | bigint | equals the Telegram id in a private chat; stored because edits address the chat |
| `message_id` | bigint, null | `null` only for `failed` |
| `listing_number` | bigint | the number of the card answer |
| `source_channel`, `source_post_id` | string(64) null, bigint null | the listing's first source, when the source provides it |
| `radar_id` | → `radars` (key type of WP-45), null, set null on delete | the radar that produced the card: pushes, digests, starter lists |
| `origin` | string(16) | value of `CardOrigin` |
| `is_photo` | boolean | photo message or text message — an edit without a callback (WP-57) needs it |
| `state` | string(24), default `sent` | `App\Enums\Delivery\CardMessageState`: `sent`, `failed`; WP-57 adds `edited_withdrawn`, `edit_failed` |
| `sent_at`, `edited_at` | timestamp with time zone; the second null | |

Indexes: unique `(chat_id, message_id, listing_number)` — one digest message may hold several listings;
`(listing_number, state)` for the fan-out of withdrawn edits; `(user_id, sent_at)` for erasure and support;
`(radar_id)`. Model `App\Models\BotListingMessage` with a factory; no seeder (a log table has no seed data — say so
in the PR). The rows hold ids only, never text (BR-BOT-085).

The table is **not** partitioned in Wave 1, unlike the note in `10-target-architecture.md` §9: the unique key
above cannot exist on a table partitioned by `sent_at`, the SQLite test suite cannot model partitions, and a new
product starts empty. Retention is not decided here: rows leave by erasure only; WP-70 sets a retention window
together with the privacy text.

| Package | Writes | Reads |
| ------- | ------ | ----- |
| WP-53 | cards opened from `/fav` (`Fav`) and by number (`Number`) | `radar_id` of the pressed copy for the hide-rule target |
| WP-54 | starter-list cards (`Starter`, with the radar) through `OpenListingByNumber` | — |
| WP-57 | pushes (`Instant`), digest rows (`Digest`), `edited_withdrawn`, `edit_failed`, `edited_at`, `failed` | all `sent` rows of a listing number for the withdrawn edit |
| WP-47, WP-56 | deletes a user's rows on erasure (registry of `ErasureService`; the cascade is the last guard) | — |

### Hide-rule target

`App\Telegram\Handlers\Card\HideRuleTarget::resolve(BotContext, ListingCardData, ?string $radarKey): Radar|HideTargetChoice|null`
with `config('bot.hide_rules.scope')` = `radar` (legacy scope, BR-BOT-063):

1. A radar key in the callback (the user pressed a radar title) → that radar of the actor; none → stale-button handler.
2. Otherwise the log row of the pressed copy (`chat_id`, `message_id`, `listing_number`) names a radar that still
   exists and belongs to the actor → that radar.
3. Otherwise by the number of the user's radars, active or paused: none → `null`; one → it; several →
   `HideTargetChoice` (the `RadarChoice` keyboard).

The rule is stored with `RadarHideRuleService` of WP-45 (rules of KV-BE-106):
`addFromListing(User $user, int $number, HideRuleKind $kind, ?Radar $origin): bool`. The service reads the channel,
district code or author key from `listing_refs` itself and returns `false` when the listing has none. The bot
always passes a radar, so the service's own fallback for "no radar" is never used. The write is idempotent per
radar, kind and value.

Radar titles for the choice: neither WP-45 nor the radar resource of WP-13 has a title, so this package creates
`App\Telegram\Rendering\RadarTitle` in the format of TXT-BOT-059 (owned by WP-55, which then extends this class).

`scope = user` is DEV-034: rules become user-wide (channel → blocked source, realtor → blocked author, district → a
user-wide rule shown in «Скрытое») and no radar is asked for. WP-45 has no user-wide mode (`config/radar.php` holds
no such key; its rules are per radar), so `radar` is the only accepted value until DEV-034 is approved: a config
test asserts it and the `user` cases stay Pest `todo`.

### `/fav`

`App\Telegram\Handlers\FavCommand` reads the favourites through `FavoriteService::page($user, $cursor, $limit,
$context)` of WP-44 (`App\Services\Personal`) — the method behind `GET /api/v1/favorites`, newest first, as
listing previews, 20 per page with a cursor (DEC-53) — and renders with `App\Telegram\Keyboards\FavListKeyboard`.
Page size `config('bot.fav.page_size')` = 20, the default of the API. The callback keeps carrying a page number
(`k1:fl:<page>`): a cursor does not fit into callback data, so page `p` is reached by following `nextCursor` from
the first page, `p − 1` further reads. `▶️` is shown while the page read has a `nextCursor`; the count in the
title is `$user->favorites()->count()`.

### Configuration

| Key | Value |
| --- | ----- |
| `bot.dev010` | `false` |
| `bot.hide_rules.scope` | `radar` |
| `bot.fav.page_size` | `20` |
| `bot.card.album_lock_seconds` | `30` |
| `bot.card.actions` | `true` (exists only if the PR is cut in two) |
| `telegram.media.upload` | `env('TELEGRAM_MEDIA_UPLOAD', false)` |
| `bot.interim_commands` | `fav` removed |

New catalogue keys (not among the 88 legacy texts; Russian drafts, `uz` and `en` drafts for the proofreader):
`card.deposit.required` `🔐 депозит`, `card.deposit.not_required` `🔐 без депозита`, `card.hide.realtor`
`👤 Этого риелтора`, `card.hide.which_radar` `В каком радаре скрыть?`, `card.hide.no_radar`
`Правила хранятся в радаре. Сначала включите радар: /new`, `fav.prev` `◀️`, `fav.next` `▶️`, `card.show_phone`
`📞 Показать номер`, `card.phone` `📞 :phone`, `card.call_link` `Позвонить можно по ссылке:` with the button
`card.call_button` `📞 Позвонить`, `card.phone_unavailable` `Номер сейчас недоступен`; behind DEV flags:
`card.agent.voted` `Спасибо, проверим`, `card.agent.already` `Уже отмечено`, `card.agent.undo` `↩️ Не риелтор`,
`card.agent.withdrawn` `Отметку убрал`, `card.hide.saved_user`
`Скрыл. Убрать правило — в приложении: Настройки → Скрытое`.

## Files

New, under `backend/`:

- `database/migrations/<date>_create_bot_listing_messages_table.php`,
  `app/Models/BotListingMessage.php`, `database/factories/BotListingMessageFactory.php`
- `app/Enums/Delivery/{CardOrigin,CardMessageState}.php`, `app/Enums/Telegram/DepositState.php`
- `app/Telegram/Rendering/{ListingCardData,ListingCardDataFactory,CardLookup,ListingCardRenderer,CardMessage,CaptionLimiter}.php`
- `app/Telegram/Rendering/RadarTitle.php`
- `app/Telegram/Keyboards/{ListingCardKeyboard,FavListKeyboard}.php`
- `app/Services/Delivery/{CardSender,CardSendResult,CardPhotoSource}.php`
- `app/Telegram/Handlers/Card/{CardCallback,ShowOnMap,ShowPhotos,ToggleFavourite,MarkRented,VoteRealtor,HideSimilar,HideRuleTarget,ShowContact}.php`
- `app/Telegram/Handlers/{OpenListingByNumber,FavCommand}.php`
- `tests/Unit/Telegram/{ListingCardRendererTest,ListingCardKeyboardTest,CaptionLimiterTest}.php`
- `tests/Feature/Bot/Card/{CardSenderTest,CardPhotoSourceTest,OpenListingByNumberTest,CardMapPhotosTest,FavouriteRentedTest,RealtorVoteTest,HideSimilarTest,ShowContactTest}.php`,
  `tests/Feature/Bot/FavCommandTest.php`
- `tests/Fixtures/Bot/transcripts/{card,card-map-photos,card-favourite-rented,card-realtor,card-hide-similar,card-phone,fav}.json`

Changed:

- `backend/config/bot.php`, `backend/config/telegram.php` (`media.upload`), `backend/phpunit.xml`
- `backend/app/Providers/TelegramServiceProvider.php` (command `fav`, actions `cd`, `ln`, `fl`)
- `backend/lang/{ru,uz,en}/bot.php` (the new keys above)
- `backend/app/Services/Personal/VoteService.php` of WP-44 — the new read `activeReasons()`
- `backend/config/erasure.php` of WP-47 — entry `bot_listing_messages`, strategy `delete`; and
  `backend/config/retention.php` — `bot_listing_messages`: `kept`, "needed to edit delivered copies; window set by
  WP-70" (`ErasureRegistryTest` and `RetentionRegistryTest` of WP-47 fail without them)
- `backend/tests/Support/Telegram/FakeBotApi.php` is not changed: WP-50 already validates `sendVenue`,
  `sendMediaGroup` and `editMessageCaption`
- `docs/infrastructure/telegram-webhook.md` — callback registry rows `cd`, `ln`, `fl`
- Separate shared-file PR: `backend/.env.example` (`TELEGRAM_MEDIA_UPLOAD`), `docs/infrastructure/environments.md`

## Steps

Tests first inside each step; `vendor/bin/pint --dirty --format agent` after every PHP edit.

1. Shared-file PR for `TELEGRAM_MEDIA_UPLOAD`; `config/telegram.php`, `phpunit.xml`.
2. Migration, `BotListingMessage`, its factory, the enums, the entry in `config/erasure.php`.
3. `ListingCardData`, `ListingCardDataFactory`, `CardLookup` on the stub driver; `VoteService::activeReasons()`.
4. `CaptionLimiter`, `ListingCardRenderer`, `CardMessage`, the new deposit keys; `ListingCardRendererTest`,
   `CaptionLimiterTest`.
5. `ListingCardKeyboard` with all variants; `ListingCardKeyboardTest` (including the 64-byte check of every data string).
6. `CardPhotoSource` and `CardSender` (`send`, `rerender`, the log); `CardSenderTest`, `CardPhotoSourceTest`.
7. `OpenListingByNumber`, `FavCommand`, `FavListKeyboard`; remove `fav` from the interim list; `FavCommandTest`,
   `OpenListingByNumberTest`, transcript `fav.json`.
8. `CardCallback` with `ShowOnMap`, `ShowPhotos` and `ShowContact` (the phone row of the keyboard);
   `CardMapPhotosTest`, `ShowContactTest`.
9. `ToggleFavourite`, `MarkRented`, the `Rented` variant end to end; `FavouriteRentedTest`.
10. `VoteRealtor` and `bot.dev010`; `RealtorVoteTest` (DEV cases `todo`).
11. `HideSimilar`, `HideRuleTarget`, the submenu and radar-choice keyboards, `bot.hide_rules.scope`; `HideSimilarTest`.
12. Remaining transcripts, registry rows in `docs/infrastructure/telegram-webhook.md`, the audit rows this package
    settles by specification (Q-BOT-009, Q-BOT-028, Q-BOT-038), `make ci-backend`, review by the other developer
    and the `security-reviewer` agent (escaping, votes), the PR with the ticked checklist, the check inside Telegram.

## Behaviour to reproduce

Texts are quoted as audit `04` quotes them; long texts are cited by their `tb` lines. No text of this package
contains a brand word. Toasts and silent answers follow `04` §4.3 (BR-BOT-002).

### Coverage

| # | Kind | Items | Section |
| - | ---- | ----- | ------- |
| 1 | Handlers (7) | BOT-059; BOT-060; BOT-061; BOT-024; BOT-016, BOT-072, BOT-073 | 1 and 2; 6; 8; 9; 10 |
| 2 | Buttons (15) | BTN-035, BTN-037 (card links); BTN-036 (map); BTN-038 (photos); BTN-039, BTN-040 (favourite); BTN-041 (realtor); BTN-042, BTN-043 (rented); BTN-044, BTN-045, BTN-046, BTN-047, BTN-048 (hide); BTN-066 (`/fav`) | 1; 3; 4; 5; 7; 6; 8; 10 |
| 3 | Texts (14) | TXT-BOT-044 (card); TXT-BOT-045 (venue); TXT-BOT-046 (rented line); TXT-BOT-048, TXT-BOT-049 (favourite toasts); TXT-BOT-050 (photos toast); TXT-BOT-051, TXT-BOT-052 (hide toasts); TXT-BOT-053, TXT-BOT-054 (realtor toasts); TXT-BOT-055, TXT-BOT-056 (rented toasts); TXT-BOT-072, TXT-BOT-073 (`/fav`) | 1; 3; 6; 5; 4; 8; 7; 6; 10 |
| 4 | Shown here, owned elsewhere | TXT-BOT-039 (WP-51); TXT-BOT-047 (WP-57); the radar title TXT-BOT-059 (WP-55) | 11; 11; 8 |

### 1. The card (BOT-059)

- A photo message with the card as caption when photos can be delivered, a text message otherwise; HTML with the
  bold title and price, the italic source line and the original post in an expandable quote (BR-BOT-056).
- Body TXT-BOT-044 (`tb:619–634`, row variants `tb:638–644`) — the rows of "Rendering".
- Keyboard of the `Default` variant: `[📱 Открыть в приложении][📍 На карте]` / `[🔗 Открыть оригинал][📷 Ещё N фото]`
  / `[⭐ В избранное][Это риелтор]` / `[Уже сдано][Скрыть похожие]`; the map button only with coordinates, the photo
  button only with photos (BR-BOT-057); the first button is `primary` (BR-BOT-004). Below these four rows, for a
  listing with a phone, the row `[📞 Показать номер]` (section 12).
- `📱 Открыть в приложении` opens the listing in HOMI's Mini App; `🔗 Открыть оригинал` opens the post in its channel.
  Neither sends an update to the bot.
- A card is always a new message (BR-BOT-001) and every sent copy is logged (BR-DATA-016; `04` §5 explains why:
  without `chat_id` and `message_id` a withdrawn listing cannot be edited in the chats that hold it).
- The card shows no phone number, different from legacy by decision (DEC-52): legacy quoted the post with the
  numbers it contained. In HOMI the quote arrives with every number masked to its last two digits, and the number
  is given by `📞 Показать номер` only.
- Fix of LB-BOT-004: legacy printed `👨‍👩‍👧 депозит` for a post saying «без депозита». HOMI prints its own deposit row
  from the tri-state, with its own icon, and nothing when the state is unknown. The family icon never appears.

### 2. Opening a card

| # | Trigger | Result |
| - | ------- | ------ |
| 1 | A button of the `/fav` list (BTN-066) | New message with the card; origin `Fav`; silent answer; the list is unchanged |
| 2 | A number button of a starter list (WP-54) or of a digest (WP-57) | The same through `OpenListingByNumber`; origin `Starter` with its radar, or `Number` |
| 3 | A push or a digest (WP-57) | `CardSender::send` with origin `Instant` or `Digest` |
| 4 | The listing no longer exists at the source | Alert TXT-BOT-039; nothing sent; the list keeps its buttons |
| 5 | The chat is blocked (`403`) | Row `failed`, the chat marked `blocked`, no error |

### 3. `📍 На карте` (BTN-036)

1. Press → one venue message as a reply to the card: title `<3-комн. квартира · Чиланзар · $600>`
   (`ListingTitleLine` of WP-52), address `<Чиланзар · Чиланзар-19>` (district · place) — TXT-BOT-045. Silent answer.
2. The listing has lost its coordinates since the card was sent → silent answer and the pressed copy is re-rendered
   without the button.
3. The venue carries no phone and no author data. Coordinates are sent as the source gives them.

### 4. `📷 Ещё N фото` (BTN-038)

1. Press → the listing's photos as an album without captions, as a reply to the card, in the order of the listing's
   photos (the Mini App gallery order): one `sendMediaGroup` per ten photos; a single photo, or a last chunk of one,
   goes as `sendPhoto` because an album needs at least two items. Silent answer; the card and its button stay.
2. Two presses for the same chat and listing within `bot.card.album_lock_seconds` send one album; the second press is
   answered silently.
3. Telegram rejects one item → the chunk is sent once more without it.
4. No photo can be delivered (none in the answer, or every item rejected) → toast TXT-BOT-050
   `Фото больше недоступны`, the button is removed from the pressed copy (`editMessageReplyMarkup`), and the listing
   is flagged "photos gone" so the next render has no button. This is the fix of LB-BOT-006: legacy kept the button
   on text-only cards and answered the toast on every press.

### 5. Favourite (BTN-039, BTN-040)

| # | Press | Service call | Toast | Card |
| - | ----- | ------------ | ----- | ---- |
| 1 | `⭐ В избранное` (`fv:1`) | `FavoriteService::set($user, $ref)` of WP-44 | TXT-BOT-048 `Добавил в избранное ⭐ — список: /fav` | pressed copy re-rendered: `★ В избранном` |
| 2 | `★ В избранном` (`fv:0`) | `FavoriteService::unset($user, $number)` | TXT-BOT-049 `Убрал из избранного` | pressed copy re-rendered: `⭐ В избранное` |

- The button carries the state it sets, and the call is idempotent — never the toggle the Mini App had in legacy.
  This is the fix of LB-BOT-007 (legacy: `★ В избранном` on a stale copy **added** the listing). BR-BOT-060 changes
  accordingly: a press sets the state of its label, whatever the current state.
- The favourite works in every variant, and for a withdrawn listing too (the list keeps withdrawn listings).
- Each press changes at most one row of the favourites and re-renders only the pressed copy.

### 6. `Уже сдано` and `↩️ Не сдано` (BOT-060; BTN-042, BTN-043)

1. `Уже сдано` (`rt:1`) → `VoteService::report($user, $ref, ReportReason::Rented, null)`: one weighted vote, and
   the listing is hidden for the voter at once (inside the service; for other users only past its threshold, BR-BOT-062, SEC-REQ-045) →
   toast TXT-BOT-055 `Отметил как сданное — у вас скрыто; другим снимем, когда подтвердят ещё` → the pressed copy
   becomes the `Rented` variant: first line TXT-BOT-046
   `🚫 Сдано — по вашей отметке (для других снимем, когда подтвердят)`, rows 1 and 2 unchanged, the two lower rows
   replaced by `[⭐ В избранное` or `★ В избранном][↩️ Не сдано]`.
2. A repeated `rt:1` (another copy, a double tap) answers the same toast and creates no second vote (one vote per
   user, listing and reason — SEC-REQ-015).
3. `↩️ Не сдано` (`rt:0`) → `VoteService::withdraw($user, $ref, ReportReason::Rented)`, then
   `HiddenService::unhide($user, $number)` of WP-44 (it deletes the hide row whatever its reason and never touches
   votes) → toast TXT-BOT-056 `Вернул объявление` → `Default` variant.
4. The variant is derived from the server state on every render, so any copy re-renders correctly.

### 7. `Это риелтор` (BTN-041)

| # | Case | `bot.dev010` off (default) | `bot.dev010` on (DEV-010, tests `todo`) |
| - | ---- | -------------------------- | ---------------------------------------- |
| 1 | First press (`ag:1`) | `VoteService::report(user, ref, Agent)`; toast TXT-BOT-053 `Запомнил номер как риелторский — отмечу во всех его объявлениях`; label unchanged | the same vote; toast `bot.card.agent.voted`; row 3 becomes `[⭐ …][↩️ Не риелтор]` |
| 2 | Repeat | no second vote; toast TXT-BOT-054 `Уже отмечено` | toast `bot.card.agent.already` |
| 3 | Undo (`ag:0`) | no button; a forged press goes to the stale-button handler | `VoteService::withdraw(user, ref, Agent)`; toast `bot.card.agent.withdrawn`; row restored |
| 4 | Visibility | the button is on every card | hidden where `isOwner` is `false` or `ownerVerified` is `true`; a stale press answers `bot.card.agent.already` without a vote |

- Whatever the flag: one press is one weighted vote of one user; the mark on the author appears only past the
  threshold of distinct weighted voters inside `VoteService`, with its audit trail and kill switch (SEC-REQ-045,
  rules of KV-BE-043). The bot never sets a mark itself. BR-BOT-061 ("marks the number in all its listings") is
  therefore not reproduced, and until DEV-010 is approved the legacy toast promises more than HOMI does.
- LB-BOT-008 (no undo) and LB-BOT-022 (one tap labels a person, button always offered) are fixed through DEV-010:
  the security part is live, the visible part waits for the flag.
- Vote writes count against the per-user limits of the router (SEC-REQ-027).

### 8. `Скрыть похожие` (BOT-061; BTN-044 … BTN-048)

1. `Скрыть похожие` (`hs`) → toast TXT-BOT-051 `Что скрыть?`; the keyboard of the pressed copy becomes the
   `HideSubmenu`: `📢 Канал @<канал>` / `📍 Район <район>` (only with a district) / `👤 Этого риелтора` (only under
   the two conditions of the button table) / `✖️ Отмена`.
2. `✖️ Отмена` (`hx`) → the card keyboard is restored; silent answer.
3. A rule button → `HideRuleTarget`:
   - a radar is known (the copy was delivered by it, or the user has exactly one) → the rule is stored in it;
   - the user has several radars and the copy names none (a card from `/fav`, a starter list of a deleted radar) →
     toast `bot.card.hide.which_radar` and the `RadarChoice` keyboard; a radar title stores the rule in that radar;
     `✖️ Отмена` restores the card keyboard;
   - the user has no radar → toast `bot.card.hide.no_radar`; the card keyboard is restored; nothing is stored.
4. Rule stored → toast TXT-BOT-052 `Скрыл. Убрать правило — /subs → радар → «Показать скрытое»`; the card keyboard is
   restored (variant from the server state). The card itself stays in the chat; later matching of that radar
   excludes the rule (WP-46), and the radar card of WP-55 shows it as `🙈 скрыто: …` (BR-BOT-063).
5. The same rule twice is one rule. A radar deleted between the submenu and the choice → stale-button handler,
   nothing stored.

- LB-BOT-025 (`decision`): legacy stores the rule in "a radar" without saying which one when the card has none.
  HOMI keeps the per-radar scope and never guesses — step 3. The user-wide scope is DEV-034 (off).
- Q-BOT-028 is closed by specification with step 3; Q-BOT-009 with the conditions of the realtor row: author rules
  are off in WP-45 by default, so the row is not shown — as legacy never showed it.

### 9. Buttons on an older copy of a card (BOT-024)

- A chat may hold several copies of one card (opened twice, pushed and opened). Every copy keeps working without
  expiry: the callback carries only the listing number, so the action runs against the current server state
  (BR-BOT-010).
- Only the pressed copy is re-rendered; other copies and a `/fav` list already in the chat stay as they are, as in
  legacy.
- Because `fv`, `rt` and `ag` carry the state they set, a press on a stale copy does what its label says or nothing:
  it can never do the opposite (LB-BOT-007).

### 10. `/fav` (BOT-016, BOT-072, BOT-073; BTN-066)

| # | Case | Reply |
| - | ---- | ----- |
| 1 | No favourites | New message TXT-BOT-072 `В избранном пусто. Нажмите «⭐ В избранное» под карточкой — она появится здесь.`; no keyboard |
| 2 | N ≤ 20 | New message TXT-BOT-073: `⭐ Избранное (N)`, rows `<n>. 2-комн. квартира · Юнусабад · $700 · @<канал>`, last line `Нажмите на объявление, чтобы снова открыть карточку.`; one button per row labelled `<n>. 2-комн. квартира · Юнусабад · $700` (cut to 60 characters) |
| 3 | N > 20 | The first 20 rows and `▶️`; `▶️` and `◀️` edit the same message to the next or previous page (`k1:fl:<page>`), with the list read again. Q-BOT-038 (legacy cap unknown) is closed by this specification |
| 4 | A button | The card as a new message (section 2, row 1) |

- The list is a snapshot: favourites added or removed later do not change a list already in the chat, and a button
  of a removed favourite still opens its card (BR-BOT-072).
- Withdrawn favourites stay in the list (the Mini App keeps them); their card opens in the `Withdrawn` variant.
  Listings the source no longer knows are not listed (the service drops them).
- Rows use `ListingTitleLine` of WP-52 plus the channel handle; titles and handles are escaped (SEC-REQ-020).
- Favourites are read through the actor only (SEC-REQ-014).

### 11. Demo marker, source failures, withdrawn listings

- Demo marker: a card whose answer has `meta.source = stub` starts with the line `bot.card.demo_marker` (the same
  rule as the Mini App marker of `25` §4.4). Lists and venues carry no marker.
- `source_unavailable`: every callback here answers the toast `bot.common.source_unavailable`, changes no state and
  logs once; `/fav` answers it as a message. A card answer may come from the one-minute cache of the legacy driver.
- A withdrawn listing: `fv` works and the copy is re-rendered into the `Withdrawn` variant; every other card
  operation changes nothing, answers silently and re-renders the copy into that variant. WP-57 adds the toast and
  the edit of copies nobody pressed.
- A callback for a number the source does not know: alert TXT-BOT-039, nothing else.

### 12. `📞 Показать номер` (DEC-52)

| # | Case | Result |
| - | ---- | ------ |
| 1 | Press, the source gives the number | `ContactService::disclose($user, $number, $context, 'bot')` of WP-43; one new message as a reply to the card: `bot.card.phone` — `📞 <display number>` as plain text (whether a client turns it into a call link is the client's behaviour: verify against the Bot API documentation; nothing here depends on it). Silent answer; the card and its button stay |
| 2 | Press, the source gives only a call link (Q-API-062) | a reply `bot.card.call_link` with one `url` button `bot.card.call_button` to that link (host allow-list of SEC-REQ-019, extended by the call-page host) |
| 3 | The contact method answers `contact_unavailable` (no phone any more, or the user's daily limit of WP-43) | toast `bot.card.phone_unavailable`; nothing is sent |
| 4 | A second press for the same listing | answered again; the quota counts the listing once a day (WP-43) |
| 5 | Listing source down; withdrawn listing | the common toast of section 11; the withdrawn variant has no keyboard |

- The number travels in that one reply and nowhere else: the card text, the venue, `/fav` rows and the log table
  hold none; the reply is not logged in `bot_listing_messages` and its text never reaches a log line (SEC-REQ-047).
- Each disclosure counts against the same per-user quota as a tap in the Mini App and raises `ContactDisclosed`
  with the channel `bot`, from which WP-47 writes the action-log row.
- The button is absent when `hasPhone` is `false`, in the `Withdrawn` variant and in the submenus; a `ct` press
  for a listing without a phone (an outdated or forged button) goes to the stale-button handler.

### Defects, flags and questions

| # | Item | Status here |
| - | ---- | ----------- |
| 1 | LB-BOT-004, deposit row | Fixed, tested (rendering row 10) |
| 2 | LB-BOT-006, photo button without photos | Fixed, tested (section 4) |
| 3 | LB-BOT-007, favourite on a stale copy | Fixed, tested (sections 5 and 9) |
| 4 | LB-BOT-008, LB-BOT-022 → DEV-010 | Weighted vote live (SEC-REQ-045); undo, wording and visibility behind `bot.dev010` (off), tests `todo` |
| 5 | LB-BOT-025 → DEV-034 | Radar choice live; user-wide scope behind `bot.hide_rules.scope` (`radar`), tests `todo` |
| 6 | Q-BOT-009, Q-BOT-028, Q-BOT-038 | Closed by specification (sections 8 and 10); a capture on a test account could still change them |
| 7 | Q-BOT-029, legacy vote thresholds | Not needed here: thresholds are HOMI's own (WP-44, DEC-48) |
| 8 | Q-BOT-002, radar name on a push | Left to WP-57 through `$heading` |

## Tests

Layers of `25` §9. Everything runs on the fake Bot API with the listing source on the `stub` driver; a second
fixture set marks its answers `legacy` to test the absence of the demo marker.

### Pest unit

| # | Test | Cases |
| - | ---- | ----- |
| 1 | `ListingCardRendererTest` | the fixture of `tb:619–634` renders TXT-BOT-044 in `ru` except the deposit row and the phone numbers of the quote, which read `+998 ** *** ** NN`; no seven-digit run of the fixture's number is in the caption; rows in order; a missing market, metro, summary or quote drops its row; no metro → distance on the `📍` row; `NotRequired` → `card.deposit.not_required` and no family icon; `Unknown` → no deposit row; three sources → `ещё 2`; `en` and `uz` labels and number formats; title `<b>x</b> & </blockquote>` rendered literally; stub answer → marker first; `Rented` → TXT-BOT-046 first; `Withdrawn` → title + TXT-BOT-047, no keyboard |
| 2 | `CaptionLimiterTest` | 5 000-character post → caption ≤ 1 024 visible units, cut inside the quote, valid HTML; emoji counted as two units; quote dropped when too little is left; rows 1 and 2 intact |
| 3 | `ListingCardKeyboardTest` | four rows with coordinates and photos, and the phone row as the fifth when `hasPhone`; no phone row without it, in `Withdrawn` or in a submenu; no map or photo button without them; no original button without a post; `primary` on the first button and `?listing=<n>` in its address; `Rented`, `HideSubmenu` (with and without district and realtor rows), `RadarChoice`; every data string ≤ 64 bytes with the largest number and radar key |

### Pest feature

| # | Test | Cases |
| - | ---- | ----- |
| 1 | `CardSenderTest` | `sendPhoto` + one row (`sent`, `message_id` of the answer, `is_photo`, origin, radar, channel and post); text variant → `sendMessage` with the link preview disabled; `403` → row `failed`, `ChatUnreachable`, no exception; unknown number → `NotFound`, nothing sent; `source_unavailable` → nothing sent; `rerender` edits only the given message and treats "not modified" as success |
| 2 | `CardPhotoSourceTest` | address handed over when upload is off; multipart when on; cached `file_id` used; rejected `file_id` dropped and retried once; rejected cover → text card, "photos gone" flag, no photo button |
| 3 | `OpenListingByNumberTest` | origins `f`, `s` with a radar of the actor, `s` with a foreign radar key (logged without radar), `n`; unknown number → alert, list keyboard intact; source down → toast |
| 4 | `CardMapPhotosTest` | venue reply with title and address, silent; coordinates gone → re-render without the button; 4 photos → one album; 12 → albums of 10 and 2; 11 → album of 10 and one `sendPhoto`; 1 → `sendPhoto`; double press → one album; one rejected item → retry without it; none deliverable → toast, button removed, flag set |
| 5 | `FavouriteRentedTest` | add, remove; two copies: add on A, press `⭐` on stale B → still one favourite, B re-rendered; remove on A, press `★` on stale B → not a favourite (LB-BOT-007); `Уже сдано` → vote, hidden for the voter, `Rented` variant; twice → one vote; `↩️ Не сдано` → vote withdrawn, visible again, `Default`; favourite inside `Rented` keeps the variant; forged `fv:2` → stale-button alert |
| 6 | `RealtorVoteTest` | first press → one vote, TXT-BOT-053; repeat → TXT-BOT-054, one row; ten presses on ten copies → one vote, no mark; three users past the configured threshold → the mark is set by the service, the bot sends nothing more; `ag:0` with the flag off → stale-button alert; flag-on cases `todo` |
| 7 | `HideSimilarTest` | submenu rows; cancel; copy with a radar in the log → rule in that radar; no log radar, one radar → it; two radars → choice, rule only in the chosen one; no radar → toast, nothing stored; deleted radar of the log → treated as none; same rule twice → one; listing without district → no district row; realtor row only with both conditions; radar key of another user → stale-button alert; scope `user` cases `todo` |
| 8 | `FavCommandTest` | empty; one favourite; button → card with origin `Fav`, list not edited; favourite removed afterwards → old button still opens the card; 25 favourites → 20 rows + `▶️` and the title `(25)`, then 5 + `◀️`, read through two calls of `FavoriteService::page()` (the second with the cursor of the first); 20 favourites → no `▶️`; `uz` and `en`; source down → message `bot.common.source_unavailable` |
| 9 | `ShowContactTest` | a listing with a phone → one reply `📞 <number>` to the card, silent answer, one `ContactDisclosed` with channel `bot`; link-only → the reply with the `url` button; soft limit 1 and a second listing → toast, nothing sent, no event; the first listing again → answered; `hasPhone` false and a forged `ct` → stale-button alert; source down → toast; the test log and `bot_listing_messages` hold no digit run of the number |

### Conversation tests (fake update in → expected Bot API calls out)

| # | Transcript | Conversation | Expected |
| - | ---------- | ------------ | -------- |
| 1 | `fav.json` | `/fav` with none; with one; press the row | TXT-BOT-072; TXT-BOT-073 with one button; `sendPhoto` with the card |
| 2 | `card.json` | open a card with photos, coordinates, metro and market data in `ru`, `uz`, `en` | caption rows in order, the four audited keyboard rows (and the phone row when the listing has a phone) |
| 3 | `card-map-photos.json` | `📍 На карте`; `📷 Ещё 4 фото`; the same on a listing whose photos are gone | `sendVenue` as a reply; `sendMediaGroup` of four; toast and `editMessageReplyMarkup` |
| 4 | `card-favourite-rented.json` | `⭐ В избранное` → `★ В избранном` → `Уже сдано` → `↩️ Не сдано` | the four toasts in order; four edits of the same message |
| 5 | `card-realtor.json` | `Это риелтор` twice | TXT-BOT-053, then TXT-BOT-054; no edit |
| 6 | `card-hide-similar.json` | `Скрыть похожие` → `✖️ Отмена`; again → `📢 Канал …` with two radars → a radar title | toast and submenu; restore; toast and radar choice; TXT-BOT-052 and restore |
| 7 | `card.json` | a card from the stub driver; the same from a `legacy`-marked fixture | first line is the demo marker; no marker |
| 8 | `card-phone.json` | a card whose post holds a number; `📞 Показать номер` | the quote shows the masked number and the keyboard has five rows; a reply with the number, silent answer |

## Acceptance checklist

Run every functional line in `ru`, `uz` and `en` on staging, then on production (DEC-45). Entry point until WP-54
lands: add favourites in the Mini App, then `/fav`.

- [ ] `/fav` with no favourites answers the empty text; with favourites it answers the numbered list with one button
      per listing.
- [ ] A list button sends the card as a new message and leaves the list unchanged.
- [ ] A listing with photos arrives as a photo with the card as caption; one without photos as a text message.
- [ ] The card rows appear in the audit's order; a listing without metro, market data or summary has no empty row.
- [ ] The deposit row shows "deposit" or "no deposit" with its own icon, or is absent; the family icon never appears.
- [ ] `📱 Открыть в приложении` is highlighted and opens this listing in the Mini App.
- [ ] `🔗 Открыть оригинал` opens the original post in its channel.
- [ ] A phone number inside the quoted post is shown masked to its last two digits; `📞 Показать номер` is present
      only for a listing with a phone and answers with the number as a reply to the card; the same listing counts
      once towards the daily limit shared with the Mini App.
- [ ] `📍 На карте` is present only with coordinates and answers with a venue replying to the card, without a toast.
- [ ] `📷 Ещё N фото` is present only with photos and answers with the album replying to the card; the button stays.
- [ ] Two quick presses of the photo button send one album.
- [ ] For a listing whose photos are gone, the press shows «Фото больше недоступны» once and the button disappears.
- [ ] `⭐ В избранное` shows its toast and the button becomes `★ В избранном`; the listing appears in `/fav` and in
      the Mini App.
- [ ] `★ В избранном` shows its toast and the button returns; the listing leaves the Mini App favourites.
- [ ] On a second, older copy of the same card a favourite press does what its label says and only that copy changes.
- [ ] `Уже сдано` shows its toast, puts the «🚫 Сдано…» line first and swaps the lower rows; the listing disappears
      from this user's feed in the Mini App and stays visible to another user.
- [ ] `↩️ Не сдано` shows its toast and restores text and keyboard; the listing is back in the feed.
- [ ] `Это риелтор` shows the first toast, then «Уже отмечено»; the listing is not relabelled for another user.
- [ ] `Скрыть похожие` shows «Что скрыть?» and the submenu; `✖️ Отмена` restores the keyboard without a toast.
- [ ] With one radar, choosing the channel shows the «Скрыл…» toast and restores the keyboard; the radar's hidden
      count in the Mini App grows.
- [ ] With two radars, the bot asks which radar and stores the rule only there; with none it says so and stores nothing.
- [ ] A card built from stub data starts with the demo marker; with the legacy source it does not.
- [ ] With the listing source down, a card button shows the "source unavailable" toast and nothing changes
      (shown by the feature tests; not reproducible by hand).
- [ ] Every sent card has one row in `bot_listing_messages` with chat, message, number, channel, post and origin.
- [ ] Telegram fetches card photos from the media host on staging and production (no upload, no fallback to text).
- [ ] `fav` is gone from `config('bot.interim_commands')`.
- [ ] Tests of this package are green; `make ci-backend` is green; DEV cases are `todo`, not skipped silently.
- [ ] Every transcript of the list above exists and passes; captions and texts pass the fake Bot API validators.
- [ ] The migration and the env key are named in the PR description for the production track.
- [ ] The queue, the audit rows touched in step 12 and the session handoff are updated.

## Handoff

Empty — nobody has started this package.
