# ADR-0017: `/api/v1` is the only contract; a source driver per method selected by a Pennant feature

- Status: Proposed
- Date: 2026-11-14
- Deciders: developer (answer round of 2026-11-14); first developer (review of this PR)
- Source: `docs/migration/24-three-wave-strategy.md` §3, §8.1 (DEC-33, DEC-35, DEC-41, DEC-42); `docs/migration/25-wave-1-plan.md` §4; `docs/migration/wave-1/WP-10-api-framework.md` (file names, error codes); verbatim answers in `docs/migration/decisions/2026-11-14-developer-answers.md`; amends ADR-0007

## Context

HOMI ships a new product that reads shared listing data from legacy during Waves 1 and 2 and from its own code
afterwards (ADR-0016). The frontend has to be built once, on the final contract, while the source behind each method
changes several times: stub data first, then legacy, then HOMI's own tables. Each change must be reversible without a
deploy. Personal data (identity, settings, lists, radars) is HOMI's own from the first day; legacy supplies shared
listing data only, through a service key the operator adds (DEC-42).

## Decision

- The frontend and the bot's Mini App see only `/api/v1`, in the envelope of ADR-0007 and with HOMI's own session
  (ADR-0003). No legacy path, error shape or credential leaves the backend (DEC-41, `24` §3).
- Each shared-data capability sits behind one interface (`ReferenceSource`, `ListingSource`, `LandingSource`) with a
  `stub`, a `legacy` and later a `native` driver (DEC-35, `25` §4.3).
- One Pennant feature per method names the driver, for example `source.listings.feed`. Its default per environment
  lives in configuration, `backend/config/sources.php` (created by WP-10); an override can be set for everyone, for a share of users or for named users.
  Console commands list and set the drivers, and every change is logged with who made it (`25` §4.3).
- Native-only methods (for example sign-in, settings, personal lists, radars, events) have no flag (`25` §4.3).
- Every answer carries `meta.source` with the driver that produced it: `stub`, `legacy` or `native` (`25` §4.1).
- When the listing source cannot answer, the method returns `503` with code `source_unavailable` (`25` §4.1).
- Only HOMI's servers call legacy, with the operator's service key where one is needed (the public landing files
  and the signed photo addresses need none). The key exists only in the server environment of staging and production. Development, tests, CI and agents use stubs and recorded fixtures (DEC-33, `25` §2 rule 4,
  §4.5).

**Amends ADR-0007** (`25` §4.1):

- Listings are addressed by their public **number** (in Wave 1 the legacy listing number). This is an exception to
  "IDs exposed to clients are opaque"; radars and blocked-author entries keep HOMI's own opaque ids.
- Feed-like lists use a cursor: `meta.next_cursor`, and `null` ends the list. Favourites and history are paged the
  same way, 20 per page (DEC-53).
- `code` is present on every error body, not optional (`25` §4.1, §4.2 name the codes; WP-10 makes it mandatory).

## Consequences

- A translating layer for about a dozen shared-data methods: one translator per method, from the legacy answer to a
  data object and from that to the v1 resource, plus HOMI's per-user overlay. CF-001 rejected such a layer because it
  "duplicates validation and still needs every legacy rule" (`docs/migration/10-target-architecture.md`). The cost is
  accepted for the shared-data group only (`24` §3).
- Contract tests per driver against the same fixtures. A recorded legacy answer that no longer fits its translator
  fails a test, which is how a legacy release shows up (RK-26, `25` §4.5).
- Rollback of a method is its flag. Personal data never leaves HOMI, so no write is lost when a listing method goes
  back to legacy (`24` §3).
- New code lives under `backend/app/Services/Sources/` (contracts, stub store, drivers), built by WP-10; the legacy
  driver is WP-41.
- Still open with the operator: the service key's header, routes and limits, and how a service-key request selects
  locale and currency (Q-API-059, Q-API-060, Q-API-062).

## Alternatives considered

- A proxy in nginx or in Next.js that forwards to legacy: rejected. Legacy shapes, errors and credentials would
  reach the frontend, and there would be no per-method switch and no per-user overlay.
- The legacy contract on HOMI hosts (CF-001, CF-002): rejected. No legacy client talks to HOMI (ADR-0016), and the
  frontend would be built on a contract that Wave 2 removes.
