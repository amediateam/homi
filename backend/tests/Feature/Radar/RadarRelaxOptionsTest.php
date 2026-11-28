<?php

use App\Enums\Identity\BotChatState;
use App\Enums\Radar\RadarMutationKind;
use App\Events\Radar\RadarSaved;
use App\Exceptions\Radar\NoChat;
use App\Exceptions\Radar\RadarDuplicate;
use App\Exceptions\Radar\RadarsDisabled;
use App\Exceptions\Sources\SourceUnavailable;
use App\Models\Radar;
use App\Models\User;
use App\Services\Radar\RadarCreateContext;
use App\Services\Radar\RadarRelaxOptions;
use App\Services\Radar\RadarService;
use App\Services\Search\SearchFilters;
use App\Services\Sources\Data\FlowEstimate;
use App\Services\Sources\Data\FlowOption;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Database\Events\QueryExecuted;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;
use Tests\Support\FakeListingSource;
use Tests\Support\FilterArrays;

/*
 * WP-45, step 6 (tasks `KV-BE-102`, `KV-BE-105`): the ways to widen a radar that found nothing. Offered only when the
 * starter is empty: the options of the listing source's flow for the radar's filters (at most `radar.options_max`),
 * a missing `count` filled with the count of the option's filters over the starter's window, an option equal to the
 * radar dropped; the offered set (code → filters) is remembered for 15 minutes under `radar:<id>:options`. `relax()`
 * applies a remembered code (or one of a set computed again once it expired) by the rules of `update`; anything else
 * is `422` on `code`. `relaxed` is always a list: one hint of the radar's own flow when there is neither a starter nor
 * an option. The listings come from `FakeListingSource`.
 */

beforeEach(function (): void {
    Http::preventStrayRequests();
    $this->freezeTime();
    $this->user = User::factory()->create(['bot_chat_state' => BotChatState::Active]);
    $this->source = FakeListingSource::bind();
    $this->source->flow = new FlowEstimate(3, 7, [
        relaxOption('price_more', ['price_max' => 900], 12),
        relaxOption('districts', [], null),
    ]);
    $this->source->count = 4;
    $this->service = app(RadarService::class);
});

/**
 * A flow option over the defaults of Tashkent long rent.
 *
 * @param  array<string, mixed>  $filters
 */
function relaxOption(string $code, array $filters, ?int $count): FlowOption
{
    return new FlowOption($code, "label {$code}", "rate {$code}", $count, SearchFilters::fromNormalised(FilterArrays::defaults($filters)));
}

/** @param  array<string, mixed>  $overrides */
function relaxFilters(array $overrides = []): SearchFilters
{
    return SearchFilters::fromNormalised(FilterArrays::defaults($overrides));
}

/** A radar of the user made through the service, so its options are offered and remembered. */
function relaxRadar(User $user, array $filters = ['price_max' => 700, 'districts' => ['yunusobod']]): Radar
{
    return app(RadarService::class)->create($user, relaxFilters($filters), new RadarCreateContext('filters'))->radar;
}

describe('the options', function (): void {
    it('offers the source\'s flow options when the starter is empty, a missing count filled over the last three days', function (): void {
        $mutation = $this->service->create($this->user, relaxFilters(['price_max' => 700, 'districts' => ['yunusobod']]), new RadarCreateContext('filters', locale: 'uz', currency: 'UZS'));

        expect(array_map(fn (FlowOption $option): array => [$option->code, $option->label, $option->rate, $option->count], $mutation->options))->toBe([
            ['price_more', 'label price_more', 'rate price_more', 12],
            ['districts', 'label districts', 'rate districts', 4],
        ])
            ->and($mutation->relaxed)->toBe([]);

        [[, $flowFilters, $flowContext]] = $this->source->callsOf('flow');
        [[, $countFilters]] = $this->source->callsOf('count');
        expect($flowFilters->canonicalHash())->toBe($mutation->radar->filters_hash)
            ->and([$flowContext->locale, $flowContext->currency, $flowContext->user?->id])->toBe(['uz', 'UZS', $this->user->id])
            ->and($countFilters->toArray())->toBe(FilterArrays::defaults(['posted_days' => 3]));
    });

    it('offers nothing when the starter found listings, and asks no flow', function (): void {
        config(['radar.starter_enabled' => true]);
        $this->source->withItems([100001 => []]);

        $mutation = $this->service->create($this->user, relaxFilters(['price_max' => 700]), new RadarCreateContext('filters'));

        expect($mutation->starter->count)->toBe(1)
            ->and($mutation->options)->toBe([])
            ->and($mutation->relaxed)->toBe([])
            ->and($this->source->callsOf('flow'))->toBe([]);
    });

    it('offers the options when the starter is on and found nothing', function (): void {
        config(['radar.starter_enabled' => true]);

        $mutation = $this->service->create($this->user, relaxFilters(['price_max' => 700]), new RadarCreateContext('filters'));

        expect($mutation->starter->count)->toBe(0)
            ->and(array_map(fn (FlowOption $option): string => $option->code, $mutation->options))->toBe(['price_more', 'districts']);
    });

    it('drops an option whose filters are the radar\'s, posted_days aside', function (): void {
        $this->source->flow = new FlowEstimate(3, 7, [
            relaxOption('same', ['price_max' => 700, 'posted_days' => 7], 3),
            relaxOption('price_more', ['price_max' => 900], 12),
        ]);

        $mutation = $this->service->create($this->user, relaxFilters(['price_max' => 700]), new RadarCreateContext('filters'));

        expect(array_map(fn (FlowOption $option): string => $option->code, $mutation->options))->toBe(['price_more']);
    });

    it('offers at most radar.options_max options, each code once', function (): void {
        config(['radar.options_max' => 2]);
        $this->source->flow = new FlowEstimate(3, 7, [
            relaxOption('a', ['price_max' => 801], 1),
            relaxOption('a', ['price_max' => 802], 1),
            relaxOption('b', ['price_max' => 803], 1),
            relaxOption('c', ['price_max' => 804], 1),
        ]);

        $mutation = $this->service->create($this->user, relaxFilters(['price_max' => 700]), new RadarCreateContext('filters'));

        expect(array_map(fn (FlowOption $option): array => [$option->code, $option->filters->priceMax], $mutation->options))->toBe([['a', 801], ['b', 803]]);
    });

    it('remembers the offered set for 15 minutes under radar:<id>:options, as arrays', function (): void {
        $radar = relaxRadar($this->user);

        expect(Cache::get("radar:{$radar->id}:options"))->toBe([
            'price_more' => FilterArrays::defaults(['price_max' => 900]),
            'districts' => FilterArrays::defaults(),
        ])
            ->and(RadarRelaxOptions::key($radar))->toBe("radar:{$radar->id}:options");

        $this->travel(15 * 60 - 1)->seconds();
        expect(Cache::has("radar:{$radar->id}:options"))->toBeTrue();

        $this->travel(1)->seconds();
        expect(Cache::has("radar:{$radar->id}:options"))->toBeFalse();
    });

    it('asks a daily-rent radar\'s flow with its own filters', function (): void {
        $this->service->create($this->user, relaxFilters(['deal' => 'rent_daily', 'price_max' => 40]), new RadarCreateContext('filters'));

        expect($this->source->callsOf('flow')[0][1]->toArray())->toBe(FilterArrays::defaults(['deal' => 'rent_daily', 'price_max' => 40]));
    });

    it('offers nothing to a twin answered as existing, and asks no flow', function (): void {
        $radar = Radar::factory()->for($this->user)->filters(['price_max' => 700])->create();

        $mutation = $this->service->create($this->user, relaxFilters(['price_max' => 700]), new RadarCreateContext('filters'));

        expect([$mutation->kind, $mutation->radar->id, $mutation->options, $mutation->relaxed])->toBe([RadarMutationKind::Existing, $radar->id, [], []])
            ->and($this->source->calls)->toBe([]);
    });

    it('offers the options after new filters, and nothing for a replace that changes nothing', function (): void {
        $radar = Radar::factory()->for($this->user)->filters(['price_max' => 700])->create();

        $updated = $this->service->update($this->user, $radar, relaxFilters(['price_max' => 650]), null, 'en');
        $unchanged = $this->service->update($this->user, $radar, relaxFilters(['price_max' => 650]), null);

        expect(array_map(fn (FlowOption $option): string => $option->code, $updated->options))->toBe(['price_more', 'districts'])
            ->and($this->source->callsOf('flow'))->toHaveCount(1)
            ->and($this->source->callsOf('flow')[0][2]->locale)->toBe('en')
            ->and([$unchanged->options, $unchanged->relaxed, $unchanged->starter->count])->toBe([[], [], 0]);
    });

    it('keeps the write with no options and no hint when the flow fails, logging the radar id only', function (): void {
        $this->source->failure = new SourceUnavailable;
        Log::spy();

        $mutation = $this->service->create($this->user, relaxFilters(['price_max' => 777]), new RadarCreateContext('filters'));

        expect([$mutation->kind, $mutation->options, $mutation->relaxed])->toBe([RadarMutationKind::Created, [], []])
            ->and(Radar::query()->count())->toBe(1)
            ->and(Cache::has("radar:{$mutation->radar->id}:options"))->toBeFalse();
        Log::shouldHaveReceived('warning')->withArgs(fn (string $message, array $context): bool => $context === ['radar' => $mutation->radar->id] && ! str_contains($message, '777'));
    });
});

describe('the relaxed hint', function (): void {
    it('is one text of the radar\'s own flow when there is neither a starter nor an option', function (string $locale, int $week, int $days, array $relaxed): void {
        $this->source->flow = new FlowEstimate($week, $days, []);

        $mutation = $this->service->create($this->user, relaxFilters(['price_max' => 700]), new RadarCreateContext('filters', locale: $locale));

        expect($mutation->options)->toBe([])->and($mutation->relaxed)->toBe($relaxed);
    })->with([
        'ru, none this week' => ['ru', 0, 7, []],
        'ru, under one a day' => ['ru', 5, 7, ['5 за неделю']],
        'ru, one a day' => ['ru', 7, 7, ['≈1 в день']],
        'ru, many a day' => ['ru', 30, 7, ['≈4 в день']],
        'uz, none this week' => ['uz', 0, 7, []],
        'uz, under one a day' => ['uz', 3, 7, ['Haftasiga 3']],
        'uz, many a day' => ['uz', 21, 7, ['Kuniga ≈3']],
        'en, under one a day' => ['en', 6, 7, ['6 a week']],
        'en, many a day' => ['en', 14, 7, ['≈2 a day']],
        'en, none this week' => ['en', 0, 3, []],
    ]);

    it('is empty when options exist', function (): void {
        $mutation = $this->service->create($this->user, relaxFilters(['price_max' => 700]), new RadarCreateContext('filters'));

        expect($mutation->options)->not->toBe([])->and($mutation->relaxed)->toBe([]);
    });
});

describe('relax', function (): void {
    it('applies a remembered code by the rules of update: normalised filters, relax_code, the starter of the new filters', function (): void {
        $radar = relaxRadar($this->user);
        config(['radar.starter_enabled' => true]);
        $this->source->withItems([100001 => [], 100002 => []]);
        Event::fake([RadarSaved::class]);

        $mutation = $this->service->relax($this->user, $radar, 'price_more', 'en', 'UZS');
        $stored = $radar->fresh();

        expect([$mutation->kind, $mutation->radar->id, $mutation->starter->numbers])->toBe([RadarMutationKind::Updated, $radar->id, [100001, 100002]])
            ->and($stored?->filters)->toBe(FilterArrays::defaults(['price_max' => 900]))
            ->and([$stored?->relax_code, $stored?->active])->toBe(['price_more', true])
            ->and($this->source->callsOf('flow'))->toHaveCount(1)
            ->and([$this->source->callsOf('feed')[0][2]->locale, $this->source->callsOf('feed')[0][2]->currency])->toBe(['en', 'UZS']);
        Event::assertDispatched(RadarSaved::class, fn (RadarSaved $event): bool => $event->radarId === $radar->id && $event->kind === RadarMutationKind::Updated && $event->starterNumbers === [100001, 100002]);
    });

    it('normalises the option\'s filters for a radar again: a code naming filters the reference refuses is 422', function (): void {
        $this->source->flow = new FlowEstimate(3, 7, [relaxOption('atlantis', ['districts' => ['atlantis']], 2)]);
        $radar = relaxRadar($this->user);
        $before = $radar->fresh()?->toArray();

        expect(fn () => $this->service->relax($this->user, $radar, 'atlantis'))->toThrow(ValidationException::class)
            ->and($radar->fresh()?->toArray())->toBe($before);
    });

    it('refuses a code outside the remembered set with 422 on code, without asking the source again', function (): void {
        $radar = relaxRadar($this->user);
        $calls = count($this->source->calls);

        try {
            $this->service->relax($this->user, $radar, 'rooms');
            $this->fail('A code outside the offered set was applied.');
        } catch (ValidationException $e) {
            expect(array_keys($e->errors()))->toBe(['code']);
        }

        expect($this->source->calls)->toHaveCount($calls)
            ->and($radar->fresh()?->filters['price_max'])->toBe(700);
    });

    it('computes the set again once the remembered one expired', function (): void {
        $radar = relaxRadar($this->user);
        $this->travel(16)->minutes();
        $this->source->flow = new FlowEstimate(3, 7, [relaxOption('rooms', ['rooms_min' => 1], 5)]);

        expect(fn () => $this->service->relax($this->user, $radar, 'price_more'))->toThrow(ValidationException::class);

        $this->service->relax($this->user, $radar, 'rooms');

        expect($radar->fresh()?->filters)->toBe(FilterArrays::defaults(['rooms_min' => 1]))
            ->and($this->source->callsOf('flow'))->toHaveCount(2);
    });

    it('relaxes twice on two quick requests, each from the then-current filters', function (): void {
        $this->source->flow = fn (SearchFilters $filters): FlowEstimate => new FlowEstimate(0, 7, [
            relaxOption('price_more', ['price_max' => (int) $filters->priceMax + 200], 3),
        ]);
        $radar = relaxRadar($this->user, ['price_max' => 700]);

        $this->service->relax($this->user, $radar, 'price_more');
        $this->service->relax($this->user, $radar->fresh() ?? $radar, 'price_more');

        expect($radar->fresh()?->filters['price_max'])->toBe(1100);
    });

    it('relaxes from the radar as stored, also when given a copy loaded before another relax committed', function (): void {
        $this->source->flow = fn (SearchFilters $filters): FlowEstimate => new FlowEstimate(0, 7, [
            relaxOption('price_more', ['price_max' => (int) $filters->priceMax + 200], 3),
        ]);
        $radar = relaxRadar($this->user, ['price_max' => 700]);
        $stale = Radar::query()->findOrFail($radar->id);

        $this->service->relax($this->user, $radar, 'price_more');
        $second = $this->service->relax($this->user, $stale, 'price_more');

        expect($radar->fresh()?->filters['price_max'])->toBe(1100)
            ->and($second->radar->filters['price_max'])->toBe(1100)
            ->and(array_map(fn (array $call): ?int => $call[1]->priceMax, $this->source->callsOf('flow')))->toBe([700, 900]);
    });

    it('forgets the remembered set before the new filters commit, so a relax waiting for the lock never reads it', function (): void {
        $radar = relaxRadar($this->user);
        $remembered = null;
        DB::listen(function (QueryExecuted $query) use ($radar, &$remembered): void {
            if (str_starts_with($query->sql, 'update "radars"')) {
                DB::afterCommit(function () use ($radar, &$remembered): void {
                    $remembered = Cache::has(RadarRelaxOptions::key($radar));
                });
            }
        });

        $this->service->relax($this->user, $radar, 'price_more');

        expect($remembered)->toBeFalse();
    });

    it('refuses the filters of another radar of the user with RadarDuplicate and changes nothing', function (): void {
        Radar::factory()->for($this->user)->filters(['price_max' => 900])->paused()->create();
        $radar = relaxRadar($this->user);
        $before = $radar->fresh()?->toArray();

        expect(fn () => $this->service->relax($this->user, $radar, 'price_more'))->toThrow(RadarDuplicate::class)
            ->and($radar->fresh()?->toArray())->toBe($before);
    });

    it('keeps a paused radar paused and sends it nothing', function (): void {
        $radar = relaxRadar($this->user);
        $this->service->setActive($this->user, $radar, false);
        config(['radar.starter_enabled' => true]);
        $this->source->withItems([100001 => []]);

        $mutation = $this->service->relax($this->user, $radar, 'districts');

        expect([$mutation->radar->active, $mutation->starter->count, $radar->fresh()?->filters['districts']])->toBe([false, 0, []])
            ->and($this->source->callsOf('feed'))->toBe([]);
    });

    it('checks the chat before the code and before any source call', function (): void {
        $radar = relaxRadar($this->user);
        Cache::forget(RadarRelaxOptions::key($radar));
        config(['radar.require_chat' => true]);
        $this->user->forceFill(['bot_chat_state' => BotChatState::Blocked])->save();
        $calls = count($this->source->calls);

        expect(fn () => $this->service->relax($this->user, $radar, 'no_such_code'))->toThrow(NoChat::class)
            ->and($this->source->calls)->toHaveCount($calls);
    });

    it('refuses before anything else while radars are switched off: no query, no lock, no source call', function (): void {
        $radar = relaxRadar($this->user);
        config(['radar.creation_enabled' => false]);
        $calls = count($this->source->calls);
        Cache::spy();
        $statements = new ArrayObject;
        DB::listen(function (QueryExecuted $query) use ($statements): void {
            $statements[] = $query->sql;
        });

        expect(fn () => $this->service->relax($this->user, $radar, 'price_more'))->toThrow(RadarsDisabled::class)
            ->and($statements->getArrayCopy())->toBe([])
            ->and($this->source->calls)->toHaveCount($calls);
        Cache::shouldNotHaveReceived('lock');
        Cache::shouldNotHaveReceived('get');
    });

    it('never reads the remembered set or the source for a radar of another user', function (): void {
        $radar = relaxRadar(User::factory()->create(['bot_chat_state' => BotChatState::Active]));
        $calls = count($this->source->calls);

        expect(fn () => $this->service->relax($this->user, $radar, 'price_more'))->toThrow(ModelNotFoundException::class)
            ->and($this->source->calls)->toHaveCount($calls)
            ->and($radar->fresh()?->filters['price_max'])->toBe(700);
    });

    it('forgets the remembered set when new filters are stored and when the radar is deleted', function (): void {
        config(['radar.starter_enabled' => true]);
        $first = relaxRadar($this->user, ['price_max' => 701]);
        $second = relaxRadar($this->user, ['price_max' => 702]);
        $this->source->withItems([100001 => []]);

        $this->service->update($this->user, $first, relaxFilters(['price_max' => 703]), null);
        $this->service->delete($this->user, $second);

        expect(Cache::has(RadarRelaxOptions::key($first)))->toBeFalse()
            ->and(Cache::has(RadarRelaxOptions::key($second)))->toBeFalse();
    });
});
