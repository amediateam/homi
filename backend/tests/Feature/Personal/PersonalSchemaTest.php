<?php

use App\Enums\Personal\FoundAnswerType;
use App\Enums\Personal\FoundPlace;
use App\Enums\Personal\FoundTrigger;
use App\Enums\Personal\HiddenReason;
use App\Enums\Personal\ReportDetail;
use App\Enums\Personal\ReportReason;
use App\Models\AuthorMark;
use App\Models\BlockedAuthor;
use App\Models\Favorite;
use App\Models\FoundAnswer;
use App\Models\HiddenListing;
use App\Models\ListingMark;
use App\Models\ListingView;
use App\Models\ListingVote;
use App\Models\User;
use App\Models\VoteDecision;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;

/*
 * WP-44, step 2: the eight tables of HOMI's personal data, their keys, the user's relations and the enums. Every table
 * that points at a listing stores its number and, when known, the source channel and post (`25` §5). The unique keys
 * are the last guard of the idempotent writes; a duplicate is tried inside a savepoint, so PostgreSQL's aborted
 * statement does not end the test's transaction.
 */

beforeEach(function (): void {
    Http::preventStrayRequests();
});

/** A statement that must fail on a unique key, inside a savepoint. */
function failsOnUniqueKey(Closure $write): bool
{
    try {
        DB::transaction($write);
    } catch (UniqueConstraintViolationException) {
        return true;
    }

    return false;
}

it('creates the eight tables with the columns of the design', function (string $table, array $columns): void {
    expect(Schema::hasTable($table))->toBeTrue()
        ->and(Schema::getColumnListing($table))->toEqualCanonicalizing($columns);
})->with([
    'favorites' => ['favorites', ['id', 'user_id', 'listing_number', 'source_channel', 'source_post_id', 'created_at']],
    'hidden_listings' => ['hidden_listings', ['id', 'user_id', 'listing_number', 'source_channel', 'source_post_id', 'reason', 'created_at']],
    'blocked_authors' => ['blocked_authors', ['id', 'user_id', 'author_key', 'kind', 'label', 'listing_number', 'source_channel', 'source_post_id', 'created_at']],
    'listing_votes' => ['listing_votes', ['id', 'user_id', 'listing_number', 'source_channel', 'source_post_id', 'author_key', 'reason', 'detail', 'weight', 'withdrawn_at', 'created_at']],
    'vote_decisions' => ['vote_decisions', ['id', 'subject_type', 'subject', 'reason', 'voters', 'weight_sum', 'threshold', 'outcome', 'created_at']],
    'listing_marks' => ['listing_marks', ['listing_number', 'rented_at', 'created_at']],
    'author_marks' => ['author_marks', ['author_key', 'realtor_marked_at', 'source', 'created_at']],
    'found_answers' => ['found_answers', ['id', 'user_id', 'answer', 'trigger', 'where', 'created_at']],
]);

it('keeps one row per user and listing in favourites and hidden listings, and one per user and author key in blocks', function (): void {
    $user = User::factory()->create();
    $other = User::factory()->create();
    Favorite::factory()->for($user)->create(['listing_number' => 100012]);
    HiddenListing::factory()->for($user)->create(['listing_number' => 100012]);
    BlockedAuthor::factory()->for($user)->create(['author_key' => 'phone:'.str_repeat('a', 32)]);

    expect(failsOnUniqueKey(fn () => Favorite::factory()->for($user)->create(['listing_number' => 100012])))->toBeTrue()
        ->and(failsOnUniqueKey(fn () => HiddenListing::factory()->for($user)->create(['listing_number' => 100012])))->toBeTrue()
        ->and(failsOnUniqueKey(fn () => BlockedAuthor::factory()->for($user)->create(['author_key' => 'phone:'.str_repeat('a', 32)])))->toBeTrue()
        ->and(failsOnUniqueKey(fn () => Favorite::factory()->for($other)->create(['listing_number' => 100012])))->toBeFalse()
        ->and(failsOnUniqueKey(fn () => BlockedAuthor::factory()->for($other)->create(['author_key' => 'phone:'.str_repeat('a', 32)])))->toBeFalse();
});

it('keeps one vote per user, listing and reason, and one mark per listing and per author key', function (): void {
    $user = User::factory()->create();
    ListingVote::factory()->for($user)->create(['listing_number' => 100012, 'reason' => ReportReason::Rented]);

    expect(failsOnUniqueKey(fn () => ListingVote::factory()->for($user)->create(['listing_number' => 100012, 'reason' => ReportReason::Rented])))->toBeTrue()
        ->and(failsOnUniqueKey(fn () => ListingVote::factory()->for($user)->create(['listing_number' => 100012, 'reason' => ReportReason::Agent])))->toBeFalse();

    ListingMark::factory()->create(['listing_number' => 100012]);
    AuthorMark::factory()->create(['author_key' => 'phone:'.str_repeat('b', 32)]);

    expect(failsOnUniqueKey(fn () => ListingMark::factory()->create(['listing_number' => 100012])))->toBeTrue()
        ->and(failsOnUniqueKey(fn () => AuthorMark::factory()->create(['author_key' => 'phone:'.str_repeat('b', 32)])))->toBeTrue();
});

it('allows a mark row without its time, so a recount can lock it before it marks (stage B)', function (): void {
    ListingMark::query()->insert(['listing_number' => 100012, 'rented_at' => null, 'created_at' => now()]);
    AuthorMark::query()->insert(['author_key' => 'phone:'.str_repeat('c', 32), 'realtor_marked_at' => null, 'source' => null, 'created_at' => now()]);

    expect(ListingMark::query()->sole()->rented_at)->toBeNull()
        ->and(AuthorMark::query()->sole()->realtor_marked_at)->toBeNull();
});

it('gives a blocked author an upper-case ULID, the form of the WP-13 contract', function (): void {
    $entry = BlockedAuthor::factory()->create();

    expect($entry->id)->toMatch('/^[0-9A-HJKMNP-TV-Z]{26}$/')
        ->and(BlockedAuthor::query()->sole()->id)->toBe($entry->id);
});

it('reaches every personal row through its user, and deletes them with the user', function (): void {
    $user = User::factory()->create();
    Favorite::factory()->for($user)->create();
    ListingView::factory()->for($user)->create();
    HiddenListing::factory()->for($user)->create();
    BlockedAuthor::factory()->for($user)->create();
    ListingVote::factory()->for($user)->create();
    FoundAnswer::factory()->for($user)->create();
    VoteDecision::factory()->create();
    $kept = User::factory()->create();
    Favorite::factory()->for($kept)->create();

    expect($user->favorites()->count())->toBe(1)
        ->and($user->listingViews()->count())->toBe(1)
        ->and($user->hiddenListings()->count())->toBe(1)
        ->and($user->blockedAuthors()->count())->toBe(1)
        ->and($user->listingVotes()->count())->toBe(1)
        ->and($user->foundAnswers()->count())->toBe(1);

    $user->delete();

    foreach (['favorites' => 1, 'listing_views' => 0, 'hidden_listings' => 0, 'blocked_authors' => 0, 'listing_votes' => 0, 'found_answers' => 0, 'vote_decisions' => 1] as $table => $left) {
        expect(DB::table($table)->count())->toBe($left, $table);
    }
});

it('casts the reasons, details and survey values to their enums', function (): void {
    $vote = ListingVote::factory()->create(['reason' => ReportReason::WrongData, 'detail' => ReportDetail::Photos, 'weight' => '1.75']);
    $hidden = HiddenListing::factory()->create(['reason' => HiddenReason::ReportFraud]);
    $answer = FoundAnswer::factory()->create(['answer' => FoundAnswerType::Elsewhere, 'trigger' => FoundTrigger::Delete, 'where' => FoundPlace::Olx]);

    expect($vote->fresh()?->reason)->toBe(ReportReason::WrongData)
        ->and($vote->fresh()?->detail)->toBe(ReportDetail::Photos)
        ->and($vote->fresh()?->weight)->toBe('1.75')
        ->and($hidden->fresh()?->reason)->toBe(HiddenReason::ReportFraud)
        ->and([$answer->fresh()?->answer, $answer->fresh()?->trigger, $answer->fresh()?->where])->toBe([FoundAnswerType::Elsewhere, FoundTrigger::Delete, FoundPlace::Olx]);
});

it('names the wire values of the enums as the WP-13 requests validate them', function (): void {
    expect(array_column(HiddenReason::cases(), 'value'))->toBe(['manual', 'report_rented', 'report_fraud'])
        ->and(array_column(ReportReason::cases(), 'value'))->toBe(['rented', 'agent', 'wrong_data', 'fraud'])
        ->and(array_column(ReportDetail::cases(), 'value'))->toBe(['price', 'rooms', 'place', 'photos', 'other'])
        ->and(array_column(FoundAnswerType::cases(), 'value'))->toBe(['homi', 'elsewhere', 'searching', 'stopped'])
        ->and(array_column(FoundTrigger::cases(), 'value'))->toBe(['pause', 'delete'])
        ->and(array_column(FoundPlace::cases(), 'value'))->toBe(['telegram', 'olx', 'site', 'agent', 'friends', 'street', 'other']);
});
