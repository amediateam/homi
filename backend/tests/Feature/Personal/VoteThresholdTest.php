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
use Illuminate\Database\Events\QueryExecuted;
use Illuminate\Log\Events\MessageLogged;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Http;
use Laravel\Pennant\Feature;
use Laravel\Sanctum\Sanctum;

/*
 * WP-44, step 8: the detectors behind the report votes (SEC-REQ-045, task `KV-BE-043`). One tap never relabels a
 * listing or a person for everybody: a mark needs the weighted sum of distinct voters at a threshold (`rented` 4.0 per
 * listing, `agent` 4.5 per author key with one weight per user, `fraud` 3.0 per native listing) and the reason's
 * number of distinct voters (three for `rented` and `agent`, two for native `fraud`; never fewer than two in the code)
 * — DEC-112; it is written once, with a `vote_decisions` row of its inputs, and a recount that falls below removes it
 * with an `unmarked` row. Each detector has a kill switch: off writes no new mark, and the overlay ignores the marks at
 * once. The voters here weigh 1.0 each unless a test gives them a flag (`VOTE_FREE` 1.5, `VOTE_HEAVIEST` 2.0).
 */

const VOTE_AUTHOR = 'phone:0123456789abcdef0123456789abcdef';

/** A free Telegram account: a username and a photo, both free to set — weight 1.50. */
const VOTE_FREE = ['has_username' => true, 'has_photo' => true];

/** Premium, a username and a photo — weight 2.00, the cap. */
const VOTE_HEAVIEST = ['is_premium' => true, 'has_username' => true, 'has_photo' => true];

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

/** @return list<array{string, string, mixed, mixed}> the detectors' audit rows: feature, actor, old and new value */
function detectorAudit(): array
{
    return SourceFlagChange::query()->whereIn('feature', array_values(VoteDetectors::FEATURES))->orderBy('id')->get()
        ->map(fn (SourceFlagChange $row): array => [$row->feature, $row->actor, $row->old_rule, $row->new_rule])
        ->values()->all();
}

/**
 * The log lines written while the callback runs, as level, message and context.
 *
 * @return list<array{string, string, array<string, mixed>}>
 */
function logsOf(Closure $callback): array
{
    $logged = [];
    Event::listen(MessageLogged::class, function (MessageLogged $message) use (&$logged): void {
        $logged[] = [$message->level, $message->message, $message->context];
    });

    $callback();

    return $logged;
}

it('keeps a listing unmarked below the rented threshold', function (): void {
    reportBy(voters(2), ReportReason::Rented);

    expect(rentedAt())->toBeNull()
        ->and(VoteDecision::query()->count())->toBe(0)
        ->and(ListingVote::query()->count())->toBe(2);
});

it('keeps a listing unmarked with three bare accounts, 3.0 below the rented threshold of 4.0', function (): void {
    reportBy(voters(3), ReportReason::Rented);

    expect(rentedAt())->toBeNull()
        ->and(VoteDecision::query()->count())->toBe(0);
});

it('marks a listing rented once at the smallest crossing, four bare accounts, with one decision row of the inputs', function (): void {
    reportBy(voters(4), ReportReason::Rented);

    expect(rentedAt())->not->toBeNull()
        ->and(decisions())->toBe([['listing', '100012', 'rented', 4, '4.00', '4.00', 'marked']]);

    reportBy(voters(1), ReportReason::Rented);

    expect(decisions())->toHaveCount(1);
});

it('sums the weights, but two heaviest voters at the threshold stay below the floor of three voters, and a third one marks', function (): void {
    reportBy(voters(2, VOTE_HEAVIEST), ReportReason::Rented);

    expect(rentedAt())->toBeNull()
        ->and(VoteDecision::query()->count())->toBe(0);

    reportBy(voters(1), ReportReason::Rented);

    expect(rentedAt())->not->toBeNull()
        ->and(decisions())->toBe([['listing', '100012', 'rented', 3, '5.00', '4.00', 'marked']]);
});

it('sums three weighted voters to the rented threshold: 1.5 + 1.5 + 1.0 marks', function (): void {
    reportBy([...voters(2, VOTE_FREE), ...voters(1)], ReportReason::Rented);

    expect(decisions())->toBe([['listing', '100012', 'rented', 3, '4.00', '4.00', 'marked']]);
});

it('never lets a single voter mark, at the highest weight and with a threshold he could reach alone', function (): void {
    $heaviest = User::factory()->create(['is_premium' => true, 'has_username' => true, 'has_photo' => true]);
    reportBy([$heaviest], ReportReason::Rented);

    expect(rentedAt())->toBeNull();

    config(['votes.thresholds.rented' => 1.0, 'votes.min_voters.rented' => 1]);
    reportBy([$heaviest], ReportReason::Rented, 100013);

    expect(rentedAt(100013))->toBeNull()
        ->and(VoteDecision::query()->count())->toBe(0);
});

it('needs the configured number of voters besides the threshold', function (): void {
    config(['votes.min_voters.rented' => 4]);
    reportBy(voters(3, VOTE_HEAVIEST), ReportReason::Rented);

    expect(rentedAt())->toBeNull();

    reportBy(voters(1), ReportReason::Rented);

    expect(decisions())->toBe([['listing', '100012', 'rented', 4, '7.00', '4.00', 'marked']]);
});

it('reads a min_voters below two, or one it cannot read, as two for every reason', function (ReportReason $reason, int $number, mixed $configured): void {
    ListingRef::factory()->ofAuthor(VOTE_AUTHOR)->create(['listing_number' => $number]);
    config(["votes.thresholds.{$reason->value}" => 1.0, "votes.min_voters.{$reason->value}" => $configured]);

    reportBy(voters(1, VOTE_HEAVIEST), $reason, $number);

    expect(VoteDecision::query()->count())->toBe(0);

    reportBy(voters(1), $reason, $number);

    expect(array_column(decisions(), 3))->toBe([2]);
})->with([
    'rented' => [ReportReason::Rented, 100012],
    'agent' => [ReportReason::Agent, 100012],
    'native fraud' => [ReportReason::Fraud, 10000001],
])->with([
    'one' => 1,
    'zero' => 0,
    'not a number' => 'many',
    'missing' => null,
]);

it('keeps the agent floor of three: two heaviest voters on an author with a threshold they reach mark nothing', function (): void {
    ListingRef::factory()->ofAuthor(VOTE_AUTHOR)->create(['listing_number' => 100001]);
    config(['votes.thresholds.agent' => 3.0]);

    $outcomes = reportBy(voters(2, VOTE_HEAVIEST), ReportReason::Agent, 100001);

    expect(realtorMarkedAt())->toBeNull()
        ->and(array_map(fn (ReportOutcome $outcome): bool => $outcome->agentMarked, $outcomes))->toBe([false, false]);

    reportBy(voters(1), ReportReason::Agent, 100001);

    expect(decisions())->toBe([['author', VOTE_AUTHOR, 'agent', 3, '5.00', '3.00', 'marked']]);
});

it('keeps an author unmarked with three accounts with a username, 3.75 below the agent threshold of 4.5', function (): void {
    ListingRef::factory()->ofAuthor(VOTE_AUTHOR)->create(['listing_number' => 100001]);

    $outcomes = reportBy(voters(3, ['has_username' => true]), ReportReason::Agent, 100001);

    expect(realtorMarkedAt())->toBeNull()
        ->and(VoteDecision::query()->count())->toBe(0)
        ->and(array_map(fn (ReportOutcome $outcome): bool => $outcome->agentMarked, $outcomes))->toBe([false, false, false]);
});

it('marks an author once at the smallest crossing, three free accounts of 1.5, and answers agent_marked below, at and after it', function (): void {
    ListingRef::factory()->ofAuthor(VOTE_AUTHOR)->create(['listing_number' => 100001]);

    $outcomes = [...reportBy(voters(3, VOTE_FREE), ReportReason::Agent, 100001), ...reportBy(voters(1), ReportReason::Agent, 100001)];

    expect(realtorMarkedAt())->not->toBeNull()
        ->and(decisions())->toBe([['author', VOTE_AUTHOR, 'agent', 3, '4.50', '4.50', 'marked']])
        ->and(array_map(fn (ReportOutcome $outcome): bool => $outcome->agentMarked, $outcomes))->toBe([false, false, true, true]);
});

it('keeps the floor of three on a native rented or agent crossing, which still marks like any listing until WP-84', function (ReportReason $reason): void {
    $native = 10000005;
    ListingRef::factory()->ofAuthor(VOTE_AUTHOR)->create(['listing_number' => $native]);
    config(["votes.thresholds.{$reason->value}" => 4.0]);

    reportBy(voters(2, VOTE_HEAVIEST), $reason, $native);

    expect(VoteDecision::query()->count())->toBe(0);

    reportBy(voters(1), $reason, $native);

    expect(array_map(fn (array $row): array => [$row[0], $row[3], $row[6]], decisions()))->toBe([[$reason === ReportReason::Rented ? 'listing' : 'author', 3, 'marked']])
        ->and($reason === ReportReason::Rented ? rentedAt($native) : realtorMarkedAt())->not->toBeNull();
})->with([ReportReason::Rented, ReportReason::Agent]);

it('lowers the sum with a withdrawn vote and removes the mark with an unmarked decision', function (): void {
    [$first, $second] = $voters = voters(4);
    reportBy($voters, ReportReason::Rented);

    votes()->withdraw($second, votePointer(), ReportReason::Rented);

    expect(rentedAt())->toBeNull()
        ->and(ListingMark::query()->find(100012))->not->toBeNull()
        ->and(ListingVote::query()->where('user_id', $second->id)->sole()->withdrawn_at)->not->toBeNull()
        ->and(decisions())->toBe([
            ['listing', '100012', 'rented', 4, '4.00', '4.00', 'marked'],
            ['listing', '100012', 'rented', 3, '3.00', '4.00', 'unmarked'],
        ]);

    votes()->withdraw($second, votePointer(), ReportReason::Rented);
    votes()->withdraw($first, votePointer(100099), ReportReason::Rented);

    expect(decisions())->toHaveCount(2);
});

it('withdraws the voter\'s votes under every number given, recounting their author once', function (): void {
    ListingRef::factory()->ofAuthor(VOTE_AUTHOR)->create(['listing_number' => 100001]);
    ListingRef::factory()->ofAuthor(VOTE_AUTHOR)->create(['listing_number' => 100002]);
    [$first, $second, $both] = voters(3, VOTE_FREE);
    reportBy([$first, $second, $both], ReportReason::Agent, 100001);
    reportBy([$both], ReportReason::Agent, 100002);

    expect(realtorMarkedAt())->not->toBeNull();

    votes()->withdraw($both, votePointer(100002), ReportReason::Agent, [100001, 100002]);

    expect(ListingVote::query()->where('user_id', $both->id)->whereNull('withdrawn_at')->count())->toBe(0)
        ->and(ListingVote::query()->whereNull('withdrawn_at')->count())->toBe(2)
        ->and(realtorMarkedAt())->toBeNull()
        ->and(decisions())->toBe([
            ['author', VOTE_AUTHOR, 'agent', 3, '4.50', '4.50', 'marked'],
            ['author', VOTE_AUTHOR, 'agent', 2, '3.00', '4.50', 'unmarked'],
        ]);
});

it('counts a vote again when its voter reports after withdrawing it, keeping the first row', function (): void {
    $voters = voters(4);
    $last = $voters[3];
    reportBy($voters, ReportReason::Rented);
    votes()->withdraw($last, votePointer(), ReportReason::Rented);
    $row = ListingVote::query()->where('user_id', $last->id)->sole();

    reportBy([$last], ReportReason::Rented);

    $again = ListingVote::query()->where('user_id', $last->id)->sole();
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

    reportBy(voters(2, ['is_premium' => true]), ReportReason::Agent, 100003);

    expect(realtorMarkedAt())->not->toBeNull()
        ->and(AuthorMark::query()->sole()->source)->toBe('votes')
        ->and(decisions())->toBe([['author', VOTE_AUTHOR, 'agent', 3, '4.50', '4.50', 'marked']]);
});

it('files the author of an agent vote cast before the author was filed when its voter repeats it, so it counts', function (): void {
    ListingRef::factory()->create(['listing_number' => 100012, 'author_key' => null, 'author_kind' => null]);
    [$early] = voters(1, VOTE_FREE);
    reportBy([$early], ReportReason::Agent);

    expect(ListingVote::query()->sole()->author_key)->toBeNull();

    ListingRef::query()->whereKey(100012)->update(['author_key' => VOTE_AUTHOR, 'author_kind' => 'phone']);
    $outcomes = reportBy(voters(2, VOTE_FREE), ReportReason::Agent);

    expect(realtorMarkedAt())->toBeNull();

    $outcomes = [...$outcomes, ...reportBy([$early], ReportReason::Agent)];

    expect(ListingVote::query()->where('user_id', $early->id)->sole()->author_key)->toBe(VOTE_AUTHOR)
        ->and(realtorMarkedAt())->not->toBeNull()
        ->and(decisions())->toBe([['author', VOTE_AUTHOR, 'agent', 3, '4.50', '4.50', 'marked']])
        ->and(array_map(fn (ReportOutcome $outcome): bool => $outcome->agentMarked, $outcomes))->toBe([false, false, true]);
});

it('never overwrites the author key a vote stored when its voter repeats it', function (): void {
    ListingRef::factory()->ofAuthor(VOTE_AUTHOR)->create(['listing_number' => 100012]);
    [$voter] = voters(1);
    reportBy([$voter], ReportReason::Agent);

    ListingRef::query()->whereKey(100012)->update(['author_key' => 'source:other_channel', 'author_kind' => 'source']);
    reportBy([$voter], ReportReason::Agent);

    expect(ListingVote::query()->sole()->author_key)->toBe(VOTE_AUTHOR);
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

it('answers agent_marked for an author already marked only while already_marked is on, read as the config gives it', function (mixed $alreadyMarked, bool $expected): void {
    ListingRef::factory()->ofAuthor(VOTE_AUTHOR)->create(['listing_number' => 100001]);
    AuthorMark::factory()->create(['author_key' => VOTE_AUTHOR]);
    config(['votes.agent_marked.already_marked' => $alreadyMarked]);

    [$outcome] = reportBy(voters(1), ReportReason::Agent, 100001);

    expect($outcome->agentMarked)->toBe($expected);
})->with([
    'false' => [false, false],
    'a zero' => [0, false],
    'the string "false"' => ['false', false],
    'true' => [true, true],
    'a one' => [1, true],
    'unreadable, the default' => ['maybe', true],
]);

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

    reportBy(voters(4), ReportReason::Rented, 100001);

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

it('marks a native fraud crossing with two voters, its floor of two', function (): void {
    reportBy(voters(2, VOTE_FREE), ReportReason::Fraud, 10000004);

    expect(decisions())->toBe([['listing', '10000004', 'fraud', 2, '3.00', '3.00', 'marked']]);
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

it('has both detectors on until they are switched off, also after a purge and beside another feature\'s audit rows', function (): void {
    SourceFlagChange::factory()->create(['feature' => 'source.listings.card', 'old_rule' => null, 'new_rule' => false]);

    expect(app(VoteDetectors::class)->rentedOn())->toBeTrue()
        ->and(app(VoteDetectors::class)->realtorOn())->toBeTrue()
        ->and(Feature::globally()->value(VoteDetectors::RENTED))->toBeTrue();

    $this->artisan('pennant:purge')->assertSuccessful();
    Feature::flushCache();

    expect(Feature::globally()->value(VoteDetectors::RENTED))->toBeTrue()
        ->and(Feature::globally()->value(VoteDetectors::REALTOR))->toBeTrue()
        ->and(array_column(detectorAudit(), 3))->toBe([null, null]);
});

it('keeps a switched-off detector off through a purge of every feature, audited once per detector, the marks still ignored', function (string $command): void {
    ListingMark::factory()->create(['listing_number' => 100012]);
    AuthorMark::factory()->create(['author_key' => VOTE_AUTHOR]);
    switchDetector('rented', false);
    switchDetector('realtor', false);
    $overlay = app(EloquentOverlayData::class);

    $this->artisan($command)->assertSuccessful();
    Feature::flushCache();

    expect(Feature::globally()->value(VoteDetectors::RENTED))->toBeFalse()
        ->and(Feature::globally()->value(VoteDetectors::REALTOR))->toBeFalse()
        ->and(app(VoteDetectors::class)->rentedOn())->toBeFalse()
        ->and(app(VoteDetectors::class)->realtorOn())->toBeFalse()
        ->and($overlay->rentedByVotes([100012]))->toBe([])
        ->and($overlay->realtorAuthorKeys())->toBe([])
        ->and(detectorAudit())->toBe([
            [VoteDetectors::RENTED, 'test', true, false],
            [VoteDetectors::REALTOR, 'test', true, false],
            [VoteDetectors::RENTED, SourceFlagChange::UNKNOWN_ACTOR, null, null],
            [VoteDetectors::REALTOR, SourceFlagChange::UNKNOWN_ACTOR, null, null],
        ])
        ->and(DB::table('source_flag_changes')->whereIn('feature', array_values(VoteDetectors::FEATURES))->whereNull('new_rule')->count())->toBe(2);

    reportBy(voters(4), ReportReason::Rented, 100013);

    expect(rentedAt(100013))->toBeNull();
})->with(['pennant:purge', 'pennant:clear']);

it('keeps a switched-off detector off through a purge or a forget of that feature alone', function (Closure $remove): void {
    switchDetector('realtor', false);

    $remove();
    Feature::flushCache();

    expect(app(VoteDetectors::class)->realtorOn())->toBeFalse()
        ->and(app(VoteDetectors::class)->rentedOn())->toBeTrue()
        ->and(detectorAudit())->toBe([
            [VoteDetectors::REALTOR, 'test', true, false],
            [VoteDetectors::REALTOR, SourceFlagChange::UNKNOWN_ACTOR, null, null],
        ]);
})->with([
    'pennant:purge of the feature' => [fn () => test()->artisan('pennant:purge', ['features' => [VoteDetectors::REALTOR]])->assertSuccessful()],
    'Feature::purge of the feature' => [fn () => Feature::purge(VoteDetectors::REALTOR)],
    'a forget of the global value' => [fn () => Feature::globally()->forget(VoteDetectors::REALTOR)],
]);

it('audits a direct Pennant change of a detector as unknown, with a warning that names the feature only', function (): void {
    $logged = logsOf(function (): void {
        Feature::globally()->deactivate(VoteDetectors::REALTOR);
        Feature::globally()->activate(VoteDetectors::RENTED, true);
        Feature::activateForEveryone(VoteDetectors::RENTED, false);
    });

    expect(detectorAudit())->toBe([
        [VoteDetectors::REALTOR, SourceFlagChange::UNKNOWN_ACTOR, null, false],
        [VoteDetectors::RENTED, SourceFlagChange::UNKNOWN_ACTOR, null, true],
        [VoteDetectors::RENTED, SourceFlagChange::UNKNOWN_ACTOR, null, false],
    ])
        ->and($logged)->toBe([
            ['warning', 'Vote detector changed outside votes:detector.', ['feature' => VoteDetectors::REALTOR]],
            ['warning', 'Vote detector changed outside votes:detector.', ['feature' => VoteDetectors::RENTED]],
            ['warning', 'Vote detector changed outside votes:detector.', ['feature' => VoteDetectors::RENTED]],
        ]);

    $this->artisan('pennant:purge')->assertSuccessful();
    Feature::flushCache();

    expect(app(VoteDetectors::class)->realtorOn())->toBeFalse()
        ->and(app(VoteDetectors::class)->rentedOn())->toBeFalse();
});

it('reads the audit for a detector\'s default once, on the first feed request while no value is stored, and never again', function (): void {
    Sanctum::actingAs(User::factory()->create(), ['app:read', 'app:write']);
    $statements = new ArrayObject;
    DB::listen(function (QueryExecuted $query) use ($statements): void {
        $statements[] = $query->sql;
    });
    $auditReads = fn (): int => count(array_filter($statements->getArrayCopy(), fn (string $sql): bool => str_contains($sql, 'source_flag_changes')));

    $this->getJson('/api/v1/listings?city=tashkent&deal=rent_long')->assertOk();

    expect($auditReads())->toBe(2);

    Feature::flushCache();
    $this->getJson('/api/v1/listings?city=tashkent&deal=rent_long')->assertOk();

    expect($auditReads())->toBe(2)
        ->and(DB::table('features')->whereIn('name', array_values(VoteDetectors::FEATURES))->count())->toBe(2);
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
        ->and(decisions())->toBe([['listing', '100012', 'rented', 4, '4.00', '4.00', 'marked']]);
});

it('writes no realtor mark while the realtor detector is off, and answers agent_marked false even for a marked author', function (): void {
    ListingRef::factory()->ofAuthor(VOTE_AUTHOR)->create(['listing_number' => 100001]);
    ListingRef::factory()->ofAuthor('source:marked_channel', 'source')->create(['listing_number' => 100002]);
    AuthorMark::factory()->create(['author_key' => 'source:marked_channel']);
    switchDetector('realtor', false);

    $outcomes = reportBy(voters(3, VOTE_FREE), ReportReason::Agent, 100001);
    [$onMarked] = reportBy(voters(1), ReportReason::Agent, 100002);

    expect(realtorMarkedAt())->toBeNull()
        ->and(VoteDecision::query()->count())->toBe(0)
        ->and(array_map(fn (ReportOutcome $outcome): bool => $outcome->agentMarked, [...$outcomes, $onMarked]))->toBe([false, false, false, false]);
});

it('still removes a mark when a withdrawal falls below the threshold while the detector is off', function (): void {
    [$first] = $voters = voters(4);
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
    [$first] = $voters = voters(3, VOTE_FREE);

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
