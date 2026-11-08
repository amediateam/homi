#!/usr/bin/env bash
# Local media storage (ADR-0012): the Laravel `public` disk under backend/storage/app/public, served
# as static files by https://cdn.homi.loc. No object storage locally; MinIO is staging/production only.
#   scripts/dev/storage.sh prepare  → public/storage symlink, media dir, health probe file
#   scripts/dev/storage.sh check    → dir present and https://cdn.homi.loc/health.txt → 200

set -e
. "$(dirname "$0")/lib.sh"

case "${1:-check}" in
    prepare)
        (cd "$HOMI_ROOT/backend" && php artisan storage:link --no-interaction >/dev/null 2>&1 || true)
        mkdir -p "$MEDIA_DIR/originals" "$MEDIA_DIR/derived"
        echo ok > "$MEDIA_DIR/health.txt"
        ok "media dir ready: $MEDIA_DIR (health.txt, originals/, derived/)"
        ;;
    check)
        [ -d "$MEDIA_DIR" ] || { fail "media dir missing → scripts/dev/storage.sh prepare"; exit 1; }
        code="$(curl -s --max-time 5 -o /dev/null -w '%{http_code}' https://cdn.homi.loc/health.txt 2>/dev/null || true)"
        if [ "$code" = "200" ]; then
            ok "https://cdn.homi.loc/health.txt → 200 (static from storage/app/public)"
        else
            fail "cdn.homi.loc → ${code:-no response} → make dev-nginx; scripts/dev/storage.sh prepare"; exit 1
        fi
        ;;
    *)
        die "usage: storage.sh prepare|check"
        ;;
esac
