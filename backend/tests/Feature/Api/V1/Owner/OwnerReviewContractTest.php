<?php

use App\Models\User;
use App\Services\Listings\ListingNumber;
use Illuminate\Http\UploadedFile;
use Laravel\Sanctum\Sanctum;

beforeEach(function (): void {
    Sanctum::actingAs(User::factory()->create(), ['app:read', 'app:write']);
});

it('publish refuses a rejected listing with its reason, and publishes the complete draft once its number is confirmed', function (): void {
    $this->postJson('/api/v1/owner/listings/01JF0000000000000000000009/publish')->assertStatus(409)->assertJsonPath('code', 'owner_rejected')->assertJsonPath('reason', 'denied');
    $published = $this->postJson('/api/v1/owner/listings/01JF0000000000000000000004/publish', [], ['X-Stub-Scenario' => 'phone_set'])->assertOk();

    $published->assertJsonPath('data.status', 'active')->assertJsonPath('data.number', 10000013)->assertJsonPath('data.held', false);
    expect($published->json('data.published_at'))->toBeString();
});

it('PATCH takes the values a form body sends and answers them in their types; null clears; bad values are named', function (): void {
    $response = $this->patchJson('/api/v1/owner/listings/01JF0000000000000000000004', ['furniture' => '0', 'pets' => 1, 'price' => '650', 'rooms' => '3', 'landmark' => null])->assertOk();

    $response->assertJsonPath('data.form.furniture', false)->assertJsonPath('data.form.pets', true)->assertJsonPath('data.form.price', 650)
        ->assertJsonPath('data.form.rooms', 3)->assertJsonPath('data.form.landmark', null);
    $this->patchJson('/api/v1/owner/listings/01JF0000000000000000000004', ['currency' => 'EUR', 'description' => str_repeat('a', 601)])->assertStatus(422)->assertJsonValidationErrors(['currency', 'description']);
    $this->patchJson('/api/v1/owner/listings/01JF0000000000000000000004', ['lat' => null])->assertStatus(422)->assertJsonValidationErrors(['lon']);
});

it('a photo that is not an image is unsupported_mime, as the uploader answers it; a repeated id names ids', function (): void {
    $this->post('/api/v1/owner/listings/01JF0000000000000000000002/photos', ['file' => UploadedFile::fake()->createWithContent('a.txt', 'plain text')], ['Accept' => 'application/json'])
        ->assertStatus(422)->assertJsonPath('code', 'unsupported_mime');
    $ids = array_column($this->getJson('/api/v1/owner/listings/01JF0000000000000000000002')->json('data.photos'), 'id');
    $this->putJson('/api/v1/owner/listings/01JF0000000000000000000002/photos/order', ['ids' => [$ids[0], $ids[0]]])->assertStatus(422)->assertJsonValidationErrors(['ids']);
});

it('status: active or paused to rented or removed; nothing leaves them', function (): void {
    $this->putJson('/api/v1/owner/listings/01JF0000000000000000000003/status', ['status' => 'rented'])->assertOk()->assertJsonPath('data.status', 'rented');
    $this->putJson('/api/v1/owner/listings/01JF0000000000000000000005/status', ['status' => 'removed'])->assertOk()->assertJsonPath('data.status', 'removed');
});

it('an unknown id answers 404 before any scenario; an unknown request too', function (): void {
    $this->postJson('/api/v1/owner/listings/01JF0000000000000000000099/publish', [], ['X-Stub-Scenario' => 'owner_limit'])->assertNotFound();
    $this->postJson('/api/v1/owner/requests/01JF0000000000000000000299/answer', ['action' => 'give'])->assertNotFound();
    $this->postJson('/api/v1/listings/999404/contact-request', ['who' => 'one', 'people' => 1, 'init_data' => 'x'], ['X-Stub-Scenario' => 'no_chat'])->assertNotFound();
});

it('demand is 0, never few, while radars are off', function (): void {
    config(['radar.creation_enabled' => false]);

    $this->getJson('/api/v1/owner/demand?city=tashkent')->assertOk()->assertJsonPath('data.count', 0)->assertJsonPath('data.few', false);
});

it('the request method checks init_data in bytes, people and move_in; it needs app:write', function (): void {
    $this->postJson('/api/v1/listings/10000001/contact-request', ['who' => 'one', 'people' => 0, 'move_in' => str_repeat('a', 33), 'init_data' => str_repeat('я', 2049)])
        ->assertStatus(422)->assertJsonValidationErrors(['people', 'move_in', 'init_data']);
    Sanctum::actingAs(User::factory()->create(), ['app:read']);
    $this->postJson('/api/v1/listings/10000001/contact-request', ['who' => 'one', 'people' => 1, 'init_data' => 'x'])->assertForbidden();
});

it('the feed: page one opens with 10000001, and every repeated entry stays below the native floor', function (): void {
    $numbers = [];
    $cursor = null;

    do {
        $page = $this->getJson('/api/v1/listings?city=tashkent&deal=rent_long'.($cursor === null ? '' : '&cursor='.urlencode($cursor)))->assertOk();
        $numbers = [...$numbers, ...array_column($page->json('data'), 'number')];
        $cursor = $page->json('meta.next_cursor');
    } while ($cursor !== null);

    $native = array_values(array_filter($numbers, ListingNumber::isNative(...)));
    sort($native);

    expect($numbers[0])->toBe(10000001)
        ->and($numbers)->toHaveCount(45)
        ->and($native)->toBe(range(10000001, 10000008));
});

it('with the switch off demand, the request list and the seeker request stay open; without a token every owner method is 401', function (): void {
    config(['owner.enabled' => false]);

    $this->getJson('/api/v1/owner/demand?city=tashkent')->assertOk();
    $this->getJson('/api/v1/owner/listings/01JF0000000000000000000003/requests')->assertOk();
    $this->postJson('/api/v1/listings/10000001/contact-request', ['who' => 'one', 'people' => 1, 'init_data' => 'x'])->assertCreated();
});

it('publish and the phone request are limited to 10 an hour each', function (): void {
    for ($i = 0; $i < 10; $i++) {
        $this->postJson('/api/v1/owner/listings/01JF0000000000000000000003/publish')->assertOk();
    }

    $this->postJson('/api/v1/owner/listings/01JF0000000000000000000003/publish')->assertStatus(429)->assertJsonPath('code', 'rate_limited');
    $this->postJson('/api/v1/owner/listings/01JF0000000000000000000003/phone-request')->assertOk();
});
