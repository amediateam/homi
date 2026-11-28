<?php

use App\Exceptions\ApiException;
use App\Models\Radar;
use App\Models\User;
use App\Services\Radar\RadarCreateContext;
use App\Services\Radar\RadarService;
use App\Services\Search\SearchFilters;
use Database\Factories\RadarFactory;

/*
 * WP-45 (`15` §3.4 row 1, §3.6 rows 2 and 3; SEC-REQ-015): one user's radar writes race — a double tap, two tabs, the
 * Mini App and the bot. Each child process calls `RadarService` itself (the controllers answer stubs until stage B)
 * in its own PostgreSQL connection, after a shared start time. The per-user advisory lock serialises them, the twin and
 * the limit are read after it, and the unique (`user_id`, `filters_hash`) is the backstop: ten identical creates make
 * one radar and every answer names it; twenty creates at nine active radars make exactly one more; a resume racing a
 * create at the limit lets only one through.
 */

/** The answer of a child: `['ok', radar id, kind]` or `['error', code]`. */
function radarRaceTask(int $userId, string $write, array $filters, ?string $radarId, float $startAt): Closure
{
    return static function () use ($userId, $write, $filters, $radarId, $startAt): array {
        config(['radar.creation_enabled' => true, 'radar.max' => 10, 'radar.require_chat' => false, 'radar.starter_enabled' => false]);
        $user = User::query()->findOrFail($userId);
        $service = app(RadarService::class);

        if ($startAt > microtime(true)) {
            time_sleep_until($startAt);
        }

        try {
            $mutation = $write === 'resume'
                ? $service->setActive($user, Radar::query()->findOrFail($radarId), true)
                : $service->create($user, SearchFilters::fromNormalised($filters), new RadarCreateContext(entry: 'filters'));

            return ['ok', $mutation->radar->id, $mutation->kind->value];
        } catch (ApiException $e) {
            return ['error', $e->errorCode];
        }
    };
}

/**
 * One create per filters array, after a shared start time.
 *
 * @param  list<array<string, mixed>>  $filters
 * @return list<Closure(): array<int, string>>
 */
function radarCreateRaceTasks(int $userId, array $filters): array
{
    $startAt = microtime(true) + 2.0;

    return array_map(fn (array $one): Closure => radarRaceTask($userId, 'create', $one, null, $startAt), $filters);
}

/** @return array<string, mixed> the default filters with one price bound, below the factory's unique range */
function radarRaceFilters(int $priceMax): array
{
    return [...RadarFactory::DEFAULT_FILTERS, 'price_max' => $priceMax];
}

it('keeps one radar when ten identical creates run at once, and every answer names it', function (): void {
    $user = User::factory()->create();

    $answers = concurrently(radarCreateRaceTasks($user->id, array_fill(0, 10, radarRaceFilters(70))));

    $radar = Radar::query()->sole();
    $kinds = array_column($answers, 2);
    sort($kinds);

    expect(array_column($answers, 0))->toBe(array_fill(0, 10, 'ok'))
        ->and(array_unique(array_column($answers, 1)))->toBe([$radar->id])
        ->and($kinds)->toBe(['created', ...array_fill(0, 9, 'existing')])
        ->and($radar->user_id)->toBe($user->id)
        ->and($radar->active)->toBeTrue();
});

it('makes exactly the tenth radar when twenty creates run at once at nine active radars, the others radar_limit', function (): void {
    $user = User::factory()->create();
    Radar::factory()->count(9)->for($user)->create();
    Radar::factory()->count(2)->for($user)->paused()->create();

    $answers = concurrently(radarCreateRaceTasks($user->id, array_map(radarRaceFilters(...), range(50, 69))));

    $outcomes = array_count_values(array_map(fn (array $answer): string => $answer[0] === 'ok' ? $answer[2] : $answer[1], $answers));

    expect($outcomes)->toBe(['created' => 1, 'radar_limit' => 19])
        ->and($user->radars()->where('active', true)->count())->toBe(10)
        ->and($user->radars()->count())->toBe(12);
});

it('lets only one through when a resume races a create at the limit', function (): void {
    $user = User::factory()->create();
    Radar::factory()->count(9)->for($user)->create();
    $paused = Radar::factory()->for($user)->paused()->create();
    $startAt = microtime(true) + 2.0;

    $answers = concurrently([
        radarRaceTask($user->id, 'resume', [], $paused->id, $startAt),
        radarRaceTask($user->id, 'create', radarRaceFilters(60), null, $startAt),
    ]);

    $outcomes = array_map(fn (array $answer): string => $answer[0] === 'ok' ? $answer[2] : $answer[1], $answers);
    sort($outcomes);

    expect($outcomes)->toBeIn([['radar_limit', 'resumed'], ['created', 'radar_limit']])
        ->and($user->radars()->where('active', true)->count())->toBe(10);
});
