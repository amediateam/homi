# KV-INF-013 — Dependency audit gates in CI

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | DevOps (track: development) |
| Complexity | S |
| Feature IDs | Technical migration task — SEC-REQ-049 supply chain: every new package of the migration (Telegram, LLM, PostHog, test runners) passes through an audited lockfile |
| Dependencies | — (secret scanning is HANDOFF T10 / SEC-REQ-035 and needs the first developer's approval of the tool; not part of this task) |

## Goal

The backend and frontend CI workflows fail when a locked dependency has a known high or critical vulnerability, with a
documented, time-boxed way to accept an advisory that does not apply.

## Legacy reference

- Legacy supply chain is unknown; the migration adds dependencies only through the approval rule
  (`docs/handoff/parallel-work.md` §4).
- SEC-REQ-049 (`composer audit`, `pnpm audit`, fail on high/critical, CVSS ≥ 9 patched within 48 h); CI gates table
  `17` §11 row "`composer audit`, `pnpm audit`".
- HOMI: `.github/workflows/backend.yml` (`composer setup`, `composer ci:check`, package-registry check),
  `.github/workflows/frontend.yml` (`pnpm install --frozen-lockfile`, lint, typecheck, build).

## Implementation

1. `backend.yml`: a step after "Setup application": `composer audit --locked --format=plain --abandoned=report`;
   failure on any advisory with severity high or critical (composer's exit code; low/medium printed as warnings via
   `--ignore-severity` where the installed Composer supports it — verify the flag on the CI Composer version and note it
   in the PR).
2. `frontend.yml`: `pnpm audit --audit-level=high --prod` in `frontend/` (workspace-wide); dev-only advisories are
   reported in a non-failing step.
3. Exceptions file `.github/audit-ignore.md`: one row per accepted advisory (id, package, why it does not apply,
   expiry date ≤ 30 days, approver). The steps read the ids from it (`composer audit --ignore` / pnpm
   `auditConfig.ignoreCves` in `frontend/package.json`) — any change to it is reviewed by the other developer.
4. `make ci-backend` / `make ci-frontend` run the same commands so local and CI agree.
5. Schedule: run both audits weekly on `main` (`schedule:` trigger) so new advisories surface without a PR.

## Files

- `.github/workflows/backend.yml`, `.github/workflows/frontend.yml` (changed)
- `.github/audit-ignore.md` (new)
- `Makefile` (targets `ci-backend`, `ci-frontend`), `frontend/package.json` (`pnpm.auditConfig`, if used)

## API contract

n/a — CI only.

## Business rules

None; SEC-REQ-049.

## Acceptance criteria

- A branch that pins a test-only package version with a known critical advisory fails the relevant job.
- The weekly run appears in the Actions history for both workflows.
- An entry in `audit-ignore.md` past its expiry date fails the job (a small script compares dates).
- `make ci-backend` and `make ci-frontend` run the audits locally.

## Tests

| # | Check | Expected |
| - | ----- | -------- |
| 1 | throwaway branch adding a known-vulnerable dev package version | backend or frontend job red, advisory id printed |
| 2 | same advisory listed in `audit-ignore.md` with a future expiry | job green, ignore logged |
| 3 | expiry date in the past | job red: "audit exception expired" |
| 4 | `make ci-frontend` locally | audit step runs |

## Edge cases

- The advisory database is unreachable from CI: the step retries once, then fails (a silent pass would hide risk).
- `abandoned` packages are reported, not failed; they get a KI entry.
- Lockfile conflicts follow `docs/handoff/parallel-work.md` §4 (never merged by hand).

## Security

SEC-REQ-049; the exceptions file is the audit trail. No tokens are needed for either audit.

## Definition of done

Both workflows run the audits on PRs and weekly, the exceptions process documented in `docs/development/` (development
owned), PR reviewed by the other developer (workflow change also seen by the first developer).
