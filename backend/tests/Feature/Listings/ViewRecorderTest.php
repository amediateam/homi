<?php

use App\Models\ListingView;
use App\Models\User;
use App\Services\Listings\ViewRecorder;
use App\Services\Sources\Data\ListingDetails;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Sleep;
use Laravel\Pennant\Feature;
use Laravel\Sanctum\Sanctum;
use Tests\Support\LegacyFixtures;
use Tests\Support\ListingArrays;

/*
 * The view history (WP-42, "View history"; task `KV-BE-039`): a full card read records one row per user and listing
 * and answers `viewed: true`; a second read adds to `views` and moves `last_viewed_at`; a preview never records; a
 * merged duplicate records the surviving number; one user's views never mark another's feed.
 */

beforeEach(function (): void {
    Http::preventStrayRequests();
    Sleep::fake();
    config(['legacy.media.public_url' => LegacyFixtures::MEDIA, 'legacy.rate.per_second' => 1000]);
    $this->user = User::factory()->create();
    Sanctum::actingAs($this->user, ['app:read']);
});

it('records a full card read and answers it viewed', function (): void {
    $this->travelTo('2026-11-27 10:00:00');

    $this->getJson('/api/v1/listings/100001')->assertOk()->assertJsonPath('data.viewed', true);

    $row = ListingView::query()->sole();
    expect($row->user_id)->toBe($this->user->id)
        ->and($row->listing_number)->toBe(100001)
        ->and($row->views)->toBe(1)
        ->and($row->first_viewed_at->toIso8601String())->toBe('2026-11-27T10:00:00+00:00')
        ->and($row->last_viewed_at->toIso8601String())->toBe('2026-11-27T10:00:00+00:00')
        ->and($row->source_channel)->not->toBeNull()
        ->and($row->source_post_id)->not->toBeNull();
});

it('adds to views and moves last_viewed_at on a second read, without a second row', function (): void {
    $this->travelTo('2026-11-27 10:00:00');
    $this->getJson('/api/v1/listings/100001')->assertOk();
    $this->travelTo('2026-11-27 12:30:00');

    $this->getJson('/api/v1/listings/100001')->assertOk()->assertJsonPath('data.viewed', true);

    $row = ListingView::query()->sole();
    expect($row->views)->toBe(2)
        ->and($row->first_viewed_at->toIso8601String())->toBe('2026-11-27T10:00:00+00:00')
        ->and($row->last_viewed_at->toIso8601String())->toBe('2026-11-27T12:30:00+00:00');
});

it('records nothing for a preview read', function (): void {
    $this->getJson('/api/v1/listings/100001?preview=1')->assertOk()->assertJsonPath('data.viewed', false);

    expect(ListingView::query()->count())->toBe(0);
});

it('records the surviving number of a merged duplicate', function (string $driver): void {
    if ($driver === 'legacy') {
        Feature::globally()->activate('source.listings.card', ['everyone' => 'legacy']);
    }

    $this->getJson('/api/v1/listings/100016')->assertOk()->assertJsonPath('data.number', 100001)->assertJsonPath('meta.source', $driver);

    expect(ListingView::query()->pluck('listing_number')->all())->toBe([100001]);
})->with(['stub', 'legacy']);

it('records nothing for a card that is not found or not available', function (): void {
    $this->getJson('/api/v1/listings/999404')->assertNotFound();
    $this->getJson('/api/v1/listings/999503')->assertStatus(503);

    expect(ListingView::query()->count())->toBe(0);
});

it('never marks one user\'s feed with another user\'s views', function (): void {
    $alice = $this->user;
    $bob = User::factory()->create();
    $first = $this->getJson('/api/v1/listings?city=tashkent&deal=rent_long')->assertOk()->json('data.0.number');

    $this->getJson("/api/v1/listings/{$first}")->assertOk();
    $aliceFeed = $this->getJson('/api/v1/listings?city=tashkent&deal=rent_long')->assertOk();
    Sanctum::actingAs($bob, ['app:read']);
    $bobFeed = $this->getJson('/api/v1/listings?city=tashkent&deal=rent_long')->assertOk();

    expect($aliceFeed->json('data.0.number'))->toBe($first)
        ->and($aliceFeed->json('data.0.viewed'))->toBeTrue()
        ->and($bobFeed->json('data.0.viewed'))->toBeFalse()
        ->and(ListingView::query()->where('user_id', $alice->id)->count())->toBe(1)
        ->and(ListingView::query()->where('user_id', $bob->id)->count())->toBe(0);
});

it('records nothing while sources.native_stubs is on, so the card keeps the fixture\'s flag', function (): void {
    config(['sources.native_stubs' => true]);

    $this->getJson('/api/v1/listings/100001')->assertOk()->assertJsonPath('data.viewed', false);

    expect(ListingView::query()->count())->toBe(0);
});

it('keeps a channel that does not fit the column out of the row', function (): void {
    $card = ListingDetails::fromArray(ListingArrays::details(['source_ref' => ['channel' => str_repeat('c', 65), 'post_id' => 7]]));

    expect(app(ViewRecorder::class)->record($this->user, $card)->preview->viewed)->toBeTrue()
        ->and(ListingView::query()->sole()->source_channel)->toBeNull()
        ->and(ListingView::query()->sole()->source_post_id)->toBe(7);
});
