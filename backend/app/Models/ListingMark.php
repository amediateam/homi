<?php

namespace App\Models;

use Carbon\CarbonImmutable;
use Database\Factories\ListingMarkFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/**
 * HOMI's mark of a listing for everybody (WP-44): `rented_at` while the weighted `rented` votes are at or above the
 * threshold; a row without it marks nothing. `App\Services\Personal\EloquentOverlayData` reads it for the overlay.
 *
 * @property int $listing_number
 * @property CarbonImmutable|null $rented_at
 * @property CarbonImmutable $created_at
 */
class ListingMark extends Model
{
    /** @use HasFactory<ListingMarkFactory> */
    use HasFactory;

    public const UPDATED_AT = null;

    protected $primaryKey = 'listing_number';

    public $incrementing = false;

    protected $fillable = ['listing_number', 'rented_at'];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'listing_number' => 'integer',
            'rented_at' => 'datetime',
            'created_at' => 'datetime',
        ];
    }
}
