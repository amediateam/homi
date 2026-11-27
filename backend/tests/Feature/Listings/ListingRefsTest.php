<?php

use App\Models\ListingRef;
use App\Models\User;
use App\Services\Listings\AuthorKey;
use App\Services\Listings\ListingPointer;
use App\Services\Listings\ListingRefs;
use App\Services\Sources\Data\ListingDetails;
use App\Services\Sources\Legacy\LegacyListingSource;
use App\Services\Sources\SourceContext;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Sleep;
use Laravel\Pennant\Feature;
use Laravel\Sanctum\Sanctum;
use Tests\Support\LegacyFixtures;
use Tests\Support\LegacyListingsHttp;
use Tests\Support\ListingArrays;

/*
 * `listing_refs` (WP-42): what `ListingRefs` files, how the legacy driver feeds it — a full card on a cache miss with
 * the author key of the raw answer, `404` as gone, another number as merged — and that no phone number is stored.
 */

const REFS_SECRET = 'listing-refs-test-secret-of-32-bytes-or-more';

beforeEach(function (): void {
    Http::preventStrayRequests();
    Sleep::fake();
    config(['legacy.media.public_url' => LegacyFixtures::MEDIA, 'legacy.rate.per_second' => 1000, 'contacts.author_key_secret' => REFS_SECRET]);
    Feature::globally()->activate('source.listings.card', ['everyone' => 'legacy']);
    Sanctum::actingAs(User::factory()->create(), ['app:read']);
});

function refs(): ListingRefs
{
    return app(ListingRefs::class);
}

/** @param  array<string, mixed>  $overrides */
function refCard(int $number, array $overrides = []): ListingDetails
{
    return ListingDetails::fromArray(ListingArrays::details(['number' => $number, ...$overrides]));
}

/** @return array<string, mixed> the row as the database holds it */
function rawRef(int $number): array
{
    return (array) DB::table('listing_refs')->where('listing_number', $number)->first();
}

it('remembers a card: channel, post, author, district; a later card keeps first_seen_at and moves last_seen_at', function (): void {
    $this->travelTo('2026-11-27 09:00:00');
    refs()->remember(refCard(100012), new AuthorKey('phone:'.str_repeat('a', 32), 'phone'));
    $this->travelTo('2026-11-27 11:00:00');
    refs()->remember(refCard(100012, ['district' => ['code' => 'chilonzor', 'name' => 'Чиланзарский']]), new AuthorKey('source:stub_channel_a', 'source'));

    $ref = ListingRef::query()->sole();
    expect($ref->listing_number)->toBe(100012)
        ->and($ref->source_channel)->toBe('stub_channel_a')
        ->and($ref->source_post_id)->toBe(4812)
        ->and($ref->author_key)->toBe('source:stub_channel_a')
        ->and($ref->author_kind)->toBe('source')
        ->and($ref->district_code)->toBe('chilonzor')
        ->and($ref->first_seen_at?->toIso8601String())->toBe('2026-11-27T09:00:00+00:00')
        ->and($ref->last_seen_at?->toIso8601String())->toBe('2026-11-27T11:00:00+00:00')
        ->and($ref->gone_at)->toBeNull()
        ->and($ref->merged_into)->toBeNull();
});

it('answers a pointer with the channel and post, or with nulls for a number it has no row for', function (): void {
    refs()->remember(refCard(100012), null);

    expect(refs()->pointer(100012))->toEqual(new ListingPointer(100012, 'stub_channel_a', 4812))
        ->and(refs()->pointer(100013))->toEqual(new ListingPointer(100013, null, null));
});

it('finds the numbers of authors and the author key of numbers', function (): void {
    ListingRef::factory()->ofAuthor('phone:one')->create(['listing_number' => 300]);
    ListingRef::factory()->ofAuthor('phone:one')->create(['listing_number' => 100]);
    ListingRef::factory()->ofAuthor('source:two', 'source')->create(['listing_number' => 200]);
    ListingRef::factory()->create(['listing_number' => 400, 'author_key' => null, 'author_kind' => null]);

    expect(refs()->numbersOfAuthors(['phone:one', 'source:two', 'phone:none']))->toBe([100, 200, 300])
        ->and(refs()->numbersOfAuthors([]))->toBe([])
        ->and(refs()->authorKeysOf([100, 200, 400, 500]))->toBe([100 => 'phone:one', 200 => 'source:two']);
});

it('marks a known number gone, and files nothing for a number it does not know', function (): void {
    ListingRef::factory()->create(['listing_number' => 100777]);

    refs()->markGone(100777);
    refs()->markGone(100778);

    expect(ListingRef::query()->find(100777)?->gone_at)->not->toBeNull()
        ->and(ListingRef::query()->find(100778))->toBeNull();
});

it('marks an asked number merged into the answered one, and a remembered card is neither merged nor gone', function (): void {
    refs()->markMerged(100016, 100001);
    refs()->markMerged(100001, 100001);
    ListingRef::factory()->gone()->create(['listing_number' => 100050, 'merged_into' => 100051]);
    refs()->remember(refCard(100050), null);

    expect(ListingRef::query()->find(100016)?->merged_into)->toBe(100001)
        ->and(ListingRef::query()->find(100001))->toBeNull()
        ->and(ListingRef::query()->find(100050)?->merged_into)->toBeNull()
        ->and(ListingRef::query()->find(100050)?->gone_at)->toBeNull();
});

it('files a legacy card on a cache miss under the keyed hash of its phone, and stores no number', function (): void {
    LegacyListingsHttp::fake();
    $this->travelTo('2026-11-27 09:00:00');
    $this->getJson('/api/v1/listings/100001')->assertOk()->assertJsonPath('meta.source', 'legacy');
    $this->travelTo('2026-11-27 09:00:30');
    $this->getJson('/api/v1/listings/100001')->assertOk();

    $expected = 'phone:'.substr(hash_hmac('sha256', '+998001234567', REFS_SECRET), 0, 32);
    $row = json_encode(rawRef(100001), JSON_THROW_ON_ERROR);
    expect(ListingRef::query()->sole()->only(['listing_number', 'source_channel', 'source_post_id', 'author_key', 'author_kind']))->toBe([
        'listing_number' => 100001, 'source_channel' => 'stub_channel_a', 'source_post_id' => 4001, 'author_key' => $expected, 'author_kind' => 'phone',
    ])
        ->and(LegacyListingsHttp::sent('/api/listings/100001'))->toHaveCount(1)
        ->and(ListingRef::query()->sole()->last_seen_at?->toIso8601String())->toBe('2026-11-27T09:00:00+00:00')
        ->and($row)->not->toContain('001234567')
        ->and($row)->not->toContain('998001234567')
        ->and($row)->not->toContain('123-45-67');
});

it('files a legacy card without a phone or a source under no author', function (): void {
    $this->getJson('/api/v1/listings/100024')->assertOk();

    expect(ListingRef::query()->find(100024)?->author_key)->toBeNull()
        ->and(ListingRef::query()->find(100024)?->author_kind)->toBeNull();
});

it('files a merged legacy answer under the answered number and marks the asked one merged', function (): void {
    $this->getJson('/api/v1/listings/100016')->assertOk()->assertJsonPath('data.number', 100001);

    expect(ListingRef::query()->find(100016)?->merged_into)->toBe(100001)
        ->and(ListingRef::query()->find(100001)?->author_kind)->toBe('phone');
});

it('marks a known number gone when legacy answers 404 for its card or its preview', function (): void {
    ListingRef::factory()->create(['listing_number' => 100777]);
    ListingRef::factory()->create(['listing_number' => 100778]);

    $this->getJson('/api/v1/listings/100777')->assertNotFound();
    $this->getJson('/api/v1/listings/100779')->assertNotFound();
    expect(app(LegacyListingSource::class)->previews([100778], new SourceContext('ru', 'USD', User::factory()->create())))->toBe([]);

    expect(ListingRef::query()->find(100777)?->gone_at)->not->toBeNull()
        ->and(ListingRef::query()->find(100778)?->gone_at)->not->toBeNull()
        ->and(ListingRef::query()->find(100779))->toBeNull();
});

it('files nothing for a preview read', function (): void {
    LegacyListingsHttp::fake();

    $this->getJson('/api/v1/listings/100002?preview=1')->assertOk();

    expect(ListingRef::query()->count())->toBe(0)
        ->and(LegacyListingsHttp::sent('/api/listings/100002'))->toHaveCount(1);
});
