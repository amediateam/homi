#!/usr/bin/env bash
# Local TLS for *.homi.loc with mkcert (ADR-0008).
#   scripts/dev/certs.sh install   → `mkcert -install` (adds the local CA to the system trust store; asks for sudo)
#   scripts/dev/certs.sh generate  → infra/local/certs/homi.loc{,-key}.pem for the 6 hosts (no sudo)
#   scripts/dev/certs.sh check     → files present, not expiring, trusted by the system
# mkcert itself: `brew install mkcert` (nss is already installed for Firefox support).

set -e
. "$(dirname "$0")/lib.sh"

CERT="$CERT_DIR/homi.loc.pem"
KEY="$CERT_DIR/homi.loc-key.pem"

case "${1:-check}" in
    install)
        need_cmd mkcert "brew install mkcert"
        info "mkcert -install adds the mkcert root CA to the macOS system keychain (one-time, per machine)"
        mkcert -install
        ok "mkcert CA installed: $(mkcert -CAROOT)"
        ;;
    generate)
        need_cmd mkcert "brew install mkcert"
        if [ -f "$CERT" ] && [ "${2:-}" != "--force" ] && openssl x509 -in "$CERT" -checkend 2592000 -noout >/dev/null 2>&1; then
            ok "certificate exists and is valid for 30+ days: $CERT (use --force to regenerate)"
            exit 0
        fi
        # shellcheck disable=SC2086
        mkcert -cert-file "$CERT" -key-file "$KEY" $HOMI_HOSTS
        chmod 600 "$KEY"
        ok "generated $CERT for: $HOMI_HOSTS"
        ;;
    check)
        if ! has_cmd mkcert; then fail "mkcert not installed → brew install mkcert"; exit 1; fi
        if [ ! -f "$CERT" ] || [ ! -f "$KEY" ]; then fail "certificate missing → make dev-certs"; exit 1; fi
        if ! openssl x509 -in "$CERT" -checkend 86400 -noout >/dev/null 2>&1; then fail "certificate expires within 24h → scripts/dev/certs.sh generate --force"; exit 1; fi
        for h in $HOMI_HOSTS; do
            if ! openssl x509 -in "$CERT" -noout -ext subjectAltName 2>/dev/null | grep -q "DNS:$h"; then
                fail "certificate does not cover $h → scripts/dev/certs.sh generate --force"; exit 1
            fi
        done
        if security verify-cert -c "$CERT" -p ssl -s api.homi.loc >/dev/null 2>&1; then
            ok "certificate valid and trusted by the system keychain"
        else
            fail "certificate not trusted → scripts/dev/certs.sh install (mkcert -install), then restart the browser"; exit 1
        fi
        ;;
    *)
        die "usage: certs.sh install|generate [--force]|check"
        ;;
esac
