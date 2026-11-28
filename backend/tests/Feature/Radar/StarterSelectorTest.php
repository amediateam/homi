<?php

use App\Enums\ListingSort;
use App\Enums\Radar\HideRuleKind;
use App\Exceptions\Sources\SourceUnavailable;
use App\Models\BlockedAuthor;
use App\Models\HiddenListing;
use App\Models\ListingMark;
use App\Models\ListingRef;
use App\Models\ListingView;
use App\Models\Radar;
use App\Models\RadarHideRule;
use App\Models\User;
use App\Models\UserSetting;
use App\Services\Delivery\Contracts\DeliveredSet;
use App\Services\Delivery\NullDeliveredSet;
use App\Services\Radar\StarterSelector;
use App\Services\Search\ListingQuery;
use App\Services\Sources\SourceContext;
use Illuminate\Database\Events\QueryExecuted;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\Support\FakeListingSource;

/*
 * WP-45, step 5 (task `KV-BE-102`): the listings a radar write sends at once. Candidates are one page of 20 of the
 * radar's filters through the feed source, newest first, of the last `radar.starter_window_days` (3); then HOMI's
 * overlay leaves out what the user hid, blocked authors and listings HOMI's votes mark as rented, the delivered set
 * (`DeliveredSet`, null until WP-46) leaves out what the user received, a resume also what he opened, and the radar's
 * hide rules what they keep back — each one adds 1 to `hidden_count`. At most `radar.starter_max`; `count` is the
 * numbers. With `radar.starter_enabled` off the starter is empty and no source is asked.
 */

beforeEach(function (): void {
    Http::preventStrayRequests();
    config(['radar.starter_enabled' => true]);
    $this->source = FakeListingSource::bind()->withItems([
        100001 => [], 100002 => [], 100003 => [], 100004 => [], 100005 => [],
    ]);
    $this->user = User::factory()->create();
    $this->radar = Radar::factory()->for($this->user)->filters(['price_max' => 700, 'posted_days' => 30])->create();
    $this->selector = app(StarterSelector::class);
});

/** A delivered set that answers the numbers a test names, bound for a selector resolved after it. */
function deliveredNumbers(array $numbers): void
{
    app()->instance(DeliveredSet::class, new readonly class($numbers) implements DeliveredSet
    {
        /** @param  list<int>  $numbers */
        public function __construct(private array $numbers) {}

        public function delivered(User $user, array $numbers): array
        {
            return array_values(array_intersect($numbers, $this->numbers));
        }
    });
}

it('asks the feed for one page of the radar\'s filters, newest first, of the last three days, for the user', function (): void {
    $starter = $this->selector->forCreate($this->user, $this->radar, 'uz', 'UZS');

    expect($this->source->calls)->toHaveCount(1);
    [$method, $query, $context] = $this->source->calls[0];

    expect($method)->toBe('feed')
        ->and($query)->toBeInstanceOf(ListingQuery::class)
        ->and($query->filters->postedDays)->toBe(3)
        ->and($query->filters->priceMax)->toBe(700)
        ->and($query->filters->canonicalHash())->toBe($this->radar->filters_hash)
        ->and($query->sort)->toBe(ListingSort::New)
        ->and($query->cursor)->toBeNull()
        ->and($query->limit)->toBe(20)
        ->and($context)->toBeInstanceOf(SourceContext::class)
        ->and($context->user?->id)->toBe($this->user->id)
        ->and([$context->locale, $context->currency])->toBe(['uz', 'UZS'])
        ->and($starter->numbers)->toBe([100001, 100002, 100003, 100004, 100005])
        ->and($starter->count)->toBe(5)
        ->and($this->radar->fresh()?->filters['posted_days'])->toBe(30);
});

it('reads in the user\'s language and currency when the write names none, in a new context each time', function (): void {
    UserSetting::factory()->for($this->user)->create(['locale' => 'en', 'currency' => 'UZS']);
    $this->user->refresh();

    $this->selector->forUpdate($this->user, $this->radar);
    $this->selector->forResume($this->user, $this->radar);

    [, , $first] = $this->source->calls[0];
    [, , $second] = $this->source->calls[1];

    expect([$first->locale, $first->currency])->toBe(['en', 'UZS'])
        ->and($second)->not->toBe($first);
});

it('leaves out hidden, blocked, vote-marked, delivered and hide-ruled listings and counts only the hide-ruled ones', function (): void {
    $this->source->withItems([
        100001 => [],
        100002 => [],
        100003 => [],
        100004 => ['source_ref' => ['channel' => 'Arenda_Tashkent', 'post_id' => 1]],
        100005 => ['district' => ['code' => 'mirobod', 'name' => 'Мирабадский']],
        100006 => [],
        100007 => [],
        100008 => [],
    ]);
    HiddenListing::factory()->for($this->user)->create(['listing_number' => 100001]);
    BlockedAuthor::factory()->for($this->user)->create(['author_key' => 'phone:'.str_repeat('a', 32)]);
    ListingRef::factory()->ofAuthor('phone:'.str_repeat('a', 32))->create(['listing_number' => 100002]);
    ListingMark::factory()->create(['listing_number' => 100003]);
    ListingRef::factory()->ofAuthor('phone:'.str_repeat('b', 32))->create(['listing_number' => 100006]);
    RadarHideRule::factory()->for($this->radar)->create(['kind' => HideRuleKind::Channel, 'target' => 'arenda_tashkent']);
    RadarHideRule::factory()->for($this->radar)->create(['kind' => HideRuleKind::District, 'target' => 'mirobod']);
    RadarHideRule::factory()->for($this->radar)->create(['kind' => HideRuleKind::Author, 'target' => 'phone:'.str_repeat('b', 32)]);
    deliveredNumbers([100007]);
    $this->radar->forceFill(['hidden_count' => 2])->save();

    $starter = app(StarterSelector::class)->forUpdate($this->user, $this->radar);

    expect($starter->numbers)->toBe([100008])
        ->and($starter->count)->toBe(1)
        ->and($this->radar->fresh()?->hidden_count)->toBe(5)
        ->and($this->radar->hidden_count)->toBe(5);
});

it('does not count a listing the user already received or hid as held back by a rule', function (): void {
    $this->source->withItems([100001 => ['district' => ['code' => 'mirobod', 'name' => 'Мирабадский']], 100002 => ['district' => ['code' => 'mirobod', 'name' => 'Мирабадский']]]);
    RadarHideRule::factory()->for($this->radar)->create(['kind' => HideRuleKind::District, 'target' => 'mirobod']);
    HiddenListing::factory()->for($this->user)->create(['listing_number' => 100001]);
    deliveredNumbers([100002]);

    expect(app(StarterSelector::class)->forCreate($this->user, $this->radar)->numbers)->toBe([])
        ->and($this->radar->fresh()?->hidden_count)->toBe(0);
});

it('reads the author keys of the candidates only when the radar has an author rule', function (): void {
    RadarHideRule::factory()->for($this->radar)->create(['kind' => HideRuleKind::Channel, 'target' => 'nowhere']);
    $statements = new ArrayObject;
    DB::listen(function (QueryExecuted $query) use ($statements): void {
        $statements[] = $query->sql;
    });

    $this->selector->forCreate($this->user, $this->radar);

    expect(array_filter($statements->getArrayCopy(), fn (string $sql): bool => str_contains($sql, 'listing_refs') && str_contains($sql, 'author_key')))->toBe([]);
});

it('also leaves out the listings the user opened when a radar is switched back on', function (): void {
    ListingView::factory()->for($this->user)->create(['listing_number' => 100002]);
    ListingView::factory()->for($this->user)->create(['listing_number' => 100004]);

    expect($this->selector->forResume($this->user, $this->radar)->numbers)->toBe([100001, 100003, 100005])
        ->and($this->selector->forCreate($this->user, $this->radar)->numbers)->toBe([100001, 100002, 100003, 100004, 100005])
        ->and($this->selector->forUpdate($this->user, $this->radar)->numbers)->toBe([100001, 100002, 100003, 100004, 100005])
        ->and($this->selector->forRelax($this->user, $this->radar)->numbers)->toBe([100001, 100002, 100003, 100004, 100005]);
});

it('caps the starter and counts what it sends, each listing once', function (): void {
    config(['radar.starter_max' => 3]);
    $this->source->withItems([100001 => [], 100002 => [], 100003 => [], 100004 => []]);
    $this->source->items[] = $this->source->items[0];

    $starter = $this->selector->forCreate($this->user, $this->radar);

    expect($starter->numbers)->toBe([100001, 100002, 100003])->and($starter->count)->toBe(3);

    config(['radar.starter_max' => 20]);

    expect($this->selector->forCreate($this->user, $this->radar)->numbers)->toBe([100001, 100002, 100003, 100004]);
});

it('answers an empty starter without asking the source while the switch is off', function (): void {
    config(['radar.starter_enabled' => false]);

    foreach (['forCreate', 'forUpdate', 'forRelax', 'forResume'] as $method) {
        $starter = $this->selector->{$method}($this->user, $this->radar);

        expect($starter->numbers)->toBe([])->and($starter->count)->toBe(0);
    }

    expect($this->source->calls)->toBe([]);
});

it('lets a source failure through to the caller', function (): void {
    $this->source->failure = new SourceUnavailable;

    expect(fn () => $this->selector->forCreate($this->user, $this->radar))->toThrow(SourceUnavailable::class);
});

it('binds a delivered set that has delivered nothing until WP-46', function (): void {
    expect(app(DeliveredSet::class))->toBeInstanceOf(NullDeliveredSet::class)
        ->and(app(DeliveredSet::class)->delivered($this->user, [100001, 100002]))->toBe([]);
});
