# WP-89 — Bot: requests to owners, answers to seekers, the operators' notice, the switch-on

| Field | Value |
| ----- | ----- |
| Stage | D |
| Status | TODO |
| Depends on | WP-57, WP-85, WP-88, WP-53, WP-86 (the merged feed: similar listings and native cards) |
| Size | about 2 600 changed lines with tests, L. If it grows: two PRs. Part A = steps 1–8 (notices, the request messages, the answer buttons, the seeker's messages). Part B = steps 9–13 (native cards, withdrawn edits, the operators' notice, the switch-on). Production works after either part, with the cabinet switched off |
| Behaviour reference | `04` BOT-087 … BOT-091, §3.18, §5, Q-BOT-048, Q-BOT-049; `02` BR-API-176, BR-API-177, BR-API-181, BR-API-186; `03` SCR-058, BR-APP-090, BR-APP-098; `16` SEC-039, SEC-REQ-045, SEC-REQ-046, SEC-REQ-051, SEC-REQ-053; `25` §5 (the owner cabinet before real owners: the gates) |
| Needs from the production track | (1) Approval of one additive migration: table `bot_notices`. (2) `OWNER_MODERATOR_IDS` (comma-separated Telegram ids of the operators) in the server env of staging and production; each operator has pressed Start in HOMI's bot of that environment (a bot can write only to a user who started it) and confirms the test notice of step 3 of "Switching the cabinet on"; on staging the ids are team accounts. (3) Before the checks inside Telegram: the Main Mini App address of the staging bot in @BotFather (`https://app.staging.homi.uz/`), the setting WP-58 lists, done now because the `startapp` buttons (`c_<number>`, WP-88's `o_<id>`) need it. (4) After the deploy, once gate 5 of `25` §5 holds on staging: `OWNER_CABINET_ALLOWED_IDS` set to the test accounts, `OWNER_CABINET_ENABLED=true` on staging and a Horizon restart, for the checks of this package with test accounts (DEC-88). (5) On production only when the gates of `25` §5 are closed (DEC-81), by the procedure of "Switching the cabinet on", with the product owner's go |

## Goal

Owners get every request in HOMI's bot and can answer it there as in «Отклики»; seekers get every outcome — the
number given (as a button that discloses it, never the number itself), the soft refusal with similar listings, the
flat let, no answer in time. The operators see every publication of an owner listing with a «Снять» button
(DEC-73), the changed photos or description of a published one, and every listing the checks or the votes hold for
their decision. Native listings have their own card in the bot, sent cards of a listing that left the feed are
edited, and the cabinet can be switched on (DEC-81), staging first.

## Scope

In:

- Notices: one way a non-radar message of the cabinet leaves the bot — `bot_notices`, the job `SendBotNotice` on the
  queue `notifications` behind WP-57's pacer, exactly once per kind, subject, occasion and chat.
- The request message to the owner (BOT-087) with «Дать номер» and «Не подходит», the reasons, the undo and
  «Оказался риелтором»; the same message follows the answers the owner gives in the Mini App; more than five in an
  hour on one listing fold into one message.
- The seeker's messages: `given` with «📞 Показать номер» (BOT-088), the soft refusal ten minutes after a decline
  with a few similar listings (BOT-089), the flat let (BOT-090), no answer in time (`expired`).
- «✉️ Связаться с хозяином» on a bot card of a `request`-mode listing, opening `c_<number>` in the Mini App; the card
  of a native listing (photos from WP-84's public copies `owner/<token>/…`).
- Native status changes raise WP-57's `ListingWithdrawn`, so sent cards become «Объявление снято».
- The operators' notices (item 10): each publication with «Снять», the changed photos or description of a published
  listing, a listing held by the checks or the votes for their decision, and the reminder of such a hold still
  undecided after 24 h (DEC-83); the notices are edited when the listing or the seeker's data is erased.
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
- DEC-73: post-moderation; each publication reaches the operators with «Снять» (the developer's words: «в чат
  операторов»; sent to each operator's private chat from HOMI's main bot, item 10).
- DEC-76: the owner sees the seeker's Telegram first name, stored with the request (WP-85); the seeker never sees the
  owner's name.
- DEC-77: a native listing is the owner's own, with a number he confirmed; HOMI's own checks run at publish (WP-84).
  The automatic realtor check and the vote thresholds do not refuse or withdraw a listing: they hold it with the reason
  and the evidence, and the operators decide (`owner:release`, `owner:withdraw`, `owner:deny-phone`; WP-84). The card's
  author is the owner's phone author (`kind: phone`, label «Хозяин», WP-80), so «Это риелтор» stays on a native card
  as on any card (WP-53) and its votes count on the same key (DEC-86).
- DEC-81: the switch `OWNER_CABINET_ENABLED`. This package is the bot gate of `25` §5 and holds the procedure that
  switches it on; while it is off, requests on existing listings are still delivered and answered, and the owner can
  still pause, mark «Сдано» and remove his listings (what the switch refuses is listed once in WP-80; the plan's
  reading of DEC-81, listed for the reviewer).
- DEC-83: a held listing waits for the operators; nothing releases it by time. A hold of the checks or the votes still
  undecided after 24 h reaches the operators once more as a reminder (`OwnerHoldOverdue` of WP-84).
- DEC-86: «Это риелтор» is offered on the bot's card of a native listing as in the Mini App, also where
  `bot.dev010` hides it on other `ownerVerified` cards (WP-53); a vote from the bot holds the listing for the
  operators like the Mini App's (`votes_agent`).
- DEC-87: the switch-on on production waits for the consent text approved by the lawyer (gate 1); until then the
  cabinet's privacy and consent texts are marked "pending legal review".
- DEC-88: the switch goes on on staging before the legal gate, for staff accounts only (`OWNER_CABINET_ALLOWED_IDS`),
  with the written consent of each, their data erased after the checks, and the leak protections of gate 5 deployed
  first ("Switching the cabinet on").
- DEC-43, DEC-46: full parity with the bot audit — but BOT-087 … BOT-090 were never observed (`04` §5, Q-BOT-048). Each
  message is closed by this specification; every text is HOMI's, in the brand layer, for the product owner to approve;
  the checklist claims no parity for it.
- DEC-51: radars may still be off; nothing here depends on them.
- *Integrator defaults, listed for the reviewer:* item 10 (the operators' notice goes from HOMI's main bot to
  `OWNER_MODERATOR_IDS`, empty = no notice; «Снять» sets `held` with reason `moderator`; WP-59's operator list is not
  used), item 13 (the request lifecycle: the soft refusal at the end of the ten-minute undo window, «Оказался риелтором»
  for 7 days after `given`), item 24 (a native card's author is the owner's phone author), item 25 (every
  publication and, at most once per listing per hour, changed photos or description are announced; a change made
  while the owner had the listing paused is announced at its resume), item 26 (the realtor check and the vote
  thresholds hold for the operators), item 28 (the leak protections ship before any switch-on) and item 30 (the
  allow-list `OWNER_CABINET_ALLOWED_IDS`). That the seeker sees an `agent` answer as `declined` is legacy's behaviour
  (BR-APP-098), not a default. Defaults of this specification, in the same list: the messages leave as paced jobs with a
  ledger of their own, not through the radar outbox of WP-46; the operators are told of every publication (the first,
  and the return of a held listing to the feed) and, at most once per listing per hour, of changed photos or description
  of a published listing; a listing held by the checks or the votes is announced to them with the reason and the counts;
  at most five request messages per listing an hour, the rest folded into one; the soft refusal lists at most three
  similar listings (same city and rooms, price within ± 20 %, newest first); `expired` is announced to the seeker; a
  message inside the recipient's quiet hours is sent silently, not held; «Снять» asks for a confirmation; each id of
  `OWNER_MODERATOR_IDS` confirms a test message before the switch-on; a `paused` listing leaves its sent cards
  untouched; on erasure the sent messages lose the erased content; the seeker's name is shown as «Имя в Telegram: …».

## Design

The specification of the named package is authoritative for names. If it differs, use its name and do not create a
second service.

### What comes from where

| Need | Package | Call expected |
| ---- | ------- | ------------- |
| Request events | WP-85, "Events" | `ContactRequested`, `RequestAnswered` (action), `RequestDeclined` (reason), `RequestsCancelledByRent` (request ids), `RequestExpired`; ids only |
| The owner's answers | WP-85, "The owner's answers" | the answer service: `answer(User $owner, string $requestId, action)` with `give`, `decline`, `reason_found`, `reason_agent`, `undo`, `late`; `RequestAnswerClosed`; the flags `can_undo`, `can_reason`, `can_late` |
| A request | WP-85, "Tables" | the request model: seeker, owner (empty for a relayed request, WP-87), listing number, `who`, `people`, `move_in`, `message`, the first name, status, reason |
| Owner listing events, moderation | WP-84, "Statuses and their effects", "Moderation" | `OwnerListingPublished` (`first`, `released`, or `resumed` with `fields`: the groups changed while the owner had it paused), `OwnerListingHeld {listing, reason}` (the checks or the votes: `check_agent`, `votes_agent`, `votes_fraud`, `votes_rented`), `OwnerListingEdited {listing, fields}`, `OwnerListingWithdrawn` (reason `paused`, `held`, `removed`, `withdrawn`), `OwnerListingRented`, `OwnerListingErased {listing, number, reason erased \| purged}`; the evidence of a hold in `owner_check_results`; the hold of the moderation service with reason `moderator` and `by`, which writes its audit row; `config('owner.moderator_ids')` |
| Pacing, incident pause, withdrawn edits | WP-57 | `TelegramPacer`, `App\Jobs\Middleware\PaceTelegramSends`, `DeliveryPause`, queue `notifications`, `App\Events\Listings\ListingWithdrawn(int $number, string $cause)` |
| Cards | WP-53 | `ListingCardData`, `ListingCardRenderer`, `ListingCardKeyboard`, `OpenListingByNumber`, the `ct` handler of «📞 Показать номер» |
| Mini App links | WP-52, WP-88 | `MiniAppUrl::home()`, `MiniAppUrl::listing()`, `MiniAppUrl::startApp()` |
| Rows of a list | WP-52, WP-54 | `ListingTitleLine`; the row format of the starter list |
| Reachability, quiet hours | WP-45, WP-52, WP-40 | `ChatReachability::canWrite()`, `markBlocked()`; `QuietWindow` |
| Similar listings | WP-42, WP-86 | `ListingSource::feed()` through `SourceManager` (the merged feed) |
| Erasure, retention | WP-47 | `config/erasure.php`, `config/retention.php` |
| The neutral photo placeholder | WP-51, WP-57 | the placeholder of the asset registry that a `takedown` edit uses (`editMessageMedia`) |

### Notices — how a cabinet message leaves the bot

The radar outbox of WP-46 is not used: it is unique per user and listing, checks a radar's eligibility and groups
items into digests, none of which fits several request messages about one listing to one person. These messages use
WP-57's pattern for sends that are not outbox items (WP-57, "Pacer"): paced jobs on `notifications`.

Table `bot_notices`: `id` (ULID); `kind` (string 32); `subject` (char 26: the request's or the owner listing's
ULID); `occasion` (string 10, default empty: the clock hour `YYYYMMDDHH` in Asia/Tashkent for the kinds that may
repeat for one subject — `request_more` and the `owner_*` kinds); `chat_id` (bigint); `user_id` (nullable foreign key
to `users`, cascade: the recipient when he is a HOMI user); `status` (string 16: `claimed`, `sent`, `failed`);
`fail_reason` (string 32, nullable); `message_id` (bigint, nullable); `claimed_at`, `sent_at` (`timestampTz`,
nullable); timestamps. Unique (`kind`, `subject`, `occasion`, `chat_id`); index (`sent_at`). Model
`App\Models\BotNotice` with a factory. No text column: a message is rendered at send time
from its subject and never stored.

- `App\Services\Notices\NoticeDispatcher::dispatch(string $kind, string $subject, int $chatId, ?int $userId,
  string $occasion = '', ?CarbonImmutable $at = null)` queues `App\Jobs\Notices\SendBotNotice` (queue
  `notifications`, middleware `PaceTelegramSends`, `tries` 5, `retryUntil` 6 hours, unique per kind, subject, occasion
  and chat until processing starts; `$at` delays it). The job carries those values only.
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
- `App\Jobs\Notices\EraseBotNotice` (same queue and middleware) carries a chat id, a message id and the kind only:
  it edits a sent message to its erased text with no buttons (a photo message: `editMessageMedia` to the neutral
  placeholder), for content whose subject is being erased ("Configuration, erasure, retention").
- Logs and metrics carry the kind, the subject's id and counts — never a text, a first name, a message or a number:
  `bot_notice_total{kind, result}`, `notice_unknown_total`, `moderation_hold_total`.
- These jobs carry ids only, and Telescope does not record the Bot API calls (WP-88, "Observability"; `25` §5 gate
  5); `NoticeLeakTest` checks `telescope_entries` too.

### The messages

Every text below is a new catalogue key of HOMI in `lang/{ru,uz,en}/bot.php`, marked in
`tests/Fixtures/Bot/translation-status.json` "HOMI text, not observed in legacy (BOT-087 … BOT-090 `UNVERIFIED`,
Q-BOT-048), pending the product owner's approval". Russian drafts; `<title>` is `ListingTitleLine` of WP-52 (for
example «2-комн. квартира · Юнусабад · $600»), every value is escaped (WP-51).

| Kind | Raised by | To | Text | Buttons |
| ---- | --------- | -- | ---- | ------- |
| `request_new` | `ContactRequested`, a request with an owner, at most `notices.request_burst` (5) per listing in a clock hour | the owner | `requests.owner.new`: «📩 Отклик на квартиру <title>» / «Имя в Telegram: <имя> · <кто> · <N чел., when more than 1> · въезд: <когда>» (without a name: «Без имени · …») / ««<сообщение>»» | `[Дать номер][Не подходит]` (`k1:rq:<id>:gv`, `…:dc`) |
| `request_more` | a `ContactRequested` of a listing beyond the burst in a clock hour; one per listing and hour, sent at the end of that hour | the owner | `requests.owner.more`: «📩 Ещё N откликов на квартиру <title> — в «Отклики»» (N counted at send time) | `[📱 Открыть «Отклики»]` (`web_app`, `MiniAppUrl::home()`) |
| `request_given` | `RequestAnswered` with `give` | the seeker | `requests.seeker.given`: «✅ Хозяин готов поговорить: <title>. Номер — по кнопке ниже.» | `[📞 Показать номер]` (`k1:cd:<n>:ct`, WP-53) / `[📱 Открыть в приложении]` (`web_app`, `MiniAppUrl::listing(n)`) |
| `request_soft_refusal` | `RequestDeclined` | the seeker | `requests.seeker.soft_refusal`: «Хозяин квартиры <title> пока не готов дать номер. Посмотрите похожие:» and up to three rows `<n>. <title>`; without any, `requests.seeker.soft_refusal_none` «Хозяин квартиры <title> пока не готов дать номер. Новые квартиры — в приложении.» | number buttons `k1:ln:<n>:n` (WP-53's `OpenListingByNumber`, one row) / `[📱 Открыть приложение]` (`MiniAppUrl::home()`) |
| `request_flat_let` | `RequestsCancelledByRent` | each seeker of the ids | `requests.seeker.flat_let`: «Квартиру <title> уже сдали. Другие — в приложении.» | `[📱 Открыть приложение]` |
| `request_expired` | `RequestExpired` | the seeker | `requests.seeker.expired`: «Хозяин квартиры <title> не ответил вовремя. Можно откликнуться ещё раз.» (one new request after `expired`, DEV-060) | `[✉️ Откликнуться ещё раз]` (`url`, `MiniAppUrl::startApp('c_<n>')`) |
| `owner_published` | `OwnerListingPublished` `first` or `released`: the first publication and the return of a held listing to the feed | each id of `owner.moderator_ids` | `moderation.published`: «🆕 Объявление хозяина №<n>: <title>» / the masked description / «Фото: N»; as a photo message with the cover when there is one | `[📱 Открыть]` (`web_app`, `MiniAppUrl::listing(n)`) / `[Снять]` (`k1:mo:<ulid>:hd`) |
| `owner_edited` | `OwnerListingEdited` of an `active` listing with `photos` or `description`, or `OwnerListingPublished` `resumed` with non-empty `fields`, at most one per listing per `notices.edit_interval_minutes` (60); later changes of that hour fold into it | each id of `owner.moderator_ids` | `moderation.edited`: «✏️ Объявление №<n> изменено: фото / описание» / the masked description; as a photo message with the cover | as `owner_published` |
| `owner_held` | `OwnerListingHeld` with `check_agent`, `votes_agent`, `votes_fraud` or `votes_rented` | each id of `owner.moderator_ids` | `moderation.held_review`: «⏸ Объявление №<n> на проверке: <причина>» / the counts of `owner_check_results` (for example «номер в объявлениях о 3 разных квартирах», «жалобы «Это риелтор»: вес 3,5 от 3 человек») / the masked description / «Решение: owner:release, owner:withdraw или owner:deny-phone»; as a photo message with the cover sent from the private original (the public copies are deleted at the hold, WP-84) | none: the decision is a console command |
| `owner_hold_reminder` | `OwnerHoldOverdue` (DEC-83): a hold of the checks or the votes still undecided after `owner.holds.remind_after_hours` (24) | each id of `owner.moderator_ids` | `moderation.hold_reminder`: «⏰ Объявление №<n> ждёт решения с <дата и время>: <причина>» / «Решение: owner:release, owner:withdraw или owner:deny-phone»; a text message, no photo | none |

- The soft refusal is the same whatever reason the owner chose (BR-API-181; SCR-058's text says «человеку ответим
  одинаково мягко»). An `agent` answer is a decline for the seeker (BR-APP-098, legacy).
- The seeker's first name is escaped (WP-51) and always follows «Имя в Telegram:», so a name cannot pose as a text of
  HOMI.
- The burst counts the listing's requests created in the current clock hour (Asia/Tashkent; WP-85's table). From the
  sixth on, a request gets no `request_new`; `request_more` (subject the listing's ULID, occasion the hour) is
  dispatched once, delayed to the end of the hour, and at send time counts the listing's requests of that hour beyond
  the burst that are still `pending`; none → `failed` with `stale`, nothing sent. `DeliveryPause` holds it like every
  notice.
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
| `mo` | `k1:mo:<owner listing ULID>:<hd, hdy or hdn>` (at most 36 bytes) | `App\Telegram\Handlers\Moderation\ModerationCallback`, on the `owner_published` and `owner_edited` notices: only for a presser whose `from.id` is in `owner.moderator_ids`, read at the press (else the stale alert); `hd` → the keyboard `[🗑 Да, снять][✖️ Отмена]` (`danger` style on the first); `hdy` → WP-84's hold with reason `moderator` and `by` = the presser's Telegram id (its audit row is WP-84's), then the notice reads `moderation.held` «Снято с публикации» with the time and no buttons; a listing already held or withdrawn → the same text; `hdn` → the first keyboard again. «Снять» only holds, which `owner:release` reverses; releasing, withdrawing and denying stay console commands (`16` SEC-REQ-046) |

The seeker's «📞 Показать номер» is WP-53's `ct` action: for a `request`-mode listing `hasPhone` is `true` only for
the seeker whose request is `given` (WP-85's overlay), so the button works for him and is the stale-button case for
anyone else (WP-53, section 12).

### Cards of native listings and «Связаться с хозяином» (WP-53)

- `ListingCardData` gains `origin` (`legacy`, `native`), `contactMode` (`phone`, `request`, `hidden` or `null`) and
  `requestStatus` (the viewer's request in the seeker form, or `null`), read from the card of WP-80.
- `ListingCardKeyboard`:
  - «Это риелтор» (BTN-041) stays on a native card (DEC-86): the card's author is the owner's phone author
    (WP-80), WP-53's visibility rule of `bot.dev010` does not hide it on a card whose `origin` is `native` although
    such a card is `ownerVerified`, and its votes reach the hold of WP-84 (`votes_agent`) for the operators.
  - A new last row `card.contact_owner` «✉️ Связаться с хозяином» — a `url` button `MiniAppUrl::startApp('c_<n>')`,
    which opens the request sheet of WP-83 — when `contactMode` is `request`, `hasPhone` is `false` and
    `requestStatus` is `null` or `expired`. With a `pending`, `declined` or `cancelled` request the row is absent;
    with `given` the row `📞 Показать номер` takes its place (WP-53's rule on `hasPhone`). `hidden` (a legacy
    `gate` listing while the relay is off, DEC-75) has no row.
  - «🔗 Открыть оригинал» and «📢 Канал» are absent for a native listing because it has no channel (WP-53's existing
    rules).
- Photos come from the card's addresses, WP-84's public copies `owner/<token>/<n>.jpg?v=<version>` (`<token>` new
  for every version, no listing number in the path); «📷 Ещё N фото» works as for any card. The stub's native entries
  carry the demo marker on the stub driver (WP-53).
- The four audited rows keep their layout; the new row is last, as `📞 Показать номер` is.

### Sent cards of a native listing that left the feed (WP-57)

`App\Listeners\Notices\WithdrawNativeCards` on WP-84's events dispatches WP-57's `ListingWithdrawn`:

| WP-84 event and reason | `ListingWithdrawn` cause | Why |
| ---------------------- | ------------------------ | --- |
| `OwnerListingWithdrawn` `paused` | none | the owner may resume it; a press on a sent card reads the current state (WP-53) |
| `OwnerListingWithdrawn` `held` | `source` | out of the feed by the operators or the votes; it may come back, but an edited card is never reverted (WP-57); its public photo copies are deleted at once (WP-84). A listing the check holds at its first publish was never in the feed and has no sent cards |
| `OwnerListingWithdrawn` `removed`, `OwnerListingRented` | `source` | out for good |
| `OwnerListingWithdrawn` `withdrawn` | `takedown` | by the operators (`owner:withdraw`, `owner:deny-phone`; votes only hold, WP-84): the photo is replaced and the text removed (WP-57, BR-BOT-092) |

WP-57 then edits every sent copy to «🚫 Объявление снято» and deletes the unsent outbox rows of that number.

### The operators' notice (DEC-73, item 10)

- On `OwnerListingPublished` with `first` or `released` — the first publication and the return of a held listing to the
  feed after `owner:release`: one `owner_published` notice per id of `owner.moderator_ids` (read at dispatch; empty:
  none), occasion the hour of the event, so a `first` and a `released` of one listing within one clock hour give one
  notice. A resume from `paused` (`resumed`) is not a publication and sends no `owner_published`; when its `fields`
  are not empty — the owner changed the photos or the description while the listing was paused (WP-84) — it sends
  `owner_edited` for those fields under the hourly rule below (integrator default 25).
- Edits of a published listing are live (DEC-80). A change of its photos or description (`OwnerListingEdited` with
  `photos` or `description`) sends `owner_edited` at most once per listing per hour (`notices.edit_interval_minutes`,
  60): the first change of an hour sends at once (occasion that hour); a change that finds the hour's notice already
  claimed dispatches the next hour's notice, delayed to the start of that hour, so every change is shown to the
  operators by a notice rendered after it. Other fields (price, contact mode, status) are not announced.
- On `OwnerListingHeld` (the checks or the votes; an operator's hold raises none, WP-84): one `owner_held` notice
  per id (occasion the hour of the event), with the reason and the counts WP-84 wrote into `owner_check_results`
  (signals and counts only — never a key, a number or a voter). The operators decide with `owner:release`,
  `owner:withdraw` or `owner:deny-phone` (WP-84); the owner sees «На проверке» and is never told that he was marked
  (WP-81).
- On `OwnerHoldOverdue` (DEC-83; WP-84's `owner:remind-holds`, once per hold of the checks or the votes after 24 h):
  one `owner_hold_reminder` notice per id, occasion the hold's `held_at`, with the reason and the time of the hold;
  nothing is released, and the reminder carries no more than the `owner_held` notice did.
- Every notice holds the number, the title line, the masked description (`PhoneMasker`), the photo count and the
  cover. It never holds the owner's number, Telegram id or name, nor the true point (SEC-REQ-051, SEC-REQ-052).
- «Снять» holds the listing (WP-84); releasing it stays a command, `owner:release` with `--by` and `--reason`.
- When the listing is withdrawn, purged or erased with its owner, every sent `owner_*` notice is edited by
  `EraseBotNotice` to `moderation.erased` «Объявление удалено» without buttons, its photo replaced by the neutral
  placeholder.

### Switching the cabinet on (DEC-81)

Until here `config('owner.enabled')` (WP-80) is off on staging and production: what it refuses is listed once in
WP-80 (creating a draft, asking for the phone, publishing, resuming a paused listing and every content edit answer
`403 owner_disabled`; every way down stays open); `GET /reference` says `owner_enabled: false`, and the Mini App shows
no group «Сдаю квартиру» to a user without owner listings (WP-82). Per environment, staging first:

1. The gates of `25` §5, one line each:

   | Gate | Staging (staff accounts, DEC-88) | Production |
   | ---- | -------------------------------- | ---------- |
   | 1 — the legal basis (Q-SEC-021) and the privacy texts, with the consent text (DEC-87) | not required (DEC-88), provided that `OWNER_CABINET_ALLOWED_IDS` lists only the test accounts (WP-84), each staff member whose real number is shared agrees in writing that it is stored, and every test account is erased with «Удалить мои данные» at the end of the run, recorded in the PR | closed: the product owner's written go; the texts of WP-56, WP-61 and WP-70 and the consent text of WP-81 and WP-83 approved by the lawyer and no longer "pending legal review" (DEC-87); `OWNER_CABINET_ALLOWED_IDS` blank |
   | 2 — the operator's answers (points 14 – 21) | not required: they block WP-87 only | not required |
   | 3 — the bot can confirm a phone and deliver requests | WP-88 and this package deployed | the same, and their staging checklists passed |
   | 4 — infrastructure | PostGIS in `homi_staging_db` (present, `docs/infrastructure/deployment.md:139`); boundaries loaded (`geo:load-boundaries`, WP-84); `owner/` of the public disk served by the CDN host; `SHOWN_POINT_SECRET` and `OWNER_MODERATOR_IDS` set; the operators started the bot | the same on production, PostGIS in `homi_db` with its own go (`docs/infrastructure/deployment.md:140`) |
   | 5 — no number in the observability tools | required: the leak protections of WP-84 and WP-88 deployed (Telescope hides the phone, `init_data` and contact fields; the masking cast; the exception reporter without bindings or messages that carry the number), and Telescope records none of the cabinet's requests and jobs with values; whether `TELESCOPE_RECORD_ALL` changes on the servers is the production track's question | the same |
   | 6 — hardening and a way to contest | a team contact in the rejection, hold and privacy texts | WP-70 merged and deployed; a working contest channel: the support bot of WP-59 (DEC-56) or another contact named in the rejection, hold and privacy texts |
   | 7 — the disclosure quota | not required | DEC-19's soft and hard thresholds and Q-API-085's daily cap are numbers in the production env, not blank |

   Gates 5 – 7 are `25` §5 gates 5 – 7 (integrator defaults, listed for the reviewer); that gate 5 holds on staging
   first is DEC-88.

2. Until WP-70's `security:check` covers it, the production track checks by hand, names only: `SHOWN_POINT_SECRET` at
   least 32 bytes, `OWNER_MODERATOR_IDS` not empty, Telescope reduced as gate 5 says or off, `CONTACT_SOFT_LIMIT` and
   `CONTACT_HARD_LIMIT` set (production), `OWNER_CABINET_ALLOWED_IDS` set on staging and blank on production. Then it
   sets `OWNER_CABINET_ENABLED=true` in the server env and restarts Horizon: php-fpm reads the env on every request, so
   the API follows at once; the Horizon workers, which run the bot's handlers and these jobs, read it only at start
   (`docs/infrastructure/deployment.md:60`).
3. Check: `GET /api/v1/reference` answers `owner_enabled: true`; the Mini App shows «Сдаю квартиру» once its cached
   reference data has expired (WP-22); `/start owner_new` sends its button (WP-88); `php artisan
   notices:test-moderators` sends `moderation.test` «Проверка: сюда будут приходить объявления хозяев HOMI» to each id
   of `OWNER_MODERATOR_IDS` (directly through `TelegramBot`, outside the ledger), and the person behind each id confirms
   it reached him; a mistyped id that belongs to another user would otherwise receive every new listing.
4. Run the passes inside Telegram that waited for the switch: the checklists of WP-81, WP-82 and WP-83 with the switch
   on, then WP-88's, then this package's.
5. Production: steps 2 – 4 again, only after every production cell of step 1 is closed; the date and the gates are
   recorded in the PR and in the go record of WP-71.

Going back is the same key unset and a Horizon restart: creating, asking for the phone, publishing, resuming and
editing are refused again (WP-80); published listings stay in the feed until their owners take them down; removing,
pausing, «Сдано» and answering requests keep working (an owner with listings still reaches «Мои объявления»,
«Отклики» and the owner panel, WP-82), and the bot keeps delivering requests and answers for the listings that exist
(DEC-81; the owner's reach of «Мои объявления» confirmed by the developer on 2026-11-20, the rest the plan's
reading, listed for the reviewer). To take every native listing out of public answers at once,
`OWNER_LISTINGS_PUBLIC=false` (WP-86) is the lever, apart from this switch.

### Configuration, erasure, retention

- `backend/config/owner.php` (WP-80), added keys: `notices.similar_count` (3), `notices.similar_price_band` (0.2),
  `notices.retention_days` (90), `notices.request_burst` (5), `notices.edit_interval_minutes` (60).
- `config/erasure.php` of WP-47: `bot_notices` — strategy `delete` by `user_id`. Before WP-85's entry for
  `contact_requests`, a `custom` entry `App\Services\Notices\SeekerNoticeEraser`: while the seeker's requests still
  exist, it queues `EraseBotNotice` for every sent `request_new` about them, which becomes `requests.owner.erased`
  «Отклик удалён по просьбе пользователя» without the name, the message or buttons, and deletes those rows. The notices
  to an operator have no `user_id`: when WP-84 withdraws, purges or erases an owner listing (`OwnerListingWithdrawn`
  `withdrawn`, `OwnerListingErased`), `SendModerationNotice` edits every sent `owner_*` notice of it ("The operators'
  notice"); the rows then go by retention.
- `config/retention.php`: `bot_notices` — `notices.retention_days` after `sent_at`, pruned by `model:prune` (the
  model is `Prunable`); `RetentionRegistryTest` of WP-47 fails without it.
- A sent message stays in the recipient's chat (Telegram messages are not deleted), but its erased content does not:
  the edits above remove names, messages, descriptions and covers; a press on it after the request was erased gets
  the stale alert. An edit that Telegram refuses is counted and dropped; the privacy texts say that sent messages are
  edited, not deleted (WP-56, WP-61).

## Files

All paths under `backend/` unless they start with `docs/`.

- `app/Services/Notices/{NoticeDispatcher,NoticeRenderer,SimilarListings,SeekerNoticeEraser}.php`
- `app/Jobs/Notices/{SendBotNotice,EditBotNotice,EraseBotNotice}.php`
- `app/Console/Commands/Notices/TestModeratorsCommand.php` (`notices:test-moderators`)
- `app/Listeners/Notices/{SendRequestNotices,FollowOwnerAnswer,SendModerationNotice,WithdrawNativeCards}.php`
- `app/Telegram/Handlers/Requests/RequestAnswerCallback.php`, `app/Telegram/Handlers/Moderation/ModerationCallback.php`
- `app/Telegram/Rendering/{RequestMessageRenderer,ModerationNoticeRenderer}.php`
- `app/Models/BotNotice.php`, `database/factories/BotNoticeFactory.php`,
  `database/migrations/<date>_create_bot_notices_table.php`
- Changed: `app/Telegram/Rendering/{ListingCardData,ListingCardDataFactory}.php`,
  `app/Telegram/Keyboards/ListingCardKeyboard.php` (WP-53), `app/Providers/TelegramServiceProvider.php` (actions `rq`,
  `mo`), `config/owner.php`, `config/erasure.php`, `config/retention.php`. The listeners under `app/Listeners` are
  discovered by Laravel, as `App\Listeners\RecordSourceFlagChange` is today; registering them again would run them
  twice
- `lang/{ru,uz,en}/bot.php`; `tests/Fixtures/Bot/translation-status.json`
- `tests/Feature/Notices/{SendBotNoticeTest,RequestNoticesTest,RequestBurstTest,OwnerMessageFollowsTest,SoftRefusalTest,ModerationNoticeTest,WithdrawNativeCardsTest,NoticeErasureTest,OwnerCabinetSwitchTest,NoticeLeakTest}.php`
- `tests/Feature/Bot/{RequestAnswerCallbackTest,ModerationCallbackTest,NativeCardKeyboardTest}.php`
- `tests/Unit/Notices/{NoticeRendererTest,SimilarListingsTest}.php`
- `tests/Fixtures/Bot/transcripts/{request-new,request-give,request-decline-reason,request-undo,request-late,request-closed,request-given-seeker,soft-refusal,flat-let,request-expired,moderation-hold,moderation-held-review,moderation-edited,native-card}.json`
- `docs/infrastructure/telegram-webhook.md` (the actions, the notices, the switch-on); `docs/api/README.md` unchanged

## Steps

Generators always with `--no-interaction`; tests first inside each step; Pint after every PHP edit.

Part A.

1. Read WP-85 ("Events", "The owner's answers"), WP-84 ("Statuses and their effects", "Moderation"), WP-57 ("Pacer",
   "Withdrawn listings") and WP-53 ("Keyboard", section 12); write into "Handoff" every name that differs from "What
   comes from where".
2. The migration, `BotNotice`, `NoticeDispatcher`, `SendBotNotice`, `EditBotNotice`, `EraseBotNotice`;
   `SendBotNoticeTest` (claim, stale, gone, quiet hours, `403`, `429`, a lost answer never resent, occasions).
3. `RequestMessageRenderer`, `NoticeRenderer` in three languages; `NoticeRendererTest`.
4. `SendRequestNotices` (the five request events) with the burst and `request_more`; `RequestNoticesTest`,
   `RequestBurstTest`; transcripts `request-new`, `request-given-seeker`, `flat-let`, `request-expired`.
5. `RequestAnswerCallback` and `FollowOwnerAnswer` (the edit after every answer, from the bot or the Mini App);
   `RequestAnswerCallbackTest`, `OwnerMessageFollowsTest`; transcripts `request-give`, `request-decline-reason`,
   `request-undo`, `request-late`, `request-closed`.
6. `SimilarListings` and the soft refusal; `SimilarListingsTest`, `SoftRefusalTest`; transcript `soft-refusal`.
7. The erasure and retention entries, `SeekerNoticeEraser`; `NoticeErasureTest`, `NoticeLeakTest`.
8. `make ci-backend`; PR A; deploy with the cabinet off.

Part B.

9. `ListingCardData` and `ListingCardKeyboard`: `origin`, `contactMode`, `requestStatus`, «Связаться с хозяином»;
   `NativeCardKeyboardTest`; transcript `native-card`.
10. `WithdrawNativeCards`; `WithdrawNativeCardsTest` with WP-57's `WithdrawnCardEditTest` green.
11. `SendModerationNotice` (publications, edits, holds, the hold reminder, the erased edit), `ModerationCallback`,
    `ModerationNoticeRenderer`, `notices:test-moderators`; `ModerationNoticeTest`, `ModerationCallbackTest`;
    transcripts `moderation-hold`, `moderation-held-review`, `moderation-edited`.
12. `OwnerCabinetSwitchTest`; the registry rows and the switch-on section of `docs/infrastructure/telegram-webhook.md`;
    `make ci-backend`; review by the `security-reviewer` agent (names and numbers in messages, the operators'
    button, the switch); PR B; deploy.
13. The procedure of "Switching the cabinet on" on staging (DEC-88), the checklist below with test accounts; the
    production switch-on stays the production track's step after the gates.

## Behaviour to reproduce

Owned: BOT-087 … BOT-090 (the bot's side of the requests) and the operators' notice of DEC-73. None was ever observed
in legacy (`04` §5); the rows below are closed by this specification.

| # | Scenario | What the user sees | Rules, questions |
| - | -------- | ------------------ | ---------------- |
| 1 | A seeker sends a request on a native listing (BOT-087) | the owner gets «📩 Отклик на квартиру…» with «Имя в Telegram: …», who, how many, the move-in and the message, and `[Дать номер][Не подходит]`; «Отклики придут в бот. Ответить можно там или в «Мои объявления»» holds; from the sixth request on one listing in an hour, one «Ещё N откликов…» at the hour's end | BR-API-180, BR-APP-090; Q-BOT-048 |
| 2 | The owner presses «Дать номер» in the bot or in the Mini App (BOT-088) | the owner's message reads «Номер дали» with «Отменить» for ten minutes, then «Оказался риелтором» for seven days; the seeker gets «✅ Хозяин готов поговорить…» with «📞 Показать номер», which shows the number only after the press | BR-API-181, BR-API-187; DEC-52 |
| 3 | «Не подходит», then a reason or none (BOT-089) | the owner's message offers «Уже договорился» / «Похоже на риелтора» and «Отменить»; ten minutes later the seeker gets the soft refusal with up to three similar listings — the same whatever reason | BR-API-181; item 13; Q-API-075 |
| 4 | «Отменить» within ten minutes | the previous answer returns (`pending` today); no soft refusal is sent; a `given` seeker's message loses its button | BR-API-181 |
| 5 | «Похоже на риелтора» or «Оказался риелтором» | the seeker is marked and can no longer write to this owner's flats (WP-85); the seeker sees a decline | BR-API-181, BR-APP-098 |
| 6 | The owner marks the flat «Сдано» (BOT-090) | every seeker still waiting gets «Квартиру … уже сдали…»; their requests are `cancelled` | BR-API-176 |
| 7 | Nobody answers in time | the seeker gets «Хозяин квартиры … не ответил вовремя…» with «Откликнуться ещё раз» (DEV-060) | BR-API-186; Q-API-075 |
| 8 | A press after a window closed, or on a request changed meanwhile | the alert «Этот ответ уже нельзя изменить»; the message shows the current state | BR-APP-090 |
| 9 | A bot card of a native listing in `request` mode | «Это риелтор» as on any card; the last row «✉️ Связаться с хозяином» opens the request sheet in the Mini App | DEC-77, DEC-52 |
| 10 | A native listing is removed, let, held or withdrawn | its sent cards become «🚫 Объявление снято»; a paused one keeps them | BR-API-176, BR-API-177, BR-BOT-092 |
| 11 | An owner publishes a listing, or the operators release a held one | each operator gets «🆕 Объявление хозяина №…» with «Снять»; «Снять» → «Да, снять» → the listing is held and leaves the feed; the owner cannot resume it | DEC-73; BR-API-177 |
| 12 | The owner changes the photos or the description of a published listing | each operator gets «✏️ Объявление №… изменено…» with «Снять», at most once an hour per listing | DEC-73, DEC-80 |
| 13 | The realtor check or the votes hold a listing | each operator gets «⏸ Объявление №… на проверке…» with the reason and the counts; the owner sees «На проверке» and is not told he was marked | DEC-77; `16` SEC-REQ-045 |
| 14 | The cabinet is switched off | rows 1 – 10 keep working for the listings that exist; owners publish and edit nothing (WP-80) | DEC-81 |

Edge cases:

- A request arrives while the owner blocked the bot: the notice fails as `chat_unreachable`; the request stays in
  «Отклики» of the Mini App.
- The seeker blocked the bot between the request and the answer: his notices fail the same way; the answer stands.
- Two operators press «Да, снять» at once: one hold, both notices read «Снято с публикации».
- The owner answers in the Mini App before the `request_new` notice was sent: the notice is `stale` and not sent; the
  owner sees the request in «Отклики».
- No message of this package carries a phone number, the seeker's message text to anyone but the owner, or a name to
  anyone but the owner.
- A seeker erases his data: the owner's sent «📩 Отклик…» messages become «Отклик удалён по просьбе пользователя».
  An owner listing is withdrawn, purged or erased: the operators' notices become «Объявление удалено» without the
  cover.
- An id of `OWNER_MODERATOR_IDS` belongs to a user who never started the bot: its notices fail as
  `chat_unreachable`; `notices:test-moderators` shows it before the switch-on.

## Tests

Conversation tests use the runner of WP-51; the Bot API through `FakeBotApi` of WP-50; requests, owner listings and
users from the factories of WP-84 and WP-85; the cabinet switch on (`phpunit.xml`, WP-80) unless a case says
otherwise; time frozen with `travelTo` in Asia/Tashkent. After every case a scan of the Bot API calls, the job
payloads and the log records finds no digit run of the owner's synthetic number (`+998000000081`).

| # | Test | Cases |
| - | ---- | ----- |
| 1 | `SendBotNoticeTest` | one dispatch → one send and a `sent` row; the same dispatch twice → one send; the same kind and subject in two occasions → two sends; a `claimed` row older than five minutes → not resent, counted; a gone subject → row deleted, nothing sent; a `stale` subject → nothing sent; inside quiet hours → `disable_notification: true`; `429` → released for `retry_after`, sent once afterwards; `403` → `markBlocked`, `failed`; `delivery:pause on` → released |
| 2 | `RequestNoticesTest` | `ContactRequested` → `request_new` to the owner with the first name and the answers escaped; a relayed request (no owner) → nothing to an owner; `give` → `request_given` to the seeker with `k1:cd:<n>:ct`; `RequestDeclined` → the soft refusal; `RequestsCancelledByRent` with three ids → three notices; `RequestExpired` → the expiry notice with the `c_<n>` link; a first name with bidi and zero-width characters is shown escaped after «Имя в Telegram:» |
| 2a | `RequestBurstTest` | six requests on one listing in a clock hour → five `request_new` and one `request_more` at the hour's end with N = 1; the sixth answered before the hour's end → `request_more` `stale`, nothing sent; the next hour starts a new burst |
| 3 | `RequestAnswerCallbackTest` | each of `gv`, `dc`, `rf`, `ra`, `ud`, `lt` → WP-85's action and the edited message; another owner's request id → the stale alert, nothing changed; a press after the undo window → the alert and the re-rendered message; the per-user limit counts the writes |
| 4 | `OwnerMessageFollowsTest` | an answer given through `POST /owner/requests/{id}/answer` edits the owner's bot message; an undo of a `give` edits the seeker's message to «Хозяин отменил ответ…»; «message is not modified» is success |
| 5 | `SoftRefusalTest`, `SimilarListingsTest` | three similar listings from the merged feed, without the declined number and the seeker's hidden ones; none → the `…_none` text; the source down → the `…_none` text at once; an `agent` answer sends the same refusal |
| 6 | `NativeCardKeyboardTest` | a native card: «Это риелтор» as WP-53 gives it, and also with `bot.dev010` on (DEC-86); «Связаться с хозяином» with `startapp=c_<n>` for no request and for `expired`; absent for `pending`, `declined`, `cancelled`; `📞 Показать номер` instead for `given`; a legacy `hidden` listing → no row; an `ag` press on a native card → WP-44's vote on the owner's phone author key |
| 7 | `WithdrawNativeCardsTest` | `paused` → no `ListingWithdrawn`; `held` (by «Снять» and by votes), `removed`, rented → cause `source`; `withdrawn` → `takedown`; WP-57 then edits the sent copies |
| 8 | `ModerationNoticeTest`, `ModerationCallbackTest` | a first publication → one notice per moderator id, as a photo with the cover; a release of a held listing → one `owner_published` again; a resume from `paused` → no `owner_published`, and with `fields` `photos` → one `owner_edited` under the hourly rule, without a change → none; empty ids → none; a photo change of an active listing → one `owner_edited`, a second change in the same hour → one more notice at the start of the next hour, a third in that hour → no third; a price change → none; `OwnerListingHeld` with `check_agent` and with `votes_agent` → one `owner_held` per id with the reason and the counts, no key, number or voter; `moderator` → no `owner_held`; `OwnerHoldOverdue` → one `owner_hold_reminder` per id, a second dispatch for the same hold → none (DEC-83); a withdrawn, purged or erased listing → every sent notice edited to «Объявление удалено» with the placeholder; `notices:test-moderators` → one message per id; no notice holds a number, a Telegram id of the owner or the true point; `hd` → the confirm keyboard; `hdy` → WP-84's hold with reason `moderator` and the presser's id; a presser outside the list → the stale alert, nothing held; two presses → one hold |
| 9 | `OwnerCabinetSwitchTest` | switch off: `POST /owner/listings` → `403 owner_disabled`, `GET /reference` `owner_enabled: false`, `/start owner_new` → welcome only, a request on an existing listing is still delivered and answerable, `PUT …/status` with `paused`, `rented` and `removed` still works (WP-80's list); switch on: the reverse |
| 9a | `NoticeErasureTest` | the erasure of a seeker with two sent `request_new` → both edited to «Отклик удалён…» without name, message or buttons before his requests go, and his own `bot_notices` rows deleted |
| 10 | `NoticeLeakTest` | after every scenario of tests 2 – 9a: no first name, message text or number in the logs, `failed_jobs`, the Horizon payloads, `bot_notices` or `telescope_entries` (Telescope on with the configuration of WP-84 and WP-88) |
| 11 | Transcripts | the fourteen files of "Files" in ru; `request-new`, `request-given-seeker` and `soft-refusal` also in uz and en |

## Acceptance checklist

Run in ru, uz and en on the staging bot with `OWNER_CABINET_ENABLED=true` (DEC-88) after gate 5 holds on staging,
`OWNER_CABINET_ALLOWED_IDS` set to the test accounts, a test owner, a test seeker and an operator's test account; the
staff whose real numbers are shared agree in writing, and every test account is erased at the end of the run (the
erasure recorded in the PR); attach screenshots to the PR. The texts are HOMI's and wait for the product owner's
approval; the checks are about behaviour, not about parity with legacy.

- [ ] The gates of `25` §5, gates 5 – 7 included, are listed in the PR with their state on staging and on
      production (the table of "Switching the cabinet on").
- [ ] `notices:test-moderators` reached every id of `OWNER_MODERATOR_IDS`, each confirmed by the person behind it.
- [ ] `OWNER_CABINET_ENABLED=true` was set on staging with a Horizon restart; `GET /reference` answers `owner_enabled:
      true`; the Mini App shows «Сдаю квартиру».
- [ ] A test owner publishes a listing; the operator's account gets the notice with the cover and «Снять». A change
      of its photos gets «✏️ Объявление … изменено» once in the hour.
- [ ] A test listing held by the check or by votes reaches the operator as «⏸ … на проверке» with the counts;
      `owner:release` brings it back and announces it again; the owner saw «На проверке» only.
- [ ] A test hold left undecided for a day reaches the operator once more as «⏰ … ждёт решения», and the listing
      stays held until `owner:release` (DEC-83).
- [ ] A test seeker sends a request; the owner gets it in the bot with «Имя в Telegram: …» and the answers.
- [ ] Once WP-87 is merged and its switch is on with the operator's test account: the outcome of a relayed request
      reaches the seeker in this package's messages (moved here from WP-87's checklist).
- [ ] «Дать номер» in the bot: the seeker gets «✅ Хозяин готов поговорить…»; «📞 Показать номер» shows the number
      only after the press; another account pressing a forwarded copy gets no number.
- [ ] «Дать номер» in the Mini App instead: the owner's bot message follows it.
- [ ] «Не подходит» with and without a reason: ten minutes later the seeker gets the soft refusal with similar
      listings; «Отменить» inside the ten minutes sends nothing.
- [ ] «Оказался риелтором» after a give marks the seeker; his next request on this owner's flats is refused.
- [ ] «Сдано» tells the waiting seeker that the flat is let; a request left unanswered past the expiry tells the seeker
      and offers «Откликнуться ещё раз».
- [ ] A bot card of the native listing shows «Это риелтор» as any card (DEC-86) and opens the request sheet from
      «Связаться с хозяином».
- [ ] «Снять» → «Да, снять» holds the listing: it leaves the feed, its sent cards read «Объявление снято», and the
      owner cannot resume it.
- [ ] No message in any chat holds a phone number unasked; the seeker's message text reached the owner only.
- [ ] With the switch off again, publishing is refused, the owner can still pause, mark «Сдано» and remove the test
      listing, and its requests are still delivered.
- [ ] After the run the production track's scan of `telescope_entries`, the Laravel log and `failed_jobs` on staging
      finds no test number and no test first name (`16` SEC-REQ-051, SEC-REQ-053).
- [ ] Tests of this package and of WP-53, WP-57, WP-85 are green; `make ci-backend` is green; the security review
      is recorded in the PR.
- [ ] Production: the switch-on is recorded only after the gates are closed, by the production track, with the
      product owner's go; the checks above are repeated there with real accounts the product owner names.

## Handoff

Empty.
