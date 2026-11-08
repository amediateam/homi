#!/usr/bin/env bash
# Application processes for local development (ADR-0008): Horizon (queue worker) and the three
# Next.js dev servers. nginx/php-fpm/PostgreSQL/Redis are Homebrew services; MinIO has its own script.
#   scripts/dev/services.sh start|stop|restart|status|logs [name]
# Processes run detached with pid files in infra/local/run and logs in infra/local/logs.
# `php artisan serve` is deliberately not used: ports 8000/8001 are taken on this machine and nginx+php-fpm
# serve api.homi.loc instead.

set -e
. "$(dirname "$0")/lib.sh"

SERVICES="horizon next-landing next-app next-arm"

port_for() {
    case "$1" in
        next-landing) echo "$HOMI_NEXT_PORT_LANDING" ;;
        next-app)     echo "$HOMI_NEXT_PORT_APP" ;;
        next-arm)     echo "$HOMI_NEXT_PORT_ARM" ;;
        *)            echo "" ;;
    esac
}

start_one() {
    name="$1"
    pid="$(read_pid "$name" || true)"
    if pid_alive "$pid"; then ok "$name already running (pid $pid)"; return; fi
    case "$name" in
        horizon)
            (cd "$HOMI_ROOT/backend" && nohup php artisan horizon > "$LOG_DIR/horizon.log" 2>&1 & echo $! > "$RUN_DIR/horizon.pid")
            ;;
        next-landing|next-app|next-arm)
            app="${name#next-}"
            port="$(port_for "$name")"
            if port_listening "$port"; then fail "$name: port $port already in use (lsof -nP -iTCP:$port)"; return; fi
            (cd "$HOMI_ROOT/frontend/$app" && nohup node_modules/.bin/next dev -p "$port" > "$LOG_DIR/$name.log" 2>&1 & echo $! > "$RUN_DIR/$name.pid")
            ;;
        *) die "unknown service: $name" ;;
    esac
    sleep 1
    pid="$(read_pid "$name")"
    if pid_alive "$pid"; then ok "$name started (pid $pid, log $LOG_DIR/$name.log)"; else fail "$name exited immediately — see $LOG_DIR/$name.log"; fi
}

stop_one() {
    name="$1"
    pid="$(read_pid "$name" || true)"
    if pid_alive "$pid"; then
        kill "$pid" 2>/dev/null || true
        for _ in 1 2 3 4 5; do pid_alive "$pid" || break; sleep 1; done
        pid_alive "$pid" && kill -9 "$pid" 2>/dev/null || true
        ok "$name stopped"
    else
        info "$name not running"
    fi
    rm -f "$RUN_DIR/$name.pid"
    # Next dev servers sometimes leave a listener behind; free the port.
    port="$(port_for "$name")"
    if [ -n "$port" ] && port_listening "$port"; then
        lsof -nP -iTCP:"$port" -sTCP:LISTEN -t | xargs kill 2>/dev/null || true
    fi
}

status_one() {
    name="$1"
    pid="$(read_pid "$name" || true)"
    port="$(port_for "$name")"
    if pid_alive "$pid"; then
        if [ -n "$port" ]; then
            port_listening "$port" && ok "$name running (pid $pid) on :$port" || warn "$name running (pid $pid) but :$port not listening yet"
        else
            ok "$name running (pid $pid)"
        fi
    else
        warn "$name not running → make dev-start"
    fi
}

targets="${2:-$SERVICES}"
case "${1:-status}" in
    start)   for s in $targets; do start_one "$s"; done ;;
    stop)    for s in $targets; do stop_one "$s"; done ;;
    restart) for s in $targets; do stop_one "$s"; start_one "$s"; done ;;
    status)  for s in $targets; do status_one "$s"; done; [ "$FAILS" -eq 0 ] ;;
    logs)    exec tail -n 40 -F "$LOG_DIR"/*.log /opt/homebrew/var/log/nginx/homi.*.log ;;
    *)       die "usage: services.sh start|stop|restart|status|logs [service ...]" ;;
esac
