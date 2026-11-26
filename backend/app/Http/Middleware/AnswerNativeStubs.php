<?php

namespace App\Http\Middleware;

use App\Services\Sources\SourceConfig;
use App\Services\Sources\Stub\NativeStubs;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Routing\Route;
use Symfony\Component\HttpFoundation\Response;

/**
 * Stub mode of the native methods (WP-40, `25` §9): on the whole `/api/v1` group, and sorted after authentication,
 * the limiters and the route's own checks (`bootstrap/app.php`), so a stub answers only a request that the real route
 * would have let through to its controller. While `config('sources.native_stubs')` is on, a route named in
 * `NativeStubs` is answered by its stub body and never reaches the controller; otherwise the request goes on. The
 * switch is read on every request, so a test turns it on with `config(['sources.native_stubs' => true])`.
 */
class AnswerNativeStubs
{
    public function __construct(private readonly SourceConfig $config, private readonly NativeStubs $stubs) {}

    /** @param  Closure(Request): Response  $next */
    public function handle(Request $request, Closure $next): Response
    {
        $route = $request->route();
        $name = $route instanceof Route ? $route->getName() : null;

        if ($name !== null && $this->config->nativeStubs() && $this->stubs->answers($name)) {
            return $this->stubs->answer($name);
        }

        return $next($request);
    }
}
