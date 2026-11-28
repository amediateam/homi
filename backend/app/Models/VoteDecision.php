<?php

namespace App\Models;

use Carbon\CarbonImmutable;
use Database\Factories\VoteDecisionFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/**
 * An audit row of HOMI's vote detectors (WP-44, SEC-REQ-045): a recount that crossed a threshold, with its inputs.
 * `subject_type` is `listing` (the subject a listing number) or `author` (an author key); `outcome` is `marked` or
 * `unmarked`. The decimals are strings.
 *
 * @property int $id
 * @property string $subject_type
 * @property string $subject
 * @property string $reason
 * @property int $voters
 * @property string $weight_sum
 * @property string $threshold
 * @property string $outcome
 * @property CarbonImmutable $created_at
 */
class VoteDecision extends Model
{
    /** @use HasFactory<VoteDecisionFactory> */
    use HasFactory;

    public const UPDATED_AT = null;

    protected $fillable = ['subject_type', 'subject', 'reason', 'voters', 'weight_sum', 'threshold', 'outcome'];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'voters' => 'integer',
            'weight_sum' => 'decimal:2',
            'threshold' => 'decimal:2',
            'created_at' => 'datetime',
        ];
    }
}
