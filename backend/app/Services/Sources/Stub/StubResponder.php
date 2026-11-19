<?php

namespace App\Services\Sources\Stub;

use App\Enums\AccessReason;
use App\Exceptions\AccessDenied;
use App\Services\Sources\SourceContext;
use Closure;
use Illuminate\Http\Request;
use Throwable;

/**
 * The stub answers of the native-only methods (WP-11): sign-in, me, settings, events, and later the personal lists
 * and radars of WP-13. They have no source feature; they answer with `SourceDriver::Stub` until stage C replaces the
 * controller body (WP-40 keeps these bodies in its `NativeStubs` map).
 *
 * The scenario header picks another fixture of the method or one of its errors. Besides the four reserved scenarios
 * of WP-10, every method knows `access_private`, `access_invite`, `access_full`, `access_blocked`, `access_join` and
 * `access_paused`, the refusals of the access gate (one per `AccessReason`). A scenario that is neither is ignored.
 */
final class StubResponder
{
    public function __construct(private readonly FixtureStore $fixtures) {}

    /**
     * @param  array<string, string>  $scenarios  scenario => fixture name
     * @param  array<string, Closure(): Throwable>  $errors  scenario => the error of this method
     * @return array<array-key, mixed>
     */
    public function fixture(string $name, Request $request, array $scenarios = [], array $errors = []): array
    {
        return $this->fixtures->pick($this->check($request, $errors), $name, $scenarios);
    }

    /**
     * Throws the error of the request's scenario, if it names one, and returns the context; for a method without a
     * fixture, such as `POST /events`.
     *
     * @param  array<string, Closure(): Throwable>  $errors  scenario => the error of this method
     */
    public function check(Request $request, array $errors = []): SourceContext
    {
        $context = SourceContext::fromRequest($request);
        $this->fixtures->failForReserved($context);
        $scenario = $context->scenario;

        if ($scenario !== null && isset($errors[$scenario])) {
            throw $errors[$scenario]();
        }

        if ($scenario !== null && str_starts_with($scenario, 'access_')) {
            $reason = AccessReason::tryFrom(substr($scenario, strlen('access_')));

            if ($reason !== null) {
                throw new AccessDenied($reason);
            }
        }

        return $context;
    }
}
