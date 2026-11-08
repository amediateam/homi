#!/usr/bin/env bash
# Compare environment KEY names (never values) between an env file and its template (master prompt §6.6, §15.4).
#   scripts/dev/env-keys.sh                      → backend/.env vs .env.example and each frontend app
#   scripts/dev/env-keys.sh <env-file> <template>

set -e
. "$(dirname "$0")/lib.sh"

keys() { grep -oE '^[A-Za-z_][A-Za-z0-9_]*' "$1" | sort -u; }

compare() {
    env_file="$1"; template="$2"; label="$3"
    if [ ! -f "$template" ]; then fail "$label: template missing ($template)"; return; fi
    if [ ! -f "$env_file" ]; then warn "$label: $env_file missing → cp $template $env_file"; return; fi
    missing="$(comm -13 <(keys "$env_file") <(keys "$template") | tr '\n' ' ')"
    extra="$(comm -23 <(keys "$env_file") <(keys "$template") | tr '\n' ' ')"
    if [ -z "$missing" ]; then
        ok "$label: all template keys present${extra:+ (extra in env: $extra)}"
    else
        fail "$label: keys missing in $(basename "$env_file"): $missing"
    fi
}

if [ $# -eq 2 ]; then
    compare "$1" "$2" "$1"
else
    compare "$HOMI_ROOT/backend/.env" "$HOMI_ROOT/backend/.env.example" "backend"
    for app in landing app arm; do
        compare "$HOMI_ROOT/frontend/$app/.env.local" "$HOMI_ROOT/frontend/$app/.env.example" "frontend/$app"
    done
fi
[ "$FAILS" -eq 0 ]
