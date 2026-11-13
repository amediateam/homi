<?php

namespace App\Http;

use Illuminate\Http\Request;

/**
 * Decides who may open the operator dashboards (/telescope, /horizon) outside the local
 * environment. Their gates call it.
 *
 * On staging and production, nginx checks HTTP basic auth for those paths. It hands the
 * authenticated user name to PHP-FPM as the server variable `HOMI_DASHBOARD_USER`, which is
 * set only in that location block (`infra/<env>/nginx/api.*.conf`).
 *
 * A client cannot set a server variable through a request header, because headers arrive as
 * `HTTP_*`. A request that reaches a dashboard route any other way, such as
 * `/index.php/telescope`, therefore arrives without it and is refused.
 *
 * The variable must never be set in `.env`: the dotenv loader copies `.env` keys into
 * `$_SERVER`, which would open the dashboards to everyone.
 */
final class DashboardAccess
{
    public const string SERVER_VARIABLE = 'HOMI_DASHBOARD_USER';

    public static function allows(Request $request): bool
    {
        $user = $request->server(self::SERVER_VARIABLE);

        return is_string($user) && $user !== '';
    }
}
