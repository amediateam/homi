# KV-FE-107 — Landing data contract and snapshot rendering

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Frontend (track: development) |
| Complexity | M |
| Milestone | FE-3b (M9, stage S4) |
| Feature IDs | F-LANDING-003, F-MEDIA-004, F-PIPELINE-008 |
| Dependencies | KV-FE-100, KV-FE-102; KV-BE-154 (`live.json`), KV-BE-155 (`pins-*.json`), KV-BE-156 (snapshots); decisions: DEV-012, DEV-039 `PROPOSED`, Q-LND-002, Q-LND-010 |

## Goal

The re-implemented landing reads the landing data snapshot (`live.json`, `pins-rent.json`, `pins-sale.json` and the pin
photos) through one typed, validated loader, renders its numbers on the server so crawlers and no-JS visitors see the
same truthful figures as the live page, and degrades to "no numeric claim" instead of placeholder numbers when the data
is missing (DEV-039). Until S4 the legacy landing keeps reading the same files (backend tasks), so the contract does not
change.

## Legacy reference

- LND-032 (loader `getData(name)`: `data/<name>.json?v=202610171944`, once per page view, cache entry cleared on
  failure; consumers: `live.json` → sheet numbers, lock screen, `#live`, final; `pins-rent.json` on entry;
  `pins-sale.json` preloaded on live entry or first «Продажа»; files rewritten several times a day, `max-age=1800`),
  LND-036 (generated files and their replacements), `03b` §1.5 (data contract), RES-010, RES-011, RES-012, RES-013,
  URL-019, URL-020.
- *Since landing release `67b3942a8340` (landing intake):* `live.json` is also read at load for the hero count and by the showcase
  (`showcase.<deal>.districts`, `now`), which reads the pins' card fields (`photo`, `age_min`, `floor`, …); since
  2026-11-19 pins' `district`, `district_code` and `floor` may be `null` and `latest[]` has no `area: null`
  (`08` RES-010 … RES-012).
- Defects and deviations: LB-LND-004 (point medians shown as districts, fix `APPROVED`), LB-LND-005 (versioning,
  `APPROVED`), LB-LND-006 → DEV-039 (placeholder numbers), LB-LND-012 → DEV-012 (unsigned snapshots).
- Rules: BR-LND-007 (counters), BR-LND-008 (savings), BR-LND-009 (weekly bargains), BR-LND-010…BR-LND-016 (consumers in
  KV-FE-111, KV-FE-112).
- Source: `$KVADRO_ROOT/demo/landing/site/landing.js:61-75`; fixtures
  `$KVADRO_ROOT/demo/landing/tools/parity/fixtures/data/{live,pins-rent,pins-sale}.json` (prod snapshot of 2026-11-08,
  replaced by that of 2026-11-12 with `showcase` since `67b3942a8340`; read for shapes only — no listing data is copied into the repository).

## Implementation

1. Read `frontend/landing/node_modules/next/dist/docs/01-app/02-guides/incremental-static-regeneration-cache-components.md`
   and `01-app/03-api-reference/04-functions/{cacheLife,cacheTag}.md`.
2. `frontend/landing/lib/landing-data.ts`: types `LiveData`, `PinsData` exactly as the backend contracts of KV-BE-154
   and KV-BE-155 (`now`, `day`, `week`, `latest[]`, `sheet.all|demo`, `generated_at`; `pins[]`, `medians[]`,
   `bargains_week`, `generated_at`); a hand-written validator (no schema library unless approved, KV-FE-005) that
   drops entries of the wrong shape, keeps tones in `good | high | same | mixed | no_repair | null`, and keeps only
   `medians` whose `district_code` has a dictionary name (defensive LB-LND-004 fix even if the backend sends `pt:`
   entries).
3. Server fetch from the internal data path (`PUBLIC_API_INTERNAL_URL` host or the public storage path, `17` §7) inside a
   `'use cache'` function with `cacheLife({revalidate: 1800})` (the legacy `max-age=1800`) and
   `cacheTag('landing-data')`; the page renders counters, the savings block and the static push from it.
4. Client consumers (live map, pushes, sale pins) receive the server data as props; `pins-sale.json` is fetched lazily on
   the first «Продажа» from a URL versioned with `generated_at` (`/data/pins-sale.json?v=<generated_at hash>`), with
   root-relative paths only (LB-LND-001). A failed fetch is retried on the next use, as legacy.
5. DEV-039 flag `dev039NoPlaceholderNumbers` in `frontend/landing/lib/deviations.ts` (default off): off → when data is
   missing the legacy fallback content is shown (`PC_FALLBACK` medians, the markup's example numbers); on → numeric
   claims are hidden or rendered with an "example" label (new key `landing.example` «Пример» — not in legacy; uz/en to
   translate, product owner review).
6. DEV-012 flag `dev012MediaPipelineSnapshots` (default off): the frontend accepts both the legacy relative
   `img/snap/<id>.webp` and absolute media-pipeline URLs in `photo`, and never builds photo URLs itself; on → only
   media-pipeline URLs are expected (the backend switch of KV-BE-156) and `img-src` of KV-FE-104 gains that host.
7. Dropped: `dots` (unused), the stale `DATA_V` constant, the comments naming `/api/landing/*` (RES-016; legacy
   removed them itself in `d9bbbc696337`).

## States and texts

| State | Shown when | Effect |
| ----- | ---------- | ------ |
| loading | never on the server path; client-only sale pins while fetching | the rent pins stay visible |
| success | snapshot valid | numbers server-rendered; `generated_at` drives ages |
| empty | `latest[]` or `pins[]` empty | the push list and the live map render without items; counters follow BR-LND-007 (hidden under 100) |
| error / missing | fetch fails or the file is invalid | flag off: legacy fallback numbers; flag on: blocks without numbers (`landing.example` label where a sample stays) |
| stale | `generated_at` older than 6 h | render as is and report one warning to the server log (no user-visible text) |

## Interaction

n/a — data layer. Interactions live in KV-FE-111 and KV-FE-112.

## Telegram integration

n/a (the `link` fields are Mini App deep links validated by KV-FE-106).

## Storage and analytics

n/a.

## Files

- `frontend/landing/lib/landing-data.ts`, `frontend/landing/lib/landing-data.validate.ts` (new)
- `frontend/landing/lib/deviations.ts` (`dev039NoPlaceholderNumbers`, `dev012MediaPipelineSnapshots`)
- `frontend/landing/tests/landing-data.test.ts`, `frontend/landing/tests/fixtures/landing-data/*.json` (synthetic, shaped
  like the legacy fixtures)

## API contract

- `GET /data/live.json` (RES-010, KV-BE-154), `GET /data/pins-rent.json`, `GET /data/pins-sale.json` (RES-011, RES-012,
  KV-BE-155): shapes as in those tasks; query ignored by the server; `Cache-Control: public, max-age=1800`.
- `GET /img/snap/<number>.webp` (RES-013, URL-020, KV-BE-156) → `200 image/webp` while the listing is a current pin,
  `404` otherwise.

## Business rules

- Kept: BR-LND-007 (counters ≥ 100), BR-LND-008, BR-LND-009 (bargain = 20 % threshold of the backend, Q-LND-010 open).
- Defect fixes `APPROVED`: LB-LND-004, LB-LND-005.
- DEV-039 and DEV-012 `PROPOSED` behind flags (tests `todo('DEV-039 PROPOSED')`, `todo('DEV-012 PROPOSED')`).

## Acceptance criteria

- With the synthetic fixtures the server HTML contains the same counter, savings and push numbers the live client
  shows (no client-only numbers).
- A `medians` entry `pt:41.2011:69.1883` never reaches the savings district row.
- With the data endpoint down, the page still renders `200` with every non-numeric block (flag on) or the legacy
  fallback numbers (flag off).
- Landing parity scenarios `live-phone-v1`, `deal-sale`, `{ru,uz,en}-desktop-live` (KV-QA-013) see the same numbers as
  the legacy page fed with the same fixture data.

## Tests

- Unit: validator on valid fixtures, missing keys, wrong types, `pt:` medians, unknown tone; versioned URL builder.
- Component: counter rendering for `day` 99/100, `week` 99/100 (BR-LND-007).
- `todo('DEV-039 PROPOSED')`, `todo('DEV-012 PROPOSED')`.

## Edge cases

- `pins-sale.json` with empty `medians` and `bargains_week: null` (legacy sale file): the savings block stays rent-only.
- A listing withdrawn between snapshot and render: its photo answers `404` (KV-BE-156); the card hides the image instead
  of showing a broken icon.
- Clock skew: ages are relative to the snapshot `now`, never to the visitor's clock (BR-LND-014).

## Security

SEC-REQ-021: every data string (district, point, prices) is rendered as text. SEC-REQ-025: no photo URL is minted by the
frontend; takedowns and purges remove photos server-side. No phone, text or author data is part of the contract.

## Definition of done

`make ci-frontend` green; loader tests green; the flags in place; parity gate G4 for F-LANDING-003 (data part),
F-MEDIA-004 and F-PIPELINE-008 (landing part) ticked (`15` §4); `09` rows updated; PR reviewed by the other developer.
