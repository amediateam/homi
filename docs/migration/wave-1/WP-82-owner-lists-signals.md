# WP-82 — Owner lists and signals: the settings group, «Мои объявления», «Отклики», the owner panel, the red dot

| Field | Value |
| ----- | ----- |
| Stage | B |
| Status | REVIEW (part 1: the lists, «Отклики», the panel and the signals; part 2, the invitations and the landlord block, follows in a pull request of its own) |
| Depends on | WP-81, WP-31, WP-26, WP-39 (the end block of the search feed, the survey's `moved` step, `RollNumber`, the leave helper; *added by the intake of `index-YX9bFVws.js`*) |
| Size | about 3 050 changed lines with tests, L (about 450 of them for the invitations and the landlord block of legacy release `index-YX9bFVws.js`; if the PR passes 3 000 lines, they go into a PR of their own after it) |
| Behaviour reference | `03` SCR-032 (the group «Сдаю квартиру»), SCR-049, SCR-057 … SCR-060, §3.3 (`owner_attention`, `owner_limit_sheet`, `owner_hint_opened`, `owner/mine`, `owner/listing`), BR-APP-088 … BR-APP-095, BR-APP-103, LB-APP-057, LB-APP-059, LB-APP-062, LB-APP-064, LB-APP-065 (the card), LB-APP-066, LB-APP-069, LB-APP-070; `05` TMA-037 (`kv-req-tip`); `09` DEV-056 (the card), DEV-059; since `index-YX9bFVws.js`: BR-APP-092 (changed), BR-APP-112, BR-APP-113, BR-APP-115, BR-APP-116, LB-APP-084, LB-APP-088, LB-APP-090, TMA-048, DEC-89, DEC-91, DEC-94 |
| Needs from the production track | the regular deploy; then the manual checks inside Telegram on staging |

## Goal

«Сдаю квартиру» is the first group of Settings; «Мои объявления» shows the owner's flats in two tabs with their
cards, statuses, stats and actions; «Отклики» lists the requests of one flat with every answer and its undo; the
owner's own listing shows the panel «Ваше объявление» in place of the contact bar; and the red dot of the Settings
tab with its two tips tells the owner that requests wait — all on stubs. One owner store keeps every one of them
current after any cabinet action.

## Scope

**In.** Owned audit items: screens SCR-049, SCR-057, SCR-058, SCR-059, SCR-060 and the group «Сдаю квартиру» of
SCR-032; rules BR-APP-088 … BR-APP-095 (BR-APP-093: the panel's half; the form's half is WP-81) and BR-APP-103;
defects LB-APP-057 (the lists' limits), LB-APP-059, LB-APP-062, LB-APP-064 (the lists' labels), LB-APP-065 (the
rejected card), LB-APP-066, LB-APP-070 and LB-APP-069 (DEV-059); Telegram point TMA-037 for the request tip; the
approved deviations DEV-056 (the card's half) and DEV-059.

- The group in the slot WP-31 left, hidden while `owner_enabled` is `false`.
- `/owner/limit` (SCR-049); `/settings/owner` and `/settings/owner/[id]/requests` as sub-pages; the requests
  overlay `/listing/[number]/requests` opened from the panel (`25` §3.2).
- The panel of SCR-059 and the screen changes of BR-APP-103 when the card has `owner.mine`; the footer swap of the
  listing's contact bar, with its skeleton and its fallback bar (fix of LB-APP-070).
- The extension of WP-81's owner store to the lists and the requests, and the pending count from `GET /me`.
- The red dot, «Пришёл первый отклик!» (DEV-059) and the card tip with the synced key `homi-req-tip`.
- The nested sub-page rule of `useSwipeBack` and its 300 ms reset of the inline styles after a closing swipe.
- The events `owner_attention`, `owner_limit_sheet`, `owner_hint_opened`; the screen names `owner/mine` and
  `owner/listing`.
- Since legacy release `index-YX9bFVws.js` (*added by the intake of `index-YX9bFVws.js`*): the invitations into the cabinet from the search feed and
  the listing card (BR-APP-115, F-OWNER-010), the survey's landlord block (the second half of BR-APP-116,
  F-OWNER-011), both only while the cabinet is on (DEC-89, DEV-066), with DEC-91's two buttons (DEV-065) and the
  events `owner_entry` and `landlord_share`; the rolling «n из 5» of the fill hints (BR-APP-113); the request tips'
  leave (BR-APP-112) and their hiding by a restored `done` (BR-APP-092); Telegram point TMA-048; defects LB-APP-084
  (adopted), LB-APP-088 (decided by DEC-89) and LB-APP-090 (not adopted).

**Out.**

- The form itself, its steps and the `focus` parameter that the fill hints set: WP-81.
- Every state of a listing that is not the user's own: the request sheet, the CTA states, the owner chip and its
  info sheet, the self-listing sections (WP-83). The chip is added by WP-83 to every self-placed listing, the user's
  own included.
- The bot's messages about requests (delivery to the owner, the soft refusal, «сдано» to the waiting seekers) and
  the operators' notice: WP-89. The server rules behind the answers (expiry, undo window, the realtor mark): WP-85.
- `SettingsScreen`, `SettingsRow`, `SubPage` and the settings layout: WP-31 and WP-23 (used here).

## Decisions that bind this package

- DEC-69: functional parity (DEC-46) for SCR-049 and SCR-057 … SCR-060; the checklist below is the proof.
- DEC-73: post-moderation. A `held` listing (the operators' «Снять», or the checks and report votes waiting for the
  operators, WP-84) and a `withdrawn` one (taken down for good by the operators) show their status and note and
  offer no resume; their footer is «Поддержка». `active` is never offered for them. Nothing on these screens says
  that a listing or a number was marked as a realtor's (WP-70 row 45).
- DEC-74: DEV-056 (the reason, the support row and «Удалить» on a rejected card) and DEV-059 (the tip opens the
  requests) are on without a flag.
- DEC-76: «Отклики» shows the seeker's Telegram first name as the server stores it with the request, or «Без имени»;
  nothing else of the seeker.
- DEC-78: the market delta of a card (`stats.price_delta`, `stats.price_tone`) shows only where the server has a
  harvested median; its absence is not an error.
- DEC-81: while `GET /reference` says `owner_enabled: false`, the group «Сдаю квартиру» is not rendered and no owner
  list is requested for a user without listings (the developer's words: «в настройках нет группы «Сдаю квартиру»»).
  A user whose `GET /me` says `owner.has_listings` sees the group with the «Мои объявления» row only (no «Сдать
  квартиру») and reaches «Мои объявления» (also by the address `/settings/owner`, which the switch does not close),
  «Отклики» and the owner panel of his own listing, so pausing, «Сдано», «Снять» and the answers work as DEC-81
  says («Снять, поставить на паузу, отметить «Сдано» и ответить на отклик можно всегда»). What opens the form or
  puts a listing back into the feed — «Продолжить», «Изменить», «Вернуть», «Сдать ещё одну», the fill hints — is
  not offered while the switch is off, since the server refuses it (WP-80). The developer confirmed this reading of
  DEC-81 on 2026-11-20 (answer 15, ««Мои объявления» для хозяев (Recommended)»).
- DEC-56: «Поддержка» and the support row open HOMI's support bot (`supportUrl`) and are hidden while
  `reference.bot.support_username` is `null`.
- DEC-72: no list, card or panel shows the owner's number; only the form of WP-81 does.
- DEC-88: the checks inside Telegram on staging run when WP-89 switches the cabinet on there for staff accounts,
  before the legal gate.
- *Integrator defaults, listed for the reviewer:* default 9 (two listings per account and per phone; `max` and
  `can_add` from `GET /owner/listings`), default 13 (the request lifecycle: the undo window of ten minutes, «Оказался
  риелтором» for seven days after `given`; as in legacy, `agent` reaches the seeker as `declined`, BR-APP-098),
  default 20 (no relisting from «История»). New in this specification: (a) `GET /owner/listings` is read only for
  a user whose `GET /me` says `owner.has_listings`, and the pending count is re-read on a return to the app only for
  such a user; (b) «Пришёл первый отклик!» opens «Мои объявления» scrolled to the first listing with pending requests,
  which carries the card tip (the reading of DEV-059's «on the listing with pending requests»); (c) the request tip's
  key is HOMI's `homi-req-tip`; (d) «Мои объявления» of the limit sheet goes back, then pushes the list (section "Limit
  sheet").

Read before coding: `03-api-reference/03-file-conventions/parallel-routes.md` and `intercepting-routes.md` (the
sheet `/owner/limit`), `02-guides/preserving-ui-state.md` (the sub-page kept mounted under its child) in
`frontend/app/node_modules/next/dist/docs/01-app/` — verify in the installed documentation.

- DEC-89: the invitations and the landlord block show only while `owner_enabled` is true; while it is off nothing of
  them renders and nothing is requested. DEC-90: the end line of the search feed is WP-39's and stays when the cabinet
  is off; the invitation row is added under it. DEC-91: the landlord block's two buttons. DEC-94: `owner.entry` of
  the card (WP-80) decides the listing's invitation (*added by the intake of `index-YX9bFVws.js`*).

## Design

### Routes

| Address | Files under `app/[locale]/(main)/` | Renders |
| ------- | ---------------------------------- | ------- |
| `/owner/limit` | `owner/limit/page.tsx`, `@sheet/(.)owner/limit/page.tsx` | `OwnerLimitSheet` (SCR-049); `?where=settings` or `where=mine` |
| `/settings/owner` | `settings/owner/layout.tsx` + `page.tsx` (WP-81's placeholder replaced) | layout: `OwnerListingsPage` in `SubPage` and `{children}`; `page.tsx` renders `null` |
| `/settings/owner/[id]/requests` | `settings/owner/[id]/requests/page.tsx` | `OwnerRequestsPage` (SCR-058) in a nested `SubPage`; a non-ULID id is not found |
| `/listing/[number]/requests` | `requests/page.tsx` under both listing layouts | `OwnerRequestsOverlay` (SCR-058 from the panel) |

- `/settings/owner` sits under the `/settings` layout of WP-31, so the settings screen stays mounted below it, and
  «Отклики» sits under `/settings/owner`, so the list stays mounted below the requests and keeps its tab and scroll.
- The `[id]` layout of WP-81's `@overlay/(.)owner/` renders nothing for `limit`, so only the sheet shows.
- `OwnerRequestsOverlay` is a full-screen layer at `--z-owner-bar` (WP-81's token) inside the listing layer, with its
  own Back; the owner listing's id is `owner.listing_id` of the card. Without it the address returns to the listing.

`lib/navigation/routes.ts` gains the builders `ownerLimit(q?)`, `ownerRequests(id)` and `listingRequests(number)`,
the match cases `{ route: "ownerLimit" }` and `{ route: "ownerRequests"; id: string }`, and the listing child
`requests`. `parentOf`: `/owner/limit` → `/settings`; `/settings/owner/<id>/requests` → `/settings/owner`; the
listing child → `/listing/<number>` (the rule of the listing's children). `screenNameOf` (new names, the practice of
WP-32 for layers legacy never tracked): `/owner/limit` → `owner/limit`; `/settings/owner/<id>/requests` and
`/listing/<number>/requests` → `owner/requests` (the second with `listing_id`); `/settings/owner` keeps WP-81's
`owner/mine`. `features/shell/shellVariant.ts`: the three settings-side addresses draw `settings`; `/owner/limit` is
a layer address.

### Modules

| Path under `frontend/app/` | Content |
| -------------------------- | ------- |
| `features/owner/store.ts` (WP-81) | gains `ownerRequestsKey(id)`, `useOwnerRequests(id)` (pages of 20 by `meta.next_cursor`) and `useOwnerPending()` → `{ pending, hasListings, waitlisted }` from `SessionState.me.owner`; `invalidateOwner()` stays the one call after every mutation |
| `features/owner/status.ts` | pure: `statusLabel(listing, now)` (BR-APP-094), `isPast(listing)` (the «История» rule), `manageable(listing)`, `actionsOf(listing, place)` with `place` `card` or `panel` (BR-APP-088), `mineRowValue(items, pending)`, `daysListed` in Asia/Tashkent |
| `features/owner/settings/OwnerGroup.tsx` | the group of SCR-032, passed into WP-31's slot |
| `features/owner/OwnerLimitSheet.tsx` | SCR-049 on `BottomSheet` |
| `features/owner/lists/{OwnerListingsPage,OwnerListingCard,OwnerStatusChip,OwnerStatsLine,RequestCardTip}.tsx` | SCR-057 |
| `features/owner/lists/useStatusAction.ts` | one change at a time, the confirms, the toasts, `invalidateOwner()` |
| `features/owner/requests/{OwnerRequestsPage,OwnerRequestsOverlay,RequestList,RequestCard}.tsx`, `requests/useAnswer.ts` | SCR-058: one list, two frames |
| `features/owner/panel/{OwnerPanel,OwnerPanelFooter,OwnerStats,WeekChart,FillHints,OwnerPriceSection,MineBar}.tsx` | SCR-059 |
| `features/owner/signals/{RequestTip,useRequestTip,useOwnerAttention}.ts(x)` | SCR-060: the tab tip, the shared tip state on `homi-req-tip`, the once-per-session event pairs |
| `lib/actions/owner.ts` (WP-81) | gains `setOwnerStatus({ id, status })` → `PUT /owner/listings/{id}/status`, `deleteOwnerListing({ id })` → `DELETE /owner/listings/{id}`, `answerRequest({ id, action })` → `POST /owner/requests/{id}/answer` |

Reads: `serverApi().ownerListingRequests(id, query?)` → `GET /owner/listings/{id}/requests`, and the allow-list entry
`owner/listings/:id/requests` (`readTemplate` takes the ULID template of WP-81).

### The settings group (SCR-032)

`SettingsScreen` of WP-31 renders the slot `ownerGroup` before «Оформление» (WP-31 "Settings screen", the note
above the groups table). `settings/layout.tsx` passes `OwnerGroup` into it. While `useOwnerEnabled()` of WP-81 is
`false`, `OwnerGroup` renders nothing for a user without `owner.has_listings`, and only the «Мои объявления» row for
one with listings (DEC-81, the reading above).

| Row | Value | Tap |
| --- | ----- | --- |
| «Сдать квартиру» (`own.title`, house icon), only while the cabinet is on | «Бесплатно» (`own.free`), or «{n} из {max}» (`own.limitValue`, both numbers `max`) when `can_add` is `false` | light haptic; `routes.ownerLimit({ where: "settings" })` when `can_add` is `false`, else `routes.ownerNew()` |
| «Мои объявления» (`own.mine`, list-checks icon, `ListChecks` of `@homi/ui`), only when `owner.has_listings` | the first that applies: «ждут ответа: N» (`own.pendingShort`) when `owner.pending > 0`; the number of `active` and `paused` listings that are neither `withdrawn` nor `held`; «Черновик» (`own.draftShort`) when a draft exists; else empty. The row's red counter shows `owner.pending` (a `count` prop that this package adds to WP-31's row if it has none) | light haptic; `routes.ownerListings()` |

- `GET /owner/listings` is read only when `owner.has_listings` (default (a)); while it loads, and after it failed,
  the group shows only «Сдать квартиру» with «Бесплатно» (with the cabinet off: only «Мои объявления») and the limit
  is not checked; errors are silent.
- The list is read again after every cabinet mutation (`invalidateOwner()`), so closing «Мои объявления» finds the
  group current without a read of its own.

### Invitations and the landlord block (BR-APP-115, BR-APP-116, TMA-048; *added by the intake of `index-YX9bFVws.js`*)

Nothing of this renders, and nothing is requested or sent, while `owner_enabled` is false (DEC-89).

- `features/owner/entry/{OwnerEntryRow,OwnerEntryLine}.tsx` and `features/owner/entry/useOwnerEntry.ts`.
- End of the search feed: in WP-39's end block (`data-feed-end`, DEC-90), under «Это всё по вашему поиску», a row
  with a house icon, «Сдаёте квартиру? Разместите бесплатно» (`own.entryAsk`, `own.entryCta`) and a chevron, `src`
  `feed_end`. WP-39's block renders for every search feed loaded to its end with cards and holds the end line only
  without the few-results note, so with the note the row stands alone under it, as legacy's row does. The search feed
  only; never favourites or history.
- Empty search feed: a line «Сдаёте квартиру? **Разместите бесплатно ›**» under the empty state, or under the
  few-results note when no card is left, `src` `empty`.
- The listing card: «Тоже сдаёте квартиру? **Разместите бесплатно ›**» (`own.entryAskToo`) as the last line of the
  loaded card, after the sources, when `owner.entry` is true (WP-80, DEC-94; the server's rule already leaves out the
  user's own listing), `src` `listing`.
- A tap (`useOwnerEntry`): a light haptic; `owner_entry {src}`; the owner list read through the store of WP-81:
  `can_add` → `routes.ownerNew()`; else a tab press to Settings followed by `nav.push(routes.ownerListings())`, as
  the tab tip opens the list (DEV-059); an error → `routes.ownerNew()`, whose own limit state answers a full
  account. One opening at a time: a tap while the read runs does nothing, and the event is sent once per opening
  (the fix of LB-APP-084, a default of the integrator).
- The landlord block of `FoundSheet` (`features/radars/FoundSheet.tsx`), on the step `done` (after «Да, через
  HOMI», below the share button) and on WP-39's step `moved`: «Съезжаете со старой квартиры?»
  (`found.landlordTitle`), `found.landlordText`, then DEC-91's buttons:
  - with the owners' landing page (`brand.links.owners`, a `LocaleLink` of `lib/brand` that stays `null` until WP-61
    builds the page; where the page's content comes from is DEC-97, *added by the landing intake*): «Отправить хозяину» (`found.landlordSend`) shares legacy's `found.landlordShare` with `{url}` =
    the page of the locale with `?s=tenant`; a second button «Отправить ссылку на бота»
    (`found.landlordSendBot`) shares `found.landlordShareBot` with `{url}` = `https://t.me/<bot>?start=owner_new`
    (WP-88);
  - without the page: one button «Отправить хозяину» that shares `found.landlordShareBot` with the bot link;
  - without a bot name (`brand.botUsername` empty): no bot button; with neither, no block (these two fallbacks are
    defaults of the integrator, listed for the reviewer).
  - Each tap: a light haptic, `landlord_share {src: homi | elsewhere, to: page | bot}` (`src` is `homi` on `done`,
    `elsewhere` on `moved`), then the share.
- The share (TMA-048): `tg.shareText(text)` (new in `lib/telegram/share.ts`): inside Telegram
  `openTelegramLink("https://t.me/share/url?url=" + encodeURIComponent(text))`, as legacy; else
  `navigator.share({ text })` with its errors swallowed; else `window.open(link, "_blank", "noopener")`. LB-APP-090
  (the message in `url`) is not adopted, a default of the integrator listed for the reviewer: legacy's message carries
  its link inside the text, which a separate `text` beside `url` would repeat.
- HOMI's texts of DEC-91 in `messages/homi/{ru,uz,en}.json` (the integrator's wording; the reviewer may change it):
  `found.landlordSendBot` «Отправить ссылку на бота» / «Bot havolasini yuborish» / «Send the bot link»;
  `found.landlordShareBot` «Здравствуйте! Я съезжаю. Нового жильца можно найти бесплатно и без риелтора через
  Telegram-бота: {url}» / «Assalomu alaykum! Men koʻchib ketyapman. Yangi ijarachini bepul va maklersiz Telegram-bot
  orqali topish mumkin: {url}» / «Hi! I’m moving out. You can find a new tenant for free and without an agent through
  this Telegram bot: {url}». The block's other texts are legacy's (`03` §3.1).

### Pending count and the store (BR-APP-091, LB-APP-059, LB-APP-066)

- The count is `owner.pending` of `GET /me`, which the session holds (`SessionState.me`, `lib/session/bootstrap.ts`;
  `Me.owner` and `ME_KEYS` of `lib/session/types.ts` come with WP-80). `GET /owner/pending` has no v1 method
  (WP-80).
- It is re-read by `refresh()` of the session after every cabinet mutation (status, delete, answer, publish — through
  `invalidateOwner()`, also on the panel, fix of LB-APP-059) and on `tg.onVisible` for a user with
  `owner.has_listings` (default (a); legacy reads it for everyone, LB-APP-066). Concurrent re-reads share one request.
- Consumers: the red dot, the tab tip, the settings row's value and counter, the tabs of «Мои объявления».

### The owner panel and the user's own listing (SCR-059, BR-APP-103, LB-APP-070)

The seam in WP-26's listing screen (`features/listing/ListingScreen.tsx`, `ListingTitleRow.tsx`,
`cta/ListingCtaBar.tsx`): this package owns every state with `owner.mine`; WP-83 owns every other owner state.

- `owner.mine` alone: the title row keeps only «Поделиться» (no heart, no «⋯»); no market block above the facts;
  after «Факты» comes `OwnerPriceSection` «Цена» (the main price and period, the delta and the note) with the market
  block under it; no «Источник» section; no «Обычно отвечает за…» in the author section.
- `owner.mine` with `owner.listing_id`: `OwnerPanel` under the key facts and `OwnerPanelFooter` in place of
  `ListingCtaBar`. While the panel loads, the footer is a skeleton of the same height; a failed load shows an island
  with `ErrorState` and «Повторить», and the footer shows `MineBar`.
- `owner.mine` without `owner.listing_id`: no panel; the footer is `MineBar`, «Это ваше объявление» with «Отклики — в
  «Мои объявления»» (`contact.mineBar`, `contact.mineBarHint`) and a tap to `routes.ownerListings()`. The footer is
  never empty (fix of LB-APP-070).
- The panel reads `GET /owner/listings/{id}` through the store; nothing reads `GET /api/bot`, since the support name
  is in `GET /reference`.

## Files

New, under `frontend/app/`:

- The modules of the table in "Design" and the route files of "Routes".
- `tests/owner/{status,mineRow,requestTip,ownerAttention,weekChart,answer}.test.ts`,
  `tests/owner/{OwnerGroup,OwnerLimitSheet,OwnerListingsPage,OwnerListingCard,OwnerRequestsPage,OwnerPanel,
  OwnerPanelFooter,RequestTip}.test.tsx`, `tests/actions/ownerStatus.test.ts`.
- End to end: `e2e/owner-lists.spec.ts`, `e2e/owner-requests.spec.ts`, `e2e/owner-panel.spec.ts`,
  `e2e/owner-signals.spec.ts`.
- Since `index-YX9bFVws.js`: the entry modules of "Invitations and the landlord block", `tests/owner/{OwnerEntry,
  useOwnerEntry}.test.tsx`, `tests/telegram/shareText.test.ts` and `e2e/owner-entry.spec.ts`; changed
  `features/feed/ListingFeed.tsx`, `features/listing/ListingScreen.tsx`, `features/radars/FoundSheet.tsx`,
  `lib/telegram/{share,index}.ts`, `lib/brand` (`links.owners`) and `tests/radars/FoundSheet.test.tsx`
  (*added by the intake of `index-YX9bFVws.js`*).

Changed:

- `app/[locale]/(main)/settings/layout.tsx` (the slot), `features/shell/{TabBar,AppShell}.tsx` (the dot and the tab
  tip), `features/listing/{ListingScreen,ListingTitleRow}.tsx`, `features/listing/cta/ListingCtaBar.tsx` (the footer
  swap), `features/listing/sections/AuthorSection.tsx` (no response time for the user's own listing).
- `lib/navigation/routes.ts`, `features/shell/shellVariant.ts`, `lib/api/{server,bffAllowList}.ts`,
  `lib/actions/owner.ts`, `lib/analytics/events.ts`, `lib/storage.ts` (`homi-req-tip`, synced).
- `frontend/packages/ui/src/hooks/useSwipeBack.ts` (the nested rule and the 300 ms reset of the inline styles after a
  closing swipe) and its test; `frontend/packages/ui/src/icons/index.ts` (`ListChecks`).
- `frontend/packages/i18n`: `src/labels.ts` (the tables `ownerStatus`, `requestStatus`, `requestWho`, `ownerAnswer`),
  `messages/homi/{ru,uz,en}.json` (the overrides and texts of "Behaviour to reproduce"), the catalogue tests.

## Steps

1. Read the Next.js files named above. Check two seams and note them in the PR: the slot `ownerGroup` of WP-31's
   settings screen and its row's `count`; what WP-80 left in `Me` and in the owner types (status, stats, requests).
2. `routes.ts` and `shellVariant.ts` for the four addresses; unit tests.
3. `status.ts` with its tests (labels, days, the split, the actions per place, the row value).
4. The store's requests and pending; `refresh()` on `onVisible` for owners; the actions and the allow-list.
5. The settings group and the limit sheet; `owner_limit_sheet`.
6. «Мои объявления»: tabs with dots, cards, chips, stats, notes, actions with confirms and toasts, the rejected card
   (DEV-056), «Сдать ещё одну квартиру», the foot line, the empty texts.
7. «Отклики» in both frames: cards, answers, reasons, undo, `request_answer_closed`, paging, the foot line.
8. The panel, its footer and `MineBar`; the screen changes of `owner.mine`; the fill hints with `owner_hint_opened`.
9. The nested sub-page rule of `useSwipeBack` and the 300 ms reset of its inline styles after a closing swipe.
10. The signals: the dot, the tab tip, the card tip, `homi-req-tip`, `owner_attention`.
11. The label tables, the `homi` texts, the screen names.
12. Component tests; Playwright specs in both session modes; the checklist in three locales and two themes on a
    local stack with the cabinet on; update the queue.

## Behaviour to reproduce

### Limit sheet (SCR-049, BR-APP-089)

- A compact bottom sheet: the title `own.limitSheetTitle` with `n` and `max` both `max` («Сдаются 2 из 2 квартир»),
  the text `own.limitSheetText`, one button: «Мои объявления» (primary) with `where=settings`, «Понятно»
  (`owner.info.ok`) with `where=mine`. The button gives a light haptic; the backdrop, a drag on the handle and Back
  also close it. «Мои объявления» closes the sheet, then pushes `routes.ownerListings()` (`backBy(1)` of
  `lib/navigation/history.ts`, then `nav.push`; `nav.replace` when no step was taken, a direct load), so Back from the
  list returns to Settings (*integrator default,
  listed for the reviewer*: legacy's history here is not known, `03` SCR-049; `closeThen` would replace Settings).
- `owner_limit_sheet {where}` on every mount.

### «Мои объявления» (SCR-057, BR-APP-088, BR-APP-094, BR-APP-095)

- `SegmentedControl` «Актуальные» / «История»; a tab carries a red dot when one of its listings has pending
  requests. «История» holds `rented`, `removed` and every `withdrawn` listing; «Актуальные» the rest, `draft`,
  `rejected` and `held` included.
- Empty «Актуальные»: `own.welcome` «С возвращением! …» when `past > 0` and nothing else is current (BR-APP-095), else
  `own.mineEmpty` (`homi` override); empty «История»: `own.pastEmpty`.
- A card: the cover photo with a glass status chip; a red chip «{n} новых откликов» (`own.v.newRequests`) when requests
  wait; the price with «/мес» and the delta badge (DEC-78); «rooms · district», falling back to the landmark, then the
  city; for a non-draft the stats line «N получили по радару · N открыли · N в избранном» (the last only above 0);
  the note `own.withdrawnNote`, or for a held listing `own.review.text` of WP-81 in place of legacy's `own.held`; the
  actions.
- The status chip (BR-APP-094): `withdrawn` → «Снято с публикации» (a `homi` text; legacy's «Снято по жалобам»
  named the votes, which no longer withdraw, default 26); `held` → «На проверке» (`own.review.title` of WP-81)
  whatever its `hold_reason`, which the client never shows (default 26, WP-70 row 45; legacy showed «На паузе» with
  its `own.held` note); another status than `active` → its label from the table `ownerStatus` («Черновик»,
  «На паузе», «Сдано», «Снято», «Не принято»), an unknown one → `fallback.other` (fix of LB-APP-064); `active` →
  «Сдаётся · с сегодня» within the first full day after publication, else «Сдаётся · N дней», counted in
  Asia/Tashkent from the server's publication time, not by the device clock (fix of LB-APP-062).
- Actions by status (BR-APP-088, DEC-73, DEV-056):

  | Listing | Card | Panel footer (SCR-059) |
  | ------- | ---- | ---------------------- |
  | `draft` | «Удалить», «Продолжить» | «Удалить», «Продолжить» |
  | `active` or `paused`, not `withdrawn`, not `held` | «Отклики», «Пауза» or «Вернуть», «Сдано» | «Отклики» (badge = pending), «Изменить», «Пауза» or «Вернуть», «Сдано», «Снять» (danger) |
  | `held`, or `withdrawn` | «Отклики» (only with requests), «Поддержка» | «Поддержка» |
  | `rejected` | the reason line, «Поддержка», «Удалить» | the reason line, «Поддержка», «Удалить» |
  | `rented`, `removed`, an unknown status | «Отклики» (only with requests) | «Отклики» (only with requests), «Сдать ещё одну» |

  While the cabinet is switched off (DEC-81) `actionsOf` drops «Продолжить», «Изменить», «Вернуть» and «Сдать ещё
  одну», and a tap on a draft's card does nothing: the server refuses them (WP-80). «Удалить» of a draft or a rejected
  listing, «Пауза», «Сдано», «Снять», «Отклики» and «Поддержка» stay.

- «Сдано», «Снять» and «Удалить» confirm through `confirmText` of `lib/ui/confirm.ts`: «Отметить «Сдано»? Объявление
  уйдёт из ленты, а тем, кто ждёт ответа, скажем, что квартиру сдали.», «Снять объявление?», «Удалить черновик?»
  («Удалить объявление?» for a rejected one, a new `homi` text). One change at a time: `setOwnerStatus` with
  `rented`, `paused`, `active` or `removed`, or `deleteOwnerListing`. Success: the success haptic, the toast
  (`own.toast.*`: «Отметили «Сдано». Поздравляем!», «На паузе: в ленту и радар не уходит», «Снова в ленте», «Сняли
  объявление», «Черновик удалили»), a deleted listing leaves the list, another is replaced by the answer, then
  `invalidateOwner()`. Failure: the error haptic and `own.actionOffline` or «Не получилось сохранить»;
  `409 owner_listing_locked` reads the list again. Nothing leads out of `rented` or `removed` (default 20).
- A tap on a card (light haptic; taps on its buttons do not count): a draft → `routes.ownerForm(id)` (WP-81); a
  published listing → `routes.listing(number)`, the public listing in its own variant; anything else → nothing.
- Below the list, in «Актуальные» only and while the cabinet is on: «+ Сдать ещё одну квартиру»
  (`routes.ownerLimit({ where: "mine" })` when `can_add` is `false`, else `routes.ownerNew()`) and the foot line
  «Можно сдавать до {n} квартир сразу.» with `n` = `max` (LB-APP-057).
- States: a spinner; a failed first load → `ErrorState` with «Повторить»; a later failed read keeps the list shown.
- `?focus=<id>` (the tab tip, DEV-059): the page opens on the tab that holds that listing, scrolls its card into view
  and shows the card tip on it; the parameter leaves the address by `nav.replace`.

### «Отклики» (SCR-058, BR-APP-090, DEC-76)

- One card per request, newest first, 20 per page by the cursor: the first name, or «Без имени»; the line
  «{who} · N чел. · въезд: {when}» (`who` through the table `requestWho`, an unknown one → `fallback.other`, fix of
  LB-APP-064; «N чел.» only above 1); the message in «…». The name, the move-in text and the message carry the
  `.ph-mask` class of WP-32's replay masking, never enter an analytics property, and a failed answer reaches the
  error facade of WP-32 as its `UiError` code only (`16` SEC-REQ-036).
- A `pending` request: «Дать номер» (primary) and «Не подходит». Any other: the status line from the table
  `requestStatus` — «Номер дали», «Номер дали · оказался риелтором» (`given` with `agent_marked`), «Не подошло»,
  «Отмечен как риелтор», «Без ответа», «Квартира сдана» — then by the server's flags: `can_reason` and no reason chosen
  in this launch → «Почему не подошло? Можно не отвечать — человеку ответим одинаково мягко.» with «Уже договорился» /
  «Похоже на риелтора» (after «Уже договорился»: «Причина: уже договорились с другим.»); `can_undo` → «Передумали —
  можно отменить в течение 10 минут» and «Отменить»; else `can_late` → «Оказался риелтором».
- The foot line `own.requestsFoot`.
- Answers: `answerRequest({ id, action })` with `give`, `decline`, `reason_found`, `reason_agent`, `undo` or `late`,
  one at a time, no confirmation; a medium haptic for «Дать номер», light for the rest, then success or error. The
  answer replaces the card, keeping the old name when it has none. A reason chosen in this launch hides the reason
  buttons; `undo` or `decline` clears it. The toast is the table `ownerAnswer` (`own.answered.*`), or «Отметку
  сняли» (`own.unmarked`) for `undo` on a `given` request. `409 request_answer_closed` reads the list again, and for
  `undo` shows «Отменить уже нельзя: прошло больше 10 минут». Then `invalidateOwner()`.
- Opening the page (either frame) dismisses the request tip for good (BR-APP-092).
- States: a spinner; `ErrorState` with «Повторить»; empty «Откликов пока нет.»
- Closing returns to the list or the panel, which the store has already refreshed.

### The panel «Ваше объявление» (SCR-059)

- The heading «Ваше объявление» with the status chip, and «Этот блок видите только вы.»
- With pending requests: «{n} человек ждут ответа» (plural) with «Ответить» → `routes.listingRequests(number)`.
- Stats tiles «Получили по радару», «Открыли», «В избранном», «Откликов» (with «номер дали N» above 0).
- «Открывали за 7 дней»: the total and seven bars from `stats.daily`, today on the right; the labels are `Intl`
  short weekday names with a capital first letter («Пн», «Вт»…; `Intl` itself gives «пн») of the seven days counted
  back from today in Asia/Tashkent (WP-80 gives seven integers, the last today, no dates) — never the device's zone
  and never the legacy initials «П,В,С,Ч,П,С,В» (LB-APP-062).
- «В HOMI {N дней}» (`own.listedDays`, `homi` override) from `stats.days_listed`, hidden at 0; the note of `withdrawn`
  or of a held listing (as on the card).
- The footer by status (table above). «Изменить» → `routes.ownerForm(id)`: the form takes the overlay slot and Back
  returns to the listing (WP-81). «Сдать ещё одну» → `routes.ownerNew()` without a check, as legacy (BR-APP-089); the
  form's limit state answers it. «Сдано» and «Снять» confirm; success shows the toast, calls `invalidateOwner()` and
  re-reads the card in the background without clearing the screen (fix of LB-APP-059).
- Fill hints, for a manageable listing only and while the cabinet is on (BR-APP-093): «Чтобы объявление было
  полнее», «n из 5» and a 5-segment bar; the open items first — photos below 5 «Добавьте фото — сейчас n из 10», else «Фото — n из 10»; «Укажите
  площадь», «Укажите этаж», «Укажите ремонт», «Напишите пару слов о квартире»; all filled: «Объявление заполнено
  полностью». A tap opens `routes.ownerForm(id, { focus })` with `photos`, `area_m2`, `floor`, `renovation` or
  `description` and sends `owner_hint_opened {field}`. Since `index-YX9bFVws.js` the «n из 5» rolls (`RollNumber` of
  WP-39, BR-APP-113) (*added by the intake of `index-YX9bFVws.js`*).
- `owner_attention {what: "banner"}`: `shown` when the panel has `stats.pending > 0`, `clicked` on a tap on the row
  «N человек ждут ответа · Ответить», each once per launch.
- The screen name: WP-32's listing pageview, sent once the record is known, names `owner/listing` when the record has
  `owner.mine` (legacy since `index-CIa0Ldj2.js`), with `listing_id`.

### Signals (SCR-060, BR-APP-092, DEV-059)

- The red dot on the Settings tab while `owner.pending > 0`, with the accessible label «ждут ответа: N».
- The tab tip above the tab bar, `own.reqTip.tab` «Пришёл первый отклик! Он в «Настройки» → «Мои объявления»»: while
  `owner.pending > 0`, `homi-req-tip` is not `done`, the current tab is not Settings, and no listing, owner form,
  «Мои объявления» or filters sheet is open. A tap (light haptic) is a tab press to Settings followed by
  `nav.push(routes.ownerListings({ focus: id }))` with the first listing that has pending requests (DEV-059;
  `routes.ownerListings()` while the list is unknown). «×» (`owner.tipClose` «Закрыть подсказку») dismisses it for good.
- The card tip «Вот здесь ваши отклики» on the first card with pending requests in the current tab of «Мои
  объявления»; a tap opens that listing's requests.
- `homi-req-tip` is a synced key of `lib/storage.ts`, mirrored to DeviceStorage and restored from it (TMA-037). «×»
  on either tip, or opening any requests page, writes `done` and hides both at once. Since `index-YX9bFVws.js`
  (BR-APP-092; *added by the intake of `index-YX9bFVws.js`*): a `done` that the restore from DeviceStorage brings after the first render hides a tip
  that is already shown, and a dismissal always tells the shown tips, also when the key was `done` already. A tip that
  unmounts leaves as legacy's tips do (BR-APP-112, the tip kind of WP-39's leave helper: 160 ms, `translateY(-6px)
  scale(.92)` and opacity 0).
- `owner_attention {what, action}`, each pair at most once per launch: `dot` / `shown` when the count is above 0 on
  any tab; `dot` / `clicked` on a tap on the Settings tab while it is above 0, unless the tap only expanded the
  collapsed chrome; `coach` / `shown` when a tip mounts; `coach` / `clicked` on a tap on its text. «×» sends nothing.

### Swipe in nested sub-pages

`useSwipeBack` of `@homi/ui` ignores a touch whose target's closest `[data-slot="subpage"]` is not the layer itself,
so a swipe on «Отклики» closes «Отклики» and never also «Мои объявления» below it. After a closing swipe the hook
removes its inline styles 300 ms later (legacy since `index-CBlEKxdL.js`, WP-23 "`useSwipeBack`"); today it settles
in 180 ms (`SWIPE_BACK_SETTLE_MS`) and resets the styles only on cleanup, so this package adds the reset.

### New and overridden texts

`homi` layer, ru/uz/en: the overrides of `own.mineEmpty`, `own.listedDays` and any other list or panel text the
brand test flags; new: «Удалить объявление?» (`own.confirmDeleteRejected`), the reason lines of a rejected card
(`own.rejectedReason.denied` and `.limit`, short forms of SCR-054's texts — `denied` from legacy's `fraud` text; an
unknown value reads `.denied`, and no text names realtors — default 32, WP-81 "Rejection"), and
`own.support` of WP-81 reused
for «Поддержка». All new texts are for the product owner to approve.

## Tests

**Unit (Vitest).**

- `status.test.ts` (fake clock, the device in another time zone): every status label, `withdrawn` first, «с
  сегодня» until the first full Tashkent day, an unknown status neutral; the «История» split; the action matrix per
  status for `card` and `panel`; no «Вернуть» for `held`; «На проверке» for every `hold_reason`.
- `mineRow.test.ts`: the row value in its four cases; the counter from `pending`.
- `requestTip.test.ts`: the visibility rule (count, key, tab, covering layers); `done` from «×» and from a requests
  page; the restore from DeviceStorage.
- `ownerAttention.test.ts`: each pair once per launch; the collapsed-chrome tap sends nothing; «×» sends nothing.
- `weekChart.test.ts`: seven bars, today on the right, `Intl` labels with a capital first letter in ru, uz and en,
  the Tashkent day at 22:30 UTC.
- `answer.test.ts`: one answer at a time; the kept name; the session reason; the `undo` toast on `given`;
  `request_answer_closed` with and without `undo`.
- `tests/actions/ownerStatus.test.ts`: the three new actions in both session modes; an invalid id sends nothing.
- The `useSwipeBack` suite of `@homi/ui`: a touch inside a nested sub-page moves only that page; the inline styles
  are gone 300 ms after a closing swipe (fake clock).

**Component (Vitest + Testing Library).** `OwnerGroup`: with `owner_enabled` off hidden for a user without listings
and only «Мои объявления» for one with listings; «Бесплатно» and «2 из 2»;
«Мои объявления» only with `has_listings`; no `GET /owner/listings` without it. `OwnerLimitSheet`: both buttons by
`where`, the event. `OwnerListingsPage` and `OwnerListingCard`: tabs and dots, every status row of the action table,
the confirms, the toasts, the rejected card with and without a support bot, `focus`. `OwnerRequestsPage`: every
status line, the flags, the paging. `OwnerPanel` and `OwnerPanelFooter`: the skeleton, the error island with
`MineBar`, `MineBar` without `listing_id`, the fill hints and their event. `RequestTip`: the tap with and without a
known listing.

**End to end (Playwright, fake Telegram, stubs; cookie mode and header mode; the stub API with the cabinet on).**

- `owner-lists.spec.ts`: Settings shows the group first; «Мои объявления» with the fixture list (a draft without a
  point, a complete draft without a phone, an active listing with two pending requests, a paused, a held, a
  withdrawn, a let and a rejected listing): the two tabs, the chips, «Пауза» → «На паузе: …», «Сдано» with its
  confirm, «Удалить черновик?»; the default list (`can_add: false`) → «2 из 2» and the sheet; `owner_empty` →
  «Бесплатно», the form and, on `/settings/owner`, the empty texts; `owner_returning` → «С возвращением!»;
  `listing_locked` → the list read again.
- `owner-requests.spec.ts`: «Отклики» of the active fixture listing: «Дать номер», «Не подходит» with a reason,
  «Отменить», «Оказался риелтором»; the scenario `request_answer_closed` → «Отменить уже нельзя…».
- `owner-panel.spec.ts`: the stub listing 10000008 (`owner.mine`, `owner.listing_id`): only «Поделиться» in the title
  row, «Цена» after «Факты», no «Источник», the panel, the footer with five tabs, «Ответить» → the requests overlay and
  Back to the listing, a fill hint → the form on that field, «Изменить» → the form and Back to the listing.
- `owner-signals.spec.ts`: the dot on the Settings tab and its label; the tab tip on the search tab; a tap → «Мои
  объявления» on the listing with the card tip; after opening «Отклики» no tip anywhere, also after a reload.
- WP-81's `owner-off.spec.ts` (`@owner-off`, the API with the key unset; the default `GET /me` has
  `owner.has_listings`) gains: Settings shows the group with «Мои объявления» only; the list offers «Пауза», «Сдано»
  and «Удалить» but no «Продолжить», «Вернуть» or «+ Сдать ещё одну квартиру»; the panel of 10000008 has no
  «Изменить» and no fill hints; «Отклики» answers; with `owner_empty` Settings has no group.

## Acceptance checklist

Run in ru, uz and en, light and dark; cookie mode and header mode where a request is involved. Staging and
production keep the cabinet off until WP-89 (DEC-81); these lines run on a local stack with
`OWNER_CABINET_ENABLED=true`, with the screenshots in the PR, and inside Telegram on staging when WP-89 switches the
cabinet on there (DEC-88).

- [ ] With the cabinet off there is no invitation on the search feed, the empty feed or a listing card, no landlord
      block in the survey, and no `owner_entry` or `landlord_share`; «Это всё по вашему поиску» still ends the feed
      (*added by the intake of `index-YX9bFVws.js`*).
- [ ] With the cabinet on: the three invitations with their `src`; a tap opens a new form with `can_add`, «Мои
      объявления» without it, a new form on an error; a double tap opens once; the landlord block on both
      congratulation steps with one button (bot link) while `brand.links.owners` is `null` and two when it is set
      (*added by the intake of `index-YX9bFVws.js`*).
- [ ] With the cabinet off, Settings has no group «Сдаю квартиру» and no owner request is sent for a user without
      listings; an owner with listings sees only «Мои объявления», and pausing, «Сдано», «Снять», «Удалить» of a
      draft and the answers work, while nothing opens the form. Seen on staging.
- [ ] The group is the first of Settings; «Сдать квартиру» reads «Бесплатно», or «2 из 2» and opens the limit sheet.
- [ ] «Мои объявления» shows only for an owner with listings; its value and red counter follow the pending count.
- [ ] The limit sheet: its title with the numbers, «Мои объявления» from Settings, «Понятно» from the list.
- [ ] «Актуальные» / «История» split and dots; every status chip in three languages; «Сдаётся · N дней» does not
      change with the device's time zone.
- [ ] Each action of each status as in the table, with its confirm, toast and haptics; no way out of «Сдано».
- [ ] A rejected card shows its reason, «Поддержка» (when a support bot exists) and «Удалить» (DEV-056).
- [ ] «Отклики»: first names, details, messages; «Дать номер», «Не подходит», the reasons, «Отменить» within ten
      minutes, «Оказался риелтором»; the late undo says it is too late.
- [ ] The user's own listing: only «Поделиться», «Цена» with the market block below, no «Источник», the panel and its
      footer; never an empty footer (a skeleton while loading, «Это ваше объявление» without the panel).
- [ ] The week chart's labels are unambiguous weekday names and today is on the right.
- [ ] A fill hint opens the form on its field.
- [ ] A status change on the panel updates the dot, the tip and the settings row at once (LB-APP-059).
- [ ] The red dot shows on every tab while requests wait; the tab tip opens «Мои объявления» on the listing with the
      requests (DEV-059); «×» or opening «Отклики» hides both tips for good, also on another device after restore.
- [ ] A swipe on «Отклики» closes only «Отклики».
- [ ] `owner_attention`, `owner_limit_sheet` and `owner_hint_opened` reach the journal once per rule; the screen names
      are `owner/mine`, `owner/requests`, `owner/limit` and, on the user's own listing, `owner/listing`.
- [ ] No legacy brand word on any of these screens.
- [ ] `pnpm -r lint`, `pnpm -r typecheck`, `pnpm -r build`, the unit, component and end-to-end suites are green.
- [ ] Deployed to staging and production and checked inside Telegram on iOS, Android, Desktop and Web once the
      cabinet is on there.

## As built (part 1)

- **Split by the Size rule.** Part 1 passed 3 000 changed lines before the invitations, so the invitations into the
  cabinet, the survey's landlord block, `tg.shareText`, `owner_entry`, `landlord_share` and `e2e/owner-entry.spec.ts`
  follow in a pull request of their own; their checklist lines stay open until then.
- **The seams (step 1).** WP-31's settings screen had only a comment for the owner slot: `SettingsScreen` now takes
  `ownerGroup`, passed by `settings/layout.tsx` through `SettingsServer`. `SettingsRow` documented a `count` it did not
  have: it now draws the red counter, named by its value. WP-80's `stats.daily` was typed `string[]` by Scramble; the
  resource casts each value, the contract says `number[]`.
- **The stub profiles are quiet.** Every `GET /me` fixture now has `owner.pending: 0`, so no other end-to-end spec
  meets the red dot or the tab tip; the scenario `owner_pending` has the two requests of the stub listing `01JF…03`
  (`docs/api/README.md`, WP-80's scenario note).
- **WP-81's kept `/owner/new`.** A second push of `/owner/new` in one launch showed the kept copy with its create sent;
  `OwnerNewRoute` keys each opening on `useRouter().bfcacheId` (`owner-lists.spec.ts` opens it twice).
- **The pending count** is `useOwnerPending()` (`features/owner/pending.ts`) over `useOptionalSession()`, so the tab bar
  reads it also where a test renders it alone; `refresh()` of the session now shares one request between concurrent
  re-reads.
- **«Отклики»** live under the key `owner-requests/<id>`, outside `OWNER_PREFIX`: `invalidateOwner()` after an answer
  does not read page one again over the pages below it; the answer replaces its card and a `409` reloads. Without an
  `IntersectionObserver` the next page loads at once.
- **Texts (for the product owner, three locales):** `own.status.withdrawn` «Снято с публикации», `own.withdrawnNote`
  without the complaints (default 26), `own.confirmDeleteRejected`, `own.rejectedReason.denied` and `.limit`,
  `own.toast.deleted` «Объявление удалили» for a deleted rejected listing. The label tables `ownerStatus`,
  `requestStatus`, `requestWho`, `ownerAnswer` and `rejectedReason` replace any key built from a server value.
- **Days in Tashkent.** «Сдаётся · N дней» counts calendar days in Asia/Tashkent (UTC+5, no daylight saving) from
  `published_at`; «с сегодня» on the day of publication.
- **The panel's footer** draws its first action across the bar and the others side by side under it; with nothing to
  offer it is `MineBar`, so it is never empty. The market delta is shown as «−12 %» in the tone of `price_tone`.
- **The tip store** is `features/owner/signals/tipState.ts` (a file `requestTip.ts` beside `RequestTip.tsx` clashes on a
  case-insensitive disk). The tips leave with WP-39's `tip` leave.
- **The swipe.** `useSwipeBack` ignores a touch inside another `[data-slot="subpage"]` and removes its inline styles
  `SWIPE_BACK_RESET_MS` (300 ms) after a closing swipe; within that time it ignores touches.
- **The e2e harness** forgives «Fetch response has been disposed» on the header mode's `/bff/session` route, as it
  forgave «Test ended»: a disposed answer is one the page no longer waits for.

## Handoff

- Production track: the regular deploy; `OWNER_CABINET_ENABLED` stays unset on the servers (DEC-81), so the group shows
  only for a user with listings, which none has there yet.
- The checklist inside Telegram on staging waits for WP-89 (DEC-88).
