<?php

namespace App\Models;

use Carbon\CarbonImmutable;
use Database\Factories\ListingViewFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One listing in a user's view history (WP-42): written only by `App\Services\Listings\ViewRecorder`, one row per user
 * and number; `views` counts the full card reads, `last_viewed_at` orders the history.
 *
 * @property int $id
 * @property int $user_id
 * @property int $listing_number
 * @property string|null $source_channel
 * @property int|null $source_post_id
 * @property CarbonImmutable $first_viewed_at
 * @property CarbonImmutable $last_viewed_at
 * @property int $views
 * @property-read User $user
 */
class ListingView extends Model
{
    /** @use HasFactory<ListingViewFactory> */
    use HasFactory;

    public $timestamps = false;

    protected $fillable = [
        'user_id', 'listing_number', 'source_channel', 'source_post_id', 'first_viewed_at', 'last_viewed_at', 'views',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'user_id' => 'integer',
            'listing_number' => 'integer',
            'source_post_id' => 'integer',
            'first_viewed_at' => 'datetime',
            'last_viewed_at' => 'datetime',
            'views' => 'integer',
        ];
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
