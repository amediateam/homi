---
name: homi-team-conventions
description: "How the HOMI team wants agents to work — Russian with the developer and English artifacts, never claim unrun checks, nginx only via sudo nginx (never brew services), no local MinIO, small PRs with merge commits, app.uz read-only, macOS probing pitfalls"
metadata:
  type: feedback
---

Working rules collected from the first developer's sessions (2026-11-08/09):

- Talk to the developer in Russian; everything written into the repository (docs, code comments, commits) is English.
- Never claim a check you did not run — show the command and its output (mandate rule 7). Subagent reports are not verified facts; spot-check them, at most three agents in parallel.
- nginx is started by hand with `sudo nginx` / `make dev-nginx`, **never** through `brew services` — the developer corrected this explicitly («У меня все идет через sudo nginx не brew!»); macOS TCC blocks launchd daemons from `~/Documents` (KI-13). Ask before changing how any shared local service is launched.
- No MinIO locally: media lives on the `public` disk behind `https://cdn.homi.loc` (ADR-0012, the developer's decision).
- Commit after every finished batch, Conventional Commits; small PRs, reviewed by the other developer, merged with merge commits (no squash); never push to `main` directly.
- `app.uz` and the other reference codebases are read-only and are read through the `reference-reader` subagent; never open `.env*`, `key.md` or private keys anywhere.
- Run `make ci-backend` after any change under `backend/`, tooling files included — a tooling-only change once broke the gate unnoticed (AM-36).
- macOS probing: a non-root `lsof` cannot see root-owned sockets (use `nc -z 127.0.0.1 <port>`); `pgrep -x nginx` never matches (use `pgrep -f '^nginx: master process'`); test WebSocket upgrades with `curl --http1.1`; in zsh `echo =====` fails and `set -- $var` does not word-split.

**Why:** each rule comes from a correction or a failure in earlier sessions; the details are in `.ai/memory/known-issues.md` and the phase reports.

**How to apply:** treat these as standing feedback for every HOMI session; when a rule and a newer instruction from the developer conflict, the developer wins — then update this memory. Related: [[homi-project]].
