# KV-BE-011 — Access administration commands

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend (track: development); running the commands on staging and production **[PT]** |
| Complexity | S |
| Feature IDs | F-ADMIN-001 |
| Dependencies | KV-BE-009 |

## Goal

Until ARM exists, an operator can manage closed-beta access from the server shell: admit, block and unblock a user,
mark owners, create invite links and set the seat limit, with every action written to an audit log line that carries
no Telegram id in clear. Staging rehearsals (S1) and the cut-over (DEC-25) can then admit testers without SQL.

## Legacy reference

- Operations implied by legacy behaviour but with no visible tooling: beta seats and invites, owner list, user
  blocking (BR-API-012, BR-API-016; `$KVADRO_ROOT/docs/about.md:248-252`, `:453`; Q-API-006, Q-API-058; Q-SYS-004).
- Feature F-ADMIN-001 (P1, REBUILD: "Admin (ARM API) or artisan commands"); GAP-020, GAP-023; OPQ-4 (ARM roles open,
  DEC-22).
- Invite tokens are migrated as hashes and must keep working (`14` §3 "Invite token"; ENT-004).
- Admin access rules: SEC-REQ-046 (ARM later), Q-SEC-018 (legacy owner/team lists not imported as admins without
  review).

## Implementation

1. Read `.claude/skills/laravel-best-practices/` (commands) and `.ai/agents/security-reviewer.md`.
2. Tests first (below).
3. `php artisan make:command Access/AccessGrantCommand --no-interaction` and siblings, signatures:
   `access:grant {telegram_id}`, `access:block {telegram_id} {--reason=}`, `access:unblock {telegram_id}`,
   `access:owner {telegram_id} {--remove}`, `access:invite {--uses=1} {--expires=7d}` (prints the invite link
   `https://t.me/<bot>?start=<payload>` once; stores only the token hash), `access:seats {count|unlimited}` (writes the
   runtime override in the `features` table via Pennant or a settings row — pick one and document it; `ACCESS_MAX_SEATS`
   stays the default), `access:status {telegram_id}` (prints the `AccessGate` decision).
4. All write commands go through `AccessGate`/`AccessGrantService` methods (no SQL in commands), raise
   `AccessStateChanged`, and write one `info` log line on a dedicated `audit` channel with action, internal user id,
   the operator (`get_current_user()` / `--operator=`), and time; the Telegram id is never logged (HMAC fingerprint if
   needed).
5. Refuse to run against production without `--force` (`App::isProduction()` + `$this->confirm` pattern, mirroring
   the destructive-command protection of `AppServiceProvider`).
6. The invite payload grammar for `/start` is owned by the bot (M5, BR-API-120, BR-BOT-096); this task only needs a
   payload prefix agreed with the telegram track (`inv_<token>`, `PROPOSED`) and documents it.
7. Pint, PHPStan, tests.

## Files

- `backend/app/Console/Commands/Access/*.php` (new)
- `backend/app/Services/Access/AccessGrantService.php` (new, if not part of `AccessGate`)
- `backend/config/logging.php` (`audit` channel)
- `backend/tests/Feature/Access/AccessCommandsTest.php` (new)
- `docs/infrastructure/operations-access.md` or a section in an existing runbook (short usage note)

## API contract

n/a — console only. Command contract: exit code `0` on success, `1` on unknown user or invalid input; output never
contains a Telegram id other than the one typed, and never a stored token hash.

## Business rules

Kept: BR-API-012 (meanings), BR-API-016 (mode and owner list are configuration), BR-DATA-007 (admitted users stay
admitted). Q-API-006 answers may change the invite semantics; the commands are thin over `AccessGate`.

## Acceptance criteria

- `access:block` makes every protected legacy route answer `403 {"detail":"blocked"}` for that user at once (cache
  flushed); `access:unblock` restores the previous decision.
- `access:invite --uses=2` prints a link; two different users admitted through it, the third is not.
- `access:owner` admits in `private` mode; `--remove` reverts.
- Running a write command with `APP_ENV=production` without `--force` does nothing.
- The audit log has one line per action without a clear Telegram id.

## Tests

`backend/tests/Feature/Access/AccessCommandsTest.php`:
- `it('blocks and unblocks a user')` with `$this->artisan(...)->assertExitCode(0)` and an `AccessGate` assertion.
- `it('creates an invite that admits up to its uses')` (calls `AccessGate::admitByInvite`).
- `it('stores invite tokens only as hashes')`.
- `it('refuses to run in production without force')`.
- `it('writes an audit line without the telegram id')` with `Log::spy()`.
- `it('fails cleanly for an unknown telegram id')`.

## Edge cases

- A Telegram id that has never opened the app: `access:grant` creates a pre-admission row keyed by Telegram id (the
  user row is created on first contact) — or refuses; decide in the PR and test it.
- Seats lowered below the admitted count: nobody is evicted; new users get `full`.
- Expired invites are refused even with uses left.

## Security

SEC-REQ-046 (operator actions audited; ARM replaces these later), SEC-REQ-036 and SEC-REQ-047 (no Telegram id in logs),
invite tokens hashed (`14` §3); shell access itself is production-track controlled **[PT]**.

## Definition of done

Tests green (`make ci-backend`), parity gate items ticked (15 §4), docs and the feature row in 09 updated, PR reviewed
by the other developer. Additionally: Pint and PHPStan level 7 clean; usage note for the production track; the invite
payload prefix agreed with the telegram track and recorded.
