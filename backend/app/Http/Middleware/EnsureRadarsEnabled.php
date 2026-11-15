<?php

namespace App\Http\Middleware;

use App\Exceptions\Radar\RadarsDisabled;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Config;
use Symfony\Component\HttpFoundation\Response;

/**
 * The radar switch (DEC-51) on the four radar write routes: while `config('radar.creation_enabled')` is false they
 * answer `403 radars_disabled` after authentication and before validation or any lookup of the radar. It stays on the
 * routes when WP-45 gives the controllers their real bodies.
 */
class EnsureRadarsEnabled
{
    /** @param  Closure(Request): Response  $next */
    public function handle(Request $request, Closure $next): Response
    {
        if (! Config::boolean('radar.creation_enabled')) {
            throw new RadarsDisabled;
        }

        return $next($request);
    }
}
