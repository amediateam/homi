# KV-FE-037 — Deep-link router: `start_param`, `?listing=`, `?news=`

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Frontend (track: development) |
| Complexity | S |
| Milestone | FE-1 (M9, stage S4) |
| Feature IDs | F-SHARE-002, F-TMA-001 |
| Dependencies | KV-FE-024 (adapter: `initData`, `start_param`); consumers: KV-FE-023 (prefetch of the linked listing), KV-FE-025 (initial listing layer), KV-FE-040 (`entry`, `?news=pets`), KV-FE-042 (source and post link), KV-FE-057 (`?map=`), KV-FE-069 / KV-FE-079 / KV-FE-071 / KV-FE-081 (link builders); bot side KV-TG-015, KV-TG-016; decisions DEV-040 `PROPOSED`, Q-APP-019 |

## Goal

The Mini App reads its launch parameters exactly once at boot — the listing to open, the attribution source, the
source post, the news code, the map override — accepting every legacy link format in circulation and tolerating
unknown suffixes, and builds every deep link the app emits from one module.

## Legacy reference

- `$KVADRO_ROOT/demo/app/src/lib/telegram/startParam.js:6-54` (`start_param` from `initData`; `^l_(\d+)` else
  `?listing=`; positive integer; source `web` / campaign `(fb|tg|ig)\d{1,4}` / `seo` / `share`; post URL
  `^l_\d+-(?:seo-)?([A-Za-z0-9_]{4,32})-(\d{1,12})$`); `$KVADRO_ROOT/demo/app/src/lib/newFeatures.js:24-30`
  (`?news=` `^[a-z_]{1,32}$`); `$KVADRO_ROOT/demo/app/src/features/map/engine.js:74-87` (`?map=`);
  `$KVADRO_ROOT/demo/app/src/features/map/gl/useMapInstance.js:118-120` (`?mapdebug`).
- TMA-010 (listing from `start_param`), TMA-011 (source formats), TMA-012 (query parameters), TMA-013 (links created);
  `03b` §6.3 (grammar), §6.1 (payload tolerance); `15` §3.9 row URL-052…URL-057.
- Public URLs: URL-052 (`startapp=l_<id>`), URL-053 (`-web`), URL-054 (`-seo-<channel>-<post>`), URL-055 (campaign),
  URL-056 (`-<channel>-<post>` without `seo`, parser tolerance), URL-057 (Mini App origin with `?listing=` / `?news=`).

## Implementation

1. `frontend/app/lib/deeplinks/parse.ts` — `parseLaunch(initData, locationSearch): Launch`, called once at boot and
   memoised:
   - `startParam` = `URLSearchParams(initData).get('start_param')` (only with `initData`);
   - `listingId` = `^l_(\d+)` of `startParam`, else `?listing=`; accepted only when `Number.isSafeInteger(n) && n > 0`;
   - `source` for `l_…` params: `^l_\d+-web$` → `web`; `^l_\d+-((?:fb|tg|ig)\d{1,4})$` → the campaign code;
     `^l_\d+-seo(-|$)` → `seo`; any other `l_…` → `share`; no `l_` → `null`;
   - `postUrl` from the legacy regex → `https://t.me/<channel>/<post>`;
   - `news` from `?news=` matching `^[a-z_]{1,32}$`;
   - `mapOverride` from `?map=gl|leaflet|auto` (persisted by KV-FE-057 in `kv-map-v2`);
   - `entry` = `link` when a listing id exists, else `news` when `news`, else `menu` (for `app_launch` / `app_opened`).
   Anything malformed is ignored without throwing (payload tolerance, `03b` §6.1).
2. DEV-040 (flag `dev040AttributionTags`, default off): also accept `l_<id>-web-<tag>` with `tag` `[a-z0-9_]{1,24}`
   (source `web`, tag kept for the bot hand-off) — parsers accept old and new forms; off → legacy result (`share`).
3. `frontend/app/lib/deeplinks/build.ts` — every link the app emits (TMA-013), validated parts only (bot and support
   usernames `^[A-Za-z0-9_]{4,32}$`, positive integer ids):

| # | Link | Used by |
| - | ---- | ------- |
| 1 | `https://t.me/<bot>?startapp=l_<id>` (share fallback, URL-052) | KV-FE-069 |
| 2 | `https://t.me/<bot>?start=s_<source>[--l<id>]` (no-access hand-off, URL-048) | KV-FE-042 |
| 3 | `https://t.me/<bot>?start=s_friend` (survey, URL-049) | KV-FE-079 |
| 4 | `https://t.me/<support>?start=l_<id>` (actions sheet, URL-051) | KV-FE-071 |
| 5 | `https://t.me/<support>` (settings, no-access, URL-050) | KV-FE-081, KV-FE-042 |
| 6 | `https://t.me/<bot>` (after `no_chat`) | KV-FE-030 |
| 7 | `https://t.me/<channel>/<post>` (source post, URL-059) | KV-FE-042 |

   The `start` payload is checked against Telegram's 64-character limit and `[A-Za-z0-9_-]`.
4. `?mapdebug` (legacy exposes `window.kvGL` on production) is honoured only in development builds — an internal
   change with no user-visible effect.
5. Merged listings: when the details response returns another id (redirect), KV-FE-063 switches to it; the router keeps
   the original id only for the `--l<id>` suffix.

## States and texts

n/a — no UI. Results: `{listingId, source, postUrl, news, mapOverride, entry}`; an invalid link yields the plain
search tab (no error message, as legacy).

## Interaction

The linked listing opens as the first layer over the search tab; Back closes it to the feed (KV-FE-025). `?news=pets`
opens the filters focused on pets (KV-FE-040, KV-FE-054).

## Telegram integration

TMA-010, TMA-011, TMA-012, TMA-013; `start_param` is read from `initData` only (never from the address bar) — the SDK's
`initDataUnsafe.start_param` is not trusted separately.

## Storage and analytics

- Storage: none here (`kv-map-v2` written by KV-FE-057).
- Analytics: provides `entry` and `listing_id` for `app_launch` / `app_opened` (KV-FE-040); the raw `start_param` is
  never sent to analytics.

## Files

- `frontend/app/lib/deeplinks/parse.ts`, `build.ts` (new); `frontend/app/lib/deviations.ts` (flag
  `dev040AttributionTags`)
- `frontend/app/tests/deeplinks/parse.test.ts`, `build.test.ts`

## API contract

n/a here; the linked listing is fetched by KV-FE-023 / KV-FE-063 with API-008 `GET /api/listings/:id`.

## Business rules

- Kept: TMA-010/TMA-011 grammar; payload tolerance of `03b` §6.1; links of TMA-013.
- DEV-040 `PROPOSED` (flag; test `todo('DEV-040 PROPOSED')`).
- Q-APP-019 (do bot buttons use `?listing=` / `?news=` or `startapp`?): both are supported, so the answer changes no
  code.

## Acceptance criteria

- Dataset (all must parse without throwing): `l_123` → id 123, `share`; `l_123-web` → `web`; `l_123-fb12` → `fb12`;
  `l_123-ig9999` → `ig9999`; `l_123-ig12345` → `share`; `l_123-seo` → `seo`; `l_123-seo-example_channel-45` → `seo` +
  post URL; `l_123-example_channel-45` → `share` + post URL; `l_abc` → no listing, `share`; `l_0` → no listing;
  `l_9007199254740993` → no listing; `s_web` → no listing, no source; 64 bytes of junk / Unicode → nothing.
- `?listing=77` without `start_param` → id 77, `entry: link`; `?news=pets` → `entry: news`; `?news=Pets!` ignored.
- Every built link matches the grammar of `03b` §6.3 and the bot parser datasets of KV-QA-014.

## Tests

- Unit (`parse.test.ts`): the dataset above, generated from `docs/migration/data/public-urls.json` rows URL-052…URL-057
  plus the legacy regexes.
- Unit (`build.test.ts`): each builder, invalid usernames refused, payload length limit.
- E2E (with KV-FE-170): launch with `start_param=l_42-web` opens listing 42 over the feed; Back returns to the feed.

## Edge cases

- `start_param` and `?listing=` both present: `start_param` wins (legacy).
- The listing id is valid but the listing is gone: KV-FE-063 shows `listing.loadFailed`.
- A gated user arrives by link: the no-access screen (KV-FE-042) receives `source`, `listingId`, `postUrl`.

## Security

SEC-REQ-019 (only `https://t.me/` links from validated parts), SEC-REQ-022 (payload grammar), TMA-009 (`initData` is
parsed in memory; nothing logged).

## Definition of done

`make ci-frontend` green; unit tests green (with KV-FE-010); URL rows URL-052…URL-057 covered in the URL suite run
(KV-QA-014); parity gate G4 for F-SHARE-002 ticked; `09` row updated; PR reviewed by the other developer.
