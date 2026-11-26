# Prompt for the second development session

Since 2026-11-26 two development sessions work the Wave 1 queue at the same time, on two machines (DEC-109,
`docs/migration/decisions/2026-11-26-developer-answers.md`). The first keeps the queue's order: WP-41 and the rest of
stage C's backend. The second takes the package that `.ai/memory/session-handoff.md` assigns to it, which on
2026-11-26 is **WP-62** (the Mini App launched with a search filter: frontend only, no work for the production
track). This file is what the second developer does before the agent's first run and the prompt they give it. The
project's state is not repeated here: it is in `.ai/memory/session-handoff.md`.

## Before the agent's first run

1. Collaborator access to the private repository `github.com/amediateam/homi`.
2. A clone: `gh repo clone amediateam/homi homi.uz && cd homi.uz`; an existing clone: `git checkout main && git pull --ff-only`.
3. The machine is set up with the agent along `docs/handoff/setup.md`, not from memory. What is needed beforehand
   (a Mac on Apple Silicon, Homebrew, `gh`) is in `HANDOFF.md` §1.
4. Environment values are not in the repository; `HANDOFF.md` §5 says what is handed over by hand and how.

## The prompt

Paste it into Claude Code or Codex started at the repository root. It is in English like every file of the
repository; the agent talks to the developer in Russian.

```text
You continue the development of HOMI (homi.uz) on this machine. A second development session works in parallel on another machine. The context of both lives in the repository, not in your memory.

1. Read, in order: CLAUDE.md (Claude Code) or AGENTS.md (Codex), then HANDOFF.md, docs/handoff/setup.md, docs/handoff/parallel-work.md, this file (docs/handoff/second-developer-prompt.md), .ai/memory/session-handoff.md, .ai/memory/current-state.md, .ai/memory/known-issues.md and docs/migration/wave-1/README.md (rules 1–8 and the queue).

2. If the machine is not set up yet, do task T0 of HANDOFF.md: walk me through docs/handoff/setup.md from the first step not done. I run the steps with sudo or a password myself in a terminal and paste the output; you run the checks and show the command and the output of each. After the setup do NOT move on to task T1, even if setup.md says so.

3. Your package is the one .ai/memory/session-handoff.md assigns to the second development session (DEC-109); on 2026-11-26 that is WP-62. It is an exception to rule 1 of the queue ("do not skip ahead"): the other session works WP-41 and the rest of stage C's backend (WP-41 … WP-48, WP-84 … WP-86); start none of those, even where the handoff names WP-41 as next. Read the package's specification whole, and only the audit sections it cites. First git fetch, then the branch feat/wp-<number>-<slug> from origin/main (for WP-62: feat/wp-62-launch-with-filter), one PR into main. Set the package's queue row to IN_PROGRESS (<branch>) in the branch's first commit, and to REVIEW (#<PR>) when the PR is open.

4. Before the first code change, tell me which package and step you take and why, and wait for my "ок".

5. Ask me what comes after your package: the first developer chooses the next one.

Working next to the other session:
- Do not edit .ai/memory/session-handoff.md: the other session keeps it (KI-20). Write your state into the "Handoff" section of your package's specification and into the PR description; when you run save-session, skip its step 2.
- Take AM-, KI- and DEC- numbers from your own range: AM-150 and up, KI-90 and up, DEC-150 and up. The SessionStart hook shows both sessions the same "next numbers", so without a range they collide. Before a push: python3 scripts/migration/collect_ids.py --check.
- Before a push: git fetch and rebase on origin/main; look at gh pr list for what the other session has open, and leave the files of its branch alone.
- WP-62 needs none of the shared files (CLAUDE.md, HANDOFF.md, .github/workflows/**, backend/**, docs/api/openapi.json, the generated types); if one is needed after all, ask me first.

Rules:
- The "Hard rules" of AGENTS.md apply.
- Never push to main. One package = one branch = one PR.
- New dependencies and package updates (composer update, pnpm update), staging, production and shared files only with the first developer's consent. A package update is a PR of its own with make registry, never inside a queue package.
- git add by file name only: not git add backend, not git add frontend, not git add -A.
- Leave alone: the branch chore/php-8.6, the Dependabot PRs (#5, #57–#60) and the queue's packages in WAITING.
- Never read or print .env files: read a value with cd backend && php artisan config:show <key>. The legacy checkout and app.uz are read-only.
- The PR's acceptance checklist ticks only what the PR proves itself; the lines "inside Telegram" stay with the production track.
- Before a push: make ci-frontend, make bundle-check and, from frontend/, node app/scripts/e2e-coverage.mjs. A new or changed end-to-end spec: scripts/dev/e2e-local.sh app/e2e/<spec> --repeat-each 10.
- A PR is merged when its CI is green and its independent review is clean (rule 8 of the queue); gh pr merge only through the permission prompt.
- Never claim a check you did not run: show the command and its output.
- Talk to me in Russian; code, documents and commits in the repository are in English.
```

## Good to know

- **The local API on stubs since WP-40.** The signed-in methods answer from the stubs only when the local
  `backend/.env` has `SOURCES_NATIVE_STUBS=true` and `ACCESS_MODE=open` (in `backend/.env.example` since #125). An env
  file made before 2026-11-26 lacks them, and the Mini App at `https://app.homi.loc` then does not sign in. Check:
  `cd backend && php artisan config:show sources.native_stubs` and `php artisan config:show access.mode`.
  `scripts/dev/e2e-local.sh` and CI set both themselves.
- **End-to-end runs go through `scripts/dev/e2e-local.sh`, not `make e2e`** (KI-71): since WP-40 sign-in allows 10 a
  minute per address, and a run against the local API at `api.homi.loc` meets `429`.
- **A flaky end-to-end test** (KI-63): when one CI attempt fails and the spec passes 10 of 10 locally
  (`--repeat-each 10`), re-run the job instead of changing the test.
- **PHP.** `main` is pinned to PHP 8.5 while Homebrew installs 8.6; the branch `chore/php-8.6` is pushed without a PR
  and unchecked, and the first developer decides it (KI-70).
- **The owner cabinet locally.** `OWNER_CABINET_ENABLED` is empty in `backend/.env.example`; set it to `true` in the
  local `backend/.env` to see the cabinet. The end-to-end runner and CI set it themselves.
- **Playwright.** Once per machine, from `frontend/`: `pnpm exec playwright install chromium`.
