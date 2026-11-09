# KV-QA-017 — Security suite 3: privacy, logging, retention, deletion

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | QA (track: development); review by the `security-reviewer` agent and the other developer |
| Complexity | L |
| Feature IDs | F-PRIVACY-002, F-PRIVACY-003, F-PRIVACY-004, F-ACCESS-003, F-ANALYTICS-001, F-ANALYTICS-003, F-BOT-012 |
| Dependencies | KV-QA-001, KV-QA-003; KV-DB-007 (identity schema); CF-019 (retention ADR); T1 (`telegram_updates` processing); KV-DB-013 (import command) for the import guard |

## Goal

The privacy promises carried over from legacy and the HOMI requirements are executable: nothing sensitive reaches
logs, raw updates are scrubbed after processing, every retention rule deletes on time, and «Удалить мои данные»
leaves no trace of the user anywhere in the database.

## Legacy reference

- Public promises: `$KVADRO_ROOT/docs/about.md:264-275`; bot `/privacy` TXT-BOT-083, BR-BOT-085 … BR-BOT-094; deletion
  BTN-076, BOT-080, Q-API-048, Q-BOT-001.
- Requirements: SEC-REQ-036 … SEC-REQ-041, SEC-REQ-047 (`16` §4.9, §4.13), test plan `16` §5.8.
- Data side: ENT-007 (erasure request), `14` §7.9, V-RI-7 and V-RI-10 (`14` §6.3).
- HOMI: `backend/app/Models/TelegramUpdate.php` (`Prunable`), `backend/config/telegram.php:47-48`, ADR-0009 (raw
  intake payloads), CF-019.

## Implementation

1. Read `.ai/agents/security-reviewer.md`, `16` §4.9, §4.13, §5.8 and the retention ADR of CF-019.
2. `backend/tests/Support/Logging/CapturingHandler.php`: a Monolog handler bound to a `testing` log channel that keeps
   records in memory; `assertNoSensitive()` scans message and context for `tma `, `hash=`, `auth_date=`, the bot-token
   pattern (`<digits>:<35 url-safe chars>`), the synthetic webhook secret, `\+998\d{9}` (any operator), `Authorization`
   values and listing texts from the fixture.
3. `backend/tests/Feature/Security/LogScrubbingTest.php`: run an auth failure, a webhook failure, a Bot API failure
   (`FakeBotApi` 500) and an `app_error` event; assert the scan is clean (SEC-REQ-047). `TelescopeRedactionTest.php`:
   with Telescope enabled in a non-local test config, recorded entries hide `authorization`,
   `x-telegram-bot-api-secret-token` and payload fields.
4. `backend/tests/Feature/Security/TelegramUpdateScrubTest.php`: process an `/owner` contact update and a free-text
   update; afterwards the stored row keeps ids, type, status and timestamps only — no phone, name, username, text,
   caption, voice, contact or location (SEC-REQ-037).
5. `backend/tests/Feature/Security/RetentionTest.php`: one test per rule of SEC-REQ-038 with `TashkentClock` / UTC
   travel and `schedule:run` (or the job directly): action log 180 days, withdrawn listings 90 days (phone, text,
   photos, translations, matching `intake_events` fields), `telegram_updates` 14 days, tokens daily prune, Telescope
   48 h; boundary ± 1 s.
6. `backend/tests/Feature/Pgsql/DeletionCompletenessTest.php`: a factory user with every relation (settings, radars,
   hide rules, favourites, history, hidden, blocked authors, votes, survey answers, owner hash, attribution, action log,
   delivered cards, `telegram_updates`, tokens) → deletion procedure → a database-wide scan (all tables, `bigint`,
   `text`, `jsonb` columns via `information_schema`) finds neither the internal user id nor the Telegram id; the
   PostHog fake received one person deletion; a re-import of the same legacy user is skipped (SEC-REQ-039).
7. `backend/tests/Feature/Security/MinimisationTest.php`: the `users` schema has no name or username columns; an update
   and an `initData` with names store no name anywhere (SEC-REQ-036).
8. `backend/tests/Feature/Security/ImportGuardTest.php`: the legacy import command refuses `APP_ENV=local` input that
   lacks the sanitised marker (SEC-REQ-041) — `todo` until KV-DB-013.

## Files

- `backend/tests/Support/Logging/CapturingHandler.php` (new)
- `backend/tests/Feature/Security/{LogScrubbingTest,TelescopeRedactionTest,TelegramUpdateScrubTest,RetentionTest,MinimisationTest,ImportGuardTest}.php` (new)
- `backend/tests/Feature/Pgsql/DeletionCompletenessTest.php` (new)
- `backend/config/logging.php` (a `testing` channel, if needed — shared file, separate small PR per `docs/handoff/parallel-work.md`)

## API contract

Deletion is triggered from the bot (BTN-076) and, if added, from the API; events through `POST /api/events`.

## Business rules

BR-BOT-085 … BR-BOT-094 (privacy promises), BR-API-125, BR-API-129 … BR-API-132 (retention and minimisation).

## Acceptance criteria

- Every bullet of `16` §5.8 is a test (real or `todo` naming its blocker).
- The database-wide scan finds zero occurrences after deletion.
- Each retention rule deletes exactly at its boundary and not one second earlier.

## Tests

As listed.

## Edge cases

- Votes of a deleted user: delete or anonymise per Q-SEC-016; the test follows the decision.
- A deletion request arriving between the migration dump and the freeze (`14` §7.9) — covered by KV-QA-018 and
  KV-DB-027.
- Failed `telegram_updates` rows keep the encrypted payload until the retention limit, then disappear.

## Security

Scans use synthetic markers; the tests never print sensitive values in failure messages (they print the field name
and a hash).

## Definition of done

Tests green (`make ci-backend`, `make ci-backend-pgsql`), parity gate items ticked (15 §4), docs and the feature rows
in 09 updated, PR reviewed by the other developer.
