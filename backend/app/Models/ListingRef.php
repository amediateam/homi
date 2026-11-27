<?php

namespace App\Models;

use Carbon\CarbonImmutable;
use Database\Factories\ListingRefFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/**
 * Where a listing number points (WP-42): its channel and post, its pseudonymous author key, its district, the number
 * legacy merged it into and when legacy stopped knowing it. Written only by `App\Services\Listings\ListingRefs`, which
 * never stores a phone number: `author_key` is `phone:` + a keyed hash, `source:<channel>` or `legacy:<key>`.
 *
 * @property int $listing_number
 * @property string|null $source_channel
 * @property int|null $source_post_id
 * @property string|null $author_key
 * @property string|null $author_kind
 * @property string|null $district_code
 * @property int|null $merged_into
 * @property CarbonImmutable|null $first_seen_at
 * @property CarbonImmutable|null $last_seen_at
 * @property CarbonImmutable|null $gone_at
 */
class ListingRef extends Model
{
    /** @use HasFactory<ListingRefFactory> */
    use HasFactory;

    protected $primaryKey = 'listing_number';

    public $incrementing = false;

    public $timestamps = false;

    protected $fillable = [
        'listing_number', 'source_channel', 'source_post_id', 'author_key', 'author_kind', 'district_code',
        'merged_into', 'first_seen_at', 'last_seen_at', 'gone_at',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'listing_number' => 'integer',
            'source_post_id' => 'integer',
            'merged_into' => 'integer',
            'first_seen_at' => 'datetime',
            'last_seen_at' => 'datetime',
            'gone_at' => 'datetime',
        ];
    }
}
