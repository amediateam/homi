<?php

namespace App\Models;

use App\Enums\Personal\ReportDetail;
use App\Enums\Personal\ReportReason;
use Carbon\CarbonImmutable;
use Database\Factories\ListingVoteFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One user's report of a listing for one reason (WP-44): written only by `App\Services\Personal\VoteService`; a
 * withdrawn vote keeps its row and no longer counts. `weight` is a decimal string.
 *
 * @property int $id
 * @property int $user_id
 * @property int $listing_number
 * @property string|null $source_channel
 * @property int|null $source_post_id
 * @property string|null $author_key
 * @property ReportReason $reason
 * @property ReportDetail|null $detail
 * @property string $weight
 * @property CarbonImmutable|null $withdrawn_at
 * @property CarbonImmutable $created_at
 * @property-read User $user
 */
class ListingVote extends Model
{
    /** @use HasFactory<ListingVoteFactory> */
    use HasFactory;

    public const UPDATED_AT = null;

    protected $fillable = [
        'user_id', 'listing_number', 'source_channel', 'source_post_id', 'author_key', 'reason', 'detail', 'weight',
        'withdrawn_at',
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
            'reason' => ReportReason::class,
            'detail' => ReportDetail::class,
            'weight' => 'decimal:2',
            'withdrawn_at' => 'datetime',
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
