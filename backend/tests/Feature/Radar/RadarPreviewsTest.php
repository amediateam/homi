<?php

use App\Enums\ListingSort;
use App\Enums\Radar\HideRuleKind;
use App\Exceptions\Sources\SourceUnavailable;
use App\Models\Favorite;
use App\Models\HiddenListing;
use App\Models\Radar;
use App\Models\RadarHideRule;
use App\Models\User;
use App\Services\Radar\RadarPreviews;
use App\Services\Radars\RadarPreview;
use App\Services\Search\ListingQuery;
use App\Services\Sources\Data\FlowEstimate;
use App\Services\Sources\Data\ListingSummary;
use App\Services\Sources\Legacy\LegacyListingSource;
use App\Services\Sources\SourceContext;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\Support\FakeListingSource;

/*
 * WP-45, step 8: what each radar would find now (`GET /radars?include=previews`). The shared part — the first feed page
 * by `new`, the count and the flow of the stored filters — is one source round per filter set, asked without a user
 * and cached for `radar.preview_ttl` (120 s) per filters (with `posted_days`), locale and currency, shared by users;
 * the caller's overlay and the radar's hide rules are applied per user, then the first five are kept. A failure, or
 * the spent budget of `radar.preview_budget_ms`, leaves `null` for the remaining radars that are not cached.
 */

beforeEach(function (): void {
    Http::preventStrayRequests();
    $this->source = FakeListingSource::bind()->withItems([
        100001 => [], 100002 => [], 100003 => [], 100004 => [], 100005 => [], 100006 => [], 100007 => [],
    ]);
    $this->source->count = 42;
    $this->source->flow = new FlowEstimate(9, 7, []);
    $this->user = User::factory()->create();
    $this->context = new SourceContext('ru', 'USD', $this->user);
});

/**
 * The previews of a user's radars in creation order.
 *
 * @return array<string, RadarPreview|null>
 */
function previewsOf(User $user, ?SourceContext $context = null): array
{
    return app(RadarPreviews::class)->forRadars($user, $user->radars()->orderBy('created_at')->orderBy('id')->get()->all(), $context ?? new SourceContext('ru', 'USD', $user));
}

/** @return list<int> */
function previewNumbers(?RadarPreview $preview): array
{
    return array_map(fn (ListingSummary $item): int => $item->number, $preview?->items ?? []);
}

/** The number of feed, count and flow calls the fake has answered. */
function sourceRounds(FakeListingSource $source): array
{
    return [count($source->callsOf('feed')), count($source->callsOf('count')), count($source->callsOf('flow'))];
}

it('reads the first feed page by new, the count and the flow of the stored filters, without the user, and keeps five', function (): void {
    $radar = Radar::factory()->for($this->user)->filters(['price_max' => 700, 'posted_days' => 7])->create();

    $preview = previewsOf($this->user, new SourceContext('uz', 'UZS', $this->user))[$radar->id];

    [[, $query, $context]] = $this->source->callsOf('feed');
    expect($query)->toBeInstanceOf(ListingQuery::class)
        ->and($query->sort)->toBe(ListingSort::New)
        ->and($query->cursor)->toBeNull()
        ->and($query->limit)->toBe(20)
        ->and($query->filters->toArray())->toBe($radar->filters)
        ->and($context->user)->toBeNull()
        ->and([$context->locale, $context->currency, $context->foreground])->toBe(['uz', 'UZS', true])
        ->and($this->source->callsOf('count')[0][2]->user)->toBeNull()
        ->and($this->source->callsOf('flow')[0][2]->user)->toBeNull()
        ->and(previewNumbers($preview))->toBe([100001, 100002, 100003, 100004, 100005])
        ->and([$preview?->count, $preview?->flowWeek, $preview?->flowDays])->toBe([42, 9, 7]);
});

it('asks the source once per filter set and serves another user with the same search from the cache', function (): void {
    $other = User::factory()->create();
    $mine = Radar::factory()->for($this->user)->filters(['price_max' => 700])->create();
    $theirs = Radar::factory()->for($other)->filters(['price_max' => 700])->create();

    $first = previewsOf($this->user)[$mine->id];
    $second = previewsOf($other)[$theirs->id];

    expect(sourceRounds($this->source))->toBe([1, 1, 1])
        ->and(previewNumbers($second))->toBe(previewNumbers($first))
        ->and([$second?->count, $second?->flowWeek, $second?->flowDays])->toBe([42, 9, 7]);
});

it('keeps one user\'s overlay out of the shared part: his hidden listing and his favourite do not reach another user', function (): void {
    $other = User::factory()->create();
    $mine = Radar::factory()->for($this->user)->filters(['price_max' => 700])->create();
    $theirs = Radar::factory()->for($other)->filters(['price_max' => 700])->create();
    HiddenListing::factory()->for($this->user)->create(['listing_number' => 100001]);
    Favorite::factory()->for($this->user)->create(['listing_number' => 100002]);
    Favorite::factory()->for($other)->create(['listing_number' => 100003]);

    $first = previewsOf($this->user)[$mine->id];
    $second = previewsOf($other)[$theirs->id];

    expect(previewNumbers($first))->toBe([100002, 100003, 100004, 100005, 100006])
        ->and($first?->items[0]->favorite)->toBeTrue()
        ->and(previewNumbers($second))->toBe([100001, 100002, 100003, 100004, 100005])
        ->and(array_map(fn (ListingSummary $item): bool => $item->favorite, $second?->items ?? []))->toBe([false, false, true, false, false])
        ->and(sourceRounds($this->source))->toBe([1, 1, 1]);
});

it('caches the shared part for two minutes', function (): void {
    $radar = Radar::factory()->for($this->user)->create();

    previewsOf($this->user);
    $this->travel(119)->seconds();
    previewsOf($this->user);
    expect(sourceRounds($this->source))->toBe([1, 1, 1]);

    $this->travel(2)->seconds();
    expect(previewsOf($this->user)[$radar->id])->not->toBeNull()
        ->and(sourceRounds($this->source))->toBe([2, 2, 2]);
});

it('does not cache with a ttl of 0', function (): void {
    config(['radar.preview_ttl' => 0]);
    Radar::factory()->for($this->user)->create();

    previewsOf($this->user);
    previewsOf($this->user);

    expect(sourceRounds($this->source))->toBe([2, 2, 2]);
});

it('keys the shared part by posted_days, which the radar hash leaves out, and by locale and currency', function (): void {
    $other = User::factory()->create();
    $week = Radar::factory()->for($this->user)->filters(['price_max' => 700, 'posted_days' => 7])->create();
    $month = Radar::factory()->for($other)->filters(['price_max' => 700, 'posted_days' => 30])->create();
    expect($week->filters_hash)->toBe($month->filters_hash);

    previewsOf($this->user);
    previewsOf($other);
    previewsOf($this->user, new SourceContext('en', 'USD', $this->user));
    previewsOf($this->user, new SourceContext('ru', 'UZS', $this->user));
    previewsOf($this->user);

    expect(sourceRounds($this->source))->toBe([4, 4, 4])
        ->and(array_map(fn (array $call): ?int => $call[1]->filters->postedDays, $this->source->callsOf('feed')))->toBe([7, 30, 7, 7]);
});

it('leaves the stub scenario out of the shared part when no driver is the stub: other scenarios are served from one round', function (): void {
    $legacy = (new FakeListingSource)->withItems([100001 => [], 100002 => []]);
    $legacy->count = 2;
    $legacy->flow = new FlowEstimate(1, 7, []);
    app()->instance(LegacyListingSource::class, $legacy);
    $features = config('sources.features');

    foreach (['source.listings.feed', 'source.listings.count', 'source.listings.flow'] as $feature) {
        $features[$feature]['default'] = ['*' => 'legacy'];
    }

    config(['sources.features' => $features]);
    $radar = Radar::factory()->for($this->user)->create();

    foreach (['a1', 'a2', 'a3', 'a4', 'a5'] as $scenario) {
        expect(previewNumbers(previewsOf($this->user, new SourceContext('ru', 'USD', $this->user, $scenario))[$radar->id]))->toBe([100001, 100002]);
    }

    expect(sourceRounds($legacy))->toBe([1, 1, 1])
        ->and(array_map(fn (array $call): ?string => $call[2]->scenario, $legacy->calls))->toBe([null, null, null])
        ->and($this->source->calls)->toBe([]);
});

it('neither reads nor writes the shared cache for a stub scenario, which the stub answers itself', function (): void {
    $radar = Radar::factory()->for($this->user)->create();
    $scenario = new SourceContext('ru', 'USD', $this->user, 'empty_feed');

    expect(previewsOf($this->user, $scenario)[$radar->id])->not->toBeNull()
        ->and(previewsOf($this->user)[$radar->id])->not->toBeNull()
        ->and(previewsOf($this->user, $scenario)[$radar->id])->not->toBeNull()
        ->and(previewsOf($this->user)[$radar->id])->not->toBeNull()
        ->and(sourceRounds($this->source))->toBe([3, 3, 3])
        ->and(array_map(fn (array $call): ?string => $call[2]->scenario, $this->source->callsOf('feed')))->toBe(['empty_feed', null, 'empty_feed']);
});

it('applies each radar\'s own hide rules, in one rule query, and never moves hidden_count', function (): void {
    $this->source->withItems([
        100001 => ['source_ref' => ['channel' => 'Arenda_Tashkent', 'post_id' => 1]],
        100002 => ['district' => ['code' => 'mirobod', 'name' => 'Мирабадский']],
        100003 => [], 100004 => [], 100005 => [], 100006 => [], 100007 => [],
    ]);
    $ruled = Radar::factory()->for($this->user)->filters(['price_max' => 700])->create(['hidden_count' => 3]);
    $plain = Radar::factory()->for($this->user)->filters(['price_max' => 900])->create();
    RadarHideRule::factory()->for($ruled)->create(['kind' => HideRuleKind::Channel, 'target' => 'arenda_tashkent']);
    RadarHideRule::factory()->for($ruled)->create(['kind' => HideRuleKind::District, 'target' => 'mirobod']);

    $statements = [];
    DB::listen(function ($query) use (&$statements): void {
        $statements[] = $query->sql;
    });
    $previews = previewsOf($this->user);

    expect(previewNumbers($previews[$ruled->id]))->toBe([100003, 100004, 100005, 100006, 100007])
        ->and(previewNumbers($previews[$plain->id]))->toBe([100001, 100002, 100003, 100004, 100005])
        ->and(array_values(array_filter($statements, fn (string $sql): bool => str_contains($sql, 'radar_hide_rules'))))->toHaveCount(1)
        ->and($ruled->fresh()?->hidden_count)->toBe(3);
});

it('gives null to a radar whose round fails and to every later one not cached, and serves the cached ones', function (): void {
    $cached = Radar::factory()->for($this->user)->filters(['price_max' => 500])->create(['created_at' => now()->subMinutes(3)]);
    previewsOf($this->user);
    $failing = Radar::factory()->for($this->user)->filters(['price_max' => 700])->create(['created_at' => now()->subMinutes(2)]);
    $later = Radar::factory()->for($this->user)->filters(['price_max' => 900])->create(['created_at' => now()->subMinute()]);
    $this->source->failure = new SourceUnavailable;

    $previews = previewsOf($this->user);

    expect($previews[$cached->id])->not->toBeNull()
        ->and($previews[$failing->id])->toBeNull()
        ->and($previews[$later->id])->toBeNull()
        ->and(sourceRounds($this->source))->toBe([2, 1, 1]);
});

it('stops asking the source once the budget is spent and answers null for the rest', function (): void {
    $first = Radar::factory()->for($this->user)->filters(['price_max' => 700])->create(['created_at' => now()->subMinutes(2)]);
    $second = Radar::factory()->for($this->user)->filters(['price_max' => 900])->create(['created_at' => now()->subMinute()]);
    $this->source->before = function (string $method): void {
        if ($method === 'flow') {
            $this->travel(4001)->milliseconds();
        }
    };

    $previews = previewsOf($this->user);

    expect($previews[$first->id])->not->toBeNull()
        ->and($previews[$second->id])->toBeNull()
        ->and(sourceRounds($this->source))->toBe([1, 1, 1]);
});

it('caches arrays only under the documented key, and reads an entry of another shape as a miss', function (): void {
    $radar = Radar::factory()->for($this->user)->filters(['price_max' => 700, 'posted_days' => 7])->create();
    previewsOf($this->user);
    $key = "radar:previews:v1:stub-stub-stub:{$radar->filters_hash}:7:ru:USD";
    $entry = Cache::get($key);
    array_walk_recursive($entry, fn (mixed $value) => expect(is_object($value))->toBeFalse());

    expect($entry)->toBeArray()->toHaveKeys(['items', 'count', 'week', 'days']);

    Cache::put($key, ['items' => [['number' => 'broken']], 'count' => 1, 'week' => 1, 'days' => 7], 120);
    previewsOf($this->user);

    expect(sourceRounds($this->source))->toBe([2, 2, 2]);
});

it('asks nothing for a user without radars', function (): void {
    expect(app(RadarPreviews::class)->forRadars($this->user, [], $this->context))->toBe([])
        ->and($this->source->calls)->toBe([]);
});
