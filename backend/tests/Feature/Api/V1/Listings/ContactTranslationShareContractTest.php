<?php

use App\Models\User;
use App\Services\Listings\CallLinkService;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\Support\ContractShapes;
use Tests\Support\JsonShape;

beforeEach(function (): void {
    Sanctum::actingAs(User::factory()->create(), ['app:read']);
});

it('gives the author\'s number with HOMI\'s call link (WP-43)', function (): void {
    $response = $this->postJson('/api/v1/listings/100001/contact')->assertOk();

    JsonShape::assertSame(['success' => 'bool', 'data' => ContractShapes::CONTACT, 'meta' => ['source' => 'string']], JsonShape::of($response->json()));
    $response->assertJsonPath('data.phone', '+998000000067')
        ->assertJsonPath('data.phone_display', '+998 00 000-00-67')
        ->assertJsonPath('meta.source', 'stub');
    expect($response->json('data.call_url'))->toStartWith(rtrim(config('app.url'), '/').'/call/')
        ->and(app(CallLinkService::class)->verify(substr($response->json('data.call_url'), strrpos($response->json('data.call_url'), '/') + 1))?->number)->toBe(100001)
        ->and(strtotime($response->json('data.expires_at')))->toBeGreaterThanOrEqual(time() + 9 * 60);
});

it('gives the stub\'s number and link of WP-12 while the native stubs are on (the e2e suite)', function (): void {
    config(['sources.native_stubs' => true]);

    $response = $this->postJson('/api/v1/listings/100001/contact')->assertOk();

    JsonShape::assertSame(['success' => 'bool', 'data' => ContractShapes::CONTACT, 'meta' => ['source' => 'string']], JsonShape::of($response->json()));
    $response->assertJsonPath('data.phone', '+998000000067')
        ->assertJsonPath('data.phone_display', '+998 00 000-00-67')
        ->assertJsonPath('meta.source', 'stub');
    expect($response->json('data.call_url'))->toStartWith('http')->toEndWith('/call/stub-token-100001')
        ->and(strtotime($response->json('data.expires_at')))->toBeGreaterThanOrEqual(time() + 9 * 60);
});

it('gives the own number of a listing whose post is deleted (WP-26)', function (): void {
    $this->postJson('/api/v1/listings/100021/contact')->assertOk()
        ->assertJsonPath('data.phone', '+998000000021')
        ->assertJsonPath('data.phone_display', '+998 00 000-00-21');
});

it('answers contact_unavailable without a phone or past the limit', function (int $number, array $headers): void {
    $this->postJson("/api/v1/listings/{$number}/contact", [], $headers)->assertStatus(404)->assertJsonPath('code', 'contact_unavailable');
})->with([[100015, []], [100018, []], [100019, []], [100020, []], [100001, ['X-Stub-Scenario' => 'contact_unavailable']]]);

it('translates the original text into the request locale, masked', function (): void {
    $response = $this->postJson('/api/v1/listings/100001/translation', [], ['Accept-Language' => 'uz'])->assertOk();

    JsonShape::assertSame(['success' => 'bool', 'data' => ['text' => 'string', 'locale' => 'string'], 'meta' => ['source' => 'string']], JsonShape::of($response->json()));
    $response->assertJsonPath('data.locale', 'uz');
    expect($response->json('data.text'))->toContain('+998 ** *** ** 67')->not->toContain('000 00 67');
    $this->postJson('/api/v1/listings/100012/translation', [], ['Accept-Language' => 'en'])->assertOk()->assertJsonPath('data.locale', 'en');
});

it('translates through the stub fixtures of WP-12 while the native stubs are on (the e2e suite)', function (): void {
    config(['sources.native_stubs' => true]);

    $response = $this->postJson('/api/v1/listings/100001/translation', [], ['Accept-Language' => 'uz'])->assertOk();

    JsonShape::assertSame(['success' => 'bool', 'data' => ['text' => 'string', 'locale' => 'string'], 'meta' => ['source' => 'string']], JsonShape::of($response->json()));
    $response->assertJsonPath('data.text', 'Metro yaqinida yorugʻ kvartira. Qoʻngʻiroq qiling: +998 ** *** ** 67')->assertJsonPath('meta.source', 'stub');
    $this->postJson('/api/v1/listings/100001/translation', [], ['Accept-Language' => 'ru'])->assertStatus(422)->assertJsonPath('code', 'translation_not_needed');
});

it('prepares a share message of HOMI\'s bot (WP-43)', function (): void {
    Http::preventStrayRequests();
    config(['telegram.bot.username' => 'homi_contract_bot']);
    $this->app['auth']->forgetGuards();
    Sanctum::actingAs(User::factory()->telegram()->create(), ['app:read']);
    Http::fake(['api.telegram.org/*' => Http::response(['ok' => true, 'result' => ['id' => 'prepared-contract-1', 'expiration_date' => time() + 3600]])]);

    $response = $this->postJson('/api/v1/listings/100012/share')->assertOk();

    JsonShape::assertSame(['success' => 'bool', 'data' => ['prepared_message_id' => 'string', 'expires_at' => 'string'], 'meta' => ['source' => 'string']], JsonShape::of($response->json()));
    $response->assertJsonPath('data.prepared_message_id', 'prepared-contract-1')->assertJsonPath('meta.source', 'native');
});

it('prepares the stub share message of WP-12 while the native stubs are on (the e2e suite)', function (): void {
    config(['sources.native_stubs' => true]);

    $response = $this->postJson('/api/v1/listings/100012/share')->assertOk();

    JsonShape::assertSame(['success' => 'bool', 'data' => ['prepared_message_id' => 'string', 'expires_at' => 'string'], 'meta' => ['source' => 'string']], JsonShape::of($response->json()));
    $response->assertJsonPath('data.prepared_message_id', 'stub-prepared-100012')->assertJsonPath('meta.source', 'stub');
    $this->postJson('/api/v1/listings/100012/share', [], ['X-Stub-Scenario' => 'share_failed'])->assertStatus(502)->assertJsonPath('code', 'share_failed');
    $this->postJson('/api/v1/listings/999404/share')->assertStatus(404)->assertJsonPath('code', 'not_found');
});

it('answers the errors of the three methods', function (string $path, array $headers, int $status, string $code): void {
    $this->postJson("/api/v1/listings/{$path}", [], $headers)->assertStatus($status)->assertJsonPath('code', $code);
})->with([
    'contact of an unknown number' => ['999404/contact', [], 404, 'not_found'],
    'contact unavailable source' => ['999503/contact', [], 503, 'source_unavailable'],
    'translation into ru' => ['100001/translation', ['Accept-Language' => 'ru'], 422, 'translation_not_needed'],
    'translation unavailable' => ['100001/translation', ['Accept-Language' => 'uz', 'X-Stub-Scenario' => 'translation_unavailable'], 503, 'translation_unavailable'],
    'translation rate limited' => ['100001/translation', ['Accept-Language' => 'uz', 'X-Stub-Scenario' => 'rate_limited'], 429, 'rate_limited'],
    'translation of an unknown number' => ['999404/translation', ['Accept-Language' => 'uz'], 404, 'not_found'],
    'share of an unknown number' => ['999404/share', [], 404, 'not_found'],
    'share without a Telegram id' => ['100012/share', [], 502, 'share_failed'],
    'share rate limited' => ['100012/share', ['X-Stub-Scenario' => 'rate_limited'], 429, 'rate_limited'],
]);
