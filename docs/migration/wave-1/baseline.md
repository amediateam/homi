# Wave 1 — legacy behaviour baseline

Conventions: [`../README.md`](../README.md). Written by WP-02 (`25` §8, DEC-37, Q-APP-024). The audit (`03`, `05`, `07`,
`08`, `09` and the registers in `../data/`) describes the release pinned here. Every later legacy release is read from
its sync report and recorded in the intake log below. Each release that changes behaviour becomes a row at the top
of the remaining queue (`README.md` rule 7), and its intake moves the pin to it.

## The pin

| Field | Content |
| ----- | ------- |
| Baseline release | `index-BnFvC-Ft.js`, production Last-Modified Sat, 14 Nov 2026 21:05:33 GMT, synced into the legacy tree on 2026-11-17 (`$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:46`); pinned by its intake on 2026-11-19 |
| Legacy checkout | SVN revision 29 for the release: `svn info` of `demo/app/docs/releases/2026-11-17_index-BnFvC-Ft`, `demo/app/src/features/settings/CardStylePicker.jsx` and `demo/app/src/lib/api/settings.js` gives Last Changed Rev 29, 2026-11-17 17:45:24 +0500. The working copy is mixed-revision and one release further: `demo/app/docs/CHANGELOG.md`, `docs/api.md`, `demo/app/src/i18n/locales/*.js` and `demo/app/docs/releases/2026-11-18_index-CBlEKxdL` are at r31 (2026-11-18 23:55:51 +0500); the root reports r26. A file whose Last Changed Rev is 29 or lower is read as the state of r29; nothing else of r29 can be read, because `svn cat` and `svn up` are not used. `svn status` at the read (2026-11-19, 10:56 +0500; the locale files were copied at 10:58): `demo/app/src` was clean; 10 snapshot files of the release's own bundle under `demo/app/tools/parity/original/assets/` are missing (`!`), `index-BnFvC-Ft.js` among them (the next sync replaced the snapshot and has not removed them from SVN); an uncommitted landing sync under `demo/landing/` (6 `M`, 8 `A`) was outside the intake. At 11:50 the landing paths were clean and `demo/app/src` had 47 uncommitted paths (44 `M`, 3 `?`, changed from 11:41, the locale files among them); they are not part of this intake and are read when they arrive as a release |
| Locale files of the pin | Not readable at r29 (the files are at r31). For the catalogue import (`frontend/packages/i18n/scripts/import-legacy.mjs --from <copy> --release index-BnFvC-Ft.js`) a copy was rebuilt outside the legacy tree: the r31 files with the next release's diffs reverse-applied (`demo/app/docs/releases/2026-11-18_index-CBlEKxdL/delta/units/063-modified-en.jsx.diff`, `064-modified-ru.jsx.diff`, `065-modified-uz_Latn.jsx.diff`). Check: reverse-applying the release's own diffs (`demo/app/docs/releases/2026-11-17_index-BnFvC-Ft/delta/units/012-modified-en.jsx.diff`, `013-modified-ru.jsx.diff`, `014-modified-uz_Latn.jsx.diff`) to that copy reproduces the import of r27 exactly (every message and the key list); the copy has 510 keys per locale, 28 more than r27 and no changed value |
| Read on | 2026-11-19, read-only (`svn info`, `svn status`, `sed -n`, `rg`, `cat`) |
| Previous baselines | `index-DY_DH7h-.js` (Last-Modified Fri, 13 Nov 2026 22:05:41 GMT, synced 2026-11-14, SVN r27), pinned by WP-02 on 2026-11-14 with a clean `svn status`; before it `index-plF_TOcT.js` (Last-Modified Sat, 07 Nov 2026 22:05:36 GMT), the release the audit of 2026-11-09 describes (`23-coverage-audit.md` §6: no deferred items in any synced release up to it) |

## Releases covered since the audit

| Release | Production Last-Modified | Synced | Sync report | Changes |
| ------- | ------------------------ | ------ | ----------- | ------- |
| `index-Dbpp463V.js` | Mon, 09 Nov 2026 22:41:17 GMT | 2026-11-11 | `$KVADRO_ROOT/demo/app/docs/releases/2026-11-11_index-Dbpp463V/REPORT.md` | `price_kind: 'business'` with the label `card.businessPrice` on the feed card. On the listing screen the code puts it only into the share text; the sync report says "title row" (`03` SCR-018). The card badge «Хозяин» now ranks above «Ниже рынка». The no-access texts `noAccess.title.invite` and `noAccess.text.full` no longer mention the beta. No API, CSS or asset change |
| `index-BNLZFfL0.js` | Wed, 11 Nov 2026 21:35:40 GMT | 2026-11-12 | `$KVADRO_ROOT/demo/app/docs/releases/2026-11-12_index-BNLZFfL0/REPORT.md` | The listing actions sheet gains a third view "Что именно неверно?" after the reason `wrong_data`, with five details (`price`, `rooms`, `place`, `photos`, `other`). `POST /api/listings/:id/report` takes an optional `detail`. Back walks the views step by step. 11 new i18n keys |
| `index-DY_DH7h-.js` | Fri, 13 Nov 2026 22:05:41 GMT | 2026-11-14 | `$KVADRO_ROOT/demo/app/docs/releases/2026-11-14_index-DY_DH7h-/REPORT.md` | See below |
| `index-BnFvC-Ft.js` | Sat, 14 Nov 2026 21:05:33 GMT | 2026-11-17 | `$KVADRO_ROOT/demo/app/docs/releases/2026-11-17_index-BnFvC-Ft/REPORT.md` | Settings: the group «Чат с ботом» with the row and sub-page «Вид карточек» (`card_style: classic \| rich`, a mock of both bot messages, «Прислать пример в чат» → the new `POST /api/settings/card-sample` → `{sent}`); `meta.new_features` gains `cards`; `SettingsRow` takes a `badge`; an open sub-page sets `body.subpage-open`; `tg` in `app_launch`; 28 i18n keys; 10 parity scenarios (`03` SCR-048) |

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

## Intake log

One row per legacy release read after the pin.

| Release | Date read | Audit rows changed | Specifications changed | Queue row |
| ------- | --------- | ------------------ | ---------------------- | --------- |
| `index-BnFvC-Ft.js` | 2026-11-19 | `02` Q-API-067 (new), item counts; `03` header, SCR-032, SCR-033, SCR-048 (new), §2.1, §3.1, §3.2, §3.3, §3.6, BR-APP-074 (new), LB-APP-012, LB-APP-051 and LB-APP-052 (new), LB-APP-053 (new, `decision`), Q-APP-001, §7; `04` §2, §3.10, §5, BOT-085 (new), Q-BOT-046 (new), §11; `05` TMA-041, §2; `07` BR-APP-074, summary; `08` header, API-001, API-024, API-025, API-034, API-036 (new), §4.1; `09` F-SETTINGS-007 (new), summary; `24` DEC-57 and RK-33 (new), Q-APP-024; `decisions/2026-11-19-developer-answers.md` (new); `README.md` status line; registers `api-inventory.json`, `screens.json`, `bot-handlers.json`, `features.csv`; the `legacy` catalogue of `@homi/i18n` re-imported from the release (510 keys; the copy of the locale files is described above) | `25` §1, §3.2, §4.2, §8, §14; WP-11 (`card_style`, `POST /settings/card-sample`, `app_launch.tg`), WP-21, WP-23, WP-29 and WP-30 (their legacy reads at r29 are now of the pin), WP-31 (now also depends on this intake), WP-32, WP-33, WP-40, WP-41, WP-48, WP-50, WP-53, WP-57, WP-58, WP-71; tasks KV-BE-045, KV-FE-081, KV-TG-022 (F-SETTINGS-007); stub fixtures `settings/default.json`, `settings/card_rich.json`; `docs/api/README.md` | Intake `index-BnFvC-Ft` (`README.md`, Stage B) |
