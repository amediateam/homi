# Wave 1 — legacy behaviour baseline

Conventions: [`../README.md`](../README.md). Written by WP-02 (`25` §8, DEC-37, Q-APP-024). The audit (`03`, `05`, `07`,
`08`, `09` and the registers in `../data/`) describes the release pinned here. Every later legacy release is read from
its sync report and recorded in the intake log below. Each release that changes behaviour becomes a row at the top
of the remaining queue (`README.md` rule 7).

## The pin

| Field | Content |
| ----- | ------- |
| Baseline release | `index-DY_DH7h-.js`, production Last-Modified Fri, 13 Nov 2026 22:05:41 GMT, synced into the legacy tree on 2026-11-14 (`$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:5`) |
| Legacy checkout | SVN revision 27 for `demo/app`. `svn info` of `demo/app/docs/CHANGELOG.md`, `demo/app/docs/releases/2026-11-14_index-DY_DH7h-` and `demo/app/src/app/useReturnNudge.js` gives Last Changed Rev 27, 2026-11-14 14:41:47 +0500. The working copy is mixed-revision: its root reports r26. `svn status` is clean (read 2026-11-14) |
| Read on | 2026-11-14, read-only (`svn info`, `svn status`, `sed -n`, `rg`) |
| Previous baseline | `index-plF_TOcT.js` (Last-Modified Sat, 07 Nov 2026 22:05:36 GMT), the release the audit of 2026-11-09 describes (`23-coverage-audit.md` §6: no deferred items in any synced release up to it) |

## Releases covered since the audit

| Release | Production Last-Modified | Synced | Sync report | Changes |
| ------- | ------------------------ | ------ | ----------- | ------- |
| `index-Dbpp463V.js` | Mon, 09 Nov 2026 22:41:17 GMT | 2026-11-11 | `$KVADRO_ROOT/demo/app/docs/releases/2026-11-11_index-Dbpp463V/REPORT.md` | `price_kind: 'business'` with the label `card.businessPrice` on the feed card and the listing title row. The card badge «Хозяин» now ranks above «Ниже рынка». The no-access texts `noAccess.title.invite` and `noAccess.text.full` no longer mention the beta. No API, CSS or asset change |
| `index-BNLZFfL0.js` | Wed, 11 Nov 2026 21:35:40 GMT | 2026-11-12 | `$KVADRO_ROOT/demo/app/docs/releases/2026-11-12_index-BNLZFfL0/REPORT.md` | The listing actions sheet gains a third view "Что именно неверно?" after the reason `wrong_data`, with five details (`price`, `rooms`, `place`, `photos`, `other`). `POST /api/listings/:id/report` takes an optional `detail`. Back walks the views step by step. 11 new i18n keys |
| `index-DY_DH7h-.js` | Fri, 13 Nov 2026 22:05:41 GMT | 2026-11-14 | `$KVADRO_ROOT/demo/app/docs/releases/2026-11-14_index-DY_DH7h-/REPORT.md` | See below |

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

## Intake log

One row per legacy release read after the pin.

| Release | Date read | Audit rows changed | Specifications changed | Queue row |
| ------- | --------- | ------------------ | ---------------------- | --------- |
