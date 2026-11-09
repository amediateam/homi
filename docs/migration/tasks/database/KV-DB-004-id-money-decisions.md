# KV-DB-004 — Record the identifier and money decisions for migrated entities

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend (track: development); ADR approval by the first developer (production track) |
| Complexity | M |
| Feature IDs | F-LISTING-001, F-SHARE-002, F-FEED-001, F-FILTER-006, F-PIPELINE-007, F-HIDE-003, F-RADAR-003. Technical migration task — the identifier, cursor and money rules every schema task (KV-DB-006…011, KV-DB-032…034) and every migration load (KV-DB-014…020) depends on |
| Dependencies | CF-003, CF-004, CF-005, CF-016; DEC-10, DEC-11 |

## Goal

Two ADRs are written and sent for approval — "Public listing numbers and keyset cursors" (CF-003 + CF-004) and "Money
normalisation and the CBU rate" (CF-005) — and together they fix the identifier, sequence, cursor, money, deal and
locale rules that the schema tasks implement, so no migration file is written against an unapproved design
(`06` §4 preamble).

## Legacy reference

- Integer listing ids are public and compared with `===`/`!==` by the old client: LB-API-011, BR-DATA-002,
  `$KVADRO_ROOT/demo/app/src/features/listing/hooks/useListingLoader.js:47-58`; `startapp=l_<id>`
  (`$KVADRO_ROOT/demo/app/src/lib/telegram/startParam.js:17-25`), `/media/<id>/<n>.jpg`, `--l<id>`, landing pins
  (URL-042, URL-048, URL-052 … URL-055; `06` §4.3 item 1).
- Merged ids resolve to the survivor: BR-API-048, BR-DATA-019, ENT-024 (`06` §2.4).
- Radar and blocked-author ids may sit in old `callback_data` and open sessions: Q-BOT-017, Q-DATA-041, `14` §3.
- Cursor: BR-API-022, LB-API-004, Q-API-008; `08` §1.8 `FeedPage`.
- Money: USD storage and filters (BR-API-153, BR-API-154, BR-DATA-008, BR-DATA-038), UZS input conversion
  `max(1, round(mln × 10^6 / usd_uzs))` (BR-API-031), CBU rate (BR-API-140, Q-API-054), LB-API-027, LB-DATA-002,
  LB-DATA-019 (price basis), `06` §4.3 items 2–4.
- HOMI baseline: ADR-0006 (`docs/architecture/decisions/0006-time-locale-i18n-currency.md:17`), ADR-0007 ids and
  pagination clauses (`…/0007-api-v1-response-envelope-pagination.md:17-20`); ULID keys in
  `backend/database/migrations/2026_11_08_171040_create_media_files_table.php`,
  `…171043_create_source_listings_table.php:24`.
- Decisions and recommendations: `10` §3.4, §3.5, §3.6, §3.7, §3.16, §4.9; sequence SQL in `14` §3.

## Implementation

1. Read `docs/architecture/decisions/README.md` and `0000-adr-template.md`, ADR-0006, ADR-0007, `10` §3.4–§3.7 and
   `14` §3. Take the next two free ADR numbers at writing time (0014 stays reserved for HANDOFF T4;
   `docs/handoff/parallel-work.md` §5 numbering rule).
2. ADR "Public listing numbers and keyset cursors" (supersedes the ids and pagination clauses of ADR-0007):
   - ULID primary keys for domain tables (matches the existing tables; UUIDv7 rejected for consistency, `10` §4.9;
     note the divergence from `.ai/agents/postgis-geo-engineer.md` rule 3, which prefers UUIDv7).
   - `number bigint unique not null` on `listings`, `radars`, `blocked_authors`; migrated rows keep the legacy value;
     new rows draw from `listings_number_seq`, `radars_number_seq`, `blocked_authors_number_seq`, each set **after
     the final delta** to `greatest(max(number), max(alias_number)) + gap` (`14` §3 SQL; gap sized from Q-DATA-002
     growth, at least 7 days of legacy creations).
   - Numbers are never reused: an alias or a tombstone keeps every merged or deleted number reserved; sequences never
     move backwards (V-RI-9).
   - Legacy routes, deep links, SEO, landing data and media paths use `number`; v1 exposes `id` and `number`.
   - Keyset cursor: base64url of the JSON `{"v":1,"s":"<sort>","k":[<sort key>,<number>],"f":"<filter-hash prefix>"}`;
     stable sort with `number` as the tie-breaker; a cursor whose `v`, `s` or `f` does not match the request is
     rejected (legacy `422 {"detail":"invalid_cursor"}`); legacy favourites and history stay whole lists with
     `next_cursor: null` (BR-API-023), v1 paginates them; page numbers stay for ARM lists.
3. ADR "Money normalisation and the CBU rate" (supersedes the money clause of ADR-0006):
   - Listings keep `price_amount bigint` + `price_currency char(3)` (source) and `price_usd_cents bigint` computed
     **once** at ingestion with the CBU rate of that day; the `exchange_rates` row id is stored so later rates never
     move old prices (if Q-API-054 proves legacy re-converted daily, that becomes a DEV candidate).
   - Filters, sorts, medians, `below_median` and SEO prices use normalised USD — a stated exception to "statistics
     never on mixed values".
   - Radar price bounds are stored as entered with their currency (DEV-006 `PROPOSED`); legacy routes read and write
     them as integer USD; migrated radars carry `price_currency = 'USD'`.
   - `price_basis` and `price_kind` are explicit columns (LB-DATA-019); `down_payment` rules recorded.
   - Default display currency for new users and the SEO currency are DEC-10 (product owner); migrated users keep
     theirs.
4. Record in the first ADR (section "Adjacent mappings"): deal model `deal` (`sale`, `rent`) + `rent_period`
   (`long`, `daily`) ↔ legacy `rent_long`/`rent_daily`/`sale` (CF-016); demand deals (`buy`, `rent_wanted`) stored
   raw, never published; locale stored as `uz`, `uz_Latn` only at the legacy boundary (CF-006, LB-DATA-014).
5. Add a "Consequences for the schema" list to each ADR naming the tables and columns of KV-DB-007, KV-DB-008,
   KV-DB-009, KV-DB-010, KV-DB-011 that implement it, and the validation queries (V-SUM-1, V-RI-8, V-RI-9) that prove
   it after the migration.
6. Open a docs-only PR (shared files → small separate PR, `docs/handoff/parallel-work.md` §1); request the first
   developer's review; record DEC-10 and DEC-11 as "waiting" in `.ai/memory/session-handoff.md` until answered.

## Files

- `docs/architecture/decisions/00NN-public-listing-numbers-and-keyset-cursors.md` (new)
- `docs/architecture/decisions/00NN-money-normalisation-and-cbu-rate.md` (new)
- `docs/architecture/decisions/README.md` (index rows)

## API contract

n/a for endpoints — the ADRs fix the wire rules the legacy serializers follow: `ListingPreview.id`,
`ListingDetails.id`, `Subscription.id`, `authors[].id` of `GET /api/hidden`, `listing_ids` and map `points[].id` are
JSON integers below 2^53 (`08` §1.8, LB-API-011); `FeedPage.next_cursor` is an opaque string or JSON `null`; every
money number except the formatted `price` string is USD (BR-DATA-038).

## Business rules

Keep BR-DATA-002, BR-DATA-019, BR-API-022, BR-API-023, BR-API-031, BR-API-140, BR-API-153, BR-API-154, BR-DATA-008,
BR-DATA-038. Apply defect fixes (`09` §4.3, `APPROVED` by policy): LB-API-004, LB-API-011, LB-DATA-014, LB-DATA-019.
DEV-006 `PROPOSED` (bounds in the entered currency) and DEV-003 `PROPOSED` (v1 pagination of favourites/history) are
recorded as pending, not decided, by these ADRs.

## Acceptance criteria

- Both ADRs follow the template, cite CF-003/CF-004/CF-005/CF-016/CF-006, list alternatives with reasons and name
  their approvers (first developer; product owner for the currency defaults).
- The sequence rule, the gap rule, the never-reuse rule and the cursor JSON format are written exactly enough for
  KV-DB-008, KV-DB-009, KV-DB-010 and KV-BE-031 to implement without further decisions.
- Every column named in the "Consequences" lists exists in the KV-DB task that creates it (cross-checked in the PR).
- The ADRs are merged as `Accepted`, or left `Proposed` with DEC-10/DEC-11 recorded as open — never assumed.

## Tests

Documentation task; the rules are tested where implemented: sequence and alias reservation in KV-DB-008
(`ListingNumberSequenceTest`), cursor round-trip and rejection in KV-BE-031, conversion-once in KV-BE-019 and M6
ingestion, V-RI-9 in KV-DB-022. The PR runs `make ci-backend` (docs only, expected unchanged) and a link check of the
cited paths (`rg -n` on every `path:line`).

## Edge cases

- A legacy alias number larger than every live number: the sequence starts above it (`14` §3).
- Non-numeric legacy radar or author-entry ids (`14` §3): new `number` + `legacy_id_map` row.
- UZS-only listings posted before the first stored rate: rate of the nearest earlier CBU date, flagged.
- A cursor from an older API version or another sort: rejected, never silently restarted (LB-API-004 loop risk).

## Security

Sequential public numbers make enumeration easy; that already holds in legacy and is contained by the quotas of
SEC-REQ-028 and the limiters of SEC-REQ-027, not by hiding numbers (`10` §3.4). Cursors carry no user data and are
validated on input (SEC-REQ-017).

## Definition of done

Tests green (`make ci-backend`), parity gate items ticked (15 §parity gate), docs and the feature row in 09 updated, PR
reviewed by the other developer. Both ADRs reviewed by the first developer; DEC-10/DEC-11 state recorded in
`session-handoff.md`.
