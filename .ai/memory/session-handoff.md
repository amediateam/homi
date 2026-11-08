---
updated: 2026-11-08 (end of Phase 2 session)
source-of-truth: this session; overwritten every session
---

# Session handoff

## Done this session
- Phase 2 — local environment, applied and verified on the first developer's machine: nginx vhosts + snippets, mkcert TLS, `/etc/hosts`, `scripts/dev/*`, `Makefile`, backend `.env.example`/`cors`/`filesystems`, frontend workspace packages and `.env.example`s, ADR-0012 (no local MinIO), ADR-0008 amended (`sudo nginx`). Report: `docs/ai/reports/phase-2.md`.
- Incident: a `brew services restart nginx` step in `nginx.sh` created a launchd daemon that macOS TCC blocks from `~/Documents` and chowned nginx paths to root; the developer corrected the convention, removed the daemon and restored ownership. Never use `brew services` for nginx on these machines (KI-13). Ask before changing how a shared service is launched.
- Probe bugs fixed: `lsof` as non-root cannot see root sockets, `pgrep -x nginx` never matches → `nc -z` + `pgrep -f` (KI-15); nginx `error_log` rejects variables (KI-14).

## Verified (commands run this session, exit codes read)
- `make dev-check` exit 0: 24 PASS / 0 WARN / 0 FAIL. Six hosts answer over HTTPS with the trusted mkcert cert; `http://` → 301; `hook.` serves only `/telegram/*` + `/up`; HMR `101 Switching Protocols` on `/_next/hmr` through nginx.
- `composer ci:check` exit 0; `pnpm -r lint` exit 0; `pnpm -r typecheck` exit 0; `make registry-check` exit 0; `bash -n scripts/dev/*.sh` ok.
- PR #3 (`chore/phase-2-local-env` → `chore/phase-1-foundation`) opened; CI green on both workflows after adding a `postgres:18` service to `backend.yml` (AM-34: `.env.example` defaults to pgsql, so `composer setup` migrates against a real database in CI).
- Not verified: `make dev-setup` end-to-end on a clean clone; `make dev-reset`; `pnpm -r build` (CI); second developer's machine.

## Decisions taken
- ADR-0012 (media on disk locally, `MEDIA_PUBLIC_URL` everywhere); ADR-0008 amendment (manual `sudo nginx`). See `docs/architecture/decisions/README.md`.

## Remaining / next step
1. Developer decision: merge order #1 → #2 → #3 (PR #3 is stacked on the phase-1 branch and retargets to `main` automatically). CI must stay green on each.
2. Second developer: `make dev-setup` → `make dev-check`; record any FAIL as a KI.
3. **Phase 3 — CDN, webhook, intake**: ask approval to install PROPOSED packages (`league/flysystem-aws-s3-v3`, `intervention/image`, `dedoc/scramble`); port the READY media code from the `app.uz` catalogue (`docs/reference-codebase.md`); Telegram webhook on `hook.` with the **dev** bot only, via an HTTPS tunnel; `/api/v1/intake/*` contract (`docs/api/intake.md` + OpenAPI) from `docs/api/intake-sources.md`. Report `docs/ai/reports/phase-3.md`.
4. Phase 4 later: root `.claude/`, `.ai/{rules,skills,agents,tasks}`, `AGENTS.md`, `GEMINI.md`, hooks; fix Laravel Boost MCP (still CONNECTION_CLOSED); smoke-test codex/gemini/grok (approved).

## Errors / gotchas observed
- See `.ai/memory/known-issues.md` KI-13…KI-15 (nginx/TCC, `error_log` variables, `lsof`/`pgrep` on macOS). HTTP/2 has no `Upgrade`: test WebSockets with `curl --http1.1`. zsh has no `PIPESTATUS` (use `pipestatus` or avoid pipes when reading exit codes).
- Ports 8000/8001 are taken by HTTP Toolkit (KI-5): never `php artisan serve`; `composer run dev` would start it.

## Active subagent work at handoff
- None.
