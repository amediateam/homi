# Wave 1 — legacy behaviour baseline

Conventions: [`../README.md`](../README.md). Written by WP-02 (`25` §8, DEC-37, Q-APP-024). The audit (`03`, `05`, `07`,
`08`, `09` and the registers in `../data/`) describes the release pinned here. Every later legacy release is read from
its sync report and recorded in the intake log below. Each release that changes behaviour becomes a row at the top
of the remaining queue (`README.md` rule 7), and its intake moves the pin to it.

## The pin

| Field | Content |
| ----- | ------- |
| Baseline release | `index-CBlEKxdL.js`, production Last-Modified Tue, 17 Nov 2026 22:05:45 GMT, synced into the legacy tree on 2026-11-18 (`$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:64`); pinned by its intake on 2026-11-19 |
| Legacy checkout | SVN revision 31 for the release: `svn info` of `demo/app/docs/releases/2026-11-18_index-CBlEKxdL` gives Last Changed Rev 31, 2026-11-18 23:55:51 +0500. The release was read in the night of 2026-11-19 (finished by 02:15 +0500), when `demo/app/src`, `docs/api.md` and `demo/app/docs/CHANGELOG.md` were at r31 and `svn status` showed `demo/app/src` clean. The checkout has moved since. On 2026-11-19 at 15:57 +0500 it is at r37 with a clean `svn status`: the next release `index-CIa0Ldj2.js` changed 71 of the `.js`, `.jsx` and `.css` files under `demo/app/src` (Last Changed Rev 33; 38 are still at r31, the rest are older), rewrote parts of `docs/api.md` (r35) and put its entry above this release's in `CHANGELOG.md` (r36; this release's entry is now `:64-106`). So the legacy `path:line` references in the rows this intake adds are those of r31: exact for a file whose Last Changed Rev is 31 or lower, shifted for the files of r33, for `docs/api.md` and for `CHANGELOG.md`, until the intake of `index-CIa0Ldj2.js` reads them again. `svn cat` and `svn up` are not used |
| Locale files of the pin | Read from a copy of `demo/app/src/i18n/locales/{ru,uz_Latn,en}.js` taken outside the legacy tree on 2026-11-19 for the previous intake, while the checkout held them at r31; they are at r33 now. Check made at 15:55 +0500: today's files with the next release's diffs reverse-applied (`demo/app/docs/releases/2026-11-19_index-CIa0Ldj2/delta/units/071-modified-en.jsx.diff`, `072-modified-ru.jsx.diff`, `073-modified-uz_Latn.jsx.diff`) are byte-identical to the copy in all three locales. The catalogue import (`frontend/packages/i18n/scripts/import-legacy.mjs --from <copy> --release index-CBlEKxdL.js`) gives 563 names per locale (569 keys in each file), 59 more than r29, and four changed values (`noAccess.text.private` and `card.ownerVerified` in every locale, `found.where.agent` and `found.shareText` in en). The owner cabinet's own dictionary (`demo/app/src/features/owner/owner.js`, loaded with the owner chunks) is not in these files and is not imported |
| Read on | 2026-11-19, read-only (`svn info`, `svn status`, `sed -n`, `rg`, `cat`) |
| Previous baselines | `index-BnFvC-Ft.js` (Last-Modified Sat, 14 Nov 2026 21:05:33 GMT, synced 2026-11-17, SVN r29), pinned by its intake on 2026-11-19 (#88); before it `index-DY_DH7h-.js` (Last-Modified Fri, 13 Nov 2026 22:05:41 GMT, synced 2026-11-14, SVN r27), pinned by WP-02 on 2026-11-14 with a clean `svn status`; before it `index-plF_TOcT.js` (Last-Modified Sat, 07 Nov 2026 22:05:36 GMT), the release the audit of 2026-11-09 describes (`23-coverage-audit.md` §6: no deferred items in any synced release up to it) |

## Releases covered since the audit

| Release | Production Last-Modified | Synced | Sync report | Changes |
| ------- | ------------------------ | ------ | ----------- | ------- |
| `index-Dbpp463V.js` | Mon, 09 Nov 2026 22:41:17 GMT | 2026-11-11 | `$KVADRO_ROOT/demo/app/docs/releases/2026-11-11_index-Dbpp463V/REPORT.md` | `price_kind: 'business'` with the label `card.businessPrice` on the feed card. On the listing screen the code puts it only into the share text; the sync report says "title row" (`03` SCR-018). The card badge «Хозяин» now ranks above «Ниже рынка». The no-access texts `noAccess.title.invite` and `noAccess.text.full` no longer mention the beta. No API, CSS or asset change |
| `index-BNLZFfL0.js` | Wed, 11 Nov 2026 21:35:40 GMT | 2026-11-12 | `$KVADRO_ROOT/demo/app/docs/releases/2026-11-12_index-BNLZFfL0/REPORT.md` | The listing actions sheet gains a third view "Что именно неверно?" after the reason `wrong_data`, with five details (`price`, `rooms`, `place`, `photos`, `other`). `POST /api/listings/:id/report` takes an optional `detail`. Back walks the views step by step. 11 new i18n keys |
| `index-DY_DH7h-.js` | Fri, 13 Nov 2026 22:05:41 GMT | 2026-11-14 | `$KVADRO_ROOT/demo/app/docs/releases/2026-11-14_index-DY_DH7h-/REPORT.md` | See below |
| `index-BnFvC-Ft.js` | Sat, 14 Nov 2026 21:05:33 GMT | 2026-11-17 | `$KVADRO_ROOT/demo/app/docs/releases/2026-11-17_index-BnFvC-Ft/REPORT.md` | Settings: the group «Чат с ботом» with the row and sub-page «Вид карточек» (`card_style: classic \| rich`, a mock of both bot messages, «Прислать пример в чат» → the new `POST /api/settings/card-sample` → `{sent}`); `meta.new_features` gains `cards`; `SettingsRow` takes a `badge`; an open sub-page sets `body.subpage-open`; `tg` in `app_launch`; 28 i18n keys; 10 parity scenarios (`03` SCR-048) |
| `index-CBlEKxdL.js` | Tue, 17 Nov 2026 22:05:45 GMT | 2026-11-18 | `$KVADRO_ROOT/demo/app/docs/releases/2026-11-18_index-CBlEKxdL/REPORT.md` | The owner cabinet «Сдать квартиру»: a form with photos and a place picker, the phone confirmed through the bot (`WebApp.requestContact`), publishing, «Мои объявления», the seekers' requests and the owner's panel on the listing, over 17 methods `/api/owner/*` (`03` SCR-049 … SCR-062, `08` API-037 … API-053). For a seeker: `POST /api/listings/:id/contact`, a request to an owner who hides the number (API-054), the chip «Проверенный хозяин» with its info sheet, and the section «Хозяин — со слов объявления». Outside them: badge kinds and a shield on the compact map card; the listing layer's entrance and leave animation; the toast's drag and offsets; the edge mode and the nested-sub-page rule of `useSwipeBack`; `Photo` from cache; the saved feed no longer re-created by a listing opened in the launch; the collapsed chrome under an open listing; four reworded texts; 59 i18n keys, and 207 more per locale in the owner chunk's own dictionary; 137 parity scenarios (85 base, 18 of them for the cabinet; 36 filter; 16 GL) |

What `index-DY_DH7h-.js` adds:

- The banner «С вашего прошлого захода — N новых» above the search feed, and the new `GET /api/feed/new?<filters>&since=<unix seconds>` → `{ count }`.
- Visits per filter set, kept in `kv-visits` and synced to DeviceStorage.
- A radar card inside the feed after the 8th card.
- `entry: "feed" | "return"` in `POST /api/subscriptions`.
- Five new analytics events and nine new i18n keys.
- Changed interplay between the nudges.

The bot and the Telegram SDK layer: the three sync reports cover the Mini App only. None of them mentions a bot change.
One Telegram integration point moved: `kv-visits` joins the keys mirrored to DeviceStorage (`DEVICE_SYNCED_KEYS`,
`$KVADRO_ROOT/demo/app/docs/releases/2026-11-14_index-DY_DH7h-/REPORT.md`, cluster "lib/storage"). It is recorded in
`05`.

`index-BnFvC-Ft.js` changes the bot as seen from the Mini App: the user picks how the bot sends listing cards, and the
Mini App asks the bot to send a sample card. It is recorded in `04` §3.10 and BOT-085 (no bot document describes it;
`$KVADRO_ROOT/docs/telegram-bot.md` is at r20 of 2026-11-09). The SDK layer gains `WebApp.version` in `app_launch`
(`05` TMA-041).

`index-CBlEKxdL.js` changes the bot in six places that the Mini App shows; no bot document describes them. The bot
takes in the contact shared with `WebApp.requestContact`, delivers a seeker's request to the owner, sends the
seeker the owner's number, the delayed soft refusal and the «сдано» notice, and is promised to tell waiting
realtors when the cabinet opens for them (`04` §3.18, BOT-086 … BOT-091, all `UNVERIFIED`). The SDK layer gains
`WebApp.requestContact` (Telegram 6.9 and later; `05` TMA-034, no longer an absence), the launch parameter
`owner_new` (TMA-046) and two more keys mirrored to DeviceStorage, `kv-owner-tip` and `kv-req-tip` (TMA-037).

## Intake log

One row per legacy release read after the pin.

| Release | Date read | Audit rows changed | Specifications changed | Queue row |
| ------- | --------- | ------------------ | ---------------------- | --------- |
| `index-BnFvC-Ft.js` | 2026-11-19 | `02` Q-API-067 (new), item counts; `03` header, SCR-032, SCR-033, SCR-048 (new), §2.1, §3.1, §3.2, §3.3, §3.6, BR-APP-074 (new), LB-APP-012, LB-APP-051 and LB-APP-052 (new), LB-APP-053 (new, `decision`), Q-APP-001, §7; `04` §2, §3.10, §5, BOT-085 (new), Q-BOT-046 (new), §11; `05` TMA-041, §2; `07` BR-APP-074, summary; `08` header, API-001, API-024, API-025, API-034, API-036 (new), §4.1; `09` F-SETTINGS-007 (new), summary; `24` DEC-57 and RK-33 (new), Q-APP-024; `decisions/2026-11-19-developer-answers.md` (new); `README.md` status line; registers `api-inventory.json`, `screens.json`, `bot-handlers.json`, `features.csv`; the `legacy` catalogue of `@homi/i18n` re-imported from the release (510 keys; the copy of the locale files is described above) | `25` §1, §3.2, §4.2, §8, §14; WP-11 (`card_style`, `POST /settings/card-sample`, `app_launch.tg`), WP-21, WP-23, WP-29 and WP-30 (their legacy reads at r29 are now of the pin), WP-31 (now also depends on this intake), WP-32, WP-33, WP-40, WP-41, WP-48, WP-50, WP-53, WP-57, WP-58, WP-71; tasks KV-BE-045, KV-FE-081, KV-TG-022 (F-SETTINGS-007); stub fixtures `settings/default.json`, `settings/card_rich.json`; `docs/api/README.md` | Intake `index-BnFvC-Ft` (`README.md`, Stage B) |
| `index-CBlEKxdL.js` | 2026-11-19 | `02` header, BR-API-108, BR-API-111, §12a (new: BR-API-159 … BR-API-189, Q-API-068 … Q-API-078), LB-API-056 (new), §25; `03` header, §0, §1.1, §1.2, §1.3, §1.6, §1.8, §1.9, §1.11, SCR-003, SCR-006, SCR-007, SCR-013, SCR-018, SCR-019, SCR-025, SCR-031, SCR-032, SCR-033, SCR-042, SCR-043, SCR-044, SCR-049 … SCR-062 (new), §2.1, §3.1, §3.2, §3.3, §3.4, §3.6, BR-APP-026, BR-APP-032, BR-APP-035, BR-APP-056, BR-APP-075 … BR-APP-103 (new), LB-APP-002, LB-APP-012, LB-APP-054 … LB-APP-078 (new: 12 `bug`, 13 `decision`), §6.1, Q-APP-004, Q-APP-020, Q-APP-027 and Q-APP-028 (new), §7; `04` §0.1, §2 with BOT-086 … BOT-091 (new), §3.18 (new), §5, Q-BOT-047 … Q-BOT-049 (new), §10, §11; `05` header, TMA-012, TMA-022, TMA-025, TMA-026, TMA-028, TMA-033, TMA-034 (no longer an absence), TMA-035, TMA-037, TMA-040, TMA-042, TMA-046 (new), §2, §5; `07` §1, BR-APP-026, BR-APP-032, BR-APP-035, BR-API-108, BR-API-111, C-09, §2.14 (new, 60 rules without a feature), §4, §5; `08` intro, "Legacy state", §1.3, §1.5, §1.6, §1.8, API-001, API-003, API-008, API-009, API-034, API-037 … API-054 (new), §4.1, §4.2, §5; `09` the intake paragraph, F-OWNER-001, F-OWNER-002, F-TMA-004, F-TMA-005, F-TMA-007, F-MAP-003, F-LISTING-001, F-HISTORY-001 (no new feature: the cabinet's rows come with the owner-cabinet plan); `24` Q-APP-024; `README.md` status line; `decisions/2026-11-19-developer-answers.md` (the order of work); registers `screens.json` (62), `api-inventory.json` (76), `bot-handlers.json` (167), `features.csv`, `ids.csv` (2 405 ids); the `legacy` catalogue of `@homi/i18n` re-imported from the release (569 keys; the copy of the locale files is described above) with four `homi` overrides; 988 line references into the changed documents moved (`07`, `09`, `features.csv`, the task files) | `25` §1, §8; WP-21 (`requestContact`), WP-23 (the `private` text, the toast, swipe-back, the chrome), WP-24 (badge kinds, the compact shield), WP-26 (the layer's animation), WP-27, WP-28 (spot-map controls), WP-29 (the history rule), WP-33, WP-41 (the `owner` key of `renovations`). No stub fixture and no contract change: the cabinet's methods and the contact request are for the owner-cabinet plan. The built code this leaves behind the pin is listed below | Intake `index-CBlEKxdL` (`README.md`, Stage B) |

## Built code behind the pin

The specification of a merged package describes the pinned release. When an intake changes behaviour that a merged
package has already built, the intake changes the specification and a later package changes the code. This table
lists those differences until a package closes them. The catch-up packages are defined by the intake of
`index-CIa0Ldj2.js`, which also adds its own rows. State: read from the code on 2026-11-19 at `371c553`; nothing was
run.

| # | Behaviour of the pin (legacy since) | Built by | The code today | Specified in |
| - | ----------------------------------- | -------- | -------------- | ------------ |
| 1 | The card badge has kinds: `verified` with a shield, `quiet` for «Хозяин» (`index-CBlEKxdL.js`) | WP-24 | `frontend/app/features/feed/badges.ts:8-9,32,35`: the tones are `warn`, `good` and `plain`, and both owner badges are plain. `frontend/app/features/feed/ListingCard.tsx:42-49,141-145`: only the warn style, no icon | WP-24; `03` BR-APP-026 |
| 2 | The compact card shows a shield after the price for a verified owner (`index-CBlEKxdL.js`) | WP-24; shown by WP-27's selection card | `ListingCard.tsx:97` gives the compact card no badge, and the price row `:164-181` has no shield. `frontend/packages/ui/src/icons/index.ts` does not export `ShieldCheck`. The compact card is used by `frontend/app/features/map/MapSelectionCard.tsx:56` | WP-24, WP-27 |
| 3 | The verified badge reads «Проверенный хозяин» (`index-CBlEKxdL.js`) | WP-24 | Closed by this intake: the text came with the catalogue re-import (`371c553`) | WP-24 |
| 4 | A toast follows a downward drag and closes past 36 px; its offset depends on what is below it (`index-CBlEKxdL.js`) | WP-23 | `frontend/app/features/shell/ToastHost.tsx:14-17`: the scope `app` always sits at + 78 px; `:40-53`: no touch handler | WP-23 |
| 5 | The listing layer has an entrance and a leave animation (`index-CBlEKxdL.js`) | WP-26, WP-23 | `frontend/app/features/shell/RouteOverlay.tsx:46-55`: no entrance or leave class. `frontend/app/features/listing/ListingLayer.tsx:123` closes by route and `frontend/app/features/listing/closeListing.ts:34-39` goes straight to `backBy` | WP-26 |
| 6 | The collapsed chrome stays collapsed under an open listing (`index-CBlEKxdL.js`) | WP-23 | `frontend/app/features/shell/AppShell.tsx:79`: `useMiniChrome` is on only while the route is the feed | WP-23; `03` §1.2 |
| 7 | «Смотрели» is not re-created by a listing opened in this launch (`index-CBlEKxdL.js`) | WP-29 | `frontend/app/features/saved/useSavedList.ts:52-62` latches the growth of `seen`, and `:91-95` bumps the list on the return | WP-29 |
| 8 | `app_launch` carries `tg`, the Telegram WebApp version (`index-BnFvC-Ft.js`) | WP-21 | `frontend/app/lib/session/bootstrap.ts:263` and `frontend/app/lib/analytics/events.ts:11` send no `tg`; `tg.version()` exists (`frontend/app/lib/telegram/sdk.ts:90-92`) | WP-11, WP-32 |
| 9 | An open sub-page sets `body.subpage-open`, so the page under it does not scroll (`index-BnFvC-Ft.js`) | WP-23 | `frontend/packages/ui/src/components/SubPageFrame.tsx:86` has `overscroll-contain` and sets no body class; `frontend/packages/ui/src/styles/layout.css:50-56` locks only `sheet-open` and `locked` | WP-23 |
| 10 | The controls of the mini map and of the fullscreen spot map stay above Leaflet's panes (`index-CBlEKxdL.js`) | WP-28 | Not verified. `frontend/app/features/listing/spot/SpotMap.tsx:85-96` and `SpotMapFullscreen.tsx:110-125` place the controls `absolute` without a z-index. `frontend/app/e2e/spot-map.spec.ts:298-310,349` clicks the fullscreen controls on the Leaflet engine, which suggests they are reachable; no test covers the mini map's expand chip (`SpotMap.tsx:88`) | WP-28 |
| 11 | An inactive tab is tinted with 55 % of the text colour instead of opacity 0.55 (`index-CBlEKxdL.js`; cosmetic) | WP-23 | `frontend/app/features/shell/TabBar.tsx:115`: `opacity-55` | `03` SCR-006, §3.6 |
| 12 | A disabled primary button has opacity 0.5 (`index-CBlEKxdL.js`; cosmetic) | `@homi/ui` | `frontend/packages/ui/src/components/Button.tsx:12`: `disabled:opacity-40` | `03` §3.6 |

Not in the table: the edge-only swipe, the nested-sub-page rule and the retry of a lazily loaded page
(`index-CBlEKxdL.js`). In legacy only the owner cabinet uses them, so they are work of the cabinet packages, not a
difference of a built screen.
