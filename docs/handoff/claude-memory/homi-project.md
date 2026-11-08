---
name: homi-project
description: "HOMI (homi.uz) setup state and the two-track split — this developer owns the development track (HANDOFF.md plan T0–T11), the first developer owns staging/production; mandate docs/ai/master-prompt.md v3.1; repo memory in .ai/memory"
metadata:
  type: project
---

HOMI aggregates housing listings from Telegram channels and web sources in Uzbekistan (Laravel 13 API + Horizon on Redis, PostgreSQL 18, three Next.js 16 apps in a pnpm workspace). The setup follows the mandate `docs/ai/master-prompt.md` v3.1 (phases 0–7, a §26 report per phase). As of 2026-11-09: Phases 0–2 done; Phase 3 paused WIP (media module, API envelope, request ids, queues, intake/Telegram schema done — webhook pipeline, intake API, OpenAPI export and Phase 3 docs open); Phase 4 (AI tooling) partly applied.

Since 2026-11-09 the work is split. **This developer = development track**: application code, tests, migrations, API docs, local tooling, following `HANDOFF.md` §4 (T0 setup → T1 Telegram webhook → T2 intake → T3 OpenAPI → T4 close Phase 3 → …). **The first developer = production track**: staging/production servers, deploy, DNS/TLS, MinIO, server `.env`, staging/production bots — never part of this track, and its credentials are never handed over.

**Why:** two people (each with agents) work in parallel; the split and the rules in `docs/handoff/parallel-work.md` keep them from overwriting each other.

**How to apply:** At session start rely on the SessionStart hook context (it injects `.ai/memory/session-handoff.md`, high-severity known issues and the next `AM-`/`KI-` numbers) and check `HANDOFF.md` §4 for the next task. Ask the first developer before dependency changes, new tools, anything on staging/production, or any item marked **gate**. `session-handoff.md` belongs to this track — run the `save-session` skill at the end of a session. Numbers collide with the other track sometimes: after rebasing, renumber your new `AM-`/`KI-`/ADR numbers if they were taken. Related: [[homi-team-conventions]].
