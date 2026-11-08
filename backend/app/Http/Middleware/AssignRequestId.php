<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;

/**
 * Gives every request a correlation id: an inbound `X-Request-Id` is honoured when it is safe
 * to log, otherwise a ULID is generated. The id is shared with the log context and echoed back.
 */
final class AssignRequestId
{
    private const string SAFE_ID = '/^[A-Za-z0-9._-]{8,64}$/';

    public function handle(Request $request, Closure $next): Response
    {
        $inbound = (string) $request->headers->get('X-Request-Id', '');
        $id = preg_match(self::SAFE_ID, $inbound) === 1 ? $inbound : (string) Str::ulid();

        $request->attributes->set('request_id', $id);
        Log::shareContext(['request_id' => $id]);

        $response = $next($request);
        $response->headers->set('X-Request-Id', $id);

        return $response;
    }
}
