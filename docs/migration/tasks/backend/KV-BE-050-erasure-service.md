# KV-BE-050 — `ErasureService`: one deletion procedure

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend (track: development) |
| Complexity | L |
| Feature IDs | F-PRIVACY-002 |
| Dependencies | KV-BE-049, KV-DB-007, KV-DB-009, KV-DB-010 (and KV-DB-033, KV-BE-047 `llm_calls`; KV-QA-001 for the `pgsql` scan); PostHog person deletion client: M7 (faked here) |

## Goal

One service deletes everything HOMI holds about a user — in one database transaction plus queued external effects —
records the erasure in a ledger keyed by an HMAC of the Telegram id, and cannot silently miss a table: a schema scan
fails the build when a table with a `user_id` column is not registered. The bot's «Удалить мои данные» (M5), ARM and
v1 later call it; the data migration uses the ledger to replay legacy erasures.

## Legacy reference

- Promise: `$KVADRO_ROOT/docs/about.md:264-275` («Удалить мои данные» deletes from the database immediately, from
  backups in about two weeks, plus PostHog deletion); bot `/privacy` and BTN-076 (`04` §3.16).
- Rules: `02-legacy-backend-audit.md:658-669` (§16: BR-API-128, BR-API-129, Q-API-048), BR-DATA-021, BR-DATA-031,
  ENT-007 (`06` §2.1); `14` §7.9 and KV-DB-027 (erasure replay during the window).
- Security: SEC-REQ-039 (`16-security-review.md:874-881`), SEC-REQ-037, SEC-REQ-004 (tokens revoked), SEC-REQ-047;
  Q-SEC-016 (votes of deleted users); `10` §4.9 ("Erasure: database deletion in one transaction; external effects as
  queued jobs"), §4.12 (`UserErased`).
- Decision: KV-BE-049 (retention and deletion ADR, DEC-12).

## Implementation

1. Read `.claude/skills/laravel-best-practices/`, `.claude/skills/laravel-queues/`, `.ai/agents/security-reviewer.md`
   and the ADR of KV-BE-049.
2. `config/erasure.php`: an ordered registry of erasable tables, each with a strategy — `delete` (by `user_id`),
   `delete_by` (custom column, e.g. `telegram_updates` by the user's Telegram id in `payload->…from->id` or a
   redacted `chat_id` column), `anonymise` (null the FK) or `recount` (delete, then recompute aggregates). Initial
   entries: `user_settings`, `access_grants`, `user_attributions`, `favorites`, `listing_views`, `hidden_listings`,
   `blocked_authors`, `listing_votes` (delete + recount through `VoteService`, Q-SEC-016 spec), `owner_verifications`,
   `found_answers`, `radars`, `radar_hide_rules`, `radar_deliveries`, `bot_listing_messages`, `radar_pending_items`,
   `telegram_updates` (the user's rows), `personal_access_tokens` (morph `tokenable`), `media_file_references` (user
   uploads, reference-counted delete through KV-BE-002), `llm_calls` (no user column today — listed as "n/a, reason"),
   and finally `users`. `user_action_log` is added by M7 (the scan forces it).
3. `php artisan make:class Services/Privacy/ErasureService`: `erase(User $user, string $source): ErasureReceipt` —
   a. compute `subject_hash = HMAC-SHA256(telegram_user_id, ERASURE_SUBJECT_KEY)` (env key `PROPOSED` in KV-BE-049);
   b. `DB::transaction`: walk the registry in order, then insert `erasure_requests (subject_hash, requested_at,
      db_erased_at, source)`; the analytics distinct id is read before the user row goes;
   c. after commit: `RequestPostHogPersonDeletion` job (`php artisan make:job Privacy/RequestPostHogPersonDeletion
      --no-interaction`, queue `default`, retried with backoff, updates `posthog_request_id`/`posthog_done_at`;
      the HTTP client is a stub interface here, faked in tests; M7 supplies the real client);
   d. dispatch `App\Events\Privacy\UserErased` (`php artisan make:event Privacy/UserErased --no-interaction`) with
      the subject hash only — listeners: Telegram state reset (M5), cache flush of per-user keys (`share:*`, quota
      counters, limiter buckets).
4. Idempotency: erasing an already erased subject → no error, ledger row reused; a later `UserResolver` call for the
   same Telegram id (the user comes back) creates a fresh user — the ledger only blocks **re-import** from legacy
   (`EnsureNotErased::check(subject_hash)` used by the migration loaders, KV-DB-014).
5. Concurrency: queued delivery or matching jobs for the user must stop — jobs load the user by id and skip when it
   is gone (document for M4 owners); `15` §3.6 #9.
6. `php artisan make:test --pest Privacy/ErasureRegistryTest`: introspect the PostgreSQL schema
   (`information_schema.columns` where `column_name = 'user_id'` plus `tokenable_id`) and fail if a table is missing
   from `config/erasure.php` (allow-list with reasons for exceptions).
7. Bot-facing entry for M5: `ErasureService::erase($user, 'bot')`; the confirmation step lives in the bot.
8. Pint, PHPStan, `make ci-backend`.

## Files

- `backend/config/erasure.php` (new)
- `backend/app/Services/Privacy/ErasureService.php`, `backend/app/Domain/Privacy/ErasureReceipt.php`,
  `backend/app/Services/Privacy/EnsureNotErased.php` (new)
- `backend/app/Models/ErasureRequest.php`, `backend/database/factories/ErasureRequestFactory.php` (if KV-DB-007 did not
  create them)
- `backend/app/Jobs/Privacy/RequestPostHogPersonDeletion.php`, `backend/app/Contracts/Analytics/PersonEraser.php`
  (interface; fake in tests) (new)
- `backend/app/Events/Privacy/UserErased.php` (new)
- `backend/tests/Feature/Privacy/{ErasureServiceTest,ErasureRegistryTest,ErasureScanTest}.php` (new; the last two in
  the `pgsql` group)

## API contract

n/a on the legacy surface (no deletion route exists; `08` has none). Internal API: `erase(User, string $source):
ErasureReceipt {subject_hash, erased_tables: array<string,int>, posthog_job_id}`. The bot (M5) answers the user after a
successful return.

## Business rules

- Keep: BR-API-128 (PostHog person deletion), BR-API-129 / BR-DATA-031 (database deletion at once; backups age out in
  about two weeks **[PT]**), BR-DATA-021, BR-DATA-001 (the Telegram id is never re-keyed; a returning user is new).
- Spec-tested decisions (no legacy oracle, Q-API-048): votes deleted with recount (Q-SEC-016, recorded in KV-BE-049);
  `bot_listing_messages` rows deleted (the bot can no longer edit those cards to «Объявление снято» — accepted).
- No DEV applies.

## Acceptance criteria

- A factory user with every relation of M1 (and a Sanctum token, a Telegram update, an upload) → after `erase()` a
  database-wide scan finds no row referencing the user id and no `jsonb` value containing the user's id or Telegram
  id (SEC-REQ-039).
- One `erasure_requests` row with the HMAC subject and no clear Telegram id; the PostHog fake received exactly one
  deletion for the user's `analytics_distinct_id`; all tokens revoked.
- Adding a migration with a new `user_id` table without registering it fails `ErasureRegistryTest`.
- Erasing twice is harmless; a migration loader skips a ledgered subject.

## Tests

- `ErasureServiceTest`: full-relation factory user → per-table counts in the receipt; other users' rows untouched;
  vote aggregates recomputed (an `agent` mark that depended on the erased vote is re-evaluated, KV-BE-043);
  `UserErased` dispatched with the hash only; PostHog job queued `afterCommit` and retried on a faked `5xx`; second
  erase → no exception.
- `ErasureScanTest` (`pgsql`, KV-QA-017 pattern, `16` §5.8): scan every table and `jsonb` column for the user id and
  Telegram id after erasure → zero hits.
- `ErasureRegistryTest` (`pgsql`): schema introspection vs registry.
- Race (`15` §3.6 #9): a queued delivery job for the user runs after erasure → stops, recreates nothing.
- Re-import (`15` §3.5 #9): `EnsureNotErased` blocks a legacy loader row with the same subject.
- Logging (SEC-REQ-047): the erasure log line carries the subject hash prefix, never the Telegram id.

## Edge cases

- User with radars currently delivering: deliveries stop; nothing is re-sent to the deleted chat.
- User who never had settings or lists: only `users` and the ledger change.
- PostHog unavailable for days: job retries with backoff and records the failure; the database part is already done.
- Erasure during the migration window: KV-DB-027 replays the legacy list through the same ledger.
- Staff accounts (email set, ARM roles later): same procedure; ARM audit rows keep the actor id per KV-BE-049
  (anonymised actor, spec).

## Security

- SEC-REQ-039 (one procedure, ledger keyed by HMAC, PostHog), SEC-REQ-004 (tokens revoked), SEC-REQ-037 (raw updates of
  the user deleted), SEC-REQ-034 (`ERASURE_SUBJECT_KEY` per environment), SEC-REQ-047 (no Telegram id in logs).
- Review by `.ai/agents/security-reviewer.md` before merge.

## Definition of done

Tests green (`make ci-backend` + `pgsql` group), parity gate items for F-PRIVACY-002 ticked for the backend part (`15`
§4; the bot trigger remains with M5), the registry documented in the PR so M4/M5/M7 owners extend it, the
F-PRIVACY-002 row in `09` updated, PR reviewed by the other developer.
