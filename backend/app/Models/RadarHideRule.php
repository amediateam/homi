<?php

namespace App\Models;

use App\Enums\Radar\HideRuleKind;
use Carbon\CarbonImmutable;
use Database\Factories\RadarHideRuleFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One hide rule of a radar (WP-45): written only by `App\Services\Radar\RadarHideRuleService`, one row per radar, kind
 * and target. The target of an `author` rule is an author key of `listing_refs` (personal data: never logged).
 *
 * @property int $id
 * @property string $radar_id
 * @property HideRuleKind $kind
 * @property string $target
 * @property CarbonImmutable $created_at
 * @property-read Radar $radar
 */
class RadarHideRule extends Model
{
    /** @use HasFactory<RadarHideRuleFactory> */
    use HasFactory;

    public const UPDATED_AT = null;

    /** No `radar_id`: a rule gets its radar only through the radar's relation or an explicit insert. */
    protected $fillable = ['kind', 'target'];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'kind' => HideRuleKind::class,
            'created_at' => 'datetime',
        ];
    }

    /**
     * @return BelongsTo<Radar, $this>
     */
    public function radar(): BelongsTo
    {
        return $this->belongsTo(Radar::class);
    }
}
