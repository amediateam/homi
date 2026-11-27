<?php

use App\Exceptions\Sources\SourceNotFound;
use App\Exceptions\Sources\SourceUnavailable;
use App\Jobs\Listings\ResolveListingRef;
use App\Models\BlockedAuthor;
use App\Models\Favorite;
use App\Models\HiddenListing;
use App\Models\ListingRef;
use App\Models\ListingView;
use App\Models\ListingVote;
use App\Models\User;
use App\Services\Listings\ListingPointer;
use App\Services\Personal\ListingResolver;
use App\Services\Sources\SourceContext;
use GuzzleHttp\Promise\PromiseInterface;
use Illuminate\Contracts\Queue\ShouldBeUnique;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Sleep;
use Laravel\Pennant\Feature;
use Tests\Support\LegacyFixtures;
use Tests\Support\LegacyListingsHttp;

/*
 * WP-44, step 3: `ListingResolver` owns "known, not gone, survivor" for a personal write (brief decision 11): a number
 * `listing_refs` files as live answers without a source call, a merged one as its survivor; any other — unknown, gone,
 * or merged into one HOMI does not know — asks the card source's preview (`404` → not found, unavailable → `503`) and
 * gives a pointer without channel and post, which `ResolveListingRef` back-fills after the write.
 */

beforeEach(function (): void {
    Http::preventStrayRequests();
    Sleep::fake();
    config(['legacy.media.public_url' => LegacyFixtures::MEDIA, 'legacy.rate.per_second' => 1000, 'contacts.author_key_secret' => 'listing-resolver-test-secret-of-32-bytes']);
});

function resolverOf(): ListingResolver
{
    return app(ListingResolver::class);
}

function resolvedFor(int $number): ListingPointer
{
    return resolverOf()->resolve($number, new SourceContext('ru', 'USD', User::factory()->create()));
}

function onLegacyCards(): void
{
    LegacyListingsHttp::fake();
    Feature::globally()->activate('source.listings.card', ['everyone' => 'legacy']);
}

it('resolves a number listing_refs files as live from the row, without asking the source', function (): void {
    onLegacyCards();
    ListingRef::factory()->create(['listing_number' => 100012, 'source_channel' => 'stub_channel_a', 'source_post_id' => 4812]);

    $pointer = resolvedFor(100012);

    expect([$pointer->number, $pointer->channel, $pointer->postId, $pointer->filed])->toBe([100012, 'stub_channel_a', 4812, true])
        ->and(Http::recorded())->toHaveCount(0);
});

it('resolves a merged number to its survivor through listing_refs, without asking the source', function (): void {
    onLegacyCards();
    ListingRef::factory()->create(['listing_number' => 100001, 'source_channel' => 'stub_channel_a', 'source_post_id' => 4001]);
    ListingRef::factory()->create(['listing_number' => 100016, 'merged_into' => 100001, 'author_key' => null, 'author_kind' => null, 'source_channel' => null, 'source_post_id' => null]);

    $pointer = resolvedFor(100016);

    expect([$pointer->number, $pointer->channel, $pointer->postId, $pointer->filed])->toBe([100001, 'stub_channel_a', 4001, true])
        ->and(resolverOf()->survivor(100016))->toBe(100001)
        ->and(Http::recorded())->toHaveCount(0);
});

it('asks the source for a number HOMI does not know, and answers its survivor without channel and post', function (int $asked, int $answered): void {
    $pointer = resolvedFor($asked);

    expect([$pointer->number, $pointer->channel, $pointer->postId, $pointer->filed])->toBe([$answered, null, null, false]);
})->with([
    'a listing of the stub catalogue' => [100012, 100012],
    'the stub\'s merged duplicate' => [100016, 100001],
]);

it('asks legacy\'s preview for an unknown, a gone and a merged-into-unknown number', function (): void {
    onLegacyCards();
    ListingRef::factory()->gone()->create(['listing_number' => 100004]);
    ListingRef::factory()->create(['listing_number' => 100016, 'merged_into' => 100009, 'author_key' => null, 'author_kind' => null]);
    ListingRef::factory()->gone()->create(['listing_number' => 100009]);

    expect(resolvedFor(100001)->number)->toBe(100001)
        ->and(resolvedFor(100004)->number)->toBe(100004)
        ->and(resolvedFor(100016)->number)->toBe(100001)
        ->and(LegacyListingsHttp::sent('/api/listings/100001'))->toHaveCount(1)
        ->and(LegacyListingsHttp::sent('/api/listings/100004'))->toHaveCount(1)
        ->and(LegacyListingsHttp::sent('/api/listings/100016'))->toHaveCount(1);
});

it('answers 404 for an unknown number, and 503 while the source is down unless HOMI knows the number', function (): void {
    expect(fn () => resolvedFor(999404))->toThrow(SourceNotFound::class)
        ->and(fn () => resolvedFor(999503))->toThrow(SourceUnavailable::class)
        ->and(fn () => resolvedFor(0))->toThrow(SourceNotFound::class)
        ->and(fn () => resolvedFor(-5))->toThrow(SourceNotFound::class);

    ListingRef::factory()->create(['listing_number' => 999503, 'source_channel' => 'stub_channel_a', 'source_post_id' => 1]);

    expect(resolvedFor(999503)->number)->toBe(999503);
});

it('answers 404 for a number legacy no longer knows', function (): void {
    onLegacyCards();

    expect(fn () => resolvedFor(123456))->toThrow(SourceNotFound::class);
});

it('follows a merge chain HOMI files, but never in a loop', function (): void {
    ListingRef::factory()->create(['listing_number' => 100012]);
    ListingRef::factory()->create(['listing_number' => 200001, 'merged_into' => 200002, 'author_key' => null]);
    ListingRef::factory()->create(['listing_number' => 200002, 'merged_into' => 100012, 'author_key' => null]);
    ListingRef::factory()->create(['listing_number' => 300001, 'merged_into' => 300002, 'author_key' => null]);
    ListingRef::factory()->create(['listing_number' => 300002, 'merged_into' => 300001, 'author_key' => null]);

    expect(resolverOf()->survivor(200001))->toBe(100012)
        ->and(resolverOf()->survivor(300001))->toBeInt()
        ->and(resolverOf()->survivor(424242))->toBe(424242);
});

it('names every number a row of the asked number may lie under: the number asked, the pointer\'s and its survivor, ascending', function (): void {
    ListingRef::factory()->create(['listing_number' => 100013]);
    ListingRef::factory()->create(['listing_number' => 100012, 'merged_into' => 100013, 'author_key' => null]);

    expect(resolverOf()->numbersOf(100016, new ListingPointer(100001, null, null, filed: false)))->toBe([100001, 100016])
        ->and(resolverOf()->numbersOf(100012, resolvedFor(100012)))->toBe([100012, 100013])
        ->and(resolverOf()->numbersOf(100013, resolvedFor(100013)))->toBe([100013]);
});

it('adds the numbers of the caller\'s own rows merged into a survivor of the number asked or the pointer since, one hop or several, and no other user\'s (review C, N1/N4)', function (): void {
    $user = User::factory()->create();
    $other = User::factory()->create();
    ListingRef::factory()->create(['listing_number' => 100012, 'merged_into' => 100013, 'author_key' => null]);
    ListingRef::factory()->create(['listing_number' => 100013, 'merged_into' => 100014, 'author_key' => null]);
    ListingRef::factory()->create(['listing_number' => 100014]);
    ListingRef::factory()->create(['listing_number' => 100015, 'merged_into' => 100001, 'author_key' => null]);
    ListingRef::factory()->create(['listing_number' => 100001]);
    Favorite::factory()->for($user)->create(['listing_number' => 100012]);
    Favorite::factory()->for($user)->create(['listing_number' => 100015]);
    Favorite::factory()->for($user)->create(['listing_number' => 100003]);
    Favorite::factory()->for($other)->create(['listing_number' => 100013]);
    HiddenListing::factory()->for($user)->create(['listing_number' => 100013]);
    $favourites = fn () => $user->favorites()->toBase();

    expect(resolverOf()->numbersOf(100014, null, $favourites()))->toBe([100012, 100014])
        ->and(resolverOf()->numbersOf(100014, null, $favourites(), $user->hiddenListings()->toBase()))->toBe([100012, 100013, 100014])
        ->and(resolverOf()->numbersOf(100013, null, $favourites()))->toBe([100012, 100013, 100014])
        ->and(resolverOf()->numbersOf(100012, null, $favourites()))->toBe([100012, 100014])
        ->and(resolverOf()->numbersOf(100001, null, $favourites()))->toBe([100001, 100015])
        ->and(resolverOf()->numbersOf(100003, null, $favourites()))->toBe([100003])
        ->and(resolverOf()->numbersOf(100016, new ListingPointer(100001, null, null, filed: false), $favourites()))->toBe([100001, 100015, 100016]);
});

it('reads the caller\'s merged rows in one query and follows their merges one query per hop, however many rows there are', function (): void {
    $user = User::factory()->create();
    $statements = function (int $rows) use ($user): int {
        foreach (range(1, $rows) as $i) {
            ListingRef::factory()->create(['listing_number' => 500000 + $i, 'merged_into' => 600000 + $i, 'author_key' => null]);
            ListingRef::factory()->create(['listing_number' => 600000 + $i, 'merged_into' => 700000, 'author_key' => null]);
            Favorite::factory()->for($user)->create(['listing_number' => 500000 + $i]);
        }

        $count = 0;
        DB::listen(function () use (&$count): void {
            $count++;
        });
        $numbers = resolverOf()->numbersOf(700000, null, $user->favorites()->toBase());

        expect($numbers)->toHaveCount($rows + 1);

        return $count;
    };

    expect($statements(2))->toBe(4);

    Favorite::query()->delete();
    ListingRef::query()->delete();

    expect($statements(20))->toBe(4)
        ->and(resolverOf()->survivors([500001, 600020, 700000, 424242]))->toBe([500001 => 700000, 600020 => 700000, 700000 => 700000, 424242 => 424242]);
});

it('queues the back-fill only for a pointer the source gave, on the default queue, once per number', function (): void {
    Queue::fake();

    resolverOf()->backfill(new ListingPointer(100012, 'stub_channel_a', 4812));
    resolverOf()->backfill(new ListingPointer(100013, null, null, filed: false));

    Queue::assertPushedTimes(ResolveListingRef::class, 1);
    Queue::assertPushedOn('default', ResolveListingRef::class, fn (ResolveListingRef $job): bool => $job->number === 100013);
    expect(new ResolveListingRef(100013))->toBeInstanceOf(ShouldBeUnique::class)
        ->and((new ResolveListingRef(100013))->uniqueId())->toBe('100013');
});

it('reads the card, files listing_refs and back-fills the empty source columns of every personal table for that number', function (): void {
    onLegacyCards();
    $user = User::factory()->create();
    $other = User::factory()->create();
    Favorite::factory()->for($user)->create(['listing_number' => 100001]);
    HiddenListing::factory()->for($user)->create(['listing_number' => 100001]);
    BlockedAuthor::factory()->for($user)->create(['listing_number' => 100001]);
    ListingVote::factory()->for($user)->create(['listing_number' => 100001]);
    ListingView::factory()->for($user)->create(['listing_number' => 100001]);
    Favorite::factory()->for($other)->create(['listing_number' => 100001, 'source_channel' => 'kept_channel', 'source_post_id' => 7]);
    Favorite::factory()->for($other)->create(['listing_number' => 100004]);

    app()->call([new ResolveListingRef(100001), 'handle']);

    foreach ([Favorite::class, HiddenListing::class, BlockedAuthor::class, ListingVote::class, ListingView::class] as $model) {
        $row = $model::query()->where('user_id', $user->id)->where('listing_number', 100001)->sole();
        expect([$row->source_channel, $row->source_post_id])->toBe(['stub_channel_a', 4001], $model);
    }

    expect(ListingRef::query()->find(100001)?->source_channel)->toBe('stub_channel_a')
        ->and(Favorite::query()->where('user_id', $other->id)->where('listing_number', 100001)->sole()->source_channel)->toBe('kept_channel')
        ->and(Favorite::query()->where('listing_number', 100004)->sole()->source_channel)->toBeNull();
});

it('ends quietly when the listing is gone, and releases itself while the source is down', function (): void {
    onLegacyCards();
    Favorite::factory()->create(['listing_number' => 123456]);

    $gone = (new ResolveListingRef(123456))->withFakeQueueInteractions();
    app()->call([$gone, 'handle']);
    $gone->assertNotFailed();
    $gone->assertNotReleased();

    LegacyListingsHttp::answer(fn (Request $request): ?PromiseInterface => Http::response(['detail' => 'down'], 500));
    $down = (new ResolveListingRef(100001))->withFakeQueueInteractions();
    app()->call([$down, 'handle']);
    $down->assertReleased();

    expect(Favorite::query()->sole()->source_channel)->toBeNull();
});
