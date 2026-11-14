<?php

use App\Models\Source;
use App\Models\User;
use App\Services\Sources\SourceContext;
use Illuminate\Http\Request;

function contextRequest(array $headers = [], mixed $actor = null): Request
{
    $request = Request::create('/api/v1/anything', server: collect($headers)
        ->mapWithKeys(fn (string $value, string $name): array => ['HTTP_'.strtoupper(str_replace('-', '_', $name)) => $value])
        ->all());
    // Request::create() sends `Accept-Language: en-us,en;q=0.5` unless told otherwise.
    if (! array_key_exists('Accept-Language', $headers)) {
        $request->headers->remove('Accept-Language');
    }
    $request->setUserResolver(fn (): mixed => $actor);

    return $request;
}

it('takes the locale from the first supported Accept-Language tag', function (?string $header, string $locale): void {
    $headers = $header === null ? [] : ['Accept-Language' => $header];

    expect(SourceContext::fromRequest(contextRequest($headers))->locale)->toBe($locale);
})->with([
    'Uzbek with a script and a region' => ['uz-Latn-UZ,uz;q=0.9', 'uz'],
    'English before Russian' => ['en-US,en;q=0.9,ru;q=0.8', 'en'],
    'an unsupported tag first' => ['fr-FR, uz;q=0.5', 'uz'],
    'ordered by weight' => ['ru;q=0.1, en;q=0.9', 'en'],
    'nothing supported' => ['de-DE,fr;q=0.8', 'ru'],
    'no header' => [null, 'ru'],
]);

it('answers in US dollars until the user settings exist (WP-40)', function (): void {
    expect(SourceContext::fromRequest(contextRequest())->currency)->toBe('USD');
});

it('carries the signed-in user and no collector', function (): void {
    $user = new User;

    expect(SourceContext::fromRequest(contextRequest(actor: $user))->user)->toBe($user)
        ->and(SourceContext::fromRequest(contextRequest(actor: new Source))->user)->toBeNull()
        ->and(SourceContext::fromRequest(contextRequest())->user)->toBeNull();
});

it('reads the stub scenario header and drops a malformed one', function (?string $header, ?string $scenario): void {
    $headers = $header === null ? [] : ['X-Stub-Scenario' => $header];

    expect(SourceContext::fromRequest(contextRequest($headers))->scenario)->toBe($scenario);
})->with([
    'a scenario' => ['first_launch', 'first_launch'],
    'absent' => [null, null],
    'a path' => ['../me/default', null],
    'upper case and spaces' => ['First Launch', null],
    'too long' => [str_repeat('a', 65), null],
]);

it('builds a system context for jobs and the bot', function (): void {
    $context = SourceContext::system('uz');

    expect($context->locale)->toBe('uz')
        ->and($context->currency)->toBe('USD')
        ->and($context->user)->toBeNull()
        ->and($context->scenario)->toBeNull()
        ->and(SourceContext::system()->locale)->toBe('ru');
});

it('refuses a locale or currency the API does not serve', function (): void {
    expect(fn () => SourceContext::system('de'))->toThrow(InvalidArgumentException::class)
        ->and(fn () => new SourceContext('ru', 'EUR'))->toThrow(InvalidArgumentException::class);
});
