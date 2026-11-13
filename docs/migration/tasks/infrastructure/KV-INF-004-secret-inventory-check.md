# KV-INF-004 — `security:check` secret inventory (names only)

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | DevOps (track: development) |
| Complexity | S |
| Feature IDs | F-BOT-012, F-ACCESS-001 (bot token, webhook secret and the `initData` key are the secrets these features cannot run without) |
| Dependencies | KV-INF-003 (names per feature); production track runs it on staging and production |

## Goal

`php artisan security:check` tells, without printing any value, whether every required secret of the current
environment is present and long enough, and whether the per-environment rules hold (Telegram token shape, webhook
secret alphabet, signing keys ≥ 32 bytes, `TELESCOPE_ENABLED` off in production). The production track runs it after
every `.env` change and at the S1 exit; the operator checklist compares hashes across environments.

## Legacy reference

- SEC-REQ-034 (secret inventory, separate per environment, `security:check` named there, ≥ 32 bytes); SEC-022 (the bot
  token is the master key for identity); SEC-REQ-012 (production token only in the production vault).
- `18` §5.1 row "Security": "secret inventory check (SEC-REQ-034) per environment" is an S1 exit criterion.
- Names: `17` §4 (Telegram, signed URLs, phones, LLM, PostHog, Telescope), `backend/config/telegram.php`.
- Legacy secrets are never imported (SEC-REQ-034: HOMI signs its own URLs).

## Implementation

1. `php artisan make:command Security/SecurityCheckCommand --no-interaction` (`security:check`).
2. A config-driven list in `config/security_inventory.php` (new; no env reads of its own): name, required in
   (`local|staging|production`), rule (`telegram_token`, `webhook_secret`, `min_bytes:32`, `url_https`, `bool_false`),
   feature tag. Initial list from `17` §4: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_WEBHOOK_SECRET`,
   `TELEGRAM_UPDATES_ENCRYPTION_KEY`, `MEDIA_URL_SIGNING_KEY`, `CALL_LINK_SIGNING_KEY`, `PHONE_HMAC_PEPPER`,
   `PHONE_ENCRYPTION_KEY`, `APP_KEY`, the chosen LLM key (DEC-03), `POSTHOG_PERSONAL_API_KEY`, `TELESCOPE_ENABLED`.
   Keys whose feature is not built yet are `required: false` with a note.
3. Rules: token = `^\d{6,12}:[A-Za-z0-9_-]{30,40}$` (shape only); webhook secret = 32–256 chars of `A-Z a-z 0-9 _ -`;
   `min_bytes` counts decoded bytes for `base64:` values; production must have `TELESCOPE_ENABLED=false` unless the
   SEC-034 resolution says otherwise (backend redaction task, SEC-REQ-047).
4. Output: one line per key `PASS|FAIL|SKIP <NAME> <rule>`; `--fingerprint` prints `sha256(value)[0..8]` per key so
   the operator can confirm that staging and production differ without revealing values (SEC-REQ-034 checklist).
   Exit 1 on any FAIL.
5. Add the command to `make dev-check` (local profile: WARN instead of FAIL for keys of features not used locally).
6. Document the run in `docs/infrastructure/environments.md` (names section) and hand the staging/production run to
   the production track (deploy smoke step in KV-INF-023, S1 exit evidence).

## Files

- `backend/app/Console/Commands/Security/SecurityCheckCommand.php` (new), `backend/config/security_inventory.php` (new)
- `backend/tests/Feature/Console/SecurityCheckCommandTest.php` (new)
- `scripts/dev/check.sh`, `docs/infrastructure/environments.md`

## API contract

n/a — artisan command. Exit codes: `0` all required keys pass; `1` any FAIL.

## Business rules

n/a — security requirements only (SEC-REQ-034).

## Acceptance criteria

- With a test config holding a 20-byte `MEDIA_URL_SIGNING_KEY` the command prints `FAIL MEDIA_URL_SIGNING_KEY min_bytes:32`
  and exits 1; with 32 bytes it passes.
- No test captures any configured value in the command output or the log (assert on a known synthetic value).
- `--fingerprint` output for two different synthetic values differs and contains 8 hex characters per key.

## Tests

Pest (`SecurityCheckCommandTest`, synthetic values only):

| # | Case | Expected |
| - | ---- | -------- |
| 1 | all keys valid, env `production`, Telescope off | exit 0 |
| 2 | `TELEGRAM_BOT_TOKEN` blank in `staging` | FAIL, exit 1 |
| 3 | token `123:abc` | FAIL `telegram_token` |
| 4 | webhook secret with `+` | FAIL `webhook_secret` |
| 5 | `TELESCOPE_ENABLED=true` in `production` | FAIL `bool_false` |
| 6 | env `local`, LLM key blank | SKIP |
| 7 | output contains the synthetic secret string | never (assert `doesntContain`) |

## Edge cases

- `config:cache` on servers: the command reads `config()`, so it checks what the cached config actually holds.
- Keys rotated with a `_PREVIOUS` companion: the previous key is optional and only shape-checked.
- A key required only after a stage (e.g. the LLM key after DEC-03) stays `required: false` until its feature lands.

## Security

- SEC-REQ-034, SEC-REQ-013, SEC-REQ-047: values never printed or logged; fingerprints are truncated hashes, not
  reversible for random secrets.
- Agents never run it against staging or production (`docs/handoff/parallel-work.md` §6); the production track does.

## Definition of done

Tests green (`make ci-backend`); `make dev-check` shows the inventory section; the production track has run it on
staging (output without values pasted into its notes); PR reviewed by the other developer and the
`security-reviewer` agent.
