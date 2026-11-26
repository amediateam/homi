<?php

namespace App\Http\Middleware;

use App\Exceptions\Listings\DailyLimitReached;
use App\Models\User;
use App\Services\Access\RateLimits;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\RateLimiter;
use Symfony\Component\HttpFoundation\Response;

/**
 * The daily cap on opening full listing cards (WP-40, DEC-59, alias `listing-opens`, on `GET /listings/{number}` beside
 * `throttle:v1-listing`): one user opens at most `rate_limits.listing_opens_per_day` different full cards in 24 hours
 * (DEC-104, DEC-107); the next one answers `429 rate_limited` with `reason: "daily"` and `Retry-After`, the seconds
 * until the count starts again (`DailyLimitReached`).
 *
 * - The preview (`preview=1`) is not counted and never refused here (DEC-105).
 * - A card this user opened inside the 24 hours opens again for free, also after the cap (favourites, Back, «Повторить»):
 *   each counted card leaves a marker for 24 hours.
 * - Only an answered card counts: the counter moves after a `200`, so a `404`, a refusal or an error costs nothing.
 * - Counted per user, never per address; an actor that is not a `User` passes.
 *
 * The count is a window that starts at the first counted card and lasts 24 hours (the legacy texts say "in the past
 * 24 hours", not the calendar day). Sorted after the access gate and the route's checks, before the stub answer
 * (`bootstrap/app.php`).
 */
class CountListingOpens
{
    public const int WINDOW_SECONDS = 86_400;

    /**
     * @param  Closure(Request): Response  $next
     *
     * @throws DailyLimitReached
     */
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        $number = $request->route('number');

        if (! $user instanceof User || ! is_string($number) || $request->boolean('preview')) {
            return $next($request);
        }

        $marker = 'listing-opens:user:'.$user->id.':'.(int) $number;

        if (Cache::has($marker)) {
            return $next($request);
        }

        $counter = 'listing-opens:user:'.$user->id;

        if (RateLimiter::tooManyAttempts($counter, RateLimits::value('listing_opens_per_day'))) {
            throw new DailyLimitReached(max(1, RateLimiter::availableIn($counter)));
        }

        $response = $next($request);

        if ($response->getStatusCode() === Response::HTTP_OK && Cache::add($marker, true, self::WINDOW_SECONDS)) {
            RateLimiter::hit($counter, self::WINDOW_SECONDS);
        }

        return $response;
    }
}
