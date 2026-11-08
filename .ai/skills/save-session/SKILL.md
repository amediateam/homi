---
name: save-session
description: Use when a HOMI work session is ending, the context is about to be compacted, a phase or a batch of work is finished, or the developer says "сохрани сессию", "save the session", "handoff" — before writing the last message of the session.
---

# Save session

A saved session is **three memory files brought up to date plus the phase document extended** — nothing
else is created. Canon (decisions, reports, docs) lives in `docs/`; `.ai/memory/` holds state and
pointers so the next agent, with no memory of this one, continues in minutes. Facts only: every claim
names the command that proved it, or says `unverified`.

## Steps, in order

1. **Evidence first.** Run `git status --short` and `git log -1 --oneline`; the diff *is* what happened.
   Remove leftovers the session created (probe files, `.worktrees/*` you added, scratch output) or list
   them explicitly.
2. **Rewrite `.ai/memory/session-handoff.md`** as a whole (≤ 60 lines) with exactly these sections:
   frontmatter `updated: <date> (<one-line context>)`; `## Developer's standing instruction` (verbatim
   quotes, Russian kept as written); `## State at handoff` (branch, commits, PRs, what is WIP);
   `## Done this session` (each item: what + how it was verified, e.g. "`make ai-hooks-test` → OK 46
   tests"); `## Waiting for the developer (do NOT start on your own)` (numbered); `## Gotchas learned this
   session`; `## Active subagent work at handoff`. Nothing after the last section — the verification
   command belongs in *State at handoff*. Facts another agent reported and you did not re-run are marked
   "(reported, not re-run)".
3. **Update `.ai/memory/current-state.md`** — facts only, header date, only the lines that changed. Nothing
   that does not exist yet is listed as present; planned items go to the handoff, not here.
4. **`.ai/memory/known-issues.md`:** add `KI-<next>` only for an **open** problem that has a workaround.
   Something that was wrong and is now fixed changes the existing row's status to `resolved` — or, if it
   was a wrong assumption, becomes `AM-<next>` in the phase document (step 5), never a KI. Next numbers
   come from the SessionStart context ("Next numbers: AM-…, KI-…") or
   `grep -oh 'KI-[0-9]*' .ai/memory/known-issues.md | sort -t- -k2 -n | tail -1`.
5. **Phase document.** Phase complete → write the §26 report `docs/ai/reports/phase-<N>.md` (master
   prompt). Phase still open → extend the existing plan/notes file: its status block (applied / not
   applied), the AM list, developer decisions with their dates.
6. **Decisions.** A decision **the developer** made this session is recorded in the phase document; it
   becomes an ADR only when it changes architecture, stack or process (master prompt §ADR rules) — then
   draft it and say so. A choice **you** made (a library, a script language, a file layout) is one line in
   the phase document's "applied" text and a comment in the code; it is never an ADR of its own.
7. **Canon stays canon.** `CLAUDE.md`, `README.md`, `docs/development/*`, ADR index, `.claude/settings.json`
   are edited during save-session only when this session changed what they describe. Anything else
   stale goes into the final message as a proposal, not an edit.
8. **Claude's user-level memory** (`~/.claude/projects/<project>/memory/*.md`) is updated by the main
   session only — last AM/KI numbers, phase state, new standing instructions. Subagents never touch it.
9. **Commit only when the developer or the mandate asks for it** (HOMI: every finished phase or approved
   batch is committed; a subagent never commits). Finish with a message to the developer in their language: files touched
   (one line each), what waits for them, and the one command that verifies the state (`make dev-check`,
   `make ai-hooks-test`, …).

## Where does it go?

| Thing | Destination |
|---|---|
| Next steps, blockers, "do not start without the developer" | `session-handoff.md` → *Waiting for the developer* |
| How the system is right now | `current-state.md` |
| Open problem + workaround | `known-issues.md` as `KI-<next>` |
| Wrong assumption, now corrected | phase document as `AM-<next>` |
| Developer's decision | phase document; ADR only if architecture/stack/process |
| Your own tooling choice | phase document "applied" line + code comment |
| Gotcha future agents will hit | handoff *Gotchas*; promote to a KI if it stays open |
| A fact you did not verify | written with `unverified`, or not written |

## Common mistakes

- Creating an ADR, a new rule in `CLAUDE.md` or a new doc that nobody asked for "while we are at it".
- A `KI-` row for a gap that is already closed, or an `AM-` for a developer decision (decisions are not
  mismatches).
- Copying a fact list into memory as if it were verified; narrative ("first I tried…") in memory files.
- A handoff longer than 60 lines, or one that lists what *should* exist as if it existed.
