<?php

namespace App\Services\Listings;

use App\Enums\SourceDriver;
use App\Exceptions\Listings\TranslationNotNeeded;
use App\Models\User;
use App\Services\Access\RateLimits;
use App\Services\Sources\Data\ListingTranslation;
use App\Services\Sources\Legacy\LegacyListingSource;
use App\Services\Sources\SourceContext;
use App\Services\Sources\SourceManager;
use Illuminate\Contracts\Cache\Repository;
use Illuminate\Http\Exceptions\ThrottleRequestsException;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\RateLimiter;
use InvalidArgumentException;

/**
 * The machine translation of a listing's original text (WP-43, API-010, BR-APP-034) behind `POST
 * /listings/{number}/translation`, on every driver of `source.listings.translation` (the stub included). In this order:
 *
 * 1. the locale `ru` is `422 translation_not_needed`: the originals are Russian and the client never asks;
 * 2. the cache `<driver>:translation:<number>:<locale>` — on the legacy driver
 *    `legacy:translation:<number>:<locale>:<via>[:<name>]`, the language selector legacy is asked with
 *    (`LegacyListingSource::translationSelector()`) — for `legacy.cache.translation` s (86 400; 0 disables it): a hit
 *    is free;
 * 3. a miss first passes the per-user limit `v1-translation` (`rate_limits.translation.per_hour`, 30 an hour; counted
 *    here, first and then compared, before the source is asked, so a failed or refused miss counts too and hits never
 *    do): over it `429 rate_limited` with `Retry-After` and no `reason`;
 * 4. the source's translation (`ListingSource::translation()`): `404 not_found` for an unknown listing or one without
 *    an original text, `503 translation_unavailable` when it cannot translate; legacy's pause stays `403 paused`;
 * 5. the answer is cached as the masked text (`ListingTranslation::fromArray()` masks it, DEC-52).
 *
 * The text lives only in that cache entry: it is never written to the database or a log line, and Telescope keeps
 * neither the entry nor the answer's `data.text` (`TelescopeServiceProvider`). Two concurrent first requests may both
 * ask the source; the second answer overwrites the first. A request with a stub scenario on the stub driver neither
 * reads nor writes the cache, so the scenario is answered every time (the limit still counts it). While
 * `sources.native_stubs` is on, the route's stub answers instead and nothing here runs (`NativeStubs`, WP-40).
 */
final readonly class TranslationService
{
    /** The named limit of a miss, counted per user (`v1-translation:user:<internal id>`). */
    public const string LIMITER = 'v1-translation';

    /** The window of the limit, in seconds. */
    private const int WINDOW_SECONDS = 3600;

    public function __construct(private SourceManager $sources, private Repository $cache) {}

    /**
     * The original text of the listing in the context's locale, cached. Fails with `TranslationNotNeeded`, a
     * `ThrottleRequestsException` (over the limit of misses), `SourceNotFound`, `TranslationUnavailable` or
     * `AccessDenied`; these are not `@throws` tags, which the OpenAPI export would read as answers of the method.
     */
    public function translate(User $user, int $number, SourceContext $context): ListingTranslation
    {
        if ($context->locale === 'ru') {
            throw new TranslationNotNeeded;
        }

        $resolved = $this->sources->listings('source.listings.translation', $context);
        $key = self::key($resolved->driver, $number, $context->locale);
        $cacheable = $resolved->driver !== SourceDriver::Stub || $context->scenario === null;
        $cached = $cacheable ? $this->cached($key) : null;

        if ($cached !== null) {
            return $cached;
        }

        $this->countMiss($user);
        $translation = $resolved->source->translation($number, $context);
        $seconds = Config::integer('legacy.cache.translation');

        if ($cacheable && $seconds > 0) {
            $this->cache->put($key, ['text' => $translation->text, 'locale' => $translation->locale], $seconds);
        }

        return $translation;
    }

    /**
     * The cache key of a listing's translation into a locale on a driver; on the legacy driver it also names how
     * legacy is told the language (`LegacyListingSource::translationSelector()`, read now), so an entry cached under
     * one setting is never served under another.
     */
    public static function key(SourceDriver $driver, int $number, string $locale): string
    {
        $key = "{$driver->value}:translation:{$number}:{$locale}";

        if ($driver !== SourceDriver::Legacy) {
            return $key;
        }

        $selector = LegacyListingSource::translationSelector();

        return $key.":{$selector['via']}".($selector['name'] === '' ? '' : ':'.rawurlencode($selector['name']));
    }

    /** The limiter key of the user's misses. */
    public static function limiterKey(User $user): string
    {
        return self::LIMITER.':user:'.$user->id;
    }

    /** The cached translation; an entry that no longer fits is dropped and read again. */
    private function cached(string $key): ?ListingTranslation
    {
        $entry = $this->cache->get($key);

        if (! is_array($entry)) {
            return null;
        }

        try {
            return ListingTranslation::fromArray($entry);
        } catch (InvalidArgumentException) {
            $this->cache->forget($key);

            return null;
        }
    }

    /**
     * Counts one miss of the user first, then refuses it with `429 rate_limited` and `Retry-After` when the count is
     * over the limit: one increment (atomic on Redis) decides, so two concurrent misses can never both take the last
     * place, and a refused miss counts too.
     *
     * @throws ThrottleRequestsException
     */
    private function countMiss(User $user): void
    {
        $key = self::limiterKey($user);

        if (RateLimiter::hit($key, self::WINDOW_SECONDS) > RateLimits::value('translation.per_hour')) {
            throw new ThrottleRequestsException('Too Many Attempts.', headers: ['Retry-After' => (string) max(1, RateLimiter::availableIn($key))]);
        }
    }
}
