<?php

namespace App\Models;

use Carbon\CarbonImmutable;
use Database\Factories\FavoriteFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One listing in a user's favourites (WP-44): written only by `App\Services\Personal\FavoriteService`, one row per user
 * and number; the list pages by `id`, newest first.
 *
 * @property int $id
 * @property int $user_id
 * @property int $listing_number
 * @property string|null $source_channel
 * @property int|null $source_post_id
 * @property CarbonImmutable $created_at
 * @property-read User $user
 */
class Favorite extends Model
{
    /** @use HasFactory<FavoriteFactory> */
    use HasFactory;

    public const UPDATED_AT = null;

    protected $fillable = ['user_id', 'listing_number', 'source_channel', 'source_post_id'];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'user_id' => 'integer',
            'listing_number' => 'integer',
            'source_post_id' => 'integer',
            'created_at' => 'datetime',
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
