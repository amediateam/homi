# ADR-0005: Redis for queue and cache, Horizon as the worker

- Status: Accepted
- Date: 2026-11-08
- Deciders: developer (Phase 0 checkpoint D5)
- Source: `docs/ai/reports/phase-0.md` §2–3, §14; master prompt §6.5

## Context

The master prompt lists Redis as "not in the declared stack" and defaults to the `database` driver. In reality: Redis runs locally as a Homebrew service, `laravel/horizon` is already installed and registers itself in `php artisan dev` (replacing `queue:listen`), Horizon only consumes Redis queues, and `app.uz` runs Redis queues with Horizon in production. With `QUEUE_CONNECTION=database` the local queue was silently never processed. HOMI's workload has queue-heavy parts: inbound listing pushes (ADR-0009), image variants, radar notifications, bot updates.

## Decision

- `QUEUE_CONNECTION=redis`, `CACHE_STORE=redis`; Horizon is the queue worker and dashboard in every environment.
- `SESSION_DRIVER=database` (sessions are only used by Horizon/Telescope/Pulse dashboards; the API is token-based, ADR-0003).
- Horizon supervisors are defined per workload (`default`, `media`, `notifications`, `ingest`) in `config/horizon.php`; queue names are stable and documented when introduced.
- Redis is a required service in local (`brew services`), staging and production; `dev:check` verifies connectivity.
- Redis is not used as a primary data store; anything that must survive a Redis flush lives in PostgreSQL.

## Consequences

- Staging and production hosts need a Redis instance (same box as the app or a managed one; ADR-0011).
- `.env.example` gains `REDIS_*` and Horizon keys; the `database` queue tables stay (harmless fallback).
- Tests keep `QUEUE_CONNECTION=sync` and `CACHE_STORE=array` (phpunit.xml).

## Alternatives considered

- `database` for everything and remove Horizon — rejected: loses the installed worker/dashboard and burdens PostgreSQL with queue polling during notification bursts.
- Redis for queue only — rejected: cache on Redis is cheap once Redis is required anyway.
