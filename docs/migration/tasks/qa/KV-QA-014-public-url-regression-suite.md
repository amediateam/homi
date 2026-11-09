# KV-QA-014 — Public-URL and deep-link regression suite

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | QA (track: development); staging and production runs by the production track |
| Complexity | L |
| Feature IDs | F-SEO-001 … F-SEO-012, F-LANDING-005, F-LANDING-007, F-LANDING-009, F-SHARE-002, F-ONBOARD-005, F-MEDIA-001, F-MEDIA-003, F-PRIVACY-001 |
| Dependencies | KV-DB-006 (gazetteer and slugs); Q-SYS-006 (domain profile); the landing, SEO, media, call and CSV routes (KV-FE and KV-BE tasks); KV-QA-003 for payload cases |

## Goal

Every must-keep public URL pattern and every SEO URL answers as the cut-over rules require, in the profile the domain
decision selects, and every legacy `start` / `startapp` payload is parsed as documented.

## Legacy reference

- URL contract: `03b` §6.1–§6.3, `data/public-urls.json` (62 patterns, 49 must keep), URL-001 … URL-062.
- SEO scheme and counts: `03b` §2.1–§2.2 (1 008 pages, 336 per language), LND-040 … LND-064, BR-SEO-002 …
  BR-SEO-004, BR-SEO-034, BR-SEO-035.
- Deep links: `04` §6.1, BOT-027 … BOT-034, TMA-010 … TMA-013, BR-BOT-096.
- Fix decisions: DEV-037, DEV-038, DEV-040, DEV-041, DEV-045, DEV-047, DEV-048, DEV-049, DEV-050 (`PROPOSED`).
- Expectations table: `15` §3.9.

## Implementation

1. Unit tests for the payload parsers (`backend/tests/Unit/DeepLinks/{StartPayloadTest,StartAppParamTest}.php`):
   datasets from `03b` §6.3 and `04` §6.1 — `s_web`, `s_web_<40 chars>`, `--v<10 chars>` with the 49-character cut,
   `s_seo[_uz|_en][_<slice>]`, `s_<source>--l<id>`, `s_friend`, `l_<id>`, 64 bytes of junk, Unicode; `l_<id>`,
   `l_<id>-web`, `l_<id>-fb12`, `l_<id>-seo-<channel>-<post>`, `l_<id>-<channel>-<post>`, `l_abc`. DEV variants as
   `todo`. Until the parsers exist, the datasets are `todo`.
2. Expectations file `backend/tests/Fixtures/Urls/expectations.json`: per URL pattern and per profile
   (`same-domain`, `domain-change`): status, `Location` pattern, content type, robots meta, canonical, hreflang set.
3. SEO list: `backend/tests/Support/Urls/SeoUrlList.php` generates the candidate URLs from the slug scheme and the
   gazetteer seed (KV-DB-006). The legacy set is data-driven (only slices with enough listings exist), so the exact
   1 008 come from the legacy `sitemap.xml`: one `GET` of it is **needs developer approval: touches production**; with
   approval, save only the URL list to `backend/tests/Fixtures/Urls/legacy-sitemap-<date>.txt`. Without approval the
   generated list is the reference and Q-SEO-001 stays open.
4. A separate Smoke configuration `backend/phpunit.smoke.xml` with suite `tests/Smoke` (not part of the default run),
   reading `SMOKE_LANDING_URL`, `SMOKE_APP_URL`, `SMOKE_API_URL`, `SMOKE_OLD_HOST`, `URL_PROFILE` from the environment;
   Composer script `test:smoke`.
5. `backend/tests/Smoke/PublicUrlContractTest.php`: for each must-keep pattern and each SEO URL — status, redirect
   target with the query kept, content type, canonical, hreflang (ru, uz, en, `x-default`), robots meta (`noindex,
   follow` for thin slices, `noindex,nofollow` for `?sort=`), trailing-slash `308`, wrong case per DEV-047, CSV content
   type; media URLs signed by HOMI's signer against a seeded listing; `/call/<token>` fresh and expired.
6. Run against the local stack (`https://homi.loc`, `https://app.homi.loc`, `https://api.homi.loc`) and against a
   CI-started stack in the nightly job (KV-QA-021); staging runs belong to the production track.

## Files

- `backend/tests/Unit/DeepLinks/*Test.php` (new)
- `backend/tests/Fixtures/Urls/expectations.json` (new), `legacy-sitemap-<date>.txt` (only with approval)
- `backend/tests/Support/Urls/SeoUrlList.php` (new)
- `backend/phpunit.smoke.xml`, `backend/tests/Smoke/PublicUrlContractTest.php` (new)
- `backend/composer.json` (script `test:smoke`)

## API contract

RES-001, RES-002 (media), RES-005 (call page), RES-009, RES-017 … RES-020 (landing, SEO, CSV, sitemap, robots).

## Business rules

BR-SEO-002 … BR-SEO-004 (slugs and routing), BR-SEO-034 (sitemap), BR-SEO-035 (noindex threshold), BR-BOT-096
(payload grammar); DEV rows per their state.

## Acceptance criteria

- Every must-keep pattern (49) has an expectation per profile; every SEO URL of the reference list is checked.
- The suite reports `n/N` per URL group; the nightly run against the CI stack is green for the implemented groups.
- Payload datasets cover every grammar line of `03b` §6.3.

## Tests

As listed; plus a negative control: a wrong canonical on one page makes the suite fail with the URL named.

## Edge cases

- Query strings preserved on `301` (URL-006, URL-037, URL-038).
- `/uz` and `/en` without slash → `308` (URL-004).
- Merged listing ids in `startapp` and `/media` resolve to the survivor.
- Telegram links cannot be redirected: their cases are parser tests, not HTTP tests (`03b` §6.1).

## Security

Smoke runs send no credentials; signed media and call URLs are generated with test keys only; production runs only
with approval (`15` §2.13).

## Definition of done

Tests green (`make ci-backend`; `composer test:smoke` against the local stack recorded), parity gate items ticked
(15 §4), docs and the feature rows in 09 updated, PR reviewed by the other developer.
