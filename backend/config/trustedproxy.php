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
| Blank (the default) trusts nobody: every request is counted under the address that connected.
|
| `*` and `**` also mean nobody here. The framework reads either as "trust every caller", so anyone who reaches the
| API directly could name his own client address and get a fresh bucket of every per-address limiter; a server must
| list its proxies. Two list entries have the same effect and must not be set either: `REMOTE_ADDR` (the framework
| trusts whoever connected) and the ranges `0.0.0.0/0` or `::/0`.
*/

$proxies = env('TRUSTED_PROXIES');
$proxies = is_string($proxies) ? trim($proxies) : '';

return [
    'proxies' => in_array($proxies, ['', '*', '**'], true) ? null : $proxies,
];
