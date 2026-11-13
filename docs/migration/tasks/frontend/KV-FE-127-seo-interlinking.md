# KV-FE-127 — SEO interlinking blocks

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Frontend (track: development) |
| Complexity | M |
| Milestone | FE-3a (M9, stage S2) |
| Feature IDs | F-SEO-011 |
| Dependencies | KV-FE-116…KV-FE-123 (page templates that host the blocks), KV-FE-101 (path builder); backend KV-BE-164 (interlinking data; on disk, not yet listed in `12`), KV-BE-159; decisions DEV-050 `PROPOSED`, DEC-30; Q-SEO-017 |

## Goal

Every SEO page ends with the legacy link blocks to its neighbouring slices — other room counts, the other districts,
the district's quarters, nearby stations, the other sections of the same place, all cities and the by-owner page — each
link text carrying the target's current listing count, rendered from the slice's own snapshot; with DEV-050 approved,
links point only to indexable slices.

## Legacy reference

- LND-064 (interlinking blocks); `$KVADRO_ROOT/docs/seo-pages.md:144-145`, `:187`, blocks per type `:189-205`.
- Rules: BR-SEO-030 (neighbours; counts in link texts; the city page's owners link), BR-SEO-005 (data-driven slice set),
  BR-SEO-006 (thin pages `noindex,follow`).
- Defect / decision: LB-SEO-012 (thin pages linked from indexable ones; 94 of ~450 pages indexed) → DEV-050.
- Block headings per type (ru, from `03b` §2.3): «по комнатам», «по районам», «по кварталам и массивам», «у метро», the
  other section of the place, «по городам»; district pages: the district's rooms, all districts, the district's
  quarters, nearby stations, sale in the district with per-room counters; rooms pages: other room counts,
  «2-комнатные в других районах»; quarters: «Соседние кварталы»; stations: «Соседние станции»; sale prices: «Смотрите
  также».

## Implementation

1. `frontend/landing/components/seo/LinkBlocks.tsx` (Server Component) filling the frame's `{links}` slot (KV-FE-114):
   input `links {rooms[], districts[], quarters[], stations[], sections[], cities[], owners|null}`, each item
   `{slice_key, count, indexable}` (KV-BE-164); a per-kind configuration decides which groups appear and their order
   (legacy order per type above).
2. Hrefs built with `buildSeoPath(lang, slice_key)` of KV-FE-101 — never from strings in the API; labels from the place
   dictionary in the case the heading needs, plus the count with the plural rules of KV-FE-102 («Юнусабад · 611»; exact
   layout per the archive).
3. DEV-050 flag `dev050IndexableOnlyLinks` in `frontend/landing/lib/deviations.ts`, default off: off → every link the
   data lists (legacy); on → items with `indexable = false` are dropped and an empty group is hidden.
4. Neighbour groups that carry distances (quarters, stations) show distance and flats as KV-FE-120 / KV-FE-121 format
   them; this component only lays them out.
5. The section switch block («Аренда / Продажа / Новостройки» of the same place) links only to sections that exist for
   the place (`sections[]`).

## States and texts

| State | When | Rendering |
| ----- | ---- | --------- |
| normal | groups with items | headings and lists in the type's order |
| empty group | no items (or all non-indexable with DEV-050 on) | group hidden |
| zero count | `count = 0` | link kept with «0» (legacy) unless DEV-050 drops it as non-indexable |
| data-fetch failure | API error | last cached render of the whole page |

Texts: headings above (namespace `seo.links.*`), uz/en from the KV-FE-007 archive (Q-SEO-004).

## Interaction

Plain links; lists wrap; long district lists are not collapsed (crawl paths must stay in the HTML).

## Telegram integration

n/a.

## Storage and analytics

Through KV-FE-105 only (autocapture of link clicks).

## Files

- `frontend/landing/components/seo/{LinkBlocks,linkBlockConfig}.tsx` (new)
- `frontend/landing/lib/deviations.ts` (flag `dev050IndexableOnlyLinks`)
- `frontend/packages/i18n/src/catalogues/{ru,uz,en}/seo-links.ts` (new)
- `frontend/landing/tests/seo/LinkBlocks.test.tsx` (after KV-FE-010)

## API contract

Inside `GET /api/v1/public/seo/slices/{slice_key}?lang=` (KV-BE-159): `links {rooms[], districts[], quarters[],
stations[], sections[], cities[], owners|null}`, items `{slice_key, count, indexable}` (KV-BE-164).

## Business rules

- Kept: BR-SEO-030, BR-SEO-005.
- DEV-050 `PROPOSED` (link and indexing policy) behind its flag; test `todo('DEV-050 PROPOSED')`. The thin-page
  threshold itself is DEC-30 (KV-FE-128).

## Acceptance criteria

- For one page per type and language, the link groups, their order and their targets equal the archived page
  (KV-FE-007); counts equal the target pages' counters in the same snapshot.
- Every link target answers `200` in the URL suite (KV-QA-014); no link points to a `404`.
- With DEV-050 on, no link points to a page with `noindex`.

## Tests

- Unit: per-kind configuration (district, rooms, quarter, station, city with and without districts, hub).
- Component: groups hidden when empty; flag off/on.
- E2E (mocked API): crawl all links of five fixture pages and assert `200` and matching counts.

## Edge cases

- A target slice deleted between snapshots: it disappears from the data, so no dead link.
- Self-links (the current page in «по районам»): rendered as the current item without a link, as the archive shows.

## Security

SEC-REQ-021 (labels as text); hrefs only from the internal builder.

## Definition of done

`make ci-frontend` green; tests green (or added when KV-FE-010 lands); archive comparison recorded in the PR; parity
gate G4 for F-SEO-011 ticked; PR reviewed by the other developer.
