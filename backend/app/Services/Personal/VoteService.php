<?php

namespace App\Services\Personal;

use App\Enums\Personal\HiddenReason;
use App\Enums\Personal\ReportDetail;
use App\Enums\Personal\ReportReason;
use App\Models\AuthorMark;
use App\Models\ListingMark;
use App\Models\ListingVote;
use App\Models\User;
use App\Models\VoteDecision;
use App\Services\Listings\ListingNumber;
use App\Services\Listings\ListingPointer;
use App\Services\Listings\ListingRefs;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

/**
 * HOMI's report votes (WP-44, "Reports and votes"; task `KV-BE-043`, SEC-REQ-045, DEC-48: legacy never learns of
 * them). One tap never relabels a listing or a person for everybody:
 *
 * - a vote is one row per user, listing and reason (`insertOrIgnore`): a repeat counts once and answers the same, and
 *   a repeat after a withdrawal counts the first row again (its weight and detail kept);
 * - its effect for the voter is at once: `rented` and `fraud` hide the listing for him (a hidden row that keeps its
 *   first reason), `agent` and `wrong_data` hide nothing; a `wrong_data` detail feeds review only;
 * - the effect for everybody needs the weighted sum of distinct voters at a threshold (`config/votes.php`) and at
 *   least `minVoters()` of them: `rented` per listing number marks `listing_marks.rented_at`; `agent` per author key —
 *   one weight per user, his heaviest vote, however many of the author's listings he reported — marks
 *   `author_marks.realtor_marked_at`; on a native number `fraud` per listing number crosses for the operators (WP-84
 *   holds the owner listing; here it is the audit row alone, and the subject's latest `vote_decisions` row says
 *   whether it is crossed). `wrong_data` and `fraud` on a legacy number count for nothing.
 *
 * Every crossing writes one `vote_decisions` row with its inputs, `marked` or `unmarked`. The recount is serialised
 * per subject: inside the transaction it first inserts the subject's mark row without a time (`insertOrIgnore`) and
 * locks it (`lockForUpdate`), then counts, so two voters at once cannot each count without the other's vote (the
 * default isolation of PostgreSQL), and a subject is marked once. A report or a withdrawal locks one mark row, after
 * its own vote and hidden rows, so two transactions never wait on each other in a cycle.
 *
 * A vote only adds weight, so a report's recount may mark and never unmarks; a withdrawal's recount may unmark and
 * never marks. The kill switches (`VoteDetectors`) are read before the transaction, as Pennant may insert its default
 * row: while a detector is off a report writes no mark — the votes cast meanwhile are counted again by the subject's
 * next report — and `agent_marked` is `false`; a withdrawal that falls below a threshold still removes the mark. The
 * weights are summed in hundredths, never as floats. The author key of a vote is the one `listing_refs` files for the
 * listing when it is cast (the caller of an `agent` report files it first, `ListingResolver::fileAuthor()`); a vote
 * without one has no author effect. The back-fill of the listing's channel and post is queued after the commit.
 */
final readonly class VoteService
{
    /** The distinct voters a mark needs at the least, whatever `votes.min_voters` says (SEC-REQ-045). */
    public const int MIN_VOTERS = 2;

    /** The largest weight `listing_votes.weight` (decimal 4,2) holds, in hundredths. */
    private const int MAX_WEIGHT = 9999;

    public function __construct(
        private HiddenService $hidden,
        private ListingResolver $resolver,
        private ListingRefs $refs,
        private VoteDetectors $detectors,
    ) {}

    /**
     * Records the user's report of the listing in one transaction and recounts its subject. A detail goes only with
     * `wrong_data` (the request validated it); with another reason it is a programming error.
     *
     * @throws InvalidArgumentException
     */
    public function report(User $user, ListingPointer $pointer, ReportReason $reason, ?ReportDetail $detail = null): ReportOutcome
    {
        if ($detail !== null && $reason !== ReportReason::WrongData) {
            throw new InvalidArgumentException('A report detail goes only with wrong_data.');
        }

        $author = $this->refs->author($pointer->number)?->key;
        $subject = $this->subjectOf($pointer->number, $reason, $author);
        $detecting = $subject !== null && $this->detecting($subject);
        $hiding = match ($reason) {
            ReportReason::Rented => HiddenReason::ReportRented,
            ReportReason::Fraud => HiddenReason::ReportFraud,
            default => null,
        };

        [$before, $after] = DB::transaction(function () use ($user, $pointer, $reason, $detail, $author, $hiding, $subject, $detecting): array {
            $this->cast($user, $pointer, $reason, $detail, $author);

            if ($hiding !== null) {
                $this->hidden->record($user, $pointer, $hiding);
            }

            return $subject !== null ? $this->recount($subject, $detecting, mark: true) : [false, false];
        });

        $this->afterCommit($pointer, $subject, $before, $after);

        $agentMarked = $subject !== null && $subject->isAuthor() && $detecting
            && ($after && (! $before || Config::boolean('votes.agent_marked.already_marked')));

        return new ReportOutcome($hiding !== null, $agentMarked);
    }

    /**
     * Withdraws the user's vote for the reason on the listing and recounts its subject (the «Уже сдано» undo of
     * `DELETE /listings/{number}/reports`, the bot's undo buttons of WP-53). A vote already withdrawn, or none,
     * changes nothing. The voter's hidden row is the caller's.
     */
    public function withdraw(User $user, ListingPointer $pointer, ReportReason $reason): void
    {
        $vote = $user->listingVotes()->where('listing_number', $pointer->number)->where('reason', $reason->value)
            ->whereNull('withdrawn_at')->first(['id', 'author_key']);

        if ($vote === null) {
            return;
        }

        $subject = $this->subjectOf($pointer->number, $reason, $vote->author_key);
        $detecting = $subject !== null && $this->detecting($subject);

        [$before, $after] = DB::transaction(function () use ($vote, $subject, $detecting): array {
            $withdrawn = ListingVote::query()->whereKey($vote->id)->whereNull('withdrawn_at')->update(['withdrawn_at' => now()]);

            return $withdrawn > 0 && $subject !== null ? $this->recount($subject, $detecting, mark: false) : [false, false];
        });

        $this->afterCommit(null, $subject, $before, $after);
    }

    /** A voter's weight as `listing_votes.weight` stores it (`"1.25"`), from `config('votes.weights')`. */
    public function weightOf(User $user): string
    {
        return self::decimal($this->weightCents($user));
    }

    /** The distinct voters a mark needs: `votes.min_voters`, never fewer than `MIN_VOTERS`. */
    public static function minVoters(): int
    {
        $configured = Config::get('votes.min_voters');

        return max(self::MIN_VOTERS, is_numeric($configured) ? (int) $configured : self::MIN_VOTERS);
    }

    /** The vote row, or the first one again: a repeat after a withdrawal counts it anew. */
    private function cast(User $user, ListingPointer $pointer, ReportReason $reason, ?ReportDetail $detail, ?string $author): void
    {
        $inserted = ListingVote::query()->insertOrIgnore([
            'user_id' => $user->id,
            'listing_number' => $pointer->number,
            'source_channel' => $pointer->channel,
            'source_post_id' => $pointer->postId,
            'author_key' => $author,
            'reason' => $reason->value,
            'detail' => $detail?->value,
            'weight' => $this->weightOf($user),
            'withdrawn_at' => null,
            'created_at' => now(),
        ]);

        if ($inserted === 0) {
            $user->listingVotes()->where('listing_number', $pointer->number)->where('reason', $reason->value)
                ->whereNotNull('withdrawn_at')->update(['withdrawn_at' => null]);
        }
    }

    /** The subject a vote counts towards, `null` when its reason has no effect for everybody there. */
    private function subjectOf(int $number, ReportReason $reason, ?string $author): ?VoteSubject
    {
        return match (true) {
            $reason === ReportReason::Rented => VoteSubject::listing($number, $reason),
            $reason === ReportReason::Agent && $author !== null => VoteSubject::author($author),
            $reason === ReportReason::Fraud && ListingNumber::isNative($number) => VoteSubject::listing($number, $reason),
            default => null,
        };
    }

    /** Whether the subject's detector is on; native `fraud` has no detector of its own (its effect is WP-84's hold). */
    private function detecting(VoteSubject $subject): bool
    {
        return match ($subject->reason) {
            ReportReason::Rented => $this->detectors->rentedOn(),
            ReportReason::Agent => $this->detectors->realtorOn(),
            default => true,
        };
    }

    /**
     * Locks the subject, counts its live votes and writes the crossing, if any: upwards after a report (`$mark`), while
     * the detector is on; downwards after a withdrawal.
     *
     * @return array{0: bool, 1: bool} whether the subject was crossed before the recount, and after it
     */
    private function recount(VoteSubject $subject, bool $detecting, bool $mark): array
    {
        $before = $this->lockAndRead($subject);
        [$voters, $cents] = $this->tally($subject);
        $threshold = $this->thresholdCents($subject->reason);
        $reached = $voters >= self::minVoters() && $cents >= $threshold;

        if ($mark && $reached && ! $before && $detecting) {
            $this->write($subject, true);
            $this->decide($subject, $voters, $cents, $threshold, 'marked');

            return [false, true];
        }

        if (! $mark && ! $reached && $before) {
            $this->write($subject, false);
            $this->decide($subject, $voters, $cents, $threshold, 'unmarked');

            return [true, false];
        }

        return [$before, $before];
    }

    /** Inserts the subject's mark row without a time unless it exists, locks it, and says whether it is crossed. */
    private function lockAndRead(VoteSubject $subject): bool
    {
        if ($subject->isAuthor()) {
            AuthorMark::query()->insertOrIgnore(['author_key' => $subject->authorKey, 'realtor_marked_at' => null, 'source' => null, 'created_at' => now()]);
            $mark = AuthorMark::query()->whereKey($subject->authorKey)->lockForUpdate()->first();

            return $mark?->realtor_marked_at !== null;
        }

        ListingMark::query()->insertOrIgnore(['listing_number' => $subject->number, 'rented_at' => null, 'created_at' => now()]);
        $mark = ListingMark::query()->whereKey($subject->number)->lockForUpdate()->first();

        if ($subject->reason === ReportReason::Rented) {
            return $mark?->rented_at !== null;
        }

        return VoteDecision::query()->where('subject_type', $subject->type)->where('subject', $subject->subject)
            ->where('reason', $subject->reason->value)->orderByDesc('id')->value('outcome') === 'marked';
    }

    /**
     * The live votes of the subject: how many distinct users, and the sum of their weights in hundredths — per author
     * key one weight per user, his heaviest.
     *
     * @return array{0: int, 1: int}
     */
    private function tally(VoteSubject $subject): array
    {
        $query = ListingVote::query()->where('reason', $subject->reason->value)->whereNull('withdrawn_at');
        $query = $subject->isAuthor() ? $query->where('author_key', $subject->authorKey) : $query->where('listing_number', $subject->number);
        $rows = $query->groupBy('user_id')->selectRaw('user_id, max(weight) as weight')->toBase()->get();
        $cents = 0;

        foreach ($rows as $row) {
            $weight = $row->weight ?? null;
            $cents += is_numeric($weight) ? (int) round((float) $weight * 100) : 0;
        }

        return [$rows->count(), $cents];
    }

    private function write(VoteSubject $subject, bool $marked): void
    {
        $at = $marked ? now() : null;

        match (true) {
            $subject->isAuthor() => AuthorMark::query()->whereKey($subject->authorKey)->update(['realtor_marked_at' => $at, ...($marked ? ['source' => 'votes'] : [])]),
            $subject->reason === ReportReason::Rented => ListingMark::query()->whereKey($subject->number)->update(['rented_at' => $at]),
            default => null,
        };
    }

    private function decide(VoteSubject $subject, int $voters, int $cents, int $threshold, string $outcome): void
    {
        VoteDecision::query()->create([
            'subject_type' => $subject->type,
            'subject' => $subject->subject,
            'reason' => $subject->reason->value,
            'voters' => $voters,
            'weight_sum' => self::decimal($cents),
            'threshold' => self::decimal($threshold),
            'outcome' => $outcome,
        ]);
    }

    /** After the commit: the back-fill of an unfiled listing, and the realtor keys' cache when an author's mark moved. */
    private function afterCommit(?ListingPointer $pointer, ?VoteSubject $subject, bool $before, bool $after): void
    {
        if ($pointer !== null) {
            $this->resolver->backfill($pointer);
        }

        if ($subject !== null && $subject->isAuthor() && $before !== $after) {
            Cache::forget(EloquentOverlayData::REALTOR_KEYS);
        }
    }

    private function weightCents(User $user): int
    {
        $cents = self::cents('base')
            + ($user->is_premium ? self::cents('premium') : 0)
            + ($user->has_username ? self::cents('username') : 0)
            + ($user->has_photo ? self::cents('photo') : 0);

        return max(0, min($cents, self::cents('max', self::MAX_WEIGHT), self::MAX_WEIGHT));
    }

    /** A weight of `config('votes.weights')` in hundredths; one that is not a number counts `$otherwise`. */
    private static function cents(string $key, int $otherwise = 0): int
    {
        $value = Config::get("votes.weights.{$key}");

        return is_numeric($value) ? (int) round((float) $value * 100) : $otherwise;
    }

    /** The reason's threshold in hundredths; one that is not a positive number is out of reach. */
    private function thresholdCents(ReportReason $reason): int
    {
        $value = Config::get("votes.thresholds.{$reason->value}");
        $cents = is_numeric($value) ? (int) round((float) $value * 100) : 0;

        return $cents > 0 ? $cents : PHP_INT_MAX;
    }

    private static function decimal(int $cents): string
    {
        return number_format($cents / 100, 2, '.', '');
    }
}
