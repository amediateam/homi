<?php

namespace App\Models;

use Carbon\CarbonImmutable;
use Database\Factories\SourceFlagChangeFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/**
 * One change of a source feature rule (WP-10). `old_rule` is null when the change did not come through the
 * `sources:*` commands, because Pennant's events do not carry the previous value; `new_rule` is null when the
 * stored rule was deleted or purged. The kill switches of the vote detectors (WP-44, `votes:detector`) are audited
 * here too: `feature` is `votes.rented-detector` or `votes.realtor-detector`, the two values are booleans.
 *
 * @property int $id
 * @property string $feature
 * @property mixed $old_rule the stored value before the change (a rule, or a malformed value)
 * @property mixed $new_rule the stored value after the change
 * @property string $actor
 * @property string|null $reason
 * @property string $environment
 * @property CarbonImmutable|null $created_at
 */
class SourceFlagChange extends Model
{
    /** @use HasFactory<SourceFlagChangeFactory> */
    use HasFactory;

    public const UPDATED_AT = null;

    /** Actor of a change that did not come through the commands. */
    public const string UNKNOWN_ACTOR = 'unknown';

    protected $fillable = ['feature', 'old_rule', 'new_rule', 'actor', 'reason', 'environment'];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'old_rule' => 'array',
            'new_rule' => 'array',
        ];
    }
}
