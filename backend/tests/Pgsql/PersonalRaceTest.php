<?php

use App\Models\AuthorMark;
use App\Models\BlockedAuthor;
use App\Models\Favorite;
use App\Models\HiddenListing;
use App\Models\ListingMark;
use App\Models\ListingRef;
use App\Models\ListingVote;
use App\Models\User;
use App\Models\VoteDecision;
use Illuminate\Contracts\Http\Kernel;
use Illuminate\Http\Request;

/*
 * WP-44 (`15` §3.6, SEC-REQ-015): the personal writes of one user race — a double tap, two tabs, the Mini App and the
 * bot. Each child process sends the request through the HTTP kernel with the user's bearer token, in its own
 * PostgreSQL connection, after a shared start time, so the statements run together: one row must stay, and no request
 * may fail. The listings are filed in `listing_refs`, so no child asks a source. The votes of stage B race too: one user
 * reporting twice at once keeps one vote, and distinct users whose votes land exactly on a threshold at once mark the
 * subject once, with one decision row — `VoteService` locks the subject's mark row before it counts, so no voter counts
 * without the others' committed votes (PostgreSQL's default isolation). The thresholds are DEC-112's: `agent` 4.5 with
 * three voters of 1.5, `rented` 4.0 with four voters of 1.0.
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

/**
 * One child per voter, each with its own token and the same body, after a shared start time.
 *
 * @param  list<User>  $voters
 * @param  array<string, string>  $body
 * @return list<Closure(): array{int, mixed}>
 */
function voteRaceTasks(array $voters, string $uri, array $body): array
{
    $startAt = microtime(true) + 2.0;

    return array_map(fn (User $voter): Closure => personalVoteTask($uri, $body, personalRaceToken($voter), $startAt), $voters);
}

/** @param  array<string, string>  $body */
function personalVoteTask(string $uri, array $body, string $token, float $startAt): Closure
{
    return static function () use ($uri, $body, $token, $startAt): array {
        $request = Request::create($uri, 'POST', server: [
            'HTTP_AUTHORIZATION' => "Bearer {$token}", 'HTTP_ACCEPT' => 'application/json', 'CONTENT_TYPE' => 'application/json',
        ], content: (string) json_encode($body));

        if ($startAt > microtime(true)) {
            time_sleep_until($startAt);
        }

        $response = app(Kernel::class)->handle($request);

        return [$response->getStatusCode(), json_decode((string) $response->getContent(), true)];
    };
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

it('keeps one vote and one hidden row when one user reports the same reason twice at once, and none fails', function (): void {
    $user = User::factory()->create();
    ListingRef::factory()->create(['listing_number' => 100012]);
    $startAt = microtime(true) + 2.0;
    $token = personalRaceToken($user);

    $answers = concurrently(array_map(fn (int $tap): Closure => personalVoteTask('/api/v1/listings/100012/reports', ['reason' => 'rented'], $token, $startAt), [1, 2]));

    expect(array_column($answers, 0))->toBe([200, 200])
        ->and(array_column(array_column($answers, 1), 'data'))->toBe(array_fill(0, 2, ['hidden' => true, 'agent_marked' => false]))
        ->and(ListingVote::query()->where('user_id', $user->id)->count())->toBe(1)
        ->and(HiddenListing::query()->where('user_id', $user->id)->count())->toBe(1);
});

it('marks an author once, with one decision, when distinct voters land exactly on the agent threshold at once', function (): void {
    $key = 'source:race_author';
    // The author's lock row exists already (an earlier mark was removed), so `insertOrIgnore` waits for nobody and only
    // the row lock serialises the recounts.
    AuthorMark::factory()->create(['author_key' => $key, 'realtor_marked_at' => null, 'source' => null]);
    ListingRef::factory()->ofAuthor($key, 'source')->create(['listing_number' => 100003]);
    ListingRef::factory()->ofAuthor($key, 'source')->create(['listing_number' => 100004]);
    $voters = array_values(User::factory()->count(3)->create(['has_username' => true, 'has_photo' => true])->all());

    $answers = concurrently([
        ...voteRaceTasks([$voters[0], $voters[1]], '/api/v1/listings/100003/reports', ['reason' => 'agent']),
        ...voteRaceTasks([$voters[2]], '/api/v1/listings/100004/reports', ['reason' => 'agent']),
    ]);

    $decision = VoteDecision::query()->sole();
    expect(array_column($answers, 0))->toBe([200, 200, 200])
        ->and(ListingVote::query()->where('author_key', $key)->count())->toBe(3)
        ->and(AuthorMark::query()->sole()->realtor_marked_at)->not->toBeNull()
        ->and([$decision->subject_type, $decision->subject, $decision->reason, $decision->voters, $decision->weight_sum, $decision->threshold, $decision->outcome])
        ->toBe(['author', $key, 'agent', 3, '4.50', '4.50', 'marked'])
        ->and(array_count_values(array_map(fn (array $answer): string => json_encode($answer[1]['data']['agent_marked'] ?? null) ?: '', $answers)))
        ->toEqual(['false' => 2, 'true' => 1]);
});

it('marks a listing rented once, with one decision, when distinct voters land exactly on the threshold at once', function (): void {
    // No mark row yet: the first insert of the lock row makes the others wait for its commit.
    ListingRef::factory()->create(['listing_number' => 100012]);

    $answers = concurrently(voteRaceTasks(array_values(User::factory()->count(4)->create()->all()), '/api/v1/listings/100012/reports', ['reason' => 'rented']));

    expect(array_column($answers, 0))->toBe([200, 200, 200, 200])
        ->and(ListingMark::query()->sole()->rented_at)->not->toBeNull()
        ->and(VoteDecision::query()->get(['voters', 'weight_sum', 'threshold', 'outcome'])->map(fn (VoteDecision $row): array => [$row->voters, $row->weight_sum, $row->threshold, $row->outcome])->all())
        ->toBe([[4, '4.00', '4.00', 'marked']]);
});
