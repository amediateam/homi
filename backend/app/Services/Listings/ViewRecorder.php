<?php

namespace App\Services\Listings;

use App\Models\ListingView;
use App\Models\User;
use App\Services\Sources\Data\ListingDetails;
use App\Services\Sources\SourceConfig;
use Illuminate\Support\Facades\DB;

/**
 * Records a full card read in the user's view history (WP-42, "View history"; task `KV-BE-039`): synchronously, in one
 * upsert on (`user_id`, `listing_number`), so the first read creates the row and every later one adds to `views` and
 * moves `last_viewed_at`, also when two reads of one listing race. The number recorded is the card's own, so a merged
 * duplicate records the surviving listing; the channel and post travel with it. A preview read never records: the
 * card controller calls this only for the full card. While `sources.native_stubs` is on (WP-40) nothing is recorded,
 * so the end-to-end suite leaves no rows behind (`25` §4.4).
 */
final readonly class ViewRecorder
{
    public function __construct(private SourceConfig $config) {}

    /** Records the read and answers the card marked `viewed`. */
    public function record(User $user, ListingDetails $card): ListingDetails
    {
        if ($this->config->nativeStubs()) {
            return $card;
        }

        $preview = $card->preview;
        $now = now();

        ListingView::query()->upsert(
            [[
                'user_id' => $user->id,
                'listing_number' => $preview->number,
                'source_channel' => self::fits($preview->sourceRef?->channel),
                'source_post_id' => $preview->sourceRef?->postId,
                'first_viewed_at' => $now,
                'last_viewed_at' => $now,
                'views' => 1,
            ]],
            ['user_id', 'listing_number'],
            [
                'source_channel',
                'source_post_id',
                'last_viewed_at',
                'views' => DB::raw('"listing_views"."views" + 1'),
            ],
        );

        return $card->withPreview($preview->withFlags(viewed: true));
    }

    /** A channel that fits the 64-character column, else `null`. */
    private static function fits(?string $channel): ?string
    {
        return $channel !== null && mb_strlen($channel) <= 64 ? $channel : null;
    }
}
