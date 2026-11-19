# WP-89 — Bot: requests to owners, answers to seekers, the operators' notice, the switch-on

| Field | Value |
| ----- | ----- |
| Stage | D |
| Status | TODO |
| Depends on | WP-57, WP-85, WP-88, WP-53 |
| Size | about 2 600 changed lines with tests, L. If it grows: two PRs. Part A = steps 1–8 (notices, the request messages, the answer buttons, the seeker's messages). Part B = steps 9–13 (native cards, withdrawn edits, the operators' notice, the switch-on). Production works after either part, with the cabinet switched off |
| Behaviour reference | `04` BOT-087 … BOT-091, §3.18, §5, Q-BOT-048, Q-BOT-049; `02` BR-API-176, BR-API-177, BR-API-181, BR-API-186; `03` SCR-058, BR-APP-090, BR-APP-098; `16` SEC-039, SEC-REQ-051, SEC-REQ-053; `25` §5 (the owner cabinet before real owners: the gates) |
| Needs from the production track | (1) Approval of one additive migration: table `bot_notices`. (2) `OWNER_MODERATOR_IDS` (comma-separated Telegram ids of the operators) in the server env of staging and production, and each operator has pressed Start in HOMI's bot of that environment (a bot can write only to a user who started it). (3) After the deploy: `OWNER_CABINET_ENABLED=true` on staging and a Horizon restart, for the checks of this package with test accounts (item 22). (4) On production only when the gates of `25` §5 are closed (DEC-81), by the procedure of "Switching the cabinet on", with the product owner's go |

## Goal

Owners get every request in HOMI's bot and can answer it there as in «Отклики»; seekers get every outcome — the
number given (as a button that discloses it, never the number itself), the soft refusal with similar listings, the
flat let, no answer in time. The operators see every new owner listing with a «Снять» button (DEC-73). Native
listings have their own card in the bot, sent cards of a listing that left the feed are edited, and the cabinet can
be switched on (DEC-81), staging first.

## Scope

In:

- Notices: one way a non-radar message of the cabinet leaves the bot — `bot_notices`, the job `SendBotNotice` on the
  queue `notifications` behind WP-57's pacer, exactly once per kind, subject and chat.
- The request message to the owner (BOT-087) with «Дать номер» and «Не подходит», the reasons, the undo and
  «Оказался риелтором»; the same message follows the answers the owner gives in the Mini App.
- The seeker's messages: `given` with «📞 Показать номер» (BOT-088), the soft refusal ten minutes after a decline
  with a few similar listings (BOT-089), the flat let (BOT-090), no answer in time (`expired`).
- «✉️ Связаться с хозяином» on a bot card of a `request`-mode listing, opening `c_<number>` in the Mini App; the card
  of a native listing (no «Это риелтор», photos from `owner/<number>/…`).
- Native status changes raise WP-57's `ListingWithdrawn`, so sent cards become «Объявление снято».
- The operators' notice of each new owner listing with «Снять» (item 10).
- Conversation tests, transcripts, the checks inside Telegram, and the switch-on procedure of DEC-81 with a line per
  gate of `25` §5.

Out:

- The request service, the answers, their windows, expiry and the events — WP-85. The owner listings, their statuses,
  the moderation service and the operators' commands — WP-84.
- The realtor waitlist message «напишем в бот, когда откроем» (BOT-091, `UNVERIFIED`, Q-BOT-049): a later broadcast
  of WP-57's tool, with its own audience.
- The seeker's report that the owner turned out to be a realtor: legacy's Mini App sends seekers to a bot button
  «Ответил риелтор» that was never observed (BOT-088 `inferred`, Q-BOT-048), and v1 has no method for it. Not built:
  a seeker reports through the listing's report action, whose votes count on native numbers too (WP-44, WP-84).
- The owner of a legacy listing whose request was relayed (WP-87): he is legacy's user and gets nothing from HOMI's
  bot; the seeker side of a relayed request uses the messages here unchanged.
- The Mini App's «Отклики», the red dot and the tips — WP-82. The support bot — WP-59.

## Decisions that bind this package

- DEC-52: no number is pushed into a chat unasked. A `given` request reaches the seeker as a message with «📞 Показать
  номер», whose press discloses through `ContactService::disclose()` of WP-43 (with WP-85's rule) — the same quota and
  log as the Mini App. No message of this package holds a digit run of an owner's number (SEC-REQ-051).
- DEC-73: post-moderation; each publication reaches the operators' private chats with «Снять».
- DEC-76: the owner sees the seeker's Telegram first name, stored with the request (WP-85); the seeker never sees the
  owner's name.
- DEC-77: a native listing is the owner's own, with a number he confirmed; «Это риелтор» is not offered on its card
  (HOMI's realtor check runs at publish, WP-84; votes still count, WP-44).
- DEC-81: the switch `OWNER_CABINET_ENABLED`. This package is the bot gate of `25` §5 and holds the procedure that
  switches it on; while it is off, requests on existing listings are still delivered and answered.
- DEC-43, DEC-46: full parity with the bot audit — but BOT-087 … BOT-090 were never observed (`04` §5, Q-BOT-048). Each
  message is closed by this specification; every text is HOMI's, in the brand layer, for the product owner to approve;
  the checklist claims no parity for it.
- DEC-51: radars may still be off; nothing here depends on them.
- *Integrator defaults, listed for the reviewer:* item 10 (the operators' notice goes from HOMI's main bot to
  `OWNER_MODERATOR_IDS`, empty = no notice; «Снять» sets `held` with reason `moderator`; WP-59's operator list is not
  used), item 13 (the request lifecycle: the soft refusal at the end of the ten-minute undo window, «Оказался
  риелтором» for 7 days after `given`, `agent` shown to the seeker as `declined`), item 22 (the switch goes on on
  staging, with test accounts, for the checks inside Telegram before the legal gate closes; on production only after
  the gates of `25` §5). Defaults of this specification, in the same list: the messages leave as paced jobs with a
  ledger of their own, not through the radar outbox of WP-46; the operators are told of the first publication only,
  not of later edits; the soft refusal lists at most three similar listings (same city and rooms, price within ± 20 %,
  newest first); `expired` is announced to the seeker; a message inside the recipient's quiet hours is sent silently,
  not held; «Снять» asks for a confirmation; a `paused` listing leaves its sent cards untouched.

## Design

The specification of the named package is authoritative for names. If it differs, use its name and do not create a
second service.

### What comes from where

| Need | Package | Call expected |
| ---- | ------- | ------------- |
| Request events | WP-85, "Events" | `ContactRequested`, `RequestAnswered` (action), `RequestDeclined` (reason), `RequestsCancelledByRent` (request ids), `RequestExpired`; ids only |
| The owner's answers | WP-85, "The owner's answers" | the answer service: `answer(User $owner, string $requestId, action)` with `give`, `decline`, `reason_found`, `reason_agent`, `undo`, `late`; `RequestAnswerClosed`; the flags `can_undo`, `can_reason`, `can_late` |
| A request | WP-85, "Tables" | the request model: seeker, owner (empty for a relayed request, WP-87), listing number, `who`, `people`, `move_in`, `message`, the first name, status, reason |
| Owner listing events, moderation | WP-84, "Statuses and their effects", "Moderation" | `OwnerListingPublished` (with whether it is the first publication), `OwnerListingWithdrawn` (reason `paused`, `held`, `removed`, `withdrawn`), `OwnerListingRented`; the hold of the moderation service with reason `moderator` and `by`; `config('owner.moderator_ids')` |
| Pacing, incident pause, withdrawn edits | WP-57 | `TelegramPacer`, `App\Jobs\Middleware\PaceTelegramSends`, `DeliveryPause`, queue `notifications`, `App\Events\Listings\ListingWithdrawn(int $number, string $cause)` |
| Cards | WP-53 | `ListingCardData`, `ListingCardRenderer`, `ListingCardKeyboard`, `OpenListingByNumber`, the `ct` handler of «📞 Показать номер» |
| Mini App links | WP-52, WP-88 | `MiniAppUrl::home()`, `MiniAppUrl::listing()`, `MiniAppUrl::startApp()` |
| Rows of a list | WP-52, WP-54 | `ListingTitleLine`; the row format of the starter list |
| Reachability, quiet hours | WP-45, WP-52, WP-40 | `ChatReachability::canWrite()`, `markBlocked()`; `QuietWindow` |
| Similar listings | WP-42, WP-86 | `ListingSource::feed()` through `SourceManager` (the merged feed) |
| Erasure, retention | WP-47 | `config/erasure.php`, `config/retention.php` |

### Notices — how a cabinet message leaves the bot

The radar outbox of WP-46 is not used: it is unique per user and listing, checks a radar's eligibility and groups
items into digests, none of which fits several request messages about one listing to one person. These messages use
WP-57's pattern for sends that are not outbox items (WP-57, "Pacer"): paced jobs on `notifications`.

Table `bot_notices`: `id` (ULID); `kind` (string 32); `subject` (char 26: the request's or the owner listing's
ULID); `chat_id` (bigint); `user_id` (nullable foreign key to `users`, cascade: the recipient when he is a HOMI user);
`status` (string 16: `claimed`, `sent`, `failed`); `fail_reason` (string 32, nullable); `message_id` (bigint,
nullable); `claimed_at`, `sent_at` (`timestampTz`, nullable); timestamps. Unique (`kind`, `subject`, `chat_id`);
index (`sent_at`). Model `App\Models\BotNotice` with a factory. No text column: a message is rendered at send time
from its subject and never stored.

- `App\Services\Notices\NoticeDispatcher::dispatch(string $kind, string $subject, int $chatId, ?int $userId)` queues
  `App\Jobs\Notices\SendBotNotice` (queue `notifications`, middleware `PaceTelegramSends`, `tries` 5, `retryUntil`
  6 hours, unique per kind, subject and chat until processing starts). The job carries those four values only.
- `SendBotNotice::handle()`:
  1. Claim: `insertOrIgnore` of the row as `claimed`. A row that is `sent` → done. A `claimed` row younger than five
     minutes → `release(60)`. An older `claimed` row → counted as `notice_unknown_total` and not sent again (a send
     whose answer was lost is never repeated, as WP-57's `delivery:reconcile`).
  2. Hydrate the subject now. Gone (erased) → the row is deleted, done. Its state no longer fits the kind (a
     `request_new` for a request answered meanwhile in the Mini App) → `failed` with `stale`, nothing sent.
  3. Render (below); inside the recipient's quiet window (`QuietWindow` of WP-40) the message is sent with
     `disable_notification: true`; it is never held.
  4. Send through `TelegramBot` (WP-50); the pacer, `429`, `403` and `5xx` handling of `PaceTelegramSends` apply; a
     transient failure deletes the claim before the job is released, so the retry can claim again.
  5. `sent`, `message_id`, `sent_at`.
- `App\Jobs\Notices\EditBotNotice` (same queue and middleware) re-renders a sent notice from the current state of its
  subject: «message is not modified» is success; «message can't be edited» or «message to edit not found» is logged
  as a count and dropped.
- `DeliveryPause` of WP-57 stops these sends too (the middleware releases them).
- Logs and metrics carry the kind, the subject's id and counts — never a text, a first name, a message or a number:
  `bot_notice_total{kind, result}`, `notice_unknown_total`, `moderation_hold_total`.

### The messages

Every text below is a new catalogue key of HOMI in `lang/{ru,uz,en}/bot.php`, marked in
`tests/Fixtures/Bot/translation-status.json` "HOMI text, not observed in legacy (BOT-087 … BOT-090 `UNVERIFIED`,
Q-BOT-048), pending the product owner's approval". Russian drafts; `<title>` is `ListingTitleLine` of WP-52 (for
example «2-комн. квартира · Юнусабад · $600»), every value is escaped (WP-51).

| Kind | Raised by | To | Text | Buttons |
| ---- | --------- | -- | ---- | ------- |
| `request_new` | `ContactRequested`, a request with an owner | the owner | `requests.owner.new`: «📩 Отклик на квартиру <title>» / «<имя или «Без имени»> · <кто> · <N чел., when more than 1> · въезд: <когда>» / ««<сообщение>»» | `[Дать номер][Не подходит]` (`k1:rq:<id>:gv`, `…:dc`) |
| `request_given` | `RequestAnswered` with `give` | the seeker | `requests.seeker.given`: «✅ Хозяин готов поговорить: <title>. Номер — по кнопке ниже.» | `[📞 Показать номер]` (`k1:cd:<n>:ct`, WP-53) / `[📱 Открыть в приложении]` (`web_app`, `MiniAppUrl::listing(n)`) |
| `request_soft_refusal` | `RequestDeclined` | the seeker | `requests.seeker.soft_refusal`: «Хозяин квартиры <title> пока не готов дать номер. Посмотрите похожие:» and up to three rows `<n>. <title>`; without any, `requests.seeker.soft_refusal_none` «Хозяин квартиры <title> пока не готов дать номер. Новые квартиры — в приложении.» | number buttons `k1:ln:<n>:n` (WP-53's `OpenListingByNumber`, one row) / `[📱 Открыть приложение]` (`MiniAppUrl::home()`) |
| `request_flat_let` | `RequestsCancelledByRent` | each seeker of the ids | `requests.seeker.flat_let`: «Квартиру <title> уже сдали. Другие — в приложении.» | `[📱 Открыть приложение]` |
| `request_expired` | `RequestExpired` | the seeker | `requests.seeker.expired`: «Хозяин квартиры <title> не ответил вовремя. Можно откликнуться ещё раз.» (one new request after `expired`, DEV-060) | `[✉️ Откликнуться ещё раз]` (`url`, `MiniAppUrl::startApp('c_<n>')`) |
| `owner_published` | `OwnerListingPublished`, the first publication | each id of `owner.moderator_ids` | `moderation.published`: «🆕 Объявление хозяина №<n>: <title>» / the masked description / «Фото: N»; as a photo message with the cover when there is one | `[📱 Открыть]` (`web_app`, `MiniAppUrl::listing(n)`) / `[Снять]` (`k1:mo:<ulid>:hd`) |

- The soft refusal is the same whatever reason the owner chose (BR-API-181; legacy's own text says «человеку ответим
  одинаково мягко»). An `agent` answer is a decline for the seeker (item 13).
- Similar listings: `ListingSource::feed()` in the seeker's context with the declined listing's city, `rent_long`, its
  type and rooms, `price_min` and `price_max` at ± 20 % of its USD price, `sort = new`, limit 10; the declined number,
  the seeker's hidden numbers and blocked authors are left out by the overlay; the first three remain. A source that
  is down gives the `…_none` text, never a delay.
- A request without an owner in HOMI (relayed, WP-87) gets no `request_new`; its seeker messages are the same.
- The owner's message follows every answer, from the bot or from the Mini App: on `RequestAnswered` the job
  `EditBotNotice` re-renders `request_new` with the status line of SCR-058 and the buttons the flags allow:

| State (WP-85) | Status line | Buttons |
| ------------- | ----------- | ------- |
| `pending` | none | `[Дать номер][Не подходит]` |
| `given`, `can_undo` | «Номер дали» | `[Отменить]` (`ud`) |
| `given`, `can_late` | «Номер дали» | `[Оказался риелтором]` (`lt`) |
| `declined`, `can_reason` | «Не подошло» / «Почему не подошло? Можно не отвечать — человеку ответим одинаково мягко.» | `[Уже договорился][Похоже на риелтора]` (`rf`, `ra`) / `[Отменить]` while `can_undo` |
| `declined` with a reason | «Не подошло» / «Причина: уже договорились с другим.» for `found` | `[Отменить]` while `can_undo` |
| `agent` | «Отмечен как риелтор» or «Номер дали · оказался риелтором» | none |
| `expired`, `cancelled` | «Без ответа», «Квартира сдана» | none |

  The labels are the Mini App's own texts of SCR-058 (`own.give`, `own.decline`, `own.why*`, `own.undo*`,
  `own.req.*`), reused in the bot by HOMI's choice; the legacy bot's own labels were never observed. A window that
  closes (`can_undo` after ten minutes, `can_late` after seven days) is not edited away at that moment: a press after
  it gets the alert below and the message is re-rendered.
- An `undo` of a `give` edits the seeker's `request_given` message to `requests.seeker.given_undone` «Хозяин отменил
  ответ — номера пока нет.» without buttons; a later disclosure would answer `contact_unavailable` anyway (WP-85).

### Callbacks

Registered with WP-51's codec and listed in its registry and in `docs/infrastructure/telegram-webhook.md`:

| Action | Data | Handler and rules |
| ------ | ---- | ----------------- |
| `rq` | `k1:rq:<request ULID>:<gv, dc, rf, ra, ud or lt>` (at most 35 bytes) | `App\Telegram\Handlers\Requests\RequestAnswerCallback`: the request is found through the presser's own owner listings, so a forged or another owner's id gets the stale alert of WP-51 (SEC-REQ-011, SEC-REQ-014); the action maps to `give`, `decline`, `reason_found`, `reason_agent`, `undo`, `late` of WP-85's answer service; success → a silent answer and the edit of the pressed message; `RequestAnswerClosed` → the alert `requests.answer_closed` «Этот ответ уже нельзя изменить» and the message re-rendered; a write counts against the per-user limits of WP-51 (SEC-REQ-027) |
| `mo` | `k1:mo:<owner listing ULID>:<hd, hdy or hdn>` (at most 36 bytes) | `App\Telegram\Handlers\Moderation\ModerationCallback`: only for a presser whose `from.id` is in `owner.moderator_ids`, read at the press (else the stale alert); `hd` → the keyboard `[🗑 Да, снять][✖️ Отмена]` (`danger` style on the first); `hdy` → WP-84's hold with reason `moderator` and `by` = the presser's Telegram id, then the notice reads `moderation.held` «Снято с публикации» with the time and no buttons; a listing already held or withdrawn → the same text; `hdn` → the first keyboard again |

The seeker's «📞 Показать номер» is WP-53's `ct` action: for a `request`-mode listing `hasPhone` is `true` only for
the seeker whose request is `given` (WP-85's overlay), so the button works for him and is the stale-button case for
anyone else (WP-53, section 12).

### Cards of native listings and «Связаться с хозяином» (WP-53)

- `ListingCardData` gains `origin` (`legacy`, `native`), `contactMode` (`phone`, `request`, `hidden` or `null`) and
  `requestStatus` (the viewer's request in the seeker form, or `null`), read from the card of WP-80.
- `ListingCardKeyboard`:
  - «Это риелтор» (BTN-041) is left out when `origin` is `native` (DEC-77); a stale `ag` press on such a card gets
    the stale-button handler.
  - A new last row `card.contact_owner` «✉️ Связаться с хозяином» — a `url` button `MiniAppUrl::startApp('c_<n>')`,
    which opens the request sheet of WP-83 — when `contactMode` is `request`, `hasPhone` is `false` and
    `requestStatus` is `null` or `expired`. With a `pending`, `declined` or `cancelled` request the row is absent;
    with `given` the row `📞 Показать номер` takes its place (WP-53's rule on `hasPhone`). `hidden` (a legacy
    `gate` listing while the relay is off, DEC-75) has no row.
  - «🔗 Открыть оригинал» and «📢 Канал» are absent for a native listing because it has no channel (WP-53's existing
    rules).
- Photos come from the card's addresses, WP-84's public copies `owner/<number>/<n>.jpg`; «📷 Ещё N фото» works as for
  any card. The stub's native entries carry the demo marker on the stub driver (WP-53).
- The four audited rows keep their layout; the new row is last, as `📞 Показать номер` is.

### Sent cards of a native listing that left the feed (WP-57)

`App\Listeners\Notices\WithdrawNativeCards` on WP-84's events dispatches WP-57's `ListingWithdrawn`:

| WP-84 event and reason | `ListingWithdrawn` cause | Why |
| ---------------------- | ------------------------ | --- |
| `OwnerListingWithdrawn` `paused` | none | the owner may resume it; a press on a sent card reads the current state (WP-53) |
| `OwnerListingWithdrawn` `held` | `source` | out of the feed by the operators; it may come back, but an edited card is never reverted (WP-57) |
| `OwnerListingWithdrawn` `removed`, `OwnerListingRented` | `source` | out for good |
| `OwnerListingWithdrawn` `withdrawn` | `takedown` | by votes or the operators: the photo is replaced and the text removed (WP-57, BR-BOT-092) |

WP-57 then edits every sent copy to «🚫 Объявление снято» and deletes the unsent outbox rows of that number.

### The operators' notice (DEC-73, item 10)

- On `OwnerListingPublished` of a first publication: one `owner_published` notice per id of `owner.moderator_ids`
  (read at dispatch; empty: none). Later edits of a published listing are live (DEC-80) and not announced; a resume
  from `paused` is not a publication.
- The notice holds the number, the title line, the masked description (`PhoneMasker`), the photo count and the cover.
  It never holds the owner's number, Telegram id or name, nor the true point (SEC-REQ-051, SEC-REQ-052).
- «Снять» holds the listing (WP-84); releasing it stays a command, `owner:release` with `--by` and `--reason`.

### Switching the cabinet on (DEC-81)

Until here `config('owner.enabled')` (WP-80) is off on staging and production: creating a draft, asking for the
phone and publishing answer `403 owner_disabled`, `GET /reference` says `owner_enabled: false`, and the Mini App shows
no group «Сдаю квартиру». Per environment, staging first:

1. The gates of `25` §5, one line each:

   | Gate | Staging (test accounts, item 22) | Production |
   | ---- | -------------------------------- | ---------- |
   | 1 — the legal basis (Q-SEC-021) and the privacy texts | not required | closed: the product owner's written go; the texts of WP-56, WP-61 and WP-70 final and no longer "pending legal review" |
   | 2 — the operator's answers (points 14 – 21) | not required: they block WP-87 only | not required |
   | 3 — the bot can confirm a phone and deliver requests | WP-88 and this package deployed | the same, and their staging checklists passed |
   | 4 — infrastructure | PostGIS in `homi_staging_db` (present, `docs/infrastructure/deployment.md:139`); boundaries loaded (`geo:load-boundaries`, WP-84); `owner/` of the public disk served by the CDN host; `SHOWN_POINT_SECRET` and `OWNER_MODERATOR_IDS` set; the operators started the bot | the same on production, PostGIS in `homi_db` with its own go (`docs/infrastructure/deployment.md:140`) |

2. The production track sets `OWNER_CABINET_ENABLED=true` in the server env and restarts Horizon: php-fpm reads the
   env on every request, so the API follows at once; the Horizon workers, which run the bot's handlers and these
   jobs, read it only at start (`docs/infrastructure/deployment.md:60`).
3. Check: `GET /api/v1/reference` answers `owner_enabled: true`; the Mini App shows «Сдаю квартиру» once its cached
   reference data has expired (WP-22); `/start owner_new` sends its button (WP-88).
4. Run the passes inside Telegram that waited for the switch: the checklists of WP-81, WP-82 and WP-83 with the switch
   on, then WP-88's, then this package's.
5. Production: steps 2 – 4 again, only after every production cell of step 1 is closed; the date and the gates are
   recorded in the PR and in the go record of WP-71.

Going back is the same key unset and a Horizon restart: creating, asking for the phone and publishing are refused
again; published listings stay in the feed; removing, pausing, «Сдано» and answering requests keep working, and the
bot keeps delivering requests and answers for the listings that exist (DEC-81).

### Configuration, erasure, retention

- `backend/config/owner.php` (WP-80), added keys: `notices.similar_count` (3), `notices.similar_price_band` (0.2),
  `notices.retention_days` (90).
- `config/erasure.php` of WP-47: `bot_notices` — strategy `delete` by `user_id`. The notices to an operator have no
  `user_id` and go by retention.
- `config/retention.php`: `bot_notices` — `notices.retention_days` after `sent_at`, pruned by `model:prune` (the
  model is `Prunable`); `RetentionRegistryTest` of WP-47 fails without it.
- A sent message stays in the recipient's chat (Telegram messages are not deleted); a press on it after the request
  was erased gets the stale alert.

## Files

All paths under `backend/` unless they start with `docs/`.

- `app/Services/Notices/{NoticeDispatcher,NoticeRenderer,SimilarListings}.php`
- `app/Jobs/Notices/{SendBotNotice,EditBotNotice}.php`
- `app/Listeners/Notices/{SendRequestNotices,FollowOwnerAnswer,SendModerationNotice,WithdrawNativeCards}.php`
- `app/Telegram/Handlers/Requests/RequestAnswerCallback.php`, `app/Telegram/Handlers/Moderation/ModerationCallback.php`
- `app/Telegram/Rendering/{RequestMessageRenderer,ModerationNoticeRenderer}.php`
- `app/Models/BotNotice.php`, `database/factories/BotNoticeFactory.php`,
  `database/migrations/<date>_create_bot_notices_table.php`
- Changed: `app/Telegram/Rendering/{ListingCardData,ListingCardDataFactory}.php`,
  `app/Telegram/Keyboards/ListingCardKeyboard.php` (WP-53), `app/Providers/TelegramServiceProvider.php` (actions `rq`, `mo`), `app/Providers/AppServiceProvider.php`
  (listeners), `config/owner.php`, `config/erasure.php`, `config/retention.php`
- `lang/{ru,uz,en}/bot.php`; `tests/Fixtures/Bot/translation-status.json`
- `tests/Feature/Notices/{SendBotNoticeTest,RequestNoticesTest,OwnerMessageFollowsTest,SoftRefusalTest,ModerationNoticeTest,WithdrawNativeCardsTest,OwnerCabinetSwitchTest,NoticeLeakTest}.php`
- `tests/Feature/Bot/{RequestAnswerCallbackTest,ModerationCallbackTest,NativeCardKeyboardTest}.php`
- `tests/Unit/Notices/{NoticeRendererTest,SimilarListingsTest}.php`
- `tests/Fixtures/Bot/transcripts/{request-new,request-give,request-decline-reason,request-undo,request-late,request-closed,request-given-seeker,soft-refusal,flat-let,request-expired,moderation-hold,native-card}.json`
- `docs/infrastructure/telegram-webhook.md` (the actions, the notices, the switch-on); `docs/api/README.md` unchanged

## Steps

Generators always with `--no-interaction`; tests first inside each step; Pint after every PHP edit.

Part A.

1. Read WP-85 ("Events", "The owner's answers"), WP-84 ("Statuses and their effects", "Moderation"), WP-57 ("Pacer",
   "Withdrawn listings") and WP-53 ("Keyboard", section 12); write into "Handoff" every name that differs from "What
   comes from where".
2. The migration, `BotNotice`, `NoticeDispatcher`, `SendBotNotice`, `EditBotNotice`; `SendBotNoticeTest` (claim,
   stale, gone, quiet hours, `403`, `429`, a lost answer never resent).
3. `RequestMessageRenderer`, `NoticeRenderer` in three languages; `NoticeRendererTest`.
4. `SendRequestNotices` (the five request events); `RequestNoticesTest`; transcripts `request-new`,
   `request-given-seeker`, `flat-let`, `request-expired`.
5. `RequestAnswerCallback` and `FollowOwnerAnswer` (the edit after every answer, from the bot or the Mini App);
   `RequestAnswerCallbackTest`, `OwnerMessageFollowsTest`; transcripts `request-give`, `request-decline-reason`,
   `request-undo`, `request-late`, `request-closed`.
6. `SimilarListings` and the soft refusal; `SimilarListingsTest`, `SoftRefusalTest`; transcript `soft-refusal`.
7. The erasure and retention entries; `NoticeLeakTest`.
8. `make ci-backend`; PR A; deploy with the cabinet off.

Part B.

9. `ListingCardData` and `ListingCardKeyboard`: `origin`, `contactMode`, `requestStatus`, «Связаться с хозяином», no
   «Это риелтор» on native; `NativeCardKeyboardTest`; transcript `native-card`.
10. `WithdrawNativeCards`; `WithdrawNativeCardsTest` with WP-57's `WithdrawnCardEditTest` green.
11. `SendModerationNotice`, `ModerationCallback`, `ModerationNoticeRenderer`; `ModerationNoticeTest`,
    `ModerationCallbackTest`; transcript `moderation-hold`.
12. `OwnerCabinetSwitchTest`; the registry rows and the switch-on section of `docs/infrastructure/telegram-webhook.md`;
    `make ci-backend`; review by the `security-reviewer` agent (names and numbers in messages, the operators'
    button, the switch); PR B; deploy.
13. The procedure of "Switching the cabinet on" on staging (item 22), the checklist below with test accounts; the
    production switch-on stays the production track's step after the gates.

## Behaviour to reproduce

Owned: BOT-087 … BOT-090 (the bot's side of the requests) and the operators' notice of DEC-73. None was ever observed
in legacy (`04` §5); the rows below are closed by this specification.

| # | Scenario | What the user sees | Rules, questions |
| - | -------- | ------------------ | ---------------- |
| 1 | A seeker sends a request on a native listing (BOT-087) | the owner gets «📩 Отклик на квартиру…» with the seeker's first name, who, how many, the move-in and the message, and `[Дать номер][Не подходит]`; «Отклики придут в бот. Ответить можно там или в «Мои объявления»» holds | BR-API-180, BR-APP-090; Q-BOT-048 |
| 2 | The owner presses «Дать номер» in the bot or in the Mini App (BOT-088) | the owner's message reads «Номер дали» with «Отменить» for ten minutes, then «Оказался риелтором» for seven days; the seeker gets «✅ Хозяин готов поговорить…» with «📞 Показать номер», which shows the number only after the press | BR-API-181, BR-API-187; DEC-52 |
| 3 | «Не подходит», then a reason or none (BOT-089) | the owner's message offers «Уже договорился» / «Похоже на риелтора» and «Отменить»; ten minutes later the seeker gets the soft refusal with up to three similar listings — the same whatever reason | BR-API-181; item 13; Q-API-075 |
| 4 | «Отменить» within ten minutes | the previous answer returns (`pending` today); no soft refusal is sent; a `given` seeker's message loses its button | BR-API-181 |
| 5 | «Похоже на риелтора» or «Оказался риелтором» | the seeker is marked and can no longer write to this owner's flats (WP-85); the seeker sees a decline | BR-API-181, BR-APP-098 |
| 6 | The owner marks the flat «Сдано» (BOT-090) | every seeker still waiting gets «Квартиру … уже сдали…»; their requests are `cancelled` | BR-API-176 |
| 7 | Nobody answers in time | the seeker gets «Хозяин квартиры … не ответил вовремя…» with «Откликнуться ещё раз» (DEV-060) | BR-API-186; Q-API-075 |
| 8 | A press after a window closed, or on a request changed meanwhile | the alert «Этот ответ уже нельзя изменить»; the message shows the current state | BR-APP-090 |
| 9 | A bot card of a native listing in `request` mode | no «Это риелтор»; the last row «✉️ Связаться с хозяином» opens the request sheet in the Mini App | DEC-77, DEC-52 |
| 10 | A native listing is removed, let, held or withdrawn | its sent cards become «🚫 Объявление снято»; a paused one keeps them | BR-API-176, BR-API-177, BR-BOT-092 |
| 11 | An owner publishes a new listing | each operator gets «🆕 Объявление хозяина №…» with «Снять»; «Снять» → «Да, снять» → the listing is held and leaves the feed; the owner cannot resume it | DEC-73; BR-API-177 |
| 12 | The cabinet is switched off | rows 1 – 10 keep working for the listings that exist; nothing new is published, so row 11 does not occur | DEC-81 |

Edge cases:

- A request arrives while the owner blocked the bot: the notice fails as `chat_unreachable`; the request stays in
  «Отклики» of the Mini App.
- The seeker blocked the bot between the request and the answer: his notices fail the same way; the answer stands.
- Two operators press «Да, снять» at once: one hold, both notices read «Снято с публикации».
- The owner answers in the Mini App before the `request_new` notice was sent: the notice is `stale` and not sent; the
  owner sees the request in «Отклики».
- No message of this package carries a phone number, the seeker's message text to anyone but the owner, or a name to
  anyone but the owner.

## Tests

Conversation tests use the runner of WP-51; the Bot API through `FakeBotApi` of WP-50; requests, owner listings and
users from the factories of WP-84 and WP-85; the cabinet switch on (`phpunit.xml`, WP-80) unless a case says
otherwise; time frozen with `travelTo` in Asia/Tashkent. After every case a scan of the Bot API calls, the job
payloads and the log records finds no digit run of the owner's synthetic number (`+998000000081`).

| # | Test | Cases |
| - | ---- | ----- |
| 1 | `SendBotNoticeTest` | one dispatch → one send and a `sent` row; the same dispatch twice → one send; a `claimed` row older than five minutes → not resent, counted; a gone subject → row deleted, nothing sent; a `stale` subject → nothing sent; inside quiet hours → `disable_notification: true`; `429` → released for `retry_after`, sent once afterwards; `403` → `markBlocked`, `failed`; `delivery:pause on` → released |
| 2 | `RequestNoticesTest` | `ContactRequested` → `request_new` to the owner with the first name and the answers escaped; a relayed request (no owner) → nothing to an owner; `give` → `request_given` to the seeker with `k1:cd:<n>:ct`; `RequestDeclined` → the soft refusal; `RequestsCancelledByRent` with three ids → three notices; `RequestExpired` → the expiry notice with the `c_<n>` link |
| 3 | `RequestAnswerCallbackTest` | each of `gv`, `dc`, `rf`, `ra`, `ud`, `lt` → WP-85's action and the edited message; another owner's request id → the stale alert, nothing changed; a press after the undo window → the alert and the re-rendered message; the per-user limit counts the writes |
| 4 | `OwnerMessageFollowsTest` | an answer given through `POST /owner/requests/{id}/answer` edits the owner's bot message; an undo of a `give` edits the seeker's message to «Хозяин отменил ответ…»; «message is not modified» is success |
| 5 | `SoftRefusalTest`, `SimilarListingsTest` | three similar listings from the merged feed, without the declined number and the seeker's hidden ones; none → the `…_none` text; the source down → the `…_none` text at once; an `agent` answer sends the same refusal |
| 6 | `NativeCardKeyboardTest` | a native card: no «Это риелтор»; «Связаться с хозяином» with `startapp=c_<n>` for no request and for `expired`; absent for `pending`, `declined`, `cancelled`; `📞 Показать номер` instead for `given`; a legacy `hidden` listing → no row; a stale `ag` press on a native card → the stale-button handler |
| 7 | `WithdrawNativeCardsTest` | `paused` → no `ListingWithdrawn`; `held`, `removed`, rented → cause `source`; `withdrawn` → `takedown`; WP-57 then edits the sent copies |
| 8 | `ModerationNoticeTest`, `ModerationCallbackTest` | a first publication → one notice per moderator id, as a photo with the cover; a resume from `paused` → none; empty ids → none; the notice holds no number, no Telegram id of the owner, no true point; `hd` → the confirm keyboard; `hdy` → WP-84's hold with reason `moderator` and the presser's id; a presser outside the list → the stale alert, nothing held; two presses → one hold |
| 9 | `OwnerCabinetSwitchTest` | switch off: `POST /owner/listings` → `403 owner_disabled`, `GET /reference` `owner_enabled: false`, `/start owner_new` → welcome only, a request on an existing listing is still delivered and answerable; switch on: the reverse |
| 10 | `NoticeLeakTest` | after every scenario of tests 2 – 8: no first name, message text or number in the logs, `failed_jobs`, the Horizon payloads or `bot_notices`; the erasure of a seeker removes his `bot_notices` rows |
| 11 | Transcripts | the twelve files of "Files" in ru; `request-new`, `request-given-seeker` and `soft-refusal` also in uz and en |

## Acceptance checklist

Run in ru, uz and en on the staging bot with `OWNER_CABINET_ENABLED=true` (item 22), a test owner, a test seeker and
an operator's test account; attach screenshots to the PR. The texts are HOMI's and wait for the product owner's
approval; the checks are about behaviour, not about parity with legacy.

- [ ] The gates of `25` §5 are listed in the PR with their state on staging and on production (the table of
      "Switching the cabinet on").
- [ ] `OWNER_CABINET_ENABLED=true` was set on staging with a Horizon restart; `GET /reference` answers `owner_enabled:
      true`; the Mini App shows «Сдаю квартиру».
- [ ] A test owner publishes a listing; the operator's account gets the notice with the cover and «Снять».
- [ ] A test seeker sends a request; the owner gets it in the bot with the first name and the answers.
- [ ] «Дать номер» in the bot: the seeker gets «✅ Хозяин готов поговорить…»; «📞 Показать номер» shows the number
      only after the press; another account pressing a forwarded copy gets no number.
- [ ] «Дать номер» in the Mini App instead: the owner's bot message follows it.
- [ ] «Не подходит» with and without a reason: ten minutes later the seeker gets the soft refusal with similar
      listings; «Отменить» inside the ten minutes sends nothing.
- [ ] «Оказался риелтором» after a give marks the seeker; his next request on this owner's flats is refused.
- [ ] «Сдано» tells the waiting seeker that the flat is let; a request left unanswered past the expiry tells the seeker
      and offers «Откликнуться ещё раз».
- [ ] A bot card of the native listing has no «Это риелтор» and opens the request sheet from «Связаться с хозяином».
- [ ] «Снять» → «Да, снять» holds the listing: it leaves the feed, its sent cards read «Объявление снято», and the
      owner cannot resume it.
- [ ] No message in any chat holds a phone number unasked; the seeker's message text reached the owner only.
- [ ] With the switch off again, publishing is refused and the existing listing's requests are still delivered.
- [ ] Tests of this package and of WP-53, WP-57, WP-85 are green; `make ci-backend` is green; the security review
      is recorded in the PR.
- [ ] Production: the switch-on is recorded only after the gates are closed, by the production track, with the
      product owner's go; the checks above are repeated there with real accounts the product owner names.

## Handoff

Empty.
