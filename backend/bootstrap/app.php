<?php

use App\Http\ApiExceptionRenderer;
use App\Http\Middleware\AnswerNativeStubs;
use App\Http\Middleware\AssignRequestId;
use App\Http\Middleware\EnsureOwnerCabinetEnabled;
use App\Http\Middleware\EnsureRadarsEnabled;
use App\Http\Middleware\HandleInertiaRequests;
use App\Http\Middleware\SetRequestLocale;
use Illuminate\Auth\Middleware\Authorize;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Middleware\AddLinkHeadersForPreloadedAssets;
use Illuminate\Http\Request;
use Illuminate\Routing\Middleware\SubstituteBindings;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Support\Facades\Route;
use Laravel\Sanctum\Http\Middleware\CheckAbilities;
use Laravel\Sanctum\Http\Middleware\CheckForAnyAbility;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        channels: __DIR__.'/../routes/channels.php',
        health: '/up',
        then: function (): void {
            // Third-party webhooks served by the hook.* vhost (master prompt §8); no session, no CSRF.
            Route::middleware('hooks')->group(__DIR__.'/../routes/hooks.php');
        },
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->prepend(AssignRequestId::class);

        $middleware->web(append: [
            HandleInertiaRequests::class,
            AddLinkHeadersForPreloadedAssets::class,
        ]);

        $middleware->group('hooks', [
            ThrottleRequests::class.':telegram-webhook',
            SubstituteBindings::class,
        ]);

        $middleware->alias([
            'abilities' => CheckAbilities::class,
            'ability' => CheckForAnyAbility::class,
        ]);

        // The framework sorts only the middleware of its priority list. These follow the end of its list (after
        // authentication, the limiters and route model binding) in this order, each after the one before: the request
        // locale, then the route's own checks, and the stub answer of `SOURCES_NATIVE_STUBS` always last (WP-40).
        $middleware->appendToPriorityList(Authorize::class, SetRequestLocale::class);
        $middleware->appendToPriorityList(SetRequestLocale::class, CheckForAnyAbility::class);
        $middleware->appendToPriorityList(CheckForAnyAbility::class, CheckAbilities::class);
        $middleware->appendToPriorityList(CheckAbilities::class, EnsureRadarsEnabled::class);
        $middleware->appendToPriorityList(EnsureRadarsEnabled::class, EnsureOwnerCabinetEnabled::class);
        $middleware->appendToPriorityList(EnsureOwnerCabinetEnabled::class, AnswerNativeStubs::class);

        // api/* has no login route. The framework default calls route('login') while building
        // AuthenticationException, so a guest request that does not expect JSON becomes a 500.
        $middleware->redirectGuestsTo(
            fn (Request $request): ?string => $request->is('api/*') ? null : route('login'),
        );
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->is('telegram/*') || $request->expectsJson(),
        );

        $exceptions->render(fn (Throwable $e, Request $request) => ApiExceptionRenderer::render($e, $request));
    })->create();
