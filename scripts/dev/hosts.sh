#!/usr/bin/env bash
# Manage the HOMI block in /etc/hosts (ADR-0008).
#   scripts/dev/hosts.sh check   → report missing entries (no sudo)
#   scripts/dev/hosts.sh apply   → rewrite the managed block (asks for sudo)
# The block is delimited by markers so re-running is idempotent and other entries are untouched.

set -e
. "$(dirname "$0")/lib.sh"

BEGIN="# >>> homi.uz local (scripts/dev/hosts.sh) >>>"
END="# <<< homi.uz local <<<"

missing() {
    for h in $HOMI_HOSTS; do
        if ! grep -qE "^[[:space:]]*127\.0\.0\.1[[:space:]]+([^#]*[[:space:]])?$h([[:space:]]|$)" /etc/hosts; then
            echo "$h"
        fi
    done
}

case "${1:-check}" in
    check)
        m="$(missing)"
        if [ -z "$m" ]; then
            ok "/etc/hosts has all 6 homi.loc entries"
        else
            fail "/etc/hosts missing: $(echo "$m" | tr '\n' ' ')→ run: make dev-hosts"
            exit 1
        fi
        ;;
    apply)
        tmp="$(mktemp)"
        # Drop an existing managed block, keep everything else byte-for-byte.
        awk -v b="$BEGIN" -v e="$END" '
            $0 == b { skip = 1; next }
            $0 == e { skip = 0; next }
            !skip   { print }
        ' /etc/hosts > "$tmp"
        {
            echo "$BEGIN"
            for h in $HOMI_HOSTS; do echo "127.0.0.1 $h"; done
            echo "$END"
        } >> "$tmp"
        info "writing managed block to /etc/hosts (6 entries)"
        sudo_run cp "$tmp" /etc/hosts
        rm -f "$tmp"
        sudo_run dscacheutil -flushcache
        sudo_run killall -HUP mDNSResponder
        ok "/etc/hosts updated"
        ;;
    *)
        die "usage: hosts.sh check|apply"
        ;;
esac
