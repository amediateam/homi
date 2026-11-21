# WP-81 — Owner form: place picker, questionnaire, photos, phone, contact mode, publish

| Field | Value |
| ----- | ----- |
| Stage | B |
| Status | REVIEW (#107) |
| Depends on | WP-80, WP-28, WP-36, WP-39 (`RollNumber`, the save phase and the leave helper, *added by the intake of `index-YX9bFVws.js`*) |
| Size | about 3 350 changed lines with tests, L (about 350 of them for legacy release `index-YX9bFVws.js`: the upload ring and its transport, the limit ring, the save phase; if the PR passes 3 000 lines, the upload progress goes into a PR of its own after it) |
| Behaviour reference | `03` SCR-050 … SCR-056, §1.9 (lazy chunks), §3.3 (`owner_place_set`, `owner_place_autofill`, `owner_mascot_tap`), BR-APP-075 … BR-APP-087, BR-APP-113, BR-APP-114, BR-APP-119, BR-APP-120 (since `index-YX9bFVws.js`, with Q-APP-031), BR-APP-093, BR-APP-096, BR-APP-097, LB-APP-054 … LB-APP-058, LB-APP-060 … LB-APP-065, LB-APP-067, LB-APP-068, LB-APP-071; `05` TMA-034, TMA-035, TMA-046, TMA-047; `09` DEV-054 … DEV-058, DEV-061, DEV-062 |
| Needs from the production track | the regular deploy; `CSP_PRIVATE_MEDIA_HOSTS` in the app's env on staging and production (the origin of the private disk's temporary URLs, for a draft's photos); then the manual checks inside Telegram on staging |

## Goal

On stubs an owner creates or resumes a draft, places it on the map, fills the questionnaire with autosave, adds and
orders photos, confirms the phone, chooses the contact mode and publishes, with every outcome of SCR-050 … SCR-056.
The form is one layer over the current tab with its own addresses, so Back, a reload and a launch link land on the
same step. While the server keeps the cabinet switched off (DEC-81) nothing in the app opens the form.

## Scope

**In.** Owned audit items: screens SCR-050 … SCR-056; rules BR-APP-075 … BR-APP-087, BR-APP-096, BR-APP-097 and the
form's half of BR-APP-093 (the `focus` parameter; the panel's half is WP-82); defects LB-APP-054, LB-APP-055,
LB-APP-056, LB-APP-058 (the form's events and screen name), LB-APP-060, LB-APP-061 (the client's half), LB-APP-063
(the client's pre-check), LB-APP-064 (the form's labels), LB-APP-065 (the rejection screen), LB-APP-067 and
LB-APP-068 (LB-APP-071 has nothing to fix in the form: section "Rejection"); the form's limits of LB-APP-057;
Telegram points TMA-034, TMA-035 (the picker), TMA-046 and TMA-047 (the form's close cross); the approved deviations
DEV-054 … DEV-058, DEV-061 and DEV-062.

- The addresses `/owner/new`, `/owner/[id]`, `/owner/[id]/place`, `/owner/[id]/phone`, `/owner/[id]/mode` and
  `/owner/[id]/done` (`25` §3.2): the builders, `matchRoute`, `parentOf`, the shell variant and the layer rules.
- The form layer with its loading, error and limit states, the fallback close of WP-36 and the retry of a lazy chunk.
- The place picker on both map engines with «Найти меня» and the label under the pin from `GET /owner/place`.
- The questionnaire with its couplings, autosave and the «Дальше» gate; photos with upload, order and the undo of
  DEV-057; the demand line and the usual price.
- The phone step: `POST /owner/listings/{id}/phone-request`, the new adapter member `tg.requestContact()`, the poll,
  the bot path below 6.9 and the way back `o_<id>`; the rejection state with the support button.
- The mode step with the preview, publish, and the done step with the celebration; «Готово» for an edit (DEV-062).
- The launches `owner_new`, `owner-new`, `?owner=new` and `o_<id>` in `lib/deeplinks/`.
- The edge-only rule of `useSwipeBack` (the layer marked `data-edge-swipe`).
- The owner dictionary of the pinned release in the `legacy` catalogue layer, and the `homi` texts the form needs.
- The events `owner_place_set`, `owner_place_autofill`, `owner_mascot_tap` and the screen name `owner/form`.
- The Server Actions of the form in `lib/actions/owner.ts`; the form's reads in `serverApi()` and the `/bff`
  allow-list; the owner store that WP-82 extends.

**Out.**

- The settings group «Сдаю квартиру», the limit sheet SCR-049, «Мои объявления», «Отклики», the owner panel, the
  pending count and the request signals: WP-82. The buttons «Мои объявления» of this package lead to the address
  WP-82 builds; this package adds its builder and a placeholder page.
- The seeker's side of an owner listing (request sheet, CTA states, owner chip and info sheet): WP-83.
- The bot's side of the phone: the contact branch inside the phone window and the reply with `startapp=o_<id>`
  (WP-88). The bot's messages about requests and the operators' notice: WP-89.
- Everything on the server: the native owner listings, the place lookup in PostGIS, the photo pipeline, the checks
  at publish and the harvested medians (WP-84). The stubs, fixtures and scenarios this package runs against: WP-80.
- The event transport and `useScreenLayer`: WP-32 (merged before this package; this package only calls `track()`).

## Decisions that bind this package

- DEC-69: the cabinet of `index-CBlEKxdL.js` is in Wave 1 and functional parity (DEC-46) applies; the checklist
  below is the proof for SCR-050 … SCR-056.
- DEC-72: the phone step and the preview show «Ваш номер: …» from `GET /owner/listings/{id}`, the only answer that
  holds the owner's own number. `tg.requestContact()` answers only yes or no; the number reaches the bot, never the
  Mini App, and the client never stores or logs it. The element that shows it carries the `.ph-mask` class of WP-32's
  replay masking, a failed action reaches the error facade of WP-32 as its `UiError` code only, never with its input
  or answer, and no analytics property holds the number.
- DEC-74 (amends DEC-36 for these rows): DEV-054 … DEV-058 and DEV-061 are on without a flag; DEC-80: DEV-062 and
  DEC-84: DEV-063 are on without a flag. None of them gets a `dev…` flag in `lib/flags.ts`.
- DEC-78: the usual price «≈ обычная цена» shows only where `GET /owner/demand` gives both bounds (a harvested
  median exists); sparse at first, and never an error.
- DEC-79: the place lookup answers `{city, district_code}` only. There is no street address: the label under the pin
  is the district and the city from the reference data, and the owner types the landmark.
- DEC-80: every save of a published listing is live at once; the last button of an edit reads «Готово» and closes
  the form without a publish call.
- DEC-81: while `GET /reference` says `owner_enabled: false`, no address of the form opens, an owner launch is
  ignored, and `403 owner_disabled` closes the form with a toast. The server then refuses every create, content
  save, phone request, publish and resume (WP-80), so the form has nothing to do; «Мои объявления», «Отклики» and the
  owner panel stay open for a user who has listings (WP-82), so pausing, «Сдано», «Снять» and the answers work as
  DEC-81 says (the group for a user who has listings: confirmed by the developer on 2026-11-20, answer 15; the
  methods the server refuses: the plan's reading, WP-80).
- DEC-82: the form offers no realtor waitlist in Wave 1; `PUT /owner/waitlist` stays in the contract unused (section
  "Rejection").
- DEC-84: the demand line gives the number from 5 matching radars and «несколько человек» for 1 … 4 (`few`); 0 hides
  it (DEV-063, section "Demand and usual price").
- DEC-87: the line on how the number is kept (`own.phoneKept`) is part of the consent text that the lawyer approves
  before the production switch-on; until then it is marked "pending legal review" (section "Phone").
- DEC-88: the checks inside Telegram of WP-89 run on staging with staff accounts before the legal gate.
- DEC-51: while radars are switched off (`useRadarsEnabled()` of WP-24 is `false`), the demand line and the radar
  sentence of the done step are not shown.
- DEC-56: the support button of DEV-056 opens HOMI's support bot (`supportUrl` of `lib/deeplinks/build.ts`) and is
  hidden while `reference.bot.support_username` is `null`.
- DEC-40 and `25` §2 rule 5: no legacy brand word reaches the screen; every owner text that carries it has a `homi`
  override (section "Texts").
- *Integrator defaults, listed for the reviewer:* default 6 (the ten-minute phone window opened by
  `POST …/phone-request`), default 9 (two listings per account and per phone, ten photos, from `GET /reference`),
  default 16 (the renovation list `renovations.owner`), default 18 (long-term rent only), default 19 (publishing a
  `paused` listing keeps it paused; a `rejected` listing is published again only after the operators release it —
  so the form never sends a publish for a non-draft). New in this specification: (a) the owner dictionary is imported
  from the pinned release by `scripts/import-legacy.mjs`, not written by hand; (b) photos travel through a Server
  Action whose body limit is raised to `'4mb'` — since DEC-92 the transport is open: it must report upload progress
  (`03` Q-APP-031, "Photos" below) — and a photo the client cannot shrink is refused, not sent; (c) an
  owner launch waits behind the first-launch pickers, as legacy's city picker covers the form (`03` SCR-050,
  `inferred`, Q-APP-028); (d) the form takes the `@overlay` slot, so a form opened from the owner panel replaces the
  listing there, and Back opens the listing again; (e) a publish that the server's checks hold for the operators
  (`held` with `hold_reason`, default 26) ends on the done step's «На проверке» form, which never says why (WP-70
  row 45), and the realtor waitlist is not offered (section "Rejection", DEC-82); (f) the place
  label is read with the map's centre rounded to 3 decimals, so the owner's pin trail does not reach the API's logs
  at metre precision (`16` SEC-REQ-052); (g) the phone step shows one line on how the number is kept, with the
  privacy link, and the landmark field the hint that it is public — both texts for the product owner to approve, the
  first also for the lawyer (DEC-87).

Read before coding: `03-api-reference/03-file-conventions/parallel-routes.md` (slots, `default.js`),
`intercepting-routes.md`, `03-api-reference/05-config/01-next-config-js/serverActions.md` (`bodySizeLimit`, default
1 MB) and `cacheComponents.md` beside it ("Navigation with Activity"), `02-guides/forms.md` (Server Actions with
`FormData`) and `02-guides/preserving-ui-state.md`, all under `frontend/app/node_modules/next/dist/docs/01-app/` —
verify in the installed documentation; the Telegram facts below are verified against the Bot API documentation.

## Design

### Routes

| Address | Files under `app/[locale]/(main)/` | Renders |
| ------- | ---------------------------------- | ------- |
| `/owner/new` | `owner/new/page.tsx`, `@overlay/(.)owner/new/page.tsx` | `OwnerNewRoute`: the frame with «Сдать квартиру» and a spinner, `createOwnerListing()`, then `nav.replace` to `/owner/<id>/place?first=1` for a draft without a point, else to `/owner/<id>` |
| `/owner/[id]` | `owner/[id]/layout.tsx` + `page.tsx`, the same under `@overlay/(.)owner/` | layout: `OwnerFormLayer` (the id of its own `params`; a non-ULID id renders nothing in the slot and `notFound()` on a direct load), which holds the questionnaire and `{children}`; `page.tsx` renders `null` |
| `/owner/[id]/place` | `place/page.tsx` under both layouts | `PlacePickerRoute` over the questionnaire; `?first=1` makes it step «where» |
| `/owner/[id]/phone` | `phone/page.tsx` | `PhoneStep` with the rejection state |
| `/owner/[id]/mode` | `mode/page.tsx` | `ModeStep` with the preview |
| `/owner/[id]/done` | `done/page.tsx` | `DoneStep` |
| `/settings/owner` | `settings/owner/page.tsx` | the WP-20 `RoutePlaceholder` until WP-82 |

- Route files hold no logic; both trees import the same components from `features/owner/`.
- The questionnaire is the layout of the `[id]` segment, so it stays mounted under the picker, the phone and the
  mode steps, and Back from a step finds it with its scroll position (legacy restores it by hand, SCR-050 "Back and
  swipe in the cabinet").
- `/owner/limit` (WP-82) is static and `[id]` is dynamic, but they sit in two slots (`@sheet` and `@overlay`), so
  both may match one address; the `[id]` layout of the slot renders nothing for an id that is not a ULID. Verify in
  the installed documentation that the slot then keeps nothing visible.

`lib/navigation/routes.ts` gains:

| Name | Value |
| ---- | ----- |
| builders | `ownerNew()`, `ownerForm(id, q?)` (q: `{ focus }`, WP-82), `ownerPlace(id, q?)` (q: `{ first: 1 }`), `ownerPhone(id)`, `ownerMode(id)`, `ownerDone(id)`, `ownerListings(q?)` |
| `isOwnerId(value)` | a ULID, the test of `isRadarId` |
| `Match` | `{ route: "ownerNew" }`, `{ route: "owner"; id: string; step: "place" \| "phone" \| "mode" \| "done" \| null }`, `{ route: "ownerListings" }` |
| `RESERVED_PARAMS` | `first` joins the list; it is not a layer parameter, so `parentOf` does not strip it |
| `parentOf` | `/owner/new`, `/owner/<id>`, `/owner/<id>/done` and `/owner/<id>/place?first=1` → `/settings`; `/owner/<id>/place`, `/phone`, `/mode` → `/owner/<id>`; `/settings/owner` → `/settings` |
| `screenNameOf` | `ownerNew` and `owner` → `owner/form` for every step; `ownerListings` → `owner/mine` |

`features/shell/shellVariant.ts`: `ownerNew` and `owner` draw `none` on a direct load and are layer addresses
(`isLayerAddress`), so a form opened over a tab keeps that tab's chrome below it; `ownerListings` draws `settings`.

### Layer, slot and Back

- The form is intercepted into the `@overlay` slot of `(main)`, as the listing is. One layer lives in the slot at a
  time: a form opened from the owner panel (WP-82) replaces the listing there, and Back returns to the listing's
  address, where the layer opens again as a new opening with its card from the cache (`ListingLayer` forgets its view
  when it is hidden; verify the hidden route's effects in the installed documentation, `cacheComponents.md`). The form
  is opaque and full-screen, so nothing of the page below shows through.
- `OwnerFormLayer` wraps `RouteOverlay` (WP-23) with `className` raising it to `--z-owner` (46, a new token of
  `@homi/ui`, legacy `owner-shared.css:9-15`); its footer bar is `--z-owner-bar` (47, also the requests overlay of
  WP-82). The picker is portalled at `--z-backdrop` (50), above the form and its footer, below toasts. The layer
  holds `body.listing-open` through `useBodyClass` while it shows, as legacy `OwnerLayer` does.
- `FallbackClose` of WP-36 renders in every state of the layer (loading, error, limit, questionnaire, steps, done)
  and calls `closeOwnerForm()` (TMA-047).
- Steps and Back (SCR-050 "Back and swipe in the cabinet"):

  | Where | Telegram Back | Swipe |
  | ----- | ------------- | ----- |
  | `/owner/new`, loading, error, limit, questionnaire | closes the form (with the photo menu open: closes the menu) | the layer's swipe closes the form |
  | `/owner/<id>/place?first=1` | closes the form | edge-only, closes the form |
  | `/owner/<id>/place` from the questionnaire | closes the picker | edge-only, closes the picker |
  | `/phone`, `/mode`, the rejection state | back to the questionnaire | none |
  | `/done` | closes the form | the layer's swipe closes the form |

- Navigation: «Дальше» pushes `/phone` (or `/mode` when `phone_set`); a confirmed phone replaces `/phone` with `/mode`;
  «Указать вручную» and «Готово» of step «where» replace it with `/owner/<id>`; «Карта» pushes `/place`. A publish
  that succeeds calls `closeThen(routes.ownerDone(id))` of `lib/navigation/closeThen.ts`, so `/done` takes the
  questionnaire's entry and Back from it closes the form.
- `closeOwnerForm()` (`features/owner/closeOwnerForm.ts`): the form remembers the depth at which `/owner/new` or
  `/owner/<id>` first mounted; closing is `backBy(depth() - opened)` of `lib/navigation/history.ts`, and when fewer
  steps were taken (a direct load) `nav.replace(parentOf(…))`. Every Back of the form gives a light haptic.
- «Мои объявления» inside the form (the limit state, a locked listing, the `limit` rejection, the done step):
  `closeOwnerForm()`, then the Settings tab as a tab press (the depth reset of `resetDepth`), then
  `nav.push(routes.ownerListings())` (legacy `App.jsx:815-820`).

### Modules

| Path under `frontend/app/` | Content |
| -------------------------- | ------- |
| `features/owner/store.ts` | `useOwnerEnabled()`; `OWNER_PREFIX` (`owner/`), `ownerListingKey(id)`, `OWNER_LISTINGS_KEY`; `useOwnerListing(id, { initial? })` and `useOwnerListings({ enabled })` on `useResource`; `putOwnerListing(listing)` (seeds the key with an answer); `invalidateOwner()` (`invalidate(OWNER_PREFIX)` plus `refresh()` of `lib/session/bootstrap.ts`, which re-reads `GET /me` and with it `owner`) — the one store WP-82 extends (fix of LB-APP-059) |
| `features/owner/normalize.ts` | total, server-safe readers of the owner listing of WP-80: an unknown status, reason or field reads as neutral, never throws (LB-APP-064) |
| `features/owner/OwnerNewRoute.tsx`, `OwnerFormLayer.tsx`, `OwnerFrame.tsx` | the create-or-resume route; the layer with its states; the full-screen frame with title, subtitle and the scroll shadow |
| `features/owner/closeOwnerForm.ts` | the close path above |
| `features/owner/form/{Questionnaire,PlaceSection,PhotosSection,WhereSection,RoomsSection,PriceSection,TenantsSection,DescriptionSection,FormFooter}.tsx` | the sections of SCR-052 in their order |
| `features/owner/form/NumberTextField.tsx` | the text field of «Площадь» (`inputMode="decimal"`) and «Этаж» (`inputMode="text"`, for «5/9»): `value`, `parse` and `onValueChange` as `PriceInput` of `@homi/ui` has them, the look of `numberFieldClass` |
| `features/owner/form/useAutosave.ts` | dirty fields, the 600 ms timer, one flush at a time, the flush before «Дальше», publish and unmount (BR-APP-079) |
| `features/owner/form/rules.ts` | pure: defaults and couplings (BR-APP-080), the gate (BR-APP-081), the floor rule, the inside-the-rectangle pre-check (`inUzbekistanBox`, lat 37–46, lon 55–74) |
| `features/owner/form/focus.ts` | the `focus` parameter of `/owner/<id>`: scroll its `data-focus` token into the centre and highlight it for 1.6 s, then drop the parameter by `nav.replace` (BR-APP-093) |
| `features/owner/photos/{usePhotos.ts,shrinkPhoto.ts,PhotoGrid.tsx}` | one batch at a time, the shrink, the upload, cover and delete with undo (BR-APP-082, DEV-057) |
| `features/owner/demand/useDemand.ts` | `GET /owner/demand` 500 ms after a change, aborting the previous read (BR-APP-083) |
| `features/owner/place/{PlacePickerRoute,PlacePicker}.tsx`, `place/usePickerMap.ts`, `place/{pickGL,pickLeaflet}.ts`, `place/usePlaceLabel.ts` | the picker: the one owner of its map container on the session's engine (the pattern of `features/listing/spot/useSpotMap.ts`), the fixed pin, the label, «Найти меня» through `useLocate` of `features/map/useLocate.ts`, `MapAttribution` |
| `features/owner/place/applyPlace.ts` | the fill after «Готово» with its undo toast (BR-APP-078) |
| `features/owner/steps/{PhoneStep,RejectionState,ModeStep,ListingPreview,DoneStep,Celebration}.tsx` | SCR-053 … SCR-056 |
| `features/owner/steps/usePhonePoll.ts` | the poll of BR-APP-084 |
| `features/owner/useOwnerOffRedirect.ts` | the switched-off rule of DEC-81 (the pattern of `features/radars/useRadarsOffRedirect.ts`) |
| `features/owner/events.ts` | the three events with their throttles |
| `lib/actions/owner.ts` | Server Actions, one input object, `(input, auth?, locale?)` → `ActionResult<T>` |
| `lib/telegram/contact.ts` | `requestContact(): Promise<boolean \| null>` |

### Data and actions

Reads, in `serverApi()` of `lib/api/server.ts` and in `BFF_READS` of `lib/api/bffAllowList.ts` (`readTemplate` gains
the ULID template `owner/listings/:id`): `ownerListings()` → `GET /owner/listings`, `ownerListing(id)` →
`GET /owner/listings/{id}`, `ownerPlace(query)` → `GET /owner/place?lat=&lon=`, `ownerDemand(query)` →
`GET /owner/demand?city=&district=&rooms=&room=&price=&currency=`. The form reads its listing on the server with the
cookie when it can (`OwnerFormLayer` gets `initial`), else through `/bff`, as every screen of WP-22.

Server Actions in the new `lib/actions/owner.ts`, each over `runAction` of `lib/actions/run.ts`; an input that fails
its check makes no request:

| Action | Method |
| ------ | ------ |
| `createOwnerListing()` | `POST /owner/listings` — the caller's untouched draft when one exists (DEV-054) |
| `updateOwnerListing({ id, fields })` | `PATCH /owner/listings/{id}` — changed fields only, `null` clears |
| `uploadOwnerPhoto(form: FormData)` | `POST /owner/listings/{id}/photos`, multipart `file`; `id` is a field of the form data. Since DEC-92 replaced by a transport that reports progress (Q-APP-031, "Photos") |
| `deleteOwnerPhoto({ id, photo })` | `DELETE /owner/listings/{id}/photos/{photo}` |
| `orderOwnerPhotos({ id, ids })` | `PUT /owner/listings/{id}/photos/order` — the full order, the cover first |
| `setContactMode({ id, mode })` | `PUT /owner/listings/{id}/contact-mode`, `mode` `request` or `phone` |
| `requestOwnerPhone({ id })` | `POST /owner/listings/{id}/phone-request` |
| `publishOwnerListing({ id })` | `POST /owner/listings/{id}/publish` |

Every answer that is an owner listing goes into the store by `putOwnerListing`, and every successful mutation calls
`invalidateOwner()`, so the list and the pending count of WP-82 are never stale (fix of LB-APP-059).

`frontend/app/next.config.ts`: `experimental.serverActions.bodySizeLimit` is `'4mb'` if the photos stay on a Server
Action; with the transport that reports progress (DEC-92, "Photos") the limit is that route's own. A shrunk photo (long side
≤ 2048 px, JPEG quality 0.88) stays well under it; `proxyClientMaxBodySize` keeps its default of 10 MB. The media
codes `unsupported_mime`, `too_large`, `too_big` and `undecodable` of the contract still name what the server
refused.

Error codes the form reads (WP-80; the client never parses a legacy `detail`): `403 owner_disabled`;
`409 owner_limit` (`limit` `account` or `phone`, `max`); `409 owner_listing_locked`; `409 owner_phone_required`;
`409 owner_rejected` (`reason` `denied` or `limit`, default 32); `409 owner_photo_limit`; `422 validation_failed` with
`errors` per field.

### Telegram: `requestContact` (TMA-034)

- `lib/telegram/gates.ts`: `requestContact: "6.9"` joins `GATES`.
- `lib/telegram/contact.ts`: `requestContact()` resolves `null` outside Telegram, below 6.9 or without the method;
  else it calls `WebApp.requestContact(callback)` and resolves `true` or `false` with the first callback argument. A
  second argument, if the client passes one, is dropped unread (verify against the Bot API documentation what it
  holds): the number reaches HOMI only through the bot (WP-88).
- `lib/telegram/index.ts`: `tg.requestContact` joins the facade; the header's list of absences drops TMA-034.
  `tg.haptic` gains `warning()` (`notificationOccurred("warning")`), which the picker and the gate need.
- `@homi/testing`: the fake Telegram gains `requestContact(callback)` gated at 6.9 and the answer `contact` in
  `FakeTelegramAnswers`, next to `writeAccess`.

### Launch links (TMA-046, LB-APP-060)

- `lib/deeplinks/parse.ts`: `Launch` gains `owner: { kind: "new" } | { kind: "phone"; id: string } | null`.
  `start_param` `owner_new` or `owner-new`, or the page query `owner=new`, give `new`; `start_param` `o_<ULID>` gives
  `phone` with that id. A listing link wins over both. `entry` stays `menu` for an owner launch: the launch source of
  LB-APP-058 is reproduced, not fixed.
- `lib/deeplinks/launch.ts`: `launchTarget()` returns `routes.ownerNew()` or `routes.ownerPhone(id)` for an owner
  launch. `launchPending()` stays true only for a listing or news target, so the language and city pickers of the
  first launch come first and the form opens after them (default (c)). The once-per-launch mark of WP-36 covers the
  owner targets too: its digest takes the target address instead of the number.
- `features/shell/LaunchRedirector.tsx`: an owner target is pushed from the feed like a listing, and dropped while
  `useReference().ownerEnabled` is not `true` (DEC-81).
- `o_<id>` opens the phone step of that draft (`/owner/<id>/phone`, pushed after `/owner/<id>`), so the owner who
  shared the number in the bot below 6.9 comes back to the same draft (fix of LB-APP-060; the bot's button is WP-88's).

### Swipe from the edge

`frontend/packages/ui/src/hooks/useSwipeBack.ts` gains the option `edgeOnly`: the swipe starts only within the left
24 px of the layer, ignores `SWIPE_BACK_EXCLUDED` (the map container takes every other touch), and the hook marks
the layer `data-edge-swipe`. The constant `SWIPE_BACK_EDGE_PX` (24) is exported. The picker passes it; nothing else
changes for the other callers. The rule that a touch inside a nested sub-page is not the layer's is WP-82's.

### Texts

- `frontend/packages/i18n/scripts/import-legacy.mjs` gains a second source, the owner dictionary of the pinned
  release (`demo/app/src/features/owner/owner.js`, about 207 keys per locale), read from a copy with
  `--owner <file>` as the locale files are; its keys keep their legacy names in the `legacy` layer. Step 1 checks the
  file's shape (one object per locale, plural entries as in the main dictionary) and stops on a key that the main
  dictionary already holds with another value; the import report lists the keys and the brand matches.
- `homi` overrides, ru/uz/en, for every owner text that carries the brand (the catalogue test of `brand-words.json`
  refuses the rest): the import of the pin names six keys per locale — `own.mode.gate` «Через HOMI», `own.phoneHow`,
  `own.doneText`, `own.verified` «Проверенный хозяин · разместил сам в HOMI», `own.mineEmpty` and `own.listedDays`
  «В HOMI {days}» (*as built: `own.subtitle` «Бесплатно. Риелторы ваш номер не увидят.» carries no brand word and
  keeps the legacy text*).
- New `homi` texts, for the product owner to approve: `own.doneTextNoRadar` «Квартира в ленте HOMI.» (radars off),
  `own.photoDeleted` «Фото удалили» (DEV-057), `own.cityChanged` «Район и точку сбросили» (DEV-058),
  `own.disabled` «Сдать квартиру пока нельзя» (DEC-81), `own.photoUnreadable` «Это фото не открылось — выберите
  другое» (the refused shrink), `own.support` «Написать в поддержку» (DEV-056), `own.edit.done` «Готово»
  (DEV-062), `own.review.title` and `own.review.text` (the held publish), `own.phoneKept` (the phone step; "pending
  legal review", DEC-87), `own.landmarkHint` (the landmark field) and `own.demandFew` «Сейчас такую ищут несколько
  человек с радаром» (DEC-84, DEV-063; the developer's words are «несколько человек»).
- Texts built from server values (`own.need.*`, the rejection reasons, `phone_error`) are read through `labelFor` of
  `@homi/i18n` with the new label tables `ownerNeed`, `ownerReject` and `phoneError` (WP-82 adds the tables of the
  statuses and the requests); an unknown value reads `fallback.other` and reports once (fix of LB-APP-064). The
  limits in the texts come from `GET /reference` (`limits.owner_listings`, `limits.owner_photos`; LB-APP-057).

### Cabinet switched off (DEC-81)

`useOwnerEnabled()` (`features/owner/store.ts`) is `useReference().ownerEnabled`, a new field of the view of
`lib/reference/useReference.ts` beside `radarsEnabled` (`owner_enabled === true` of the reference data). While it is
`false`:

| Place | Behaviour |
| ----- | --------- |
| `/owner/new`, `/owner/<id>` and its steps | loaded directly or by a stale link: `useOwnerOffRedirect()` makes one `nav.replace(routes.settings())` once the reference data is there, and nothing of the form is shown; no owner request is sent |
| `owner_new`, `owner-new`, `?owner=new`, `o_<id>` | `LaunchRedirector` drops the target |
| `403 owner_disabled` (create, every content save — the autosave's `PATCH`, a photo upload, delete or order, the contact mode —, the phone request, publish; the reference is cached for about ten minutes) | the toast `own.disabled`, then `closeOwnerForm()`; a save the toast interrupts stays dirty and is not retried |

The settings group that offers the form is WP-82's and is hidden by the same hook for a user without owner listings.
Listings that already exist when the switch goes off (staging after WP-89's checks, or production when the switch
is unset again, WP-89 "Switching the cabinet on") keep every action DEC-81 names: «Мои объявления»
(`/settings/owner`), «Отклики» and the owner panel (SCR-059) are not closed by the switch (WP-82); only `/owner/new`
and the form's addresses are, since the server refuses creating, every content edit, the phone request, publish and
resume while it is off (WP-80). The developer confirmed this reading of DEC-81 on 2026-11-20 (answer 15): the group
stays, with «Мои объявления» alone, for an owner who has listings.

### Analytics (`03` §3.3, LB-APP-058)

`lib/analytics/events.ts` gains three rows of `JournalEvents` and `JOURNAL_EVENTS`: `owner_place_set: { source:
"map" | "locate" | "manual" }`, `owner_place_autofill: { result: "applied" | "reverted" }`, `owner_mascot_tap:
Empty`. The screen name of every form address is `owner/form`; the top layer's address decides, so a form opened
from the owner panel reports `owner/form`, not `listing` (fix of LB-APP-058; legacy reported `listing`).

## Files

New, under `frontend/app/`:

- The modules of the table in "Design" and the route files of "Routes" in both trees.
- `tests/owner/{rules,normalize,autosave,photos,shrinkPhoto,demand,applyPlace,phonePoll,closeOwnerForm,events}.test.ts`,
  `tests/owner/{OwnerFormLayer,Questionnaire,PlacePicker,PhoneStep,RejectionState,ModeStep,DoneStep}.test.tsx`,
  `tests/actions/owner.test.ts`, `tests/telegram/contact.test.ts`, `tests/deeplinks/owner.test.ts`.
- End to end: `e2e/owner-form.spec.ts`, `e2e/owner-picker.spec.ts`, `e2e/owner-phone.spec.ts`,
  `e2e/owner-off.spec.ts` (tag `@owner-off`).

Changed:

- `lib/navigation/routes.ts`, `features/shell/shellVariant.ts`, `features/shell/LaunchRedirector.tsx`,
  `lib/deeplinks/{parse,launch}.ts`, `lib/telegram/{gates,index}.ts`, `lib/telegram/haptics.ts`, `lib/api/server.ts`,
  `lib/api/bffAllowList.ts`, `lib/analytics/events.ts`, `lib/reference/useReference.ts` (`ownerEnabled`),
  `lib/security/csp.ts` (`CSP_PRIVATE_MEDIA_HOSTS`) and `tests/security/csp.test.ts`, `next.config.ts`.
- `frontend/packages/ui`: `src/hooks/useSwipeBack.ts` (`edgeOnly`), `src/styles/theme.css` (`--z-owner`,
  `--z-owner-bar`), the icons the form needs (house, camera, image-plus, star, trash, shield, locate).
- `frontend/packages/i18n`: `scripts/import-legacy.mjs`, `messages/legacy/*` (regenerated, never edited by hand),
  `messages/homi/{ru,uz,en}.json`, `src/labels.ts`, `tests/{import,catalogue,labels}.test.ts`.
- `frontend/packages/testing/src/fakeTelegram.ts` and its test.
- Shared files, announced in the PR: `frontend/playwright.config.ts` (the tag `@owner-off` joins `@radars-off` in the
  second run), `.github/workflows/frontend-e2e.yml` (the first API runs with `OWNER_CABINET_ENABLED: 'true'`, the
  second keeps it unset) and `frontend/app/.env.example` (`CSP_PRIVATE_MEDIA_HOSTS`).

## Steps

1. Read the Next.js files named above. Check three seams and note the result in the PR: the owner types of
   `@homi/types` after WP-80 (listing, form, photo, error codes); the shape of the owner dictionary at the pin; how
   `useSpotMap` owns its container, so the picker follows it.
2. The import of the owner dictionary; the `homi` overrides and new texts; the label tables; catalogue tests green.
3. `routes.ts` (builders, matcher, `parentOf`, names, `first`), `shellVariant.ts`; unit tests of every address.
4. `lib/telegram/contact.ts`, the gate, the facade, `haptic.warning()`, the fake; unit tests per version.
5. `lib/actions/owner.ts` and the reads; the allow-list with the ULID template; tests of both session modes.
6. `features/owner/store.ts`, `normalize.ts`, `useOwnerOffRedirect.ts`; the route files with `OwnerNewRoute` and
   `OwnerFormLayer` (loading, error with retry, limit, the cross, the chunk retry).
7. The questionnaire: sections, `rules.ts`, `useAutosave.ts`, the footer notes, the highlights, `focus.ts`.
8. Photos: `shrinkPhoto.ts`, `usePhotos.ts`, the grid and its menu, the undo; `next.config.ts`; the private media
   host in `img-src` (`CSP_PRIVATE_MEDIA_HOSTS`, `lib/security/csp.ts` and its test).
9. The picker on GL and on Leaflet with `edgeOnly`; the label; «Найти меня»; `applyPlace.ts` with its toast.
10. Demand and the usual price.
11. The phone step, the poll, the old-client path, the rejection state, the support button.
12. The mode step and the preview; publish with every error; the done step and the celebration; «Готово» of an edit.
13. Launch links and `LaunchRedirector`; the switched-off rule; the events.
14. Component tests; Playwright specs in both session modes; the `@owner-off` run in the config and the workflow.
15. Run the checklist in three locales and two themes on a local stack with the cabinet on; update the queue.

## Behaviour to reproduce

### Entry and the new draft (SCR-050, BR-APP-075, DEV-054)

- The form opens on `/owner/new` from the settings row and «Сдать ещё одну» (WP-82) and from an owner launch. It
  sends `createOwnerListing()` once; the answer is a new draft or the caller's untouched draft (DEV-054), so backing
  out of the first map step leaves no new empty draft behind.
- While it waits: the frame with «Сдать квартиру» (`own.title`) and a spinner; Back and the swipe close it.
- `409 owner_limit`: the limit state, the title «Уже две квартиры» with the number from `max`, the text
  `own.limitText` and «Мои объявления». Any other failure: a tall `ErrorState` with «Повторить», which posts again.
- A draft without a point starts at step «where»; everything else starts at the questionnaire. A new draft also
  reads `GET /owner/listings` once, for «С возвращением! Вы уже размещали у нас квартир: {n}» (BR-APP-095: `past > 0`
  and no `active`, `paused` or `draft` listing besides the open draft).
- A loaded listing that is not a draft opens as an edit: the title `own.editTitle` «Изменить объявление».
- A `rejected` listing opens on the phone step in its rejection state (BR-APP-085).

### Place picker (SCR-051, BR-APP-076 … BR-APP-078, BR-APP-097, DEV-061)

- A full-screen map with a fixed pin (house glyph, lifted while the map moves, a centre dot), the label under the
  pin, the round «Найти меня», a glass panel with «Где квартира?» (`own.whereTitle`), the hint `own.pickHint`, the
  primary «Готово» (disabled until the map is mounted) and «Указать вручную» (step «where») or «Отмена» (from the
  questionnaire), and the attribution of `MapAttribution`.
- Start view: a saved point at zoom 17; else the centre of the form's city, or of the first city of the reference
  data, at that city's `zoom + 1` (12 when it has none). No `map-start` call exists (DEV-061). After «Найти меня» the
  view flies to the user's position.
- Engine: the session's engine (`currentEngine()` of `features/map/engine.ts`); a GL failure calls `markGlFailed`
  and the picker continues on Leaflet; both failing leaves «Готово» disabled and shows `own.pickFailed` instead of a
  blank map. GL without rotation, pitch, keyboard or world copies, pixel ratio 1 in lite graphics, else at most 2; a
  tap eases the centre to the tapped point in 300 ms. Leaflet with `zoomSnap: 0.25` and the basemap of `useBasemap`.
- The label (BR-APP-077, DEC-79): `GET /owner/place` 400 ms after each stop of the map, aborting the previous read,
  only inside the rectangle (`inUzbekistanBox`); outside it the label is `own.pickNoAddr` at once. «…» while the read
  runs; then the district and the city of the answer by their reference names («Юнусабадский · Ташкент»), else the
  city, else `own.pickNoAddr`. A failed read gives `own.pickNoAddr`. The read sends only the map's centre, rounded to
  3 decimals (about 100 m, enough for a district; default (f)); the position of «Найти меня» stays on the page
  (`useLocate`), and only the centre it leads to is read. The point saved by «Готово» keeps 5 decimals.
- «Найти меня» (BR-APP-097, TMA-035): only when `tg.location.available()`; light haptic; denied or failed → warning
  haptic and `own.pickDenied` / `own.pickFailed`; outside the rectangle → `own.pickFarMe`; an accuracy worse than
  100 m → `own.pickRough`; otherwise the "me" dot with its circle and a flight to zoom 17, never zooming out.
- «Готово»: outside the rectangle → warning haptic and `own.pickOutside`; else medium haptic, the point rounded to 5
  decimals is saved through autosave, `owner_place_set` is sent with `source` `locate` when «Найти меня» succeeded
  before the confirmation, else `map`, and the place is filled (BR-APP-078): `GET /owner/place` again without abort;
  the answer is dropped when the point changed meanwhile or the read failed, and a city the reference data does not
  know is ignored. Empty fields (city, district) are filled silently and `own.placeNote` shows; fields that hold
  another value are replaced with the toast «Адрес обновили по карте» and «Вернуть» (`TOAST_ACTION_MS`), which
  restores them. When the district and the landmark were both empty before, the city counts as empty too.
  `owner_place_autofill` is sent with `applied` when a fill changed a field, `reverted` on «Вернуть».
- «Указать вручную»: light haptic, `owner_place_set {source: "manual"}`, no point, the questionnaire.
- A point the server refuses (`422` with `errors.point`, the server's own check of WP-84; LB-APP-063) shows
  `own.pointOutside` under the address field.

### Questionnaire (SCR-052, BR-APP-079 … BR-APP-081, DEV-058)

- Title «Сдать квартиру» or «Изменить объявление»; subtitle `own.subtitle` (the legacy text, no brand word).
- Sections in this order: the welcome line; the place (the spot preview with the circle of `shown_point` when the
  form's point equals the saved one, with `own.mapNote`; the field «Адрес или ориентир», at most 120 characters,
  with the hint `own.landmarkHint` «Видно всем — без номера дома и квартиры» (default (g)) and «Карта» when there is
  no preview); photos «Фото {n} из {max}»; city chips (only with more than one city) and district chips, which
  toggle; rooms 1, 2, 3, 4, «5+» and the wide «Комната», with «Площадь» (decimal, a comma works) and «Этаж» («5/9»
  also fills «Этажей») through `NumberTextField` of this package (`features/owner/form/NumberTextField.tsx`: a text
  field with `numberFieldClass` of `@homi/ui` that keeps the text as typed; the decimal and «a/b» parsing are in
  `rules.ts`), and «Этажей» through `IntInput` of `@homi/ui` (`IntInput` drops every non-digit as it is typed, so
  «45,5» would become 455 and «5/9» 59); the price «В месяц»
  (digits only, at most 12, grouped, `PriceInput`), the currency «$» / «сум» (USD by default), the usual price,
  renovation chips from `renovations.owner`, furniture «С мебелью» / «Без мебели» (three states); «Кому сдаёте» with
  «Семьям», «Студентам», «Девушкам», «Парням», «Иностранцам» and its hint; pets (three states); the description of
  at most 600 characters with `own.descriptionHint` «{n} из {max}. Номер здесь не пишите — мы его скроем.» and the
  limit ring of legacy release `index-YX9bFVws.js` (`03` BR-APP-120): absent while the field is empty, the share
  `n / 600` drawn as a ring, `near` (the warning colour) from 90 %, `full` (the error colour) at 600; a keystroke
  that would pass 600 with a collapsed selection shakes the ring for 0.32 s (±3 px; none under reduced motion)
  (*added by the intake of `index-YX9bFVws.js`*).
- Couplings (BR-APP-080): a draft without a city gets the profile's city (`me.city`); a typed price sets the
  currency; `room` and `rooms` exclude each other; numbers are above 0; fields hold at most 6 characters (7 for the
  floor). DEV-058: clearing the address text keeps the point; another city clears the district and the point and
  shows the toast `own.cityChanged` with «Вернуть», which restores them.
- Autosave (BR-APP-079): every edit marks its fields dirty and restarts 600 ms; flushes run one at a time and also
  before «Дальше», before publish and when the form unmounts; the body holds the dirty fields, cleared ones as
  `null`; while the floor is above the number of floors those two are held back. `409 owner_listing_locked` →
  `own.notEditable` and «Мои объявления»; offline → `own.editOffline`; `422 validation_failed` highlights the fields
  of `errors` (`floor` both floor fields, `point` both coordinates), re-sends the rest in a separate `PATCH`, and the
  failed fields stay dirty; editing a field removes its highlight. A published listing's save is live (DEC-80).
- Footer: the first note that applies — «Заполните: {what}» after a refused «Дальше», `own.floorBad`, the save-failed
  text, the demand line — then «Мои объявления» when locked, then «Дальше: подтвердить номер», or «Дальше» when
  `phone_set`, disabled while busy or uploading.
- «Дальше» (BR-APP-081): required a city, a place (district, landmark or point), rooms or «Комната», a price with
  its currency, at least one photo and a floor not above the floors. Missing → highlights, the note with only the
  missing `own.need.*` items and the warning haptic; then a flush (failure: error haptic and the save-failed text);
  then the phone step, or the mode step when `phone_set`. Medium haptic on the tap.
- `?focus=` (BR-APP-093, set by WP-82's fill hints): `photos`, `area_m2`, `floor`, `renovation`, `description` scroll
  that element into the centre and highlight it for 1.6 s; the parameter leaves the address by `nav.replace`.
  Legacy's sessionStorage key `kv-own-focus` is not used.

### Photos (BR-APP-082, DEV-057, LB-APP-061)

- A grid in which the first photo carries «Обложка»; a tap opens a mini menu «Сделать обложкой» (from the second
  photo on) and «Удалить фото»; while uploading, tiles with the progress ring of "Upload progress" below (DEC-92); the add tile (camera when empty, image-plus otherwise),
  hidden while uploading and at the photo limit; a hidden file input (`accept="image/*"`, `multiple`); an error line;
  `own.photosTip` with more than one photo. Thumbnails are `thumbUrl()` of `features/feed/images.ts`. A draft's
  photos load from temporary URLs of the private disk (WP-80, WP-84: the API host locally, the S3 endpoint of the
  private bucket on staging and production), which `img-src` of `lib/security/csp.ts` does not list today (`'self'`,
  `data:`, `blob:`, the CDN host and the tile hosts): `cspFromEnv` gains the host list `CSP_PRIVATE_MEDIA_HOSTS`,
  parsed by `parseHosts` like `CSP_TILE_HOSTS`, joined to `img-src` only, and `frontend/app/.env.example` documents
  it; the production track sets it on staging and production, and the photos of a draft are checked inside Telegram
  on staging.
- At most `limits.owner_photos` (10); a larger selection is cut and «Не больше 10 фото.» shows. One batch at a time,
  files one by one: shrunk to a long side of at most 2048 px, JPEG quality 0.88, sent as `file` named `photo.jpg`
  through the upload of "Upload progress" (the transport of Q-APP-031) with a 90 s limit. A file the browser cannot shrink is not sent: `own.photoUnreadable`
  and the batch goes on (fix of LB-APP-061's client half; the server re-encodes every upload, WP-84).
  `409 owner_photo_limit` stops the batch; `unsupported_mime`, `too_large`, `too_big`, `undecodable` show their
  message and the batch goes on.
- Upload progress (DEC-92, `03` BR-APP-119; *added by the intake of `index-YX9bFVws.js`*). Each uploading tile
  shows a ring with the percent, eased toward the real progress (`1 − e^(−dt / 0.25 s)` per frame, a frame step of
  at most 50 ms, snapped below 0.002), the percent only between 0.5 % and 99.5 %; from 99.5 % the ring pulses (1.6 s,
  to opacity 0.45) while the answer is awaited; a queued file shows a grey ring at half opacity. A photo id absent
  before the upload carries a green tick for 1.5 s (`--ease-pop`; hidden under reduced motion, which also jumps the
  ring to its target). Errors: a network failure and the 90 s timeout show `own.photoFailed`, and so does a 2xx
  answer without JSON. The «N из 10» of `own.photosHint` rolls (`RollNumber` of WP-39, BR-APP-113).
  - The transport (`03` Q-APP-031): the browser reports upload progress only to `XMLHttpRequest`
    (`upload.onprogress`); React calls a Server Action through `fetch`, and Next's guide of Server Actions documents
    no upload progress (`node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md`). The
    integrator's recommendation: an `XMLHttpRequest` to a `/bff` route allow-listed for this one write
    (`POST /bff/owner/listings/{id}/photos`), which forwards the multipart body with the session's token as the
    other `/bff` calls do, so cookie mode and header mode both work; it changes WP-22's rule that `/bff` passes reads
    only, for this method — and `25` §3.5's ("`/bff` for reads, Server Actions for every mutation"), which the
    package amends with it (rule 6) — and the size limit becomes the route's own (4 MB) instead of `bodySizeLimit`. A request
    straight to the API works only in header mode (the cookie session holds no token the browser can send). The
    package decides with the reviewer and records the choice here.
- «Сделать обложкой» sends the full order with that id first. «Удалить фото» hides the photo at once and shows
  `own.photoDeleted` with «Вернуть» for 6 s; the delete is sent when the toast ends or the form unmounts, not before;
  «Вернуть» shows it again and sends nothing (DEV-057).
- Haptics: light on taps and photo actions; error on a failed upload or action.

### Demand and usual price (BR-APP-083, DEC-78, DEC-51)

- `GET /owner/demand` 500 ms after a change of city, district, rooms, room, price or currency, aborting the previous
  read, never without a city; errors are silent.
- The demand line in the footer and on the done step while radars are on (DEC-84, DEV-063): «Сейчас такую ищут {n}
  человек с радаром» when `count` is a number above 0 (the server gives one only from 5), `own.demandFew` «Сейчас
  такую ищут несколько человек с радаром» when `few` is `true`; none when `count` is 0.
- «≈ обычная цена: {range} — {what}, {place}» when both `usual_low_usd` and `usual_high_usd` are set and a rooms
  choice exists; in a UZS form the range is in millions through `reference.rates.usd_uzs` (`money.mln`), else
  «$low–high». Without a harvested median the line is absent.

### Phone (SCR-053, BR-APP-084, TMA-034, LB-APP-060)

- A card with a shield, `own.phoneText` and `own.phoneHow` (`homi` override: the number goes to HOMI's bot); while
  waiting «Ждём номер от Telegram…»; an inline error for `phone_error` `not_uz` or `not_own`; the denied text; when
  late, timed out or on an old client the block `own.phoneLate` / `own.phoneOldTg` with «Открыть бот»
  (`botStartUrl("owner_phone")` of `lib/deeplinks/build.ts`, that is `https://t.me/<bot>?start=owner_phone`, the
  payload WP-88 answers with the share keyboard; hidden when it is `null`, that is without
  `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`, which `brand.botUsername` reads). «Поделиться номером» is always enabled; a
  new tap starts a new attempt. Above it one line, `own.phoneKept` «Номер хранится в HOMI и виден только тем, кому вы
  его дадите.» with «Политика конфиденциальности» linked to `brand.links.privacy` of the locale (the link hidden while
  it is `null`; default (g)). A change of this line raises `owner.consent_version` in the same PR (WP-84,
  "Configuration"). The line is part of the consent text of DEC-87: marked "pending legal review" until the lawyer
  approves it, and the production switch-on waits for the approved text (`25` §5 gate 1).
- A tap: medium haptic, `requestOwnerPhone({ id })` (opens the window of default 6), then `tg.requestContact()`.
  `null` (below 6.9) → the old-client text, and polling starts anyway; `false` → the denied text; `true` → polling.
- Polling (`usePhonePoll`): `GET /owner/listings/{id}` at once, then every 1.5 s without overlap, for up to 90 s, and
  at once on `tg.onVisible`; after 20 s the late hint; after 90 s it stops and restarts on the next return. It ends on
  `phone_set` (success haptic, `/phone` replaced by `/mode`), on `status: "rejected"` (error haptic, the rejection
  state) or on `phone_error`; a `phone_error` equal to the one shown before the tap is ignored for 8 s as stale. A
  failed poll retries on the next tick. `409 owner_phone_required` from publish leads here.

### Rejection (SCR-054, BR-APP-085, DEV-056)

- «Не получилось» and one paragraph by `reject_reason` (default 32): `denied` (the operators' deny list) with legacy's
  `fraud` text, and `limit` with legacy's text and «Мои объявления»; an unknown value reads as `denied`. HOMI's
  automatic realtor check and the report votes never reject: they hold the listing for the operators, who release,
  withdraw or deny it (default 26, WP-84), and the form then shows «На проверке» (section "Done"), never why — no
  screen of the form repeats legacy's `agent` text «…так бывает у риелторов» (WP-70 row 45).
- DEV-056: the support button `own.support` (hidden without a support bot, DEC-56) on every reason. `phone_error`
  (`not_uz`, `not_own`) is an inline error of the phone step and never this state.
- The realtor waitlist that legacy offered under its `agent` text («Сообщите, когда откроете вход для риелторов»,
  API-050, LB-APP-071) is not offered: HOMI rejects nobody as a realtor (default 26), and offering it after `denied`
  or `limit` would tell the owner what HOMI suspects. The form builds no waitlist action; `PUT /owner/waitlist` and
  `me.owner.waitlisted` stay in the contract (WP-80), and LB-APP-071 has nothing to fix here (DEC-82: whether and
  where to offer a waitlist is decided later).
- `409 owner_rejected` from publish re-reads the listing; the server's rejected copy is used, else the listing is
  marked rejected locally with the answer's `reason`; then this state shows. Back returns to the questionnaire.

### Contact mode and preview (SCR-055, BR-APP-086, DEV-055)

- «Как с вами связываться?»: «Через HOMI» (`request`), tagged «Советуем», with `own.mode.gateText`, and «Показывать
  номер» (`phone`) with `own.mode.openText`. A new listing has `request` selected (DEV-055); a tap on the other mode
  changes it at once (light haptic), sends `setContactMode`, the answer replaces the listing; an error restores the
  previous mode with the error haptic and a footer error; a tap on the current mode does nothing.
- «Так увидят люди»: the cover's small variant (or a placeholder), the price with «/мес», «rooms · district or
  landmark», area and «floor из total», `own.verified`; below it «Ваш номер: {phone}» from `phone_display`.
- Footer: an error note, «Мои объявления» when the error offers it, and «Опубликовать» for a draft or «Готово»
  (`own.edit.done`) for any other listing (DEV-062). While busy the button is WP-39's save button in its busy phase
  (the 48 px circle with a spinner) for every publish; only «Готово» of an edit goes on to the tick (`03` BR-APP-114;
  *added by the intake of `index-YX9bFVws.js`*).

### Publish (BR-APP-087, DEV-062)

- One at a time; first a flush (failure: back to the questionnaire with the save-failed text).
- A draft: `publishOwnerListing({ id })`. Success → a celebration (BR-APP-096), `invalidateOwner()`, then the done step
  through `closeThen`; an answer with `status: paused`, `held: true` and a `hold_reason` (the checks held it for the
  operators, default 26) has no celebration and opens the done step in its «На проверке» form; the client never
  shows `hold_reason`. `409 owner_limit` → `own.limitText` and «Мои объявления»; `409 owner_listing_locked` →
  `own.notEditable` and «Мои объявления»; `409 owner_rejected` → the rejection state; `409 owner_phone_required` → the
  phone step; `422 validation_failed` → the questionnaire with the highlights (the save-failed text when the client
  sees nothing missing); offline → `own.publishOffline`; anything else → `own.publishFailed`.
- Any other listing (DEV-062, DEC-80): «Готово» flushes, plays the success haptic, goes through the save phase of
  WP-39 (spinner, then the tick for 900 ms, 250 ms under reduced motion; `03` BR-APP-114, legacy since
  `index-YX9bFVws.js`, which does it only for an edit) and shows the done step in its edit form; no publish call is sent, so a `paused` listing stays paused (default 19).

### Done (SCR-056, BR-APP-096)

- A new listing: 12 confetti pieces (1.1 s on `--ease-out` since `index-YX9bFVws.js`) staggered by 25 ms and HOMI's mascot button (the art is HOMI's, DEC-40); the
  success haptic, a heavy impact at 260 ms and a medium one at 420 ms. A mascot tap repeats both at most once per
  800 ms and sends `owner_mascot_tap` at most once per 30 000 ms. Lite graphics and reduced motion show the confetti
  still. Then `own.doneText` (or `own.doneTextNoRadar` with radars off), the demand line (section "Demand and usual
  price"), and
  `own.doneNext` «Отклики придут в бот. Ответить можно там или в «Мои объявления».»
- An edit: «Сохранили» and «Объявление обновлено.»; confetti only after a mascot tap.
- A held publish (default 26, default (e)): no confetti and no haptic pattern; the title `own.review.title` «На
  проверке» and `own.review.text` «Объявление проверяем — пока его не видно в ленте. Как только проверим, оно
  появится само.»; no demand line, no reason and nothing about realtors (WP-70 row 45).
- Footer «Мои объявления» and «Готово»; «Готово», Back and the swipe close the form.

### Defects fixed here

| # | Defect | Short name | Here |
| - | ------ | ---------- | ---- |
| 1 | LB-APP-054 | a new draft on every entry | DEV-054: the server answers the untouched draft; the client sends one create per opening |
| 2 | LB-APP-055 | «Сохранить изменения» after live saves | DEV-062: «Готово» |
| 3 | LB-APP-056 | publish without a mode | DEV-055: `request` preselected |
| 4 | LB-APP-057 | limits in the texts | `{max}` and the photo cap from `GET /reference` |
| 5 | LB-APP-058 | no funnel events | three events, `owner/form` that wins over the listing |
| 6 | LB-APP-060 | the old-client path cannot come back | `o_<id>` opens the draft's phone step |
| 7 | LB-APP-061 | the original photo uploaded | refused on the client; re-encoded by the server (WP-84) |
| 8 | LB-APP-063 | "inside Uzbekistan" is a rectangle | the rectangle stays a pre-check; the server's `errors.point` (WP-84) |
| 9 | LB-APP-064 | an unknown value crashes | label tables with a neutral fallback |
| 10 | LB-APP-065 | no way forward after a rejection | DEV-056: the support button on the rejection screen (the card: WP-82) |
| 11 | LB-APP-067 | delete without undo | DEV-057 |
| 12 | LB-APP-068 | silent loss of place data | DEV-058 |

## Tests

**Unit (Vitest).**

- `rules.test.ts`: every coupling of BR-APP-080 («5/9», the comma, the exclusive rooms, the 12-digit price, the
  lengths); the gate's missing list in its order; the floor rule; `inUzbekistanBox` on the edges.
- `autosave.test.ts` (fake clock): 600 ms after the last edit; one flush at a time; a flush waiting for a failed one
  reports "not saved"; the floor pair held back; `422` with `errors` keeps the failed fields dirty and re-sends the
  rest once; the flush on unmount.
- `photos.test.ts` and `shrinkPhoto.test.ts`: a selection cut to the free slots; one batch at a time; a refused
  shrink sends nothing and the batch goes on; `owner_photo_limit` stops it; the cover order; delete with undo sends
  nothing, delete without undo sends one `DELETE` when the toast ends and on unmount.
- `demand.test.ts`: 500 ms, abort on a new change, no read without a city, the UZS range in millions, no usual
  price with a `null` bound; `count: 7` → the number, `few: true` → «несколько человек», `count: 0` → no line
  (DEC-84).
- `applyPlace.test.ts`: silent fill, replace with undo, the city counted as empty, an unknown city ignored, a
  stale answer dropped; the two `owner_place_autofill` results.
- `phonePoll.test.ts` (fake clock): the 1.5 s ticks without overlap, the 20 s hint, the 90 s stop and the restart on
  `onVisible`, the stale `phone_error` within 8 s, each end state.
- `closeOwnerForm.test.ts`: closing from the questionnaire, a step and the done step takes the right number of steps;
  a direct load replaces with the parent.
- `contact.test.ts`: `null` outside Telegram, at 6.8 and without the method; `true` and `false` at 6.9; a second
  callback argument is not read.
- `owner.test.ts` (deep links): `owner_new`, `owner-new`, `?owner=new`, `o_<ULID>`, `o_` with a bad id, a listing link
  winning; `launchPending()` false for an owner target; the target dropped while `owner_enabled` is false.
- `routes` (the existing suite): every new address through `matchRoute`, `parentOf`, `screenNameOf` and
  `shellVariantOf`, with and without `first=1`.
- `actions/owner.test.ts`: every action with the cookie token and the argument token; an invalid input sends nothing;
  the upload passes the multipart field `file` (and, with the transport of Q-APP-031, reports progress, maps a
  network failure, the timeout and a 2xx without JSON to `own.photoFailed`).

**Component (Vitest + Testing Library).** `OwnerFormLayer`: loading, error with retry, the limit state, the cross
without the SDK, the switched-off redirect. `Questionnaire`: the welcome line, the highlights, the footer notes in
their order, the `focus` scroll. `PlacePicker` (engines mocked): the label states, «Готово» outside, the edge-only
swipe. `PhoneStep` and `RejectionState`: each reason, an unknown reason read as `denied`, the support button with and
without a support bot, no waitlist and no realtor text; the old-client button opens
`https://t.me/<bot>?start=owner_phone` and is absent without a bot username; the line `own.phoneKept` with and without
a privacy link. `ModeStep`: `request` preselected, the revert on error, «Опубликовать» and «Готово». `DoneStep`: the
radar sentence with radars on and off, the mascot throttles; a publish answered `held: true` shows «На проверке»
without confetti or any reason.

**End to end (Playwright, fake Telegram, stubs; cookie mode and header mode).** The stub API runs with
`OWNER_CABINET_ENABLED=true`; scenarios through the cookie `homi_stub_scenario`.

- `owner-form.spec.ts` (starts in `owner_empty`, where «Сдать квартиру» reads «Бесплатно» and opens the form): a new
  draft → step «where» → «Готово» → the questionnaire with the place filled → photos → «Дальше» → phone (scenario
  `phone_set`) → mode with «Через HOMI» selected → «Опубликовать» → the done step → Back closes the form; in the
  default scenario an opening answers the untouched draft of the fixtures (`200`, DEV-054); `owner_returning` answers
  a new draft and shows «С возвращением!» (WP-80's scenarios);
  `owner_limit` → the limit state; `publish_missing` → the highlights; `listing_locked` → «Мои объявления»; the
  eleventh photo → «Не больше 10 фото.»; an edit of the active fixture listing → «Готово» → «Сохранили».
- `owner-picker.spec.ts`: the picker on GL and with `?map=leaflet`; the label after a stop; «Указать вручную»;
  the replace toast and «Вернуть».
- `owner-phone.spec.ts`: `phone_not_uz` and `phone_not_own` inline; `rejected_denied`, `rejected_limit` with «Мои
  объявления»; `held_check` → «На проверке» after «Опубликовать», no confetti; the old-client path at version 6.8 opens
  `?start=owner_phone`; a launch with `startapp=o_<id>` opens the phone step; a launch with `startapp=owner_new` opens
  the form after the city picker.
- `owner-off.spec.ts` (`@owner-off`, the second API with the key unset): `/owner/new` returns to Settings; an
  `owner_new` launch opens the feed; the scenario `owner_disabled` on the first API closes the form with the toast.

## Acceptance checklist

Run in ru, uz and en, light and dark; cookie mode and header mode where a request is involved. Staging and
production keep the cabinet switched off until WP-89 (DEC-81); these lines run on a local stack whose backend env
has `OWNER_CABINET_ENABLED=true`, with the screenshots in the PR, and once more inside Telegram on staging when
WP-89 switches the cabinet on there with staff accounts (DEC-88).

- [ ] With the cabinet off: no address of the form opens, an `owner_new` launch opens the feed, and the form sends no
      owner request. Seen on staging in three languages.
- [ ] «Сдать квартиру» opens the form; a second opening without a saved field answers the same draft (DEV-054).
- [ ] Step «where»: the pin, the label «район · город», «Найти меня» only where a location can be asked, «Готово»
      fills city and district, the replace toast offers «Вернуть»; Back and the edge swipe close the whole form.
- [ ] The picker from «Карта» returns to the questionnaire on «Отмена», Back and the edge swipe.
- [ ] The picker works on GL and on Leaflet (`?map=leaflet`) and in lite graphics; the map is never blank without a
      message.
- [ ] Every section of the questionnaire in its order; «5/9» fills both floor fields; a floor above the floors shows
      `own.floorBad`; the price is grouped; the currency switch works.
- [ ] Autosave: an edit survives closing the form and opening it again; a refused field is highlighted.
- [ ] «Дальше» with missing items lists only those and vibrates; with everything set it opens the phone step.
- [ ] Photos: up to ten, the cover badge, «Сделать обложкой», delete with «Вернуть» (DEV-057); an unreadable file is
      refused with its text.
- [ ] Clearing the address keeps the point; another city offers «Вернуть» (DEV-058).
- [ ] The demand line and the usual price show only with their data, and no radar sentence while radars are off;
      the scenario `demand_few` reads «несколько человек», never a number (DEC-84).
- [ ] Phone: «Поделиться номером» asks Telegram; yes → the mode step within seconds; no → the denied text; an old
      client → «Открыть бот»; the late hint after 20 s; `not_uz` and `not_own` inline.
- [ ] Each rejection reason (`denied`, `limit`) with its text and the support button; no screen mentions realtors
      and none offers a waitlist.
- [ ] A publish that the checks hold ends on «На проверке», without confetti and without a reason.
- [ ] The mode step opens with «Через HOMI» selected; the preview matches the questionnaire; «Ваш номер» shows the
      owner's own number.
- [ ] «Опубликовать» → confetti, the haptics, the done text; the mascot repeats them; Back from the done step closes
      the form.
- [ ] An edit ends with «Готово» and «Сохранили»; no publish request is sent (DEV-062).
- [ ] A form opened from the owner panel (once WP-82 is merged) returns to the listing on Back.
- [ ] Without the Telegram SDK the form shows its close cross in every state.
- [ ] `owner_place_set`, `owner_place_autofill` and `owner_mascot_tap` reach the journal with their properties; the
      screen name is `owner/form` on every step.
- [ ] No legacy brand word on any step, in three languages.
- [ ] `pnpm -r lint`, `pnpm -r typecheck`, `pnpm -r build`, the unit, component and end-to-end suites are green, the
      `@owner-off` run included.
- [ ] Deployed to staging and production and checked inside Telegram on iOS, Android, Desktop and Web once the
      cabinet is on there.

## As built

- **Size (DEC-99).** About 8 000 changed lines: 1 126 of the generated legacy catalogue, 1 707 of tests, about 5 200 of
  code (route files and the `homi` texts included). The upload progress is not a pull request of its own: since DEC-92
  it is the only upload path of the photos. The developer chose one pull request on 2026-11-21.
- **Step 1, the seams.** The owner types of `@homi/types` after WP-80 hold every field the form reads; the per-method
  responses type only 200/401/422/429, so the 403/409 owner codes are read by their `code` string. The owner
  dictionary (`demo/app/src/features/owner/owner.js`, unchanged by the pin) is three objects that are not exported,
  followed by code: `import-legacy.mjs --owner <file>` reads them with its own extractor (207 keys per locale, three
  plurals, no collision with the main dictionary); `keys.json` lists them under `owner`. The brand words are in six keys
  per locale — `own.subtitle` carries none, `own.listedDays` does (the list above is corrected). The picker follows
  `useSpotMap` (`usePickerMap`, lazy `pickGL` / `pickLeaflet`).
- **The limits in the texts** (LB-APP-057): `own.limitTitle`, `own.limitText` and `own.rejected.limit` have `homi`
  overrides with `{max}` and plural forms; `max` comes from the answer or `limits.owner_listings`.
- **The failure detail.** `ApiError` keeps `limit` and `max`; `ApiFailure.detail` holds the envelope's `reason` (any),
  `limit`, `max` and the names of the fields of `422 errors` — names only, never a message (SEC-REQ-047). The day
  limit's top-level `reason` is unchanged.
- **The photo transport** is the integrator's recommendation of DEC-92: `XMLHttpRequest` to the route
  `POST /bff/owner/listings/{id}/photos` (`app/bff/owner/listings/[id]/photos/route.ts`), same-origin, the token from
  the cookie or the bearer header, at most 4 MB, 90 s, forwarded as `file` named `photo.jpg`; `25` §3.5's mutation row
  is amended. `next.config.ts` keeps its `bodySizeLimit` (the photos never reach a Server Action).
- **Controllers.** The autosave (`form/autosave.ts`, `AutosaveController`) and the phone poll (`steps/usePhonePoll.ts`,
  `PhonePoll`) are plain classes with thin hooks, so their rules are tested on fake timers; the React Compiler refuses
  a self-scheduling `useCallback`.
- **The steps** reach the questionnaire's form and autosave through a context (`form/context.tsx`); each renders in
  `steps/StepFrame.tsx`, fixed at z 48 inside the form's layer, above the questionnaire's footer bar.
- **A form loaded directly** drops its steps once a step pushed from it shows the overlay copy (the latch of the
  listing's standalone copy): the step lives in the overlay copy; both questionnaires stay mounted, the standalone
  one below, as Back restores the direct load's entry. Known edge: an edit made in the overlay copy is not shown by
  the standalone questionnaire after that Back until the form is opened again.
- **The events** `owner_place_set`, `owner_place_autofill` and `owner_mascot_tap` (once per 30 s, `events.ts`) join the
  journal: 24 events.
- **The launch links** are never pending; their once-per-launch mark is the digest of the target address.
- **The e2e runs.** The default run's API has `OWNER_CABINET_ENABLED=true` (CI and `scripts/dev/e2e-local.sh`);
  `@owner-off` runs with `@radars-off` against the API that leaves it unset. `e2e/owner-form.spec.ts` (both session
  modes) and `e2e/owner-off.spec.ts`; the picker's and the phone's own specs are component tests
  (`tests/owner/PlacePicker.test.tsx`, `phonePoll.test.ts`), since a map and Telegram's contact share are not driven
  end to end on stubs.
- **Left to later packages:** the settings group and «Мои объявления» (WP-82, `/settings/owner` is the WP-20
  placeholder); `RollNumber` on «N из 10».

## Handoff

- Production track: the regular deploy; `CSP_PRIVATE_MEDIA_HOSTS` in the app's env on staging and production (the
  origin of the private disk's temporary URLs); `OWNER_CABINET_ENABLED` stays unset (DEC-81). Then the manual checks
  inside Telegram with staff accounts (DEC-88): a draft's photos, the contact share below and above 6.9, the picker on
  both engines.
- Product owner: the new `homi` texts (`own.doneTextNoRadar`, `own.photoDeleted`, `own.cityChanged`, `own.disabled`,
  `own.photoUnreadable`, `own.support`, `own.edit.done`, `own.review.*`, `own.landmarkHint`, `own.demandFew`);
  `own.phoneKept` also with the lawyer (DEC-87, marked `data-legal-review="pending"`).
