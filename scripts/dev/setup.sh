#!/usr/bin/env bash
# dev:setup — one command from a fresh clone to a running local stack (ADR-0008, ADR-0012). Idempotent.
# Privileged steps (sudo / system trust store) are announced before they run; `--no-sudo` skips them
# and prints what to do manually.

set -e
. "$(dirname "$0")/lib.sh"
cd "$HOMI_ROOT"
NO_SUDO=0; [ "${1:-}" = "--no-sudo" ] && NO_SUDO=1

info "1/8 Homebrew dependencies"
need_cmd brew "https://brew.sh"
for f in php composer node pnpm postgresql@18 redis nginx mkcert; do
    if brew list --formula "$f" >/dev/null 2>&1; then ok "$f installed"; else info "installing $f"; brew install "$f"; fi
done
for s in php postgresql@18 redis; do
    brew services list | grep -E "^$s\s+started" >/dev/null 2>&1 || { info "starting $s"; brew services start "$s" >/dev/null; }
done

info "2/8 backend"
(cd backend && [ -d vendor ] || composer install --no-interaction)
# Agent knowledge base: regenerate the per-agent skill directories from the canonical .ai/skills (see .ai/README.md)
(cd backend && php artisan boost:update --no-interaction >/dev/null 2>&1) && ok "agent skills synced (boost:update)" || warn "boost:update failed — run: cd backend && php artisan boost:update"
if [ ! -f backend/.env ]; then
    cp backend/.env.example backend/.env
    (cd backend && php artisan key:generate --no-interaction)
    warn "backend/.env created from the template — set DB_* for your PostgreSQL and TELEGRAM_* tokens, then re-run"
fi
if (cd backend && php artisan db:show --no-ansi >/dev/null 2>&1); then
    (cd backend && php artisan migrate --no-interaction --force >/dev/null) && ok "database migrated"
else
    warn "database not reachable yet — create it (createdb homi) and set DB_* in backend/.env, then: cd backend && php artisan migrate"
fi

info "3/8 frontend"
(cd frontend && pnpm install --frozen-lockfile >/dev/null) && ok "pnpm workspace installed"
for app in landing app arm; do
    [ -f "frontend/$app/.env.local" ] || { cp "frontend/$app/.env.example" "frontend/$app/.env.local"; ok "frontend/$app/.env.local created"; }
done

info "4/8 TLS certificate (mkcert)"
scripts/dev/certs.sh generate
if [ "$NO_SUDO" -eq 0 ]; then
    scripts/dev/certs.sh check >/dev/null 2>&1 || scripts/dev/certs.sh install
else
    warn "skipped: scripts/dev/certs.sh install (mkcert -install)"
fi

info "5/8 nginx"
scripts/dev/nginx.sh link
if [ "$NO_SUDO" -eq 0 ]; then scripts/dev/nginx.sh test && scripts/dev/nginx.sh reload; else warn "skipped: sudo nginx -t && reload"; fi

info "6/8 /etc/hosts"
if [ "$NO_SUDO" -eq 0 ]; then scripts/dev/hosts.sh check >/dev/null 2>&1 || scripts/dev/hosts.sh apply; else warn "skipped: scripts/dev/hosts.sh apply"; fi

info "7/8 media storage (local disk, ADR-0012)"
scripts/dev/storage.sh prepare

info "8/8 check"
scripts/dev/check.sh || true
echo
info "next: make dev-start (Horizon + Next dev servers), then open https://app.homi.loc"
