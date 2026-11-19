# WP-83 — Seeker side: request sheet, CTA states, verified-owner chip and sheet, owner sections

| Field | Value |
| ----- | ----- |
| Stage | B |
| Status | TODO |
| Depends on | WP-80, WP-82, WP-26, WP-30, WP-36 |
| Size | about 2 000 changed lines with tests, M |
| Behaviour reference | `03` SCR-018 (owner variants), SCR-059 (seeker part), SCR-061, SCR-062, §3.3 (`owner_info_opened`, `chat_access_*`), BR-APP-026, BR-APP-098 … BR-APP-103, LB-APP-057, LB-APP-072 … LB-APP-078; `05` TMA-033, TMA-037 (`kv-owner-tip`); `02` BR-API-183 … BR-API-189; `09` DEV-060 |
| Needs from the production track | the regular deploy; then the manual checks inside Telegram on staging |

## Goal

A seeker sees every owner tier and contact state on a listing: the chip «Проверенный хозяин» with its tip and info
sheet, the section of a claimed owner, the self-placed variants of history, description, author and sources, the
request sheet «Отклик хозяину» with all its outcomes, the closed bars, and the neutral bar of DEC-75 for a legacy
owner who hides the number — on stubs, for HOMI's own owner listings and for the self-placed listings read from
legacy alike. A number reaches the seeker only through the counted contact method.

## Scope

**In.** Owned audit items: screen SCR-061, SCR-062 and the owner variants of SCR-018; rules BR-APP-098 …
BR-APP-102, and of BR-APP-103 only the chip that the user's own listing also shows (the rest of SCR-059 is WP-82's);
defects LB-APP-057 (the request limits), LB-APP-072, LB-APP-073, LB-APP-074, LB-APP-075, LB-APP-076 (DEV-060 and the
response time), LB-APP-077 and LB-APP-078; Telegram points TMA-033 (the write access of a request) and TMA-037 for
the chip's tip; the approved deviation DEV-060; the server rules BR-API-183 … BR-API-189 as the contract of WP-80
exposes them.

- The child routes `contact` and `owner` in both listing trees (`25` §3.2) and the launch `c_<number>`.
- The CTA states of an owner listing in `features/listing/cta/`: `request`, `requestSent`, `given`, the closed bars
  and the `hidden` bar, with one shared predicate for request mode.
- The Server Action of the request beside `getContact` in `lib/actions/listing.ts`; `init_data` from the adapter; the
  chat-access flow of WP-30 for `409 no_chat`; the limits from `GET /reference` and `rate_limited` with its `reason`.
- The chip, its tip with the synced key `homi-owner-tip`, the info sheet with its text reworded for DEC-77, and the
  event `owner_info_opened`.
- The section of a claimed owner and the self-placed variants; `response_minutes` shown in minutes, hours or days.
- Text variants by `origin` in the `homi` catalogue layer: a native listing names HOMI, a legacy one stays
  brand-neutral.

**Out.**

- The badge kinds of the feed card and the compact card's shield (BR-APP-026): catch-up WP-35. A native owner
  listing is a card like any other there: `owner_verified: true` already gives it the verified badge.
- Every state of the user's own listing (`owner.mine`): the panel, its footer and the fallback bar «Это ваше
  объявление» (WP-82). This package never renders a CTA for such a card.
- The server side of requests (limits, blocks, expiry, the first name, the answers): WP-85; the relay of a request on
  a legacy `gate` listing: WP-87; the owner's answer and the seeker's «📞 Показать номер» in the bot: WP-89.
- The owner fields of the card (`owner`, `contact.mode`, `contact.request`, `origin`) and their stubs: WP-80.

## Decisions that bind this package

- DEC-52: the sheet never asks for or shows a number. A `given` request is answered «Позвонить», and the number comes
  only from `POST /listings/{number}/contact` (`useContact` of WP-26), counted per user; the request method returns a
  status, never a number.
- DEC-71: a legacy self-placed listing whose `contact.mode` is `request` (the relay switched on, stub 100024 with the
  scenario `relay_on`) gets the same sheet; nothing in the client knows which side answers it.
- DEC-74: DEV-060 is on without a flag — after `expired` the seeker may ask once more; after `declined` not.
- DEC-75: a legacy self-placed listing that hides its number while the relay is off has `contact.mode: hidden`; its
  bar has no contact action and the neutral line «Хозяин скрыл номер — связаться через HOMI пока нельзя» (a `homi`
  text, the product owner approves the words).
- DEC-76: the sheet's note says that the owner sees the seeker's Telegram first name and the answers, not the number;
  the client sends the current launch's `initData` with the request, and the server reads the first name from it.
- DEC-77: on a HOMI owner listing «Проверенный хозяин» means that the owner confirmed his own number with Telegram;
  the info sheet says what HOMI checked instead of legacy's «этот номер не встречается в объявлениях риелторов»
  (the reworded text is for the product owner to approve).
- *Integrator defaults, listed for the reviewer:* default 1 (the request is `POST /listings/{number}/contact-request`
  and `POST …/contact` alone returns a number), default 2 (`429 rate_limited` with `reason` `requests_fast`,
  `requests_day` or `requests_week` and `Retry-After`), default 3 (`contact.mode: hidden`), default 7 (the first name
  from the launch data the request carries), default 23 (a `given` number counts against the disclosure quota of
  DEC-19 and is never refused by it), default 21 (a HOMI realtor mark wins: `is_owner: false` hides the chip), default
  24 (a native listing's author is `{kind: "phone", label: «Хозяин»}`, so WP-26's «Это риелтор» is offered there
  unchanged), default 22 (the checks inside Telegram on staging run when WP-89 switches the cabinet on
  there). New in this specification: (a) `given` is always «Позвонить», and the contact method decides whether a
  number exists; (b) `expired` offers «Связаться с хозяином» again with «Хозяин пока не ответил» as the bar's note;
  (c) `response_minutes` shown in hours and days is a formatting fix, not a `DEV` row; (d) the info sheet of a HOMI
  owner listing ends with the report path of the listing's «⋯» (`owner.info.foot`), since no «Ответил риелтор»
  button of HOMI's bot is specified (WP-89); (e) `c_<number>` opens the listing, then its request sheet. As in legacy
  (BR-APP-098), the server's `agent` reaches the seeker as `declined`.

Read before coding: `03-api-reference/03-file-conventions/parallel-routes.md`, `intercepting-routes.md` and
`02-guides/preserving-ui-state.md` in `frontend/app/node_modules/next/dist/docs/01-app/` (the sheets as children of
the listing's layout, as WP-26's actions sheet) — verify in the installed documentation; the facts about `initData`
and `requestWriteAccess` are verified against the Bot API documentation.

## Design

### Routes

| Address | Files under both listing trees (`listing/[number]/`, `@overlay/(.)listing/[number]/`) | Renders |
| ------- | ------------------------------------------------------------------------------------- | ------- |
| `/listing/[number]/contact` | `contact/page.tsx` | `ContactRequestRoute` → `ContactRequestSheet` (SCR-061), a portalled `RouteSheet` over the listing |
| `/listing/[number]/owner` | `owner/page.tsx` | `OwnerInfoRoute` → `OwnerInfoSheet` (SCR-062) |

- The listing layer stays mounted under both, as under WP-26's actions sheet; its swipe back is off while a child
  address shows (`ListingLayer`'s `atListing`).
- Both sheets open only with the full card. A direct load waits for it; then the request sheet shows only in the CTA
  states `request` and `expired`, and the info sheet only for the tiers `self` and `verified`; otherwise the address is
  replaced by the listing's (`nav.replace(routes.listing(number))`).
- `lib/navigation/routes.ts`: the builders `listingContact(number)` and `listingOwner(number)`; the listing children
  gain `contact` and `owner` (`LISTING_CHILDREN`); `parentOf` takes them by the existing rule (→ `/listing/<number>`);
  `screenNameOf` gives the new names `listing/contact` and `listing/owner` with `listing_id` (the practice of WP-32).

### CTA states (`features/listing/cta/`)

`ctaActionOf(details)` of `ListingCtaBar.tsx` gains five results and keeps its order (BR-APP-032, BR-APP-098):

| Order | Condition | Result | Bar |
| ----- | --------- | ------ | --- |
| 1 | no details | `pending` | the shimmer (unchanged) |
| 2 | `owner.mine` | — | WP-82's footer; this function is not reached |
| 3 | `contact.mode === "hidden"` | `hidden` | the neutral line of DEC-75 in place of the bar's content |
| 4 | request mode, no request, or a status not listed below | `request` | «Связаться с хозяином» (`contact.cta`, message icon) |
| 5 | request mode, `pending` | `requestSent` | a quiet, inactive «Отклик отправлен» (`contact.sent`) |
| 6 | request mode, `given` | `given` | «Позвонить» (`listing.call`) through `useListingContact`'s call flow (fix of LB-APP-074) |
| 7 | request mode, `expired` | `request` | «Связаться с хозяином», with «Хозяин пока не ответил» (`contact.expiredBar`) as the note under the price (DEV-060) |
| 8 | request mode, `declined` | `closed` | bold «Хозяин не готов дать номер» (`contact.closedBar`) and the muted «Посмотрите похожие в ленте» (`contact.similarHint`) in place of the bar's content |
| 9 | request mode, `cancelled` | `closed` | bold «Квартира уже не сдаётся» (`contact.cancelledBar`) and the same hint |
| 10 | otherwise | the existing `call`, `write`, `writePaid`, `openPost`, `none` | unchanged |

- Request mode is one predicate, `isRequestMode(details)` in the new `features/listing/cta/owner.ts`: `contact.mode`
  is `request`. The info sheet's gate point and foot read the same predicate (fix of LB-APP-078).
- `given` does not wait for `has_phone`: the tap asks `POST /listings/{number}/contact`, which gives the number to a
  seeker whose request is `given` (WP-80) and counts it (default 23). `404 contact_unavailable` there plays the error
  haptic and re-reads the card in the background.
- A re-read never clears the screen: `useListing` (WP-26) keeps the shown details until the new ones arrive, and the
  scroll stays (fix of LB-APP-074).
- The status the request answers is written into the card at once (a local patch of `contact.request`), then the
  card is read again in the background.

### Request sheet (`features/listing/contact/`)

| Path | Content |
| ---- | ------- |
| `ContactRequestRoute.tsx`, `ContactRequestSheet.tsx` | the route and the sheet of SCR-061 on `RouteSheet` |
| `requestForm.ts` | pure: the `who` values and their default counts (1 / 2 / 3 / 2 / 2), the stepper bounds 1 … 20, the default applied only while the stepper is untouched (fix of LB-APP-077), the trimmed body with empty values as `null` |
| `requestErrors.ts` | the answer → the sheet's line and the card's effect (table in "Behaviour to reproduce") |
| `useContactRequest.ts` | one send at a time (a state and a ref lock), the chat-access flow, the patch and the re-read |

`lib/actions/listing.ts` gains `sendContactRequest(input, auth?, locale?)` with `input` `{ number, who, people,
move_in, message, init_data }` → `POST /listings/{number}/contact-request` → `{ status }`; an input that fails its
check (a bad number, a `who` outside the five, `people` outside 1 … 20, `move_in` above 32 or `message` above 500
characters) makes no request. `lib/api/server.ts` gains `contactRequest(number, body)`. `init_data` is
`tg.initData()` of the current launch; it is passed through and never stored, cached or logged by the client
(`16` SEC-REQ-007), and never echoed by the server (WP-80). The Next server never logs the action's input: the
action passes `init_data` to `contactRequest()` and drops it; a failure reaches the error facade of WP-32 as its
`UiError` code only, never with its input; `init_data`, the move-in text and the message are no analytics property,
and the sheet's fields carry the `.ph-mask` class of WP-32's replay masking.

### Owner chip and info sheet (`features/listing/owner/`)

| Path | Content |
| ---- | ------- |
| `OwnerChip.tsx` | the chip under the title (shield-check, «Проверенный хозяин», ⓘ), its pulse and tip |
| `ownerTip.ts` | the tip's counter on `homi-owner-tip` (a number of shows, or `done`) |
| `OwnerInfoRoute.tsx`, `OwnerInfoSheet.tsx` | the route and the sheet of SCR-062 |
| `ownerTier.ts` | pure: `chipShown(item)` — `owner.tier` `self` or `verified`, or a preview with `owner_verified`, and never with `is_owner === false` (default 21); `infoPoints(details, origin)` |
| `ClaimedOwnerSection.tsx` | the section of a claimed owner |

`lib/storage.ts`: `homi-owner-tip` is a synced key (mirrored to DeviceStorage and restored from it, TMA-037).
`lib/analytics/events.ts`: `owner_info_opened: { listing_id: number }` joins `JournalEvents` and `JOURNAL_EVENTS`.

### Sections of an owner listing (`features/listing/sections/`)

`ListingScreen.tsx` reads `owner.tier` and `origin` of the card (WP-80) and passes them on; no section compares a
server string with a catalogue text (fix of LB-APP-075).

- `tier === "self"`: no `SourcesSection` (no channels, no original text, no translation); `HistorySection` with a
  single entry reads the self-placed sentence; `DescriptionSection` shows `owner.description` as a second paragraph
  after `summary`; `AuthorSection` adds the response time and, with a `pending` request, «Отклик отправлен — ответ
  придёт в бот.» (`contact.pendingNote`).
- `tier === "claimed"`: `ClaimedOwnerSection` between «Расположение» and «Кто размещает».
- `features/listing/ListingTitleRow.tsx` renders `OwnerChip` under the title by `chipShown`.
- `@homi/i18n/format` gains `formatResponseTime(minutes, locale)`: below 60 the minutes, below 1 440 the hours, else
  the days, each rounded and through `Intl.NumberFormat` with the unit style `short` («15 мин», «3 ч», «2 дн.»).

### Launch `c_<number>`

`lib/deeplinks/parse.ts`: `start_param` `c_<number>` sets `listingNumber` to that number (so `entry` is `link` and
the listing opens first, as for `l_<number>`) and the new `Launch.contact` to `true`; `source` and `postUrl` stay
`null`. `features/shell/LaunchRedirector.tsx`: after the listing's push has landed it pushes
`routes.listingContact(number)`, so Back closes the sheet, then the listing. The bot's button that sends this link
is WP-89's.

### Texts

New `homi` texts, ru/uz/en, for the product owner to approve:

| Key | ru |
| --- | -- |
| `contact.hiddenBar` | «Хозяин скрыл номер — связаться через HOMI пока нельзя» |
| `contact.leadTime` | «Хозяин получит ваш отклик и ответит в бот — обычно в течение {time}.» |
| `contact.usuallyTime` | «Обычно отвечает за {time}» |
| `contact.noteLimit` | «Хозяин увидит ваше имя из Telegram и эти ответы, но не ваш номер. Можно отправить до {day} откликов в день.» |
| `contact.noteRelay` | «Отклик передаётся сервису, где размещена квартира.» — appended to the note for a listing read from legacy in request mode (`origin: legacy`, DEC-71) |
| `contact.err.noChatRestart` | «Бот не может писать вам — похоже, он остановлен. Открыть чат с ботом? Нажмите там «Перезапустить» и отправьте отклик снова.» (the request's form of legacy's `chat.restart`, which names the radar) |
| `contact.err.requestsFast` | «Несколько откликов подряд — следующий можно будет отправить через {minutes} мин.» |
| `contact.err.requestsDay` | «Сегодня вы уже отправили {day} откликов. Завтра можно снова.» |
| `contact.err.requestsWeek` | «За неделю — {week} откликов, это предел. Новые можно будет отправить через несколько дней.» |
| `owner.info.selfHomi` | «Разместил квартиру сам в HOMI.» |
| `owner.info.checked` | «Мы проверили номер: на него не больше двух квартир, его нет среди номеров риелторов, которые видел HOMI, и пользователи не отмечали его как риелторский.» |
| `details.historySelfHomi` | «Хозяин разместил квартиру в HOMI {date}. Изменений цены пока не было.» |

The legacy texts of `contact.*` and `owner.*` stay in the `legacy` layer; the existing `homi` overrides
`owner.info.self`, `owner.info.verified` and `details.historySelf` (brand-neutral since the intake of
`index-CBlEKxdL.js`) serve the listings read from legacy. The numbers come from `limits.requests` of
`GET /reference` (`day`, `week`, `pause_minutes`; fix of LB-APP-057). The `who` chips use `contact.who.*`.

## Files

New, under `frontend/app/`:

- `features/listing/cta/owner.ts`; the modules of `features/listing/contact/` and `features/listing/owner/` above;
  the route files `contact/page.tsx` and `owner/page.tsx` in both listing trees.
- `tests/listing/{ctaOwner,requestForm,requestErrors,ownerTier,ownerTip}.test.ts`,
  `tests/listing/{ContactRequestSheet,OwnerChip,OwnerInfoSheet,ClaimedOwnerSection,OwnerSections}.test.tsx`,
  `tests/actions/contactRequest.test.ts`, `tests/deeplinks/contact.test.ts`.
- End to end: `e2e/contact-request.spec.ts`, `e2e/listing-owner.spec.ts`.

Changed:

- `features/listing/cta/ListingCtaBar.tsx`, `features/listing/cta/useContact.ts` (the `given` path),
  `features/listing/{ListingScreen,ListingTitleRow}.tsx`, `features/listing/sections/{HistorySection,
  DescriptionSection,AuthorSection,SourcesSection}.tsx`.
- `lib/actions/listing.ts`, `lib/api/server.ts`, `lib/navigation/routes.ts`, `lib/deeplinks/parse.ts`,
  `features/shell/LaunchRedirector.tsx`, `lib/storage.ts`, `lib/analytics/events.ts`.
- `frontend/packages/ui/src/icons/index.ts` (`ShieldCheck` for the chip).
- `frontend/packages/i18n`: `src/format/` (`formatResponseTime` and its test), `messages/homi/{ru,uz,en}.json`,
  `tests/catalogue.test.ts`.
- `tests/listing/{ListingCtaBar,useContact,HistorySection,AuthorSection}.test.tsx` gain the owner cases.

## Steps

1. Read the Next.js files named above. Check two seams and note them in the PR: the card's owner fields in
   `@homi/types` after WP-80 (`origin`, `owner`, `contact.mode`, `contact.request`) and the stub numbers 10000001 …
   10000007, 100024 and 100025; how WP-82 left `ListingCtaBar` for `owner.mine`.
2. `features/listing/cta/owner.ts` and the new results of `ctaActionOf`, with the table test.
3. `sendContactRequest` and `contactRequest`; the test of both session modes and of the input checks.
4. The request sheet: `requestForm.ts`, the sheet, `requestErrors.ts`, `useContactRequest.ts` with `withChatAccess`;
   the patch and the background re-read.
5. The routes `contact` and `owner` in both trees; the direct-load rule; the screen names.
6. `formatResponseTime`; the sections of a self-placed and of a claimed owner; the variants by `origin`.
7. The chip, its tip and key, the info sheet with the reworded text, `owner_info_opened`.
8. `c_<number>` in `parse.ts` and `LaunchRedirector`.
9. The `homi` texts; component tests; Playwright specs in both session modes; the checklist in three locales and
   two themes on a local stack with the cabinet on; update the queue.

## Behaviour to reproduce

### Request sheet «Отклик хозяину» (SCR-061, BR-APP-099)

- Opens from «Связаться с хозяином» (states `request` and `expired`), from the launch `c_<number>`, and only with the
  full card. Closes by the backdrop, «×» (`common.close`), a drag down and Back; a sent request closes it. Typed text
  is lost on close, without a confirmation, as legacy.
- The title «Отклик хозяину»; the lead `contact.leadTime` with `formatResponseTime(response_minutes)` when the card
  has `owner.response_minutes`, else `contact.leadNoTime` «Хозяин получит ваш отклик и ответит в бот.»
- «Кто будет жить»: five single-choice chips «Один / Пара / Семья / Студенты / Друзья», none picked at first.
- «Сколько человек»: a stepper 1 … 20 starting at 1; a chip sets the count to its default only while the stepper has
  not been touched (fix of LB-APP-077).
- «Въезд»: free text of at most 32 characters, placeholder «Например, с 1 декабря».
- «Сообщение»: 3 rows, at most 500 characters, prefilled «Здравствуйте! Можно посмотреть?».
- The note `contact.noteLimit` with the day's limit (DEC-76, LB-APP-057); for a listing read from legacy
  (`origin: legacy`, the relay of DEC-71) `contact.noteRelay` follows it, so the seeker knows at sending that the
  request leaves HOMI (*integrator default, listed for the reviewer*; the text for the product owner and the lawyer
  to approve).
- The footer: a disabled «Выберите, кто будет жить» until a chip is picked, then «Отправить хозяину»; disabled
  while sending.
- Send: ignored without a chip or while a send runs; a medium haptic; the body `{who, people, move_in, message,
  init_data}` with `move_in` and `message` trimmed and an empty value sent as `null`; through `withChatAccess` of
  `lib/telegram/chatAccess.ts` (`chat_access_declined` / `chat_access_allowed`, one retry after the access is
  granted, TMA-033). Success: the success haptic, the sheet closes, the card's request status is the answer's at
  once, and the card is read again in the background.
- Failure: the error haptic and one line in the sheet, or an effect on the card:

  | Answer | Line | Effect |
  | ------ | ---- | ------ |
  | `409 no_chat` after the write-access attempt | «Ответ хозяина придёт в бот — разрешите боту писать вам и отправьте ещё раз.» (`contact.err.noChat`) | when Telegram could not ask or `no_chat` stays, `withChatAccess` offers to open the bot with `tg.confirm(contact.err.noChatRestart)` (its `restartText`) |
  | `429 rate_limited`, `reason: requests_fast` | `contact.err.requestsFast` with `pause_minutes` | none |
  | `429 rate_limited`, `reason: requests_day` | `contact.err.requestsDay` with `day` | none |
  | `429 rate_limited`, `reason: requests_week` | `contact.err.requestsWeek` with `week` | none |
  | `403 requests_blocked` (legacy `blocked` and `harvest` alike) | «Отклики для вашего аккаунта сейчас закрыты. Если это ошибка, напишите в поддержку.» (`contact.err.blocked`) | none |
  | `409 request_closed` | — | the sheet closes; the card is read again and shows its closed bar (fix of LB-APP-073) |
  | `409 own_listing` | — | the sheet closes; the card is read again and becomes the user's own (WP-82) |
  | `409 contact_open` | — | the sheet closes; the card is read again and offers «Позвонить» |
  | any other | «Не получилось сохранить» (`common.saveFailed`) | none |

- A second request on the same listing answers its current status (WP-80); the client shows it as a success.

### CTA bar of an owner listing (BR-APP-098, DEV-060, DEC-75)

- The states of the table in "Design", in that order. «Отклик отправлен» is inactive and has no haptic.
- `given`: «Позвонить» with the call flow, haptics and events of WP-26 (`contact_call`); the number is asked from
  `POST …/contact` on the tap, never before (DEC-52).
- `expired`: «Связаться с хозяином» again; the note «Хозяин пока не ответил»; a new request that the server refuses
  shows the closed bar after the re-read (DEV-060: once after `expired`, never after `declined`).
- `declined` (also the server's `agent`, which the seeker never sees as such, BR-APP-098, legacy) and `cancelled`:
  the closed bars, no action.
- `hidden`: the neutral line, no action (DEC-75; also the answer if the operator refuses the relay).

### Owner chip and its tip (BR-APP-100, BR-APP-101, LB-APP-072)

- Under the title when `chipShown`: shield-check, «Проверенный хозяин» (`owner.verified`), ⓘ. It shows from the
  preview already when the preview has `owner_verified`, and is inert until the full card has loaded: a tap then does
  nothing, sends nothing and leaves the tip (fix of LB-APP-072).
- The tip, at most twice per device: 700 ms after the chip mounts for a listing, the chip pulses and «Нажмите —
  расскажем, что это значит» (`owner.tip`) with «×» (`owner.tipClose`) shows for 7 s; each show increments
  `homi-owner-tip`; a tap on the chip or the tip, or «×», writes `done`. Lite graphics and reduced motion show no
  pulse.
- A tap with the card loaded: a light haptic, `owner_info_opened {listing_id}`, `done`, then
  `nav.push(routes.listingOwner(number))`.

### Info sheet «Проверенный хозяин» (SCR-062, DEC-77)

- A portalled sheet with the shield-and-check drawing (static in lite graphics and under reduced motion), the title
  «Проверенный хозяин» and the points that apply:
  1. tier `self`: «Разместил квартиру сам в HOMI.» (`owner.info.selfHomi`) for a native listing, «Разместил квартиру
     сам.» (`owner.info.self`) for one read from legacy; tier `verified`: «Хозяин сам подтвердил номер из этого
     объявления.» (`owner.info.verified`);
  2. «Номер подтверждён кнопкой Telegram: это его собственный номер.» (`owner.info.phone`);
  3. a native listing: `owner.info.checked` (DEC-77); one read from legacy: legacy's own claim «Мы проверили: этот
     номер не встречается в объявлениях риелторов.» (`owner.info.notAgent`), which is the operator's check;
  4. request mode by `isRequestMode`: «Номер он даёт сам, после вашего отклика. Риелторов к нему не пускаем.»
     (`owner.info.gate`); it is gone once the request is `given` (fix of LB-APP-078);
  5. tier `self` with `response_minutes`: `contact.usuallyTime`.
- The foot: a native listing, or no request mode: «Оказался риелтором? Нажмите «Ещё» → «Пожаловаться» — мы проверим.»
  (`owner.info.foot`); a legacy listing in request mode: legacy's `owner.info.footGate`.
- «Понятно» (`owner.info.ok`), the backdrop, a drag and Back close it.

### Claimed owner and self-placed listings (BR-APP-100, BR-APP-102)

- Tier `claimed` (`is_owner` true, not verified, not self-placed; stub 100025): the section «Хозяин — со слов
  объявления» (`owner.claimed`) with «Мы не проверяли — спросите при звонке, нет ли комиссии.» (`owner.claimedHint`)
  between «Расположение» and «Кто размещает»; no chip.
- Tier `self`: no «Источник»; a single history entry reads `details.historySelfHomi` (native) or
  `details.historySelf` (legacy) with the date; «Описание» shows when `summary` or `owner.description` is set, the
  latter as its own paragraph, masked by the server (DEC-52); the author section adds the response time (not on the
  user's own listing) and, with a `pending` request, `contact.pendingNote`.
- The author label is shown as the server sends it; the server drops a label that the tier already says (WP-42), so
  the client matches no strings (fix of LB-APP-075).
- A native listing has no original post: «Открыть пост» never shows (its `original.url` is `null`), and its
  translation method answers `404 not_found` (WP-80), so the screen offers none.

### Response time (LB-APP-076)

`response_minutes` 15 → «15 мин», 180 → «3 ч», 2 880 → «2 дн.» in the lead, the author section and the info sheet;
legacy printed every value in minutes («за 600 мин»).

## Tests

**Unit (Vitest).**

- `ctaOwner.test.ts`: the table of `ctaActionOf` row by row, `owner.mine` excluded; `hidden` before request mode;
  `expired` → `request`; an unknown status → `request`; a non-owner card unchanged.
- `requestForm.test.ts`: the default counts per `who`; a touched stepper keeps its value (LB-APP-077); the bounds;
  the trimmed body with `null`.
- `requestErrors.test.ts`: every row of the error table; `harvest` never reaches the client as such; an unknown
  `reason` of `429` → «Не получилось сохранить».
- `ownerTier.test.ts`: `chipShown` for every tier, a preview with `owner_verified`, and `is_owner: false`; the info
  points by tier, origin and request state, the gate point gone after `given`.
- `ownerTip.test.ts`: two shows at most; `done` from a tap or «×»; no `done` from an inert tap; the restore from
  DeviceStorage.
- `contactRequest.test.ts`: `sendContactRequest` with the cookie token and the argument token; each invalid input
  sends nothing; `init_data` is in the body and nowhere else.
- `contact.test.ts` (deep links): `c_<number>` sets the listing and `contact`; a bad number is ignored; `l_` and `c_`
  together keep `l_`.
- `formatResponseTime` in `@homi/i18n`: the three ranges in ru, uz and en; 0 and negative values give nothing.

**Component (Vitest + Testing Library).** `ListingCtaBar`: each state renders its label, icon, note or bar, with its
`data-cta-action`. `ContactRequestSheet`: the disabled button until a chip, the lock while sending, the lines of the
error table, the note with the reference's limit and, for `origin: legacy`, `contact.noteRelay`; the restart
question of a persisting `no_chat`. `OwnerChip`: inert before the card, the pulse and the tip timing
(fake clock), the event once. `OwnerInfoSheet`: the points and the foot per case. `ClaimedOwnerSection` and the
self-placed sections.

**End to end (Playwright, fake Telegram, stubs; cookie mode and header mode; the stub API with the cabinet on).**

- `contact-request.spec.ts`: 10000001 → «Связаться с хозяином» → the sheet with «обычно в течение 15 мин» → «Семья» →
  «Отправить хозяину» → «Отклик отправлен»; 10000002 → «Отклик отправлен» and the pending note; 10000003 →
  «Позвонить», and the tap sends `POST …/contact`; 10000004 and 10000006 → the closed bars; 10000005 → «Связаться с
  хозяином» with «Хозяин пока не ответил»; 10000007 → «Позвонить» (phone mode); the scenarios `no_chat` (the write
  access asked, then the line), `request_limit_fast`, `request_limit_day`, `request_limit_week`,
  `requests_blocked`, `request_closed`, `own_listing`, `contact_open`; a launch with `startapp=c_10000001` opens the
  listing and the sheet, and Back closes the sheet, then the listing.
- `listing-owner.spec.ts`: 10000001 shows the chip, its tip once, the info sheet with the HOMI points and no
  «Источник»; 100024 → the neutral bar, and with the scenario `relay_on` the request sheet; 100025 → the claimed
  section and no chip; a chip tapped before the card loads opens nothing; the native stub entry on page one of the
  default feed is a card like any other, with the verified badge, and opens its listing.

## Acceptance checklist

Run in ru, uz and en, light and dark; cookie mode and header mode where a request is involved. Staging and
production keep the cabinet off until WP-89 (DEC-81), and no listing there has an owner tier of HOMI until then;
these lines run on a local stack with `OWNER_CABINET_ENABLED=true`, with the screenshots in the PR, and inside
Telegram on staging when WP-89 switches the cabinet on there (default 22).

- [ ] A HOMI owner listing in request mode offers «Связаться с хозяином»; the sheet shows the lead with the response
      time, the five chips, the stepper, «Въезд», the prefilled message and the note about the first name.
- [ ] Picking «Семья» after setting the stepper to 4 keeps 4.
- [ ] A sent request shows «Отклик отправлен» at once, without a jump of the screen.
- [ ] `no_chat`: Telegram asks for write access; allowed → the request is sent; declined → the line asks to allow it.
- [ ] The three limits name the numbers of the reference data; a blocked account reads the blocked line.
- [ ] `request_closed`, `own_listing` and `contact_open` close the sheet and update the card.
- [ ] `given` shows «Позвонить»; the number appears only after the tap.
- [ ] `expired` offers a new request with «Хозяин пока не ответил»; `declined` and `cancelled` show their bars.
- [ ] A legacy owner listing that hides its number shows the neutral bar and no contact action; with the relay on it
      offers the request sheet.
- [ ] The chip shows for a self-placed and a verified owner, not for a claimed one and not after a realtor mark; its
      tip shows twice per device at most, also across a restore.
- [ ] The info sheet of a HOMI owner listing says what HOMI checked and never «не встречается в объявлениях
      риелторов»; the gate point is gone after the number was given.
- [ ] A claimed owner shows «Хозяин — со слов объявления» between «Расположение» and «Кто размещает».
- [ ] A self-placed listing has no «Источник», the self-placed history sentence, the owner's description and the
      response time in minutes, hours or days.
- [ ] `owner_info_opened` reaches the journal once per opened sheet with `listing_id`; the screen names are
      `listing/contact` and `listing/owner`.
- [ ] A launch with `startapp=c_<number>` opens the listing with its request sheet.
- [ ] No legacy brand word on any of these screens, in three languages.
- [ ] `pnpm -r lint`, `pnpm -r typecheck`, `pnpm -r build`, the unit, component and end-to-end suites are green.
- [ ] Deployed to staging and production and checked inside Telegram on iOS, Android, Desktop and Web once the
      cabinet is on there.

## Handoff

Empty.
