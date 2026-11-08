# ADR-0007: API versioning, response envelope and pagination

- Status: Accepted
- Date: 2026-11-08
- Deciders: main session (ordinary technical decision; master prompt §6.5 mandates `/api/v1`)
- Source: master prompt §6.5, §12.4–12.5; `docs/ai/reports/phase-0.md` §6 (A4 reuse candidate)

## Context

Three Next.js apps and external collectors call one Laravel API. The mandate requires `/api/v1`, a single error format, pagination, OpenAPI as the contract and a generated TypeScript client. `app.uz` uses `{success, message, data}` / `{success:false, message, errors}` envelopes (default dialect), Laravel's `LengthAwarePaginator`, and Scramble for OpenAPI.

## Decision

- All routes under `/api/v1` (`bootstrap/app.php` `apiPrefix: 'api/v1'`); breaking changes require `/api/v2`, additive changes do not.
- **Success**: `{"success": true, "data": …, "meta": {…}?}`; `message` only when a human-readable confirmation is useful.
- **Error**: `{"success": false, "message": "...", "errors": {"field": ["..."]}?, "code": "snake_case_code"?}` with proper HTTP status; validation → 422 with Laravel's `errors` map; 5xx hide internals unless `APP_DEBUG`.
- **Pagination**: `?page[number]=&page[size]=` (default 20, max 100) with `meta: {page, size, total, last_page}` and `links: {next, prev}`; cursor pagination for the listing feed when the first performance measurement requires it.
- **Resources**: every response goes through an Eloquent API Resource; no raw models.
- **Contract**: OpenAPI generated from code (Scramble is the PROPOSED tool; alternative decided in Phase 3), committed to `docs/api/openapi.json`; TypeScript client and types generated into `frontend/packages/api-client` and `frontend/packages/types` — CI fails on drift.
- IDs exposed to clients are opaque (ULID/UUID), not auto-increment integers.

## Consequences

- Port `ApiController::success()/error()` and the default exception rendering block from `app.uz`; drop the host-specific dialects.
- A `docs/api/README.md` explains the envelope with examples once the first endpoint exists.
- The generator choice (Scramble vs alternatives) is a REVIEW-level dependency change in Phase 3.

## Alternatives considered

- Plain Laravel resource responses without an envelope — rejected: three clients and external collectors benefit from one predictable shape.
- RFC 7807 `application/problem+json` — rejected: team convention is the `success` envelope.
