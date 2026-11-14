# WP-01 — ADRs and shared-file updates

| Field | Value |
| ----- | ----- |
| Stage | 0 |
| Status | TODO |
| Depends on | — |
| Size | about 600 changed lines in eight small PRs, S |
| Behaviour reference | `24` §7, §8.1, §9; `25` §3, §4; `decisions/2026-11-14-developer-answers.md`; `docs/handoff/parallel-work.md` §1, §2, §4; `HANDOFF.md` §4; known issue KI-26 in `.ai/memory/known-issues.md`; `.ai/hooks/README.md` |
| Needs from the production track | The first developer reviews and approves every PR of this package (shared files and ADRs, `docs/handoff/parallel-work.md` §1) and says yes or no to two rules: the Wave 1 PR size and the deploy of every merge to staging and production (DEC-45). No server-side action |

## Goal

The decisions of 2026-11-14 exist as four accepted ADRs, the repository rules that they change are changed where the
rules live, and the guard hook protects the legacy tree. After this package nobody has to read the answer round to know
the rules of Wave 1.

## Scope

In: ADR-0016 … ADR-0019; `docs/handoff/parallel-work.md` §2; `HANDOFF.md` §4; a pointer in `CLAUDE.md` and
`AGENTS.md`; the guard key for the legacy tree with its test and the KI-26 row.

Out: any application code; the frontend dependency install (WP-03); edits to `docs/migration/*` (owned by PR #25 and
by WP-02); ADR-0014, which stays reserved for the Phase 3 close (`HANDOFF.md` T4).

This package is the one exception to "one package, one PR": shared files and ADRs go in small separate PRs
(`docs/handoff/parallel-work.md` §1, `24` §9). Do them in the order of "Steps"; each merges on its own.

## Decisions that bind this package

- Three waves and the new product (DEC-31, DEC-40): ADR-0016 records them.
- One API layer with a driver per method (DEC-35, DEC-41, DEC-42, DEC-33): ADR-0017.
- Mini App architecture (DEC-44): ADR-0018, which amends ADR-0013 and ADR-0003.
- UI stack and localisation (DEC-44, DEC-49): ADR-0019, which amends one line of ADR-0006.
- Process (DEC-45): the PR size rule and the queue are written into `docs/handoff/parallel-work.md`.
- ADR rules (`docs/architecture/decisions/README.md`): one file per decision, template `0000-adr-template.md`, under
  about 80 lines, never edited after acceptance except `Status`. An amended ADR gets "amended by NNNN" in the index
  row only.

## Design

### The four ADRs

Each ADR starts as `Status: Proposed`, names "developer (answer round of 2026-11-14); first developer (review of this
PR)" as deciders and `docs/migration/24-three-wave-strategy.md` as source, and becomes `Accepted` in the same PR once
the first developer approves. Each PR also adds its row to `docs/architecture/decisions/README.md`.

| File | Title | Must state |
| ---- | ----- | ---------- |
| `0016-new-product-three-waves.md` | HOMI ships a new product; the migration runs in three waves | Context: the plan of 2026-11-09 moved the legacy bot, hosts and users onto HOMI. Decision: a new permanent product under HOMI's bot and brand; legacy keeps running; no user data is moved; Wave 1 new product on legacy listings, Wave 2 own listings method by method, Wave 3 full switch (table of `24` §2). Consequences: the compatibility surface, the cut-over and the data migration are not built (`24` §7); functional parity is the acceptance criterion (DEC-46); every merge is deployed to staging and production (DEC-45); personal data of HOMI's own users exists from the first deploy (Q-SEC-021 stays open). Alternatives: take over the legacy bot and hosts (the earlier plan); port the legacy client file by file |
| `0017-api-v1-source-drivers.md` | `/api/v1` is the only contract; a source driver per method selected by a Pennant feature | Decision: the frontend and the bot's Mini App see only `/api/v1` in the ADR-0007 envelope; each shared-data capability sits behind an interface with `stub`, `legacy` and `native` drivers; one Pennant feature per method names the driver; defaults per environment live in `config/sources.php`; every answer carries `meta.source`; only HOMI's servers call legacy, with a service key (DEC-33). Amends ADR-0007: listings are addressed by their public number (an exception to "opaque ids"), feed-like lists use a cursor, `code` is present on every error. Consequences: a translating layer for about a dozen methods (the cost CF-001 named); contract tests per driver; the folder `backend/app/Services/Sources/`. Alternatives: a proxy in nginx or in Next.js; the legacy contract on HOMI hosts (CF-001, CF-002) |
| `0018-mini-app-architecture.md` | Mini App: App Router with a route per screen, server rendering through a session cookie with a header fallback | Decision: the items of `25` §3.1–§3.5 and §3.10 in rule form: Server Components fetch with the session; `POST /bff/session` exchanges `initData` for a token; cookie `homi_session` is `HttpOnly`, `Secure`, `SameSite=None`, `Partitioned`; header mode keeps the token in memory only; nothing per-user is cached; browser floor is the Next.js default with an update screen. Amends ADR-0003: the Mini App token lives in an `HttpOnly` cookie set by the app's own server, never in `localStorage` (SEC-REQ-007). Amends ADR-0013: `frontend/app` is not an SEO surface, its vhost must allow framing by Telegram Web (Q-SEC-012), and its pages are dynamic. Consequences: two session modes to test (RK-30); a nonce-based CSP in `proxy.ts` (SEC-REQ-031). Alternatives: a client-only SPA with bearer tokens (ADR-0003 as written); a static export |
| `0019-frontend-ui-stack.md` | Frontend UI stack: Tailwind 4 tokens, shadcn/ui with Radix, next-intl | Decision: tokens in `@homi/ui`; shadcn/ui components restyled to the legacy look; `lucide-react`; next-intl with the locale as the first path segment (`ru`, `uz`, `en`); catalogues in the new workspace package `@homi/i18n` with the legacy key names; both map engines. Amends ADR-0006: UI catalogues live in `@homi/i18n`, not in `frontend/packages/config`. Consequences: the dependency batch of `25` §10 (DEC-49), installed by WP-03; no copy of legacy CSS (DEC-32). Alternatives: copied legacy CSS; a hand-written component set; locale in a cookie |

Version-specific statements in ADR-0018 and ADR-0019 (for example how next-intl plugs into `proxy.ts`) are written as
"to be verified in the installed documentation by WP-20", not as facts.

### Shared files

**`docs/handoff/parallel-work.md` §2.** Keep the bullet "PRs stay small (one task, roughly ≤ 400 changed lines …)"
and add directly under it:

> Wave 1 of the migration (`docs/migration/wave-1/README.md`, DEC-45) is the exception: one PR per work package,
> about 1 500–3 000 changed lines without generated files, branch `feat/wp-<number>-<slug>`, reviewed by the other
> developer before merge. The two developers work one queue in relay, so a package branch is a shared branch: merge
> `main` into it, never force-push. Shared files still travel in small separate PRs.

Add to §8: "A Wave 1 package lists what it needs from the production track in its specification; copy that list into
the PR description." The deploy cadence itself is described in `docs/infrastructure/deployment.md`, which the
production track owns: ask for the sentence "every merge to `main` is deployed to staging and production" in the PR
description instead of editing that file.

**`HANDOFF.md` §4.** Add one paragraph above the task table and a note per row; do not renumber or delete tasks:

> Since 2026-11-14 the order of work is the Wave 1 queue in `docs/migration/wave-1/README.md`
> (`docs/migration/24-three-wave-strategy.md` §7). T3 and T5 are done by WP-10; T6 by WP-40; T8 by WP-03 and
> WP-20 … WP-33; T1 by WP-50. T2 (intake) is Wave 2. T7 is replaced by the native modules of Wave 1 and by Wave 2.
> T0, T4, T9, T10 and T11 are unchanged.

**`CLAUDE.md` and `AGENTS.md`.** In "Mandate and session start" of `CLAUDE.md` add one bullet, and restate it in the
hard-rules list of `AGENTS.md`:

> The kvadro² → HOMI migration is planned in `docs/migration/` (conventions in its `README.md`). Wave 1 is worked
> from the single queue `docs/migration/wave-1/README.md`: take the first package that is not `DONE` and read its
> specification. The legacy checkout (`KVADRO_ROOT` in `.ai/local.env`) is read-only: no edits, no builds, no `npm`,
> no dev server there, and no copy of its code.

Also add `kvadro.uz` to the list of folder names in the "Agent guard rails" paragraph of `CLAUDE.md`.

**Guard key (KI-26).**

- `.ai/hooks/guard_paths.py`: add `"KVADRO_ROOT"` to `REFERENCE_KEYS` and `"kvadro.uz"` to `FALLBACK_MARKERS`; update
  the module docstring.
- `.ai/local.env.example`: under the reference block add `KVADRO_ROOT=/path/to/Server/kvadro.uz` with the comment
  "Legacy kvadro² checkout (SVN working copy): read-only; builds and dev servers there reach production".
- `.ai/hooks/tests/test_guard_paths.py`: new cases — an `Edit` under the legacy root is denied; `npm run build`,
  `pnpm install`, `npx vite` and `svn commit` with that root as working directory are denied; `Read`, `rg` and
  `svn info` are allowed; the folder-name fallback works without `.ai/local.env`; reading a `.env` file there is
  denied.
- `.ai/hooks/README.md`: name the new key. `.ai/memory/known-issues.md`: KI-26 → resolved.

## Files

- `docs/architecture/decisions/0016-new-product-three-waves.md`, `0017-api-v1-source-drivers.md`,
  `0018-mini-app-architecture.md`, `0019-frontend-ui-stack.md` (new); `docs/architecture/decisions/README.md` (rows;
  "amended by" notes on 0003, 0006, 0007, 0013)
- `docs/handoff/parallel-work.md`, `HANDOFF.md`, `CLAUDE.md`, `AGENTS.md`
- `.ai/hooks/guard_paths.py`, `.ai/hooks/tests/test_guard_paths.py`, `.ai/hooks/README.md`, `.ai/local.env.example`,
  `.ai/memory/known-issues.md`

## Steps

Each step is one branch and one PR against `main`.

1. `chore/guard-kvadro-root` — the guard key, its tests and the KI-26 row. Run `make ai-hooks-test`; the `tooling`
   workflow runs the same tests. Do this first: WP-02 reads the legacy tree.
2. `docs/adr-0016-new-product-three-waves` — check that 0016 is still the next free number
   (`ls docs/architecture/decisions`); if the production track took it, renumber all four and say so in the PR.
3. `docs/adr-0017-api-v1-source-drivers`.
4. `docs/adr-0018-mini-app-architecture`.
5. `docs/adr-0019-frontend-ui-stack`.
6. `docs/parallel-work-wave-1-pr-size`.
7. `docs/handoff-wave-1-pointer` — `HANDOFF.md` §4.
8. `docs/claude-md-migration-pointer` — `CLAUDE.md` and `AGENTS.md`.

After the last merge, update the ADR references in `.ai/memory/current-state.md` (development sections only) and run
the `save-session` skill.

## Behaviour to reproduce

None; this package records decisions. Two checks keep the ADRs honest:

- Every sentence of an ADR's "Decision" section is traceable to a `DEC` row of `24` §8.1 or to a section of `25`.
  Anything else is a new decision and does not belong in these four files.
- Nothing in the ADRs contradicts an answer in `decisions/2026-11-14-developer-answers.md`.

## Tests

- `make ai-hooks-test` green with the new cases (step 1).
- A manual probe in a Claude Code session after step 1: an `Edit` on a file under `$KVADRO_ROOT` is refused with the
  read-only reason; a `Read` succeeds.
- Markdown only for steps 2–8: links resolve (`rg -n "\]\(" <file>` and open each target), the index table has one
  row per ADR file.

## Acceptance checklist

- [ ] The guard denies writes and project tooling under the legacy root, by key and by folder name; KI-26 is resolved.
- [ ] Four ADRs are merged with `Status: Accepted`, each under about 80 lines, each with an index row.
- [ ] The index rows of ADR-0003, 0006, 0007 and 0013 say which new ADR amends them; the old files are unchanged.
- [ ] `docs/handoff/parallel-work.md` §2 states the Wave 1 PR rule and the relay rule for shared branches.
- [ ] `HANDOFF.md` §4 maps T1, T3, T5, T6 and T8 onto work packages and says T2 is Wave 2.
- [ ] `CLAUDE.md` and `AGENTS.md` point at `docs/migration/` and at the queue, and name the legacy tree as read-only.
- [ ] The first developer approved every PR; his answers on PR size and deploy cadence are quoted in
      `.ai/memory/session-handoff.md`.

## Handoff

Empty.
