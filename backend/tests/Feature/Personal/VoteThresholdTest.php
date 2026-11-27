<?php

use App\Enums\Personal\HiddenReason;
use App\Enums\Personal\ReportDetail;
use App\Enums\Personal\ReportReason;
use App\Models\AuthorMark;
use App\Models\HiddenListing;
use App\Models\ListingMark;
use App\Models\ListingRef;
use App\Models\ListingVote;
use App\Models\SourceFlagChange;
use App\Models\User;
use App\Models\VoteDecision;
use App\Services\Listings\ListingPointer;
use App\Services\Personal\EloquentOverlayData;
use App\Services\Personal\ReportOutcome;
use App\Services\Personal\VoteDetectors;
use App\Services\Personal\VoteService;
use Illuminate\Log\Events\MessageLogged;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Http;
use Laravel\Pennant\Feature;

/*
 * WP-44, step 8: the detectors behind the report votes (SEC-REQ-045, task `KV-BE-043`). One tap never relabels a
 * listing or a person for everybody: a mark needs the weighted sum of distinct voters at a threshold (`rented` per
 * listing, `agent` per author key with one weight per user, `fraud` per native listing), and at least two of them; it
 * is written once, with a `vote_decisions` row of its inputs, and a recount that falls below removes it with an
 * `unmarked` row. Each detector has a kill switch: off writes no new mark, and the overlay ignores the marks at once.
 * The voters here weigh 1.0 each unless a test gives them a flag.
 */

const VOTE_AUTHOR = 'phone:0123456789abcdef0123456789abcdef';

beforeEach(function (): void {
    Http::preventStrayRequests();
});

function votes(): VoteService
{
    return app(VoteService::class);
}

function votePointer(int $number = 100012): ListingPointer
{
    return new ListingPointer($number, null, null);
}

/**
 * Reports the listing for the reason once per voter.
 *
 * @param  list<User>  $voters
 * @return list<ReportOutcome>
 */
function reportBy(array $voters, ReportReason $reason, int $number = 100012): array
{
    return array_map(fn (User $voter): ReportOutcome => votes()->report($voter, votePointer($number), $reason), $voters);
}

/** @return list<User> */
function voters(int $count, array $attributes = []): array
{
    return array_values(User::factory()->count($count)->create($attributes)->all());
}

/** @return list<array{string, string, string, int, string, string, string}> */
function decisions(): array
{
    return VoteDecision::query()->orderBy('id')->get()
        ->map(fn (VoteDecision $row): array => [$row->subject_type, $row->subject, $row->reason, $row->voters, $row->weight_sum, $row->threshold, $row->outcome])
        ->values()->all();
}

function rentedAt(int $number = 100012): mixed
{
    return ListingMark::query()->find($number)?->rented_at;
}

function realtorMarkedAt(string $key = VOTE_AUTHOR): mixed
{
    return AuthorMark::query()->find($key)?->realtor_marked_at;
}

function switchDetector(string $detector, bool $on): void
{
    app(VoteDetectors::class)->set($detector, $on, 'test', 'a test');
}

it('keeps a listing unmarked below the rented threshold', function (): void {
    reportBy(voters(2), ReportReason::Rented);

    expect(rentedAt())->toBeNull()
        ->and(VoteDecision::query()->count())->toBe(0)
        ->and(ListingVote::query()->count())->toBe(2);
});

it('marks a listing rented once at the threshold, with one decision row of the inputs', function (): void {
    reportBy(voters(3), ReportReason::Rented);

    expect(rentedAt())->not->toBeNull()
        ->and(decisions())->toBe([['listing', '100012', 'rented', 3, '3.00', '3.00', 'marked']]);

    reportBy(voters(1), ReportReason::Rented);

    expect(decisions())->toHaveCount(1);
});

it('sums the weights, so two heavier voters reach the threshold', function (): void {
    reportBy(voters(2, ['is_premium' => true]), ReportReason::Rented);

    expect(rentedAt())->not->toBeNull()
        ->and(decisions())->toBe([['listing', '100012', 'rented', 2, '3.00', '3.00', 'marked']]);
});

it('never lets a single voter mark, at the highest weight and with a threshold he could reach alone', function (): void {
    $heaviest = User::factory()->create(['is_premium' => true, 'has_username' => true, 'has_photo' => true]);
    reportBy([$heaviest], ReportReason::Rented);

    expect(rentedAt())->toBeNull();

    config(['votes.thresholds.rented' => 1.0, 'votes.min_voters' => 1]);
    reportBy([$heaviest], ReportReason::Rented, 100013);

    expect(rentedAt(100013))->toBeNull()
        ->and(VoteDecision::query()->count())->toBe(0);
});

it('needs the configured number of voters besides the threshold', function (): void {
    config(['votes.min_voters' => 3]);
    reportBy(voters(2, ['is_premium' => true]), ReportReason::Rented);

    expect(rentedAt())->toBeNull();

    reportBy(voters(1), ReportReason::Rented);

    expect(decisions())->toBe([['listing', '100012', 'rented', 3, '4.00', '3.00', 'marked']]);
});

it('lowers the sum with a withdrawn vote and removes the mark with an unmarked decision', function (): void {
    [$first, $second, $third] = voters(3);
    reportBy([$first, $second, $third], ReportReason::Rented);

    votes()->withdraw($second, votePointer(), ReportReason::Rented);

    expect(rentedAt())->toBeNull()
        ->and(ListingMark::query()->find(100012))->not->toBeNull()
        ->and(ListingVote::query()->where('user_id', $second->id)->sole()->withdrawn_at)->not->toBeNull()
        ->and(decisions())->toBe([
            ['listing', '100012', 'rented', 3, '3.00', '3.00', 'marked'],
            ['listing', '100012', 'rented', 2, '2.00', '3.00', 'unmarked'],
        ]);

    votes()->withdraw($second, votePointer(), ReportReason::Rented);
    votes()->withdraw($first, votePointer(100099), ReportReason::Rented);

    expect(decisions())->toHaveCount(2);
});

it('counts a vote again when its voter reports after withdrawing it, keeping the first row', function (): void {
    [$first, $second, $third] = voters(3);
    reportBy([$first, $second, $third], ReportReason::Rented);
    votes()->withdraw($third, votePointer(), ReportReason::Rented);
    $row = ListingVote::query()->where('user_id', $third->id)->sole();

    reportBy([$third], ReportReason::Rented);

    $again = ListingVote::query()->where('user_id', $third->id)->sole();
    expect($again->id)->toBe($row->id)
        ->and($again->withdrawn_at)->toBeNull()
        ->and(rentedAt())->not->toBeNull()
        ->and(array_column(decisions(), 6))->toBe(['marked', 'unmarked', 'marked']);
});

it('counts each user once per author key: one user on three listings of the author never marks', function (): void {
    foreach ([100001, 100002, 100003] as $number) {
        ListingRef::factory()->ofAuthor(VOTE_AUTHOR)->create(['listing_number' => $number]);
    }
    $user = User::factory()->create(['is_premium' => true]);

    $outcomes = [...reportBy([$user], ReportReason::Agent, 100001), ...reportBy([$user], ReportReason::Agent, 100002), ...reportBy([$user], ReportReason::Agent, 100003)];

    expect(ListingVote::query()->where('author_key', VOTE_AUTHOR)->count())->toBe(3)
        ->and(realtorMarkedAt())->toBeNull()
        ->and(array_map(fn (ReportOutcome $outcome): bool => $outcome->agentMarked, $outcomes))->toBe([false, false, false]);

    reportBy(voters(1, ['is_premium' => true]), ReportReason::Agent, 100003);

    expect(realtorMarkedAt())->not->toBeNull()
        ->and(AuthorMark::query()->sole()->source)->toBe('votes')
        ->and(decisions())->toBe([['author', VOTE_AUTHOR, 'agent', 2, '3.00', '3.00', 'marked']]);
});

it('stores a vote on an author already marked and marks nothing twice', function (): void {
    ListingRef::factory()->ofAuthor(VOTE_AUTHOR)->create(['listing_number' => 100001]);
    $mark = AuthorMark::factory()->create(['author_key' => VOTE_AUTHOR, 'realtor_marked_at' => now()->subDay()]);

    [$outcome] = reportBy(voters(1), ReportReason::Agent, 100001);

    expect($outcome->agentMarked)->toBeTrue()
        ->and(ListingVote::query()->sole()->author_key)->toBe(VOTE_AUTHOR)
        ->and(realtorMarkedAt()?->toIso8601String())->toBe($mark->realtor_marked_at->toIso8601String())
        ->and(VoteDecision::query()->count())->toBe(0);
});

it('answers agent_marked for an author already marked only while already_marked is on', function (): void {
    ListingRef::factory()->ofAuthor(VOTE_AUTHOR)->create(['listing_number' => 100001]);
    AuthorMark::factory()->create(['author_key' => VOTE_AUTHOR]);
    config(['votes.agent_marked.already_marked' => false]);

    [$outcome] = reportBy(voters(1), ReportReason::Agent, 100001);

    expect($outcome->agentMarked)->toBeFalse();
});

it('accepts agent on a listing without an author, with no author effect', function (): void {
    ListingRef::factory()->create(['listing_number' => 100001, 'author_key' => null, 'author_kind' => null]);

    $outcomes = reportBy(voters(3), ReportReason::Agent, 100001);

    expect(ListingVote::query()->whereNull('author_key')->count())->toBe(3)
        ->and(AuthorMark::query()->count())->toBe(0)
        ->and(VoteDecision::query()->count())->toBe(0)
        ->and(array_map(fn (ReportOutcome $outcome): bool => $outcome->agentMarked, $outcomes))->toBe([false, false, false]);
});

it('stores the author key a vote of another reason finds, without counting it per author', function (): void {
    ListingRef::factory()->ofAuthor(VOTE_AUTHOR)->create(['listing_number' => 100001]);

    reportBy(voters(3), ReportReason::Rented, 100001);

    expect(ListingVote::query()->pluck('author_key')->unique()->all())->toBe([VOTE_AUTHOR])
        ->and(AuthorMark::query()->find(VOTE_AUTHOR))->toBeNull()
        ->and(array_column(decisions(), 0))->toBe(['listing']);
});

it('never marks anything for wrong_data, nor for fraud on a legacy number', function (): void {
    reportBy(voters(3), ReportReason::WrongData);
    reportBy(voters(3), ReportReason::Fraud);

    expect(ListingVote::query()->count())->toBe(6)
        ->and(rentedAt())->toBeNull()
        ->and(VoteDecision::query()->count())->toBe(0);
});

it('sums fraud on a native number per listing: an audit row once, and no mark of the listing', function (): void {
    $native = 10000001;
    [$first] = $early = voters(2);

    reportBy($early, ReportReason::Fraud, $native);

    expect(VoteDecision::query()->count())->toBe(0);

    reportBy(voters(1), ReportReason::Fraud, $native);

    expect(decisions())->toBe([['listing', (string) $native, 'fraud', 3, '3.00', '3.00', 'marked']])
        ->and(rentedAt($native))->toBeNull();

    reportBy(voters(1), ReportReason::Fraud, $native);
    votes()->withdraw($first, votePointer($native), ReportReason::Fraud);

    expect(array_column(decisions(), 6))->toBe(['marked'])
        ->and(ListingVote::query()->whereNotNull('withdrawn_at')->count())->toBe(1);
});

it('removes a native fraud crossing once the sum falls below the threshold', function (): void {
    $native = 10000002;
    [$first] = $voters = voters(3);
    reportBy($voters, ReportReason::Fraud, $native);

    votes()->withdraw($first, votePointer($native), ReportReason::Fraud);

    expect(array_column(decisions(), 6))->toBe(['marked', 'unmarked']);
});

it('reads the fraud threshold for native numbers', function (): void {
    config(['votes.thresholds.fraud' => 5.0]);

    reportBy(voters(4), ReportReason::Fraud, 10000003);

    expect(VoteDecision::query()->count())->toBe(0);
});

it('hides the listing for the voter on rented and fraud, and for nobody else', function (): void {
    [$renter, $fraud, $agent, $wrong] = voters(4);

    $outcomes = [
        ...reportBy([$renter], ReportReason::Rented),
        ...reportBy([$fraud], ReportReason::Fraud),
        ...reportBy([$agent], ReportReason::Agent),
        ...reportBy([$wrong], ReportReason::WrongData),
    ];

    expect(array_map(fn (ReportOutcome $outcome): bool => $outcome->hidden, $outcomes))->toBe([true, true, false, false])
        ->and(HiddenListing::query()->orderBy('user_id')->get()->map(fn (HiddenListing $row): array => [$row->user_id, $row->reason])->all())
        ->toBe([[$renter->id, HiddenReason::ReportRented], [$fraud->id, HiddenReason::ReportFraud]]);
});

it('refuses a detail with any reason but wrong_data, as a programming error, and stores nothing', function (ReportReason $reason): void {
    expect(fn () => votes()->report(User::factory()->create(), votePointer(), $reason, ReportDetail::Price))
        ->toThrow(InvalidArgumentException::class, 'wrong_data');

    expect(ListingVote::query()->count())->toBe(0)
        ->and(HiddenListing::query()->count())->toBe(0);
})->with([ReportReason::Rented, ReportReason::Agent, ReportReason::Fraud]);

it('has both detectors on until they are switched off', function (): void {
    expect(app(VoteDetectors::class)->rentedOn())->toBeTrue()
        ->and(app(VoteDetectors::class)->realtorOn())->toBeTrue();
});

it('writes no rented mark while the rented detector is off, and still the votes and the voter\'s hide', function (): void {
    switchDetector('rented', false);

    $outcomes = reportBy(voters(3), ReportReason::Rented);

    expect(rentedAt())->toBeNull()
        ->and(VoteDecision::query()->count())->toBe(0)
        ->and(ListingVote::query()->count())->toBe(3)
        ->and(HiddenListing::query()->count())->toBe(3)
        ->and(array_map(fn (ReportOutcome $outcome): bool => $outcome->hidden, $outcomes))->toBe([true, true, true]);

    switchDetector('rented', true);

    expect(rentedAt())->toBeNull();

    reportBy(voters(1), ReportReason::Rented);

    expect(rentedAt())->not->toBeNull()
        ->and(decisions())->toBe([['listing', '100012', 'rented', 4, '4.00', '3.00', 'marked']]);
});

it('writes no realtor mark while the realtor detector is off, and answers agent_marked false even for a marked author', function (): void {
    ListingRef::factory()->ofAuthor(VOTE_AUTHOR)->create(['listing_number' => 100001]);
    ListingRef::factory()->ofAuthor('source:marked_channel', 'source')->create(['listing_number' => 100002]);
    AuthorMark::factory()->create(['author_key' => 'source:marked_channel']);
    switchDetector('realtor', false);

    $outcomes = reportBy(voters(3), ReportReason::Agent, 100001);
    [$onMarked] = reportBy(voters(1), ReportReason::Agent, 100002);

    expect(realtorMarkedAt())->toBeNull()
        ->and(VoteDecision::query()->count())->toBe(0)
        ->and(array_map(fn (ReportOutcome $outcome): bool => $outcome->agentMarked, [...$outcomes, $onMarked]))->toBe([false, false, false, false]);
});

it('still removes a mark when a withdrawal falls below the threshold while the detector is off', function (): void {
    [$first] = $voters = voters(3);
    reportBy($voters, ReportReason::Rented);
    switchDetector('rented', false);

    votes()->withdraw($first, votePointer(), ReportReason::Rented);

    expect(rentedAt())->toBeNull()
        ->and(array_column(decisions(), 6))->toBe(['marked', 'unmarked']);
});

it('ignores the existing marks in the overlay while a detector is off, at once and before the realtor keys\' cache', function (): void {
    ListingMark::factory()->create(['listing_number' => 5]);
    AuthorMark::factory()->create(['author_key' => VOTE_AUTHOR]);
    $data = app(EloquentOverlayData::class);

    expect($data->rentedByVotes([5, 6]))->toBe([5])
        ->and($data->realtorAuthorKeys())->toBe([VOTE_AUTHOR])
        ->and(Cache::get(EloquentOverlayData::REALTOR_KEYS))->toBe([VOTE_AUTHOR]);

    switchDetector('rented', false);
    switchDetector('realtor', false);

    expect($data->rentedByVotes([5, 6]))->toBe([])
        ->and($data->realtorAuthorKeys())->toBe([]);

    switchDetector('rented', true);
    switchDetector('realtor', true);

    expect($data->rentedByVotes([5, 6]))->toBe([5])
        ->and($data->realtorAuthorKeys())->toBe([VOTE_AUTHOR]);
});

it('forgets the cached realtor keys when a recount marks or unmarks an author', function (): void {
    ListingRef::factory()->ofAuthor(VOTE_AUTHOR)->create(['listing_number' => 100001]);
    $data = app(EloquentOverlayData::class);
    [$first] = $voters = voters(3);

    expect($data->realtorAuthorKeys())->toBe([]);

    reportBy($voters, ReportReason::Agent, 100001);

    expect($data->realtorAuthorKeys())->toBe([VOTE_AUTHOR]);

    votes()->withdraw($first, votePointer(100001), ReportReason::Agent);

    expect($data->realtorAuthorKeys())->toBe([]);
});

it('switches a detector with who and why: a Pennant value, an audit row and a notice without personal data', function (): void {
    $logged = [];
    Event::listen(MessageLogged::class, function (MessageLogged $message) use (&$logged): void {
        $logged[] = [$message->level, $message->message, $message->context];
    });

    $this->artisan('votes:detector', ['detector' => 'realtor', 'state' => 'off', '--by' => 'ops', '--reason' => 'abuse check'])
        ->expectsOutputToContain('votes.realtor-detector')
        ->assertSuccessful();

    $row = SourceFlagChange::query()->sole();
    expect(Feature::globally()->value(VoteDetectors::REALTOR))->toBeFalse()
        ->and(app(VoteDetectors::class)->realtorOn())->toBeFalse()
        ->and(app(VoteDetectors::class)->rentedOn())->toBeTrue()
        ->and([$row->feature, $row->old_rule, $row->new_rule, $row->actor, $row->reason, $row->environment])
        ->toBe([VoteDetectors::REALTOR, true, false, 'ops', 'abuse check', 'testing'])
        ->and($logged)->toBe([['notice', 'Vote detector switched.', ['feature' => VoteDetectors::REALTOR, 'old' => true, 'new' => false, 'actor' => 'ops', 'reason' => 'abuse check']]]);

    $this->artisan('votes:detector', ['detector' => 'realtor', 'state' => 'on', '--by' => 'ops', '--reason' => 'checked'])->assertSuccessful();

    expect(app(VoteDetectors::class)->realtorOn())->toBeTrue()
        ->and(SourceFlagChange::query()->latest('id')->first()?->old_rule)->toBeFalse();
});

it('refuses a switch it cannot read, and changes nothing', function (array $arguments): void {
    $this->artisan('votes:detector', $arguments)->assertFailed();

    expect(SourceFlagChange::query()->count())->toBe(0)
        ->and(app(VoteDetectors::class)->rentedOn())->toBeTrue();
})->with([
    'an unknown detector' => [['detector' => 'fraud', 'state' => 'off', '--by' => 'ops', '--reason' => 'x']],
    'an unknown state' => [['detector' => 'rented', 'state' => 'maybe', '--by' => 'ops', '--reason' => 'x']],
    'no --by' => [['detector' => 'rented', 'state' => 'off', '--reason' => 'x']],
    'no --reason' => [['detector' => 'rented', 'state' => 'off', '--by' => 'ops']],
    'a --by too long' => [['detector' => 'rented', 'state' => 'off', '--by' => str_repeat('a', 65), '--reason' => 'x']],
]);
