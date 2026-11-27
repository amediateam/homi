<?php

use App\Enums\Access\AccessGrantState;
use App\Enums\Access\AdmittedVia;
use App\Events\Listings\ContactDisclosed;
use App\Events\Listings\ContactQuotaExceeded;
use App\Exceptions\Sources\SourceNotFound;
use App\Models\AccessGrant;
use App\Models\User;
use App\Services\Listings\CallLinkService;
use App\Services\Listings\ContactDisclosure;
use App\Services\Listings\ContactService;
use App\Services\Sources\Legacy\LegacyListingSource;
use App\Services\Sources\SourceContext;
use GuzzleHttp\Promise\PromiseInterface;
use Illuminate\Contracts\Encryption\DecryptException;
use Illuminate\Encryption\Encrypter;
use Illuminate\Http\Client\Factory;
use Illuminate\Http\Client\Request;
use Illuminate\Log\Events\MessageLogged;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Date;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Sleep;
use Illuminate\Testing\TestResponse;
use Laravel\Pennant\Feature;
use Laravel\Sanctum\Sanctum;
use Laravel\Telescope\Telescope;
use Laravel\Telescope\Watchers\RequestWatcher;
use Symfony\Component\HttpFoundation\Response;
use Tests\Support\ContractShapes;
use Tests\Support\FailingCacheStore;
use Tests\Support\JsonShape;
use Tests\Support\LegacyFixtures;
use Tests\Support\LegacyListingsHttp;

/*
 * WP-43: `POST /listings/{number}/contact` for real — the two variants on the legacy fixtures (`100001` has a phone
 * and a call link, `100002` only a call link, `100024` neither), the disclosure quota on the stub driver, and the
 * promise that no phone number or call token reaches a log line.
 */

beforeEach(function (): void {
    Http::preventStrayRequests();
    Sleep::fake();
    Date::setTestNow('2026-11-27 09:00:00');
    config(['legacy.media.public_url' => LegacyFixtures::MEDIA, 'legacy.rate.per_second' => 1000]);
    $this->user = User::factory()->telegram()->create();
    Sanctum::actingAs($this->user, ['app:read', 'app:write']);
});

/** The card and the contact through the legacy driver, on `LegacyListingsHttp`. */
function onLegacyContact(): void
{
    LegacyListingsHttp::fake();

    foreach (['card', 'contact'] as $method) {
        Feature::globally()->activate("source.listings.{$method}", ['everyone' => 'legacy']);
    }
}

function contactOf(int $number, array $headers = []): TestResponse
{
    return test()->postJson("/api/v1/listings/{$number}/contact", [], $headers);
}

/** The digit forms of the synthetic number of `listing.rent_apartment` (+998001234567). */
const RAW_PHONE_FORMS = ['+998001234567', '001234567', '00 123 45 67', '00 123-45-67', '123-45-67'];

/** @return list<array{level: string, message: string, context: array<array-key, mixed>}> */
function contactLogLines(callable $run): array
{
    $lines = new ArrayObject;
    Log::listen(function (MessageLogged $entry) use ($lines): void {
        $lines[] = ['level' => $entry->level, 'message' => $entry->message, 'context' => $entry->context];
    });
    $run();

    return array_values($lines->getArrayCopy());
}

it('variant A: the card says there is a number and holds none; the contact gives it with HOMI\'s call link', function (): void {
    onLegacyContact();
    Event::fake([ContactDisclosed::class]);

    $card = $this->getJson('/api/v1/listings/100001')->assertOk()->assertJsonPath('data.contact.has_phone', true);
    $serialised = (string) $card->getContent();

    foreach (RAW_PHONE_FORMS as $digits) {
        expect($serialised)->not->toContain($digits);
    }

    $first = contactOf(100001)->assertOk()->assertJsonPath('meta.source', 'legacy');
    JsonShape::assertSame(['success' => 'bool', 'data' => ContractShapes::CONTACT, 'meta' => ['source' => 'string']], JsonShape::of($first->json()));
    $first->assertJsonPath('data.phone', '+998001234567')
        ->assertJsonPath('data.phone_display', '+998 00 123-45-67')
        ->assertJsonPath('data.expires_at', '2026-11-27T09:10:00+00:00');

    $url = $first->json('data.call_url');
    $claims = app(CallLinkService::class)->verify(substr($url, strrpos($url, '/') + 1));
    expect($url)->toStartWith(rtrim(config('app.url'), '/').'/call/')
        ->and($url)->not->toContain('001234567')
        ->and([$claims?->number, $claims?->userId])->toBe([100001, $this->user->id]);

    $this->travel(5)->seconds();
    $second = contactOf(100001)->assertOk();

    expect($second->json('data.call_url'))->not->toBe($url)
        ->and($second->json('data.phone'))->toBe('+998001234567')
        ->and(LegacyListingsHttp::sent('/api/listings/100001'))->toHaveCount(1)
        ->and(LegacyListingsHttp::sent('/api/listings/100001/call'))->toBe([]);
    Event::assertDispatchedTimes(ContactDisclosed::class, 2);
    Event::assertDispatched(ContactDisclosed::class, fn (ContactDisclosed $event): bool => [$event->userId, $event->number, $event->channel] === [$this->user->id, 100001, 'app']);
});

it('variant A without a card read first reads the card once, then serves the cached contact until it expires', function (): void {
    onLegacyContact();

    contactOf(100001)->assertOk()->assertJsonPath('data.phone', '+998001234567');
    contactOf(100001)->assertOk();
    expect(LegacyListingsHttp::sent('/api/listings/100001'))->toHaveCount(1);

    $this->travel(61)->seconds();
    contactOf(100001)->assertOk()->assertJsonPath('data.phone', '+998001234567');
    expect(LegacyListingsHttp::sent('/api/listings/100001'))->toHaveCount(2);
});

it('keeps the contact entry encrypted: no digit of the number in the cache, unreadable without the application key', function (): void {
    onLegacyContact();
    $this->getJson('/api/v1/listings/100001')->assertOk();

    $sealed = Cache::get('legacy:v1:listings:contact:100001');
    $card = json_encode(Cache::get('legacy:v1:listings:card:100001:en:USD'), JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE);

    expect($sealed)->toBeString();
    foreach (RAW_PHONE_FORMS as $digits) {
        expect($sealed)->not->toContain($digits)
            ->and($card)->not->toContain($digits);
    }
    expect(json_decode(Crypt::decryptString($sealed), true))->toBe(['p' => '+998001234567', 'd' => '+998 00 123-45-67', 'l' => true])
        ->and(fn () => (new Encrypter(random_bytes(32), 'AES-256-CBC'))->decryptString($sealed))->toThrow(DecryptException::class);

    // A new application key: the entry cannot be read, so the card is read again — never a 500.
    $this->app->instance('encrypter', new Encrypter(random_bytes(32), 'AES-256-CBC'));
    Crypt::clearResolvedInstance('encrypter');

    contactOf(100001)->assertOk()->assertJsonPath('data.phone', '+998001234567');
    expect(LegacyListingsHttp::sent('/api/listings/100001'))->toHaveCount(2);
});

it('variant B: the card says there is a number; the contact asks legacy\'s call link once and gives no number', function (): void {
    onLegacyContact();
    Event::fake([ContactDisclosed::class]);

    $this->getJson('/api/v1/listings/100002')->assertOk()->assertJsonPath('data.contact.has_phone', true);

    contactOf(100002)->assertOk()
        ->assertJsonPath('meta.source', 'legacy')
        ->assertJsonPath('data.phone', null)
        ->assertJsonPath('data.phone_display', null)
        ->assertJsonPath('data.call_url', LegacyListingsHttp::BASE.'/call/fixture-call-token?e=1795132800')
        ->assertJsonPath('data.expires_at', '2026-11-27T09:10:00+00:00');

    expect(LegacyListingsHttp::sent('/api/listings/100002/call'))->toHaveCount(1)
        ->and(LegacyListingsHttp::sent('/api/listings/100002'))->toHaveCount(1);
    Event::assertDispatchedTimes(ContactDisclosed::class, 1);
});

it('variant B passes an absolute https link on and answers 503 for anything else legacy sends', function (mixed $url, int $status): void {
    onLegacyContact();
    LegacyListingsHttp::answer(fn (Request $request): ?PromiseInterface => str_ends_with(LegacyListingsHttp::path($request), '/call') ? Factory::response(['url' => $url]) : null);

    $response = contactOf(100002)->assertStatus($status);

    if ($status === 200) {
        $response->assertJsonPath('data.call_url', $url);
    } else {
        $response->assertJsonPath('code', 'source_unavailable');
    }
})->with([
    'absolute https on legacy\'s host' => ['https://legacy.test/call/abc?e=1795132800', 200],
    'legacy\'s host in capitals' => ['https://LEGACY.Test/call/abc', 200],
    'http' => ['http://kvadro.invalid/call/abc', 503],
    'protocol-relative' => ['//kvadro.invalid/call/abc', 503],
    'a script' => ['javascript:alert(1)', 503],
    'with a space' => ['/call/a b', 503],
    'a backslash after the host' => ['https://attacker.example\\@legacy.test/x', 503],
    'a backslash in a path' => ['/\\attacker.example/x', 503],
    'a user before legacy\'s host' => ['https://attacker.example@legacy.test/x', 503],
    'a user and a password' => ['https://u:p@legacy.test/x', 503],
    'empty' => ['', 503],
    'not a string' => [42, 503],
    'missing' => [null, 503],
    'too long' => ['/call/'.str_repeat('a', 2050), 503],
]);

it('variant B refuses a link to any host and port but legacy\'s and those of legacy.contact.link_hosts: 404, a warning that names a host name only', function (string $url, array $logged): void {
    onLegacyContact();
    Event::fake([ContactDisclosed::class]);
    LegacyListingsHttp::answer(fn (Request $request): ?PromiseInterface => str_ends_with(LegacyListingsHttp::path($request), '/call') ? Factory::response(['url' => $url]) : null);

    $lines = contactLogLines(fn () => contactOf(100002)->assertNotFound()->assertJsonPath('code', 'contact_unavailable'));
    $serialised = json_encode($lines, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    $warnings = array_values(array_filter($lines, fn (array $line): bool => $line['level'] === 'warning'));

    expect($warnings)->toHaveCount(1)
        ->and(array_diff_key($warnings[0]['context'], ['request_id' => true]))->toBe(['path' => '/api/listings/{n}/call', ...$logged])
        ->and($serialised)->not->toContain('/x/call')
        ->and($serialised)->not->toContain('t0ken-5f2a')
        ->and($serialised)->not->toContain('phone=')
        ->and($serialised)->not->toContain('https://')
        ->and($serialised)->not->toContain('901234567')
        ->and(strtolower($serialised))->not->toContain('secret');

    foreach (RAW_PHONE_FORMS as $digits) {
        expect($serialised)->not->toContain($digits);
    }

    Event::assertNotDispatched(ContactDisclosed::class);
})->with([
    'another host' => ['https://Attacker.Example/x/call/t0ken-5f2a?phone=998001234567', ['host' => 'attacker.example']],
    'a host ending in legacy\'s' => ['https://evillegacy.test/x/call/t0ken-5f2a?phone=998001234567', ['host' => 'evillegacy.test']],
    'a subdomain of legacy\'s host' => ['https://call.legacy.test/x/call/t0ken-5f2a#+998001234567', ['host' => 'call.legacy.test']],
    'legacy\'s host as a subdomain' => ['https://legacy.test.attacker.example/x/call/t0ken-5f2a', ['host' => 'legacy.test.attacker.example']],
    'legacy\'s host on another port' => ['https://legacy.test:8443/x/call/t0ken-5f2a', ['host' => 'legacy.test']],
    'legacy\'s host on port 0' => ['https://legacy.test:0/x/call/t0ken-5f2a', ['host' => 'legacy.test']],
    'legacy\'s host with a trailing dot: not a host name' => ['https://legacy.test./x/call/t0ken-5f2a', ['host_invalid' => true]],
    'a number as the host' => ['https://+998901234567/x', ['host_invalid' => true]],
    'an encoded path and query in the host' => ['https://evil.example%2f998901234567%3ft=SECRET/x', ['host_invalid' => true]],
    'a run of seven digits in a host name' => ['https://call-9012345.attacker.example/x', ['host_invalid' => true]],
]);

it('variant B warns of refused links whose host it does not name at most once a minute in all', function (): void {
    onLegacyContact();
    $url = 'https://+998901234567/x';
    LegacyListingsHttp::answer(function (Request $request) use (&$url): ?PromiseInterface {
        return str_ends_with(LegacyListingsHttp::path($request), '/call') ? Factory::response(['url' => $url]) : null;
    });

    $lines = contactLogLines(function () use (&$url): void {
        contactOf(100002)->assertNotFound();
        $url = 'https://+998911234567/x';
        contactOf(100002)->assertNotFound();
        $url = 'https://attacker.example/x';
        contactOf(100002)->assertNotFound();
        $this->travel(61)->seconds();
        $url = 'https://evil.example%2f1/x';
        contactOf(100002)->assertNotFound();
    });
    $logged = array_map(fn (array $line): array => array_diff_key($line['context'], ['request_id' => true, 'path' => true]), array_values(array_filter($lines, fn (array $line): bool => $line['level'] === 'warning')));

    expect($logged)->toBe([['host_invalid' => true], ['host' => 'attacker.example'], ['host_invalid' => true]]);
});

it('variant B pins the port: legacy\'s own (443 by default) or one a link_hosts entry names; a malformed entry allows nothing', function (string $base, array $linkHosts, string $url, int $status): void {
    onLegacyContact();
    $this->getJson('/api/v1/listings/100002')->assertOk();

    config(['legacy.base_url' => $base, 'legacy.contact.link_hosts' => $linkHosts]);
    Http::fake(['legacy.test:8443/*' => Http::response(['url' => $url])]);
    LegacyListingsHttp::answer(fn (Request $request): ?PromiseInterface => str_ends_with(LegacyListingsHttp::path($request), '/call') ? Factory::response(['url' => $url]) : null);

    contactOf(100002)->assertStatus($status);
})->with([
    'legacy\'s host on 443 named' => ['https://legacy.test', [], 'https://legacy.test:443/call/a', 200],
    'legacy\'s host on another port' => ['https://legacy.test', [], 'https://legacy.test:8443/call/a', 404],
    'legacy\'s host on port 0' => ['https://legacy.test', [], 'https://legacy.test:0/call/a', 404],
    'the base\'s own port' => ['https://legacy.test:8443', [], 'https://legacy.test:8443/call/a', 200],
    'the default port while the base names another' => ['https://legacy.test:8443', [], 'https://legacy.test/call/a', 404],
    'a link host with its port' => ['https://legacy.test', ['calls.kvadro.invalid:8443'], 'https://calls.kvadro.invalid:8443/call/a', 200],
    'a link host without the port its entry names' => ['https://legacy.test', ['calls.kvadro.invalid:8443'], 'https://calls.kvadro.invalid/call/a', 404],
    'a link host on a port its entry does not name' => ['https://legacy.test', ['calls.kvadro.invalid'], 'https://calls.kvadro.invalid:8443/call/a', 404],
    'a link host entry on port 0' => ['https://legacy.test', ['calls.kvadro.invalid:0'], 'https://calls.kvadro.invalid:0/call/a', 404],
    'a link host entry with a port out of range' => ['https://legacy.test', ['calls.kvadro.invalid:99999'], 'https://calls.kvadro.invalid/call/a', 404],
    'a link host entry with a path' => ['https://legacy.test', ['calls.kvadro.invalid/x'], 'https://calls.kvadro.invalid/call/a', 404],
]);

it('variant B warns of a refused link host at most once a minute per host', function (): void {
    onLegacyContact();
    $url = 'https://attacker.example/x/call/t0ken-5f2a';
    LegacyListingsHttp::answer(function (Request $request) use (&$url): ?PromiseInterface {
        return str_ends_with(LegacyListingsHttp::path($request), '/call') ? Factory::response(['url' => $url]) : null;
    });

    $lines = contactLogLines(function () use (&$url): void {
        contactOf(100002)->assertNotFound();
        contactOf(100002)->assertNotFound();
        $url = 'https://other.example/x/call/t0ken-5f2a';
        contactOf(100002)->assertNotFound();
        $this->travel(61)->seconds();
        contactOf(100002)->assertNotFound();
    });
    $hosts = array_map(fn (array $line): mixed => $line['context']['host'] ?? null, array_values(array_filter($lines, fn (array $line): bool => $line['level'] === 'warning')));

    expect($hosts)->toBe(['attacker.example', 'other.example', 'other.example']);
});

it('variant B passes a link to a host of legacy.contact.link_hosts, compared lower-cased and exactly', function (): void {
    onLegacyContact();
    config(['legacy.contact.link_hosts' => ['calls.kvadro.invalid']]);
    $url = 'https://Calls.Kvadro.Invalid/call/abc?e=1795132800';
    LegacyListingsHttp::answer(fn (Request $request): ?PromiseInterface => str_ends_with(LegacyListingsHttp::path($request), '/call') ? Factory::response(['url' => $url]) : null);

    contactOf(100002)->assertOk()->assertJsonPath('data.call_url', $url);

    LegacyListingsHttp::answer(fn (Request $request): ?PromiseInterface => str_ends_with(LegacyListingsHttp::path($request), '/call') ? Factory::response(['url' => 'https://kvadro.invalid/call/abc']) : null);
    contactOf(100002)->assertNotFound()->assertJsonPath('code', 'contact_unavailable');
});

it('variant B joins a relative link to the origin of legacy.base_url, never to its path', function (string $base, string $expected): void {
    onLegacyContact();
    $this->getJson('/api/v1/listings/100002')->assertOk();

    config(['legacy.base_url' => $base]);
    Http::fake(['legacy.test:8443/*' => Http::response(['url' => '/call/abc?e=1'])]);
    LegacyListingsHttp::answer(fn (Request $request): ?PromiseInterface => str_ends_with(LegacyListingsHttp::path($request), '/call') ? Factory::response(['url' => '/call/abc?e=1']) : null);

    contactOf(100002)->assertOk()->assertJsonPath('data.call_url', $expected);
})->with([
    'a path' => ['https://legacy.test/v2', 'https://legacy.test/call/abc?e=1'],
    'a port and a path' => ['https://legacy.test:8443/api/', 'https://legacy.test:8443/call/abc?e=1'],
]);

it('variant B answers legacy\'s phone_display only when it reads as one number', function (?string $display, ?string $answered): void {
    onLegacyContact();
    $card = array_replace(LegacyFixtures::golden('listing.link_only'), ['phone_display' => $display]);
    LegacyListingsHttp::answer(fn (Request $request): ?PromiseInterface => LegacyListingsHttp::path($request) === '/api/listings/100002' && LegacyListingsHttp::query($request) === '' ? Factory::response($card) : null);

    contactOf(100002)->assertOk()->assertJsonPath('data.phone', null)->assertJsonPath('data.phone_display', $answered);
})->with([
    'one number' => ['+998 90 123-45-67', '+998 90 123-45-67'],
    'hours with digits' => ['звонить с 9 до 18', null],
    'two numbers' => ['+998 90 123-45-67, +998 91 765-43-21', null],
    'a part of a number' => ['…45-67', null],
    'none' => [null, null],
]);

it('keeps no phone in the contact entry under the mode link, and still asks legacy\'s link for a card with only a phone', function (): void {
    config(['legacy.contact.mode' => 'link']);
    onLegacyContact();
    $card = array_replace(LegacyFixtures::golden('listing.rent_apartment'), ['call_url' => null]);
    LegacyListingsHttp::answer(fn (Request $request): ?PromiseInterface => LegacyListingsHttp::path($request) === '/api/listings/100001' && LegacyListingsHttp::query($request) === '' ? Factory::response($card) : null);

    $this->getJson('/api/v1/listings/100001')->assertOk()->assertJsonPath('data.contact.has_phone', true);

    expect(json_decode(Crypt::decryptString(Cache::get('legacy:v1:listings:contact:100001')), true))->toBe(['p' => null, 'd' => '+998 00 123-45-67', 'l' => true]);
    contactOf(100001)->assertOk()->assertJsonPath('data.phone', null)->assertJsonPath('data.call_url', LegacyListingsHttp::BASE.'/call/fixture-call-token?e=1795132800');
    expect(LegacyListingsHttp::sent('/api/listings/100001/call'))->toHaveCount(1);
});

it('asks the quota before legacy\'s call link: a refused request costs no call request', function (): void {
    onLegacyContact();
    config(['contacts.soft_limit' => 1, 'contacts.hard_limit' => null]);

    contactOf(100001)->assertOk();
    contactOf(100002)->assertNotFound()->assertJsonPath('code', 'contact_unavailable');

    expect(LegacyListingsHttp::sent('/api/listings/100002/call'))->toBe([])
        ->and(LegacyListingsHttp::sent('/api/listings/100002'))->toHaveCount(1);
});

it('answers a listing legacy has withdrawn 404 contact_unavailable at once, though its contact entry was fresh', function (): void {
    onLegacyContact();
    Event::fake([ContactDisclosed::class]);

    $this->getJson('/api/v1/listings/100001', ['Accept-Language' => 'ru'])->assertOk();
    $this->travel(30)->seconds();
    $this->getJson('/api/v1/listings/100001', ['Accept-Language' => 'en'])->assertOk();
    $this->travel(31)->seconds();
    LegacyListingsHttp::answer(fn (Request $request): ?PromiseInterface => LegacyListingsHttp::path($request) === '/api/listings/100001' ? Factory::response(['detail' => 'Not found.'], 404) : null);
    $this->getJson('/api/v1/listings/100001', ['Accept-Language' => 'ru'])->assertNotFound();

    contactOf(100001, ['Accept-Language' => 'ru'])->assertNotFound()->assertJsonPath('code', 'contact_unavailable');
    expect(LegacyListingsHttp::sent('/api/listings/100001'))->toHaveCount(3);
    Event::assertNotDispatched(ContactDisclosed::class);
});

it('forgets the contact entry of a listing legacy has withdrawn, also when gone numbers are not remembered', function (): void {
    config(['legacy.cache.not_found' => 0]);
    onLegacyContact();

    $this->getJson('/api/v1/listings/100001', ['Accept-Language' => 'ru'])->assertOk();
    $this->travel(30)->seconds();
    $this->getJson('/api/v1/listings/100001', ['Accept-Language' => 'en'])->assertOk();
    $this->travel(31)->seconds();
    LegacyListingsHttp::answer(fn (Request $request): ?PromiseInterface => LegacyListingsHttp::path($request) === '/api/listings/100001' ? Factory::response(['detail' => 'Not found.'], 404) : null);
    $this->getJson('/api/v1/listings/100001', ['Accept-Language' => 'ru'])->assertNotFound();

    expect(Cache::has('legacy:v1:listings:contact:100001'))->toBeFalse();
    contactOf(100001, ['Accept-Language' => 'ru'])->assertNotFound()->assertJsonPath('code', 'contact_unavailable');
    expect(LegacyListingsHttp::sent('/api/listings/100001'))->toHaveCount(3);
});

it('lets no card read in flight during a 404 file a usable contact, also when gone numbers are not remembered', function (): void {
    config(['legacy.cache.not_found' => 0]);
    onLegacyContact();
    $phase = 'in flight';
    LegacyListingsHttp::answer(function (Request $request) use (&$phase): ?PromiseInterface {
        if (LegacyListingsHttp::path($request) !== '/api/listings/100001') {
            return null;
        }

        if ($phase === 'in flight') {
            // While the English read waits for legacy, a Russian one is answered 404; then the English one gets the card.
            $phase = 'withdrawn';
            expect(fn () => app(LegacyListingSource::class)->details(100001, new SourceContext('ru', 'USD')))->toThrow(SourceNotFound::class);

            return null;
        }

        return Factory::response(['detail' => 'Not found.'], 404);
    });

    app(LegacyListingSource::class)->details(100001, new SourceContext('en', 'USD'));

    expect($phase)->toBe('withdrawn')
        ->and(Cache::has('legacy:v1:listings:contact:100001'))->toBeFalse();
    contactOf(100001)->assertNotFound()->assertJsonPath('code', 'contact_unavailable');
    expect(LegacyListingsHttp::sent('/api/listings/100001'))->toHaveCount(2);
});

it('files a merged duplicate\'s contact once, under the surviving number, and only a pointer to it under the asked one', function (): void {
    onLegacyContact();

    $this->getJson('/api/v1/listings/100016')->assertOk()->assertJsonPath('data.number', 100001);

    expect(json_decode(Crypt::decryptString(Cache::get('legacy:v1:listings:contact:100016')), true))->toBe(['m' => 100001])
        ->and(json_decode(Crypt::decryptString(Cache::get('legacy:v1:listings:contact:100001')), true))->toHaveKey('p', '+998000000067');
    contactOf(100016)->assertOk()->assertJsonPath('data.phone', '+998000000067');
    contactOf(100001)->assertOk()->assertJsonPath('data.phone', '+998000000067');
    expect(LegacyListingsHttp::sent('/api/listings/100016'))->toHaveCount(1)
        ->and(LegacyListingsHttp::sent('/api/listings/100001'))->toBe([]);
});

it('answers a merged duplicate whose survivor legacy has withdrawn 404 contact_unavailable, without a legacy call', function (int $notFound): void {
    config(['legacy.cache.not_found' => $notFound]);
    onLegacyContact();
    Event::fake([ContactDisclosed::class]);
    $withdrawn = false;
    LegacyListingsHttp::answer(function (Request $request) use (&$withdrawn): ?PromiseInterface {
        return $withdrawn && preg_match('#^/api/listings/(100016|100001)(/|$)#', LegacyListingsHttp::path($request)) === 1 ? Factory::response(['detail' => 'Not found.'], 404) : null;
    });

    $this->getJson('/api/v1/listings/100016')->assertOk()->assertJsonPath('data.number', 100001);
    $withdrawn = true;
    $this->getJson('/api/v1/listings/100001', ['Accept-Language' => 'en'])->assertNotFound();
    $sent = count(Http::recorded());

    contactOf(100016)->assertNotFound()->assertJsonPath('code', 'contact_unavailable');
    expect(count(Http::recorded()))->toBe($sent);
    Event::assertNotDispatched(ContactDisclosed::class);

    // The asked number withdrawn too: still no number, whatever its card read says.
    contactOf(100001)->assertNotFound()->assertJsonPath('code', 'contact_unavailable');
    expect(count(Http::recorded()))->toBe($sent);
})->with(['gone numbers remembered' => [60], 'gone numbers not remembered' => [0]]);

it('gives no contact through the card of a duplicate legacy still answers once its survivor is withdrawn', function (int $notFound): void {
    config(['legacy.cache.not_found' => $notFound]);
    onLegacyContact();
    Event::fake([ContactDisclosed::class]);
    LegacyListingsHttp::answer(fn (Request $request): ?PromiseInterface => LegacyListingsHttp::path($request) === '/api/listings/100001' ? Factory::response(['detail' => 'Not found.'], 404) : null);

    $this->getJson('/api/v1/listings/100001')->assertNotFound();

    // The duplicate was never read: no pointer; legacy still answers its card with the survivor's number.
    contactOf(100016)->assertNotFound()->assertJsonPath('code', 'contact_unavailable');
    expect(LegacyListingsHttp::sent('/api/listings/100016'))->toHaveCount(1)
        ->and(Cache::has('legacy:v1:listings:contact:100016'))->toBeFalse()
        ->and(Cache::has('legacy:v1:listings:contact:100001'))->toBeFalse();
    Event::assertNotDispatched(ContactDisclosed::class);
})->with(['gone numbers remembered' => [60], 'gone numbers not remembered' => [0]]);

it('files nothing from the card of a duplicate legacy answers again while it is withdrawn, and gives no contact for it', function (): void {
    config(['legacy.cache.not_found' => 0]);
    onLegacyContact();
    $withdrawn = true;
    LegacyListingsHttp::answer(function (Request $request) use (&$withdrawn): ?PromiseInterface {
        return $withdrawn && LegacyListingsHttp::path($request) === '/api/listings/100016' ? Factory::response(['detail' => 'Not found.'], 404) : null;
    });

    $this->getJson('/api/v1/listings/100016')->assertNotFound();
    $withdrawn = false;
    $this->getJson('/api/v1/listings/100016')->assertOk()->assertJsonPath('data.number', 100001);

    expect(Cache::has('legacy:v1:listings:contact:100016'))->toBeFalse()
        ->and(Cache::has('legacy:v1:listings:contact:100001'))->toBeFalse();
    contactOf(100016)->assertNotFound()->assertJsonPath('code', 'contact_unavailable');
});

it('discloses a listing legacy answers again once its withdrawal has passed', function (): void {
    config(['legacy.cache.not_found' => 0]);
    onLegacyContact();
    $withdrawn = true;
    LegacyListingsHttp::answer(function (Request $request) use (&$withdrawn): ?PromiseInterface {
        return $withdrawn && LegacyListingsHttp::path($request) === '/api/listings/100001' ? Factory::response(['detail' => 'Not found.'], 404) : null;
    });

    $this->getJson('/api/v1/listings/100001')->assertNotFound();
    $withdrawn = false;
    contactOf(100001)->assertNotFound()->assertJsonPath('code', 'contact_unavailable');

    // Withdrawn for `legacy.cache.card` (60 s) and one read with every attempt (47 s with the defaults).
    $this->travel(106)->seconds();
    contactOf(100001)->assertNotFound()->assertJsonPath('code', 'contact_unavailable');
    expect(LegacyListingsHttp::sent('/api/listings/100001'))->toHaveCount(1);

    $this->travel(2)->seconds();
    contactOf(100001)->assertOk()->assertJsonPath('data.phone', '+998001234567');
});

it('variant B answers 503 when legacy fails and 404 contact_unavailable when legacy has no link, dispatching nothing', function (int $legacyStatus, int $status, string $code): void {
    onLegacyContact();
    Event::fake([ContactDisclosed::class]);
    LegacyListingsHttp::answer(fn (Request $request): ?PromiseInterface => str_ends_with(LegacyListingsHttp::path($request), '/call') ? Factory::response(['detail' => 'x'], $legacyStatus) : null);

    contactOf(100002)->assertStatus($status)->assertJsonPath('code', $code);
    Event::assertNotDispatched(ContactDisclosed::class);
})->with([
    'server error' => [500, 503, 'source_unavailable'],
    'not found' => [404, 404, 'contact_unavailable'],
]);

it('says there is no number and refuses the contact for a card with neither a phone nor a call link', function (): void {
    onLegacyContact();

    $this->getJson('/api/v1/listings/100024')->assertOk()->assertJsonPath('data.contact.has_phone', false);
    contactOf(100024)->assertNotFound()->assertJsonPath('code', 'contact_unavailable');

    expect(LegacyListingsHttp::sent('/api/listings/100024/call'))->toBe([]);
});

it('decides the variant per card under the configured mode', function (string $mode, int $number, bool $hasPhone, ?string $phone, bool $asksLink): void {
    config(['legacy.contact.mode' => $mode]);
    onLegacyContact();

    $this->getJson("/api/v1/listings/{$number}")->assertOk()->assertJsonPath('data.contact.has_phone', $hasPhone);
    $contact = contactOf($number);

    if ($hasPhone) {
        $contact->assertOk()->assertJsonPath('data.phone', $phone);
    } else {
        $contact->assertNotFound()->assertJsonPath('code', 'contact_unavailable');
    }

    expect(LegacyListingsHttp::sent("/api/listings/{$number}/call"))->toHaveCount($asksLink ? 1 : 0);
})->with([
    'auto, a phone' => ['auto', 100001, true, '+998001234567', false],
    'auto, a link' => ['auto', 100002, true, null, true],
    'phone, a phone' => ['phone', 100001, true, '+998001234567', false],
    'phone, only a link' => ['phone', 100002, false, null, false],
    'link, a phone' => ['link', 100001, true, null, true],
    'link, a link' => ['link', 100002, true, null, true],
]);

it('refuses past the soft limit, flags once past the hard one, and counts a listing answered again once (stub driver)', function (): void {
    config(['contacts.soft_limit' => 3, 'contacts.hard_limit' => 5]);
    Event::fake([ContactDisclosed::class, ContactQuotaExceeded::class]);
    AccessGrant::query()->create(['user_id' => $this->user->id, 'state' => AccessGrantState::Admitted, 'admitted_via' => AdmittedVia::Invite]);

    foreach ([100001, 100002, 100003] as $number) {
        contactOf($number)->assertOk()->assertJsonPath('data.phone', sprintf('+998000000%03d', $number === 100001 ? 67 : $number - 100000));
    }

    contactOf(100004)->assertNotFound()->assertJsonPath('code', 'contact_unavailable');
    contactOf(100005)->assertNotFound();
    expect(AccessGrant::query()->sole()->flagged_at)->toBeNull();

    contactOf(100006)->assertNotFound()->assertJsonPath('code', 'contact_unavailable');
    expect(AccessGrant::query()->sole()->only(['state', 'admitted_via', 'flag_reason']))->toBe(['state' => AccessGrantState::Admitted, 'admitted_via' => AdmittedVia::Invite, 'flag_reason' => 'contact_quota']);
    Event::assertDispatchedTimes(ContactQuotaExceeded::class, 1);

    contactOf(100001)->assertOk()->assertJsonPath('data.phone', '+998000000067');
    contactOf(100007)->assertNotFound();
    Event::assertDispatchedTimes(ContactQuotaExceeded::class, 1);
    Event::assertDispatchedTimes(ContactDisclosed::class, 4);

    expect(array_keys(Cache::get(ContactDisclosure::key($this->user))['n']))->toBe([100001, 100002, 100003, 100004, 100005, 100006, 100007]);
});

it('counts nothing for reading cards: ten cards, then three numbers', function (): void {
    config(['contacts.soft_limit' => 3, 'contacts.hard_limit' => 5]);

    foreach (range(100001, 100010) as $number) {
        $this->getJson("/api/v1/listings/{$number}")->assertOk();
        $this->getJson("/api/v1/listings/{$number}?preview=1")->assertOk();
    }

    expect(Cache::has(ContactDisclosure::key($this->user)))->toBeFalse();

    foreach ([100008, 100009, 100010] as $number) {
        contactOf($number)->assertOk();
    }
});

it('shares one counter between the bot and the Mini App', function (): void {
    config(['contacts.soft_limit' => 2, 'contacts.hard_limit' => null]);
    $context = new SourceContext('ru', 'USD', $this->user);

    app(ContactService::class)->disclose($this->user, 100001, $context, ContactService::BOT);
    contactOf(100002)->assertOk();
    contactOf(100003)->assertNotFound()->assertJsonPath('code', 'contact_unavailable');
    contactOf(100001)->assertOk();
});

it('refuses nothing while both limits are blank', function (): void {
    config(['contacts.soft_limit' => null, 'contacts.hard_limit' => null]);

    foreach (range(100001, 100012) as $number) {
        contactOf($number)->assertOk();
    }
});

it('answers contact_unavailable, never a 500, when the quota\'s cache store fails', function (): void {
    config(['contacts.soft_limit' => 3, 'contacts.hard_limit' => 5]);
    FailingCacheStore::install("contact:{$this->user->id}:");

    contactOf(100001)->assertNotFound()->assertJsonPath('code', 'contact_unavailable');
});

it('answers 503 source_unavailable while native stubs are on and the contact is on another driver: never the raw number', function (): void {
    onLegacyContact();
    config(['sources.native_stubs' => true, 'contacts.soft_limit' => 1, 'contacts.hard_limit' => 1]);

    contactOf(100001)->assertStatus(503)->assertJsonPath('code', 'source_unavailable')->assertJsonMissingPath('data');

    expect(LegacyListingsHttp::sent('/api/listings/100001'))->toBe([])
        ->and(Cache::has(ContactDisclosure::key($this->user)))->toBeFalse();
});

it('answers 503, never a 500, when no call link can be signed outside local and testing and the cache of the warning fails', function (): void {
    config(['contacts.call_link_signing_key' => '']);
    FailingCacheStore::install('listings:once');
    $this->app->instance('env', 'production');

    try {
        contactOf(100001)->assertStatus(503)->assertJsonPath('code', 'source_unavailable');
    } finally {
        $this->app->instance('env', 'testing');
    }
});

it('writes no phone number, call token or link of either variant into a log line', function (): void {
    onLegacyContact();
    config(['contacts.soft_limit' => 1, 'contacts.hard_limit' => 1]);
    $tokens = [];

    $lines = contactLogLines(function () use (&$tokens): void {
        $tokens[] = contactOf(100001)->assertOk()->json('data.call_url');
        contactOf(100002)->assertNotFound();
        config(['contacts.soft_limit' => null, 'contacts.hard_limit' => null]);
        $tokens[] = contactOf(100002)->assertOk()->json('data.call_url');
        LegacyListingsHttp::answer(fn (Request $request): ?PromiseInterface => str_ends_with(LegacyListingsHttp::path($request), '/call') ? Factory::response(['url' => 'http://kvadro.invalid/call/secret-fixture']) : null);
        contactOf(100002)->assertStatus(503);
        LegacyListingsHttp::answer(fn (Request $request): ?PromiseInterface => str_ends_with(LegacyListingsHttp::path($request), '/call') ? Factory::response(['url' => 'https://kvadro.invalid/call/secret-fixture']) : null);
        contactOf(100002)->assertNotFound()->assertJsonPath('code', 'contact_unavailable');
    });
    $serialised = json_encode($lines, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

    // The refused host is named on its own (point 9 of the review of stage B), never as part of an address.
    $named = array_values(array_filter($lines, fn (array $line): bool => str_contains(json_encode($line, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES), 'kvadro.invalid')));
    expect($lines)->not->toBeEmpty()
        ->and($named)->toHaveCount(1)
        ->and($named[0]['context']['host'] ?? null)->toBe('kvadro.invalid');
    foreach ([...RAW_PHONE_FORMS, 'fixture-call-token', 'secret-fixture', '//kvadro.invalid', 'kvadro.invalid/', '/call/'] as $secret) {
        expect($serialised)->not->toContain($secret);
    }
    foreach ($tokens as $url) {
        expect($serialised)->not->toContain(substr($url, strrpos($url, '/') + 1));
    }
});

it('keeps no number and no call link of the answer in a Telescope request entry', function (): void {
    $response = contactOf(100001)->assertOk();
    $watcher = new RequestWatcher([]);
    $kept = (fn (Response $answer): mixed => $this->response($answer))->call($watcher, $response->baseResponse);

    expect(Telescope::$hiddenResponseParameters)->toContain('data.phone', 'data.phone_display', 'data.call_url')
        ->and($kept['data'])->toMatchArray(['phone' => '********', 'phone_display' => '********', 'call_url' => '********'])
        ->and(json_encode($kept))->not->toContain('000000067');
});
