#!/usr/bin/env bash
# Shared helpers for scripts/dev/*. Source this file; do not execute it.
# Compatible with macOS /bin/bash 3.2 (no associative arrays, no mapfile).

set -u

_computed_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# Machine-specific overrides (gitignored; template .ai/local.env.example)
if [ -f "$_computed_root/.ai/local.env" ]; then
    set -a
    # shellcheck disable=SC1091
    . "$_computed_root/.ai/local.env"
    set +a
fi

HOMI_ROOT="${HOMI_ROOT:-$_computed_root}"
export HOMI_ROOT

: "${HOMI_NEXT_PORT_LANDING:=3000}"
: "${HOMI_NEXT_PORT_APP:=3001}"
: "${HOMI_NEXT_PORT_ARM:=3002}"
: "${NGINX_ETC:=/opt/homebrew/etc/nginx}"
export HOMI_NEXT_PORT_LANDING HOMI_NEXT_PORT_APP HOMI_NEXT_PORT_ARM NGINX_ETC

HOMI_HOSTS="homi.loc app.homi.loc arm.homi.loc api.homi.loc cdn.homi.loc hook.homi.loc"
HOMI_VHOSTS="homi.conf app.homi.conf arm.homi.conf api.homi.conf cdn.homi.conf hook.homi.conf"

RUN_DIR="$HOMI_ROOT/infra/local/run"
LOG_DIR="$HOMI_ROOT/infra/local/logs"
CERT_DIR="$HOMI_ROOT/infra/local/certs"
NGINX_SRC="$HOMI_ROOT/infra/local/nginx"
MEDIA_DIR="$HOMI_ROOT/backend/storage/app/public"
mkdir -p "$RUN_DIR" "$LOG_DIR" "$CERT_DIR"

if [ -t 1 ]; then
    C_OK=$'\033[32m'; C_FAIL=$'\033[31m'; C_WARN=$'\033[33m'; C_INFO=$'\033[36m'; C_END=$'\033[0m'
else
    C_OK=""; C_FAIL=""; C_WARN=""; C_INFO=""; C_END=""
fi

FAILS=0
WARNS=0

ok()   { printf '%sPASS%s  %s\n' "$C_OK" "$C_END" "$*"; }
fail() { FAILS=$((FAILS + 1)); printf '%sFAIL%s  %s\n' "$C_FAIL" "$C_END" "$*"; }
warn() { WARNS=$((WARNS + 1)); printf '%sWARN%s  %s\n' "$C_WARN" "$C_END" "$*"; }
info() { printf '%s----%s  %s\n' "$C_INFO" "$C_END" "$*"; }
die()  { printf '%sERROR%s %s\n' "$C_FAIL" "$C_END" "$*" >&2; exit 1; }

need_cmd() {
    command -v "$1" >/dev/null 2>&1 || die "missing command: $1 ($2)"
}

has_cmd() { command -v "$1" >/dev/null 2>&1; }

port_listening() {
    lsof -nP -iTCP:"$1" -sTCP:LISTEN -t >/dev/null 2>&1
}

pid_alive() {
    [ -n "${1:-}" ] && kill -0 "$1" 2>/dev/null
}

read_pid() {
    [ -f "$RUN_DIR/$1.pid" ] && cat "$RUN_DIR/$1.pid"
}

# Prints every privileged command before it runs so the human sees exactly what sudo executes.
sudo_run() {
    printf '%ssudo%s  %s\n' "$C_WARN" "$C_END" "$*"
    sudo "$@"
}
