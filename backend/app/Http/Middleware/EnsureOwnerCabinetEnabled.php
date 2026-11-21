<?php

namespace App\Http\Middleware;

use App\Exceptions\Owner\OwnerCabinetDisabled;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Config;
use Symfony\Component\HttpFoundation\Response;

/**
 * The switch of the owner cabinet (DEC-81), the twin of `EnsureRadarsEnabled`: on the routes that change a listing's
 * content or create one, while `config('owner.enabled')` is false they answer `403 owner_disabled` after
 * authentication and before validation or any lookup. Reads, the ways down (pause, let, remove, delete a draft) and
 * the answers to requests stay open. It stays when WP-84 gives the controllers their real bodies; WP-84 adds the
 * allow-list of `owner.allowed_ids`.
 */
class EnsureOwnerCabinetEnabled
{
    /** @param  Closure(Request): Response  $next */
    public function handle(Request $request, Closure $next): Response
    {
        if (! Config::boolean('owner.enabled')) {
            throw new OwnerCabinetDisabled;
        }

        return $next($request);
    }
}
