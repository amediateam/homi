<?php

use App\Models\BlockedAuthor;
use App\Models\Favorite;
use App\Models\HiddenListing;
use App\Models\ListingRef;
use App\Models\User;
use Illuminate\Contracts\Http\Kernel;
use Illuminate\Http\Request;

/*
 * WP-44 (`15` §3.6, SEC-REQ-015): the personal writes of one user race — a double tap, two tabs, the Mini App and the
 * bot. Each child process sends the request through the HTTP kernel with the user's bearer token, in its own
 * PostgreSQL connection, after a shared start time, so the statements run together: one row must stay, and no request
 * may fail. The listings are filed in `listing_refs`, so no child asks a source.
 */

/** A child that sends one request with the token and answers its status and JSON body. */
function personalRaceTask(string $method, string $uri, string $token, float $startAt): Closure
{
    return static function () use ($method, $uri, $token, $startAt): array {
        $request = Request::create($uri, $method, server: ['HTTP_AUTHORIZATION' => "Bearer {$token}", 'HTTP_ACCEPT' => 'application/json']);

        if ($startAt > microtime(true)) {
            time_sleep_until($startAt);
        }

        $response = app(Kernel::class)->handle($request);

        return [$response->getStatusCode(), json_decode((string) $response->getContent(), true)];
    };
}

/** @return list<Closure(): array{int, mixed}> */
function personalRaceTasks(string $method, string $uri, string $token, int $count): array
{
    $startAt = microtime(true) + 2.0;
    $tasks = [];

    for ($task = 0; $task < $count; $task++) {
        $tasks[] = personalRaceTask($method, $uri, $token, $startAt);
    }

    return $tasks;
}

function personalRaceToken(User $user): string
{
    return $user->createToken('race', ['app:read', 'app:write'], now()->addHour())->plainTextToken;
}

it('keeps one favourite when ten identical PUT /favorites/{number} run at once, and none fails', function (): void {
    $user = User::factory()->create();
    ListingRef::factory()->create(['listing_number' => 100012, 'source_channel' => 'stub_channel_a', 'source_post_id' => 4812]);

    $answers = concurrently(personalRaceTasks('PUT', '/api/v1/favorites/100012', personalRaceToken($user), 10));

    expect(array_column($answers, 0))->toBe(array_fill(0, 10, 200))
        ->and(array_unique(array_map(fn (array $answer): string => json_encode($answer[1]['data'] ?? null) ?: '', $answers)))->toBe(['{"favorite":true}']);

    $row = Favorite::query()->sole();
    expect([$row->user_id, $row->listing_number, $row->source_channel, $row->source_post_id])->toBe([$user->id, 100012, 'stub_channel_a', 4812]);
});

it('keeps one hidden row when ten identical PUT /hidden/listings/{number} run at once, and none fails', function (): void {
    $user = User::factory()->create();
    ListingRef::factory()->create(['listing_number' => 100012]);

    $answers = concurrently(personalRaceTasks('PUT', '/api/v1/hidden/listings/100012', personalRaceToken($user), 10));

    expect(array_column($answers, 0))->toBe(array_fill(0, 10, 204))
        ->and(HiddenListing::query()->where('user_id', $user->id)->pluck('listing_number')->all())->toBe([100012]);
});

it('keeps one entry when ten blocks of one author run at once, each answering the same entry', function (): void {
    $user = User::factory()->create();
    ListingRef::factory()->ofAuthor('source:race_channel', 'source')->create(['listing_number' => 100003, 'source_channel' => 'race_channel', 'source_post_id' => 1]);
    ListingRef::factory()->ofAuthor('source:race_channel', 'source')->create(['listing_number' => 100004]);

    $answers = concurrently(personalRaceTasks('PUT', '/api/v1/listings/100003/blocked-author', personalRaceToken($user), 10));

    $entry = BlockedAuthor::query()->sole();
    expect(array_column($answers, 0))->toBe(array_fill(0, 10, 200))
        ->and(array_unique(array_map(fn (array $answer): string => (string) ($answer[1]['data']['id'] ?? ''), $answers)))->toBe([$entry->id])
        ->and(array_unique(array_map(fn (array $answer): string => json_encode($answer[1]['data'] ?? null) ?: '', $answers)))->toHaveCount(1)
        ->and([$entry->user_id, $entry->author_key, $entry->kind, $entry->label])->toBe([$user->id, 'source:race_channel', 'source', '@race_channel'])
        ->and($answers[0][1]['data']['listing_numbers'])->toBe([100003, 100004]);
});
