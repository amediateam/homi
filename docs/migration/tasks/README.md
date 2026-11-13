# Migration tasks

One file per task: `tasks/<track>/KV-<TRACK>-NNN-<short-slug>.md`. Tracks: `backend` (`KV-BE`), `frontend`
(`KV-FE`), `telegram` (`KV-TG`), `database` (`KV-DB`), `infrastructure` (`KV-INF`), `qa` (`KV-QA`). Numbers are
stable; a dropped task keeps its file with `Status: DROPPED` and the reason.

A task is small enough for one working session of one engineer or agent (roughly ≤ 400 changed lines without
generated files, per `docs/handoff/parallel-work.md`). "Implement the personal cabinet" is not a task. Every task
links at least one feature `F-…` from [`../09-feature-parity-matrix.md`](../09-feature-parity-matrix.md), or says
`Technical migration task` and why.

Order and dependencies: [`../13-dependency-graph.md`](../13-dependency-graph.md). Plan:
[`../21-development-master-plan.md`](../21-development-master-plan.md).

## Template

```markdown
# KV-BE-001 — <title>

| Field | Value |
| ----- | ----- |
| Status | TODO / IN_PROGRESS / REVIEW / DONE / BLOCKED (reason) / DROPPED (reason) |
| Owner | Backend / Frontend / QA / DevOps (track: development or production) |
| Complexity | S / M / L / XL |
| Feature IDs | F-… |
| Dependencies | KV-… (and decisions: CF-…, Q-…) |

## Goal
What exists when this is done, in one or two sentences.

## Legacy reference
Concrete sources: `$KVADRO_ROOT/…:line`, audit IDs (API-, SCR-, BOT-, BTN-, BR-, LB-, URL-…).

## Implementation
Numbered steps, in order. Name the artisan generators, the packages already installed, the skill or agent to read
first (`.claude/skills/…`, `.ai/agents/…`).

## Files
Expected new/changed files in this repository.

## API contract
Request/response, errors (or "n/a").

## Business rules
BR-… to keep; DEV-… to apply (with the approved/proposed state).

## Acceptance criteria
Unambiguous, checkable statements.

## Tests
Unit / feature / contract / E2E / visual — the concrete cases, including the characterization cases from 15.

## Edge cases
Negative and unusual scenarios.

## Security
SEC-REQ-… that apply; ownership checks; validation; PII.

## Definition of done
Tests green (`make ci-backend` / `make ci-frontend`), parity gate items ticked (15 §parity gate), docs and the
feature row in 09 updated, PR reviewed by the other developer.
```
