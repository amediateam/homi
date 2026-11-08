#!/usr/bin/env bash
# Local S3 (MinIO) for cdn.homi.loc and the media disks (ADR-0008, docs/infrastructure/environments.md).
# One MinIO instance per machine (127.0.0.1:9500, the s3.app.loc convention) serves every project's
# buckets; HOMI only adds its own. Credentials come from .ai/local.env (MINIO_ROOT_USER/PASSWORD),
# default minioadmin/minioadmin — local only, never reuse elsewhere.
#   scripts/dev/minio.sh start    → start MinIO if nothing listens on the port (background, pid file)
#   scripts/dev/minio.sh stop     → stop the instance started by this script
#   scripts/dev/minio.sh buckets  → create homi-public (anonymous download), homi-private, homi-tmp (1-day expiry)
#   scripts/dev/minio.sh check    → health + buckets

set -e
. "$(dirname "$0")/lib.sh"

: "${MINIO_ROOT_USER:=minioadmin}"
: "${MINIO_ROOT_PASSWORD:=minioadmin}"
export MINIO_ROOT_USER MINIO_ROOT_PASSWORD
ALIAS="homi-local"
ENDPOINT="http://127.0.0.1:$HOMI_MINIO_PORT"

start() {
    need_cmd minio "brew install minio"
    if port_listening "$HOMI_MINIO_PORT"; then
        ok "something already listens on :$HOMI_MINIO_PORT (shared MinIO) — not starting a second instance"
        return
    fi
    mkdir -p "$HOMI_MINIO_DATA"
    nohup minio server "$HOMI_MINIO_DATA" --address "127.0.0.1:$HOMI_MINIO_PORT" --console-address "127.0.0.1:$HOMI_MINIO_CONSOLE_PORT" \
        > "$LOG_DIR/minio.log" 2>&1 &
    echo $! > "$RUN_DIR/minio.pid"
    for _ in 1 2 3 4 5 6 7 8 9 10; do
        if curl -sf --max-time 1 "$ENDPOINT/minio/health/live" >/dev/null 2>&1; then
            ok "MinIO started on $ENDPOINT (console :$HOMI_MINIO_CONSOLE_PORT, data $HOMI_MINIO_DATA)"
            return
        fi
        sleep 1
    done
    fail "MinIO did not become healthy; see $LOG_DIR/minio.log"
    exit 1
}

stop() {
    pid="$(read_pid minio || true)"
    if pid_alive "$pid"; then
        kill "$pid" && ok "MinIO stopped (pid $pid)"
    else
        info "no MinIO started by this script (shared instance left running)"
    fi
    rm -f "$RUN_DIR/minio.pid"
}

buckets() {
    need_cmd mc "brew install minio-mc (or: brew install minio/stable/mc)"
    mc alias set "$ALIAS" "$ENDPOINT" "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null
    for b in $HOMI_BUCKETS; do
        mc mb --ignore-existing "$ALIAS/$b" >/dev/null
    done
    mc anonymous set download "$ALIAS/homi-public" >/dev/null
    mc anonymous set none "$ALIAS/homi-private" >/dev/null
    mc anonymous set none "$ALIAS/homi-tmp" >/dev/null
    # Temporary uploads vanish after a day (expand-and-contract friendly: rule is idempotent by prefix).
    mc ilm rule ls "$ALIAS/homi-tmp" 2>/dev/null | grep -q 'Expir' || mc ilm rule add --expire-days 1 "$ALIAS/homi-tmp" >/dev/null
    ok "buckets ready: $HOMI_BUCKETS (homi-public anonymous download; homi-tmp expires after 1 day)"
}

check() {
    if curl -sf --max-time 2 "$ENDPOINT/minio/health/live" >/dev/null 2>&1; then
        ok "MinIO healthy on $ENDPOINT"
    else
        fail "MinIO not reachable on $ENDPOINT → make dev-start (or scripts/dev/minio.sh start)"; return
    fi
    if has_cmd mc && mc alias set "$ALIAS" "$ENDPOINT" "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null 2>&1; then
        for b in $HOMI_BUCKETS; do
            mc ls "$ALIAS/$b" >/dev/null 2>&1 || { fail "bucket missing: $b → scripts/dev/minio.sh buckets"; return; }
        done
        ok "buckets present: $HOMI_BUCKETS"
    else
        warn "mc not available or credentials rejected — bucket check skipped (set MINIO_ROOT_USER/PASSWORD in .ai/local.env)"
    fi
}

case "${1:-check}" in
    start)   start ;;
    stop)    stop ;;
    buckets) buckets ;;
    check)   check; [ "$FAILS" -eq 0 ] ;;
    *)       die "usage: minio.sh start|stop|buckets|check" ;;
esac
