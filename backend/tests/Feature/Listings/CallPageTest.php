<?php

use App\Models\User;
use App\Services\Listings\CallLinkService;
use Illuminate\Log\Events\MessageLogged;
use Illuminate\Support\Facades\Date;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Sleep;
use Illuminate\Testing\TestResponse;
use Laravel\Pennant\Feature;
use Laravel\Sanctum\Sanctum;
use Laravel\Telescope\EntryType;
use Laravel\Telescope\IncomingEntry;
use Laravel\Telescope\Telescope;
use Tests\Support\LegacyFixtures;
use Tests\Support\LegacyListingsHttp;

/*
 * WP-43, RES-005, SEC-REQ-026: HOMI's call page on the stub catalogue (`100001` has the stub number +998000000067).
 */

beforeEach(function (): void {
    Http::preventStrayRequests();
    Date::setTestNow('2026-11-27 09:00:00');
});

/** The path of a call page for the listing, issued to the user (a new one when none is given). */
function callPagePath(int $number, string $locale = 'ru', ?User $user = null): string
{
    $url = app(CallLinkService::class)->issue($user ?? User::factory()->create(), $number, $locale)->url;

    return (string) parse_url($url, PHP_URL_PATH);
}

/** Asserts the headers of every answer of the call page, exactly. */
function assertCallPageHeaders(TestResponse $response): void
{
    expect($response->headers->get('X-Robots-Tag'))->toBe('noindex')
        ->and($response->headers->get('Cache-Control'))->toBe('no-store, private')
        ->and($response->headers->get('Referrer-Policy'))->toBe('no-referrer')
        ->and($response->headers->get('Content-Security-Policy'))->toBe("default-src 'none'; style-src 'unsafe-inline'")
        ->and($response->headers->get('X-Content-Type-Options'))->toBe('nosniff')
        ->and($response->headers->get('Content-Type'))->toBe('text/html; charset=UTF-8')
        ->and($response->headers->has('Set-Cookie'))->toBeFalse()
        ->and($response->headers->getCookies())->toBe([]);
}

/** Asserts that the page has no script and names no other address: no `src`, no `href` but the one `tel:`. */
function assertSelfContained(string $html): void
{
    expect($html)->not->toContain('<script')
        ->and($html)->not->toContain('src=')
        ->and($html)->not->toContain('<link')
        ->and($html)->not->toContain('//')
        ->and($html)->not->toMatch('/url\s*\(/i')
        ->and($html)->not->toContain('@import');
    preg_match_all('/href="([^"]*)"/', $html, $links);
    expect(array_filter($links[1], fn (string $link): bool => ! str_starts_with($link, 'tel:')))->toBe([]);
}

it('shows the title, the number and one tel: link for a valid token', function (): void {
    $response = $this->get(callPagePath(100001))->assertOk();
    $html = (string) $response->getContent();

    assertCallPageHeaders($response);
    assertSelfContained($html);
    expect(substr_count($html, 'href="tel:'))->toBe(1)
        ->and($html)->toContain('href="tel:+998000000067"')
        ->and($html)->toContain('+998 00 000-00-67')
        ->and($html)->toContain('HOMI')
        ->and($html)->toContain('Позвонить')
        ->and($html)->toContain('<html lang="ru">');
});

it('shows the page in the language of its token', function (): void {
    $html = (string) $this->get(callPagePath(100013, 'en'))->assertOk()->getContent();

    expect($html)->toContain('<html lang="en">')
        ->and($html)->toContain('>Call<')
        ->and($html)->toContain('href="tel:+998000000041"');
});

it('answers an expired link 410 in the language of its token', function (string $locale, string $text): void {
    $path = callPagePath(100001, $locale);
    $this->travel(661)->seconds();

    $response = $this->get($path, ['Accept-Language' => 'en'])->assertStatus(410);

    assertCallPageHeaders($response);
    assertSelfContained((string) $response->getContent());
    expect($response->getContent())->toContain($text)
        ->and($response->getContent())->toContain("<html lang=\"{$locale}\">")
        ->and($response->getContent())->not->toContain('000-00-67')
        ->and($response->getContent())->not->toContain('tel:');
})->with([
    'ru' => ['ru', 'Ссылка устарела — откройте объявление в приложении ещё раз'],
    'uz' => ['uz', 'Havola eskirgan — eʼlonni ilovada qaytadan oching'],
    'en' => ['en', 'This link has expired — open the listing in the app again'],
]);

it('still opens a link at +659 s', function (): void {
    $path = callPagePath(100001);
    $this->travel(659)->seconds();

    $this->get($path)->assertOk();
});

it('answers 404 without a number for a token HOMI did not sign, in the language the browser asks for', function (): void {
    $path = callPagePath(100001);
    $altered = substr($path, 0, -1).(str_ends_with($path, 'A') ? 'B' : 'A');

    foreach (['/call/'.str_repeat('a', 40), $altered, '/call/stub-token-100001'] as $wrong) {
        $response = $this->get($wrong, ['Accept-Language' => 'en'])->assertNotFound();

        assertCallPageHeaders($response);
        expect($response->getContent())->toContain('This link does not work')
            ->and($response->getContent())->not->toContain('tel:');
    }
});

it('answers 404 for an unknown listing, a listing without a phone and an erased user', function (Closure $path): void {
    $response = $this->get($path())->assertNotFound();

    assertCallPageHeaders($response);
    expect($response->getContent())->toContain('Ссылка не действует')
        ->and($response->getContent())->not->toContain('tel:');
})->with([
    'unknown listing' => [fn (): string => callPagePath(999404)],
    'no phone (withdrawn)' => [fn (): string => callPagePath(100015)],
    'a chat link without a phone' => [fn (): string => callPagePath(100018)],
    'erased user' => [function (): string {
        $user = User::factory()->create();
        $path = callPagePath(100001, user: $user);
        $user->delete();

        return $path;
    }],
]);

it('never shows listing B through a token of listing A', function (): void {
    $html = (string) $this->get(callPagePath(100002))->assertOk()->getContent();

    expect($html)->toContain('tel:+998000000002')
        ->and($html)->not->toContain('000000067');
});

it('answers 503 while the listing source cannot answer', function (): void {
    $response = $this->get(callPagePath(999503, 'uz'))->assertStatus(503);

    assertCallPageHeaders($response);
    expect($response->getContent())->toContain('Eʼlonni ochib boʻlmadi');
});

it('answers the 31st page in a minute from one address 429, with the page headers, and the next minute again', function (): void {
    $path = callPagePath(100001);
    $this->withServerVariables(['REMOTE_ADDR' => '203.0.113.10']);

    for ($page = 1; $page <= 30; $page++) {
        $this->get($path)->assertOk();
    }

    $limited = $this->get($path)->assertStatus(429);
    assertCallPageHeaders($limited);
    expect($limited->headers->get('Retry-After'))->not->toBeNull()
        ->and($limited->getContent())->not->toContain('tel:');

    $this->withServerVariables(['REMOTE_ADDR' => '198.51.100.20']);
    $this->get($path)->assertOk();

    $this->travel(61)->seconds();
    $this->withServerVariables(['REMOTE_ADDR' => '203.0.113.10']);
    $this->get($path)->assertOk();
});

it('serves the page without a session: no cookie, no CSRF token', function (): void {
    $response = $this->get(callPagePath(100001))->assertOk();

    expect($response->headers->getCookies())->toBe([])
        ->and($response->getContent())->not->toContain('csrf');
});

it('keeps no Telescope entry of a call page, whatever the environment records', function (): void {
    config(['telescope.record_all' => true]);
    $keeps = fn (IncomingEntry $entry): bool => collect(Telescope::$filterUsing)->every(fn (callable $filter): bool => $filter($entry));

    expect($keeps(IncomingEntry::make(['uri' => '/call/abc.def', 'response_status' => 200])->type(EntryType::REQUEST)))->toBeFalse()
        ->and($keeps(IncomingEntry::make(['uri' => '/call/abc.def', 'response_status' => 503])->type(EntryType::REQUEST)))->toBeFalse()
        ->and($keeps(IncomingEntry::make(['uri' => '/api/v1/reference', 'response_status' => 200])->type(EntryType::REQUEST)))->toBeTrue();
});

it('opens a link issued through the legacy driver with the legacy number, on the drivers of the token\'s user', function (): void {
    LegacyListingsHttp::fake();
    Sleep::fake();
    config(['legacy.media.public_url' => LegacyFixtures::MEDIA, 'legacy.rate.per_second' => 1000]);
    $user = User::factory()->create();

    // The default stays the stub; only this user reads the card and the contact through legacy.
    foreach (['card', 'contact'] as $method) {
        Feature::globally()->activate("source.listings.{$method}", ['users' => [$user->id => 'legacy']]);
    }

    Sanctum::actingAs($user, ['app:read', 'app:write']);
    $url = $this->postJson('/api/v1/listings/100001/contact', [], ['Accept-Language' => 'uz'])->assertOk()->assertJsonPath('meta.source', 'legacy')->json('data.call_url');
    $path = (string) parse_url($url, PHP_URL_PATH);
    $lines = new ArrayObject;
    Log::listen(function (MessageLogged $entry) use ($lines): void {
        $lines[] = [$entry->level, $entry->message, $entry->context];
    });

    $page = (string) $this->get($path)->assertOk()->getContent();
    expect($page)->toContain('href="tel:+998001234567"')
        ->and($page)->toContain('+998 00 123-45-67')
        ->and($page)->toContain('<html lang="uz">')
        ->and($page)->not->toContain('000000067')
        ->and(LegacyListingsHttp::sent('/api/listings/100001'))->toHaveCount(1);

    // The card's caches have expired: the page reads the preview and the card again, and still answers.
    $this->travel(61)->seconds();
    expect((string) $this->get($path)->assertOk()->getContent())->toContain('href="tel:+998001234567"')
        ->and(LegacyListingsHttp::sent('/api/listings/100001'))->toHaveCount(3);

    $serialised = json_encode($lines->getArrayCopy(), JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES);
    expect($serialised)->not->toContain(substr($path, strlen('/call/')))
        ->and($serialised)->not->toContain('001234567');
});
