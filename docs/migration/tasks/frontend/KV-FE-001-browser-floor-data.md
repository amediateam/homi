# KV-FE-001 — Browser-floor data and legacy startup baseline

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Frontend (track: development); the PostHog export is done by the product owner or the first developer **[PT]** |
| Complexity | S |
| Milestone | FE-0 (M9, decision input for S4) |
| Feature IDs | F-TMA-001, F-TMA-002, F-MAP-001 |
| Dependencies | DEC-26 (which PostHog project; access to it — product owner); answers Q-APP-001, Q-APP-018, Q-APP-022; feeds KV-FE-003 (DEC-06) and KV-FE-173 |

## Goal

The numbers that decide the Mini App strategy exist as a committed, aggregated table: the share of Mini App sessions
per Telegram platform, Telegram `WebApp.version` and browser engine version (and so the share below the Next.js
default floor), the legacy startup time `app_launch.ms` p50/p75, and the GL / Leaflet / lite split of map sessions.
`10` §3.11 calls these "data items 1, 2 and 4".

## Legacy reference

- Decision rule and data items: `10` §3.11 (CF-011), DEC-06; legacy build target `chrome80 / edge80 / firefox72 /
  safari13.1` inferred from the bundle (`03` §1.10, `$KVADRO_ROOT/demo/app/vite.config.js:66-70`, Q-APP-001).
- Event shapes (`03` §3.3): `app_launch` (`entry`, `ms`, `v`, `sdk?`, `js`, `platform`) at
  `$KVADRO_ROOT/demo/app/src/app/useAppBootstrap.js:53-61`; `app_error` with `error.tg` (= `WebApp.version`) and
  `error.platform` (`$KVADRO_ROOT/demo/app/index.html:69-90`, `$KVADRO_ROOT/demo/app/src/lib/errors.js:68-94`).
- PostHog super properties `screen`, `env`, `team`, `build`; `$pageview` screen names `search/map`, `map/draw`
  (`03` §3.3); the engine choice and lite mode (`03` §1.7–§1.8).
- Questions closed: Q-APP-001 (minimum WebView), Q-APP-018 (GL / Leaflet / lite share — decides KV-FE-059, FD-3),
  Q-APP-022 (`?map=` overrides used by support staff).
- Platform facts (`10` §3.11, `UNVERIFIED` until measured): iOS Telegram uses the system WKWebView, Android the
  updatable Android System WebView.

## Implementation

1. Write the query sheet `docs/migration/data/miniapp-client-distribution.md` (queries only, no data) for the person
   who holds PostHog access: 30 days of Mini App events (`$host` = the Mini App origin), grouped by
   `platform` × Telegram version × `$browser` × `$browser_version` × `$os` × `$os_version`; distinct persons and
   sessions per group.
2. Thresholds to compute: sessions and weekly active users below Chrome 111 / Safari 16.4 (Next default), below
   Chrome 87 / Safari 14, below Chrome 80 / Safari 13.1 (legacy target); Telegram Desktop and Web share; unknown UA.
3. Startup baseline: p50, p75, p95 of `app_launch.ms` per platform (journal `POST /api/events` or the PostHog copy),
   plus the share of sessions where `app_launch.sdk` reports a missing or late SDK.
4. Map split: sessions with a `search/map` `$pageview` grouped by `build` and the lite marker (`html.lite` is not an
   event — use `app_launch.js`/`build` or the replay flag `replay_rate`; if neither separates lite, record that
   Q-APP-018 needs a temporary event in the new app and say so).
5. `?map=` usage: distinct `$current_url` query strings containing `map=` (Q-APP-022).
6. **[PT]** The data holder runs the queries (read-only; touches production analytics → needs the developer's
   approval each time) and returns **aggregates only**: counts and percentages, no distinct ids, no person
   properties, no URLs with `tgWebAppData`.
7. Commit the aggregates as `docs/migration/data/miniapp-client-distribution.csv`
   (`platform,tg_version,engine,engine_version,sessions,wau`) and a short summary in the `.md` file: the shares for the
   three thresholds, the p75 startup, the GL/Leaflet/lite split, and the answer line for each Q-APP item.
8. Fallback if PostHog is unavailable: the journal's `app_launch` rows from the legacy action log once the dump exists
   (`14`), or a syntax-feature scan of a scratch copy of the production bundle (Q-APP-001 check: `??`, `?.`, class
   fields, top-level `await`) — never run tools inside the legacy tree.

## States and texts

n/a — a data task with no UI.

## Interaction

n/a.

## Telegram integration

TMA-041 (platform values `ios`, `android`, `android_x`, `tdesktop`, `weba`, `webk`, `macos`, `unknown`) and TMA-042
(version gates) define the grouping keys; the result tells which gates of TMA-042 still matter for real users.

## Storage and analytics

Reads the legacy analytics only. No new events in this task. If Q-APP-018 cannot be answered, the new Mini App adds a
`map_engine` property to `app_launch` (named in KV-FE-034; legacy name kept for every other property).

## Files

- `docs/migration/data/miniapp-client-distribution.md` (queries, summary — new)
- `docs/migration/data/miniapp-client-distribution.csv` (aggregates — new)

## API contract

n/a. Event shapes used for the queries: API-034 bodies (`08` §2) as listed above.

## Business rules

n/a (input to DEC-06). The decision rule itself is `10` §3.11: if sessions below the Next default floor are under the
threshold the product owner sets (suggested 1 % of weekly active users), option A with the default floor.

## Acceptance criteria

- The CSV holds only aggregates; a reviewer can recompute the three threshold shares from it.
- The summary states the p75 `app_launch.ms` per platform and the GL / Leaflet / lite split, or why it cannot.
- Q-APP-001, Q-APP-018 and Q-APP-022 each have an answer line or a stated reason they stay open.
- The product owner has been asked for the minimum Telegram version the product supports (`10` §3.11 data item 2) and
  the answer (or "no answer yet") is recorded.

## Tests

A reviewer check: totals in the CSV equal the session total of the query; no column holds identifiers.

## Edge cases

- Telegram Desktop and Web report desktop engines: kept as their own rows, never folded into Android.
- Sessions without `app_launch` (outside Telegram, SCR-002) are excluded from the floor shares and counted apart.
- PostHog drops events with Save-Data / 2g (analytics not loaded, `03` §3.3): the journal numbers are the
  denominator; note the bias.

## Security

No personal data leaves PostHog: aggregates only (SEC-REQ-047, SEC-REQ-041 spirit); the export is handled by the
production track; no screenshot of person lists in the PR.

## Definition of done

Both files merged; the summary linked from KV-FE-003; Q-APP rows updated in `03` §6.2 by their owner; PR reviewed by
the other developer.
