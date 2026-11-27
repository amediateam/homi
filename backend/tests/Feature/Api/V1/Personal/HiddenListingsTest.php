<?php

use App\Enums\Personal\HiddenReason;
use App\Enums\Personal\ReportReason;
use App\Models\HiddenListing;
use App\Models\ListingRef;
use App\Models\ListingVote;
use App\Models\User;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Sleep;
use Laravel\Pennant\Feature;
use Laravel\Sanctum\Sanctum;
use Tests\Support\LegacyFixtures;
use Tests\Support\LegacyListingsHttp;

/*
 * WP-44, step 6: hidden listings in HOMI's table (task `KV-BE-040`). Hide is for this user only and can be undone; a
 * repeat changes nothing (fix of LB-API-043) and an existing row keeps its first reason. Unhide removes the row
 * whatever its reason — the undo after a `fraud` report too — and never a vote, without asking the source. The feed and
 * map exclusion is pinned once the overlay reads these rows (`OverlayDataTest`).
 */

beforeEach(function (): void {
    Http::preventStrayRequests();
    Sleep::fake();
    config(['legacy.media.public_url' => LegacyFixtures::MEDIA, 'legacy.rate.per_second' => 1000]);
    $this->user = User::factory()->create();
    Sanctum::actingAs($this->user, ['app:read', 'app:write']);
});

/** @return list<int> the hidden numbers of a user */
function hiddenNumbersOf(User $user): array
{
    return array_values(HiddenListing::query()->where('user_id', $user->id)->orderBy('listing_number')->pluck('listing_number')->all());
}

it('hides a listing for the caller with 204, once however often it is asked', function (): void {
    $this->putJson('/api/v1/hidden/listings/100012')->assertNoContent();
    $this->putJson('/api/v1/hidden/listings/100012')->assertNoContent();

    $row = HiddenListing::query()->sole();
    expect([$row->user_id, $row->listing_number, $row->reason])->toBe([$this->user->id, 100012, HiddenReason::Manual]);
});

it('keeps the first reason when a listing a report hid is hidden again by hand', function (): void {
    HiddenListing::factory()->for($this->user)->create(['listing_number' => 100012, 'reason' => HiddenReason::ReportFraud]);

    $this->putJson('/api/v1/hidden/listings/100012')->assertNoContent();

    expect(HiddenListing::query()->sole()->reason)->toBe(HiddenReason::ReportFraud);
});

it('checks the listing of a hide: 404 unknown, 503 while the source is down unless HOMI knows it', function (): void {
    $this->putJson('/api/v1/hidden/listings/999404')->assertNotFound()->assertJsonPath('code', 'not_found');
    $this->putJson('/api/v1/hidden/listings/0')->assertNotFound()->assertJsonPath('code', 'not_found');
    $this->putJson('/api/v1/hidden/listings/999503')->assertStatus(503)->assertJsonPath('code', 'source_unavailable');

    ListingRef::factory()->create(['listing_number' => 999503]);
    $this->putJson('/api/v1/hidden/listings/999503')->assertNoContent();

    expect(hiddenNumbersOf($this->user))->toBe([999503]);
});

it('unhides with 204, also a listing that is not hidden, without asking the source', function (): void {
    HiddenListing::factory()->for($this->user)->create(['listing_number' => 123456]);

    $this->deleteJson('/api/v1/hidden/listings/123456')->assertNoContent();
    $this->deleteJson('/api/v1/hidden/listings/123456')->assertNoContent();
    $this->deleteJson('/api/v1/hidden/listings/0')->assertNotFound()->assertJsonPath('code', 'not_found');

    expect(HiddenListing::query()->count())->toBe(0);
});

it('unhides a listing a report hid and keeps the vote', function (HiddenReason $reason, ReportReason $vote): void {
    HiddenListing::factory()->for($this->user)->create(['listing_number' => 100012, 'reason' => $reason]);
    ListingVote::factory()->for($this->user)->create(['listing_number' => 100012, 'reason' => $vote]);

    $this->deleteJson('/api/v1/hidden/listings/100012')->assertNoContent();

    expect(HiddenListing::query()->count())->toBe(0)
        ->and(ListingVote::query()->sole()->reason)->toBe($vote)
        ->and(ListingVote::query()->sole()->withdrawn_at)->toBeNull();
})->with([
    'fraud' => [HiddenReason::ReportFraud, ReportReason::Fraud],
    'rented' => [HiddenReason::ReportRented, ReportReason::Rented],
]);

it('acts on the survivor of an alias number, hiding and unhiding', function (): void {
    $this->putJson('/api/v1/hidden/listings/100016')->assertNoContent();

    expect(hiddenNumbersOf($this->user))->toBe([100001]);

    ListingRef::factory()->create(['listing_number' => 100001]);
    ListingRef::factory()->create(['listing_number' => 100016, 'merged_into' => 100001, 'author_key' => null]);
    $this->deleteJson('/api/v1/hidden/listings/100016')->assertNoContent();

    expect(hiddenNumbersOf($this->user))->toBe([]);
});

it('unhides a listing hidden before it was merged, one hop or two, by the number asked or a later survivor, and leaves another user\'s row (review C, N1)', function (array $merges, int $asked): void {
    $other = User::factory()->create();
    HiddenListing::factory()->for($this->user)->create(['listing_number' => 100012, 'reason' => HiddenReason::ReportRented]);
    HiddenListing::factory()->for($other)->create(['listing_number' => 100012]);

    foreach ($merges as $number => $into) {
        ListingRef::factory()->create(['listing_number' => $number, 'merged_into' => $into, 'author_key' => null]);
    }

    ListingRef::factory()->create(['listing_number' => 100014]);

    $this->deleteJson("/api/v1/hidden/listings/{$asked}")->assertNoContent();

    expect(hiddenNumbersOf($this->user))->toBe([])
        ->and(hiddenNumbersOf($other))->toBe([100012]);
})->with([
    'one merge, by the survivor' => [[100012 => 100014], 100014],
    'two merges, by the last survivor' => [[100012 => 100013, 100013 => 100014], 100014],
    'two merges, by the middle number' => [[100012 => 100013, 100013 => 100014], 100013],
    'two merges, by the number asked' => [[100012 => 100013, 100013 => 100014], 100012],
]);

it('lets a hidden listing shown in «Скрытое» as the survivor of a later merge leave it by that survivor (review C, N1)', function (): void {
    LegacyListingsHttp::fake();
    Feature::globally()->activate('source.listings.card', ['everyone' => 'legacy']);
    HiddenListing::factory()->for($this->user)->create(['listing_number' => 100016, 'reason' => HiddenReason::ReportRented]);
    ListingRef::factory()->create(['listing_number' => 100001]);
    ListingRef::factory()->create(['listing_number' => 100016, 'merged_into' => 100001, 'author_key' => null]);

    expect(array_column($this->getJson('/api/v1/hidden')->assertOk()->json('data.listings'), 'number'))->toBe([100001]);

    $this->deleteJson('/api/v1/hidden/listings/100001')->assertNoContent();

    expect($this->getJson('/api/v1/hidden')->assertOk()->json('data.listings'))->toBe([]);
});

it('back-fills the channel and post of a listing hidden before HOMI had seen its card', function (): void {
    LegacyListingsHttp::fake();
    Feature::globally()->activate('source.listings.card', ['everyone' => 'legacy']);

    $this->putJson('/api/v1/hidden/listings/100001')->assertNoContent();

    $row = HiddenListing::query()->sole();
    expect([$row->listing_number, $row->source_channel, $row->source_post_id])->toBe([100001, 'stub_channel_a', 4001]);
});

it('leaves another user\'s hidden listings as they were', function (): void {
    $other = User::factory()->create();
    HiddenListing::factory()->for($other)->create(['listing_number' => 100012]);
    HiddenListing::factory()->for($other)->create(['listing_number' => 100013]);

    $this->putJson('/api/v1/hidden/listings/100003')->assertNoContent();
    $this->deleteJson('/api/v1/hidden/listings/100012')->assertNoContent();

    expect(hiddenNumbersOf($other))->toBe([100012, 100013])
        ->and(hiddenNumbersOf($this->user))->toBe([100003]);
});
