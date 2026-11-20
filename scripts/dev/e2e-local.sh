#!/usr/bin/env bash
# dev:e2e-local — Playwright against an API of its own, the way the CI job runs it (.github/workflows/frontend-e2e.yml):
# the API on stubs behind PHP's built-in server, on SQLite with the array cache. It needs neither nginx nor the
# database of the backend's env file, and the `api` rate limiter never accumulates (KI-32), so one spec — or the whole
# suite — behaves as in CI. The API lives for the run only; its database is a temporary file outside the checkout.
#
#   scripts/dev/e2e-local.sh app/e2e/feed.spec.ts                         # one spec (paths relative to frontend/)
#   scripts/dev/e2e-local.sh app/e2e/feed.spec.ts -g "pull" --repeat-each 5
#   scripts/dev/e2e-local.sh                                              # the whole suite, about as long as in CI
#   E2E_RADARS_OFF=1 scripts/dev/e2e-local.sh                             # only the @radars-off tests (radars switched off)
#
# Every argument goes to `playwright test`, which runs with `CI=1`: one worker and no `@flaky` tests, as in the CI job
# (`--workers=4` on the command line still wins). Playwright builds and starts `app` on :3001 itself, so that port must
# be free (`make dev-stop`). No value of the backend's env file is printed; the overrides below reach the API process
# only.
#
# Not the CI job: the backend's own env file and `frontend/app/.env.local` still apply where the overrides do not reach
# (CI has a copy of `.env.example` and no `.env.local`), and PHP is the local one. A green run here is a fast check
# before the push; the CI run stays the judge.

. "$(dirname "$0")/lib.sh"
cd "$HOMI_ROOT"

need_cmd php "brew install php"
need_cmd pnpm "npm install --global pnpm"
need_cmd curl "curl"

# `frontend/playwright.config.ts` serves the app on :3001 and, outside CI, reuses whatever already answers there:
# a dev server wired to another API would be tested instead of this build.
APP_PORT=3001
[ -z "${E2E_BASE_URL:-}" ] || die "E2E_BASE_URL is set: this run starts its own app server; unset it (or use 'make e2e')"
if port_listening "$APP_PORT"; then
    die "port $APP_PORT is busy: Playwright would reuse that server, which talks to another API. Run 'make dev-stop' first"
fi

radars="true"
api_port="${HOMI_E2E_API_PORT:-8080}"
if [ "${E2E_RADARS_OFF:-}" = "1" ]; then
    radars="false"
    api_port="${HOMI_E2E_API_PORT:-8081}"
fi
if port_listening "$api_port"; then
    die "port $api_port is busy (choose another with HOMI_E2E_API_PORT)"
fi
[ -d backend/vendor ] || die "backend/vendor is missing: run 'composer install' in backend/"
# A cached config ignores the environment: the overrides would not reach the API and migrate would run on the
# database of the env file.
if [ -f backend/bootstrap/cache/config.php ]; then
    die "backend has a cached config: run 'php artisan config:clear' in backend/ first"
fi

work="$(mktemp -d "${TMPDIR:-/tmp}/homi-e2e.XXXXXX")"
database="$work/api.sqlite"
api_log="$LOG_DIR/e2e-api.log"
api_pid=""

cleanup() {
    if pid_alive "$api_pid"; then kill "$api_pid" 2>/dev/null; fi
    rm -rf "$work"
}
trap cleanup EXIT
trap 'exit 130' INT TERM

# The CI job's variables (they override the env file); DB_URL is emptied so a URL in that file cannot win over them.
api_env() {
    env DB_CONNECTION=sqlite DB_DATABASE="$database" DB_URL= PULSE_DB_CONNECTION=sqlite CACHE_STORE=array \
        QUEUE_CONNECTION=sync SESSION_DRIVER=array TELESCOPE_ENABLED=false PULSE_ENABLED=false SOURCES_ALLOW_STUB=true \
        RADAR_CREATION_ENABLED="$radars" "$@"
}

: > "$database"
# Prove the overrides took before anything is migrated: artisan must succeed, the default connection must be sqlite
# and the sqlite connection must be this file. Pulse's migration follows its own connection key, overridden above.
default_connection="$(cd backend && api_env php artisan config:show database.default 2>/dev/null)" \
    || die "artisan could not read the configuration: nothing was migrated"
case "$default_connection" in
    *sqlite*) ;;
    *) die "the API's default connection is not sqlite with the overrides: nothing was migrated" ;;
esac
sqlite_connection="$(cd backend && api_env php artisan config:show database.connections.sqlite 2>/dev/null)" \
    || die "artisan could not read the sqlite connection: nothing was migrated"
case "$sqlite_connection" in
    *"$database"*) ;;
    *) die "the API's sqlite connection is not the temporary file: nothing was migrated" ;;
esac
if ! (cd backend && api_env php artisan migrate --force --no-interaction) > "$work/migrate.log" 2>&1; then
    tail -n 30 "$work/migrate.log"
    die "migrations failed on the temporary SQLite database"
fi

# Laravel's router script takes the public directory from the working directory, as `artisan serve` does.
(cd backend/public && exec env DB_CONNECTION=sqlite DB_DATABASE="$database" DB_URL= PULSE_DB_CONNECTION=sqlite \
    CACHE_STORE=array QUEUE_CONNECTION=sync SESSION_DRIVER=array TELESCOPE_ENABLED=false PULSE_ENABLED=false \
    SOURCES_ALLOW_STUB=true RADAR_CREATION_ENABLED="$radars" \
    php -S "127.0.0.1:$api_port" ../vendor/laravel/framework/src/Illuminate/Foundation/resources/server.php) > "$api_log" 2>&1 &
api_pid=$!

reference=""
attempt=0
while [ "$attempt" -lt 30 ]; do
    if reference="$(curl -sf "http://127.0.0.1:$api_port/api/v1/reference")"; then break; fi
    reference=""
    pid_alive "$api_pid" || break
    attempt=$((attempt + 1))
    sleep 1
done
if [ -z "$reference" ]; then
    tail -n 20 "$api_log"
    die "the API did not answer on :$api_port (log: $api_log)"
fi
case "$reference" in
    *"\"radars_enabled\":$radars"*) ;;
    *) die "the API answers with radars_enabled other than $radars" ;;
esac
info "API on stubs: http://127.0.0.1:$api_port (SQLite, radars_enabled $radars, log $api_log)"
info "Playwright builds and starts app on :$APP_PORT"

cd "$HOMI_ROOT/frontend"
# The variables of the CI job's "End-to-end tests" step, and `CI` itself for the config's one worker and tag filter.
CI=1 \
    API_URL="http://127.0.0.1:$api_port/api/v1" \
    NEXT_PUBLIC_CDN_URL="https://cdn.homi.loc" \
    NEXT_PUBLIC_APP_ENV="ci" \
    NEXT_PUBLIC_API_URL="https://api.homi.loc/api/v1" \
    CSP_TILE_HOSTS="https://tile.openstreetmap.org" \
    pnpm exec playwright test "$@"
exit $?
