<?php

use App\Models\User;
use Laravel\Pennant\Feature;
use Laravel\Sanctum\Sanctum;
use Tests\Support\ContractShapes;
use Tests\Support\JsonShape;

beforeEach(function (): void {
    Sanctum::actingAs(User::factory()->create(), ['app:read']);
});

it('answers the first page of the default filters: 20 previews and a cursor', function (): void {
    $response = $this->getJson('/api/v1/listings?city=tashkent&deal=rent_long')->assertOk();

    JsonShape::assertSame(
        ['success' => 'bool', 'data' => ['*' => ContractShapes::LISTING_PREVIEW], 'meta' => ['next_cursor' => 'string', 'source' => 'string']],
        JsonShape::of($response->json()),
    );
    expect($response->json('data'))->toHaveCount(20)
        ->and(array_keys($response->json('data.0')))->toBe(array_keys(ContractShapes::LISTING_PREVIEW));
    $response->assertJsonPath('meta.source', 'stub');
});

it('reaches the end of the list with 45 distinct numbers by following the cursor', function (): void {
    $numbers = [];
    $cursor = '';
    $pages = 0;

    do {
        $page = $this->getJson('/api/v1/listings?city=tashkent&deal=rent_long'.($cursor === '' ? '' : '&cursor='.urlencode($cursor)))->assertOk();
        $numbers = [...$numbers, ...array_column($page->json('data'), 'number')];
        $cursor = $page->json('meta.next_cursor');
        $pages++;
    } while ($cursor !== null && $pages < 10);

    expect($pages)->toBe(3)
        ->and($numbers)->toHaveCount(45)
        ->and(array_unique($numbers))->toHaveCount(45);
});

it('follows the filters', function (string $query, Closure $check): void {
    $items = $this->getJson("/api/v1/listings?city=tashkent&{$query}")->assertOk()->json('data');

    expect($items)->not->toBeEmpty();

    foreach ($items as $item) {
        expect($check($item))->toBeTrue();
    }
})->with([
    'sale' => ['deal=sale&types[]=apartment&types[]=commercial', fn (array $item): bool => $item['deal'] === 'sale' && in_array($item['type'], ['apartment', 'commercial'], true)],
    'price' => ['deal=rent_long&price_max=400', fn (array $item): bool => $item['price']['usd'] <= 400],
    'area of a rent' => ['deal=rent_long&area_min=50&area_max=60', fn (array $item): bool => $item['area_total'] >= 50 && $item['area_total'] <= 60],
    'district' => ['deal=rent_long&districts[]=chilonzor', fn (array $item): bool => $item['district']['code'] === 'chilonzor'],
    'owners' => ['deal=rent_long&owner=owners', fn (array $item): bool => $item['is_owner'] === true],
    'rooms 3 or more' => ['deal=rent_long&rooms_min=3&rooms_max=4', fn (array $item): bool => $item['rooms'] >= 3],
]);

it('sorts by the asked order', function (): void {
    $prices = array_column(array_column($this->getJson('/api/v1/listings?city=tashkent&deal=rent_long&sort=cheap')->assertOk()->json('data'), 'price'), 'usd');

    expect($prices)->toBe(collect($prices)->sort()->values()->all());
});

it('refuses a malformed page request with 422 naming the parameter', function (string $query, string $field): void {
    $this->getJson("/api/v1/listings?{$query}")
        ->assertStatus(422)
        ->assertJsonPath('code', 'validation_failed')
        ->assertJsonValidationErrors([$field]);
})->with([
    'limit 0' => ['city=tashkent&deal=rent_long&limit=0', 'limit'],
    'limit 51' => ['city=tashkent&deal=rent_long&limit=51', 'limit'],
    'unknown sort' => ['city=tashkent&deal=rent_long&sort=random', 'sort'],
    'long cursor' => ['city=tashkent&deal=rent_long&cursor='.str_repeat('c', 513), 'cursor'],
    'missing city' => ['deal=rent_long', 'city'],
    'unknown deal' => ['city=tashkent&deal=x', 'deal'],
    'unknown district' => ['city=tashkent&deal=rent_long&districts[]=atlantis', 'districts'],
    'two vertices' => ['city=tashkent&deal=rent_long&polygon=41.3,69.2;41.31,69.25', 'polygon'],
    'boolean yes' => ['city=tashkent&deal=rent_long&near_metro=yes', 'near_metro'],
]);

it('answers the empty, few and page2_error scenarios', function (): void {
    $this->getJson('/api/v1/listings?city=tashkent&deal=rent_long', ['X-Stub-Scenario' => 'empty'])
        ->assertOk()->assertJsonPath('data', [])->assertJsonPath('meta.next_cursor', null);
    $few = $this->getJson('/api/v1/listings?city=tashkent&deal=rent_long', ['X-Stub-Scenario' => 'few'])->assertOk();
    $first = $this->getJson('/api/v1/listings?city=tashkent&deal=rent_long', ['X-Stub-Scenario' => 'page2_error'])->assertOk();

    expect($few->json('data'))->toHaveCount(5)->and($few->json('meta.next_cursor'))->toBeNull();
    $this->getJson('/api/v1/listings?city=tashkent&deal=rent_long&cursor='.$first->json('meta.next_cursor'), ['X-Stub-Scenario' => 'page2_error'])
        ->assertStatus(503)->assertJsonPath('code', 'source_unavailable');
});

it('needs a token with app:read', function (): void {
    Sanctum::actingAs(User::factory()->create(), ['media:write']);

    $this->getJson('/api/v1/listings?city=tashkent&deal=rent_long')->assertStatus(403)->assertJsonPath('code', 'forbidden');
});

it('answers 503 when the flag names an unbound driver', function (): void {
    Feature::globally()->activate('source.listings.feed', ['everyone' => 'legacy']);

    $this->getJson('/api/v1/listings?city=tashkent&deal=rent_long')->assertStatus(503)->assertJsonPath('code', 'source_unavailable');
});
