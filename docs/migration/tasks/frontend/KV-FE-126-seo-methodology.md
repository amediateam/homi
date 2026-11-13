# KV-FE-126 — Methodology page

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Frontend (track: development) |
| Complexity | S |
| Milestone | FE-3a (M9, stage S2) |
| Feature IDs | F-SEO-006, F-LANDING-010 |
| Dependencies | KV-FE-114 (frame); backend KV-BE-159 (`seo/methodology` numbers); decisions DEV-044 `PROPOSED` (plain contact link), DEC-03 (LLM vendor named in the text); Q-SEO-021 (dynamic numbers), Q-SEO-004 |

## Goal

The methodology page (`/arenda/metodika/`, `/uz/ijara/metodika/`, `/en/rent/methodology/`) publishes the legacy text
on how listings are collected and prices computed, with every number that the pipeline determines read from the
backend, so the public statement stays true (BR-SEO-029); the contact is a plain link instead of Cloudflare's e-mail
obfuscation.

## Legacy reference

- LND-054 (methodology), LND-039 (Cloudflare e-mail obfuscation); `$KVADRO_ROOT/docs/seo-pages.md:205`, `:242-257`,
  `:378`.
- URL-034 (3 pages); URL-061 (project mailbox); URL-022 (`/cdn-cgi/l/email-protection`, no longer emitted).
- Inbound: the Mini App market sheet «Подробнее» links `kvadro.app/arenda/metodika/`, `/uz/ijara/metodika/`,
  `/en/rent/methodology/` (SCR-022, `$KVADRO_ROOT/demo/app/src/features/listing/MarketSheet.jsx:37-41`) — these paths
  must keep working.
- Rules: BR-SEO-029 (217 open channels read without subscribing; the LLM extracts fields without guessing; phones and
  `@nicks` hidden before sending; UZS → USD at the CBU rate; duplicates matched on photos, text and parameters; withdrawn
  listings kept 90 days, then phone, text and photos erased), BR-SEO-011, BR-SEO-013, BR-SEO-014, BR-SEO-017,
  BR-SEO-018 (the calculations the text explains), BR-SEO-025 (tag `s_seo_method`).
- Defect: LB-LND-016 (dependency on Cloudflare e-mail obfuscation) → DEV-044.

## Implementation

1. `frontend/landing/components/seo/templates/MethodologyPage.tsx` (`kind = methodology`): sections in legacy order —
   where listings come from; how the text is parsed; duplicates; the usual price; «дешевле рынка»; the rent index; rent
   in salaries; limitations; citation; then the CTA.
2. Text: transcribed per language from the KV-FE-007 archive into `frontend/packages/i18n/src/catalogues/{ru,uz,en}/seo-methodology.ts`
   as structured paragraphs with placeholders; numbers that the pipeline owns are placeholders filled from
   `GET seo/methodology` (channel count, coverage start, the 60- and 90-day windows, thresholds) — Q-SEO-021 decides
   which legacy numbers were dynamic.
3. Statements that would become untrue under HOMI decisions (the LLM vendor under DEC-03, the channel-reading method
   under DEC-02 / CF-007) are listed in the PR for the product owner; the page text changes with those decisions, never
   silently (BR-SEO-029).
4. Contact: plain `mailto:` / support-bot link as text (DEV-044 flag `dev044PlainContactLinks`, default off → with the
   flag off the page still renders a plain `mailto:` link, because HOMI has no Cloudflare edge rewrite; the flag only
   switches the order «support bot first, mailbox second»).
5. Anchors per section (`id`) so the Mini App and the index pages can deep-link sections if the archive shows such
   links.

## States and texts

| State | When | Rendering |
| ----- | ---- | --------- |
| normal | numbers available | full text |
| numbers unavailable | `seo/methodology` failed and no cache | last cached render; never placeholders in the HTML |
| 404 | `/prodazha/metodika/` and other sections | KV-FE-100 |

Texts: the archive text per language (namespace `seo.methodology.*`); section headings as in the archive.

## Interaction

Static text page; responsive reading width.

## Telegram integration

n/a, except the CTA link URL-047 (`s_seo_method`) and the support link URL-050.

## Storage and analytics

Through KV-FE-105 only.

## Files

- `frontend/landing/components/seo/templates/MethodologyPage.tsx` (new)
- `frontend/packages/i18n/src/catalogues/{ru,uz,en}/seo-methodology.ts` (new)
- `frontend/landing/lib/deviations.ts` (flag `dev044PlainContactLinks`)
- `frontend/landing/tests/seo/MethodologyPage.test.tsx` (after KV-FE-010)

## API contract

`GET /api/v1/public/seo/methodology` (KV-BE-159) → the numbers the text states (active channel count, coverage start,
windows from config), `lastmod`.

## Business rules

- Kept: BR-SEO-029 (statements kept true), BR-SEO-025.
- DEV-044 `PROPOSED` behind its flag; LB-LND-016 is resolved by not depending on an edge rewrite.

## Acceptance criteria

- The three URLs answer `200` with canonical and hreflang; the Mini App «Подробнее» paths resolve.
- Every number in the text equals the backend value; no literal «217» unless the backend says 217.
- No `/cdn-cgi/` link or edge-injected script exists in the HTML.
- Side by side with the archived methodology pages (KV-FE-007): same sections and order; textual differences only where
  the PR lists a statement change approved by the product owner.

## Tests

- Unit: placeholder filling per locale; missing placeholder → build-time error, not runtime text.
- E2E (mocked API): the three URLs; the HTML contains a `mailto:` link and no `cdn-cgi`.

## Edge cases

- The channel count changes between renders: the next revalidation (300 s) shows the new number; acceptable.
- Mailbox address unknown in the repository: taken from configuration (`NEXT_PUBLIC_*` name announced in the PR), never
  hard-coded from the legacy files.

## Security

SEC-REQ-021 (text rendering); no personal data; the mailbox is the project's public contact.

## Definition of done

`make ci-frontend` green; tests green (or added when KV-FE-010 lands); archive comparison and the statement review
recorded in the PR; parity gate G4 for F-SEO-006 (methodology) and F-LANDING-010 ticked; PR reviewed by the other
developer.
