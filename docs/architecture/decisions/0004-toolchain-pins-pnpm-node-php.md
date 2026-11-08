# ADR-0004: Toolchain pins — pnpm workspace, Node 26, PHP 8.5

- Status: Accepted
- Date: 2026-11-08
- Deciders: developer (Phase 0 checkpoint D4, 2D)
- Source: `docs/ai/reports/phase-0.md` §2–4, §14; official Node release schedule (`nodejs/Release` `schedule.json`, fetched 2026-11-08)

## Context

Both Next.js apps and the backend used npm lockfiles with no version pins. Local Node is 26.13.0; the backend CI pinned Node 22. The official schedule shows v26 "Lithium" as Active LTS since 2026-10-28 (v24 and v22 in maintenance). pnpm 11.24 is installed; corepack is not shipped with Node 26. PHP is 8.5.12 locally and in CI, while `composer.json` still allowed `^8.3`. Both developers work on macOS with the same Homebrew stack.

## Decision

- **Frontend**: one pnpm workspace rooted at `frontend/` (`frontend/pnpm-workspace.yaml`, `frontend/package.json` with `"packageManager": "pnpm@11.24.0"` and `engines.node ">=26 <27"`); members `landing`, `app`, `arm`, `packages/*`; one `frontend/pnpm-lock.yaml`; npm lockfiles removed from the apps.
- **Node**: `.node-version` = `26` at the repository root (major pin; patch updates follow the LTS line). CI uses `node-version-file: .node-version`.
- **PHP**: `composer.json` `require.php` = `^8.5`, `config.platform.php` = `8.5.0` so dependency resolution is identical on every machine.
- **TypeScript in the Next.js apps**: `^6` (not the `^7` that `create-next-app` 16.4 writes). TypeScript 7.0 is the native (Go) port and `typescript-eslint` 8.x refuses to run with it ("does not support TS 7.0"); TS 6 is the last JS-API release and is what the lint toolchain supports. Revisit when `typescript-eslint` supports TS ≥ 7.1. Every app exposes `lint` and `typecheck` (`tsc --noEmit`) scripts, run by CI.
- **Backend JS** stays on npm (frozen stack, ADR-0002) — it is not part of the workspace.
- `dev:check` (Phase 2) compares `node -v`, `pnpm -v`, `php -v` majors against these pins.

## Consequences

- `pnpm install` from `frontend/` installs all apps; `pnpm --filter app dev` runs one app.
- Shared packages are consumed as `workspace:*` dependencies — no publishing, no copying.
- Upgrading Node major or pnpm major is an ADR-level change; patch/minor updates are routine.
- The backend CI workflow must be updated from Node 22 to the pinned file.

## Alternatives considered

- Stay on npm — rejected: the mandate requires pnpm, and shared packages need a workspace.
- pnpm without workspace — rejected: `packages/*` would have to be duplicated or published.
- Exact Node patch pin — rejected: churn for two developers with no benefit; major pin + LTS line is enough.
