<?php

use App\Enums\Identity\BotChatState;
use App\Enums\Radar\RadarMutationKind;
use App\Enums\RadarMode;
use App\Events\Radar\RadarDeleted;
use App\Events\Radar\RadarSaved;
use App\Exceptions\Radar\NoChat;
use App\Exceptions\Radar\RadarDuplicate;
use App\Exceptions\Radar\RadarLimit;
use App\Exceptions\Radar\RadarsDisabled;
use App\Exceptions\Sources\SourceUnavailable;
use App\Models\ListingView;
use App\Models\Radar;
use App\Models\RadarHideRule;
use App\Models\User;
use App\Services\Radar\ChatReachability;
use App\Services\Radar\RadarCreateContext;
use App\Services\Radar\RadarService;
use App\Services\Search\SearchFilters;
use App\Services\Sources\Data\FlowEstimate;
use Illuminate\Cache\ArrayStore;
use Illuminate\Contracts\Cache\LockTimeoutException;
use Illuminate\Contracts\Cache\Repository;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Database\Events\QueryExecuted;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Exceptions;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Tests\Support\FakeListingSource;
use Tests\Support\FilterArrays;

/*
 * WP-45, steps 3 and 4: every write of `RadarService` runs the switch (DEC-51), the chat check, the per-user lock, the
 * twin check and the limit in this order, and announces what it wrote only after the transaction commits. The switch
 * is on here as `phpunit.xml` sets it; the chat check and the starter are off as the servers start.
 */

beforeEach(function (): void {
    Http::preventStrayRequests();
    $this->user = User::factory()->create(['bot_chat_state' => BotChatState::Active]);
    $this->service = app(RadarService::class);
});

/** @param  array<string, mixed>  $overrides */
function radarFilters(array $overrides = []): SearchFilters
{
    return SearchFilters::fromNormalised(FilterArrays::defaults($overrides));
}

function radarContext(?string $entry = 'filters', ?string $relaxed = null): RadarCreateContext
{
    return new RadarCreateContext(entry: $entry, relaxed: $relaxed);
}

/**
 * The SQL statements a call sends, and the call's exception.
 *
 * @return array{0: list<string>, 1: ?Throwable}
 */
function radarStatements(Closure $call): array
{
    $statements = new ArrayObject;
    DB::listen(function (QueryExecuted $query) use ($statements): void {
        $statements[] = $query->sql;
    });

    try {
        $call();
    } catch (Throwable $e) {
        return [$statements->getArrayCopy(), $e];
    }

    return [$statements->getArrayCopy(), null];
}

/** The statements among them that write. */
function radarWrites(array $statements): array
{
    return array_values(array_filter($statements, fn (string $sql): bool => preg_match('/^\s*(insert|update|delete)\b/i', $sql) === 1));
}

describe('the switch (DEC-51)', function (): void {
    beforeEach(function (): void {
        config(['radar.creation_enabled' => false, 'radar.require_chat' => true, 'radar.starter_enabled' => true]);
        $this->user->forceFill(['bot_chat_state' => BotChatState::Never])->save();
        $this->radar = Radar::factory()->for($this->user)->create();
        $this->source = FakeListingSource::bind();
        $this->user->refresh();
        $this->radar->refresh();
    });

    it('refuses every write but delete before the chat check, the lock, any query and any source call', function (Closure $write): void {
        Cache::spy();

        [$statements, $error] = radarStatements(fn () => $write($this->service, $this->user, $this->radar));

        expect($error)->toBeInstanceOf(RadarsDisabled::class)
            ->and($statements)->toBe([])
            ->and($this->source->calls)->toBe([]);
        Cache::shouldNotHaveReceived('lock');
    })->with([
        'create' => [fn (RadarService $service, User $user): mixed => $service->create($user, radarFilters(['price_max' => 1]), radarContext())],
        'update' => [fn (RadarService $service, User $user, Radar $radar): mixed => $service->update($user, $radar, radarFilters(['price_max' => 2]), null)],
        'switch on' => [fn (RadarService $service, User $user, Radar $radar): mixed => $service->setActive($user, $radar, true)],
        'pause' => [fn (RadarService $service, User $user, Radar $radar): mixed => $service->setActive($user, $radar, false)],
        'mode' => [fn (RadarService $service, User $user, Radar $radar): mixed => $service->setMode($user, $radar, RadarMode::Digest)],
        'relax' => [fn (RadarService $service, User $user, Radar $radar): mixed => $service->relax($user, $radar, 'price_more')],
    ]);

    it('still deletes a radar and its hide rules', function (): void {
        RadarHideRule::factory()->for($this->radar)->create();

        $this->service->delete($this->user, $this->radar);

        expect(Radar::query()->count())->toBe(0)->and(RadarHideRule::query()->count())->toBe(0);
    });
});

describe('the chat check', function (): void {
    it('answers whether the bot may write to the user', function (BotChatState $state, bool $canWrite): void {
        expect(app(ChatReachability::class)->canWrite(User::factory()->create(['bot_chat_state' => $state])))->toBe($canWrite);
    })->with([
        'active' => [BotChatState::Active, true],
        'never' => [BotChatState::Never, false],
        'blocked' => [BotChatState::Blocked, false],
    ]);

    it('refuses a write that would send with no_chat before any write while the flag is on', function (BotChatState $state, Closure $write): void {
        config(['radar.require_chat' => true]);
        $radar = Radar::factory()->for($this->user)->paused()->create(['updated_at' => now()->subDay()]);
        $this->user->forceFill(['bot_chat_state' => $state])->save();
        $before = $radar->fresh()?->toArray();

        [$statements, $error] = radarStatements(fn () => $write($this->service, $this->user, $radar));

        expect($error)->toBeInstanceOf(NoChat::class)
            ->and(radarWrites($statements))->toBe([])
            ->and($statements)->toBe([])
            ->and(Radar::query()->count())->toBe(1)
            ->and($radar->fresh()?->toArray())->toBe($before);
    })->with([BotChatState::Never, BotChatState::Blocked])->with([
        'create' => [fn (RadarService $service, User $user): mixed => $service->create($user, radarFilters(['price_max' => 1]), radarContext())],
        'update' => [fn (RadarService $service, User $user, Radar $radar): mixed => $service->update($user, $radar, radarFilters(['price_max' => 2]), null)],
        'switch on' => [fn (RadarService $service, User $user, Radar $radar): mixed => $service->setActive($user, $radar, true)],
        'relax' => [fn (RadarService $service, User $user, Radar $radar): mixed => $service->relax($user, $radar, 'price_more')],
    ]);

    it('answers a radar of another user as unknown before the chat check, the lock and any query', function (Closure $write): void {
        config(['radar.require_chat' => true]);
        $this->user->forceFill(['bot_chat_state' => BotChatState::Never])->save();
        $foreign = Radar::factory()->for(User::factory()->create(['bot_chat_state' => BotChatState::Active]))->paused()->create();
        $before = $foreign->fresh()?->toArray();
        Cache::spy();

        [$statements, $error] = radarStatements(fn () => $write($this->service, $this->user, $foreign));

        expect($error)->toBeInstanceOf(ModelNotFoundException::class)
            ->and($error?->getModel())->toBe(Radar::class)
            ->and($statements)->toBe([])
            ->and($foreign->fresh()?->toArray())->toBe($before);
        Cache::shouldNotHaveReceived('lock');
    })->with([
        'update' => [fn (RadarService $service, User $user, Radar $radar): mixed => $service->update($user, $radar, radarFilters(['price_max' => 2]), null)],
        'switch on' => [fn (RadarService $service, User $user, Radar $radar): mixed => $service->setActive($user, $radar, true)],
        'pause' => [fn (RadarService $service, User $user, Radar $radar): mixed => $service->setActive($user, $radar, false)],
        'mode' => [fn (RadarService $service, User $user, Radar $radar): mixed => $service->setMode($user, $radar, RadarMode::Digest)],
        'relax' => [fn (RadarService $service, User $user, Radar $radar): mixed => $service->relax($user, $radar, 'price_more')],
        'delete' => [fn (RadarService $service, User $user, Radar $radar): mixed => $service->delete($user, $radar)],
    ]);

    it('lets the single repeat after the user grants write access create exactly one radar', function (): void {
        config(['radar.require_chat' => true]);
        $this->user->forceFill(['bot_chat_state' => BotChatState::Never])->save();

        expect(fn () => $this->service->create($this->user, radarFilters(), radarContext()))->toThrow(NoChat::class);

        $this->user->forceFill(['bot_chat_state' => BotChatState::Active])->save();
        $mutation = $this->service->create($this->user, radarFilters(), radarContext());

        expect($mutation->kind)->toBe(RadarMutationKind::Created)->and(Radar::query()->count())->toBe(1);
    });

    it('never checks the chat for pause, mode and delete', function (): void {
        config(['radar.require_chat' => true]);
        $this->user->forceFill(['bot_chat_state' => BotChatState::Blocked])->save();
        $radar = Radar::factory()->for($this->user)->create();

        expect($this->service->setActive($this->user, $radar, false)->kind)->toBe(RadarMutationKind::Paused)
            ->and($this->service->setMode($this->user, $radar, RadarMode::Digest)->mode)->toBe(RadarMode::Digest);

        $this->service->delete($this->user, $radar);

        expect(Radar::query()->count())->toBe(0);
    });

    it('refuses nothing while the flag is off', function (BotChatState $state): void {
        $this->user->forceFill(['bot_chat_state' => $state])->save();
        $radar = Radar::factory()->for($this->user)->paused()->create();

        expect($this->service->create($this->user, radarFilters(['price_max' => 1]), radarContext())->kind)->toBe(RadarMutationKind::Created)
            ->and($this->service->update($this->user, $radar, radarFilters(['price_max' => 2]), null)->kind)->toBe(RadarMutationKind::Updated)
            ->and($this->service->setActive($this->user, $radar, true)->kind)->toBe(RadarMutationKind::Resumed);
    })->with([BotChatState::Never, BotChatState::Blocked]);
});

describe('create', function (): void {
    it('creates a radar with the 25 filter keys as received, its hash, entry and relaxed code', function (): void {
        $filters = radarFilters(['price_max' => 700, 'posted_days' => 7, 'districts' => ['yunusobod']]);

        $mutation = $this->service->create($this->user, $filters, radarContext('few', 'price_more'));
        $radar = Radar::query()->sole();

        expect($mutation->kind)->toBe(RadarMutationKind::Created)
            ->and($mutation->radar->id)->toBe($radar->id)
            ->and($mutation->starter->count)->toBe(0)
            ->and($mutation->starter->numbers)->toBe([])
            ->and($mutation->options)->toBe([])
            ->and($mutation->relaxed)->toBe(['≈2 в день'])
            ->and($radar->user_id)->toBe($this->user->id)
            ->and(array_keys($radar->filters))->toBe(FilterArrays::KEYS)
            ->and($radar->filters)->toBe($filters->toArray())
            ->and($radar->filters['posted_days'])->toBe(7)
            ->and($radar->filters_hash)->toBe($filters->canonicalHash())
            ->and([$radar->city, $radar->deal, $radar->entry, $radar->relax_code])->toBe(['tashkent', 'rent_long', 'few', 'price_more'])
            ->and($radar->active)->toBeTrue()
            ->and($radar->mode)->toBe(RadarMode::Instant);
    });

    it('stores the entries of the feed card and the return banner as given', function (string $entry): void {
        $this->service->create($this->user, radarFilters(), radarContext($entry));

        expect(Radar::query()->sole()->entry)->toBe($entry);
    })->with(['feed', 'return', 'bot_wizard', 'bot_text']);

    it('refuses an unknown entry or relaxed code in the context', function (Closure $make): void {
        expect($make)->toThrow(InvalidArgumentException::class);
    })->with([
        'entry' => [fn (): RadarCreateContext => new RadarCreateContext(entry: 'banner')],
        'relaxed' => [fn (): RadarCreateContext => new RadarCreateContext(entry: 'filters', relaxed: 'Not A Code')],
        'locale' => [fn (): RadarCreateContext => new RadarCreateContext(entry: 'filters', locale: 'de')],
        'currency' => [fn (): RadarCreateContext => new RadarCreateContext(entry: 'filters', currency: 'EUR')],
    ]);

    it('answers an active twin as existing without a write; the same search ignores posted_days and list order', function (): void {
        $first = $this->service->create($this->user, radarFilters(['districts' => ['yunusobod', 'mirobod'], 'posted_days' => 3]), radarContext('filters'));

        [$statements] = radarStatements(function () use (&$second): void {
            $second = $this->service->create($this->user, radarFilters(['districts' => ['mirobod', 'yunusobod'], 'posted_days' => 30]), radarContext('few', 'price_more'));
        });

        expect($second->kind)->toBe(RadarMutationKind::Existing)
            ->and($second->radar->id)->toBe($first->radar->id)
            ->and($second->starter->count)->toBe(0)
            ->and(radarWrites($statements))->toBe([])
            ->and(Radar::query()->sole()->only(['entry', 'relax_code']))->toBe(['entry' => 'filters', 'relax_code' => null])
            ->and(Radar::query()->sole()->filters['posted_days'])->toBe(3);
    });

    it('answers an active twin as existing even at the limit', function (): void {
        config(['radar.max' => 1]);
        $first = $this->service->create($this->user, radarFilters(), radarContext());

        expect($this->service->create($this->user, radarFilters(), radarContext())->radar->id)->toBe($first->radar->id);
    });

    it('stores the body\'s filters on a paused twin it switches back on, a new posted_days with them', function (): void {
        $paused = Radar::factory()->for($this->user)->filters(['price_max' => 700, 'posted_days' => 3])->paused()->create();
        $filters = radarFilters(['price_max' => 700, 'posted_days' => 7]);

        $mutation = $this->service->create($this->user, $filters, radarContext('return'));
        $stored = $paused->fresh();

        expect($mutation->kind)->toBe(RadarMutationKind::Reactivated)
            ->and($mutation->radar->filters['posted_days'])->toBe(7)
            ->and($stored?->filters)->toBe($filters->toArray())
            ->and($stored?->only(['active', 'entry']))->toBe(['active' => true, 'entry' => 'return'])
            ->and(Radar::query()->count())->toBe(1);
    });

    it('switches a paused twin back on as reactivated and keeps the new entry and relaxed code', function (): void {
        $paused = Radar::factory()->for($this->user)->filters(['price_max' => 700])->paused()->create(['entry' => 'filters', 'relax_code' => null]);

        $mutation = $this->service->create($this->user, radarFilters(['price_max' => 700]), radarContext('return', 'district'));
        $radar = $paused->fresh();

        expect($mutation->kind)->toBe(RadarMutationKind::Reactivated)
            ->and($mutation->radar->id)->toBe($paused->id)
            ->and($radar?->active)->toBeTrue()
            ->and($radar?->paused_at)->toBeNull()
            ->and($radar?->only(['entry', 'relax_code']))->toBe(['entry' => 'return', 'relax_code' => 'district'])
            ->and(Radar::query()->count())->toBe(1);
    });

    it('re-reads the winner when a concurrent insert of the same search lands after the twin check', function (): void {
        $winner = null;
        $armed = true;
        DB::listen(function (QueryExecuted $query) use (&$winner, &$armed): void {
            if ($armed && str_starts_with($query->sql, 'select') && str_contains($query->sql, '"filters_hash" = ?')) {
                $armed = false;
                $winner = Radar::factory()->for($this->user)->filters(['price_max' => 700])->create();
            }
        });

        $mutation = $this->service->create($this->user, radarFilters(['price_max' => 700]), radarContext());

        expect($mutation->kind)->toBe(RadarMutationKind::Existing)
            ->and($mutation->radar->id)->toBe($winner?->id)
            ->and(Radar::query()->count())->toBe(1);
    });
});

describe('the limit', function (): void {
    it('counts active radars only and refuses the eleventh with radar_limit, writing nothing', function (): void {
        Radar::factory()->count(10)->for($this->user)->create();
        Radar::factory()->count(3)->for($this->user)->paused()->create();

        [$statements, $error] = radarStatements(fn () => $this->service->create($this->user, radarFilters(['price_max' => 1]), radarContext()));

        expect($error)->toBeInstanceOf(RadarLimit::class)
            ->and($error?->getMessage())->toContain('10')
            ->and(radarWrites($statements))->toBe([])
            ->and(Radar::query()->count())->toBe(13);
    });

    it('lets a user with nine active and many paused radars create the tenth', function (): void {
        Radar::factory()->count(9)->for($this->user)->create();
        Radar::factory()->count(5)->for($this->user)->paused()->create();

        expect($this->service->create($this->user, radarFilters(['price_max' => 1]), radarContext())->kind)->toBe(RadarMutationKind::Created);
    });

    it('refuses a paused twin and a resume at the limit, and never limits pause, mode and delete', function (): void {
        Radar::factory()->count(10)->for($this->user)->create();
        $paused = Radar::factory()->for($this->user)->filters(['price_max' => 1])->paused()->create();
        $active = $this->user->radars()->where('active', true)->firstOrFail();

        expect(fn () => $this->service->create($this->user, radarFilters(['price_max' => 1]), radarContext()))->toThrow(RadarLimit::class)
            ->and(fn () => $this->service->setActive($this->user, $paused, true))->toThrow(RadarLimit::class)
            ->and($paused->fresh()?->active)->toBeFalse()
            ->and($this->service->setMode($this->user, $active, RadarMode::Digest)->mode)->toBe(RadarMode::Digest)
            ->and($this->service->setActive($this->user, $active, false)->kind)->toBe(RadarMutationKind::Paused);

        $this->service->delete($this->user, $active);

        expect($this->service->setActive($this->user, $paused, true)->kind)->toBe(RadarMutationKind::Resumed);
    });

    it('keeps the radars of a user above a lowered limit and refuses only new activations', function (): void {
        Radar::factory()->count(4)->for($this->user)->create();
        $paused = Radar::factory()->for($this->user)->paused()->create();
        config(['radar.max' => 2]);

        expect(fn () => $this->service->create($this->user, radarFilters(['price_max' => 1]), radarContext()))->toThrow(RadarLimit::class)
            ->and(fn () => $this->service->setActive($this->user, $paused, true))->toThrow(RadarLimit::class)
            ->and($this->user->radars()->where('active', true)->count())->toBe(4)
            ->and($this->service->update($this->user, $this->user->radars()->where('active', true)->firstOrFail(), radarFilters(['price_max' => 2]), null)->kind)
            ->toBe(RadarMutationKind::Updated);
    });

    it('counts every radar of the user with the total scope', function (): void {
        config(['radar.limit_scope' => 'total', 'radar.max' => 3]);
        Radar::factory()->count(2)->for($this->user)->paused()->create();
        $paused = Radar::factory()->for($this->user)->paused()->create();

        expect(fn () => $this->service->create($this->user, radarFilters(['price_max' => 1]), radarContext()))->toThrow(RadarLimit::class)
            ->and($this->service->setActive($this->user, $paused, true)->kind)->toBe(RadarMutationKind::Resumed);
    });
});

describe('update', function (): void {
    it('replaces the filters and the relaxed code and keeps active and mode', function (bool $active): void {
        $radar = Radar::factory()->for($this->user)->create(['active' => $active, 'mode' => 'digest', 'paused_at' => $active ? null : now()]);
        $filters = radarFilters(['price_max' => 900, 'rooms_min' => 2]);

        $mutation = $this->service->update($this->user, $radar, $filters, 'rooms');
        $stored = $radar->fresh();

        expect($mutation->kind)->toBe(RadarMutationKind::Updated)
            ->and($stored?->filters)->toBe($filters->toArray())
            ->and($stored?->filters_hash)->toBe($filters->canonicalHash())
            ->and($stored?->relax_code)->toBe('rooms')
            ->and($stored?->active)->toBe($active)
            ->and($stored?->mode)->toBe(RadarMode::Digest);
    })->with(['active' => true, 'paused' => false]);

    it('refuses filters equal to another radar of the user with radar_duplicate and writes nothing', function (): void {
        Radar::factory()->for($this->user)->filters(['price_max' => 900])->paused()->create();
        $radar = Radar::factory()->for($this->user)->filters(['price_max' => 500])->create();

        [$statements, $error] = radarStatements(fn () => $this->service->update($this->user, $radar, radarFilters(['price_max' => 900, 'posted_days' => 3]), null));

        expect($error)->toBeInstanceOf(RadarDuplicate::class)
            ->and(radarWrites($statements))->toBe([])
            ->and($radar->fresh()?->filters['price_max'])->toBe(500);
    });

    it('stores a new posted_days of the same search as received: a write with the relaxed code, the starter of an update and RadarSaved', function (): void {
        config(['radar.starter_enabled' => true]);
        $source = FakeListingSource::bind()->withItems([100001 => []]);
        Event::fake([RadarSaved::class]);
        $radar = Radar::factory()->for($this->user)->filters(['price_max' => 500, 'posted_days' => 3])->create();
        $filters = radarFilters(['price_max' => 500, 'posted_days' => 14]);

        $mutation = app(RadarService::class)->update($this->user, $radar, $filters, 'price_more');
        $stored = $radar->fresh();

        expect($mutation->kind)->toBe(RadarMutationKind::Updated)
            ->and($mutation->starter->numbers)->toBe([100001])
            ->and($stored?->filters)->toBe($filters->toArray())
            ->and($stored?->filters['posted_days'])->toBe(14)
            ->and($stored?->filters_hash)->toBe($radar->filters_hash)
            ->and($stored?->relax_code)->toBe('price_more')
            ->and($source->callsOf('feed'))->toHaveCount(1);
        Event::assertDispatchedTimes(RadarSaved::class, 1);
        Event::assertDispatched(RadarSaved::class, fn (RadarSaved $event): bool => $event->kind === RadarMutationKind::Updated && $event->starterNumbers === [100001]);
    });

    it('writes nothing for the filters it has and answers updated with an empty starter', function (): void {
        $radar = Radar::factory()->for($this->user)->filters(['price_max' => 500, 'posted_days' => 3])->create();

        [$statements] = radarStatements(function () use ($radar, &$mutation): void {
            $mutation = $this->service->update($this->user, $radar, radarFilters(['price_max' => 500, 'posted_days' => 3]), 'price_more');
        });

        expect($mutation->kind)->toBe(RadarMutationKind::Updated)
            ->and($mutation->starter->count)->toBe(0)
            ->and(radarWrites($statements))->toBe([])
            ->and($radar->fresh()?->only(['relax_code']))->toBe(['relax_code' => null]);
    });
});

describe('switching on and off, the mode and delete', function (): void {
    it('pauses with paused_at and switches on clearing it', function (): void {
        $radar = Radar::factory()->for($this->user)->create();

        $paused = $this->service->setActive($this->user, $radar, false);

        expect($paused->kind)->toBe(RadarMutationKind::Paused)
            ->and($paused->starter->count)->toBe(0)
            ->and($radar->fresh()?->active)->toBeFalse()
            ->and($radar->fresh()?->paused_at)->not->toBeNull();

        $resumed = $this->service->setActive($this->user, $radar, true);

        expect($resumed->kind)->toBe(RadarMutationKind::Resumed)
            ->and($radar->fresh()?->active)->toBeTrue()
            ->and($radar->fresh()?->paused_at)->toBeNull();
    });

    it('writes nothing when the radar is already in the asked state', function (bool $active): void {
        $radar = Radar::factory()->for($this->user)->create(['active' => $active, 'paused_at' => $active ? null : now()->subDay()]);

        [$statements] = radarStatements(fn () => $this->service->setActive($this->user, $radar, $active));

        expect(radarWrites($statements))->toBe([]);
    })->with(['on' => true, 'off' => false]);

    it('acts on the radar as stored, not on the copy it is given', function (): void {
        $radar = Radar::factory()->for($this->user)->create();
        $stale = Radar::query()->findOrFail($radar->id);
        $this->service->setActive($this->user, $radar, false);

        expect($this->service->setActive($this->user, $stale, false)->radar->paused_at)->not->toBeNull()
            ->and($this->service->setActive($this->user, $stale, true)->kind)->toBe(RadarMutationKind::Resumed);
    });

    it('changes the mode and keeps the rest', function (): void {
        $radar = Radar::factory()->for($this->user)->paused()->create();

        $changed = $this->service->setMode($this->user, $radar, RadarMode::Digest);

        expect($changed->mode)->toBe(RadarMode::Digest)
            ->and($radar->fresh()?->mode)->toBe(RadarMode::Digest)
            ->and($radar->fresh()?->active)->toBeFalse();
    });

    it('deletes the radar with its hide rules', function (): void {
        $radar = Radar::factory()->for($this->user)->create();
        RadarHideRule::factory()->count(2)->for($radar)->create();
        $other = Radar::factory()->for($this->user)->create();

        $this->service->delete($this->user, $radar);

        expect(Radar::query()->pluck('id')->all())->toBe([$other->id])->and(RadarHideRule::query()->count())->toBe(0);
    });

    it('treats a radar of another user or a deleted one as unknown and changes nothing', function (Closure $write): void {
        $foreign = Radar::factory()->create();
        $gone = Radar::factory()->for($this->user)->create();
        $gone->delete();

        foreach ([$foreign, $gone] as $radar) {
            expect(fn () => $write($this->service, $this->user, $radar))->toThrow(ModelNotFoundException::class);
        }

        expect($foreign->fresh()?->only(['active', 'mode', 'filters_hash']))->toBe($foreign->only(['active', 'mode', 'filters_hash']));
    })->with([
        'update' => [fn (RadarService $service, User $user, Radar $radar): mixed => $service->update($user, $radar, radarFilters(['price_max' => 2]), null)],
        'switch on' => [fn (RadarService $service, User $user, Radar $radar): mixed => $service->setActive($user, $radar, true)],
        'pause' => [fn (RadarService $service, User $user, Radar $radar): mixed => $service->setActive($user, $radar, false)],
        'mode' => [fn (RadarService $service, User $user, Radar $radar): mixed => $service->setMode($user, $radar, RadarMode::Digest)],
        'delete' => [fn (RadarService $service, User $user, Radar $radar): mixed => $service->delete($user, $radar)],
    ]);
});

describe('unhide', function (): void {
    it('clears the radar\'s rules and zeroes its counter as stored, without the chat check, and answers the radar', function (): void {
        config(['radar.require_chat' => true]);
        $this->user->forceFill(['bot_chat_state' => BotChatState::Never])->save();
        $radar = Radar::factory()->for($this->user)->create(['hidden_count' => 3]);
        $stale = Radar::query()->findOrFail($radar->id);
        RadarHideRule::factory()->count(2)->for($radar)->create();
        $other = RadarHideRule::factory()->for(Radar::factory()->for($this->user)->create(['hidden_count' => 1]))->create();

        $unhidden = $this->service->unhide($this->user, $stale);

        expect($unhidden->id)->toBe($radar->id)
            ->and($unhidden->hidden_count)->toBe(0)
            ->and($radar->fresh()?->hidden_count)->toBe(0)
            ->and(RadarHideRule::query()->pluck('id')->all())->toBe([$other->id])
            ->and($other->radar()->firstOrFail()->hidden_count)->toBe(1);
    });

    it('refuses with RadarsDisabled while radars are switched off, before any query or lock, and keeps the rules', function (): void {
        $radar = Radar::factory()->for($this->user)->create(['hidden_count' => 3]);
        RadarHideRule::factory()->for($radar)->create();
        config(['radar.creation_enabled' => false]);
        Cache::spy();

        [$statements, $error] = radarStatements(fn () => $this->service->unhide($this->user, $radar));

        expect($error)->toBeInstanceOf(RadarsDisabled::class)
            ->and($statements)->toBe([])
            ->and($radar->fresh()?->hidden_count)->toBe(3)
            ->and(RadarHideRule::query()->count())->toBe(1);
        Cache::shouldNotHaveReceived('lock');
    });

    it('answers a radar of another user as unknown before any query, and keeps its rules and counter', function (): void {
        $foreign = Radar::factory()->create(['hidden_count' => 3]);
        RadarHideRule::factory()->for($foreign)->create();

        [$statements, $error] = radarStatements(fn () => $this->service->unhide($this->user, $foreign));

        expect($error)->toBeInstanceOf(ModelNotFoundException::class)
            ->and($statements)->toBe([])
            ->and($foreign->fresh()?->hidden_count)->toBe(3)
            ->and(RadarHideRule::query()->count())->toBe(1);
    });

    it('clears under the user\'s lock', function (): void {
        $radar = Radar::factory()->for($this->user)->create(['hidden_count' => 3]);
        RadarHideRule::factory()->for($radar)->create();

        if (DB::getDriverName() === 'pgsql') {
            [$statements] = radarStatements(fn () => $this->service->unhide($this->user, $radar));

            expect($statements)->toContain("select pg_advisory_xact_lock(hashtext('radar:' || ?))");

            return;
        }

        Cache::lock("radar:{$this->user->id}", 30)->get();

        expect(fn () => $this->service->unhide($this->user, $radar))->toThrow(LockTimeoutException::class)
            ->and($radar->fresh()?->hidden_count)->toBe(3)
            ->and(RadarHideRule::query()->count())->toBe(1);
    });
});

describe('events', function (): void {
    beforeEach(function (): void {
        Event::fake([RadarSaved::class, RadarDeleted::class]);
    });

    it('announces each write with ids, kind and starter numbers only', function (): void {
        $created = $this->service->create($this->user, radarFilters(['price_max' => 700]), radarContext());
        $radar = $created->radar;
        $this->service->update($this->user, $radar, radarFilters(['price_max' => 800]), null);
        $this->service->setActive($this->user, $radar, false);
        $this->service->setActive($this->user, $radar, true);
        $this->service->setActive($this->user, $radar, false);
        $this->service->create($this->user, radarFilters(['price_max' => 800]), radarContext());
        $this->service->delete($this->user, $radar);

        $saved = Event::dispatched(RadarSaved::class)->map(fn (array $args): array => [$args[0]->radarId, $args[0]->userId, $args[0]->kind, $args[0]->starterNumbers])->all();

        expect($saved)->toBe([
            [$radar->id, $this->user->id, RadarMutationKind::Created, []],
            [$radar->id, $this->user->id, RadarMutationKind::Updated, []],
            [$radar->id, $this->user->id, RadarMutationKind::Paused, []],
            [$radar->id, $this->user->id, RadarMutationKind::Resumed, []],
            [$radar->id, $this->user->id, RadarMutationKind::Paused, []],
            [$radar->id, $this->user->id, RadarMutationKind::Reactivated, []],
        ]);
        Event::assertDispatched(RadarDeleted::class, fn (RadarDeleted $event): bool => $event->radarId === $radar->id && $event->userId === $this->user->id);
        expect(array_keys(get_object_vars(new RadarSaved('x', 1, RadarMutationKind::Created, []))))->toBe(['radarId', 'userId', 'kind', 'starterNumbers'])
            ->and(array_keys(get_object_vars(new RadarDeleted('x', 1))))->toBe(['radarId', 'userId']);
    });

    it('deletes and announces the delete although the remembered options cannot be forgotten', function (): void {
        Exceptions::fake();
        Cache::extend('forget_fails', fn (): Repository => Cache::repository(new class extends ArrayStore
        {
            public function forget($key): bool
            {
                throw new RuntimeException('the cache store is down');
            }
        }));
        config(['cache.stores.forget_fails' => ['driver' => 'forget_fails'], 'cache.default' => 'forget_fails']);
        $radar = Radar::factory()->for($this->user)->create();

        $this->service->delete($this->user, $radar);

        expect(Radar::query()->count())->toBe(0);
        Event::assertDispatchedTimes(RadarDeleted::class, 1);
        Event::assertDispatched(RadarDeleted::class, fn (RadarDeleted $event): bool => $event->radarId === $radar->id);
        Exceptions::assertReported(fn (RuntimeException $e): bool => $e->getMessage() === 'the cache store is down');
    });

    it('announces nothing when nothing was written', function (): void {
        $radar = Radar::factory()->for($this->user)->filters(['price_max' => 700])->create();

        $this->service->create($this->user, radarFilters(['price_max' => 700]), radarContext());
        $this->service->update($this->user, $radar, radarFilters(['price_max' => 700]), null);
        $this->service->setActive($this->user, $radar, true);
        $this->service->setMode($this->user, $radar, RadarMode::Digest);

        Event::assertNotDispatched(RadarSaved::class);
    });

    it('announces only after the surrounding transaction commits, and nothing when it rolls back', function (): void {
        try {
            DB::transaction(function (): void {
                $radar = $this->service->create($this->user, radarFilters(['price_max' => 700]), radarContext())->radar;
                $this->service->delete($this->user, $radar);
                Event::assertNotDispatched(RadarSaved::class);
                Event::assertNotDispatched(RadarDeleted::class);

                throw new RuntimeException('rolled back');
            });
        } catch (RuntimeException) {
        }

        Event::assertNotDispatched(RadarSaved::class);
        Event::assertNotDispatched(RadarDeleted::class);
        expect(Radar::query()->count())->toBe(0);

        DB::transaction(function (): void {
            $this->service->create($this->user, radarFilters(['price_max' => 700]), radarContext());
            Event::assertNotDispatched(RadarSaved::class);
        });

        Event::assertDispatchedTimes(RadarSaved::class, 1);
    });
});

it('serialises one user\'s writes behind a cache lock on SQLite and an advisory lock on PostgreSQL', function (): void {
    $radar = Radar::factory()->for($this->user)->create();

    if (DB::getDriverName() === 'pgsql') {
        [$statements] = radarStatements(fn () => $this->service->setMode($this->user, $radar, RadarMode::Digest));

        expect($statements)->toContain("select pg_advisory_xact_lock(hashtext('radar:' || ?))");

        return;
    }

    Cache::lock("radar:{$this->user->id}", 30)->get();

    expect(fn () => $this->service->setMode($this->user, $radar, RadarMode::Digest))->toThrow(LockTimeoutException::class)
        ->and($radar->fresh()?->mode)->toBe(RadarMode::Instant);
});

describe('the starter', function (): void {
    beforeEach(function (): void {
        config(['radar.starter_enabled' => true]);
        $this->source = FakeListingSource::bind()->withItems([100001 => [], 100002 => [], 100003 => []]);
        $this->source->flow = new FlowEstimate(0, 7, []);
        ListingView::factory()->for($this->user)->create(['listing_number' => 100002]);
        $this->service = app(RadarService::class);
        Event::fake([RadarSaved::class]);
    });

    it('sends the new radar\'s listings after a create, in the write\'s language and currency', function (): void {
        $mutation = $this->service->create($this->user, radarFilters(['price_max' => 700]), new RadarCreateContext(entry: 'filters', locale: 'en', currency: 'UZS'));

        expect($mutation->starter->numbers)->toBe([100001, 100002, 100003])
            ->and($mutation->starter->count)->toBe(3)
            ->and([$this->source->calls[0][2]->locale, $this->source->calls[0][2]->currency])->toBe(['en', 'UZS']);
        Event::assertDispatched(RadarSaved::class, fn (RadarSaved $event): bool => $event->starterNumbers === [100001, 100002, 100003]);
    });

    it('sends only the unseen listings when a radar is switched back on, also as a paused twin', function (): void {
        $radar = Radar::factory()->for($this->user)->filters(['price_max' => 700])->paused()->create();

        expect($this->service->create($this->user, radarFilters(['price_max' => 700]), radarContext())->starter->numbers)->toBe([100001, 100003]);

        $this->service->setActive($this->user, $radar, false);

        expect($this->service->setActive($this->user, $radar, true)->starter->numbers)->toBe([100001, 100003]);
    });

    it('sends what the new filters find to an active radar and nothing to a paused one', function (): void {
        $active = Radar::factory()->for($this->user)->create();
        $paused = Radar::factory()->for($this->user)->paused()->create();

        expect($this->service->update($this->user, $active, radarFilters(['price_max' => 900]), null)->starter->numbers)->toBe([100001, 100002, 100003])
            ->and($this->source->calls)->toHaveCount(1)
            ->and($this->service->update($this->user, $paused, radarFilters(['price_max' => 901]), null)->starter->numbers)->toBe([])
            ->and($this->source->callsOf('feed'))->toHaveCount(1);
    });

    it('asks no source for a write that sends nothing', function (): void {
        $radar = Radar::factory()->for($this->user)->filters(['price_max' => 700])->create();

        $this->service->create($this->user, radarFilters(['price_max' => 700]), radarContext());
        $this->service->update($this->user, $radar, radarFilters(['price_max' => 700]), null);
        $this->service->setActive($this->user, $radar, true);
        $this->service->setMode($this->user, $radar, RadarMode::Digest);
        $this->service->setActive($this->user, $radar, false);

        expect($this->source->calls)->toBe([]);
    });

    it('keeps the write and answers an empty starter when the source fails, logging no filters', function (): void {
        $this->source->failure = new SourceUnavailable;
        Log::spy();

        $mutation = $this->service->create($this->user, radarFilters(['price_max' => 777]), radarContext());

        expect($mutation->kind)->toBe(RadarMutationKind::Created)
            ->and($mutation->starter->count)->toBe(0)
            ->and(Radar::query()->count())->toBe(1);
        Event::assertDispatched(RadarSaved::class, fn (RadarSaved $event): bool => $event->starterNumbers === []);
        Log::shouldHaveReceived('warning')->withArgs(fn (string $message, array $context): bool => $context === ['radar' => $mutation->radar->id, 'kind' => 'created'] && ! str_contains($message, '777'))->once();
    });
});
