<?php

namespace App\Http\Middleware;

use App\Exceptions\AccessDenied;
use App\Models\User;
use App\Services\Access\AccessGate;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * The access gate on the bearer routes of `/api/v1` (WP-40, alias `access`): a signed-in HOMI user whom the gate
 * refuses gets `403 access_denied` with the reason. Sorted after authentication and before the token abilities
 * (`bootstrap/app.php`), so a refused user hears the gate's reason on every route. `access:lenient` (only on
 * `POST /events`) refuses only a block and the pause, so the no-access screen can still send its events. An actor that
 * is not a `User` (a collector's `Source` token on the media routes) is not the gate's business and passes.
 */
class EnsureAccessGranted
{
    public const string LENIENT = 'lenient';

    public function __construct(private readonly AccessGate $gate) {}

    /**
     * @param  Closure(Request): Response  $next
     *
     * @throws AccessDenied
     */
    public function handle(Request $request, Closure $next, ?string $mode = null): Response
    {
        $user = $request->user();

        if (! $user instanceof User) {
            return $next($request);
        }

        $decision = $this->gate->decide($user);
        $refusal = $decision->refusal();

        if ($refusal === null || ($mode === self::LENIENT && ! $decision->refusesEverything())) {
            return $next($request);
        }

        throw $refusal;
    }
}
