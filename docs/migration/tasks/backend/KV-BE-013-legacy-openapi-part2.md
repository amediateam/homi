# KV-BE-013 — Legacy OpenAPI document, part 2

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend (track: development) |
| Complexity | M |
| Feature IDs | F-COMPAT-001 |
| Dependencies | KV-BE-012 |

## Goal

The legacy OpenAPI document covers the rest of the surface — API-011…API-034, including the radar endpoints API-018…
API-023 so that M4 builds against a frozen contract — with the `204` rules of BR-API-020 and the per-user write
semantics written down. After this task all 34 legacy endpoints are documented and checked by one lint test.

## Legacy reference

- Rows API-011…API-034 of `08` §2 ("Input", "Response", "Errors"); shared models `Subscription`,
  `SubscriptionMutationResult` (`08` §1.8; `$KVADRO_ROOT/docs/api.md:368-400`), `SettingsResponse`
  (`api.md:844-855`), hidden lists (`api.md:903-915`), survey bodies (`api.md:951-966`), events (`api.md:970-1046`).
- Client facts that make the rules strict: `POST …/report` must not answer `204` (`api.md:704-705`; LB-API-015);
  favourites/history whole list with `next_cursor: null` (`$KVADRO_ROOT/demo/app/src/features/feed/useInfiniteFeed.js:31-36`;
  LB-API-004); `digest` must be a string (`$KVADRO_ROOT/demo/app/src/features/radar/RadarSheet.jsx:52-61`); bodiless
  `POST`/`DELETE` without `Content-Type` (`08` §1.3).
- Rules BR-API-020, BR-API-021, BR-API-076…078, BR-API-086, BR-API-087, BR-API-089…090, BR-API-094, BR-API-098,
  BR-API-099, BR-API-101, BR-API-117, BR-API-122…124, BR-API-143; LB-API-033 (`409` codes), LB-API-047 (events cap).

## Implementation

1. Read `08` §2 rows API-011…API-034 and `15` §2.4; extend `docs/api/kvadro-legacy.openapi.yaml` (KV-BE-012) — same
   conventions (`x-legacy-id`, `x-evidence`, global `tma` security).
2. Schemas: `Subscription` (`id` integer in HOMI output — CF-003 — with the legacy `number|string` union noted;
   `active`, `mode` `instant|digest`, `filters` → `SearchFilters` (25 keys), `hidden?` integer),
   `SubscriptionMutationResult` (`subscription`, `starter` integer, `options?[{code, label, rate, count}]`, `relaxed`
   array required), `SettingsResponse` (8 keys: `quiet`, `digest`, `locale`, `currency`, `locales`, `currencies`,
   `quiet_presets`, `digest_presets`; `quiet` pattern `^(off|\d{2}-\d{2})$`, `digest` pattern `^\d{2}(,\d{2})*$`),
   `HiddenResponse` (`listings` ListingPreview[], `authors[{id, kind, label, count}]`, both required),
   `BlockAuthorResponse` (`listing_ids` integer[], `label`), `ReportRequest` / `ReportResponse` (`{hidden: boolean}`),
   `FoundRequest`, `FoundWhereRequest`, `EventRequest` (`name` + `additionalProperties: true`, body ≤ 8 KB in
   `description`), `ShareResponse` (`{id: string}`), `FavoriteResponse` (`{favorite: boolean}`).
3. Paths with every status: favourites toggle `200 {favorite}`; hide/unhide `204`; block-author `200` / unblock `204`;
   report `200 {hidden}` (never `204`), `422` on unknown reason; share `200 {id}`, `404`, non-2xx on Bot API failure;
   subscriptions list (bare array), create/update `200 SubscriptionMutationResult`, `409 {"detail":"no_chat"}`,
   `409 {"detail":"subscription_limit"}` (any non-`no_chat` value means the limit), patch body `oneOf` the five legal
   bodies → `200 {subscription, starter?, ask_found?}`, delete `200 {ask_found?}` or `204`, relax `{code}` →
   `200 {starter}`; settings GET/PUT (PUT partial, returns the full object); hidden GET, `DELETE /api/hidden/{id}` (author
   entry number), `DELETE /api/hidden` `204`; favourites/history `200 {items, next_cursor: null}` (schema
   `const: null`); history delete `204`; found / found-where `204`, `422`; events `204` (unknown names accepted).
4. Mark `requestBody` absent (not empty) for every bodiless `POST`/`DELETE`.
5. Extend `backend/tests/Unit/Docs/LegacyOpenApiDocumentTest.php` to require all 34 `x-legacy-id` values (taken from
   `docs/migration/data/api-inventory.json`) and the `204`/`200` rules of step 3.
6. Run the test; update `docs/api/` index paragraph.

## Files

- `docs/api/kvadro-legacy.openapi.yaml` (extended)
- `backend/tests/Unit/Docs/LegacyOpenApiDocumentTest.php` (extended)

## API contract

The document fixes API-011…API-034 as `08` states them (step 3). Key invariants: no `200` without a JSON body; `204` only
on hide, unhide, unblock, `DELETE /api/hidden*`, `DELETE /api/history`, found, found-where, events and (optionally)
subscription delete (BR-API-020); `POST …/report` always `200 {"hidden": bool}`; favourites and history always
`next_cursor: null`; `409` details `no_chat` and `subscription_limit`; filters always 25 keys; locale `uz_Latn` on the
wire.

## Business rules

Documents BR-API-020, BR-API-021, BR-API-023, BR-API-076…078, BR-API-086, BR-API-087, BR-API-089, BR-API-090,
BR-API-094, BR-API-098, BR-API-099, BR-API-101, BR-API-117, BR-API-122…124, BR-API-143…145. Defect fixes reflected:
LB-API-015, LB-API-033 (`subscription_limit`), LB-API-039 (toggle kept, documented as such), LB-API-047 (events cap),
LB-API-049 (PUT with PATCH semantics). `PROPOSED` DEVs (DEV-003, DEV-008, DEV-009, DEV-010) are noted in
`description` fields only; the documented shapes are the legacy ones.

## Acceptance criteria

- All 34 API ids are present with every status of their `08` rows; the lint test enforces it.
- The `204` set equals BR-API-020's list; `POST …/report` has no `204` response.
- `Subscription.filters` and `options[].filters` reference the 25-key `SearchFilters`.

## Tests

`backend/tests/Unit/Docs/LegacyOpenApiDocumentTest.php` (extended):
- `it('documents all 34 legacy endpoints')` (dataset from `api-inventory.json`).
- `it('allows 204 only where the legacy client ignores the body')`.
- `it('never allows 204 on report')`; `it('fixes next_cursor to null on favourites and history')`.
- `it('documents both 409 details on radar writes')`.

## Edge cases

- `DELETE /api/subscriptions/:id` legitimately answers `200 {ask_found}` or `204` (both documented).
- `PATCH` with two keys or an unknown key → `422`; documented through `oneOf` + `422`.
- Events from the boot script send all 7 `app_error` keys with `""`; React omits empty keys — both valid.

## Security

SEC-REQ-022 (events size and allow-list described), SEC-REQ-014 (owner-scoped routes documented with `404` for foreign
ids), SEC-REQ-017 (`422` on invalid filters); synthetic examples only.

## Definition of done

Tests green (`make ci-backend`), parity gate items ticked (15 §4), docs and the feature row in 09 updated, PR reviewed
by the other developer. Additionally: the document covers 34/34 endpoints; the M4 session is pointed at it for
API-018…API-023.
