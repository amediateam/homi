# Monitoring and alerts (staging and production)

Purpose: what watches HOMI, where the alerts go, and how to check or change it. The production track owns this file; the development track reads it (`docs/handoff/parallel-work.md` §1). HOMI has no monitoring stack of its own. It adds jobs, rule files and one route to two existing stacks that other projects run on the same servers. Every change there is additive, backed up first, validated with `promtool` / `amtool`, and approved by the first developer. History and evidence: `docs/ai/reports/production-notes.md` §12 (CDN probes and MinIO-disk alerts: §14).

## Overview

| Layer | Runs on | Stack | Checks | Alerts go to |
|---|---|---|---|---|
| External | MinIO host `31.220.104.38` | "mars": Prometheus 2.42, Alertmanager 0.25, plus `prometheus-blackbox-exporter` 0.23 (Debian package, added for HOMI, `127.0.0.1:9115` only) | HTTPS probes of the 12 HOMI hosts (200 expected), TLS expiry; free disk of the MinIO host | route `project="homi"` → receiver `homi` → the elmarket ops chat |
| Internal | app host `159.253.19.121` | "elmarket-prod": Prometheus 3.14, Alertmanager 0.34, node_exporter 1.12 | systemd state of the HOMI units, age of the last successful backup; from `homi-metrics` (every minute): shared Redis (up, memory, evictions, RDB), queue lengths, Horizon running/paused, failed jobs, Laravel log errors | the existing severity routes → the elmarket ops chat (bot @nimaqattabot) |

All alerts go to one chat, the elmarket ops chat, by the developer's decision of 2026-11-13. External probes run from another host, so they also report the whole app host going down. The internal checks cannot do that, because their Prometheus runs on the host they watch.

## Alerts

| Alert | Where | Condition | Severity |
|---|---|---|---|
| `HomiEndpointDown` | external | a production URL is not 200 for 3 min | critical |
| `HomiStagingEndpointDown` | external | a staging URL is not 200 for 10 min | warning |
| `HomiCertExpiringSoon` / `HomiCertExpiryCritical` | external | certificate expires in < 14 days (1 h) / < 3 days (10 min). certbot renews at 30 days, so either one means renewal is failing | warning / critical |
| `HomiProbesMissing` | external | no `probe_success{project="homi"}` for 15 min (blackbox exporter or job gone) | warning |
| `HomiMinioDiskLow` / `HomiMinioDiskCritical` | external | `/` of the MinIO host (MinIO data; the media buckets have no quotas) has < 15 % free for 15 min / < 5 % for 5 min | warning / critical |
| `HomiProductionUnitDown` | internal | `horizon-homi` or `homi-next-{landing,app,arm}` not active for 3 min | critical |
| `HomiStagingUnitDown` | internal | the staging equivalents not active for 10 min | warning |
| `HomiBackupFailed` | internal | `homi-backup.service` in the failed state for 5 min | warning |
| `HomiBackupStale` / `HomiStagingBackupStale` | internal | last successful backup older than 26 h | critical / warning |
| `HomiMonitoringMetricsMissing` | internal | the unit metrics or `homi_backup.prom` are missing for 30 min | warning |
| `HomiRedisDown` | internal | the shared Redis does not answer `PING` for 2 min | critical |
| `HomiRedisMemoryHigh` / `HomiRedisMemoryCritical` | internal | the instance's `used_memory` > 2 GiB for 15 min / > 8 GiB for 5 min (all projects together; nothing caps or evicts it) | warning / critical |
| `HomiRedisEvicting` | internal | any `evicted_keys` in 15 min (the policy was `noeviction`; eviction can drop queued jobs) | critical |
| `HomiRedisSnapshotFailing` | internal | the last RDB snapshot failed, for 10 min (RDB is the only persistence) | warning |
| `HomiHorizonNotRunning` / `HomiStagingHorizonNotRunning` | internal | no live Horizon master, or a paused one (the `horizon:status` logic), for 5 / 15 min | critical / warning |
| `HomiQueueBacklog` / `HomiQueueBacklogCritical` | internal | > 100 / > 1000 ready jobs on one production queue for 10 min | warning / critical |
| `HomiJobsFailing` | internal | Horizon's failed-job set grew in 15 min (production) | warning |
| `HomiLaravelErrors` | internal | ≥ 1 production log entry at ERROR or above in the last 15 min | warning |
| `HomiMetricsStale` | internal | `homi.prom` not rewritten for 5 min, or missing | warning |

The thresholds above are starting values, set when Redis held 4.8 MB and every queue was empty. Change them in `app-host/homi.yml` and here. Staging's queue and log values are exported but raise no alert.

Probed URLs:
- production: `https://homi.uz/`, `https://app.homi.uz/`, `https://arm.homi.uz/`, `https://api.homi.uz/up`, `https://hook.homi.uz/up`, `https://cdn.homi.uz/_probe/ok.txt`;
- staging: the same paths on `staging.homi.uz` and its `app.`, `arm.`, `api.`, `hook.` and `cdn.` subdomains.

The CDN probe fetches `_probe/ok.txt` from the public bucket. The vhost never caches that path, so a 200 means nginx and MinIO on `31.220.104.38` both answer (`docs/infrastructure/cdn.md`).

The probe module is `homi_https`: IPv4, TLS required, no redirects followed, timeout 10 s, every 60 s.

How `homi-metrics` measures. It is read-only, needs no new package and never reads `.env`.
- **Redis:** one `INFO` on the instance gives `used_memory`, `maxmemory`, `evicted_keys`, `rdb_last_bgsave_status` and the key counts of DB 3–6.
- **Queues:** `LLEN <prefix>queues:<q>` (ready), plus `ZCARD` of `:delayed` and `:reserved`, for `default`, `notifications`, `telegram`, `media` and `ingest`. The prefix is `homi-production-` (DB 3) or `homi-staging-` (DB 5).
- **Failed jobs:** `ZCARD homi_horizon:failed_jobs`. This is Horizon's 7-day set; the `failed_jobs` table holds the same failures.
- **Horizon status:** live masters are the entries in `homi_horizon:masters` from the last 14 s, and `HGET …:master:<name> status`.
- **Laravel errors:** lines that match `[YYYY-MM-DD HH:MM:SS] <env>.(ERROR|CRITICAL|ALERT|EMERGENCY):` in the last 15 min (UTC, the app timezone) in yesterday's and today's `laravel-<date>.log`, reading at most the last 20 MB of each.
- **Constants:** the Redis DB numbers and prefixes are constants in the script and must match each `backend/.env` (`environments.md`).

Not covered yet:
- The size of single MinIO buckets (`homi-backups`, the media buckets). ILM keeps backups and tmp small, and `HomiMinioDisk*` watch the disk they share.
- HTTP 5xx rates from the nginx logs, and job wait times. Horizon's own metrics need `horizon:snapshot` on a scheduler, and no scheduler runs yet.

## Files (reviewed copies in `infra/production/monitoring/`)

| Repository | Installed on the server |
|---|---|
| `app-host/homi.yml` | `/etc/prometheus/rules/homi.yml` (root 0644) on `159.253.19.121` |
| `app-host/node_exporter-textfile.conf` | `/etc/systemd/system/node_exporter.service.d/textfile.conf`. The drop-in is **shared**: elmarket added the textfile collector, and HOMI added the systemd collector, limited to the HOMI units. |
| — (written by `homi-backup`) | `/var/lib/prometheus/node-exporter/homi_backup.prom` → `homi_backup_last_success_timestamp_seconds{env}` |
| `../bin/homi-metrics`, `../systemd/homi-metrics.{service,timer}` | `/usr/local/sbin/homi-metrics`, `/etc/systemd/system/homi-metrics.{service,timer}` (every minute) → `/var/lib/prometheus/node-exporter/homi.prom`. The `homi-deploy` drift check compares all three. |
| `minio-host/homi.rules.yml` | `/etc/prometheus/rules/homi.rules.yml` (root 0644) on `31.220.104.38` |
| `minio-host/prometheus-homi-blackbox.yml` | appended to `scrape_configs` in `/etc/prometheus/prometheus.yml` |
| `minio-host/blackbox-homi-module.yml` | appended to `modules:` in `/etc/prometheus/blackbox.yml`; `ARGS` in `/etc/default/prometheus-blackbox-exporter` adds `--web.listen-address=127.0.0.1:9115` |
| `minio-host/alertmanager-homi.yml` (placeholders) | the first child route and the `homi` receiver in `/etc/alertmanager/alertmanager.yml` (0640 root:prometheus). Alertmanager 0.25 has no `bot_token_file` for Telegram, so the token is inline, like the stack's own receiver. |

The `homi-deploy` drift check does not compare these files. Re-check them by hand after any change.

## Check

App host:

```bash
curl -s localhost:9090/api/v1/rules | python3 -c 'import json,sys; [print(r["name"], r["health"], r["state"]) for g in json.load(sys.stdin)["data"]["groups"] if g["name"].startswith("homi") for r in g["rules"]]'
curl -s localhost:9100/metrics | grep -E '^(node_systemd_unit_state\{name="horizon-homi.service",state="active"|homi_backup_)'
```

MinIO host (the Prometheus API is under `/prom`, Alertmanager under `/am`):

```bash
curl -s 'http://127.0.0.1:9090/prom/api/v1/query' --data-urlencode 'query=probe_success{project="homi"}'
curl -s 'http://127.0.0.1:9115/probe?module=homi_https&target=https://homi.uz/' | grep -E '^probe_(success|http_status_code) '
amtool config routes test --config.file=/etc/alertmanager/alertmanager.yml project=homi severity=critical   # → homi
```

## Change

1. Edit the reviewed copy here and open a PR.
2. On the server, back up the file to `/root/.homi-backups/<date>/`.
3. Validate:
   - `promtool check rules <file>` and `promtool check config /etc/prometheus/prometheus.yml`;
   - `amtool check-config /etc/alertmanager/alertmanager.yml`;
   - `prometheus-blackbox-exporter --config.check --config.file=/etc/prometheus/blackbox.yml`.
4. Reload:
   - Prometheus: `systemctl reload prometheus` on both hosts;
   - Alertmanager: `systemctl reload prometheus-alertmanager` on the MinIO host, `alertmanager` on the app host;
   - node_exporter changes need `systemctl daemon-reload && systemctl restart node_exporter`. elmarket's `ServiceDown` waits 3 min, so a restart does not fire it.
5. Confirm:
   - `reloadConfigSuccess: true` from `/api/v1/status/runtimeinfo`;
   - `alertmanager_config_last_reload_successful 1`.

To silence HOMI during planned work, run on the MinIO host: `amtool silence add --alertmanager.url=http://127.0.0.1:9093/am project=homi --duration=1h --comment="…"`. On the app host the HOMI alerts carry `project="homi"` too, and its Alertmanager has no path prefix: `--alertmanager.url=http://127.0.0.1:9093`.

## Rollback

Each changed file has a backup in `/root/.homi-backups/20261113/` on its host.
1. Restore the file.
2. Validate and reload as above.
3. Remove `/etc/prometheus/rules/homi*.yml`.
4. `apt-get remove prometheus-blackbox-exporter` on the MinIO host. The developer's go is needed, because other projects share the host.
