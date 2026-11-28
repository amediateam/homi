<?php

namespace App\Models;

use Carbon\CarbonImmutable;
use Database\Factories\BlockedAuthorFactory;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Str;

/**
 * An author a user blocked (WP-44): written only by `App\Services\Personal\BlockedAuthorService`, one entry per user
 * and author key. The id is an upper-case ULID, the form of the WP-13 contract (`DELETE /hidden/authors/{id}`); the
 * label is plain text, masked when the entry was made. Not the data object `App\Services\Personal\BlockedAuthor` the
 * API answers.
 *
 * @property string $id
 * @property int $user_id
 * @property string $author_key
 * @property string $kind
 * @property string $label
 * @property int $listing_number
 * @property string|null $source_channel
 * @property int|null $source_post_id
 * @property CarbonImmutable $created_at
 * @property-read User $user
 */
class BlockedAuthor extends Model
{
    /** @use HasFactory<BlockedAuthorFactory> */
    use HasFactory, HasUlids;

    public const UPDATED_AT = null;

    /** No `user_id`: a row gets its owner only through the user's relation or an explicit insert (review of WP-44 A, F5). */
    protected $fillable = ['author_key', 'kind', 'label', 'listing_number', 'source_channel', 'source_post_id'];

    /** An upper-case ULID: Laravel's default is lower-case, the contract of WP-13 names Crockford's upper case. */
    public function newUniqueId(): string
    {
        return (string) Str::ulid();
    }

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'user_id' => 'integer',
            'listing_number' => 'integer',
            'source_post_id' => 'integer',
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
