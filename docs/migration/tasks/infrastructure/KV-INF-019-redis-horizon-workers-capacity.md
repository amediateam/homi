# KV-INF-019 — Redis per environment, Horizon under systemd, capacity

| Field | Value |
| ----- | ----- |
| Status | TODO (needs DEC-27, DEC-28) |
| Owner | DevOps (track: production — first developer approves) |
| Complexity | M |
| Feature IDs | F-DELIVERY-002, F-BOT-012 |
| Dependencies | KV-INF-006 (supervisors in `config/horizon.php`), KV-INF-015 (staging and production directories and users); DEC-27 (Redis layout), DEC-28 (capacity of the web host); ADR-0005, ADR-0011, ADR-0013 |

> **Reconciliation with PR #8 (2026-11-09).** DEC-27 was answered by the production track: DB indexes on the host's
> shared Redis instance (production `REDIS_DB` 3 / cache 4, staging 5 / 6, distinct `REDIS_PREFIX`;
> `docs/infrastructure/environments.md`). Steps 1–2 change accordingly: ask the production track for the instance's
> `maxmemory-policy`, because an evicting policy can drop queue keys. Horizon already runs as `horizon-homi.service` and
> `horizon-homi-staging.service` (`www-data`, `TimeoutStopSec=60`) in `infra/{production,staging}/systemd/`, not in
> `infra/server/systemd/`. Raise `TimeoutStopSec` above the longest job timeout when the supervisors of `17` §6 land.
> What remains: those supervisors and the capacity measurement for DEC-28.

## Goal

Staging and production each have their own Redis (queues, cache, locks, bot conversation state, limiter counters) and
run Horizon with every supervisor of `17` §6 under the host's process manager; the web host's memory and CPU are
measured on staging with the new supervisors and the three Next processes per environment, and DEC-28 is answered with
numbers before S2. Serves stage **S1** (`18` §2) and `17` §15 item 6.

## Legacy reference

- Legacy queues and workers are unknown (backend unavailable); load estimates: ~1 050 new listings a day (`01` §1),
  radar fan-out and digest volume unknown (`$KVADRO_ROOT/docs/about.md` §11 item 17, Q-BOT-034).
- HOMI: supervisors and queues in `backend/config/horizon.php:205-282`, proposals in `10` §4.10 and `17` §6
  (`supervisor-delivery`, `-radar`, `-llm`, `-collect` new); Redis rules `17` §6 and ADR-0005 (nothing that must survive a
  flush); the S1 exit asks for a digest fan-out of all migrated radars within 10 minutes (`18` §5.1 "Performance").

## Implementation

1. DEC-27: propose separate Redis instances per environment (recommended in `10` §8) with `maxmemory` and
   `maxmemory-policy noeviction` for the queue instance (evicting queue keys loses jobs); record the decision in
   `docs/infrastructure/deployment.md`. Any new server package or unit — **needs first developer approval**.
2. Set `REDIS_*` per environment in the server `.env`; confirm `QUEUE_CONNECTION=redis`, `CACHE_STORE=redis`
   (ADR-0005) and that staging and production never point at the same instance or DB index.
3. systemd units `homi-<env>-horizon.service` (user = the environment's app user, `Restart=always`, `KillSignal=SIGTERM`,
   `TimeoutStopSec` above the longest job timeout of `config/horizon.php`) in `infra/server/systemd/`; the deploy runs
   `php artisan horizon:terminate` after the switch (KV-INF-023).
4. Process counts: start from `17` §6 (production / staging columns); the global Telegram send rate is set by
   `TELEGRAM_SEND_RATE_GLOBAL` (KV-TG-050), not by the number of `notifications` workers.
5. Capacity measurement on staging during R1/R2 (KV-INF-028): RSS of php-fpm pools, Horizon workers per supervisor,
   six Next processes, nginx; Redis memory; CPU at a synthetic digest fan-out for all migrated radars (KV-QA-020). Write
   the table and the DEC-28 recommendation (same host vs a worker host).
6. Development track supplies: KV-INF-006 (supervisor blocks and `waits`), `horizon:snapshot` scheduled (KV-INF-007),
   KV-TG-060 (the pause of `supervisor-telegram` used at cut-over relies on `horizon:pause-supervisor`).

## Files

- `infra/server/systemd/homi-staging-horizon.service`, `infra/server/systemd/homi-production-horizon.service` (new)
- `infra/server/redis/` (instance configs, new) — production-owned
- `docs/infrastructure/deployment.md` § "Redis and workers", § "Capacity" (new sections)

## API contract

n/a — process and service configuration. Horizon dashboard access is KV-INF-012 / Q-SEC-019.

## Business rules

- ADR-0011: staging and production never share Redis.
- Delivery pacing rules of SEC-REQ-029 are enforced in code (KV-TG-050) regardless of worker counts.

## Acceptance criteria

- `redis-cli -n <db> INFO keyspace` on each instance shows only that environment's keys (prefix check).
- `systemctl status homi-<env>-horizon` active; `php artisan horizon:status` = running; every supervisor of
  `config/horizon.php` listed by `php artisan horizon:supervisors`.
- A deploy restarts workers without losing a queued job (job count before = processed + remaining after).
- The capacity table and the DEC-28 recommendation are written and reviewed by the first developer.

## Tests

| # | Check | Expected |
| - | ----- | -------- |
| 1 | `php artisan horizon:supervisors` on staging | `supervisor-default`, `-telegram`, `-delivery`, `-radar`, `-ingest`, `-llm`, `-media` (and `-collect` if CF-007 B/C) |
| 2 | dispatch 1 000 no-op jobs, run `horizon:terminate` mid-way | all 1 000 processed, none in `failed_jobs` |
| 3 | `systemctl kill homi-staging-horizon` | restarted by systemd within 10 s |
| 4 | synthetic digest fan-out for all migrated radars (KV-QA-020) | finishes within 10 min; host memory below 80 % |
| 5 | `redis-cli CONFIG GET maxmemory-policy` on the queue instance | `noeviction` |

## Edge cases

- Redis restart: queued jobs in memory are lost unless persistence is on; ADR-0005 accepts loss for cache but not for
  queues — enable AOF on the queue instance or accept and document re-dispatch (decision in DEC-27).
- Bot conversation state in Redis is lost on flush: users get «Форма устарела» (TXT-BOT-039) and restart — acceptable.
- Memory pressure from `media` workers (image variants) — cap `maxProcesses` before adding a worker host.

## Security

Redis bound to localhost or a private interface with a password per environment (names `REDIS_PASSWORD` only);
SEC-REQ-034 (separate secrets); Horizon dashboard reachable only per Q-SEC-019 (KV-INF-012).

## Definition of done

Units and Redis configs committed under `infra/server/`, checks recorded, DEC-27 and DEC-28 answered in `10` §8 by the
first developer, `17` §15 item 6 ticked, queue names and process counts announced to the development track.
