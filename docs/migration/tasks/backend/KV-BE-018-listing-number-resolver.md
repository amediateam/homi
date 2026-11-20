# KV-BE-018 — Listing number resolver and alias redirect

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend (track: development) |
| Complexity | S |
| Feature IDs | F-LISTING-001, F-SHARE-002, F-OWNER-009 |
| Dependencies | KV-DB-008, KV-BE-014; decision CF-003 (KV-DB-004 ADR) |

## Goal

One resolver turns any public listing number — from a legacy route, a deep link, a bot callback, a media path or a
migrated favourite — into the current listing, following merge aliases to the survivor, and one writer records aliases
so that chains never form. New listings get their number from the sequence that starts above every preserved number.
Since the owner-cabinet plan it also resolves the native range and routes by number, built by WP-80 and WP-86.

## Legacy reference

- `GET /api/listings/:id` may answer with the merge survivor; the client switches to the returned `id`
  (BR-API-048; `$KVADRO_ROOT/demo/app/src/features/listing/hooks/useListingLoader.js:47-58`;
  `$KVADRO_ROOT/demo/app/docs/CHANGELOG.md:12`, `:16`).
- Numbers are public in `startapp=l_<id>`, `s_<source>--l<id>`, `/media/<id>/<n>.jpg`, landing pins and SEO cards
  (BR-DATA-002, BR-API-119, BR-API-120; URL-042, URL-048, URL-052…URL-055 in `03b`); integer comparison with `===`
  (LB-API-011).
- A merged id keeps resolving (BR-DATA-019); aliases are flattened and never reused (`14` §3, §4.2 "Alias";
  V-RI-1, V-RI-2, V-RI-9).
- HOMI decision: ULID key + unique `number bigint` per listing (CF-003 option A, `10` §3.4; `06` §4.3 item 1).

## Implementation

1. Read `.claude/skills/laravel-database-optimization/` and `.ai/agents/postgis-geo-engineer.md` (sequences, unique
   constraints) and the KV-DB-008 migration for `listings.number`, `listing_aliases` and `listings_number_seq`.
2. `php artisan make:class --no-interaction Services/Listings/ListingNumberResolver`:
   - `resolve(ListingNumber $n): ?ResolvedListing` — one query on `listings.number`, else one on
     `listing_aliases.alias_number` joined to `listings`; a tombstone (`status = merged`, no content) resolves to
     `null`;
   - `resolveMany(list<ListingNumber>): array<int, ResolvedListing>` for batch callers (favourites import, map card
     neighbours) without N+1.
3. `php artisan make:class --no-interaction Domain/Listings/ResolvedListing` (listing, requested number, `viaAlias`).
4. `php artisan make:class --no-interaction Services/Listings/ListingAliasWriter` with
   `record(int $aliasNumber, Listing $survivor, string $reason): void` in one transaction: insert the alias,
   re-point every alias whose target is the merged listing to the survivor (flatten), refuse an alias number that is a
   live listing number (V-RI-2). Used by Matching (M6) and the data migration (KV-DB-016).
5. `php artisan make:class --no-interaction Services/Listings/ListingNumberAllocator` with `next(): ListingNumber`
   (`nextval('listings_number_seq')` on PostgreSQL; a test double on SQLite) — numbers are never reused.
6. Pest tests first; PostgreSQL-only cases in the `pgsql` group (KV-QA-001).

## Files

- `backend/app/Services/Listings/{ListingNumberResolver,ListingAliasWriter,ListingNumberAllocator}.php`
- `backend/app/Domain/Listings/ResolvedListing.php`
- `backend/tests/Feature/Listings/ListingNumberResolverTest.php`
- `backend/tests/Feature/Pgsql/ListingNumberAllocatorTest.php`

## API contract

Internal only; the legacy JSON shape of a redirect is produced by KV-BE-036 (`id` = the survivor's `number`, a JSON
integer).

```php
ListingNumberResolver::resolve(ListingNumber $number): ?ResolvedListing
ListingNumberResolver::resolveMany(array $numbers): array            // keyed by requested number
ListingAliasWriter::record(int $aliasNumber, Listing $survivor, string $reason): void
ListingNumberAllocator::next(): ListingNumber
```

## Business rules

- Kept: BR-API-048, BR-DATA-002, BR-DATA-019, BR-API-119 (deep links resolve).
- Defect fix (`APPROVED`): LB-API-011 (integer ids preserved for every listing, including new ones).
- No DEV applies.

## Acceptance criteria

- A live number resolves to its listing with `viaAlias = false`; an alias number resolves to the survivor with
  `viaAlias = true`; a tombstone and an unknown number resolve to `null` through the same code path.
- After `record(A → B)` and `record(B → C)`, `A` resolves to `C` with no alias row pointing at `B` (flattened).
- `record()` refuses an alias number equal to a live listing number.
- `next()` returns numbers above every preserved and alias number seeded in the test (V-RI-9 on synthetic data); 50
  concurrent allocations are unique (`15` §3.6 #10).
- `resolve()` issues at most two queries; `resolveMany()` at most two queries for any batch size.

## Tests

- `ListingNumberResolverTest`: live, alias, chain flattening, tombstone, unknown; `resolveMany` query count
  (`DB::listen`); refusal of a live number as alias.
- `Pgsql/ListingNumberAllocatorTest` (`->group('pgsql')`): sequence above seeded max; 50 parallel allocations through
  the KV-QA-008 kit are unique.
- Characterization (with KV-BE-036): API-008 fixture "merged id returns the survivor with its own id".

## Edge cases

- A listing merged into a survivor that is later taken down: the alias still resolves to the survivor; the caller
  answers `404` because of the status (BR-DATA-022), not the resolver.
- An alias whose survivor was purged (90-day rule) still resolves; the details endpoint decides what to show
  (Q-API-023).
- Merge reversal (unmerge, Matching module): deleting the alias row restores the old number only if the original
  listing row still exists — out of scope here, the writer exposes no delete.

## Security

- Enumeration is not prevented by hiding numbers (they are public); quotas limit it (SEC-REQ-028, KV-BE-035).
- The resolver never reveals whether a number is an alias, tombstone or unknown beyond what the caller emits; foreign
  vs unknown is a per-user concept handled by owner-scoped relations (SEC-REQ-014).

## Definition of done

Tests green (`make ci-backend`), parity gate items ticked (15 §4), docs and the feature row in 09 updated, PR
reviewed by the other developer. Pint and PHPStan level 7 clean; `pgsql` group green on the PostgreSQL run of
KV-QA-001.
