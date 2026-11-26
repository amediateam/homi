<?php

/*
|--------------------------------------------------------------------------
| Trusted proxies (WP-40, SEC-REQ-027)
|--------------------------------------------------------------------------
| The addresses whose `X-Forwarded-*` headers are believed: comma-separated addresses or CIDR ranges
| (`TRUSTED_PROXIES`). The framework's `TrustProxies`, already in the global stack, reads this key when
| `trustProxies(at: …)` was never called, so nothing is set in `bootstrap/app.php` and the value survives
| `config:cache`.
|
| The per-address limiters (`v1-auth`, `v1-public`) count the client address. The Mini App reaches the API through
| its Next servers, which forward the incoming `X-Forwarded-For`; list the addresses the Next servers connect from.
| Blank (the default) trusts nobody: every request is counted under the address that connected. `*` would trust
| every caller's header and must never be set on a server.
*/

$proxies = env('TRUSTED_PROXIES');

return [
    'proxies' => is_string($proxies) && trim($proxies) !== '' ? trim($proxies) : null,
];
