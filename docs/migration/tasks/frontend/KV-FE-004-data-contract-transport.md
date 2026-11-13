# KV-FE-004 — Mini App data contract and transport decision

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Frontend (track: development); the decision needs the first developer |
| Complexity | S |
| Milestone | FE-0 (M9, stage S4) |
| Feature IDs | F-ACCESS-001, F-COMPAT-001, F-COMPAT-002 |
| Dependencies | KV-BE-012, KV-BE-013 (frozen legacy OpenAPI); related CF-002, DEC-06, DEC-01; decides FD-2 of `12` §9.1 |

## Goal

One written decision tells every Mini App task which contract it is typed against and which transport carries it at
S4: the frozen legacy contract (`API-001…API-034` on `/api/*` with `Authorization: tma <initData>`) or `/api/v1`
adapters with the T6 token exchange. The client is built behind a typed port so that the transport can change
without touching screens. FD-2 is new: `10` §5.6–§5.7 assumed v1, while `13` freezes the legacy contract for M9.

## Legacy reference

- Legacy dialect: `08` §1.1–§1.8 (same origin, `tma` on every call, bare JSON, `{detail}` errors, `next_cursor`,
  integer ids, server-formatted strings, 15 s timeout); TMA-007; F-COMPAT-001, F-COMPAT-002.
- Target proposals: `10` §4.5 (services shared by both adapters), §4.6 (legacy vs v1 table: hosts, auth, errors,
  pagination, ids, **strings server-formatted vs raw**, locale `uz_Latn` vs `uz`, lifetime "until S5"), §5.6 (API client),
  §5.7 (token exchange, the `initData` reload window); `11` §12 (v1 adapters "planned with the frontend roadmap, not
  numbered"); CF-001 sunset rule (`10` §3.2, DEC-01); CF-002.
- DEV rows written for v1: DEV-002 (`auth_expired`, token exchange), DEV-003 (paginated favourites and history),
  DEV-007 (no raw phone numbers), DEV-008 (translation as a cached GET). SEC-REQ-004, SEC-REQ-007.

## Implementation

1. Write `docs/migration/decisions/FD-2-miniapp-transport.md` (a decision note; the owner of `10` §8 turns it into a
   `DEC-…` row) with the options below, then get the first developer's answer in the PR.
2. **Option A — legacy surface at S4.** The new Mini App calls `/api/*` on the Mini App origin with `tma`, exactly like
   the legacy client. Pros: the contract exists and is byte-tested by KV-QA-004 before S1; same origin, no CORS;
   server-formatted strings (CF-017) keep money and age wording identical to the bot; zero extra backend work.
   Cons: v1-only DEVs (DEV-003, DEV-007, DEV-008, and the token half of DEV-002) do not apply; SEC-REQ-007's
   in-memory token does not exist (initData is re-sent on every call, as today); the CF-001 sunset rule (legacy
   `/api/*` traffic below 0.5 % of sessions) can never trigger while the new client uses the surface, so S5 needs
   either a move to v1 first or a decision that the legacy surface becomes the Mini App's permanent API.
3. **Option B — `/api/v1` adapters.** The new Mini App exchanges `initData` once (`POST /api/v1/auth/telegram`, T6,
   verifier KV-BE-006) for a 24 h token kept in memory (SEC-REQ-004, SEC-REQ-007) and calls v1 adapters over the same
   services (`10` §4.5: bootstrap, feed, count, flow, map, listing, call link, lists, settings, radars, share,
   translate, events). Pros: DEV-002/003/007/008 apply; S5 can remove the legacy surface. Cons: the adapters are
   unnumbered backend work (`11` §12); v1 returns raw values, so the client must format prices, ages and titles
   itself (KV-FE-017/018 grow, and must match the server formatter through the KV-QA-006 fixtures); `uz` instead of
   `uz_Latn`; envelope and ULIDs; no reload after the exchange window (`10` §5.7 step 4).
4. **Recommendation:** A for S4, behind a port; B later and before S5. Rationale: parity first, one tested contract,
   no blocking backend work; the port keeps the switch to B a transport change.
5. Define the port in the note (implemented by KV-FE-021): `KvadroApi` with one method per API id, typed by the
   legacy models of `08` §1.8 (`@homi/types/legacy`); errors as typed results (`Offline`, `Timeout`, `Unauthorized`,
   `AccessDenied(reason)`, `NotFound`, `NoChat`, `Limit`, `Server`) instead of raw statuses; a transport interface
   (`legacyTransport` now, `v1Transport` later) that maps both dialects to these types.
6. List the v1 adapters option B needs (one line each, with the legacy API id they replace) as the backend input for
   `11` §12, so the backend track can number them when FD-2 = B.
7. Record the consequences per DEV: DEV-002 — with A the client shows the session-expired state on `401`
   (`auth_expired` or any `401`, KV-FE-036) and asks the user to reopen; with B it re-exchanges once. DEV-003 — with A
   favourites and history are single-page lists (`next_cursor: null`, LB-APP-022 fix: never request a second page);
   with B cursor paging. DEV-007 — with A `phone` stays available on the legacy route (quota KV-BE-035); with B the
   CTA uses only the call link. DEV-008 — with A `POST …/translate`; with B `GET …/translation?lang=`.

## States and texts

n/a — decision task.

## Interaction

n/a.

## Telegram integration

TMA-006 (initData source), TMA-007 (`tma` header, option A), TMA-009 (initData never in logs or URLs; with B it goes
only into the JSON body of the exchange, SEC-REQ-003).

## Storage and analytics

Records that neither option stores credentials (SEC-REQ-007); `kv-*` keys unaffected.

## Files

- `docs/migration/decisions/FD-2-miniapp-transport.md` (new)

## API contract

Option A: API-001…API-034 as in `08` §2 and the legacy OpenAPI of KV-BE-012/KV-BE-013. Option B: the adapter list of
step 6 (to be specified by the backend track).

## Business rules

Records the DEV consequences of step 7; no rule changes by itself. BR-API-146 (reload after locale/currency change) is
not reproduced by either option (LB-APP-041 fix, KV-FE-083).

## Acceptance criteria

- The note states the chosen option, who decided and when, and the S5 consequence.
- The port and the error types are specified so that KV-FE-021 can implement them without further decisions.
- The option-B adapter list exists, one row per legacy endpoint.

## Tests

n/a — decision. KV-FE-021 tests both a fake legacy transport and (later) a fake v1 transport against the same port
tests.

## Edge cases

- FD-2 = A and DEC-01 sets an S5 date: the note must say the new client moves to B before that date, or S5 moves.
- FD-2 = B but the adapters are late: the port lets S4 ship on A without screen changes.

## Security

SEC-REQ-003 (initData only in the header for A, only in the exchange body for B), SEC-REQ-004 (credential per surface),
SEC-REQ-007 (no stored credentials), SEC-REQ-028 (phone quota on the legacy route under A).

## Definition of done

Note merged with the decision; FD-2 status updated in `12` §9.1 by its owner; KV-FE-021 unblocked; PR reviewed by the
other developer and the first developer.
