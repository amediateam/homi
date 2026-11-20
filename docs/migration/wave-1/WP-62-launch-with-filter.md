# WP-62 — Mini App launch with a search filter

| Field | Value |
| ----- | ----- |
| Stage | E |
| Status | TODO |
| Depends on | WP-25, WP-36 |
| Size | about 900 changed lines, S — the grammar with its tests in `@homi/search` (about 350), the launch wiring in the Mini App with its tests (about 400), one end-to-end spec |
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
  the gates treat it as they treat a listing launch.
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
  `[A-Za-z0-9_-]` (the bound `lib/deeplinks/build.ts` already applies to bot payloads).
- `encodeLaunchFilter(input: { deal: "rent" | "sale"; city: string; district?: string; rooms?: number; priceMax?:
  number; ownersOnly?: boolean; source?: "web" }): string` throws on a value outside the grammar (the landing builds
  its links at render time, so a bad value fails the build or the test, never a visitor).
- `decodeLaunchFilter(param: string): LaunchFilter | null` never throws. `null` when the prefix, the deal or the city
  is missing or malformed. A later segment that is malformed, repeated or out of order ends the decoding: what was
  read before it is kept, the rest is dropped (*integrator's choice: a partly valid link still opens the deal and
  city it names*).
- `filtersFromLaunch(filter: LaunchFilter, rules?: Partial<SearchRules>): SearchFilters` starts from
  `defaultFilters(deal, city)`, applies the district, `pickRooms`, `price_max` and `owner`, and passes the result
  through `normalizeFilters`, so a district the city does not have and a price outside `FILTER_LIMITS` are dropped
  by the same rules as an address.

### Mini App

- `lib/deeplinks/parse.ts`: `Launch` gains `filter: LaunchFilter | null`, read from `start_param` when it starts with
  `f_`; `source` is `web` for `-web` and `null` otherwise. `listingNumber` stays `null` for such a launch, so every
  existing rule for `l_…` is unchanged.
- `lib/deeplinks/launch.ts`: `launchTarget` returns, for a filter launch,
  `routes.feed(toSearchParams(filtersFromLaunch(filter, rules)))` with the reference rules of the session, unless
  this launch has already shown it. The mark is the one a listing launch uses (`homi-launch-done`, a digest of the
  launch hash and the parameter), so a reload in the same launch does not reapply it and a new launch does.
- Gates (WP-23, WP-36): a filter launch is pending and consumed exactly like a listing launch — after the language
  gate, released by the same timeout (`LAUNCH_PENDING_MS`). The first-launch city picker is not shown for a filter
  launch: the launch names its city; the city is not saved as the user's city (*integrator's choice; the reader
  checks `resolveGate` in step 1 and records the rule in the PR if it differs*).
- Analytics: the launch event of WP-32, when it exists, carries `source` (`web`) and `entry: "filter"`.

## Files

All paths under `frontend/`.

- `packages/search/src/launch.ts`, `packages/search/src/index.ts`, `packages/search/tests/launch.test.ts`
- `app/lib/deeplinks/parse.ts`, `app/lib/deeplinks/launch.ts`, their tests under `app/lib/deeplinks/`
- `app/e2e/launch-filter.spec.ts`

## Steps

1. Read WP-21's `lib/deeplinks`, WP-22's `lib/search`, `resolveGate` and the launch redirect of WP-23 and WP-36, and
   `05` TMA-010 … TMA-012.
2. The grammar: encoder, decoder, `filtersFromLaunch`, with the unit tests of row 1.
3. `parseLaunch` and `launchTarget`, the gate rule; unit tests of row 2.
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
| 1 | Unit (`@homi/search`) | `launch.test.ts` | encode → decode round trip for every field; `f_rent-ctashkent` alone; `f_sale-ctashkent-dmirzo_ulugbek-r4-m250000-o-web` (the longest showcase form, under 64 characters); a bad deal, a missing city, a 65-character parameter, an unknown segment, a repeated segment and segments out of order; the encoder throws on rooms 5 and on a price of 0; `filtersFromLaunch` drops a district of another city and a price over the limit; rooms 4 → `rooms_min` 4 without a maximum |
| 2 | Unit (app) | `parse` and `launch` tests | `start_param` `f_…` → `filter` set, `listingNumber` null; `l_…` launches unchanged; `launchTarget` gives the feed address with the expected search; a second call in the same launch gives `null`; a new launch hash gives the address again |
| 3 | End to end (Playwright, stub driver) | `launch-filter.spec.ts` | the fake Telegram launches with `f_rent-ctashkent-dyunusobod-r2-m700-o-web` → the feed address carries that search and the chips show it; reload → the same page, no second redirect; a first launch without a saved city skips the city picker |

## Acceptance checklist

- [ ] A showcase link from the landing on staging opens HOMI's Mini App on the feed with the district, rooms, budget
      and «только хозяева» of the form, in rent and in sale.
- [ ] A reload inside the same launch stays on the page; opening the link again applies it again.
- [ ] A listing link `l_<number>-web` behaves as before.
- [ ] A broken parameter opens the Mini App as a plain launch, without an error.
- [ ] Unit, end-to-end and `make ci-frontend` are green.

## Handoff

Empty — nobody has started this package.
