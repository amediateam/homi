<?php

use App\Events\Listings\ContactDisclosed;
use App\Models\BlockedAuthor;
use App\Models\ListingRef;
use App\Models\User;
use App\Services\Listings\AuthorKey;
use App\Services\Listings\ContactDisclosure;
use Illuminate\Log\Events\MessageLogged;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Sleep;
use Laravel\Pennant\Feature;
use Laravel\Sanctum\Sanctum;
use Tests\Support\ContractShapes;
use Tests\Support\JsonShape;
use Tests\Support\LegacyFixtures;
use Tests\Support\LegacyListingsHttp;

/*
 * WP-44, step 6: blocked authors in HOMI's table (task `KV-BE-041`, BR-API-097 … BR-API-099). The author is the key
 * `listing_refs` files for the listing (WP-42's `AuthorKey`), else the one a card read files; the stub driver files
 * none, so a block answers `404` there (brief decision 14). The label is built once, at block time: a phone author's
 * from the number the legacy source holds in its contact entry — read like `hasContact()`, so no quota, no
 * `ContactDisclosed` and no call link — masked to its last two digits; a source author's `@channel`. Unblocking by
 * listing and by entry act on the same entry (fix of LB-API-040); a foreign entry is not found like an unknown one.
 */

const BLOCK_SECRET = 'blocked-authors-test-secret-of-32-bytes';

/** The digit forms of the synthetic number of `listing.rent_apartment` (+998001234567). */
const BLOCK_RAW_PHONES = ['+998001234567', '998001234567', '001234567', '00 123 45 67', '00 123-45-67', '123-45-67', '1234567'];

beforeEach(function (): void {
    Http::preventStrayRequests();
    Sleep::fake();
    config(['legacy.media.public_url' => LegacyFixtures::MEDIA, 'legacy.rate.per_second' => 1000, 'contacts.author_key_secret' => BLOCK_SECRET]);
    $this->user = User::factory()->telegram()->create();
    Sanctum::actingAs($this->user, ['app:read', 'app:write']);
});

function onLegacyBlocks(): void
{
    LegacyListingsHttp::fake();
    Feature::globally()->activate('source.listings.card', ['everyone' => 'legacy']);
}

/** The author key HOMI files for the phone of `listing.rent_apartment`. */
function rentApartmentKey(): string
{
    return AuthorKey::fromCard(['phone' => '+998001234567'])?->key ?? throw new LogicException('No key derived.');
}

it('blocks a phone author: an entry with the masked label, the card\'s count and the author\'s listings HOMI knows', function (): void {
    onLegacyBlocks();
    ListingRef::factory()->ofAuthor(rentApartmentKey())->create(['listing_number' => 100777]);
    ListingRef::factory()->ofAuthor(rentApartmentKey())->gone()->create(['listing_number' => 100778]);

    $response = $this->putJson('/api/v1/listings/100001/blocked-author')->assertOk()->assertJsonPath('meta.source', 'native');

    JsonShape::assertSame(['success' => 'bool', 'data' => ContractShapes::BLOCKED_AUTHOR_RESULT, 'meta' => ['source' => 'string']], JsonShape::of($response->json()));
    $entry = BlockedAuthor::query()->sole();
    expect($response->json('data'))->toBe([
        'id' => $entry->id,
        'kind' => 'phone',
        'label' => '+998 ** *** ** 67',
        'count' => 3,
        'listing_numbers' => [100001, 100777, 100778],
    ])
        ->and($entry->id)->toMatch('/^[0-9A-HJKMNP-TV-Z]{26}$/')
        ->and([$entry->user_id, $entry->author_key, $entry->kind, $entry->label])->toBe([$this->user->id, rentApartmentKey(), 'phone', '+998 ** *** ** 67'])
        ->and([$entry->listing_number, $entry->source_channel, $entry->source_post_id])->toBe([100001, 'stub_channel_a', 4001]);
});

it('blocks a source author by its channel', function (): void {
    onLegacyBlocks();

    $response = $this->putJson('/api/v1/listings/100002/blocked-author')->assertOk();

    expect($response->json('data.kind'))->toBe('source')
        ->and($response->json('data.label'))->toBe('@stub_channel_b')
        ->and($response->json('data.listing_numbers'))->toBe([100002])
        ->and(BlockedAuthor::query()->sole()->author_key)->toBe('source:stub_channel_b');
});

it('answers the same entry for a repeat, without reading the source again', function (): void {
    onLegacyBlocks();

    $first = $this->putJson('/api/v1/listings/100001/blocked-author')->assertOk();
    $calls = count(Http::recorded());
    $second = $this->putJson('/api/v1/listings/100001/blocked-author')->assertOk();

    expect($second->json('data.id'))->toBe($first->json('data.id'))
        ->and($second->json('data.label'))->toBe($first->json('data.label'))
        ->and(BlockedAuthor::query()->count())->toBe(1)
        ->and(count(Http::recorded()))->toBe($calls);
});

it('builds the label from the source\'s own label when the contact entry holds no number (mode link)', function (): void {
    onLegacyBlocks();
    config(['legacy.contact.mode' => 'link']);

    $this->putJson('/api/v1/listings/100001/blocked-author')->assertOk()->assertJsonPath('data.label', '+998 ** *** ** 67');
});

it('is no disclosure: no quota, no ContactDisclosed, no call link, and no digit of the number in an answer or a log line', function (): void {
    onLegacyBlocks();
    Event::fake([ContactDisclosed::class]);
    $lines = new ArrayObject;
    Log::listen(function (MessageLogged $entry) use ($lines): void {
        $lines[] = $entry->message.' '.json_encode($entry->context);
    });

    $answer = (string) $this->putJson('/api/v1/listings/100001/blocked-author')->assertOk()->getContent();

    Event::assertNotDispatched(ContactDisclosed::class);
    expect(LegacyListingsHttp::sent('/api/listings/100001/call'))->toBe([])
        ->and(Cache::get(ContactDisclosure::key($this->user)))->toBeNull();

    foreach ([$answer, ...$lines->getArrayCopy(), (string) json_encode(DB::table('blocked_authors')->get())] as $text) {
        foreach (BLOCK_RAW_PHONES as $digits) {
            expect($text)->not->toContain($digits);
        }
    }
});

it('answers 404 for a listing without an author, and for an unknown one', function (int $number): void {
    onLegacyBlocks();

    $this->putJson("/api/v1/listings/{$number}/blocked-author")->assertNotFound()->assertJsonPath('code', 'not_found');

    expect(BlockedAuthor::query()->count())->toBe(0);
})->with([
    'no author, no channel' => [100024],
    'the minimal card' => [100014],
    'unknown to legacy' => [123456],
]);

it('answers 404 on the stub driver, which files no author key (decision 14), and 503 while the source is down', function (): void {
    $this->putJson('/api/v1/listings/100001/blocked-author')->assertNotFound()->assertJsonPath('code', 'not_found');
    $this->putJson('/api/v1/listings/999503/blocked-author')->assertStatus(503)->assertJsonPath('code', 'source_unavailable');
    $this->putJson('/api/v1/listings/0/blocked-author')->assertNotFound();

    expect(BlockedAuthor::query()->count())->toBe(0);
});

it('blocks the author of a listing HOMI knows without a card read, and the survivor\'s author for an alias', function (): void {
    onLegacyBlocks();
    ListingRef::factory()->ofAuthor('source:known_channel', 'source')->create(['listing_number' => 100005, 'source_channel' => 'known_channel', 'source_post_id' => 9]);
    ListingRef::factory()->create(['listing_number' => 100006, 'merged_into' => 100005, 'author_key' => null, 'author_kind' => null]);

    $response = $this->putJson('/api/v1/listings/100006/blocked-author')->assertOk();

    expect($response->json('data'))->toMatchArray(['kind' => 'source', 'label' => '@known_channel', 'count' => 1, 'listing_numbers' => [100005, 100006]])
        ->and(Http::recorded())->toHaveCount(0);
});

it('lists the author with count 0 once none of the author\'s listings is left', function (): void {
    onLegacyBlocks();
    ListingRef::factory()->ofAuthor('source:empty_channel', 'source')->gone()->create(['listing_number' => 100009]);
    ListingRef::factory()->ofAuthor('source:empty_channel', 'source')->create(['listing_number' => 100011, 'source_channel' => 'empty_channel']);
    $this->putJson('/api/v1/listings/100011/blocked-author')->assertOk();
    ListingRef::query()->whereKey(100011)->update(['gone_at' => now()]);

    $this->getJson('/api/v1/hidden')->assertOk()->assertJsonPath('data.authors.0.count', 0)->assertJsonPath('data.authors.0.label', '@empty_channel');
});

it('unblocks by listing with 204, twice, and when the author was never blocked, without asking the source', function (): void {
    onLegacyBlocks();
    $this->putJson('/api/v1/listings/100001/blocked-author')->assertOk();
    $calls = count(Http::recorded());

    $this->deleteJson('/api/v1/listings/100001/blocked-author')->assertNoContent();
    $this->deleteJson('/api/v1/listings/100001/blocked-author')->assertNoContent();
    $this->deleteJson('/api/v1/listings/123456/blocked-author')->assertNoContent();
    $this->deleteJson('/api/v1/listings/0/blocked-author')->assertNotFound();

    expect(BlockedAuthor::query()->count())->toBe(0)
        ->and(count(Http::recorded()))->toBe($calls);
});

it('unblocks by listing and by entry the same entry', function (string $by): void {
    onLegacyBlocks();
    $id = $this->putJson('/api/v1/listings/100001/blocked-author')->assertOk()->json('data.id');

    $by === 'listing'
        ? $this->deleteJson('/api/v1/listings/100001/blocked-author')->assertNoContent()
        : $this->deleteJson("/api/v1/hidden/authors/{$id}")->assertNoContent();

    expect(BlockedAuthor::query()->count())->toBe(0);
    $this->deleteJson("/api/v1/hidden/authors/{$id}")->assertNotFound()->assertJsonPath('code', 'not_found');
})->with(['listing', 'entry']);

it('removes an entry by its id, lower case too, and answers 404 for a second call, a listing number and another user\'s id', function (): void {
    $entry = BlockedAuthor::factory()->for($this->user)->create();
    $foreign = BlockedAuthor::factory()->for(User::factory())->create();

    $this->deleteJson('/api/v1/hidden/authors/'.strtolower($entry->id))->assertNoContent();
    $this->deleteJson("/api/v1/hidden/authors/{$entry->id}")->assertNotFound()->assertJsonPath('code', 'not_found');
    $this->deleteJson('/api/v1/hidden/authors/100001')->assertNotFound()->assertJsonPath('code', 'not_found');
    $this->deleteJson("/api/v1/hidden/authors/{$foreign->id}")->assertNotFound()->assertJsonPath('code', 'not_found');

    expect(BlockedAuthor::query()->pluck('id')->all())->toBe([$foreign->id]);
});

it('answers a foreign entry id exactly as an unknown one: the same body and the same queries', function (): void {
    $foreign = BlockedAuthor::factory()->for(User::factory())->create();
    $unknown = '01JD0000000000000000000099';

    $answer = function (string $id): array {
        DB::flushQueryLog();
        DB::enableQueryLog();
        $body = (string) $this->deleteJson("/api/v1/hidden/authors/{$id}")->assertNotFound()->getContent();
        $queries = array_map(fn (array $query): string => (string) preg_replace("/'[0-9A-Z]{26}'/", '?', (string) $query['query']), DB::getQueryLog());
        DB::disableQueryLog();

        return [$body, $queries];
    };

    // The first request also reads the caller's standing at the access gate, which is then cached.
    $this->getJson('/api/v1/hidden')->assertOk();
    [$foreignBody, $foreignQueries] = $answer($foreign->id);
    [$unknownBody, $unknownQueries] = $answer($unknown);

    expect($foreignBody)->toBe($unknownBody)
        ->and($foreignQueries)->toBe($unknownQueries)
        ->and(BlockedAuthor::query()->count())->toBe(1);
});

it('lets only the owner remove an entry, refusing anyone else as not found (BlockedAuthorPolicy)', function (): void {
    $entry = BlockedAuthor::factory()->for($this->user)->create();
    $stranger = User::factory()->create();

    $refusal = Gate::forUser($stranger)->inspect('delete', $entry);

    expect(Gate::forUser($this->user)->allows('delete', $entry))->toBeTrue()
        ->and($refusal->denied())->toBeTrue()
        ->and($refusal->status())->toBe(404);
});

it('leaves another user\'s blocks as they were', function (): void {
    onLegacyBlocks();
    $other = User::factory()->create();
    $kept = BlockedAuthor::factory()->for($other)->create(['author_key' => rentApartmentKey()]);

    $this->putJson('/api/v1/listings/100001/blocked-author')->assertOk();
    $this->deleteJson('/api/v1/listings/100001/blocked-author')->assertNoContent();

    expect(BlockedAuthor::query()->pluck('id')->all())->toBe([$kept->id]);
});
