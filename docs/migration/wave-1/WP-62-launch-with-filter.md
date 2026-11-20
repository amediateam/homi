# WP-62 — Mini App launch with a search filter

| Field | Value |
| ----- | ----- |
| Stage | E |
| Status | TODO |
| Depends on | WP-25, WP-36 |
| Size | about 1 100 changed lines, S–M — the grammar with its tests in `@homi/search` (about 350), the launch target, the pending rule, the mark, the redirect and the city gate with their tests (about 600), one end-to-end spec |
| Behaviour reference | `03b` LND-065, BR-LND-026, URL-064 (the showcase search that legacy sends to its SEO pages); `05` TMA-010 … TMA-012 (launch parameters); `09` DEV-067; WP-21 (`lib/deeplinks`), WP-22 (the search state in the address), WP-23 and WP-36 (the gates and the launch redirect) |
| Needs from the production track | nothing (Mini App code on stubs; the regular deploy) |

## Goal

A link `https://t.me/<bot>?startapp=f_…` opens HOMI's Mini App on the feed with the search the link names: deal,
city, district, rooms, a price ceiling and «только хозяева». The landing's showcase (WP-61, DEC-95) builds these
links for its search form and its district links, where legacy links its SEO pages; one grammar, shared by both
apps, encodes and decodes them.

## Scope

In:

- The launch filter grammar in `@homi/search`: an encoder from a partial search to the `f_…` parameter and a decoder
  back, both pure.
- The Mini App: `parseLaunch` reads a filter launch; `launchTarget` opens the feed with that search once per launch;
  the launch redirect, the pending rule and the city gate learn a target that is an address with a query.
- Tests at every layer and the checklist inside Telegram.

Out:

- The landing's links and its showcase — WP-61, which calls the encoder.
- The bot: `?startapp=` opens the Mini App directly; no `/start` payload changes (WP-52).
- Any other filter of the 25 keys: the grammar carries only what the showcase asks for. A wider grammar is a new
  decision.

## Decisions that bind this package

| # | Decision | Consequence here |
| - | -------- | ---------------- |
| 1 | DEC-95, DEV-067 | The showcase's search and district links open the Mini App's feed with the filter, not the SEO pages (Wave 3); a card opens the listing (`l_<number>-web`), which needs nothing new |
| 2 | WP-21 launch rules (TMA-010 … TMA-012) | A launch target is consumed once per launch; a reload in the same launch does not apply it again; the legacy `l_…` forms keep their meaning |
| 3 | WP-22, `25` §3.4 | The search lives in the address: the launch is a navigation to `routes.feed(toSearchParams(filters))`, never a write to a store |
| 4 | DEC-49 | No new package |

## Design

### Grammar

`packages/search/src/launch.ts`, exported from `@homi/search`:

```text
f_<deal>-c<city>[-d<district>][-r<rooms>][-m<price>][-o][-<source>]

deal      rent | sale                 rent → deal rent_long, sale → deal sale
city      [a-z][a-z0-9_]{1,30}        a city code of the reference data
district  [a-z][a-z0-9_]{1,30}        a district code of that city
rooms     [1-4]                       pickRooms(n): 4 means «4 and more», as the filter's room chips
price     [1-9][0-9]{0,6}             price_max in whole USD
o         —                           owner = owners («только хозяева»)
source    web                         where the link was made (the landing); analytics only
```

- Segments come in this order, each at most once; the whole parameter is at most 64 characters of
  `[A-Za-z0-9_-]`: the bound `lib/deeplinks/build.ts` applies to bot `start` payloads; the repository documents no
  `startapp` limit, so the same bound is kept for safety (the longest showcase form has 48).
- `encodeLaunchFilter(input: { deal: "rent" | "sale"; city: string; district?: string; rooms?: number; priceMax?:
  number; ownersOnly?: boolean; source?: "web" }): string` throws on a value outside the grammar (the landing builds
  its links at render time, so a bad value fails the build or the test, never a visitor).
- `decodeLaunchFilter(param: string): LaunchFilter | null` never throws. `null` when the prefix, the deal or the city
  is missing or malformed. A later segment that is malformed, repeated or out of order ends the decoding: what was
  read before it is kept, the rest is dropped (*integrator's choice: a partly valid link still opens the deal and
  city it names*). The grammar's own bounds (rooms 1 … 4, a price of at most seven digits) are the only range checks;
  `FILTER_LIMITS` allows any safe integer, so it drops nothing here.
- `filtersFromLaunch(filter: LaunchFilter, city: { code: string; districts: readonly { code: string }[] } | null):
  SearchFilters | null` starts from `defaultFilters(deal, city)`, applies the district, `pickRooms`, `price_max` and
  `owner`, and passes the result through `normalizeFilters`. `normalizeFilters` checks codes only by their form, so
  the city of the reference data is passed in: an unknown city gives `null` (no target), a district the city does not
  have is dropped (*integrator's choice*).

### Mini App

- `lib/deeplinks/parse.ts`: `Launch` gains `filter: LaunchFilter | null`, read from `start_param` when it starts with
  `f_`; `source` is `web` for `-web` and `null` otherwise. `listingNumber` stays `null` for such a launch, so every
  existing rule for `l_…` is unchanged.
- `lib/deeplinks/launch.ts` (today written for a listing target: a target is compared by its path only, and the mark
  `homi-launch-done` takes a listing number):
  - `launchTarget` returns, for a filter launch, `routes.feed(toSearchParams(filters, sort))` with the filters of
    `filtersFromLaunch` (the city from the cached reference data, `lib/reference`), unless this launch has already
    shown it.
  - The mark generalises from a number to a key: `l:<number>` for a listing, `f:<parameter>` for a filter, digested
    with the launch hash as today (`launchMark`, `listingOpened`), and written when the target has been shown, for
    both kinds (`targetNumber` becomes `targetKey`).
  - `launchPending` compares a filter target by the whole address: the path and the search parameters as
    `fromSearchParams` reads them, not the path alone — the feed's path `/` is also the address the Mini App opens on,
    so a path match would end the wait before the redirect lands and `LAUNCH_PENDING_MS` would never apply.
- `features/shell/LaunchRedirector.tsx`: a filter target is opened with `replace`, not `push`, so Back from the
  filtered feed closes the Mini App as from any first page instead of showing the unfiltered feed under it
  (*integrator's choice*); a listing target is pushed as today.
- `features/gates/resolveGate.ts` and `GateRedirector.tsx`: the city picker waits today only while the address is a
  listing or `launchPending()` is true, so a listing launch delays the picker, it does not skip it. A filter launch
  skips it for the whole launch: a new input `launchCity` (true from `consumeLaunch()` of a filter launch until the
  Mini App closes) is read next to `launchPending` in the city row. `city_chosen` stays false, so the next plain
  launch asks for the city; the launch's city is not saved (*integrator's choice: the link names its city, and a
  picker over the filtered feed would hide what the visitor asked for*).
- Analytics: the launch event of WP-32, when it exists, carries `source` (`web`) and `entry: "filter"`.

## Files

All paths under `frontend/`.

- `packages/search/src/launch.ts`, `packages/search/src/index.ts`, `packages/search/tests/launch.test.ts`
- `app/lib/deeplinks/parse.ts`, `app/lib/deeplinks/launch.ts`, their tests under `app/lib/deeplinks/`
- `app/features/shell/LaunchRedirector.tsx`, `app/features/gates/resolveGate.ts`,
  `app/features/gates/GateRedirector.tsx` and their tests
- `app/e2e/launch-filter.spec.ts`

## Steps

1. Read WP-21's `lib/deeplinks`, WP-22's `lib/search`, `resolveGate` and the launch redirect of WP-23 and WP-36, and
   `05` TMA-010 … TMA-012.
2. The grammar: encoder, decoder, `filtersFromLaunch`, with the unit tests of row 1.
3. `parseLaunch`, `launchTarget`, the generalised mark and the whole-address pending rule; the replace in
   `LaunchRedirector`; the `launchCity` row of `resolveGate`; unit tests of row 2.
4. The end-to-end spec; `make ci-frontend`; PR; deploy with the production track; the checklist inside Telegram.

## Behaviour to reproduce

Legacy has no such launch: its showcase sends the same search to an SEO area page
(`<section>/tashkent/[<district>/]?rooms=<1–4>&max=<USD>&owners=1`, BR-LND-026). HOMI keeps the meaning of each
field: the deal of «Снять / Купить», Tashkent, the district chosen in the form or the district link, the rooms
1 … 4 (4 = 4+), the budget as a ceiling in USD, «только хозяева». An empty form opens the feed of the deal in
Tashkent.

## Tests

| # | Layer | Test | Cases |
| - | ----- | ---- | ----- |
| 1 | Unit (`@homi/search`) | `launch.test.ts` | encode → decode round trip for every field; `f_rent-ctashkent` alone; `f_sale-ctashkent-dmirzo_ulugbek-r4-m250000-o-web` (the longest showcase form, 48 characters); a bad deal, a missing city, a 65-character parameter, an unknown segment, a repeated segment and segments out of order; the encoder throws on rooms 5, on a price of 0 and on an eight-digit price; `filtersFromLaunch` drops a district the given city does not have and gives `null` without a city; rooms 4 → `rooms_min` 4 without a maximum |
| 2 | Unit (app) | `parse`, `launch`, `resolveGate`, `LaunchRedirector` tests | `start_param` `f_…` → `filter` set, `listingNumber` null; `l_…` launches unchanged; `launchTarget` gives the feed address with the expected search; `launchPending` stays true on `/` without the search and ends on the filtered address; the mark is written for a filter target, so a second call in the same launch gives `null` and a new launch hash gives the address again; the filter target is replaced, a listing pushed; the city row is skipped for a filter launch and not for a listing launch |
| 3 | End to end (Playwright, stub driver) | `launch-filter.spec.ts` | the fake Telegram launches with `f_rent-ctashkent-dyunusobod-r2-m700-o-web` → the feed address carries that search and the chips show it; reload → the same page, no second redirect; Back closes the Mini App (the fake's `close` is called); a first launch without a saved city shows the filtered feed without the city picker, and the next plain launch shows the picker |

## Acceptance checklist

- [ ] A showcase link from the landing on staging opens HOMI's Mini App on the feed with the district, rooms, budget
      and «только хозяева» of the form, in rent and in sale.
- [ ] A reload inside the same launch stays on the page; opening the link again applies it again; Back from the
      filtered feed closes the Mini App.
- [ ] A first-time user reaches the filtered feed without the city picker; the next plain launch asks for the city.
- [ ] A listing link `l_<number>-web` behaves as before.
- [ ] A broken parameter opens the Mini App as a plain launch, without an error.
- [ ] Unit, end-to-end and `make ci-frontend` are green.

## Handoff

Empty — nobody has started this package.
