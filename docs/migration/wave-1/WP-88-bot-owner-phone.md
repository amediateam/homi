# WP-88 — Bot: the owner's phone and the way back to the draft

| Field | Value |
| ----- | ----- |
| Stage | D |
| Status | TODO |
| Depends on | WP-56, WP-84 |
| Size | about 1 300 changed lines with tests, M |
| Behaviour reference | `04` BOT-086, §3.18, Q-BOT-047, Q-BOT-049; `05` TMA-034, TMA-046; `03` SCR-053, SCR-054, LB-APP-060, LB-APP-065; `02` BR-API-170 … BR-API-172; `16` SEC-036, SEC-REQ-051 |
| Needs from the production track | `PHONE_HMAC_PEPPER` (WP-50) and `AUTHOR_KEY_SECRET` (WP-42) set. Before the checks inside Telegram: (1) the Main Mini App address of the staging bot in @BotFather (`https://app.staging.homi.uz/`), the setting WP-58 lists, done now because the `startapp` buttons of this package (`o_<id>`) and of WP-89 (`c_<number>`) need it; (2) `OWNER_CABINET_ALLOWED_IDS` on staging set to the test accounts' Telegram ids (WP-80, WP-84); (3) `OWNER_CABINET_ENABLED=true` on staging, as WP-89's switch-on procedure does it on staging (DEC-81), only once gate 5 of `25` §5 holds there (no number in the observability tools); never on production here |

## Goal

The contact an owner shares — from the Mini App with «Поделиться номером» (`requestContact`, Telegram 6.9 and
later) or, on an older client, in the chat — sets the number of his draft within seconds, or refuses it with the
reason the Mini App shows. The number is taken once, at the webhook, while the phone window of that draft is open
(DEC-72); the update ledger keeps only its keyed hash, as for every contact. The chat answers in words and gives the
owner a button back to the phone step of the same draft. `/start owner_new` opens the owner form.

## Scope

In:

- The seam in WP-50's ledger: `ContactInterceptor`, called inside the insert of a new private contact update, before
  the number leaves memory; its implementation passes the contact to WP-84's phone window and writes the result as a
  marker without digits into the stored update.
- The branch of WP-56's `ContactMessage` for that marker: the chat reply of the cabinet, and no `/owner` record.
- The replies: number set, another person's contact (`not_own`), not `+998` (`not_uz`), refused at confirmation
  (`denied`, `limit`), each with the button back to the draft (fix of LB-APP-060).
- The bot side of the leak protections that ship with the first stored number (WP-84): the webhook request, the
  Bot API calls and the interceptor's failures never reach Telescope, the log or an exception with a digit of the
  number ("Observability").
- The share button in the chat for clients below 6.9: the `/start owner_phone` payload, its prompt with the reply
  keyboard, its conversation and its cancel.
- `/start owner_new` with a Mini App button to the owner form (TMA-046).
- `MiniAppUrl::ownerNew()` and `MiniAppUrl::startApp()`; the payload kinds `OwnerNew` and `OwnerPhone`.
- Conversation tests, transcripts, and the checks inside Telegram.

Out:

- The phone window itself, the checks behind `denied` and `limit` (and the realtor check at publish), the storage of
  the number and its two read paths — WP-84 ("The phone window and the number", "Publish and checks").
- The Mini App's phone step: `tg.requestContact()`, `POST /owner/listings/{id}/phone-request`, the poll of `GET
  /owner/listings/{id}`, the rejection screen and the waitlist, the «Открыть бот» link of an old client — WP-81.
- `/owner` itself (BOT-075 … BOT-079) — WP-56, unchanged outside an open window (DEV-011).
- Requests, answers and the operators' notice — WP-89. The realtor waitlist message (BOT-091) — a later broadcast
  of WP-57's tool.

## Decisions that bind this package

- DEC-72: the owner's number is stored in plain text with the owner listing (WP-84). Here it exists only in the memory
  of the webhook request that carried the contact; the ledger, the job payload, the logs and the chat reply never
  hold a digit of it (SEC-REQ-051).
- DEV-011 (`09` §4.2), WP-56: `/owner` keeps a keyed hash only. Outside an open phone window a contact goes to
  `/owner` exactly as today; inside one it is the cabinet's and creates no `owner_verifications` row.
- DEC-77: the checks are HOMI's own (WP-84). At confirmation a number is refused only by the operators' deny list
  (`denied`) or the per-phone limit (`limit`); the automatic realtor check does not refuse a number, it holds the
  listing at publish for the operators (`hold_reason: check_agent`, WP-84). The chat says only that the number was not
  accepted and leaves the reason to the Mini App's rejection screen (DEV-056).
- DEC-74, DEV-056: `not_own` and `not_uz` travel in `phone_error`, apart from `reject_reason` (WP-80, WP-84); the chat
  reply follows that split.
- DEC-81: while `owner.enabled` is false no new phone window opens (`POST …/phone-request` answers `403
  owner_disabled`, WP-80); a window opened before still accepts its contact; `/start owner_new` and `/start
  owner_phone` give the ordinary welcome only.
- DEC-46, `04` BOT-086 `UNVERIFIED`: legacy's chat reply, its old-client path and its relation to `/owner` were never
  observed (Q-BOT-047). Every chat text here is HOMI's, written in the brand layer for the product owner to approve;
  the checklist claims no parity for it.
- DEC-40: the texts name HOMI through the brand layer (`:brand`, `:bot`).
- *Integrator defaults, listed for the reviewer:* item 6 (the phone window: `POST
  /owner/listings/{id}/phone-request` opens ten minutes in which an own `+998` contact shared with HOMI's bot becomes
  the draft's number; outside a window a contact goes to `/owner`), item 22 (DEC-81's switch goes on on staging, with
  test accounts, for the checks inside Telegram before the legal gate closes; on production only after the gates of
  `25` §5), item 26 (the realtor check holds at publish instead of refusing a number), item 28 (the leak protections
  ship with the code that first stores the number; this package's part is "Observability"), item 30 (the staging
  allow-list `OWNER_CABINET_ALLOWED_IDS`) and item 32 (`reject_reason` `denied` or `limit`). Defaults of this
  specification, in the same list:
  a cabinet contact does not also verify the user for `/owner`; an old client reaches the share button through the
  payload `owner_phone`; the chat names no rejection reason; a contact sent while the cabinet prompt is open but the
  window has closed is refused, not taken by `/owner`; the button back to the draft is a `startapp` link, not a
  `web_app` button; Telescope records neither the webhook request nor the Bot API calls ("Observability").

## Design

The specification of the named package is authoritative for names. If it differs, use its name and do not create a
second service.

### What comes from where

| Need | Package | Call expected |
| ---- | ------- | ------------- |
| Accepting a contact for a draft | WP-84, "The phone window and the number" | the phone window's acceptor: given the sender's Telegram id, the contact's `user_id` and the number in E.164, it finds the sender's draft whose window is open, sets the number or `phone_error`, runs the checks, and answers that owner listing — or nothing when no window is open |
| Ledger, redaction, hash | WP-50 | `UpdateLedger::accept()`, `UpdateRedactor::beforeStore()`, `PhoneHmac::of()` (the normalisation: digits only, leading `+`) |
| The contact handler, `/owner` | WP-56 | `ContactMessage`, `OwnerCommand`, the conversation kind `Owner` |
| `/start` payloads, Mini App addresses | WP-52 | `StartPayloadParser`, `StartPayloadKind`, `StartCommand`, `MiniAppUrl` |
| Replies, keyboards, conversations | WP-51 | `ReplyKeyboard::requestContact()`, `ReplyKeyboard::remove()`, `InlineKeyboard`, `ConversationStore`, `ConversationKind` |
| Brand values | WP-51 | `brand.bot_username`, `:brand`, `:bot` |
| The switch | WP-80 | `config('owner.enabled')` |

### The flow end to end

```text
Mini App (WP-81)                     API (WP-84)                       Bot (this package)
phone step ──POST …/phone-request──▶ window open for 10 min
tg.requestContact() (6.9+) ──────── Telegram sends the contact as a message into the bot chat ──▶ webhook
                                     acceptor: number set / phone_error / rejected ◀── interceptor (in the insert)
poll GET /owner/listings/{id} ◀──── phone_set, phone_display, phone_error, reject_reason
                                                                       job → ContactMessage → reply in the chat
older client: «Открыть бот» ─────── t.me/<bot>?start=owner_phone ───▶ prompt with the share keyboard → as above
```

The stored update of the contact, as the job reads it (encrypted at rest, WP-50):

```json
{"update_id": 9001, "message": {"message_id": 77, "chat": {"id": 5001, "type": "private"},
 "from": {"id": 5001, "is_bot": false, "language_code": "ru", "has_username": false},
 "contact": {"user_id": 5001, "phone_hmac": "3f9c…", "cabinet": {"listing_id": "01JF0000000000000000000003",
             "result": "set", "reason": null}}}}
```

### The seam in the ledger

Contract `App\Telegram\Updates\Contracts\ContactInterceptor`:

```php
public function intercept(int $senderId, ?int $contactUserId, string $e164): ?CabinetContactResult;
```

`App\Telegram\Updates\CabinetContactResult` (readonly): `listingId` (the owner listing's ULID), `result` (`set`,
`not_own`, `not_uz`, `rejected`), `reason` (`denied` or `limit` with `rejected`, else `null`). It holds no
number.

`UpdateLedger::accept()` (WP-50, "Request path" and "Redaction and encryption") gains one branch for an update whose
`message.chat.type` is `private` and which carries `message.contact`:

1. The number is normalised once, as `PhoneHmac::of()` does, into a local variable.
2. `UpdateRedactor::beforeStore()` builds the stored payload as today: `message.contact` becomes `{"user_id": …,
   "phone_hmac": "…"}`; the raw number, `first_name`, `last_name` and `vcard` are dropped.
3. One transaction: `insertOrIgnore` of the row. Only when the row was inserted (not a duplicate delivery),
   `ContactInterceptor::intercept(from.id, contact.user_id, $e164)`; a result is written into the stored payload as
   `message.contact.cabinet = {"listing_id": "<ULID>", "result": "set", "reason": null}` and encrypted with it.
   Commit; the job is dispatched after commit, as before.
4. The local variable is unset in a `finally`. An exception of the interceptor is not caught: the transaction rolls
   back, the webhook answers `5xx` and Telegram delivers the update again (WP-50: the only non-2xx answer to an
   authentic request). Neither the interceptor nor WP-84's acceptor puts the number into an exception message, a
   log context or a job; a database failure inside the insert is reported by WP-84's exception reporter (the SQL
   with placeholders and the error code, never the message with its bindings), so the number reaches neither the
   Laravel log, nor `failed_jobs`, nor Telescope's exception entries.

So a contact is applied to a draft at most once (a duplicate delivery is ignored before the interceptor runs), and
the stored update still holds only the HMAC: WP-50's tests 1 and 2 (`UpdateLedgerPrivacyTest`) pass unchanged, and
`afterProcessing()` removes the whole `contact` object, the marker with it, once the update is processed.

`App\Telegram\Owner\CabinetContactInterceptor implements ContactInterceptor` (bound in `TelegramServiceProvider`)
calls WP-84's acceptor and maps the listing it answers: `phone_error` `not_own` or `not_uz` → that result; `status:
rejected` → `rejected` with `reject_reason`; else `set`. No answer → `null`, and the update goes on as an ordinary
contact. A contact sent in a group never reaches the interceptor (step 1 checks the chat type) and never a handler
(WP-51, WP-52).

### The branch in `ContactMessage` (WP-56)

| Stored update | Conversation | Handler |
| ------------- | ------------ | ------- |
| `contact.cabinet` present | any | `App\Telegram\Handlers\Owner\CabinetContactReply`; no `owner_verifications` write; an open `OwnerPhone` or `Owner` conversation ends; the reply keyboard is removed in the same reply |
| no marker | `OwnerPhone` open | `CabinetContactReply::windowClosed()`: the "window closed" reply; nothing is stored, so a contact meant for the cabinet never becomes an `/owner` verification |
| no marker | none or `Owner` | WP-56 as specified: the sender's own contact → `/owner` verification (hash only); another's → `owner.not_own_contact` |

### Replies

All texts are new catalogue keys of HOMI (not observed in legacy, BOT-086 `UNVERIFIED`), in `lang/{ru,uz,en}/bot.php`,
marked in `tests/Fixtures/Bot/translation-status.json` "HOMI text, pending the product owner's approval". Russian
drafts:

| Result | Key and text | Keyboard |
| ------ | ------------ | -------- |
| `set` | `owner_phone.set` «✅ Номер подтверждён. Вернитесь к объявлению — осталось выбрать, как с вами связываться.» | `remove_keyboard`, then one `url` button `owner_phone.back` «↩️ Вернуться к объявлению» → `MiniAppUrl::startApp('o_<listing ULID>')` |
| `not_own` | `owner_phone.not_own` «Это чужой контакт. Поделитесь своим номером — кнопкой внизу.» | the reply keyboard `📱 Поделиться номером` (BTN-073) / `Отмена` (BTN-074); the conversation `OwnerPhone` opens |
| `not_uz` | `owner_phone.not_uz` «Нужен номер Узбекистана, с +998. Поделитесь им — кнопкой внизу.» | as `not_own` |
| `rejected` | `owner_phone.rejected` «Не получилось подтвердить этот номер. Что дальше — в объявлении.» | `remove_keyboard`, then the button back to the draft |
| window closed | `owner_phone.no_window` «Время подтверждения вышло. Откройте объявление и нажмите «Поделиться номером» ещё раз.» | `remove_keyboard`, then a `web_app` button `📱 Открыть приложение` (BTN-005) → `MiniAppUrl::home()` |

- No reply holds a digit of the number, its display form or a part of it; the owner sees his number in the Mini App
  (`phone_display` of WP-80).
- The Mini App learns the result from its poll of `GET /owner/listings/{id}` (BR-API-170) within seconds; the chat
  reply is extra («Загляните в чат с ботом — там может быть ответ», the Mini App's own text).
- A rejected owner finds the reason and the support button on the rejection screen (DEV-056, WP-81); the chat does
  not label the person (SEC-REQ-045).

### Clients below 6.9 (LB-APP-060)

A client below 6.9 has no `requestContact` (TMA-034); the Mini App's phone step then opens the phone window and sends
the owner to the bot (WP-81). The bot side:

- The link is `https://t.me/<brand.bot_username>?start=owner_phone` (WP-81 builds it with
  `botStartUrl("owner_phone")` of `frontend/app/lib/deeplinks/build.ts`).
- `StartPayloadParser` (WP-52, "Payloads and attribution") recognises `owner_phone` as kind `OwnerPhone`. After the
  ordinary welcome, `OwnerPhoneStart` sends a third message:
  - an open window of the sender (WP-84's acceptor-side read: the sender's draft with `phone_window_until` in the
    future; WP-84's name) → `owner_phone.prompt` «Чтобы подтвердить номер для объявления, нажмите «📱 Поделиться
    номером» внизу.» with the reply keyboard `📱 Поделиться номером` / `Отмена`, and the conversation
    `ConversationKind::OwnerPhone` with `awaiting = contact` (a new case of WP-51's enum);
  - no open window → `owner_phone.no_window` with its button.
- `Отмена` while `OwnerPhone` is open → `OwnerPhoneCancelInput`: `owner_phone.cancelled` «Хорошо, номер не
  подтверждаем. Вернуться к объявлению можно в приложении.» and `remove_keyboard`; the conversation ends. Any other
  text ends it and is handled normally (WP-55's free text).
- The shared contact then goes through the seam as any other; the window of ten minutes (item 6) is the deadline.
- The reply keyboard is the second reply keyboard of the bot after `/owner` (BR-BOT-005 named one); it is removed on
  every end of the conversation.

### `/start owner_new` (TMA-046)

- `StartPayloadParser` recognises `owner_new` and `owner-new` (the two forms of TMA-046) as kind `OwnerNew`; both new
  kinds are storable in `user_attributions` with `kind` `owner_new` or `owner_phone` and the raw payload, nothing
  else.
- After the ordinary welcome, `OwnerNewStart` sends `owner_new.body` «Сдать квартиру можно в приложении: заполните
  объявление — его увидят те, кто ищет.» with one `web_app` button `owner_new.button` «🏠 Сдать квартиру» →
  `MiniAppUrl::ownerNew()`. The Mini App opens the owner form on the caller's untouched draft or a new one (DEV-054,
  WP-81).
- While `owner.enabled` is false the third message is not sent. Which links of the operator or of HOMI carry this
  payload is open (Q-BOT-049); nothing in Wave 1 depends on it.

### Mini App addresses (WP-52, "Mini App addresses")

- `MiniAppUrl::ownerNew(): ?string` — the Mini App address with `owner=new`, appended with `?` or `&` as `listing()`
  does; the Mini App reads that page query (TMA-046; WP-81).
- `MiniAppUrl::startApp(string $param): ?string` — `https://t.me/<brand.bot_username>?startapp=<param>`; `$param`
  must match `[A-Za-z0-9_-]{1,64}`, else `null`; `null` when the username is empty. A `web_app` button opens an
  address and carries no start parameter, while `o_<id>` (WP-81) and `c_<number>` (WP-83) are start parameters the
  Mini App reads from its launch data; a `startapp` link opens the bot's Main Mini App, whose address WP-58 sets in
  @BotFather, with that parameter (verify against the Bot API documentation). Sent as a `url` button; the host
  `t.me` is on the address allow-list (SEC-REQ-019). WP-89 uses it for `c_<number>`.

### Observability (the bot side of the leak protections)

WP-84 ships the protections of the owner's number with the code that first stores it (the masking cast, the
exception reporter, the Telescope filters); this package adds the bot's part in the same configuration
(`backend/config/telescope.php`, `app/Providers/TelescopeServiceProvider.php`), before any staging run with the
cabinet on (`25` §5 gate 5):

- The webhook path `telegram/webhook` joins Telescope's `ignore_paths`: the request watcher would record the raw
  update, with `contact.phone_number` and the names, before WP-50's redaction runs.
- The client-request watcher ignores `api.telegram.org`: a Bot API call carries the token in its address
  (SEC-REQ-013) and the reply texts.
- The job of a contact update needs no filter: `ProcessTelegramUpdateJob` carries the bot id and the `update_id`
  only (WP-50), and the stored update holds only the HMAC and the marker.
- Whether Telescope records everything on the servers (`TELESCOPE_RECORD_ALL`) is the production track's choice; the
  filters above hold either way.

### Registry and metrics

`docs/infrastructure/telegram-webhook.md`: the interceptor in the ledger flow (what it reads, what it stores, that it
stores no digit); the payloads `owner_phone` and `owner_new`; the conversation kind `OwnerPhone`.

Metrics through `BotMetrics` of WP-50, no user or chat id as a label: `cabinet_contact_total{result}` (`set`,
`not_own`, `not_uz`, `rejected`, `no_window`), `cabinet_contact_seconds` (the time from the window's opening to the
accepted contact, for the "within seconds" budget of BR-API-170: the Mini App polls for 90 s).

## Files

All paths under `backend/`.

- `app/Telegram/Updates/Contracts/ContactInterceptor.php`, `app/Telegram/Updates/CabinetContactResult.php`
- `app/Telegram/Owner/CabinetContactInterceptor.php`
- `app/Telegram/Handlers/Owner/{CabinetContactReply,OwnerPhoneStart,OwnerNewStart,OwnerPhoneCancelInput}.php`
- Changed: `app/Telegram/Updates/UpdateLedger.php` (WP-50), `app/Telegram/Handlers/ContactMessage.php` (WP-56),
  `app/Telegram/Handlers/StartCommand.php`, `app/Telegram/DeepLinks/{StartPayloadParser,MiniAppUrl}.php`,
  `app/Enums/Telegram/StartPayloadKind.php` (WP-52), `app/Enums/Telegram/ConversationKind.php` (WP-51),
  `app/Providers/TelegramServiceProvider.php` (the binding, the input handler of `OwnerPhone`),
  `config/telescope.php` and `app/Providers/TelescopeServiceProvider.php` (the webhook path, the Bot API host;
  "Observability")
- `lang/{ru,uz,en}/bot.php`; `tests/Fixtures/Bot/translation-status.json`
- `tests/Feature/Bot/{CabinetContactLedgerTest,CabinetContactReplyTest,CabinetContactEdgeTest,OwnerPhoneStartTest,OwnerNewStartTest}.php`;
  `tests/Pgsql/CabinetContactRaceTest.php`
- `tests/Unit/Telegram/{MiniAppUrlTest,StartPayloadParserTest}.php` (extended)
- `tests/Fixtures/Bot/transcripts/{owner-phone-set,owner-phone-not-own,owner-phone-not-uz,owner-phone-rejected,owner-phone-old-client,owner-phone-closed,owner-new}.json`
- `docs/infrastructure/telegram-webhook.md` (repository root)

## Steps

Generators always with `--no-interaction`; tests first inside each step; Pint after every PHP edit.

1. Read WP-50 ("Redaction and encryption", "Names other packages rely on"), WP-56 ("Owner verification"), WP-52
   ("Mini App addresses", "Payloads and attribution") and WP-84 ("The phone window and the number"); write into
   "Handoff" every name that differs from "What comes from where".
2. `ContactInterceptor`, `CabinetContactResult`, the branch in `UpdateLedger::accept()` with a fake interceptor;
   `CabinetContactLedgerTest`; WP-50's `UpdateLedgerPrivacyTest` unchanged and green.
3. `CabinetContactInterceptor` over WP-84's acceptor; the binding.
4. `CabinetContactReply` and the branch in `ContactMessage`; `CabinetContactReplyTest`; transcripts of the four
   results.
5. `MiniAppUrl::startApp()` and `ownerNew()`; the parser kinds; `StartPayloadParserTest`, `MiniAppUrlTest`.
6. `OwnerPhoneStart`, `OwnerPhoneCancelInput`, `ConversationKind::OwnerPhone`; `OwnerPhoneStartTest`; transcripts
   `owner-phone-old-client`, `owner-phone-closed`.
7. `OwnerNewStart`; `OwnerNewStartTest`; transcript `owner-new`.
8. The catalogue keys in three languages; the translation status file; the registry rows.
9. `make ci-backend`; review by the `security-reviewer` agent (the number at the webhook, the ledger, the logs); PR;
   deploy; the checklist inside Telegram on staging with the cabinet switch on for that run.

## Behaviour to reproduce

Owned: BOT-086 (the bot's side of the phone confirmation) and the bot's side of TMA-034 and TMA-046. Legacy's chat
side was never observed, so the behaviour below is HOMI's, closed by this specification; the Mini App side is
legacy's (BR-API-170 … BR-API-172).

| # | Trigger | What the user sees |
| - | ------- | ------------------ |
| 1 | «Поделиться номером» in the Mini App on 6.9 or later, the own `+998` number, window open | in the Mini App the number within seconds (its poll); in the chat «✅ Номер подтверждён…» with «↩️ Вернуться к объявлению» |
| 2 | The same, but the number is on two listings already or on the operators' deny list | the Mini App shows the rejection screen with its reason (SCR-054); the chat «Не получилось подтвердить этот номер…» with the button back |
| 3 | A contact of another person forwarded inside the window | the Mini App shows `not_own`; the chat «Это чужой контакт…» with the share keyboard |
| 4 | A number that is not `+998` | the Mini App shows `not_uz`; the chat «Нужен номер Узбекистана…» with the share keyboard |
| 5 | A client below 6.9: «Открыть бот» on the phone step | the bot's welcome, then «Чтобы подтвердить номер…» with `📱 Поделиться номером` / `Отмена`; sharing → row 1 … 4 |
| 6 | `Отмена` in that conversation | «Хорошо, номер не подтверждаем…»; the keyboard is removed |
| 7 | The prompt is open but ten minutes have passed, then the contact | «Время подтверждения вышло…» with `📱 Открыть приложение`; nothing is stored |
| 8 | A contact with no window and no cabinet prompt | `/owner` exactly as WP-56 specifies (TXT-BOT-078 or `owner.not_own_contact`) |
| 9 | `/start owner_new` | the welcome, then «Сдать квартиру можно в приложении…» with «🏠 Сдать квартиру», which opens the owner form |
| 10 | The cabinet switched off | rows 5 and 9 give the welcome only; no new phone window opens; a window opened before still accepts its contact |

- The old client returns to the same draft: the button back is `o_<id>` of the listing the window belonged to (fix
  of LB-APP-060; the trigger of the defect is `UNVERIFIED`).
- A rejected owner gets a way forward in the Mini App (DEV-056, fix of LB-APP-065); the chat only points there.
- The stored update keeps only the HMAC of the number in every row above (BR-API-172 is legacy's storage, `UNVERIFIED`;
  HOMI's storage is DEC-72's).

Edge cases:

- Two drafts of the user with open windows: the acceptor of WP-84 picks the newest; the reply's button leads to that
  one.
- The same number shared again inside a new window replaces nothing visible; another own number replaces the old one
  (WP-84). Neither touches an `/owner` verification the user may also have.
- The draft was deleted, published or locked (`held`, `withdrawn`) between the window and the contact: WP-84's
  acceptor answers nothing, and the contact goes to `/owner` (or to the "window closed" reply while the prompt is
  open).
- The cabinet is switched off while a window is open: the window still accepts its contact (the switch refuses
  opening a window, not a contact: WP-80); nothing new can open.
- The user blocked the bot right after sharing: the number is set; the failed reply is ignored (WP-51's responder).
- The user is inside `/owner`'s own conversation (kind `Owner`) and a window is open: the window wins; the marker
  ends that conversation as well, and `/owner` is not verified.
- A contact without `user_id` (a contact card typed by hand) inside a window: `not_own` (WP-84), never a number.

Defects and behaviour changes:

| # | Item | What is done |
| - | ---- | ------------ |
| 1 | The old-client path cannot resume the draft (LB-APP-060) | Fixed: the chat reply carries `o_<id>` of the draft; not a `DEV`, legacy's chat side is unobserved |
| 2 | One field for two vocabularies (part of LB-APP-065) | Fixed with DEV-056: `phone_error` apart from `reject_reason`; the chat follows the split |
| 3 | `/owner` and the cabinet share one contact handler | Kept apart: the marker decides, and the hash-only promise of `/owner` holds outside a window (DEV-011) |

## Tests

Conversation tests use the runner of WP-51; contacts come from `UpdateFactory::contact(userId, phone)` of WP-50 with
the synthetic numbers `+998000000081` and `+7000000000`; owner listings from WP-84's factories with the window open
or closed; the cabinet switch on (`phpunit.xml`, WP-80) unless a case says otherwise. After every case a recursive
scan of the stored payload, the job payloads, the log records, every Bot API call of `FakeBotApi` and, in test 1,
`telescope_entries` (Telescope on with the configuration of WP-84 and "Observability") finds no digit run of the
synthetic number longer than two digits.

| # | Test | Cases |
| - | ---- | ----- |
| 1 | `CabinetContactLedgerTest` | own contact inside the window → one row, `contact.phone_hmac` and `contact.cabinet.result: set`, the listing's number set (WP-84's read path), the window closed; the same `update_id` again → `duplicate`, the interceptor not called twice; no window → no marker, the row as WP-50 stores it; an interceptor that throws → `5xx`, no row, no listing change, no digit in the log; a contact in a group → no interception; after processing the stored payload has no `contact` |
| 2 | `CabinetContactReplyTest` | `set` → the text, `remove_keyboard` and a `url` button `https://t.me/<bot>?startapp=o_<ULID>`; `not_own`, `not_uz` → the text and the reply keyboard, conversation `OwnerPhone` open; `rejected` with each reason → one text, the button back, no reason in the text; no `owner_verifications` row in any case; a marker with an unknown result → the stale reply of WP-51, nothing stored |
| 3 | `OwnerPhoneStartTest` | `/start owner_phone` with an open window → welcome, prompt, reply keyboard, conversation; without one → welcome, «Время подтверждения вышло…»; `Отмена` → cancel text, keyboard removed, conversation gone; the prompt open and the window expired, then a contact → «Время подтверждения вышло…», no `owner_verifications` row; another text ends the conversation; the switch off → the welcome only |
| 4 | `OwnerNewStartTest` | `/start owner_new` and `/start owner-new` → welcome and the button to the address with `owner=new`; one attribution row `owner_new`; the switch off → welcome only, the attribution row still written |
| 5 | `MiniAppUrlTest` (extended) | `ownerNew()` with and without a query in the base address; `startApp('o_01J…')` → the `t.me` link; a parameter with a space or over 64 characters → `null`; an empty username → `null` |
| 6 | `StartPayloadParserTest` (extended) | `owner_new`, `OWNER-NEW`, `owner_phone` → their kinds; `owner_newx` → `Unknown` |
| 7 | Transcripts | `owner-phone-set`, `owner-phone-not-own`, `owner-phone-not-uz`, `owner-phone-rejected`, `owner-phone-old-client`, `owner-phone-closed`, `owner-new` in ru; `owner-phone-set` and `owner-new` also in uz and en |
| 8 | WP-56's `OwnerVerifyTest` | still green: a contact outside any window and outside the cabinet prompt verifies as before |
| 9 | `CabinetContactRaceTest` (`tests/Pgsql`, `make test-pgsql`) | the same contact update posted twice concurrently (`concurrently()` of `tests/Pest.php`) → one row, one acceptance, one reply; two different contacts of one user inside one window concurrently → one number set, the other a no-window contact |
| 10 | `CabinetContactEdgeTest` | two drafts with open windows → the newest gets the number; a deleted draft → `/owner`; the switch turned off with a window open → the number still set; a contact without `user_id` → `not_own`; inside `/owner`'s conversation with a window open → the cabinet reply, no verification |

## Acceptance checklist

Run in ru, uz and en on the staging bot, with `OWNER_CABINET_ENABLED=true` on staging for the run (after `25` §5 gate 5
holds there), `OWNER_CABINET_ALLOWED_IDS` set to the test accounts, and a test owner account; each staff member whose
real number is shared agrees in writing that it is stored, and at the end of the run every test account is erased with
«Удалить мои данные» and the erasure is recorded in the PR; attach screenshots to the PR. The texts are HOMI's and wait
for the product owner's approval; the checks below are about behaviour, not about parity with legacy.

- [ ] iOS, Android and Desktop on 6.9 or later: «Поделиться номером» in the Mini App sets the number within seconds,
      and the chat shows «✅ Номер подтверждён…» with «↩️ Вернуться к объявлению», which opens the same draft's phone
      step.
- [ ] A forwarded contact of another account is refused in the Mini App (`not_own`) and in the chat.
- [ ] A non-`+998` test number is refused (`not_uz`).
- [ ] A test number put on the deny list (`owner:deny-phone {listing}` or `--stdin`, WP-84) is refused; the chat
      names no reason; the Mini App shows its rejection screen (WP-81).
- [ ] A client below 6.9 (or the emulated old-client path of WP-81): «Открыть бот» → the prompt with the share
      keyboard; sharing sets the number; «Отмена» removes the keyboard.
- [ ] With the old-client prompt open, a contact shared ten minutes after the window opened is refused with «Время
      подтверждения вышло…» and no `/owner` verification appears.
- [ ] `/owner` still verifies a contact shared outside the cabinet, as WP-56's checklist says.
- [ ] `/start owner_new` opens the owner form from its button.
- [ ] With the switch off again, `/start owner_new` gives the welcome only.
- [ ] The production track confirms: the stored update of a test contact holds no number (a staging row decrypted
      holds `phone_hmac` only), and a scan of `telescope_entries`, the Laravel log and `failed_jobs` on staging after
      the run finds no test number (SEC-REQ-051).
- [ ] Tests of this package and of WP-50 and WP-56 are green; `make ci-backend` is green; the security review is
      recorded in the PR.

## Handoff

Empty.
