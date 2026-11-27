<?php

namespace App\Models;

use Carbon\CarbonImmutable;
use Database\Factories\AuthorMarkFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/**
 * HOMI's mark of an author for everybody (WP-44): `realtor_marked_at` while the weighted `agent` votes of distinct
 * users on the key are at or above the threshold (`source` = `votes`); a row without it marks nothing.
 * `App\Services\Personal\EloquentOverlayData` reads the marked keys for the overlay. The key is pseudonymous
 * (`listing_refs.author_key`), never a phone number.
 *
 * @property string $author_key
 * @property CarbonImmutable|null $realtor_marked_at
 * @property string|null $source
 * @property CarbonImmutable $created_at
 */
class AuthorMark extends Model
{
    /** @use HasFactory<AuthorMarkFactory> */
    use HasFactory;

    public const UPDATED_AT = null;

    protected $primaryKey = 'author_key';

    protected $keyType = 'string';

    public $incrementing = false;

    protected $fillable = ['author_key', 'realtor_marked_at', 'source'];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'realtor_marked_at' => 'datetime',
            'created_at' => 'datetime',
        ];
    }
}
