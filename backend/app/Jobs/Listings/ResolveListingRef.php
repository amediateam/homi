<?php

namespace App\Jobs\Listings;

use App\Exceptions\ApiException;
use App\Exceptions\Sources\SourceNotFound;
use App\Models\BlockedAuthor;
use App\Models\Favorite;
use App\Models\HiddenListing;
use App\Models\ListingView;
use App\Models\ListingVote;
use App\Services\Listings\ListingRefs;
use App\Services\Sources\SourceContext;
use App\Services\Sources\SourceManager;
use Illuminate\Contracts\Queue\ShouldBeUnique;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Queue\Queueable;

/**
 * Back-fills the channel and post of a listing a personal table stored without them (WP-44, "Resolving a listing for
 * a write"): `ListingResolver` gave a pointer from the source's preview, which carries no source reference, so once
 * the row is written this job reads the full card through the card source in HOMI's own context — the legacy driver
 * files `listing_refs` on that read (WP-42) — and fills the empty `source_channel` and `source_post_id` of that number
 * in `favorites`, `hidden_listings`, `blocked_authors`, `listing_votes` and `listing_views`. A row that already has a
 * channel keeps it.
 *
 * Queue `default`, one job per number at a time (`ShouldBeUnique`). A number the source no longer knows ends the job
 * quietly (the source marks it gone); a source that cannot answer releases the job with a back-off, up to `$tries`.
 */
class ResolveListingRef implements ShouldBeUnique, ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    /** @var list<int> */
    public array $backoff = [60, 300];

    /** How long the uniqueness lock of a number may outlive a job that never finished. */
    public int $uniqueFor = 900;

    /** The tables that store a listing number with its channel and post. */
    private const array TABLES = [Favorite::class, HiddenListing::class, BlockedAuthor::class, ListingVote::class, ListingView::class];

    /** The width of the `source_channel` columns. */
    private const int MAX_CHANNEL = 64;

    public function __construct(public readonly int $number)
    {
        $this->onQueue('default');
    }

    public function uniqueId(): string
    {
        return (string) $this->number;
    }

    public function handle(SourceManager $sources, ListingRefs $refs): void
    {
        $context = SourceContext::system();

        try {
            $card = $sources->listings('source.listings.card', $context)->source->details($this->number, $context);
        } catch (SourceNotFound) {
            return;
        } catch (ApiException) {
            $this->release($this->backoff[min($this->attempts() - 1, count($this->backoff) - 1)] ?? 60);

            return;
        }

        $filed = $refs->pointer($card->preview->number);
        $channel = $filed->channel ?? $card->preview->sourceRef?->channel;
        $post = $filed->channel !== null ? $filed->postId : $card->preview->sourceRef?->postId;

        if ($channel === null || mb_strlen($channel) > self::MAX_CHANNEL) {
            return;
        }

        foreach (self::TABLES as $table) {
            /** @var class-string<Model> $table */
            $table::query()->where('listing_number', $this->number)->whereNull('source_channel')
                ->update(['source_channel' => $channel, 'source_post_id' => $post]);
        }
    }
}
