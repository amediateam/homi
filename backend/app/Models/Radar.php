<?php

namespace App\Models;

use App\Enums\RadarMode;
use App\Services\Search\SearchFilters;
use Carbon\CarbonImmutable;
use Database\Factories\RadarFactory;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;
use InvalidArgumentException;

/**
 * A user's radar (WP-45): written only by `App\Services\Radar\RadarService`. The id is an upper-case ULID, the form of
 * the WP-13 contract (`/radars/{id}`). `filters` is the 25-key object of `SearchFilters::toArray()` and is set
 * together with `filters_hash`, `city` and `deal` (`filterAttributes()`); saving refuses a filters array without
 * exactly the 25 keys. Not the data object `App\Services\Radars\Radar` the API answers.
 *
 * @property string $id
 * @property int $user_id
 * @property bool $active
 * @property RadarMode $mode
 * @property array<string, mixed> $filters
 * @property string $filters_hash
 * @property string $city
 * @property string $deal
 * @property string|null $entry
 * @property string|null $relax_code
 * @property int $hidden_count
 * @property CarbonImmutable|null $paused_at
 * @property CarbonImmutable $created_at
 * @property CarbonImmutable $updated_at
 * @property-read User $user
 */
class Radar extends Model
{
    /** @use HasFactory<RadarFactory> */
    use HasFactory, HasUlids;

    /** No `user_id`: a radar gets its owner only through the user's relation (as the personal rows of WP-44). */
    protected $fillable = ['active', 'mode', 'filters', 'filters_hash', 'city', 'deal', 'entry', 'relax_code', 'hidden_count', 'paused_at'];

    /** @var array<string, mixed> */
    protected $attributes = [
        'active' => true,
        'mode' => 'instant',
        'hidden_count' => 0,
    ];

    /**
     * The columns that follow from the filters: the 25-key object, its canonical hash (without `posted_days`), the
     * city and the deal.
     *
     * @return array{filters: array<string, mixed>, filters_hash: string, city: string, deal: string}
     */
    public static function filterAttributes(SearchFilters $filters): array
    {
        return [
            'filters' => $filters->toArray(),
            'filters_hash' => $filters->canonicalHash(),
            'city' => $filters->city,
            'deal' => $filters->deal->value,
        ];
    }

    /** An upper-case ULID: Laravel's default is lower-case, the contract of WP-13 names Crockford's upper case. */
    public function newUniqueId(): string
    {
        return (string) Str::ulid();
    }

    /** The stored filters as the search they are. */
    public function searchFilters(): SearchFilters
    {
        return SearchFilters::fromNormalised($this->filters);
    }

    protected static function booted(): void
    {
        static::saving(function (Radar $radar): void {
            $filters = $radar->getAttribute('filters');
            $keys = is_array($filters) ? array_keys($filters) : [];
            $expected = SearchFilters::KEYS;
            sort($keys);
            sort($expected);

            if ($keys !== $expected) {
                throw new InvalidArgumentException('A radar stores the filters object with exactly its 25 keys.');
            }
        });
    }

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'user_id' => 'integer',
            'active' => 'boolean',
            'mode' => RadarMode::class,
            'filters' => 'array',
            'hidden_count' => 'integer',
            'paused_at' => 'datetime',
            'created_at' => 'datetime',
            'updated_at' => 'datetime',
        ];
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * @return HasMany<RadarHideRule, $this>
     */
    public function hideRules(): HasMany
    {
        return $this->hasMany(RadarHideRule::class);
    }
}
