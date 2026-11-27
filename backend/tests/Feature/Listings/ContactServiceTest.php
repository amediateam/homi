<?php

use App\Events\Listings\ContactDisclosed;
use App\Exceptions\Listings\ContactUnavailable;
use App\Exceptions\Sources\SourceNotFound;
use App\Exceptions\Sources\SourceUnavailable;
use App\Models\User;
use App\Services\Listings\CallLinkService;
use App\Services\Listings\ContactDisclosure;
use App\Services\Listings\ContactService;
use App\Services\Sources\SourceContext;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Date;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Sleep;
use Laravel\Pennant\Feature;
use Tests\Support\LegacyFixtures;
use Tests\Support\LegacyListingsHttp;

/*
 * WP-43: `ContactService::disclose()` on the stub driver (the default of the tests) and on the legacy fixtures: the
 * source's contact, the quota, HOMI's call link of variant A, the record and `ContactDisclosed`, in that order.
 */

beforeEach(function (): void {
    Http::preventStrayRequests();
    Sleep::fake();
    Date::setTestNow('2026-11-27 09:00:00');
    Event::fake([ContactDisclosed::class]);
    config(['contacts.soft_limit' => 3, 'contacts.hard_limit' => 5, 'legacy.rate.per_second' => 1000, 'legacy.media.public_url' => LegacyFixtures::MEDIA]);
});

function contacts(): ContactService
{
    return app(ContactService::class);
}

function contextOf(User $user, string $locale = 'ru'): SourceContext
{
    return new SourceContext($locale, 'USD', $user);
}

it('answers variant A with the source\'s number and HOMI\'s call link in the context\'s language', function (): void {
    $user = User::factory()->create();

    $contact = contacts()->disclose($user, 100001, contextOf($user, 'uz'), ContactService::APP);
    $token = substr($contact->callUrl, strrpos($contact->callUrl, '/') + 1);

    expect($contact->phone)->toBe('+998000000067')
        ->and($contact->phoneDisplay)->toBe('+998 00 000-00-67')
        ->and($contact->callUrl)->toStartWith(CallLinkService::base().'/call/')
        ->and($contact->callUrl)->not->toContain('stub-token')
        ->and($contact->callUrl)->not->toContain('000000067')
        ->and($contact->expiresAt)->toBe('2026-11-27T09:10:00+00:00')
        ->and(app(CallLinkService::class)->verify($token))->toMatchArray(['number' => 100001, 'userId' => $user->id, 'locale' => 'uz']);
    Event::assertDispatchedTimes(ContactDisclosed::class, 1);
    Event::assertDispatched(ContactDisclosed::class, fn (ContactDisclosed $event): bool => [$event->userId, $event->number, $event->channel] === [$user->id, 100001, 'app']);
});

it('answers variant B with the source\'s link and no number', function (): void {
    LegacyListingsHttp::fake();
    Feature::globally()->activate('source.listings.contact', ['everyone' => 'legacy']);
    $user = User::factory()->create();

    $contact = contacts()->disclose($user, 100002, contextOf($user), ContactService::BOT);

    expect($contact->phone)->toBeNull()
        ->and($contact->phoneDisplay)->toBeNull()
        ->and($contact->callUrl)->toBe(LegacyListingsHttp::BASE.'/call/fixture-call-token?e=1795132800')
        ->and($contact->expiresAt)->toBe('2026-11-27T09:10:00+00:00')
        ->and(LegacyListingsHttp::sent('/api/listings/100002/call'))->toHaveCount(1);
    Event::assertDispatched(ContactDisclosed::class, fn (ContactDisclosed $event): bool => [$event->userId, $event->number, $event->channel] === [$user->id, 100002, 'bot']);
});

it('counts the bot and the Mini App in one quota', function (): void {
    $user = User::factory()->create();

    contacts()->disclose($user, 100001, contextOf($user), ContactService::BOT);
    contacts()->disclose($user, 100002, contextOf($user), ContactService::APP);
    contacts()->disclose($user, 100003, contextOf($user), ContactService::BOT);

    expect(fn () => contacts()->disclose($user, 100004, contextOf($user), ContactService::APP))->toThrow(ContactUnavailable::class)
        ->and(fn () => contacts()->disclose($user, 100005, contextOf($user), ContactService::BOT))->toThrow(ContactUnavailable::class)
        ->and(contacts()->disclose($user, 100001, contextOf($user), ContactService::APP)->phone)->toBe('+998000000067');
    Event::assertDispatchedTimes(ContactDisclosed::class, 4);
});

it('asks the quota nothing and dispatches nothing when the source has no contact or does not know the listing', function (int $number, string $failure): void {
    $user = User::factory()->create();

    expect(fn () => contacts()->disclose($user, $number, contextOf($user), ContactService::APP))->toThrow($failure)
        ->and(Cache::has(ContactDisclosure::key($user)))->toBeFalse();
    Event::assertNotDispatched(ContactDisclosed::class);
})->with([
    'no phone (withdrawn)' => [100015, ContactUnavailable::class],
    'a chat link without a phone' => [100018, ContactUnavailable::class],
    'no contact at all' => [100020, ContactUnavailable::class],
    'unknown' => [999404, SourceNotFound::class],
    'source unavailable' => [999503, SourceUnavailable::class],
]);

it('dispatches nothing for a request the quota refuses', function (): void {
    config(['contacts.soft_limit' => 1]);
    $user = User::factory()->create();
    contacts()->disclose($user, 100001, contextOf($user), ContactService::APP);

    expect(fn () => contacts()->disclose($user, 100002, contextOf($user), ContactService::APP))->toThrow(ContactUnavailable::class);
    Event::assertDispatchedTimes(ContactDisclosed::class, 1);
});

it('answers 503 and dispatches nothing when HOMI cannot sign a link outside local and testing', function (): void {
    config(['contacts.call_link_signing_key' => '']);
    $this->app->instance('env', 'production');
    $user = User::factory()->create();

    try {
        expect(fn () => contacts()->disclose($user, 100001, contextOf($user), ContactService::APP))->toThrow(SourceUnavailable::class);
    } finally {
        $this->app->instance('env', 'testing');
    }

    Event::assertNotDispatched(ContactDisclosed::class);
});

it('refuses an unknown channel', function (): void {
    $user = User::factory()->create();

    expect(fn () => contacts()->disclose($user, 100001, contextOf($user), 'web'))->toThrow(InvalidArgumentException::class);
    Event::assertNotDispatched(ContactDisclosed::class);
});
