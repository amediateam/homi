# KV-BE-044 — Found survey: API-032 and API-033

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend (track: development) |
| Complexity | S |
| Feature IDs | F-DELIVERY-007 |
| Dependencies | KV-DB-010 (and the M0 legacy layer: KV-BE-005, KV-BE-007, KV-BE-009, KV-BE-010) |

## Goal

The answers to «Нашли жильё?» from the legacy Mini App are stored: `POST /api/found` records the answer with its
trigger, `POST /api/found/where` records where the user found housing and links it to their latest `elsewhere`
answer. The decision *when* to ask (`ask_found` on radar pause/delete) and the bot poll stay with M4/M5.

## Legacy reference

- API-032 and API-033 (`08-api-inventory.md:1135-1175`); client `$KVADRO_ROOT/demo/app/src/lib/api/found.js:9-16`,
  `:22-28`; `$KVADRO_ROOT/demo/app/src/features/radar/FoundSheet.jsx:28-46`, `:47-76`, `:95`, `:112` (errors hidden);
  `$KVADRO_ROOT/docs/api.md:949-968`; `$KVADRO_ROOT/docs/about.md:210-211`; mock
  `$KVADRO_ROOT/demo/app/tools/parity/mocks.mjs:154`.
- Rules: BR-DATA-032 (`06` ENT-020), BR-API-090 and C-20 (`07` §3, `ask_found` on `PATCH`/`DELETE`), Q-API-030
  (suppression of further prompts) in `02-legacy-backend-audit.md:432-514` (§9).
- Bot: the poll after the first radar (BOT-069) writes through the same service in M4/M5.

## Implementation

1. Read `.claude/skills/laravel-best-practices/`, `.claude/skills/testing-best-practices/`.
2. `php artisan make:enum Enums/Engagement/FoundAnswer --no-interaction` (`Kvadro`, `Elsewhere`, `Searching`,
   `Stopped`), `FoundTrigger` (`Pause`, `Delete`; the bot poll adds `Poll` in M5), `FoundWhere` (`Telegram`, `Olx`,
   `Site`, `Agent`, `Friends`, `Street`, `Other`).
3. `php artisan make:class Services/Engagement/FoundSurveyService`: `answer(User, FoundAnswer, FoundTrigger): void`
   inserts `found_answers (user_id, answer, trigger, created_at)`; `where(User, FoundWhere): void` updates the user's
   latest `elsewhere` row that has no `where` yet; if none exists, inserts an unattached row with `answer = null`
   (spec — the client never sends it otherwise; record under Q-API-030).
4. `php artisan make:request Legacy/StoreFoundRequest --no-interaction` and `Legacy/StoreFoundWhereRequest`; failures
   → `422 {"detail":"invalid_answer"}`, `invalid_trigger`, `invalid_where`.
5. `php artisan make:controller Legacy/FoundController --no-interaction` (`store`, `where`) returning `204`.
6. Routes (`auth:tma`, `legacy.access`, `throttle:legacy-lists`): `POST found`, `POST found/where`.
7. Expose `FoundSurveyService::shouldAsk(User, FoundTrigger): bool` as a stub returning the legacy-neutral `true`
   (spec) — M4 owns the real rule behind `ask_found` (Q-API-030) and replaces it.
8. Pint, PHPStan, `make ci-backend`.

## Files

- `backend/app/Enums/Engagement/{FoundAnswer,FoundTrigger,FoundWhere}.php` (new)
- `backend/app/Services/Engagement/FoundSurveyService.php` (new)
- `backend/app/Http/Requests/Legacy/{StoreFoundRequest,StoreFoundWhereRequest}.php` (new)
- `backend/app/Http/Controllers/Legacy/FoundController.php` (new)
- `backend/routes/legacy.php` (changed)
- `backend/tests/Feature/LegacyApi/Api032FoundTest.php`, `Api033FoundWhereTest.php` (new)

## API contract

- `POST /api/found`, JSON body `{"answer": "kvadro"|"elsewhere"|"searching"|"stopped", "trigger": "pause"|"delete"}`
  → `204` (response ignored; errors intentionally hidden by the client, `FoundSheet.jsx:95`).
- `POST /api/found/where`, JSON body `{"where": "telegram"|"olx"|"site"|"agent"|"friends"|"street"|"other"}` → `204`;
  carries no trigger and no link to the first answer.
- Errors: unknown literal or missing key → `422 {"detail":"invalid_<field>"}`; `401 {"detail":"unauthorized"}`;
  `403 {"detail":"<reason>"}`; `429 {"detail":"rate_limited"}`. Never an empty `200`.

## Business rules

- Keep: BR-DATA-032 (closed sets; `where` follows only `elsewhere`), BR-API-020 (`204` allowed for `found`).
- Spec-tested: linking `where` to the latest `elsewhere` row; unattached `where` stored; repeated answers stored as
  separate rows (statistics, not idempotent by design — each tap is an answer).
- `ask_found` (BR-API-090, C-20, Q-API-030) — not decided here; M4.
- No DEV applies.

## Acceptance criteria

- Each answer × trigger combination → `204` and one row.
- `where` after `elsewhere` → the same row gets `where`; a second `where` → a new unattached row (latest `elsewhere`
  already answered).
- Unknown values → `422` with a string `detail`, never `500`.

## Tests

- `Api032FoundTest`: dataset of 4 answers × 2 triggers → `204`, row stored; `answer: "maybe"` → `422
  {"detail":"invalid_answer"}`; missing `trigger` → `422`; no auth → `401`; gated → `403`; contract via KV-QA-004.
- `Api033FoundWhereTest`: each of the 7 values after an `elsewhere` → linked; without `elsewhere` → unattached row;
  unknown value → `422`.
- IDOR: B's `where` never attaches to A's `elsewhere` row (`15` §3.1 #6 pattern).
- Limiter `legacy-lists` N+1 → `429`.

## Edge cases

- Body with extra keys (`{"answer": "kvadro", "trigger": "pause", "x": 1}`) → accepted, extra ignored.
- `Content-Type` missing with a JSON body → `422` (the client always sends it; spec).
- Erased user: rows removed by KV-BE-050's registry.

## Security

- SEC-REQ-014 (rows only for the caller), SEC-REQ-006, SEC-REQ-027 `legacy-lists`, SEC-REQ-017 (closed enums, body ≤ 16
  KB). No PII stored.

## Definition of done

Tests green (`make ci-backend`), parity gate items for the API part of F-DELIVERY-007 ticked (`15` §4), API-032 and
API-033 contract cases real in KV-QA-004, the F-DELIVERY-007 row in `09` notes that `ask_found` and the poll remain in
M4/M5, PR reviewed by the other developer.
