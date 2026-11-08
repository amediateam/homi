<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Stored response of an accepted intake request, replayed for the same Idempotency-Key.
 *
 * @property int $id
 * @property int $source_id
 * @property string $idempotency_key
 * @property int $status_code
 * @property array<string, mixed> $response
 */
class IntakeRequest extends Model
{
    protected $fillable = ['source_id', 'idempotency_key', 'status_code', 'response'];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'status_code' => 'integer',
            'response' => 'array',
        ];
    }

    /**
     * @return BelongsTo<Source, $this>
     */
    public function source(): BelongsTo
    {
        return $this->belongsTo(Source::class);
    }
}
