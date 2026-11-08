#!/usr/bin/env bash
# dev:check — the local environment health check from master prompt §6.6.
# Every line is PASS / WARN / FAIL with a hint; exit 1 if anything FAILs. No values from .env are printed.

. "$(dirname "$0")/lib.sh"
cd "$HOMI_ROOT"

# Run a sibling check script, print its output and fold its PASS/WARN/FAIL lines into our counters.
# (Child scripts print without colour when captured, so the plain markers match.)
run_sub() {
    out="$("$@" 2>&1)"
    printf '%s\n' "$out"
    FAILS=$((FAILS + $(printf '%s\n' "$out" | grep -c '^FAIL  ')))
    WARNS=$((WARNS + $(printf '%s\n' "$out" | grep -c '^WARN  ')))
}

info "versions vs pins"
node_major="$(node -v 2>/dev/null | sed -E 's/^v([0-9]+).*/\1/')"
node_pin="$(cat .node-version 2>/dev/null | tr -d '[:space:]')"
[ "$node_major" = "$node_pin" ] && ok "node v$node_major matches .node-version ($node_pin)" || fail "node v${node_major:-?} ≠ .node-version ($node_pin) → install Node $node_pin"
pnpm_pin="$(grep -oE '"packageManager": *"pnpm@[0-9]+' frontend/package.json | grep -oE '[0-9]+$')"
# Measured inside frontend/: pnpm switches itself to the packageManager version there, so a newer global pnpm is fine (KI-21).
pnpm_major="$(cd frontend && pnpm -v 2>/dev/null | cut -d. -f1)"
[ "$pnpm_major" = "$pnpm_pin" ] && ok "pnpm $pnpm_major matches packageManager (pnpm@$pnpm_pin)" || fail "pnpm ${pnpm_major:-missing} ≠ pnpm@$pnpm_pin in frontend/ → brew install pnpm (it switches to packageManager by itself)"
php_pin="$(grep -oE '"php": *"[0-9]+\.[0-9]+' backend/composer.json | tail -1 | grep -oE '[0-9]+\.[0-9]+')"
php_ver="$(php -r 'echo PHP_MAJOR_VERSION.".".PHP_MINOR_VERSION;' 2>/dev/null)"
[ "$php_ver" = "$php_pin" ] && ok "php $php_ver matches composer platform ($php_pin)" || fail "php ${php_ver:-missing} ≠ platform $php_pin"
for ext in pdo_pgsql redis gd imagick intl; do php -m 2>/dev/null | grep -qi "^$ext$" || fail "php extension missing: $ext"; done

info "dns + tls"
run_sub "$HOMI_ROOT/scripts/dev/hosts.sh" check
run_sub "$HOMI_ROOT/scripts/dev/certs.sh" check

info "services"
port_listening 9000 && ok "php-fpm on :9000" || fail "php-fpm not listening on :9000 → brew services start php"
port_listening 5432 && ok "PostgreSQL on :5432" || fail "PostgreSQL not listening on :5432 → brew services start postgresql@18"
port_listening 6379 && ok "Redis on :6379" || fail "Redis not listening on :6379 → brew services start redis"
run_sub "$HOMI_ROOT/scripts/dev/nginx.sh" check

info "application"
code="$(curl -s --max-time 5 -o /dev/null -w '%{http_code}' https://api.homi.loc/up 2>/dev/null || true)"
if [ "$code" = "200" ]; then ok "https://api.homi.loc/up → 200 (TLS trusted by curl)"
else
    code_k="$(curl -sk --max-time 5 -o /dev/null -w '%{http_code}' https://api.homi.loc/up 2>/dev/null || true)"
    if [ "$code_k" = "200" ]; then fail "api.homi.loc answers but the certificate is not trusted → scripts/dev/certs.sh install"
    else fail "https://api.homi.loc/up → ${code:-no response} → make dev-nginx; sudo tail /opt/homebrew/var/log/nginx/homi.api.error.log"; fi
fi
run_sub "$HOMI_ROOT/scripts/dev/storage.sh" check
if (cd backend && php artisan migrate:status --no-ansi > "$LOG_DIR/migrate-status.txt" 2>&1); then
    pending="$(grep -c 'Pending' "$LOG_DIR/migrate-status.txt" || true)"
    [ "$pending" = "0" ] && ok "database reachable, no pending migrations" || warn "database reachable, $pending pending migration(s) → cd backend && php artisan migrate"
else
    fail "database connection failed (see $LOG_DIR/migrate-status.txt) → check DB_* in backend/.env"
fi
if (cd backend && php artisan horizon:status 2>/dev/null | grep -q 'running'); then ok "Horizon is running"; else warn "Horizon not running → make dev-start"; fi
grep -qE '^QUEUE_CONNECTION=redis' backend/.env 2>/dev/null && ok "QUEUE_CONNECTION=redis (ADR-0005)" || fail "backend/.env QUEUE_CONNECTION is not redis → Horizon processes nothing (ADR-0005)"
# `services.sh status` exits 0 when a service is merely not running (that is a WARN line), so read its output (KI-21).
next_status="$("$HOMI_ROOT/scripts/dev/services.sh" status next-landing next-app next-arm 2>&1 || true)"
if printf '%s\n' "$next_status" | grep -qE '^(WARN|FAIL)  '; then warn "Next dev servers not all running → make dev-start"; else ok "Next dev servers running on 3000/3001/3002"; fi
for pair in homi.loc:landing app.homi.loc:app arm.homi.loc:arm; do
    host="${pair%%:*}"; app="${pair##*:}"
    code="$(curl -s --max-time 10 -o /dev/null -w '%{http_code}' "https://$host/" 2>/dev/null || true)"
    [ "$code" = "200" ] && ok "https://$host/ → 200 (nginx → next dev $app)" || fail "https://$host/ → ${code:-no response} → make dev-start; make dev-nginx"
done

info "env files (key names only)"
run_sub "$HOMI_ROOT/scripts/dev/env-keys.sh"

echo
if [ "$FAILS" -eq 0 ]; then
    printf '%sdev:check OK%s (%d warning(s))\n' "$C_OK" "$C_END" "$WARNS"
    exit 0
else
    printf '%sdev:check FAILED%s — %d failure(s), %d warning(s)\n' "$C_FAIL" "$C_END" "$FAILS" "$WARNS"
    exit 1
fi
