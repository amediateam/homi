# Monitoring and alerts (staging and production)

Purpose: what watches HOMI, where the alerts go, and how to check or change it. The production track owns this file; the development track reads it (`docs/handoff/parallel-work.md` §1). HOMI has no monitoring stack of its own. It adds jobs, rule files and one route to two existing stacks that other projects run on the same servers. Every change there is additive, backed up first, validated with `promtool` / `amtool`, and approved by the first developer. History and evidence: `docs/ai/reports/production-notes.md` §12.

## Overview

| Layer | Runs on | Stack | Checks | Alerts go to |
|---|---|---|---|---|
| External | MinIO host `31.220.104.38` | "mars": Prometheus 2.42, Alertmanager 0.25, plus `prometheus-blackbox-exporter` 0.23 (Debian package, added for HOMI, `127.0.0.1:9115` only) | HTTPS probes of the 10 HOMI hosts (200 expected), TLS expiry | route `project="homi"` → receiver `homi` → the elmarket ops chat |
| Internal | app host `159.253.19.121` | "elmarket-prod": Prometheus 3.14, Alertmanager 0.34, node_exporter 1.12 | systemd state of the HOMI units, age of the last successful backup | the existing severity routes → the elmarket ops chat (bot @nimaqattabot) |

All alerts go to one chat, the elmarket ops chat, by the developer's decision of 2026-11-13. External probes run from another host, so they also report the whole app host going down. The internal checks cannot do that, because their Prometheus runs on the host they watch.

## Alerts

| Alert | Where | Condition | Severity |
|---|---|---|---|
| `HomiEndpointDown` | external | a production URL is not 200 for 3 min | critical |
| `HomiStagingEndpointDown` | external | a staging URL is not 200 for 10 min | warning |
| `HomiCertExpiringSoon` / `HomiCertExpiryCritical` | external | certificate expires in < 14 days (1 h) / < 3 days (10 min). certbot renews at 30 days, so either one means renewal is failing | warning / critical |
| `HomiProbesMissing` | external | no `probe_success{project="homi"}` for 15 min (blackbox exporter or job gone) | warning |
| `HomiProductionUnitDown` | internal | `horizon-homi` or `homi-next-{landing,app,arm}` not active for 3 min | critical |
| `HomiStagingUnitDown` | internal | the staging equivalents not active for 10 min | warning |
| `HomiBackupFailed` | internal | `homi-backup.service` in the failed state for 5 min | warning |
| `HomiBackupStale` / `HomiStagingBackupStale` | internal | last successful backup older than 26 h | critical / warning |
| `HomiMonitoringMetricsMissing` | internal | the unit metrics or `homi_backup.prom` are missing for 30 min | warning |

Probed URLs:
- production: `https://homi.uz/`, `https://app.homi.uz/`, `https://arm.homi.uz/`, `https://api.homi.uz/up`, `https://hook.homi.uz/up`;
- staging: the same paths on `staging.homi.uz` and its `app.`, `arm.`, `api.` and `hook.` subdomains.

The probe module is `homi_https`: IPv4, TLS required, no redirects followed, timeout 10 s, every 60 s.

Not covered yet:
- Redis memory: there is no exporter. Host memory and disk are covered by the stacks' own `LowMemory` / `LowDiskSpace` / `Host*` alerts.
- Laravel errors and queue depth.
- The MinIO bucket `homi-backups` itself. ILM keeps it small, and the mars stack watches MinIO's disk.

## Files (reviewed copies in `infra/production/monitoring/`)

| Repository | Installed on the server |
|---|---|
| `app-host/homi.yml` | `/etc/prometheus/rules/homi.yml` (root 0644) on `159.253.19.121` |
| `app-host/node_exporter-textfile.conf` | `/etc/systemd/system/node_exporter.service.d/textfile.conf`. The drop-in is **shared**: elmarket added the textfile collector, and HOMI added the systemd collector, limited to the HOMI units. |
| — (written by `homi-backup`) | `/var/lib/prometheus/node-exporter/homi_backup.prom` → `homi_backup_last_success_timestamp_seconds{env}` |
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
