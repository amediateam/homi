<?php

use App\Enums\Radar\HideRuleKind;
use App\Enums\Radar\RadarMutationKind;
use App\Enums\RadarMode;
use App\Models\Radar;
use App\Models\RadarHideRule;
use App\Models\User;
use App\Services\Search\SearchFilters;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;
use Tests\Support\FilterArrays;

/*
 * WP-45, step 2: the two radar tables, their keys, the models, the enums and `User::radars()`. A radar stores the
 * 25-key filters object with its canonical hash, city and deal beside it; the unique (`user_id`, `filters_hash`) is
 * the last guard against twin radars. A duplicate is tried inside a savepoint, so PostgreSQL's aborted statement does
 * not end the test's transaction.
 */

beforeEach(function (): void {
    Http::preventStrayRequests();
});

/** A statement that must fail on a unique key, inside a savepoint. */
function radarFailsOnUniqueKey(Closure $write): bool
{
    try {
        DB::transaction($write);
    } catch (UniqueConstraintViolationException) {
        return true;
    }

    return false;
}

it('creates the two tables with the columns of the design', function (string $table, array $columns): void {
    expect(Schema::hasTable($table))->toBeTrue()
        ->and(Schema::getColumnListing($table))->toEqualCanonicalizing($columns);
})->with([
    'radars' => ['radars', [
        'id', 'user_id', 'active', 'mode', 'filters', 'filters_hash', 'city', 'deal', 'entry', 'relax_code', 'hidden_count',
        'paused_at', 'created_at', 'updated_at',
    ]],
    'radar_hide_rules' => ['radar_hide_rules', ['id', 'radar_id', 'kind', 'target', 'created_at']],
]);

it('indexes the radars for the owner, the matcher and the twin check', function (): void {
    $indexes = collect(Schema::getIndexes('radars'))->map(fn (array $index): array => [$index['columns'], $index['unique']])->all();

    expect($indexes)->toContain([['user_id', 'filters_hash'], true])
        ->and($indexes)->toContain([['active', 'filters_hash'], false])
        ->and($indexes)->toContain([['user_id', 'created_at'], false])
        ->and(collect(Schema::getIndexes('radar_hide_rules'))->map(fn (array $index): array => [$index['columns'], $index['unique']])->all())
        ->toContain([['radar_id', 'kind', 'target'], true]);
});

it('stores a radar with an upper-case ULID, its 25 filter keys, the hash, city and deal, and the defaults', function (): void {
    $user = User::factory()->create();
    $filters = SearchFilters::fromNormalised(FilterArrays::defaults(['price_max' => 700, 'posted_days' => 7]));

    $radar = $user->radars()->create(Radar::filterAttributes($filters))->refresh();

    expect($radar->id)->toMatch('/^[0-9A-HJKMNP-TV-Z]{26}$/')
        ->and($radar->user_id)->toBe($user->id)
        ->and($radar->active)->toBeTrue()
        ->and($radar->mode)->toBe(RadarMode::Instant)
        ->and($radar->filters)->toBe(FilterArrays::defaults(['price_max' => 700, 'posted_days' => 7]))
        ->and($radar->filters_hash)->toBe($filters->canonicalHash())
        ->and($radar->city)->toBe('tashkent')
        ->and($radar->deal)->toBe('rent_long')
        ->and($radar->entry)->toBeNull()
        ->and($radar->relax_code)->toBeNull()
        ->and($radar->hidden_count)->toBe(0)
        ->and($radar->paused_at)->toBeNull()
        ->and($radar->searchFilters()->toArray())->toBe($filters->toArray())
        ->and($user->radars()->pluck('id')->all())->toBe([$radar->id]);
});

it('refuses to save filters without exactly the 25 keys', function (array $filters): void {
    $radar = Radar::factory()->create();

    expect(fn () => $radar->forceFill(['filters' => $filters])->save())->toThrow(InvalidArgumentException::class, '25 keys');
    expect(Radar::query()->find($radar->id)?->filters)->toHaveCount(25);
})->with([
    'a key missing' => [array_diff_key(FilterArrays::defaults(), ['polygon' => true])],
    'an extra key' => [[...FilterArrays::defaults(), 'zone' => 'center']],
    'empty' => [[]],
]);

it('keeps one radar per user and filters hash, and lets another user have the same filters', function (): void {
    $user = User::factory()->create();
    $other = User::factory()->create();
    $filters = SearchFilters::fromNormalised(FilterArrays::defaults(['price_max' => 700]));
    $user->radars()->create(Radar::filterAttributes($filters));

    expect(radarFailsOnUniqueKey(fn () => $user->radars()->create(Radar::filterAttributes($filters))))->toBeTrue()
        ->and(radarFailsOnUniqueKey(fn () => $other->radars()->create(Radar::filterAttributes($filters))))->toBeFalse();
});

it('makes factory radars of distinct filters for one user', function (): void {
    $user = User::factory()->create();
    $radars = Radar::factory()->count(3)->for($user)->create();

    expect($radars->pluck('filters_hash')->unique())->toHaveCount(3)
        ->and($radars->every(fn (Radar $radar): bool => count($radar->filters) === 25))->toBeTrue()
        ->and(Radar::factory()->paused()->create())->paused_at->not->toBeNull()->active->toBeFalse();
});

it('keeps one hide rule per radar, kind and target, and drops the rules with the radar', function (): void {
    $radar = Radar::factory()->create();
    $rule = RadarHideRule::factory()->for($radar)->create(['kind' => HideRuleKind::Channel, 'target' => 'arenda_tashkent']);

    expect($rule->kind)->toBe(HideRuleKind::Channel)
        ->and($radar->hideRules()->pluck('target')->all())->toBe(['arenda_tashkent'])
        ->and(radarFailsOnUniqueKey(fn () => RadarHideRule::factory()->for($radar)->create(['kind' => HideRuleKind::Channel, 'target' => 'arenda_tashkent'])))->toBeTrue()
        ->and(radarFailsOnUniqueKey(fn () => RadarHideRule::factory()->for($radar)->create(['kind' => HideRuleKind::District, 'target' => 'arenda_tashkent'])))->toBeFalse();

    $radar->delete();

    expect(RadarHideRule::query()->count())->toBe(0);
});

it('drops the radars with their user', function (): void {
    $radar = Radar::factory()->create();
    RadarHideRule::factory()->for($radar)->create();

    $radar->user->delete();

    expect(Radar::query()->count())->toBe(0)->and(RadarHideRule::query()->count())->toBe(0);
});

it('names the kinds of a hide rule and of a radar change', function (): void {
    expect(array_column(HideRuleKind::cases(), 'value'))->toBe(['channel', 'district', 'author'])
        ->and(array_column(RadarMutationKind::cases(), 'value'))->toBe(['created', 'existing', 'reactivated', 'updated', 'resumed', 'paused']);
});
