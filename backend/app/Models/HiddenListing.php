<?php

namespace App\Models;

use App\Enums\Personal\HiddenReason;
use Carbon\CarbonImmutable;
use Database\Factories\HiddenListingFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A listing a user hid (WP-44): written only by `App\Services\Personal\HiddenService`, one row per user and number; the
 * first reason stays.
 *
 * @property int $id
 * @property int $user_id
 * @property int $listing_number
 * @property string|null $source_channel
 * @property int|null $source_post_id
 * @property HiddenReason $reason
 * @property CarbonImmutable $created_at
 * @property-read User $user
 */
class HiddenListing extends Model
{
    /** @use HasFactory<HiddenListingFactory> */
    use HasFactory;

    public const UPDATED_AT = null;

    protected $fillable = ['user_id', 'listing_number', 'source_channel', 'source_post_id', 'reason'];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'user_id' => 'integer',
            'listing_number' => 'integer',
            'source_post_id' => 'integer',
            'reason' => HiddenReason::class,
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
