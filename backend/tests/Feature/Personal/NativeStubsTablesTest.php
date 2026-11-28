<?php

use App\Models\AuthorMark;
use App\Models\BlockedAuthor;
use App\Models\Favorite;
use App\Models\FoundAnswer;
use App\Models\HiddenListing;
use App\Models\ListingMark;
use App\Models\ListingRef;
use App\Models\ListingVote;
use App\Models\Radar;
use App\Models\RadarHideRule;
use App\Models\User;
use App\Models\VoteDecision;
use Illuminate\Database\Events\QueryExecuted;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;

/*
 * WP-44, brief decision 10: while `sources.native_stubs` is on — the end-to-end suite, and a developer's database
 * without this package's migrations — no query touches any of HOMI's eight personal tables. The feed, the map, the
 * card and its preview skip the overlay (so neither the per-user sets, nor the realtor-key cache, nor a detector check
 * reads them), and every personal route answers its WP-13 stub body from `NativeStubs`. The user here holds rows in
 * every table, so a read anywhere would show.
 */

/** The eight tables of WP-44. */
const PERSONAL_TABLES = ['favorites', 'hidden_listings', 'blocked_authors', 'listing_votes', 'vote_decisions', 'listing_marks', 'author_marks', 'found_answers'];

beforeEach(function (): void {
    Http::preventStrayRequests();
    config(['sources.native_stubs' => true]);
    $this->user = User::factory()->create();
    Sanctum::actingAs($this->user, ['app:read', 'app:write']);
    Favorite::factory()->for($this->user)->create(['listing_number' => 100012]);
    HiddenListing::factory()->for($this->user)->create(['listing_number' => 100013]);
    BlockedAuthor::factory()->for($this->user)->create(['author_key' => 'phone:'.str_repeat('a', 32)]);
    ListingRef::factory()->ofAuthor('phone:'.str_repeat('a', 32))->create(['listing_number' => 100003]);
    ListingVote::factory()->for($this->user)->create(['listing_number' => 100012]);
    VoteDecision::factory()->create();
    ListingMark::factory()->create(['listing_number' => 100001]);
    AuthorMark::factory()->create(['author_key' => 'phone:'.str_repeat('a', 32)]);
    FoundAnswer::factory()->for($this->user)->create();
});

it('sends no query to a personal table on the listing reads and every personal route', function (string $method, string $uri, array $body, int $status): void {
    $statements = new ArrayObject;
    DB::listen(function (QueryExecuted $query) use ($statements): void {
        $statements[] = $query->sql;
    });

    $response = $this->json($method, $uri, $body)->assertStatus($status);

    $touching = array_values(array_filter(
        $statements->getArrayCopy(),
        fn (string $sql): bool => preg_match('/\b(?:'.implode('|', PERSONAL_TABLES).')\b/', $sql) === 1,
    ));
    expect($touching)->toBe([]);

    if ($status === 200) {
        $response->assertJsonPath('meta.source', 'stub');
    }
})->with([
    'the feed' => ['GET', '/api/v1/listings?city=tashkent&deal=rent_long', [], 200],
    'the map' => ['GET', '/api/v1/listings/map?city=tashkent&deal=rent_long', [], 200],
    'the card' => ['GET', '/api/v1/listings/100012', [], 200],
    'the preview' => ['GET', '/api/v1/listings/100013?preview=1', [], 200],
    'favourites' => ['GET', '/api/v1/favorites', [], 200],
    'set a favourite' => ['PUT', '/api/v1/favorites/100012', [], 200],
    'unset a favourite' => ['DELETE', '/api/v1/favorites/100012', [], 200],
    'history' => ['GET', '/api/v1/history', [], 200],
    'clear the history' => ['DELETE', '/api/v1/history', [], 204],
    'hide' => ['PUT', '/api/v1/hidden/listings/100012', [], 204],
    'unhide' => ['DELETE', '/api/v1/hidden/listings/100013', [], 204],
    'block' => ['PUT', '/api/v1/listings/100001/blocked-author', [], 200],
    'unblock' => ['DELETE', '/api/v1/listings/100003/blocked-author', [], 204],
    'the hidden overview' => ['GET', '/api/v1/hidden', [], 200],
    'remove a blocked author' => ['DELETE', '/api/v1/hidden/authors/01JD0000000000000000000011', [], 204],
    'clear the hidden lists' => ['DELETE', '/api/v1/hidden', [], 204],
    'report' => ['POST', '/api/v1/listings/100012/reports', ['reason' => 'agent'], 200],
    'withdraw a report' => ['DELETE', '/api/v1/listings/100012/reports', [], 204],
    'the found survey' => ['POST', '/api/v1/surveys/found', ['answer' => 'elsewhere', 'trigger' => 'pause'], 204],
    'where it was found' => ['POST', '/api/v1/surveys/found/where', ['where' => 'olx'], 204],
]);

it('leaves every personal row as it was', function (): void {
    $before = array_map(fn (string $table): int => DB::table($table)->count(), PERSONAL_TABLES);

    $this->putJson('/api/v1/favorites/100013')->assertOk();
    $this->deleteJson('/api/v1/favorites/100012')->assertOk();
    $this->putJson('/api/v1/hidden/listings/100012')->assertNoContent();
    $this->deleteJson('/api/v1/hidden')->assertNoContent();
    $this->deleteJson('/api/v1/history')->assertNoContent();
    $this->postJson('/api/v1/listings/100013/reports', ['reason' => 'rented'])->assertOk();
    $this->postJson('/api/v1/listings/100012/reports', ['reason' => 'agent'], ['X-Stub-Scenario' => 'agent_marked'])->assertOk()->assertJsonPath('data.agent_marked', true);
    $this->deleteJson('/api/v1/listings/100012/reports')->assertNoContent();
    $this->postJson('/api/v1/surveys/found', ['answer' => 'elsewhere', 'trigger' => 'delete'])->assertNoContent();
    $this->postJson('/api/v1/surveys/found/where', ['where' => 'olx'])->assertNoContent();

    expect(array_map(fn (string $table): int => DB::table($table)->count(), PERSONAL_TABLES))->toBe($before);
});

/*
 * WP-45, brief decision 11: the same holds for the two radar tables — the six radar routes answer their WP-13 stub
 * bodies from `NativeStubs`, and the feed reads no radar. The user here has a radar with a hide rule.
 */

/** The two tables of WP-45. */
const RADAR_TABLES = ['radars', 'radar_hide_rules'];

/** A radar id of `radars/list.json`. */
const NATIVE_STUB_RADAR_ID = '01JD0000000000000000000001';

describe('radars', function (): void {
    beforeEach(function (): void {
        RadarHideRule::factory()->for(Radar::factory()->for($this->user))->create();
    });

    it('sends no query to a radar table on the feed and the six radar routes', function (string $method, string $uri, array $body, int $status): void {
        $statements = new ArrayObject;
        DB::listen(function (QueryExecuted $query) use ($statements): void {
            $statements[] = $query->sql;
        });

        $this->json($method, $uri, $body)->assertStatus($status)->assertJsonPath('meta.source', 'stub');

        $touching = array_values(array_filter(
            $statements->getArrayCopy(),
            fn (string $sql): bool => preg_match('/\b(?:'.implode('|', RADAR_TABLES).')\b/', $sql) === 1,
        ));
        expect($touching)->toBe([]);
    })->with([
        'the feed' => ['GET', '/api/v1/listings?city=tashkent&deal=rent_long', [], 200],
        'the list' => ['GET', '/api/v1/radars?include=previews', [], 200],
        'create' => ['POST', '/api/v1/radars', ['filters' => ['city' => 'tashkent', 'deal' => 'rent_long'], 'entry' => 'filters'], 201],
        'replace' => ['PUT', '/api/v1/radars/'.NATIVE_STUB_RADAR_ID, ['filters' => ['city' => 'tashkent', 'deal' => 'rent_long']], 200],
        'switch on' => ['PATCH', '/api/v1/radars/'.NATIVE_STUB_RADAR_ID, ['active' => true], 200],
        'pause' => ['PATCH', '/api/v1/radars/'.NATIVE_STUB_RADAR_ID, ['active' => false], 200],
        'mode' => ['PATCH', '/api/v1/radars/'.NATIVE_STUB_RADAR_ID, ['mode' => 'digest'], 200],
        'unhide' => ['PATCH', '/api/v1/radars/'.NATIVE_STUB_RADAR_ID, ['unhide' => true], 200],
        'delete' => ['DELETE', '/api/v1/radars/'.NATIVE_STUB_RADAR_ID, [], 200],
        'relax' => ['POST', '/api/v1/radars/'.NATIVE_STUB_RADAR_ID.'/relax', ['code' => 'price_more'], 200],
    ]);

    it('leaves every radar row as it was, also while radars are switched off', function (): void {
        $before = Radar::query()->orderBy('id')->get()->toArray();

        $this->postJson('/api/v1/radars', ['filters' => ['city' => 'tashkent', 'deal' => 'rent_long', 'price_max' => 700], 'entry' => 'filters'])->assertCreated();
        $this->patchJson('/api/v1/radars/'.NATIVE_STUB_RADAR_ID, ['unhide' => true])->assertOk();
        $this->deleteJson('/api/v1/radars/'.NATIVE_STUB_RADAR_ID)->assertOk();
        config(['radar.creation_enabled' => false]);
        $this->getJson('/api/v1/radars')->assertOk()->assertJsonPath('data', []);
        $this->deleteJson('/api/v1/radars/'.NATIVE_STUB_RADAR_ID)->assertOk()->assertJsonPath('data', ['ask_found' => false]);

        expect(Radar::query()->orderBy('id')->get()->toArray())->toBe($before)
            ->and(RadarHideRule::query()->count())->toBe(1);
    });
});
