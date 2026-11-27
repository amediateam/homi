<?php

use App\Enums\Personal\HiddenReason;
use App\Enums\Personal\ReportDetail;
use App\Enums\Personal\ReportReason;
use App\Models\AuthorMark;
use App\Models\HiddenListing;
use App\Models\ListingMark;
use App\Models\ListingRef;
use App\Models\ListingVote;
use App\Models\User;
use App\Models\VoteDecision;
use App\Services\Listings\AuthorKey;
use Illuminate\Log\Events\MessageLogged;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Sleep;
use Laravel\Pennant\Feature;
use Laravel\Sanctum\Sanctum;
use Tests\Support\LegacyFixtures;
use Tests\Support\LegacyListingsHttp;

/*
 * WP-44, step 8: reports in HOMI's table (task `KV-BE-043`, BR-API-101 … BR-API-106; the shapes of WP-13). Every reason
 * answers JSON `{hidden, agent_marked}` (fix of LB-API-015); `rented` and `fraud` hide the listing for the reporter at
 * once, and `rented` for everybody only at the threshold of weighted distinct voters (`VoteThresholdTest`). A repeat is
 * counted once (fix of LB-API-043); a `wrong_data` detail is stored for review. `DELETE …/reports` withdraws the
 * caller's «Уже сдано» and its hidden row only (DEC-68). The stub driver files no author, so the author cases file one
 * in `listing_refs` or read the legacy fixtures.
 */

const REPORT_AUTHOR = 'source:reported_channel';

/** A free Telegram account: a username and a photo — weight 1.50, so three of them reach the agent threshold of 4.5. */
const REPORT_FREE = ['has_username' => true, 'has_photo' => true];

beforeEach(function (): void {
    Http::preventStrayRequests();
    Sleep::fake();
    config(['legacy.media.public_url' => LegacyFixtures::MEDIA, 'legacy.rate.per_second' => 1000, 'contacts.author_key_secret' => 'reports-test-secret-of-32-bytes-or-more']);
    $this->user = User::factory()->create();
    Sanctum::actingAs($this->user, ['app:read', 'app:write']);
});

/** @param  array<string, bool>  $attributes  the profile flags of a new reporter */
function actAsReporter(?User $user = null, array $attributes = []): User
{
    app('auth')->forgetGuards();
    $user ??= User::factory()->create($attributes);
    Sanctum::actingAs($user, ['app:read', 'app:write']);

    return $user;
}

/** @return list<int> the numbers of the caller's first feed page on the stub */
function reportFeed(): array
{
    return array_column(test()->getJson('/api/v1/listings?city=tashkent&deal=rent_long')->assertOk()->json('data'), 'number');
}

it('answers every reason with hidden and agent_marked from HOMI\'s table, and hides for the reporter on rented and fraud', function (string $reason, bool $hidden, ?HiddenReason $row): void {
    $this->postJson('/api/v1/listings/100012/reports', ['reason' => $reason])->assertOk()
        ->assertExactJson(['success' => true, 'data' => ['hidden' => $hidden, 'agent_marked' => false], 'meta' => ['source' => 'native']]);

    $vote = ListingVote::query()->sole();
    expect([$vote->user_id, $vote->listing_number, $vote->reason->value, $vote->detail, $vote->weight, $vote->withdrawn_at])
        ->toBe([$this->user->id, 100012, $reason, null, '1.00', null])
        ->and(HiddenListing::query()->get()->map(fn (HiddenListing $hide): array => [$hide->user_id, $hide->listing_number, $hide->reason])->all())
        ->toBe($row === null ? [] : [[$this->user->id, 100012, $row]]);
})->with([
    ['rented', true, HiddenReason::ReportRented],
    ['agent', false, null],
    ['wrong_data', false, null],
    ['fraud', true, HiddenReason::ReportFraud],
]);

it('counts the same reason once with the same answer, and two reasons as two rows', function (): void {
    $first = $this->postJson('/api/v1/listings/100012/reports', ['reason' => 'rented'])->assertOk()->json();
    $second = $this->postJson('/api/v1/listings/100012/reports', ['reason' => 'rented'])->assertOk()->json();
    $this->postJson('/api/v1/listings/100012/reports', ['reason' => 'fraud'])->assertOk();

    expect($second)->toBe($first)
        ->and(ListingVote::query()->orderBy('id')->pluck('reason')->map(fn (ReportReason $reason): string => $reason->value)->all())->toBe(['rented', 'fraud'])
        ->and(HiddenListing::query()->sole()->reason)->toBe(HiddenReason::ReportRented);
});

it('stores the code of a wrong_data detail, or null without one, and never hides', function (?string $detail): void {
    $body = $detail === null ? ['reason' => 'wrong_data'] : ['reason' => 'wrong_data', 'detail' => $detail];

    $this->postJson('/api/v1/listings/100012/reports', $body)->assertOk()->assertJsonPath('data.hidden', false)->assertJsonPath('data.agent_marked', false);

    expect(ListingVote::query()->sole()->detail)->toBe($detail === null ? null : ReportDetail::from($detail))
        ->and(HiddenListing::query()->count())->toBe(0);
})->with(['price', 'rooms', 'place', 'photos', 'other', null]);

it('keeps the first wrong_data row and its detail when the reporter sends another detail', function (): void {
    $this->postJson('/api/v1/listings/100012/reports', ['reason' => 'wrong_data', 'detail' => 'price'])->assertOk();
    $this->postJson('/api/v1/listings/100012/reports', ['reason' => 'wrong_data', 'detail' => 'photos'])->assertOk()->assertJsonPath('data.hidden', false);

    expect(ListingVote::query()->sole()->detail)->toBe(ReportDetail::Price);
});

it('refuses a detail with another reason with 422 and stores nothing', function (string $reason): void {
    $this->postJson('/api/v1/listings/100012/reports', ['reason' => $reason, 'detail' => 'price'])->assertUnprocessable()->assertJsonValidationErrors('detail');

    expect(ListingVote::query()->count())->toBe(0)
        ->and(HiddenListing::query()->count())->toBe(0);
})->with(['fraud', 'rented', 'agent']);

it('answers agent_marked false below the threshold, true for the vote that crosses it and after it, false for every other reason', function (): void {
    ListingRef::factory()->ofAuthor(REPORT_AUTHOR, 'source')->create(['listing_number' => 100001]);
    ListingRef::factory()->ofAuthor(REPORT_AUTHOR, 'source')->create(['listing_number' => 100002]);
    $answers = [];

    foreach ([100001, 100002, 100001, 100002] as $number) {
        actAsReporter(attributes: REPORT_FREE);
        $answers[] = $this->postJson("/api/v1/listings/{$number}/reports", ['reason' => 'agent'])->assertOk()->json('data.agent_marked');
    }

    actAsReporter();
    foreach (['rented', 'wrong_data', 'fraud'] as $reason) {
        $answers[] = $this->postJson('/api/v1/listings/100001/reports', ['reason' => $reason])->assertOk()->json('data.agent_marked');
    }

    expect($answers)->toBe([false, false, true, true, false, false, false])
        ->and(AuthorMark::query()->sole()->author_key)->toBe(REPORT_AUTHOR)
        ->and(AuthorMark::query()->sole()->realtor_marked_at)->not->toBeNull();
});

it('answers agent_marked true for a vote on an author already marked, and stores the vote', function (): void {
    ListingRef::factory()->ofAuthor(REPORT_AUTHOR, 'source')->create(['listing_number' => 100001]);
    AuthorMark::factory()->create(['author_key' => REPORT_AUTHOR]);

    $this->postJson('/api/v1/listings/100001/reports', ['reason' => 'agent'])->assertOk()->assertJsonPath('data.agent_marked', true)->assertJsonPath('data.hidden', false);

    expect(ListingVote::query()->sole()->author_key)->toBe(REPORT_AUTHOR);
});

it('accepts agent on a listing whose card has no author on the stub, with no author effect', function (): void {
    $this->postJson('/api/v1/listings/100012/reports', ['reason' => 'agent'])->assertOk()->assertJsonPath('data.agent_marked', false);

    expect(ListingVote::query()->sole()->author_key)->toBeNull()
        ->and(AuthorMark::query()->count())->toBe(0);
});

it('files the author of an agent vote from the card on the legacy driver, and back-fills the channel and post', function (): void {
    LegacyListingsHttp::fake();
    Feature::globally()->activate('source.listings.card', ['everyone' => 'legacy']);

    $this->postJson('/api/v1/listings/100001/reports', ['reason' => 'agent'])->assertOk()->assertJsonPath('meta.source', 'native');
    $this->postJson('/api/v1/listings/100001/reports', ['reason' => 'rented'])->assertOk()->assertJsonPath('data.hidden', true);

    $key = AuthorKey::fromCard(['phone' => '+998001234567'])?->key;
    expect($key)->not->toBeNull()
        ->and(ListingVote::query()->orderBy('id')->get()->map(fn (ListingVote $vote): array => [$vote->listing_number, $vote->author_key, $vote->source_channel, $vote->source_post_id])->all())
        ->toBe([[100001, $key, 'stub_channel_a', 4001], [100001, $key, 'stub_channel_a', 4001]])
        ->and([HiddenListing::query()->sole()->source_channel, HiddenListing::query()->sole()->source_post_id])->toBe(['stub_channel_a', 4001]);
});

it('checks the listing of a report: 404 unknown, 503 while the source is down unless HOMI knows it', function (): void {
    $this->postJson('/api/v1/listings/999404/reports', ['reason' => 'rented'])->assertNotFound()->assertJsonPath('code', 'not_found');
    $this->postJson('/api/v1/listings/0/reports', ['reason' => 'rented'])->assertNotFound()->assertJsonPath('code', 'not_found');
    $this->postJson('/api/v1/listings/999503/reports', ['reason' => 'rented'])->assertStatus(503)->assertJsonPath('code', 'source_unavailable');

    expect(ListingVote::query()->count())->toBe(0);

    ListingRef::factory()->create(['listing_number' => 999503]);
    $this->postJson('/api/v1/listings/999503/reports', ['reason' => 'rented'])->assertOk();

    expect(ListingVote::query()->sole()->listing_number)->toBe(999503);
});

it('reports the survivor of a merged number, and withdraws it through the alias', function (): void {
    ListingRef::factory()->create(['listing_number' => 100001]);
    ListingRef::factory()->create(['listing_number' => 100016, 'merged_into' => 100001]);

    $this->postJson('/api/v1/listings/100016/reports', ['reason' => 'rented'])->assertOk();

    expect(ListingVote::query()->sole()->listing_number)->toBe(100001)
        ->and(HiddenListing::query()->sole()->listing_number)->toBe(100001);

    $this->deleteJson('/api/v1/listings/100016/reports')->assertNoContent();

    expect(ListingVote::query()->sole()->withdrawn_at)->not->toBeNull()
        ->and(HiddenListing::query()->count())->toBe(0);
});

it('shows the listing again when «Уже сдано» is withdrawn through an alias that no card read has filed', function (): void {
    LegacyListingsHttp::fake();
    Feature::globally()->activate('source.listings.card', ['everyone' => 'legacy']);

    $this->postJson('/api/v1/listings/100016/reports', ['reason' => 'rented'])->assertOk()->assertJsonPath('data.hidden', true);

    expect(ListingVote::query()->sole()->listing_number)->toBe(100001)
        ->and(HiddenListing::query()->sole()->listing_number)->toBe(100001)
        ->and(ListingRef::query()->find(100016))->toBeNull();

    $this->deleteJson('/api/v1/listings/100016/reports')->assertNoContent();

    expect(ListingVote::query()->sole()->withdrawn_at)->not->toBeNull()
        ->and(HiddenListing::query()->count())->toBe(0);
});

it('withdraws a rented report stored before the listing was merged, and recounts that listing\'s mark', function (): void {
    ListingRef::factory()->create(['listing_number' => 100012]);
    ListingRef::factory()->create(['listing_number' => 100013]);
    $this->postJson('/api/v1/listings/100012/reports', ['reason' => 'rented'])->assertOk();

    foreach (range(1, 3) as $vote) {
        actAsReporter();
        $this->postJson('/api/v1/listings/100012/reports', ['reason' => 'rented'])->assertOk();
    }

    expect(ListingMark::query()->find(100012)?->rented_at)->not->toBeNull();

    ListingRef::query()->whereKey(100012)->update(['merged_into' => 100013]);
    actAsReporter($this->user);
    $this->deleteJson('/api/v1/listings/100012/reports')->assertNoContent();

    $vote = ListingVote::query()->where('user_id', $this->user->id)->sole();
    expect([$vote->listing_number, $vote->withdrawn_at !== null])->toBe([100012, true])
        ->and(HiddenListing::query()->where('user_id', $this->user->id)->count())->toBe(0)
        ->and(ListingMark::query()->find(100012)?->rented_at)->toBeNull()
        ->and(VoteDecision::query()->orderBy('id')->get()->map(fn (VoteDecision $row): array => [$row->subject, $row->voters, $row->weight_sum, $row->outcome])->all())
        ->toBe([['100012', 4, '4.00', 'marked'], ['100012', 3, '3.00', 'unmarked']]);
});

it('hides a rented listing from the reporter\'s feed at once, and from everybody\'s only at the threshold', function (): void {
    $listing = reportFeed()[0];
    $this->postJson("/api/v1/listings/{$listing}/reports", ['reason' => 'rented'])->assertOk();

    expect(reportFeed())->not->toContain($listing);

    $bystander = actAsReporter();
    expect(reportFeed())->toContain($listing);

    foreach (range(1, 2) as $vote) {
        actAsReporter();
        $this->postJson("/api/v1/listings/{$listing}/reports", ['reason' => 'rented'])->assertOk();
    }

    actAsReporter($bystander);
    expect(ListingMark::query()->sole()->rented_at)->toBeNull()
        ->and(reportFeed())->toContain($listing);

    actAsReporter();
    $this->postJson("/api/v1/listings/{$listing}/reports", ['reason' => 'rented'])->assertOk();

    actAsReporter($bystander);
    expect(ListingMark::query()->sole()->rented_at)->not->toBeNull()
        ->and(reportFeed())->not->toContain($listing);
});

it('withdraws the caller\'s rented report: the vote withdrawn, the report\'s hidden row gone, the listing back in the feed', function (): void {
    $listing = reportFeed()[0];
    $this->postJson("/api/v1/listings/{$listing}/reports", ['reason' => 'rented'])->assertOk();

    expect(reportFeed())->not->toContain($listing);

    $this->deleteJson("/api/v1/listings/{$listing}/reports")->assertNoContent();

    expect(ListingVote::query()->sole()->withdrawn_at)->not->toBeNull()
        ->and(HiddenListing::query()->count())->toBe(0)
        ->and(reportFeed())->toContain($listing);
});

it('answers 204 to a repeated withdrawal and to one without a report, changing nothing', function (): void {
    $this->postJson('/api/v1/listings/100012/reports', ['reason' => 'rented'])->assertOk();
    $this->deleteJson('/api/v1/listings/100012/reports')->assertNoContent();
    $withdrawnAt = ListingVote::query()->sole()->withdrawn_at?->toIso8601String();
    $this->travel(5)->minutes();

    $this->deleteJson('/api/v1/listings/100012/reports')->assertNoContent()->assertContent('');
    $this->deleteJson('/api/v1/listings/100013/reports')->assertNoContent();

    expect(ListingVote::query()->sole()->withdrawn_at?->toIso8601String())->toBe($withdrawnAt);
});

it('withdraws only rented: the caller\'s agent and fraud votes, their hidden row and a manual hide stay', function (): void {
    HiddenListing::factory()->for($this->user)->create(['listing_number' => 100013, 'reason' => HiddenReason::Manual]);
    $this->postJson('/api/v1/listings/100013/reports', ['reason' => 'rented'])->assertOk();
    $this->postJson('/api/v1/listings/100012/reports', ['reason' => 'fraud'])->assertOk();
    $this->postJson('/api/v1/listings/100012/reports', ['reason' => 'agent'])->assertOk();
    $this->postJson('/api/v1/listings/100012/reports', ['reason' => 'rented'])->assertOk();

    $this->deleteJson('/api/v1/listings/100012/reports')->assertNoContent();
    $this->deleteJson('/api/v1/listings/100013/reports')->assertNoContent();

    expect(ListingVote::query()->orderBy('id')->get()->map(fn (ListingVote $vote): array => [$vote->listing_number, $vote->reason->value, $vote->withdrawn_at !== null])->all())
        ->toBe([[100013, 'rented', true], [100012, 'fraud', false], [100012, 'agent', false], [100012, 'rented', true]])
        ->and(HiddenListing::query()->orderBy('listing_number')->get()->map(fn (HiddenListing $hide): array => [$hide->listing_number, $hide->reason])->all())
        ->toBe([[100012, HiddenReason::ReportFraud], [100013, HiddenReason::Manual]]);
});

it('hides the listing again and counts the vote again when «Уже сдано» is sent after its withdrawal', function (): void {
    $this->postJson('/api/v1/listings/100012/reports', ['reason' => 'rented'])->assertOk();
    $this->deleteJson('/api/v1/listings/100012/reports')->assertNoContent();

    $this->postJson('/api/v1/listings/100012/reports', ['reason' => 'rented'])->assertOk()->assertJsonPath('data.hidden', true);

    expect(ListingVote::query()->sole()->withdrawn_at)->toBeNull()
        ->and(HiddenListing::query()->sole()->reason)->toBe(HiddenReason::ReportRented);
});

it('withdraws a report only from a listing that exists', function (string $number, int $status, string $code): void {
    $this->deleteJson("/api/v1/listings/{$number}/reports")->assertStatus($status)->assertJsonPath('code', $code);
})->with([
    'unknown listing' => ['999404', 404, 'not_found'],
    'number 0' => ['0', 404, 'not_found'],
    'unavailable source' => ['999503', 503, 'source_unavailable'],
]);

it('answers the 31st report of a day with 429, counted per user', function (): void {
    $this->freezeTime();

    foreach (range(1, 30) as $report) {
        $this->postJson('/api/v1/listings/100012/reports', ['reason' => 'wrong_data'])->assertOk();
    }

    $this->postJson('/api/v1/listings/100012/reports', ['reason' => 'wrong_data'])->assertTooManyRequests()->assertJsonPath('code', 'rate_limited');

    actAsReporter();
    $this->postJson('/api/v1/listings/100012/reports', ['reason' => 'wrong_data'])->assertOk();

    expect(ListingVote::query()->count())->toBe(2);
});

it('logs no author key and no detail while agent votes cross the threshold and are withdrawn', function (): void {
    LegacyListingsHttp::fake();
    Feature::globally()->activate('source.listings.card', ['everyone' => 'legacy']);
    $logged = [];
    Event::listen(MessageLogged::class, function (MessageLogged $message) use (&$logged): void {
        $logged[] = $message->message.' '.json_encode($message->context);
    });
    $voters = [];

    foreach (range(1, 3) as $vote) {
        $voters[] = actAsReporter(attributes: REPORT_FREE);
        $this->postJson('/api/v1/listings/100001/reports', ['reason' => 'agent'])->assertOk();
        $this->postJson('/api/v1/listings/100001/reports', ['reason' => 'wrong_data', 'detail' => 'photos'])->assertOk();
    }
    actAsReporter($voters[0]);
    $this->postJson('/api/v1/listings/100001/reports', ['reason' => 'rented'])->assertOk();
    $this->deleteJson('/api/v1/listings/100001/reports')->assertNoContent();

    $key = (string) AuthorKey::fromCard(['phone' => '+998001234567'])?->key;
    expect(AuthorMark::query()->sole()->author_key)->toBe($key)
        ->and(AuthorMark::query()->sole()->realtor_marked_at)->not->toBeNull()
        ->and(implode("\n", $logged))->not->toContain($key)->not->toContain(substr($key, strlen(AuthorKey::PHONE)))->not->toContain('photos')
        ->not->toContain('1234567');
});
