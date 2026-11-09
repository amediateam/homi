# KV-INF-023 — Deploy pipeline, smoke tests and release rollback

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | DevOps (track: production — first developer approves) |
| Complexity | L |
| Feature IDs | Technical migration task — every feature reaches staging and production only through this pipeline; S1 exit requires "deploy and release rollback tested" (`18` §5.1 Operations) |
| Dependencies | KV-INF-015 (hosts), KV-INF-019 (Horizon under systemd), KV-INF-022 (scheduler), KV-INF-016 (legacy artefact directories); KV-QA-022 (smoke lists per environment); artisan commands the deploy runs are an interface between the tracks (`docs/handoff/parallel-work.md` §1) |

> **Reconciliation with PR #8 (2026-11-09).** The production track built the deploy differently from the design below.
> `homi-deploy` (`infra/production/bin/homi-deploy`, runbook `docs/infrastructure/deployment.md`) is run by hand as
> root and deploys a checkout of `main`, not atomic release directories, with no GitHub deploy workflows. Staging runs
> new migrations automatically. Production stops until `homi-deploy production --migrate`. Rollback uses `--ref`.
> Re-scope this task with the production track and add only what is missing on top of `homi-deploy`: smoke checks
> that include the webhook and one legacy endpoint, the rollback rehearsal before S1 exits, and the legacy artefacts
> (KV-INF-016). Do not build a second pipeline.

## Goal

A merge to `main` deploys to staging automatically and a manually approved run deploys to production, through atomic
release directories, with smoke tests that include the webhook and one legacy endpoint, and a one-command rollback to
the previous release — rehearsed before S1 exits.

## Legacy reference

- Deploy steps `17` §11 (fetch → `composer install --no-dev` → `migrate --force` → caches → `pnpm -r build` →
  symlink switch → `horizon:terminate` → restart Next → smoke → rollback on failure); legacy artefacts deployed from
  their manifests, not from git builds.
- `18` §5.1 Operations ("deploy and release rollback tested"), `18` §8.4 (HOMI releases roll back to the previous
  release directory after S3).
- ADR-0013 (Next SSR behind nginx, process manager), ADR-0011.

## Implementation

1. `.github/workflows/deploy-staging.yml` (on push to `main` after the CI workflows succeed) and
   `deploy-production.yml` (`workflow_dispatch` with a GitHub environment requiring the first developer's approval).
   Credentials as environment secrets (deploy key or SSH certificate), never in the repository.
2. Server script `infra/server/deploy.sh <release-sha>` (production-owned): create `releases/<timestamp>-<sha>`,
   `composer install --no-dev --no-interaction`, link shared `storage/` and `.env`, `php artisan migrate --force`
   (migrations flagged "data impact" in their PR are skipped by a guard and run by a separate approved job),
   `config:cache`, `route:cache`, `event:cache`, `pnpm install --frozen-lockfile && pnpm -r build` for the Next apps,
   verify legacy artefacts against their manifests (KV-INF-016), switch `current` atomically, `php artisan
   horizon:terminate`, `php artisan schedule:interrupt`, restart the Next services, run smoke tests, keep five releases.
3. Smoke tests (from KV-QA-022, environment-specific): `GET /up` on `api.*` → 200; unsigned `POST` on
   `hook.*/telegram/webhook` → 403 (proves the route and host binding after `route:cache`); `GET /api/meta` on the
   legacy host with a synthetic `initData` signed by the **staging** bot token (staging only, `17` §11) → 200; on
   production `GET /api/meta` without `initData` → 401 legacy dialect; `getWebhookInfo` via
   `php artisan telegram:webhook info` is **not** allowed on production by KV-TG-005 — production uses KV-TG-059's
   read-only health command; Horizon status `running`.
4. On smoke failure: switch `current` back, restart services, mark the run failed, notify the operations chat.
5. `infra/server/rollback.sh` for manual rollback to the previous release (code only; database rollbacks are never
   automatic — fix-forward per `18` §8.2).

## Files

- `.github/workflows/deploy-staging.yml`, `.github/workflows/deploy-production.yml` (new, production-owned)
- `infra/server/deploy.sh`, `infra/server/rollback.sh`, `infra/server/smoke.sh` (new)
- `docs/infrastructure/deployment.md` (new, production-owned)

## API contract

Deploy runs call: `/up`, the webhook route (unsigned), one legacy endpoint, the bot health command; no user data.

## Business rules

None; `18` §1 principle 1 (one side changes at a time) — the pipeline never deploys legacy artefacts and HOMI code in
the same step without both checks passing.

## Acceptance criteria

- A merge to `main` reaches staging in one run with smoke tests green.
- A deliberately broken release (smoke `/up` 500) rolls back automatically; `current` points to the previous release.
- Production deploys require the first developer's approval in the GitHub environment.
- No secret appears in workflow logs (masked secrets, `set -x` off around credentials).

## Tests

| # | Scenario | Expected |
| - | -------- | -------- |
| 1 | merge a no-op PR | staging deploy green, new release directory, `current` switched |
| 2 | release whose `/up` returns 500 (test branch deployed to staging by approval) | automatic rollback, alert |
| 3 | release with a changed legacy `index.html` but old manifest | deploy stops before the switch |
| 4 | `infra/server/rollback.sh` | previous release live within 60 s; Horizon restarted |
| 5 | production dispatch without approval | workflow waits; nothing deployed |
| 6 | grep the workflow log for the token pattern | no match |

## Edge cases

- A migration that locks a large table is never run by the automatic deploy (`docs/handoff/parallel-work.md` §3); the
  guard reads a marker the development track puts in the migration class.
- During the S2 freeze window deploys are blocked (a repository variable `DEPLOY_FREEZE=1` checked by both workflows).
- `route:cache` and `config:cache` must run after `.env` is linked, or the hook host binding is wrong (KV-TG-001 edge case).

## Security

SEC-REQ-034 (secrets per environment, never shared), SEC-REQ-049 (artefacts from manifests, frozen lockfiles), least
privilege for the deploy key (no root, no database superuser).

## Definition of done

Pipeline used for every staging deploy for two weeks without manual steps, rollback rehearsed and timed, `17` §15
item 7 ticked by the first developer, `deployment.md` written.
