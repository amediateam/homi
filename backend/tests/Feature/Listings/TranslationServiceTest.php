<?php

use App\Enums\SourceDriver;
use App\Exceptions\Listings\TranslationNotNeeded;
use App\Exceptions\Listings\TranslationUnavailable;
use App\Exceptions\Sources\SourceNotFound;
use App\Models\User;
use App\Services\Listings\TranslationService;
use App\Services\Sources\SourceContext;
use Illuminate\Http\Exceptions\ThrottleRequestsException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Date;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Sleep;
use Laravel\Pennant\Feature;
use Tests\Support\LegacyFixtures;
use Tests\Support\LegacyListingsHttp;

/*
 * WP-43: `TranslationService` on the stub driver (the default of `source.listings.translation`) and across drivers —
 * the order of its steps, the cache key per driver, listing and locale, and the limit of misses.
 */

beforeEach(function (): void {
    Http::preventStrayRequests();
    Sleep::fake();
    Date::setTestNow('2026-11-27 09:00:00');
    config(['legacy.media.public_url' => LegacyFixtures::MEDIA, 'legacy.rate.per_second' => 1000]);
    $this->user = User::factory()->telegram()->create();
});

function translateFor(User $user, int $number, string $locale, ?string $scenario = null): string
{
    return app(TranslationService::class)->translate($user, $number, new SourceContext($locale, 'USD', $user, $scenario))->text;
}

it('refuses ru before it reads the cache, counts or asks a source', function (): void {
    expect(fn () => translateFor($this->user, 100001, 'ru'))->toThrow(TranslationNotNeeded::class)
        ->and(RateLimiter::attempts(TranslationService::limiterKey($this->user)))->toBe(0);
});

it('answers the stub\'s translation masked, cached under the stub driver for every user', function (): void {
    expect(translateFor($this->user, 100001, 'uz'))->toBe('Metro yaqinida yorugʻ kvartira. Qoʻngʻiroq qiling: +998 ** *** ** 67')
        ->and(Cache::get('stub:translation:100001:uz'))->toBe(['text' => 'Metro yaqinida yorugʻ kvartira. Qoʻngʻiroq qiling: +998 ** *** ** 67', 'locale' => 'uz'])
        ->and(TranslationService::key(SourceDriver::Legacy, 100001, 'uz'))->toBe('legacy:translation:100001:uz:header:Accept-Language');

    // Another user is served from the same entry, and uses none of his limit.
    $other = User::factory()->telegram()->create();
    expect(translateFor($other, 100001, 'uz'))->toContain('+998 ** *** ** 67')
        ->and(RateLimiter::attempts(TranslationService::limiterKey($other)))->toBe(0)
        ->and(RateLimiter::attempts(TranslationService::limiterKey($this->user)))->toBe(1);
});

it('never serves a translation cached under another driver', function (): void {
    translateFor($this->user, 100001, 'uz');

    LegacyListingsHttp::fake();
    Feature::globally()->activate('source.listings.translation', ['everyone' => 'legacy']);

    expect(translateFor($this->user, 100001, 'uz'))->toBe('Ijaraga 2 xonali kvartira, 54 m². Toza, shinam. Qoʻngʻiroq qiling: +998 ** *** ** 67')
        ->and(LegacyListingsHttp::sent('/api/listings/100001/translate'))->toHaveCount(1)
        ->and(RateLimiter::attempts(TranslationService::limiterKey($this->user)))->toBe(2);
});

it('counts a miss before the source answers, and caches no failure', function (string $scenario, string $failure): void {
    expect(fn () => translateFor($this->user, 100001, 'uz', $scenario))->toThrow($failure)
        ->and(RateLimiter::attempts(TranslationService::limiterKey($this->user)))->toBe(1)
        ->and(Cache::has('stub:translation:100001:uz'))->toBeFalse();
})->with([
    'unavailable' => ['translation_unavailable', TranslationUnavailable::class],
    'rate limited by the source' => ['rate_limited', ThrottleRequestsException::class],
]);

it('answers 404 for a listing the source does not know, after counting the miss', function (): void {
    expect(fn () => translateFor($this->user, 999404, 'en'))->toThrow(SourceNotFound::class)
        ->and(RateLimiter::attempts(TranslationService::limiterKey($this->user)))->toBe(1);
});

it('reads again an entry that no longer fits its data object, and stores the new one', function (mixed $entry): void {
    Cache::put('stub:translation:100001:en', $entry, 600);

    expect(translateFor($this->user, 100001, 'en'))->toBe('A bright flat near the metro. Call +998 ** *** ** 67')
        ->and(Cache::get('stub:translation:100001:en'))->toBe(['text' => 'A bright flat near the metro. Call +998 ** *** ** 67', 'locale' => 'en'])
        ->and(RateLimiter::attempts(TranslationService::limiterKey($this->user)))->toBe(1);
})->with([
    'a text of another type' => [['text' => 5, 'locale' => 'en']],
    'a string' => ['A bright flat'],
]);

it('masks an entry again when it is read, so an unmasked one never leaves', function (): void {
    Cache::put('stub:translation:100001:en', ['text' => 'Call +998001234567', 'locale' => 'en'], 600);

    expect(translateFor($this->user, 100001, 'en'))->toBe('Call +998 ** *** ** 67');
});

it('caches nothing when legacy.cache.translation is 0', function (): void {
    config(['legacy.cache.translation' => 0]);

    translateFor($this->user, 100001, 'uz');
    translateFor($this->user, 100001, 'uz');

    expect(Cache::has('stub:translation:100001:uz'))->toBeFalse()
        ->and(RateLimiter::attempts(TranslationService::limiterKey($this->user)))->toBe(2);
});

it('refuses the miss over rate_limits.translation.per_hour with Retry-After and no reason', function (): void {
    config(['rate_limits.translation.per_hour' => 2]);

    translateFor($this->user, 100001, 'uz');
    translateFor($this->user, 100012, 'uz');

    try {
        translateFor($this->user, 100013, 'uz');
        $this->fail('The third miss was not refused.');
    } catch (ThrottleRequestsException $refused) {
        expect($refused->getHeaders())->toBe(['Retry-After' => '3600'])
            ->and($refused->getStatusCode())->toBe(429);
    }

    // A refused miss is counted too (counted first, compared afterwards); a hit is not.
    expect(RateLimiter::attempts(TranslationService::limiterKey($this->user)))->toBe(3)
        ->and(translateFor($this->user, 100012, 'uz'))->toBeString()
        ->and(RateLimiter::attempts(TranslationService::limiterKey($this->user)))->toBe(3);
});

it('answers a stub scenario on the stub driver every time, past the cache, and caches nothing for it', function (): void {
    translateFor($this->user, 100001, 'uz');

    expect(fn () => translateFor($this->user, 100001, 'uz', 'translation_unavailable'))->toThrow(TranslationUnavailable::class);

    Cache::forget('stub:translation:100001:uz');
    translateFor($this->user, 100001, 'uz', 'some_scenario');
    expect(Cache::has('stub:translation:100001:uz'))->toBeFalse()
        ->and(RateLimiter::attempts(TranslationService::limiterKey($this->user)))->toBe(3);
});

it('keeps the cache of the legacy driver whatever scenario a request names', function (): void {
    LegacyListingsHttp::fake();
    Feature::globally()->activate('source.listings.translation', ['everyone' => 'legacy']);

    translateFor($this->user, 100001, 'uz', 'translation_unavailable');
    translateFor($this->user, 100001, 'uz', 'translation_unavailable');

    expect(LegacyListingsHttp::sent('/api/listings/100001/translate'))->toHaveCount(1)
        ->and(Cache::has('legacy:translation:100001:uz:header:Accept-Language'))->toBeTrue();
});
