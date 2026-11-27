<?php

use App\Enums\Personal\HiddenReason;
use App\Models\BlockedAuthor;
use App\Models\Favorite;
use App\Models\HiddenListing;
use App\Models\ListingRef;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\Support\ContractShapes;
use Tests\Support\JsonShape;

/*
 * WP-44, step 6: «Скрытое» (task `KV-BE-042`, BR-API-099): `GET /hidden` answers the caller's hidden listings — every
 * reason, newest first, at most 200 — and every blocked author with the live listings HOMI files under its key, in one
 * answer as legacy does; `DELETE /hidden` clears both lists of the caller only, in one transaction. Radar hide rules
 * are WP-45's and are not here.
 */

beforeEach(function (): void {
    Http::preventStrayRequests();
    $this->user = User::factory()->create();
    Sanctum::actingAs($this->user, ['app:read', 'app:write']);
});

/**
 * Hides the numbers for the user, the first one oldest.
 *
 * @param  list<int>  $numbers
 */
function hideInOrder(User $user, array $numbers, HiddenReason $reason = HiddenReason::Manual): void
{
    foreach ($numbers as $i => $number) {
        HiddenListing::factory()->for($user)->create(['listing_number' => $number, 'reason' => $reason, 'created_at' => now()->subMinutes(count($numbers) - $i)]);
    }
}

/** The statements one `GET /hidden` sends. */
function hiddenOverviewQueries(): int
{
    DB::flushQueryLog();
    DB::enableQueryLog();
    test()->getJson('/api/v1/hidden')->assertOk();
    $count = count(DB::getQueryLog());
    DB::disableQueryLog();

    return $count;
}

it('answers both lists empty, from the native source', function (): void {
    $this->getJson('/api/v1/hidden')->assertOk()
        ->assertExactJson(['success' => true, 'data' => ['listings' => [], 'authors' => []], 'meta' => ['source' => 'native']]);
});

it('lists the hidden listings of every reason, newest first, and the blocked authors with their counts', function (): void {
    hideInOrder($this->user, [100012]);
    hideInOrder($this->user, [100013], HiddenReason::ReportRented);
    hideInOrder($this->user, [100003], HiddenReason::ReportFraud);
    HiddenListing::query()->where('listing_number', 100013)->update(['created_at' => now()->subSeconds(30)]);
    HiddenListing::query()->where('listing_number', 100003)->update(['created_at' => now()->subSeconds(10)]);
    $older = BlockedAuthor::factory()->for($this->user)->create(['author_key' => 'phone:'.str_repeat('a', 32), 'label' => '+998 ** *** ** 41', 'created_at' => now()->subDay()]);
    $newer = BlockedAuthor::factory()->for($this->user)->ofSource('stub_channel_b')->create(['created_at' => now()->subHour()]);
    foreach ([200001, 200002, 200003] as $number) {
        ListingRef::factory()->ofAuthor('phone:'.str_repeat('a', 32))->create(['listing_number' => $number]);
    }
    ListingRef::factory()->ofAuthor('phone:'.str_repeat('a', 32))->gone()->create(['listing_number' => 200004]);
    ListingRef::factory()->ofAuthor('source:stub_channel_b', 'source')->create(['listing_number' => 200005]);

    $response = $this->getJson('/api/v1/hidden')->assertOk();

    JsonShape::assertSame(['success' => 'bool', 'data' => ContractShapes::HIDDEN, 'meta' => ['source' => 'string']], JsonShape::of($response->json()));
    expect(array_column($response->json('data.listings'), 'number'))->toBe([100003, 100013, 100012])
        ->and($response->json('data.authors'))->toBe([
            ['id' => $newer->id, 'kind' => 'source', 'label' => '@stub_channel_b', 'count' => 1],
            ['id' => $older->id, 'kind' => 'phone', 'label' => '+998 ** *** ** 41', 'count' => 3],
        ]);
});

it('leaves out a hidden listing the source no longer knows and marks it gone', function (): void {
    hideInOrder($this->user, [100012, 123456]);
    ListingRef::factory()->create(['listing_number' => 123456]);

    expect(array_column($this->getJson('/api/v1/hidden')->assertOk()->json('data.listings'), 'number'))->toBe([100012])
        ->and(ListingRef::query()->find(123456)?->gone_at)->not->toBeNull();
});

it('answers 503 while the source cannot give the hidden listings', function (): void {
    hideInOrder($this->user, [100012]);

    $this->getJson('/api/v1/hidden', ['X-Stub-Scenario' => 'source_unavailable'])->assertStatus(503)->assertJsonPath('code', 'source_unavailable');
});

it('reads the overview with the same statements for one item and for twenty (no N+1)', function (): void {
    hideInOrder($this->user, [100012]);
    BlockedAuthor::factory()->for($this->user)->create();
    // The first request also reads the caller's standing at the access gate, which is then cached.
    $this->getJson('/api/v1/hidden')->assertOk();
    $one = hiddenOverviewQueries();

    hideInOrder($this->user, [100013, 100003, 100001, 100002, 100004, 100005, 100007, 100008, 100009, 100010, 100011, 100014, 100015, 100017, 100018, 100019, 100020, 100021, 100022]);
    BlockedAuthor::factory()->for($this->user)->count(19)->create();

    expect(hiddenOverviewQueries())->toBe($one);
});

it('answers at most the 200 newest hidden listings', function (): void {
    $numbers = range(300001, 300205);
    HiddenListing::query()->insert(array_map(fn (int $number): array => [
        'user_id' => $this->user->id, 'listing_number' => $number, 'reason' => 'manual', 'created_at' => now()->subMinutes(300300 - $number),
    ], $numbers));
    ListingRef::query()->insert(array_map(fn (int $number): array => ['listing_number' => $number, 'first_seen_at' => now(), 'last_seen_at' => now()], $numbers));

    $this->getJson('/api/v1/hidden')->assertOk();

    expect(ListingRef::query()->whereNotNull('gone_at')->count())->toBe(200)
        ->and(ListingRef::query()->whereNull('gone_at')->orderBy('listing_number')->pluck('listing_number')->all())->toBe(range(300001, 300005));
});

it('clears the hidden listings and the blocked authors of the caller only, with 204, twice', function (): void {
    $other = User::factory()->create();
    hideInOrder($this->user, [100012, 100013]);
    BlockedAuthor::factory()->for($this->user)->count(2)->create();
    hideInOrder($other, [100012]);
    $kept = BlockedAuthor::factory()->for($other)->create();
    Favorite::factory()->for($this->user)->create(['listing_number' => 100012]);

    $this->deleteJson('/api/v1/hidden')->assertNoContent();
    $this->deleteJson('/api/v1/hidden')->assertNoContent();

    $this->getJson('/api/v1/hidden')->assertOk()->assertJsonPath('data', ['listings' => [], 'authors' => []]);
    expect(HiddenListing::query()->where('user_id', $other->id)->count())->toBe(1)
        ->and(BlockedAuthor::query()->pluck('id')->all())->toBe([$kept->id])
        ->and(Favorite::query()->count())->toBe(1);
});
