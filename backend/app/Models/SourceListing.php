<?php

namespace App\Models;

use App\Enums\SourceListingStatus;
use Carbon\CarbonImmutable;
use Database\Factories\SourceListingFactory;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * The stable HOMI handle for one external listing of one source.
 *
 * @property string $id
 * @property int $source_id
 * @property string $external_id
 * @property int|null $source_version
 * @property SourceListingStatus $status
 * @property CarbonImmutable $first_seen_at
 * @property CarbonImmutable $last_event_at
 * @property string|null $listing_id
 */
class SourceListing extends Model
{
    /** @use HasFactory<SourceListingFactory> */
    use HasFactory;

    use HasUlids;

    protected $fillable = ['source_id', 'external_id', 'source_version', 'status', 'first_seen_at', 'last_event_at', 'listing_id'];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'source_version' => 'integer',
            'status' => SourceListingStatus::class,
            'first_seen_at' => 'immutable_datetime',
            'last_event_at' => 'immutable_datetime',
        ];
    }

    /**
     * @return BelongsTo<Source, $this>
     */
    public function source(): BelongsTo
    {
        return $this->belongsTo(Source::class);
    }

    /**
     * @return HasMany<IntakeEvent, $this>
     */
    public function events(): HasMany
    {
        return $this->hasMany(IntakeEvent::class);
    }
}
