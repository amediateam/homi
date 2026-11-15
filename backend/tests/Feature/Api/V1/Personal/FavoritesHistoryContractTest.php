<?php

use App\Models\User;
use Laravel\Sanctum\Sanctum;
use Tests\Support\ContractShapes;
use Tests\Support\JsonShape;

beforeEach(function (): void {
    Sanctum::actingAs(User::factory()->create(), ['app:read', 'app:write']);
});

it('pages a personal list by 20 with the cursor of the feed and ends with null', function (string $path, string $flag): void {
    $first = $this->getJson("/api/v1/{$path}")->assertOk();

    JsonShape::assertSame(
        ['success' => 'bool', 'data' => ['*' => ContractShapes::LISTING_PREVIEW], 'meta' => ['next_cursor' => 'string', 'source' => 'string']],
        JsonShape::of($first->json()),
    );
    expect($first->json('data'))->toHaveCount(20)
        ->and(array_unique(array_column($first->json('data'), $flag)))->toBe([true]);
    $first->assertJsonPath('meta.source', 'stub');

    $second = $this->getJson("/api/v1/{$path}?cursor=".$first->json('meta.next_cursor'))->assertOk();
    $numbers = [...array_column($first->json('data'), 'number'), ...array_column($second->json('data'), 'number')];

    expect($second->json('data'))->toHaveCount(5)
        ->and($second->json('meta.next_cursor'))->toBeNull()
        ->and(array_unique($numbers))->toHaveCount(25);
})->with([['favorites', 'favorite'], ['history', 'viewed']]);

it('keeps a withdrawn listing in a personal list', function (): void {
    $items = $this->getJson('/api/v1/favorites?limit=50')->assertOk()->json('data');

    expect(collect($items)->firstWhere('number', 100015)['status_text'])->toBe('Снято с публикации');
});

it('cuts pages by limit and refuses a limit outside 1 … 50', function (string $path): void {
    expect($this->getJson("/api/v1/{$path}?limit=5")->assertOk()->json('data'))->toHaveCount(5);
    $this->getJson("/api/v1/{$path}?limit=0")->assertStatus(422)->assertJsonValidationErrors(['limit']);
    $this->getJson("/api/v1/{$path}?limit=51")->assertStatus(422)->assertJsonValidationErrors(['limit']);
})->with(['favorites', 'history']);

it('ends the list quietly on a cursor that does not decode', function (string $path): void {
    $this->getJson("/api/v1/{$path}".(str_contains($path, '?') ? '&' : '?').'cursor=l1.foreign')->assertOk()
        ->assertJsonPath('data', [])->assertJsonPath('meta.next_cursor', null);
})->with(['favorites', 'history', 'listings?city=tashkent&deal=rent_long']);

it('answers the empty scenario', function (string $path): void {
    $this->getJson("/api/v1/{$path}", ['X-Stub-Scenario' => 'empty'])->assertOk()
        ->assertJsonPath('data', [])->assertJsonPath('meta.next_cursor', null);
})->with(['favorites', 'history']);

it('sets and clears a favourite idempotently', function (): void {
    foreach ([1, 2] as $attempt) {
        $this->putJson('/api/v1/favorites/100012')->assertOk()->assertJsonPath('data', ['favorite' => true])->assertJsonPath('meta.source', 'stub');
        $this->deleteJson('/api/v1/favorites/100012')->assertOk()->assertJsonPath('data', ['favorite' => false]);
    }
});

it('never answers 404 when clearing a favourite that was not one', function (): void {
    $this->deleteJson('/api/v1/favorites/123456')->assertOk()->assertJsonPath('data.favorite', false);
});

it('checks the listing of a new favourite', function (string $number, int $status, string $code): void {
    $this->putJson("/api/v1/favorites/{$number}")->assertStatus($status)->assertJsonPath('code', $code);
})->with([['999404', 404, 'not_found'], ['999503', 503, 'source_unavailable'], ['abc', 404, 'not_found'], ['0', 404, 'not_found']]);

it('clears the history with 204, twice', function (): void {
    $this->deleteJson('/api/v1/history')->assertNoContent();
    $this->deleteJson('/api/v1/history')->assertNoContent();
});

it('needs app:write to change and app:read to list', function (): void {
    Sanctum::actingAs(User::factory()->create(), ['app:read']);

    $this->getJson('/api/v1/favorites')->assertOk();
    $this->putJson('/api/v1/favorites/100012')->assertStatus(403)->assertJsonPath('code', 'forbidden');
    $this->deleteJson('/api/v1/history')->assertStatus(403);
});
