<?php

namespace App\Http\Middleware;

use App\Services\Sources\SourceContext;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * The language of an `/api/v1` answer (WP-11): the first supported `Accept-Language` tag (`ru`, `uz`, `en`; `uz-Latn`
 * and `uz_Latn` are `uz`), else `ru`. Sets the application locale and the `Content-Language` header, error answers
 * included.
 */
class SetRequestLocale
{
    public function handle(Request $request, Closure $next): Response
    {
        $locale = SourceContext::localeOf($request);
        app()->setLocale($locale);

        $response = $next($request);
        $response->headers->set('Content-Language', $locale);

        return $response;
    }
}
