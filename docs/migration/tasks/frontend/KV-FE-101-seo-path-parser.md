# KV-FE-101 — SEO path parser and builder

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Frontend (track: development) |
| Complexity | M |
| Milestone | FE-3a (M9, stage S2) |
| Feature IDs | F-SEO-001 |
| Dependencies | KV-FE-100; KV-DB-006, KV-DB-034 (gazetteer dictionaries and slugs); backend resolution KV-BE-157 (`SliceKey`), KV-BE-159 (`seo/resolve`, `places`); decisions: DEV-045, DEV-047, DEV-048 `PROPOSED`; Q-SEO-010, Q-SEO-020 |

## Goal

One pure module, `parseSeoPath` / `buildSeoPath`, owns the slug tables of `03b` §2.2: it turns any request path into a
slice description (or "not found") and any slice into the path of each language. The page, canonical, hreflang,
sitemap, interlinking, footer links and CTA builders all use it, so one table defines every one of the 1 008 URLs, and
its output agrees with the backend's `SliceKey::fromPath` / `toPath` (KV-BE-157) on a shared fixture.

## Legacy reference

- URL-023…URL-039 (`03b` §6.2), address scheme `03b` §2.2, page inventory `03b` §2.1 (336 pages per language).
- Rules: BR-SEO-001 (service slugs translated, place slugs not), BR-SEO-002 (place slugs: lower case, hyphens, Uzbek
  Latin without apostrophes; data codes with underscores ↔ slugs with hyphens), BR-SEO-003 (rooms slugs and ranges:
  rent 1–3, sale and new builds 1–4), BR-SEO-004 (routing table, reserved slugs), BR-SEO-005 (which slices exist).
- Defects and deviations: LB-SEO-004 → DEV-045, LB-SEO-008 → DEV-047, LB-SEO-009 → DEV-048.
- Evidence: `$KVADRO_ROOT/docs/seo-pages.md:73-129`; `10` §5.3 ("a single path parser and builder").

## Implementation

1. Read `frontend/landing/node_modules/next/dist/docs/01-app/03-api-reference/04-functions/generate-static-params.md`
   and `01-app/02-guides/incremental-static-regeneration-cache-components.md` (params outside `generateStaticParams`
   render on demand behind the App Shell).
2. `frontend/landing/lib/seo/slugs.ts`: the service-slug table per language — rent `arenda | ijara | rent`, sale
   `prodazha | sotuv | sale`, new builds `novostrojki | novostroyka | new-builds`, rooms `N-komnatnye | N-xonali | N-room`,
   by owner `bez-posrednikov | maklersiz | by-owner`, index `indeks | indeks | index`, methodology
   `metodika | metodika | methodology`, prices `ceny | narxlar | prices`, metro `metro` in all three (Q-SEO-010 until
   the archive of KV-FE-007 confirms it).
3. `frontend/landing/lib/seo/path.ts`: `parseSeoPath(lang, segments) → SeoRoute | NotFound` for the patterns hub,
   city, city + rooms, district, district + rooms, quarter (rent, `tashkent` only), metro hub, metro station, by-owner
   city, by-owner district, rent index, methodology, sale prices; `buildSeoPath(route, lang) → string` (always with the
   prefix and the trailing slash). Place slugs come from the place dictionary (`GET /api/v1/public/places?lang=` of
   KV-BE-159, cached with `use cache` + `cacheTag('places')`), never from free text.
4. Reserved slugs (BR-SEO-004) are checked before place lookup: `metro` and the three by-owner slugs at the district
   level; index, methodology and prices slugs at the city level. Rooms out of range (`/arenda/…/4-komnatnye/`), a quarter
   under `prodazha`, `/prodazha/tashkent/metro/`, `/novostrojki/ceny/` → not found.
5. Strict matching: exact case, exact language of every service slug. Optional DEV behaviour behind flags in
   `frontend/landing/lib/deviations.ts` (default off): `dev045PageParamRedirect` (`?page=N` → `301` to the
   parameter-less URL; `utm_*` and `s` keep `200` + canonical), `dev047LowercaseRedirect` (mixed case → `301` to the
   lower-case path when it resolves, else `404`), `dev048ForeignSlugRedirect` (`/uz/arenda/…` → `301` to the same
   slice with `uz` slugs). The backend resolve endpoint has the same switches (`seo.redirect_*`, KV-BE-159); the
   frontend flag and the backend config are turned on together, and the catch-all honours a `redirect` returned by
   `seo/resolve`.
6. Query handling (BR-SEO-004): `?sort=cheap|expensive|below` is passed to the page (KV-FE-115 sets `noindex`);
   every other parameter is ignored for rendering and dropped from the canonical.
7. `generateStaticParams` of `app/[lang]/[...slug]` returns the indexable slices from `GET /api/v1/public/seo/sitemap`
   (KV-BE-163) so they prerender; thin slices render on demand (`200` + `noindex,follow`, KV-FE-128).
8. Agreement with the backend: a fixture `frontend/landing/tests/fixtures/seo-paths.json` — the generated 1 008-path
   list of KV-QA-014 plus negative cases — asserted here and by the backend's `SliceKey` tests (shared file path named
   in both PRs).

## States and texts

n/a — a pure module. Its "not found" result drives the localised 404 of KV-FE-100.

## Interaction

n/a — no UI.

## Telegram integration

n/a.

## Storage and analytics

n/a.

## Files

- `frontend/landing/lib/seo/slugs.ts`, `frontend/landing/lib/seo/path.ts`, `frontend/landing/lib/seo/places.ts` (new)
- `frontend/landing/app/[lang]/[...slug]/page.tsx` (calls the parser; page bodies by KV-FE-114…KV-FE-126)
- `frontend/landing/lib/deviations.ts` (three flags)
- `frontend/landing/tests/seo-path.test.ts`, `frontend/landing/tests/fixtures/seo-paths.json`

## API contract

- `GET /api/v1/public/places?lang=ru|uz|en` (KV-BE-159): cities, districts, quarters, stations with `key`, `slug`,
  `name`, cases. Server-to-server with the `public-data:read` token from `PUBLIC_API_INTERNAL_URL` (`17` §4); never in
  the browser.
- `GET /api/v1/public/seo/resolve?lang=&path=` (KV-BE-159): `{slice_key, kind, canonical, alternates, indexable,
  noindex_reason, redirect}`; `404` with `data.links` for unknown paths. The local parser answers first (no request for a
  syntactically impossible path); resolve is authoritative for data existence (BR-SEO-005, Q-SEO-008).
- `GET /api/v1/public/seo/sitemap` (KV-BE-163) for `generateStaticParams`.

## Business rules

- Kept: BR-SEO-001, BR-SEO-002, BR-SEO-003, BR-SEO-004, BR-SEO-005.
- DEV-045, DEV-047, DEV-048 `PROPOSED` behind flags (tests `todo('DEV-045 PROPOSED')`, `todo('DEV-047 PROPOSED')`,
  `todo('DEV-048 PROPOSED')`).

## Acceptance criteria

- `parseSeoPath` accepts all 1 008 fixture paths and returns the slice the backend fixture names; `buildSeoPath` of
  that slice returns the same path byte for byte, in all three languages.
- `/arenda/tashkent/yunusobod/2-komnatnye/` = `/uz/ijara/tashkent/yunusobod/2-xonali/` =
  `/en/rent/tashkent/yunusobod/2-room/` (one slice, three paths).
- Negative fixture cases are not found: `/arenda/tashkent/yunusobod/4-komnatnye/`, `/prodazha/tashkent/metro/`,
  `/novostrojki/ceny/`, `/prodazha/tashkent/yunusobod/minor/`, `/Arenda/`, `/uz/arenda/`, `/en/prodazha/`.
- `?page=2` renders the same page with a parameter-less canonical (flag off); `?sort=cheap` reaches the page.
- With all three DEV flags off the URL suite of KV-QA-014 (rows URL-023…URL-039) passes unchanged.

## Tests

- Unit (`seo-path.test.ts`): round trip on the fixture; one case per pattern and language; reserved-slug collisions;
  rooms ranges per section; case sensitivity; underscore data code `mirzo_ulugbek` ↔ slug `mirzo-ulugbek`.
- Contract: the fixture equals the backend's `SliceKey` output (the same file is read by the backend test).
- DEV flags: `todo('DEV-045 PROPOSED')`, `todo('DEV-047 PROPOSED')`, `todo('DEV-048 PROPOSED')`.

## Edge cases

- Tashkent region districts that may be towns (`chirchiq`, `olmaliq`, `zangiota`, `qibray`, `toshkent-tumani`,
  Q-SEO-020): the dictionary decides the level; the parser only checks that the slug exists at the requested level.
- A slug present in the dictionary but with no slice data: resolve answers not found → `404` (or `200 noindex` when it
  is a known thin slice, BR-SEO-036 / Q-SEO-008).
- Quarter slugs nested under the district that owns them by the hokimiyat (`uchtepa/chilonzor-26`): the parent must
  match, `chilonzor/chilonzor-26` is not found.
- Trailing `index.html` inside a section path: not found.

## Security

- SEC-REQ-021: the parser output is the only input to URL building; no request text is reflected into HTML.
- The public-data token stays server-side (`PUBLIC_API_INTERNAL_URL`, not a `NEXT_PUBLIC_*` variable).

## Definition of done

`make ci-frontend` green; parser tests green on the shared fixture; the backend test of KV-BE-157 reads the same
fixture; parity gate G4 for F-SEO-001 ticked (`15` §4); `09` row updated; PR reviewed by the other developer.
