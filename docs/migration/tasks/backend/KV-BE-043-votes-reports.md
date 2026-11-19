# KV-BE-043 — Votes and reports: API-016

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend (track: development) |
| Complexity | L |
| Feature IDs | F-REPORT-001, F-REPORT-003 |
| Dependencies | KV-BE-040, KV-DB-010, KV-DB-032 (and KV-DB-008 `listing_authors`, KV-DB-007 profile flags); thresholds: DEC-10 not needed, Q-API-039 and DEV-010 for values |

## Goal

`POST /api/listings/:id/report` records one weighted vote per (user, listing, reason), hides the listing for the
voter where legacy does, always answers `200 {"hidden": bool}`, and applies global effects (realtor mark on the
phone, «rented» status) only after a configurable weighted threshold of distinct voters with an audit trail and a kill
switch. The same `VoteService` serves the bot's «Уже сдано» / «Это риелтор» buttons in M5.

## Legacy reference

- API-016 (`08-api-inventory.md:963-1007`); client `$KVADRO_ROOT/demo/app/src/lib/api/listings.js:84-90`,
  `$KVADRO_ROOT/demo/app/src/features/listing/ListingActionsSheet.jsx:12` (`agent` hidden when `is_owner: false`),
  `:89-95`, `$KVADRO_ROOT/demo/app/src/app/useListingActions.js:61-77` (toasts, undo for `fraud`), toasts in
  `$KVADRO_ROOT/demo/app/src/i18n/locales/ru.js:217-220`; mock `$KVADRO_ROOT/demo/app/tools/parity/mocks.mjs:175-177`;
  `$KVADRO_ROOT/docs/api.md:675-705`; `$KVADRO_ROOT/docs/about.md:219-228`.
- Rules: `02-legacy-backend-audit.md:665-710` (§11: BR-API-101…106, Q-API-038, Q-API-039, Q-API-040, LB-API-015).
- Bot side (M5 reuses the service): `04-telegram-bot-audit.md` card buttons (BR-BOT-061, BR-BOT-062), `09` C-05, C-06.
- Data: ENT-018, ENT-030 (`06` §2.3–§2.4; `listing_votes`, `listing_authors`), LB-DATA-012, LB-DATA-013.
- Security: SEC-REQ-045 (`16-security-review.md:914-921`), reviewer rule 10 (`.ai/agents/security-reviewer.md`).

## Implementation

1. Read `.claude/skills/laravel-best-practices/`, `.claude/skills/pennant-development/`,
   `.claude/skills/testing-best-practices/` and `.ai/agents/security-reviewer.md` (detectors that label people).
2. `php artisan make:enum Enums/Engagement/ReportReason --no-interaction` (if KV-BE-014 has not created it):
   `Rented`, `Agent`, `WrongData`, `Fraud`.
3. `php artisan make:request Legacy/StoreReportRequest --no-interaction`: `reason` required, in the four literals;
   failures → `422 {"detail":"invalid_reason"}` through the legacy renderer; body ≤ 16 KB.
4. `php artisan make:class Services/Engagement/VoteService`: `report(User, Listing, ReportReason): ReportOutcome` in
   one transaction —
   a. `insertOrIgnore` into `listing_votes (user_id, listing_id, reason, weight, created_at)`; a repeat is counted
      once and returns the same outcome;
   b. `weight` from `users.is_premium`, `has_username`, `has_photo`, `account_age_estimate` with the formula in
      `config/votes.php` (BR-API-106 🔶; values `PROPOSED`);
   c. voter-side hide through `PersonalListService::hide()` with `HiddenReason::ReportRented` (`rented`) or
      `ReportFraud` (`fraud`) → `hidden: true`; `agent`, `wrong_data` → `hidden: false`;
   d. aggregate: sum of weights of distinct non-withdrawn voters per (listing, reason) for `rented`, per author phone
      for `agent`; compare with `config('votes.thresholds.*')`;
   e. threshold reached → dispatch `RentedThresholdReached` / `AgentThresholdReached`
      (`php artisan make:event Engagement/RentedThresholdReached --no-interaction`, same for `Agent…`).
5. Listeners (`php artisan make:listener … --no-interaction`, queued `afterCommit`):
   `MarkAuthorAsRealtor` sets `listing_authors.realtor_mark_at` and `realtor_mark_source = 'votes'` once;
   `MarkListingRentedByVotes` calls `App\Services\Listings\ListingStatusService::markRentedByVotes()` — create this
   minimal service here (`php artisan make:class Services/Listings/ListingStatusService`): status transition to the
   withdrawn/rented state with a `listing_status_events` row (cause `votes_rented`); M6 extends the status machine.
6. Audit: every threshold evaluation that changes state writes a `vote_decisions` row (inputs: reason, subject,
   voter count, weight sum, threshold, outcome) — add the small table in this task's migration if KV-DB-010 did not
   (`php artisan make:migration create_vote_decisions_table --no-interaction`), and say so in the PR.
7. Kill switches: Pennant features `votes.realtor-detector`, `votes.rented-detector`
   (`php artisan pennant:feature`-style class in `app/Features`); off → no global effect is applied and
   `owner_verified`/realtor marks from votes are ignored by KV-BE-025.
8. `php artisan make:controller Legacy/ReportController --no-interaction`; route `POST listings/{number}/report`
   (`auth:tma`, `legacy.access`, `throttle:legacy-report`).
9. Bot-facing methods for M5: `withdraw(User, Listing, ReportReason)` (sets `withdrawn_at`, recomputes; bot
   «↩️ Не сдано» / «↩️ Не риелтор»). The legacy Mini App has no undo route (DEV-051 is new-client only).
10. Pint, PHPStan, `make ci-backend`.

## Files

- `backend/app/Services/Engagement/VoteService.php`, `backend/app/Domain/Engagement/ReportOutcome.php` (new)
- `backend/app/Services/Listings/ListingStatusService.php` (new, minimal)
- `backend/app/Events/Engagement/{RentedThresholdReached,AgentThresholdReached}.php` (new)
- `backend/app/Listeners/Engagement/{MarkAuthorAsRealtor,MarkListingRentedByVotes}.php` (new)
- `backend/app/Features/{RealtorDetector,RentedDetector}.php` (new), `backend/config/votes.php` (new)
- `backend/app/Http/Controllers/Legacy/ReportController.php`, `backend/app/Http/Requests/Legacy/StoreReportRequest.php`
- `backend/database/migrations/*_create_vote_decisions_table.php` (only if KV-DB-010 has no audit table)
- `backend/tests/Feature/LegacyApi/Api016ReportTest.php`, `backend/tests/Feature/Engagement/VoteThresholdTest.php`,
  `backend/tests/Feature/Pgsql/VoteRaceTest.php`, `backend/tests/Unit/Engagement/VoteWeightTest.php`

## API contract

- `POST /api/listings/:id/report`, `Content-Type: application/json`, body `{"reason": "rented"|"agent"|"wrong_data"|"fraud"}`.
- Response **always** `200 {"hidden": <boolean>}` for every reason — never `204` (a `204` makes the client show «Не
  получилось сохранить», LB-API-015): `rented` → `true`, `fraud` → `true`, `agent` → `false`, `wrong_data` → `false`.
- Errors: `reason` missing, not a string or outside the set (`"spam"`), or no body → `422 {"detail":"invalid_reason"}`;
  unknown number → `404 {"detail":"Not Found"}`; `401 {"detail":"unauthorized"}`; `403 {"detail":"<reason>"}`;
  over 30/day → `429 {"detail":"rate_limited"}`. Client toasts per `useListingActions.js:61-77`.

## Business rules

- Keep: BR-API-101 (reasons, `{hidden}` shape), BR-API-102 (`rented` hides for the voter at once, globally after more
  confirmations), BR-API-104 (`fraud` hides for the reporter, undone through API-013), BR-API-105 (client hides
  `agent` when `is_owner: false` — server still accepts it), BR-API-106 (weights), BR-DATA-018.
- Defect fixes `APPROVED`: LB-API-015 (`200 {"hidden": …}` for every reason), LB-API-043 (one row per (user, listing,
  reason)), LB-DATA-012.
- Security requirement (not a DEV): SEC-REQ-045 — one tap never relabels a number; weighted distinct-voter threshold;
  audit; kill switch.
- `PROPOSED`: DEV-010 (threshold values, «спасибо, проверим» wording, undo in the bot, button hidden where already
  marked) — the threshold is configurable now; tests of the proposed wording/undo are `->todo('DEV-010 PROPOSED')`;
  DEV-051 (Mini App undo of `rented`) — new client only. Q-API-039 (legacy thresholds) stays open: legacy may have
  marked after one vote; HOMI does not, by SEC-REQ-045.

## Acceptance criteria

- Each reason → `200` with the documented `hidden`; `rented`/`fraud` create the voter's hidden row.
- Same user, same reason twice → one vote row, same response; two reasons → two rows.
- One `agent` vote leaves the phone unmarked; the configured number of distinct weighted voters marks it once, with
  one audit row; the kill switch removes all vote-based marks from responses.
- `rented` threshold → one status event via `ListingStatusService`; feed excludes the listing for everyone.

## Tests

- `Api016ReportTest`: dataset over the four reasons → status `200`, JSON `{"hidden": …}` (never `204`); `"spam"`,
  missing body, `{"reason": 1}` → `422 {"detail":"invalid_reason"}`; unknown number → `404`; no auth → `401`;
  `blocked` → `403`; contract via KV-QA-002/KV-QA-004 (`assertJsonBodyWhen2xx`, no `204` on report routes).
- Repeat (`15` §3.4 #5): same reason twice → counted once; two reasons → two rows.
- `VoteThresholdTest`: below threshold no mark; at threshold mark + audit + event once; withdrawn vote lowers the sum;
  kill switch off → no mark; low-trust voters (no Premium, no username, new account) do not reach the threshold alone
  (`08` API-016 "anti-abuse"); `->todo('DEV-010 PROPOSED')` for the wording and bot undo.
- `VoteRaceTest` (`pgsql`, KV-QA-008, `15` §3.6 #4, #5): N distinct users vote `agent` concurrently across the
  threshold → one mark, N rows; one user twice concurrently → one row.
- IDOR (`15` §3.1 #6): B's report never changes A's hidden rows or votes.
- `VoteWeightTest`: formula dataset from `config/votes.php`.

## Edge cases

- Report on a listing already marked (realtor) → `200 {"hidden": false}`, vote stored, no second mark.
- `fraud` then unhide (API-013) → hidden row gone, vote kept (Q-API-040 spec).
- Listing merged after the vote: votes re-pointed by the M6 merge listener; aggregation keys on the survivor.
- Erased voter (KV-BE-050): votes deleted and aggregates recomputed (Q-SEC-016 spec: delete with recount).
- Listing without an author → `agent` stored, no author effect.

## Security

- SEC-REQ-045 (detectors that label people), SEC-REQ-015 (unique per (user, listing, reason); race-safe), SEC-REQ-014
  (votes only for the caller), SEC-REQ-027 (`legacy-report` 30/day), SEC-REQ-048 (alert input: vote bursts against one
  phone — counter emitted).
- No PII in audit rows: voter ids are internal ids; the phone is referenced by `listing_authors.id`, never by number.
- Review by `.ai/agents/security-reviewer.md` before merge (detector).

## Definition of done

Tests green (`make ci-backend` + `pgsql` group), parity gate items for F-REPORT-001 and F-REPORT-003 ticked except
those waiting on DEV-010 (`15` §4), API-016 contract case real in KV-QA-004, security-reviewer checklist clean, the
feature rows in `09` updated, PR reviewed by the other developer.
