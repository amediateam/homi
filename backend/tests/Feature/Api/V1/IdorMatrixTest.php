<?php

use App\Enums\Personal\FoundAnswerType;
use App\Enums\Personal\FoundTrigger;
use App\Enums\Personal\HiddenReason;
use App\Enums\Personal\ReportReason;
use App\Models\AccessGrant;
use App\Models\BlockedAuthor;
use App\Models\Favorite;
use App\Models\FoundAnswer;
use App\Models\HiddenListing;
use App\Models\ListingRef;
use App\Models\ListingView;
use App\Models\ListingVote;
use App\Models\User;
use Illuminate\Auth\Middleware\Authenticate;
use Illuminate\Database\Events\QueryExecuted;
use Illuminate\Http\Client\Request as HttpRequest;
use Illuminate\Routing\Route;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Route as Router;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;

/*
 * The authorisation and IDOR matrix (WP-44, `15` §3.1, SEC-REQ-014, SEC-REQ-006; brief decision 15): one row per
 * bearer route — every route behind Sanctum, however its guards are declared (`idorBehindSanctum()`) — with the
 * actors of `15` §3.1:
 *
 * - no token → `401 unauthenticated`, and a blocked user → `403 access_denied` with `blocked`, on every row;
 * - a real row runs the owner (`A`), another user (`B`) and an unknown id against HOMI's rows: B's call answers B's own
 *   data and leaves A's rows as they were, a foreign id answers exactly as an unknown one (status, body, queries), an
 *   unknown listing number is `404` where the route looks the listing up;
 * - a placeholder row is a route still answered by stubs, naming the package that makes it real and gives it its
 *   real row (radars WP-45, events WP-47, the card sample WP-53, the owner cabinet WP-84, its requests WP-85);
 * - a media row points at the ownership tests of WP-00 (`MediaOwnershipTest`), which hold B, the unknown id and the
 *   query count for the five `api.v1.media.*` routes.
 *
 * A coverage case walks `Route::getRoutes()` and fails on a bearer route without a row, and on a row without its route.
 * The listings live on the stub driver; an author is filed in `listing_refs` where a row needs one.
 */

const IDOR_UNKNOWN_ULID = '01JF0000000000000000000000';

const IDOR_AUTHOR = 'source:idor_channel';

beforeEach(function (): void {
    Http::preventStrayRequests();
});

/**
 * Whether the route sits behind Sanctum: one of its middleware is `Authenticate` (or a subclass of it) with `sanctum`
 * among its guards — `auth:sanctum`, `auth:sanctum,web`, `Authenticate::using('web', 'sanctum')`, the class name.
 */
function idorBehindSanctum(Route $route): bool
{
    foreach (Router::gatherRouteMiddleware($route) as $middleware) {
        if (! is_string($middleware)) {
            continue;
        }

        [$class, $guards] = array_pad(explode(':', $middleware, 2), 2, '');

        if (is_a($class, Authenticate::class, true) && in_array('sanctum', explode(',', $guards), true)) {
            return true;
        }
    }

    return false;
}

/**
 * Every bearer route by name, as its method and an address with sample parameters (a listing number, a ULID).
 *
 * @return array<string, array{0: string, 1: string}>
 */
function idorBearerRoutes(): array
{
    $routes = [];

    foreach (Router::getRoutes()->getRoutes() as $route) {
        if (! $route instanceof Route || ! idorBehindSanctum($route)) {
            continue;
        }

        $method = collect($route->methods())->first(fn (string $method): bool => $method !== 'HEAD');
        $uri = preg_replace_callback('/\{(\w+)\??\}/', fn (array $match): string => $match[1] === 'number' ? '100012' : IDOR_UNKNOWN_ULID, $route->uri());
        $routes[(string) ($route->getName() ?? "{$method} {$route->uri()}")] = [(string) $method, '/'.$uri];
    }

    ksort($routes);

    return $routes;
}

/**
 * The rows of the matrix by route name: `['real', Closure(User $owner, User $other): void]`, `['placeholder',
 * '<package>']` or `['media', '<test of MediaOwnershipTest>']`.
 *
 * @return array<string, array{0: 'real'|'placeholder'|'media', 1: Closure(User, User): void|string}>
 */
function idorMatrix(): array
{
    $placeholders = [
        'api.v1.events.store' => 'WP-47',
        'api.v1.settings.card-sample' => 'WP-53',
        ...array_fill_keys(['api.v1.radars.index', 'api.v1.radars.store', 'api.v1.radars.update', 'api.v1.radars.patch', 'api.v1.radars.destroy', 'api.v1.radars.relax'], 'WP-45'),
        ...array_fill_keys([
            'api.v1.owner.listings.index', 'api.v1.owner.listings.show', 'api.v1.owner.listings.store', 'api.v1.owner.listings.update',
            'api.v1.owner.listings.destroy', 'api.v1.owner.listings.status', 'api.v1.owner.listings.contact-mode',
            'api.v1.owner.listings.photos.store', 'api.v1.owner.listings.photos.order', 'api.v1.owner.listings.photos.destroy',
            'api.v1.owner.listings.phone-request', 'api.v1.owner.listings.publish', 'api.v1.owner.place', 'api.v1.owner.demand',
            'api.v1.owner.waitlist.update',
        ], 'WP-84'),
        ...array_fill_keys(['api.v1.owner.listings.requests.index', 'api.v1.owner.requests.answer', 'api.v1.listings.contact-request.store'], 'WP-85'),
    ];
    $media = [
        'api.v1.media.show' => 'returns 404 when another user shows a media file',
        'api.v1.media.destroy' => 'returns 404 when another user deletes a media file and keeps it intact',
        'api.v1.media.store' => 'deletes only the caller reference when two owners share the bytes',
        'api.v1.media.presign' => 'issues presign keys under the actor type prefix',
        'api.v1.media.register' => 'refuses to register an upload under another actor type prefix',
    ];

    return [
        ...array_map(fn (string $package): array => ['placeholder', $package], $placeholders),
        ...array_map(fn (string $test): array => ['media', $test], $media),
        ...array_map(fn (Closure $row): array => ['real', $row], idorRealRows()),
    ];
}

/**
 * The real rows: each runs the owner, another user and an unknown id against HOMI's rows.
 *
 * @return array<string, Closure(User, User): void>
 */
function idorRealRows(): array
{
    return [
        'api.v1.me.show' => function (User $owner, User $other): void {
            idorAs($owner);
            test()->getJson('/api/v1/me')->assertOk()->assertJsonPath('data.analytics.distinct_id', $owner->analytics_distinct_id);
            idorAs($other);
            test()->getJson('/api/v1/me')->assertOk()->assertJsonPath('data.analytics.distinct_id', $other->analytics_distinct_id);
        },
        'api.v1.settings.show' => function (User $owner, User $other): void {
            idorAs($owner);
            test()->patchJson('/api/v1/settings', ['currency' => 'UZS'])->assertOk();
            idorAs($other);
            test()->getJson('/api/v1/settings')->assertOk()->assertJsonPath('data.currency', 'USD');
            idorAs($owner);
            test()->getJson('/api/v1/settings')->assertOk()->assertJsonPath('data.currency', 'UZS');
        },
        'api.v1.settings.update' => function (User $owner, User $other): void {
            idorAs($owner);
            test()->patchJson('/api/v1/settings', ['currency' => 'UZS'])->assertOk();
            idorAs($other);
            test()->patchJson('/api/v1/settings', ['currency' => 'USD', 'theme' => 'dark'])->assertOk();
            idorAs($owner);
            test()->getJson('/api/v1/settings')->assertOk()->assertJsonPath('data.currency', 'UZS')->assertJsonPath('data.theme', 'auto');
        },
        'api.v1.listings.index' => fn (User $owner, User $other) => idorListingRead('/api/v1/listings?city=tashkent&deal=rent_long', $owner, $other),
        'api.v1.listings.count' => fn (User $owner, User $other) => idorListingRead('/api/v1/listings/count?city=tashkent&deal=rent_long', $owner, $other),
        'api.v1.listings.new' => fn (User $owner, User $other) => idorListingRead('/api/v1/listings/new?city=tashkent&deal=rent_long&since=1', $owner, $other),
        'api.v1.listings.flow' => fn (User $owner, User $other) => idorListingRead('/api/v1/listings/flow?city=tashkent&deal=rent_long', $owner, $other),
        'api.v1.listings.map' => fn (User $owner, User $other) => idorListingRead('/api/v1/listings/map?city=tashkent&deal=rent_long', $owner, $other),
        'api.v1.listings.show' => function (User $owner, User $other): void {
            Favorite::factory()->for($owner)->create(['listing_number' => 100012]);
            idorAs($owner);
            test()->getJson('/api/v1/listings/100012')->assertOk()->assertJsonPath('data.favorite', true);
            idorAs($other);
            test()->getJson('/api/v1/listings/100012')->assertOk()->assertJsonPath('data.favorite', false)->assertJsonPath('data.viewed', true);
            test()->getJson('/api/v1/listings/999404')->assertNotFound()->assertJsonPath('code', 'not_found');
            expect(ListingView::query()->where('user_id', $owner->id)->pluck('listing_number')->all())->toBe([100012]);
        },
        'api.v1.listings.contact' => fn (User $owner, User $other) => idorCardAction('contact', $owner, $other),
        'api.v1.listings.translation' => fn (User $owner, User $other) => idorCardAction('translation', $owner, $other),
        'api.v1.listings.share' => function (User $owner, User $other): void {
            config(['telegram.bot.username' => 'homi_idor_bot']);
            Http::fake(['api.telegram.org/*' => fn (HttpRequest $request) => Http::response(['ok' => true, 'result' => [
                'id' => 'prepared-'.$request['user_id'], 'expiration_date' => now()->addHour()->getTimestamp(),
            ]])]);
            $owner->forceFill(['telegram_user_id' => 111_000_001])->save();
            $other->forceFill(['telegram_user_id' => 111_000_002])->save();
            idorAs($owner);
            test()->postJson('/api/v1/listings/100012/share')->assertOk()->assertJsonPath('data.prepared_message_id', 'prepared-111000001');
            idorAs($other);
            test()->postJson('/api/v1/listings/100012/share')->assertOk()->assertJsonPath('data.prepared_message_id', 'prepared-111000002');
            test()->postJson('/api/v1/listings/999404/share')->assertNotFound()->assertJsonPath('code', 'not_found');
        },
        'api.v1.favorites.index' => function (User $owner, User $other): void {
            Favorite::factory()->for($owner)->create(['listing_number' => 100012]);
            Favorite::factory()->for($other)->create(['listing_number' => 100013]);
            idorAs($other);
            expect(array_column(test()->getJson('/api/v1/favorites')->assertOk()->json('data'), 'number'))->toBe([100013]);
        },
        'api.v1.favorites.update' => function (User $owner, User $other): void {
            Favorite::factory()->for($owner)->create(['listing_number' => 100012]);
            $before = idorRowsOf($owner);
            idorAs($other);
            test()->putJson('/api/v1/favorites/100012')->assertOk()->assertJsonPath('data.favorite', true);
            test()->putJson('/api/v1/favorites/100013')->assertOk();
            test()->putJson('/api/v1/favorites/999404')->assertNotFound()->assertJsonPath('code', 'not_found');
            expect(idorRowsOf($owner))->toBe($before)
                ->and(Favorite::query()->where('user_id', $other->id)->orderBy('listing_number')->pluck('listing_number')->all())->toBe([100012, 100013]);
        },
        'api.v1.favorites.destroy' => function (User $owner, User $other): void {
            Favorite::factory()->for($owner)->create(['listing_number' => 100012]);
            $before = idorRowsOf($owner);
            idorAs($other);
            test()->deleteJson('/api/v1/favorites/100012')->assertOk()->assertJsonPath('data.favorite', false);
            expect(idorRowsOf($owner))->toBe($before);
        },
        'api.v1.history.index' => function (User $owner, User $other): void {
            ListingView::factory()->for($owner)->create(['listing_number' => 100012]);
            idorAs($other);
            test()->getJson('/api/v1/history')->assertOk()->assertJsonPath('data', []);
        },
        'api.v1.history.destroy' => function (User $owner, User $other): void {
            ListingView::factory()->for($owner)->create(['listing_number' => 100012]);
            $before = idorRowsOf($owner);
            idorAs($other);
            test()->deleteJson('/api/v1/history')->assertNoContent();
            expect(idorRowsOf($owner))->toBe($before);
        },
        'api.v1.hidden.listings.update' => function (User $owner, User $other): void {
            HiddenListing::factory()->for($owner)->create(['listing_number' => 100013]);
            $before = idorRowsOf($owner);
            idorAs($other);
            test()->putJson('/api/v1/hidden/listings/100012')->assertNoContent();
            test()->putJson('/api/v1/hidden/listings/999404')->assertNotFound()->assertJsonPath('code', 'not_found');
            expect(idorRowsOf($owner))->toBe($before)
                ->and(HiddenListing::query()->where('user_id', $other->id)->pluck('listing_number')->all())->toBe([100012]);
        },
        'api.v1.hidden.listings.destroy' => function (User $owner, User $other): void {
            HiddenListing::factory()->for($owner)->create(['listing_number' => 100012]);
            $before = idorRowsOf($owner);
            idorAs($other);
            test()->deleteJson('/api/v1/hidden/listings/100012')->assertNoContent();
            expect(idorRowsOf($owner))->toBe($before);
        },
        'api.v1.listings.blocked-author.update' => function (User $owner, User $other): void {
            ListingRef::factory()->ofAuthor(IDOR_AUTHOR, 'source')->create(['listing_number' => 100012]);
            idorAs($owner);
            $mine = test()->putJson('/api/v1/listings/100012/blocked-author')->assertOk()->json('data.id');
            $before = idorRowsOf($owner);
            idorAs($other);
            $theirs = test()->putJson('/api/v1/listings/100012/blocked-author')->assertOk()->json('data.id');
            test()->putJson('/api/v1/listings/999404/blocked-author')->assertNotFound()->assertJsonPath('code', 'not_found');
            expect($theirs)->not->toBe($mine)
                ->and(idorRowsOf($owner))->toBe($before)
                ->and(BlockedAuthor::query()->where('user_id', $other->id)->sole()->id)->toBe($theirs);
        },
        'api.v1.listings.blocked-author.destroy' => function (User $owner, User $other): void {
            ListingRef::factory()->ofAuthor(IDOR_AUTHOR, 'source')->create(['listing_number' => 100012]);
            BlockedAuthor::factory()->for($owner)->create(['author_key' => IDOR_AUTHOR, 'kind' => 'source', 'label' => '@idor_channel']);
            $before = idorRowsOf($owner);
            idorAs($other);
            test()->deleteJson('/api/v1/listings/100012/blocked-author')->assertNoContent();
            expect(idorRowsOf($owner))->toBe($before);
        },
        'api.v1.hidden.index' => function (User $owner, User $other): void {
            HiddenListing::factory()->for($owner)->create(['listing_number' => 100012]);
            BlockedAuthor::factory()->for($owner)->create(['author_key' => IDOR_AUTHOR, 'kind' => 'source', 'label' => '@idor_channel']);
            HiddenListing::factory()->for($other)->create(['listing_number' => 100013]);
            idorAs($other);
            $overview = test()->getJson('/api/v1/hidden')->assertOk()->json('data');
            expect(array_column($overview['listings'], 'number'))->toBe([100013])
                ->and($overview['authors'])->toBe([]);
        },
        'api.v1.hidden.authors.destroy' => function (User $owner, User $other): void {
            $entry = BlockedAuthor::factory()->for($owner)->create(['author_key' => IDOR_AUTHOR, 'kind' => 'source', 'label' => '@idor_channel']);
            idorAs($other);
            // The first request also reads the caller's standing at the access gate, which is then kept.
            test()->getJson('/api/v1/hidden')->assertOk();
            [$foreign, $foreignQueries] = idorCounted(fn (): TestResponse => test()->deleteJson("/api/v1/hidden/authors/{$entry->id}"));
            [$unknown, $unknownQueries] = idorCounted(fn (): TestResponse => test()->deleteJson('/api/v1/hidden/authors/'.IDOR_UNKNOWN_ULID));
            $foreign->assertNotFound()->assertJsonPath('code', 'not_found');
            expect($foreign->getContent())->toBe($unknown->getContent())
                ->and($foreign->status())->toBe($unknown->status())
                ->and($foreignQueries)->toBe($unknownQueries)
                ->and(BlockedAuthor::query()->find($entry->id))->not->toBeNull();
            test()->deleteJson('/api/v1/hidden/authors/100012')->assertNotFound();
            idorAs($owner);
            test()->deleteJson("/api/v1/hidden/authors/{$entry->id}")->assertNoContent();
            test()->deleteJson("/api/v1/hidden/authors/{$entry->id}")->assertNotFound();
        },
        'api.v1.hidden.destroy' => function (User $owner, User $other): void {
            HiddenListing::factory()->for($owner)->create(['listing_number' => 100012]);
            BlockedAuthor::factory()->for($owner)->create(['author_key' => IDOR_AUTHOR, 'kind' => 'source', 'label' => '@idor_channel']);
            HiddenListing::factory()->for($other)->create(['listing_number' => 100013]);
            $before = idorRowsOf($owner);
            idorAs($other);
            test()->deleteJson('/api/v1/hidden')->assertNoContent();
            expect(idorRowsOf($owner))->toBe($before)
                ->and(HiddenListing::query()->where('user_id', $other->id)->count())->toBe(0);
        },
        'api.v1.listings.reports.store' => function (User $owner, User $other): void {
            idorAs($owner);
            test()->postJson('/api/v1/listings/100012/reports', ['reason' => 'fraud'])->assertOk();
            $before = idorRowsOf($owner);
            idorAs($other);
            foreach (['rented', 'agent', 'wrong_data', 'fraud'] as $reason) {
                test()->postJson('/api/v1/listings/100012/reports', ['reason' => $reason])->assertOk();
            }
            test()->postJson('/api/v1/listings/999404/reports', ['reason' => 'rented'])->assertNotFound()->assertJsonPath('code', 'not_found');
            expect(idorRowsOf($owner))->toBe($before)
                ->and(ListingVote::query()->where('user_id', $other->id)->count())->toBe(4);
        },
        'api.v1.listings.reports.destroy' => function (User $owner, User $other): void {
            idorAs($owner);
            test()->postJson('/api/v1/listings/100012/reports', ['reason' => 'rented'])->assertOk();
            $before = idorRowsOf($owner);
            idorAs($other);
            test()->deleteJson('/api/v1/listings/100012/reports')->assertNoContent();
            test()->deleteJson('/api/v1/listings/999404/reports')->assertNotFound()->assertJsonPath('code', 'not_found');
            expect(idorRowsOf($owner))->toBe($before)
                ->and(ListingVote::query()->where('user_id', $owner->id)->sole()->reason)->toBe(ReportReason::Rented)
                ->and(HiddenListing::query()->where('user_id', $owner->id)->sole()->reason)->toBe(HiddenReason::ReportRented);
        },
        'api.v1.surveys.found.store' => function (User $owner, User $other): void {
            FoundAnswer::factory()->for($owner)->create(['answer' => FoundAnswerType::Elsewhere, 'trigger' => FoundTrigger::Pause]);
            $before = idorRowsOf($owner);
            idorAs($other);
            test()->postJson('/api/v1/surveys/found', ['answer' => 'homi', 'trigger' => 'delete'])->assertNoContent();
            expect(idorRowsOf($owner))->toBe($before)
                ->and(FoundAnswer::query()->where('user_id', $other->id)->count())->toBe(1);
        },
        'api.v1.surveys.found.where' => function (User $owner, User $other): void {
            FoundAnswer::factory()->for($owner)->create(['answer' => FoundAnswerType::Elsewhere, 'trigger' => FoundTrigger::Pause, 'where' => null]);
            $before = idorRowsOf($owner);
            idorAs($other);
            test()->postJson('/api/v1/surveys/found/where', ['where' => 'olx'])->assertNoContent();
            expect(idorRowsOf($owner))->toBe($before)
                ->and(FoundAnswer::query()->where('user_id', $other->id)->sole()->answer)->toBeNull();
        },
    ];
}

function idorAs(User $user): void
{
    app('auth')->forgetGuards();
    Sanctum::actingAs($user, ['app:read', 'app:write']);
}

/**
 * Every personal row of the user, as the matrix compares them before and after another user's call — without the
 * listing's channel and post, which `ResolveListingRef` back-fills into every row of a number that lacks them (public
 * data of the listing, not the user's).
 *
 * @return array<string, list<array<string, mixed>>>
 */
function idorRowsOf(User $user): array
{
    $rows = [];

    foreach (['favorites', 'listing_views', 'hidden_listings', 'blocked_authors', 'listing_votes', 'found_answers', 'user_settings'] as $table) {
        $rows[$table] = array_map(
            fn (object $row): array => array_diff_key((array) $row, ['source_channel' => true, 'source_post_id' => true]),
            DB::table($table)->where('user_id', $user->id)->orderBy($table === 'user_settings' ? 'user_id' : 'id')->get()->all(),
        );
    }

    return $rows;
}

/**
 * The response of the call and the number of queries it sent.
 *
 * @param  Closure(): TestResponse  $call
 * @return array{0: TestResponse, 1: int}
 */
function idorCounted(Closure $call): array
{
    $queries = new ArrayObject;
    DB::listen(function (QueryExecuted $query) use ($queries): void {
        $queries[] = $query->sql;
    });
    $before = count($queries);
    $response = $call();

    return [$response, count($queries) - $before];
}

/**
 * A listing read for everyone (feed, count, new, flow, map): the owner's favourite, hide and block change the other
 * user's answer in nothing.
 */
function idorListingRead(string $uri, User $owner, User $other): void
{
    idorAs($other);
    $before = test()->getJson($uri)->assertOk()->json();
    idorAs($owner);
    test()->getJson($uri)->assertOk();
    Favorite::factory()->for($owner)->create(['listing_number' => 100012]);
    HiddenListing::factory()->for($owner)->create(['listing_number' => 100013]);
    BlockedAuthor::factory()->for($owner)->create(['author_key' => IDOR_AUTHOR, 'kind' => 'source', 'label' => '@idor_channel']);
    idorAs($other);

    expect(test()->getJson($uri)->assertOk()->json())->toBe($before);
}

/** A card action (contact, translation): answered for either user alike, and `404` for an unknown number. */
function idorCardAction(string $action, User $owner, User $other): void
{
    $headers = ['Accept-Language' => 'uz'];
    idorAs($owner);
    test()->postJson("/api/v1/listings/100012/{$action}", [], $headers)->assertOk();
    idorAs($other);
    test()->postJson("/api/v1/listings/100012/{$action}", [], $headers)->assertOk();
    test()->postJson("/api/v1/listings/999404/{$action}", [], $headers)->assertNotFound()->assertJsonPath('code', 'not_found');
}

it('has a row for every bearer route, and none for a route that is gone', function (): void {
    $routes = array_keys(idorBearerRoutes());
    $rows = array_keys(idorMatrix());
    sort($rows);

    expect(array_values(array_diff($routes, $rows)))->toBe([])
        ->and(array_values(array_diff($rows, $routes)))->toBe([])
        ->and($routes)->toHaveCount(59);
});

it('fails the coverage on a bearer route registered without a row, however its Sanctum guard is declared', function (string $middleware): void {
    Router::middleware(['api', $middleware])->get('api/v1/idor-probe', fn (): string => 'probe')->name('api.v1.idor-probe');
    Router::getRoutes()->refreshNameLookups();

    expect(array_values(array_diff(array_keys(idorBearerRoutes()), array_keys(idorMatrix()))))->toBe(['api.v1.idor-probe']);

    test()->getJson('/api/v1/idor-probe')->assertUnauthorized();
})->with([
    'auth:sanctum' => 'auth:sanctum',
    'Sanctum and a second guard' => 'auth:sanctum,web',
    'a second guard first' => 'auth:web,sanctum',
    'the class name' => Authenticate::class.':sanctum',
    'Authenticate::using()' => Authenticate::using('web', 'sanctum'),
]);

it('counts no route as a bearer route whose guards leave Sanctum out', function (string $middleware): void {
    Router::middleware(['api', $middleware])->get('api/v1/idor-probe', fn (): string => 'probe')->name('api.v1.idor-probe');
    Router::getRoutes()->refreshNameLookups();

    expect(idorBearerRoutes())->not->toHaveKey('api.v1.idor-probe');
})->with(['auth:web', 'a guard named like it' => 'auth:sanctum-like']);

it('counts the rows by kind: real, a placeholder naming its package, the media tests of WP-00', function (): void {
    $kinds = array_count_values(array_column(idorMatrix(), 0));
    ksort($kinds);

    expect($kinds)->toBe(['media' => 5, 'placeholder' => 26, 'real' => 28]);

    foreach (idorMatrix() as $name => [$kind, $target]) {
        if ($kind === 'placeholder') {
            expect($target)->toBeIn(['WP-45', 'WP-47', 'WP-53', 'WP-84', 'WP-85'], $name);
        }
    }
});

it('points every media row at an ownership test of WP-00 that exists', function (string $name): void {
    $test = idorMatrix()[$name][1];
    $source = (string) file_get_contents(base_path('tests/Feature/Media/MediaOwnershipTest.php'));

    expect(is_string($test) && str_contains($source, "it('{$test}'"))->toBeTrue("{$name} points at a missing test.");
})->with(['api.v1.media.show', 'api.v1.media.destroy', 'api.v1.media.store', 'api.v1.media.presign', 'api.v1.media.register']);

it('answers 401 without a token on every row', function (string $name): void {
    [$method, $uri] = idorBearerRoutes()[$name];

    test()->json($method, $uri)->assertUnauthorized()->assertJsonPath('code', 'unauthenticated');
})->with(fn (): array => array_keys(idorMatrix()));

it('answers a blocked user 403 blocked on every row, and stores nothing for him', function (string $name): void {
    [$method, $uri] = idorBearerRoutes()[$name];
    $blocked = User::factory()->telegram()->create();
    AccessGrant::factory()->for($blocked)->blocked()->create();
    Sanctum::actingAs($blocked, ['app:read', 'app:write', 'media:write']);

    test()->json($method, $uri)->assertForbidden()->assertJsonPath('code', 'access_denied')->assertJsonPath('reason', 'blocked');

    expect(array_filter(idorRowsOf($blocked)))->toBe([]);
})->with(fn (): array => array_keys(idorMatrix()));

it('holds for the owner, another user and an unknown id on every real row', function (string $name): void {
    [$kind, $row] = idorMatrix()[$name];
    [$owner, $other] = User::factory()->count(2)->create()->all();

    expect($kind)->toBe('real');

    if ($row instanceof Closure) {
        $row($owner, $other);
    }
})->with(fn (): array => array_keys(idorRealRows()));
