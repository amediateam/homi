<?php

use App\Models\User;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\Support\ContractShapes;
use Tests\Support\JsonShape;

/*
 * The hidden listings, blocked authors and hidden overview of WP-13 as the native stubs answer them (WP-44, brief
 * decision 10): while `sources.native_stubs` is on, `NativeStubs` answers the fixtures of `hidden/` and stores nothing,
 * as the end-to-end suite expects; `HiddenListingsTest`, `BlockedAuthorsTest` and `HiddenOverviewTest` cover the real
 * methods.
 */

beforeEach(function (): void {
    Http::preventStrayRequests();
    config(['sources.native_stubs' => true]);
    Sanctum::actingAs(User::factory()->create(), ['app:read', 'app:write']);
});

it('hides and unhides a listing with 204, repeatably', function (): void {
    foreach ([1, 2] as $attempt) {
        $this->putJson('/api/v1/hidden/listings/100012')->assertNoContent();
        $this->deleteJson('/api/v1/hidden/listings/100012')->assertNoContent();
    }

    $this->putJson('/api/v1/hidden/listings/999404')->assertStatus(404)->assertJsonPath('code', 'not_found');
    $this->deleteJson('/api/v1/hidden/listings/123456')->assertNoContent();
});

it('blocks the author of a listing and lists the author\'s listings', function (): void {
    $first = $this->putJson('/api/v1/listings/100001/blocked-author')->assertOk();
    $second = $this->putJson('/api/v1/listings/100001/blocked-author')->assertOk();

    JsonShape::assertSame(['success' => 'bool', 'data' => ContractShapes::BLOCKED_AUTHOR_RESULT, 'meta' => ['source' => 'string']], JsonShape::of($first->json()));
    expect($second->json())->toBe($first->json())
        ->and($first->json('data.id'))->toMatch('/^[0-9A-HJKMNP-TV-Z]{26}$/')
        ->and($first->json('data.label'))->toBe('+998 ** *** ** 67')
        ->and($first->json('data.listing_numbers'))->each->toBeInt();
    $first->assertJsonPath('meta.source', 'stub');
});

it('unblocks by listing with 204 and checks the listing when blocking', function (): void {
    $this->deleteJson('/api/v1/listings/100001/blocked-author')->assertNoContent();
    $this->deleteJson('/api/v1/listings/100001/blocked-author')->assertNoContent();
    $this->putJson('/api/v1/listings/999404/blocked-author')->assertStatus(404)->assertJsonPath('code', 'not_found');
});

it('lists the hidden listings, newest first, and the blocked authors', function (): void {
    $response = $this->getJson('/api/v1/hidden')->assertOk();

    JsonShape::assertSame(['success' => 'bool', 'data' => ContractShapes::HIDDEN, 'meta' => ['source' => 'string']], JsonShape::of($response->json()));
    expect($response->json('data.listings'))->not->toBeEmpty()
        ->and($response->json('data.authors'))->not->toBeEmpty();
});

it('answers both arrays in the empty scenario', function (): void {
    $this->getJson('/api/v1/hidden', ['X-Stub-Scenario' => 'empty'])->assertOk()
        ->assertJsonPath('data', ['listings' => [], 'authors' => []]);
});

it('removes a blocked author by entry id and answers 404 for any other id', function (): void {
    $id = $this->getJson('/api/v1/hidden')->json('data.authors.0.id');

    $this->deleteJson("/api/v1/hidden/authors/{$id}")->assertNoContent();
    $this->deleteJson('/api/v1/hidden/authors/01JD0000000000000000000099')->assertStatus(404)->assertJsonPath('code', 'not_found');
    $this->deleteJson('/api/v1/hidden/authors/not-a-ulid')->assertStatus(404)->assertJsonPath('code', 'not_found');
});

it('clears everything hidden with 204', function (): void {
    $this->deleteJson('/api/v1/hidden')->assertNoContent();
    $this->deleteJson('/api/v1/hidden')->assertNoContent();
});
