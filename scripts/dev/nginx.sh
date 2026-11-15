#!/usr/bin/env bash
# Wire infra/local/nginx into the Homebrew nginx (ADR-0008).
#   scripts/dev/nginx.sh paths    → write snippets/paths.conf (absolute checkout path; gitignored)
#   scripts/dev/nginx.sh link     → symlink sites-available/homi and the 6 vhosts into sites-enabled (no sudo)
#   scripts/dev/nginx.sh test     → `sudo nginx -t` (nginx runs as root here)
#   scripts/dev/nginx.sh reload   → `sudo nginx -s reload` if serving, else start (never brew services — see below)
#   scripts/dev/nginx.sh start    → `sudo nginx` unless already serving; a master that is shutting down is stopped first
#   scripts/dev/nginx.sh stop     → graceful quit, waits for the master to exit, then a fast shutdown if it hangs
#   scripts/dev/nginx.sh restart  → stop + start: a new master from this terminal (the cure for KI-31)
#   scripts/dev/nginx.sh unlink   → remove the symlinks
#   scripts/dev/nginx.sh check    → links present, 80/443 listening
# Only the shared root nginx is signalled (lib.sh `nginx_master_pid`), never one running under the developer's user.

set -e
. "$(dirname "$0")/lib.sh"

PATHS="$NGINX_SRC/snippets/paths.conf"

write_paths() {
    sed "s#__HOMI_ROOT__#$HOMI_ROOT#g" "$NGINX_SRC/snippets/paths.conf.example" > "$PATHS"
    ok "wrote $PATHS (approot=$HOMI_ROOT)"
}

link() {
    [ -d "$NGINX_ETC/sites-available" ] || die "$NGINX_ETC/sites-available not found — is Homebrew nginx installed and configured with sites-enabled/*.conf?"
    [ -d "$NGINX_ETC/sites-enabled" ] || die "$NGINX_ETC/sites-enabled not found"
    ln -sfn "$NGINX_SRC" "$NGINX_ETC/sites-available/homi"
    for f in $HOMI_VHOSTS; do
        ln -sfn "$NGINX_SRC/$f" "$NGINX_ETC/sites-enabled/$f"
    done
    ok "linked sites-available/homi and $(echo "$HOMI_VHOSTS" | wc -w | tr -d ' ') vhosts into sites-enabled"
}

unlink_all() {
    for f in $HOMI_VHOSTS; do rm -f "$NGINX_ETC/sites-enabled/$f"; done
    rm -f "$NGINX_ETC/sites-available/homi"
    ok "unlinked HOMI vhosts"
}

test_conf() {
    [ -f "$PATHS" ] || die "snippets/paths.conf missing → scripts/dev/nginx.sh paths"
    [ -f "$CERT_DIR/homi.loc.pem" ] || die "certificate missing → make dev-certs (nginx -t fails on missing ssl_certificate)"
    sudo_run nginx -t
}

# nginx is started by hand with `sudo nginx` from a terminal (the developers' convention). A launchd
# daemon cannot be used here: macOS TCC denies daemons access to ~/Documents, where the vhost symlinks
# and the project root live ("Operation not permitted" in error.log), while a terminal-launched root
# process gets the terminal's Documents access. Never use `brew services` for nginx on these machines.
# That access can still be lost by a long-running master: the workers a later reload forks then fail
# with the same error, and only a new master helps — `restart`, not `reload` (KI-31).

# Waits up to $1 seconds; succeeds as soon as the root nginx master is gone.
wait_master_exit() {
    for _ in $(seq 1 "$1"); do
        nginx_running || return 0
        sleep 1
    done
    ! nginx_running
}

# Waits up to $1 seconds; succeeds as soon as something accepts connections on 443.
wait_listening() {
    for _ in $(seq 1 "$1"); do
        port_listening 443 && return 0
        sleep 1
    done
    return 1
}

# Fails with $1 as the hint when the workers cannot read ~/Documents (KI-31). Any other cdn answer is left to
# dev-check: during `make dev-setup` the hosts entries and health.txt may not exist yet.
documents_probe() {
    sleep 1
    code="$(curl -s --max-time 5 -o /dev/null -w '%{http_code}' https://cdn.homi.loc/health.txt 2>/dev/null || true)"
    if [ "$code" = "500" ] && nginx_documents_denied; then
        fail "nginx workers cannot read ~/Documents (\"Operation not permitted\" in $NGINX_LOG_DIR/homi.cdn.error.log) → $1"
        exit 1
    fi
}

start() {
    if nginx_running; then
        if port_listening 443; then
            ok "nginx already running (master pid $(nginx_master_pid))"
            return
        fi
        info "nginx master $(nginx_master_pid) is shutting down and would ignore a reload; stopping it first"
        stop
    fi
    info "starting nginx as root; the terminal app running this needs access to ~/Documents (KI-13, KI-31)"
    sudo_run nginx
    if ! wait_listening 5; then
        fail "nginx not listening on 443 → sudo nginx -t; tail -n 20 $NGINX_LOG_DIR/error.log"
        exit 1
    fi
    documents_probe "allow your terminal app in System Settings → Privacy & Security → Files and Folders (Documents), then scripts/dev/nginx.sh restart"
    ok "nginx is listening on 443 (master pid $(nginx_master_pid))"
}

reload() {
    if ! nginx_running || ! port_listening 443; then
        start
        return
    fi
    sudo_run nginx -s reload
    documents_probe "a reload cannot fix this; run scripts/dev/nginx.sh restart (make dev-nginx-restart) from Terminal or iTerm"
    ok "nginx reloaded"
}

# QUIT lets the master finish open requests; long-lived ones (a websocket of any project on this shared nginx)
# can keep it alive for minutes while it no longer listens. After 10 s it gets TERM, the fast shutdown.
# A master that no longer listens is already in such a graceful quit and gets TERM at once.
stop() {
    pid="$(nginx_master_pid)"
    if [ -z "$pid" ]; then
        info "nginx not running"
        return
    fi
    if port_listening 443; then
        sudo_run kill -QUIT "$pid"
        if wait_master_exit 10; then
            ok "nginx stopped"
            return
        fi
        info "nginx master $pid still finishing open connections after 10 s; fast shutdown"
    else
        info "nginx master $pid is already shutting down (not listening on 443); fast shutdown"
    fi
    sudo_run kill -TERM "$pid"
    if wait_master_exit 5; then
        ok "nginx stopped (fast shutdown)"
        return
    fi
    fail "nginx master $pid did not exit → sudo kill -KILL $pid, then scripts/dev/nginx.sh start"
    exit 1
}

check() {
    [ -f "$PATHS" ] && ok "snippets/paths.conf present" || { fail "snippets/paths.conf missing → make dev-nginx"; return; }
    for f in $HOMI_VHOSTS; do
        [ -L "$NGINX_ETC/sites-enabled/$f" ] || { fail "vhost not linked: $f → make dev-nginx"; return; }
    done
    ok "6 vhosts linked"
    if port_listening 443 && port_listening 80; then
        ok "nginx listening on 80/443"
    elif nginx_running; then
        fail "nginx master $(nginx_master_pid) is alive but not listening on 80/443 (shutting down) → make dev-nginx-restart"
    else
        fail "nginx not running → scripts/dev/nginx.sh start"
    fi
}

case "${1:-check}" in
    paths)   write_paths ;;
    link)    write_paths; link ;;
    test)    test_conf ;;
    reload)  reload ;;
    start)   start ;;
    stop)    stop ;;
    restart) stop; start ;;
    unlink)  unlink_all ;;
    check)   check; [ "$FAILS" -eq 0 ] ;;
    *)       die "usage: nginx.sh paths|link|test|reload|start|stop|restart|unlink|check" ;;
esac
