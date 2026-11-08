# ADR-0002: Backend — Inertia/React starter stack kept but frozen

- Status: Accepted
- Date: 2026-11-08
- Deciders: developer (Phase 0 checkpoint D3)
- Source: `docs/ai/reports/phase-0.md` §3, §14

## Context

`backend/` was generated from `laravel/blank-react-starter-kit`: Inertia v3, React 19, TypeScript 7, Tailwind 4, Vite+ (`vp`), Wayfinder, React Compiler, one `welcome` page. HOMI's user interfaces are three Next.js applications (ADR-0001); the Laravel application is consumed as an HTTP API. Removing the starter UI would change Composer and npm dependencies (REVIEW-level change) and the CI pipeline; the developer chose not to do that now.

## Decision

Keep the starter UI toolchain installed and **frozen**: nothing new is built in `backend/resources/js`, `backend/resources/css` or with `Route::inertia()`. The backend is developed as an API (`routes/api.php`, ADR-0007). The frozen parts stay buildable so `composer ci:check` (which runs `npm run check`, `tsc`, build) keeps passing.

Rules for agents:

- Do not add Inertia pages, React components or Wayfinder-dependent code in `backend/`.
- Do not remove the stack either; a later ADR may do so once the Next.js apps are live.
- Laravel Boost skills `inertia-react-development`, `wayfinder-development`, `tailwindcss-development` are irrelevant for HOMI work; do not load them for backend tasks.
- `php artisan dev` still starts Vite for the frozen UI; this is harmless.

## Consequences

- `/` keeps serving the starter welcome page until a health/landing redirect replaces it (Phase 2 may point `/` at the API status page or 404).
- `backend/package.json` stays on npm; the pnpm workspace (ADR-0004) covers `frontend/` only.
- Dead-weight dependencies remain in `composer.lock`; the package registry marks them `FROZEN`.

## Alternatives considered

- Remove the UI stack now (API-only) — rejected by the developer for now (dependency churn before the first feature).
- Use the Inertia app as the ARM admin — rejected: the mandate makes `frontend/arm` a Next.js app and a second UI stack doubles tooling.
