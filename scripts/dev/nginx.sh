#!/usr/bin/env bash
# Wire infra/local/nginx into the Homebrew nginx (ADR-0008).
#   scripts/dev/nginx.sh paths    → write snippets/paths.conf (absolute checkout path; gitignored)
#   scripts/dev/nginx.sh link     → symlink sites-available/homi and the 6 vhosts into sites-enabled (no sudo)
#   scripts/dev/nginx.sh test     → `nginx -t` (nginx runs as root here, so this asks for sudo)
#   scripts/dev/nginx.sh reload   → reload if running, else `brew services start nginx` (sudo)
#   scripts/dev/nginx.sh unlink   → remove the symlinks
#   scripts/dev/nginx.sh check    → links present, config test passes, 443 listening

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

reload() {
    if pgrep -x nginx >/dev/null 2>&1; then
        sudo_run nginx -s reload
        ok "nginx reloaded"
    else
        info "nginx is not running; starting it as a root launch daemon (how the other local projects run it)"
        sudo_run brew services start nginx
        ok "nginx started"
    fi
}

check() {
    [ -f "$PATHS" ] && ok "snippets/paths.conf present" || { fail "snippets/paths.conf missing → make dev-nginx"; return; }
    for f in $HOMI_VHOSTS; do
        [ -L "$NGINX_ETC/sites-enabled/$f" ] || { fail "vhost not linked: $f → make dev-nginx"; return; }
    done
    ok "6 vhosts linked"
    if port_listening 443 && port_listening 80; then ok "nginx listening on 80/443"; else fail "nginx not listening on 80/443 → scripts/dev/nginx.sh reload"; fi
}

case "${1:-check}" in
    paths)  write_paths ;;
    link)   write_paths; link ;;
    test)   test_conf ;;
    reload) reload ;;
    unlink) unlink_all ;;
    check)  check; [ "$FAILS" -eq 0 ] ;;
    *)      die "usage: nginx.sh paths|link|test|reload|unlink|check" ;;
esac
