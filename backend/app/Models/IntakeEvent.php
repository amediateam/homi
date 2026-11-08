<?php

namespace App\Models;

use App\Enums\IntakeEventStatus;
use App\Enums\IntakeEventType;
use Carbon\CarbonImmutable;
use Database\Factories\IntakeEventFactory;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A raw payload accepted from a collector, stored before normalisation (ADR-0009 §3).
 *
 * @property string $id
 * @property int $source_id
 * @property string $source_listing_id
 * @property int|null $intake_request_id
 * @property IntakeEventType $event_type
 * @property int $schema_version
 * @property int|null $source_version
 * @property array<string, mixed> $payload
 * @property IntakeEventStatus $status
 * @property string|null $error
 * @property CarbonImmutable $received_at
 * @property CarbonImmutable|null $processed_at
 */
class IntakeEvent extends Model
{
    /** @use HasFactory<IntakeEventFactory> */
    use HasFactory;

    use HasUlids;

    public $timestamps = false;

    protected $fillable = [
        'source_id', 'source_listing_id', 'intake_request_id', 'event_type', 'schema_version',
        'source_version', 'payload', 'status', 'error', 'received_at', 'processed_at',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'event_type' => IntakeEventType::class,
            'schema_version' => 'integer',
            'source_version' => 'integer',
            'payload' => 'array',
            'status' => IntakeEventStatus::class,
            'received_at' => 'immutable_datetime',
            'processed_at' => 'immutable_datetime',
        ];
    }

    /**
     * @return BelongsTo<SourceListing, $this>
     */
    public function sourceListing(): BelongsTo
    {
        return $this->belongsTo(SourceListing::class);
    }

    /**
     * @return BelongsTo<Source, $this>
     */
    public function source(): BelongsTo
    {
        return $this->belongsTo(Source::class);
    }
}
