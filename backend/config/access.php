<?php

/*
|--------------------------------------------------------------------------
| Access to the Mini App (WP-40)
|--------------------------------------------------------------------------
| The tokens of a Telegram sign-in (ADR-0003): Sanctum personal access tokens named `miniapp` with the
| abilities `app:read` and `app:write` only. `token_ttl_minutes` is their lifetime; a user holds at most
| `max_tokens` unexpired ones, and a new sign-in revokes the oldest. Expired tokens are pruned daily
| (`sanctum:prune-expired --hours=24`, routes/console.php). The access gate adds its keys here.
*/

return [
    'token_ttl_minutes' => 1440,

    'max_tokens' => 5,
];
