<?php

namespace App\Services\Personal;

use App\Models\AuthorMark;
use App\Models\BlockedAuthor;
use App\Models\Favorite;
use App\Models\HiddenListing;
use App\Models\ListingMark;
use App\Models\ListingView;
use App\Models\User;
use App\Services\Listings\Contracts\OverlayData;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Cache;

/**
 * HOMI's own data for the listing overlay of WP-42 (WP-44, "Overlay data"), in place of `NullOverlayData`:
 *
 * | Method | Query |
 * | ------ | ----- |
 * | `favorites`, `viewed` | the user's rows of `favorites`, `listing_views` among the numbers asked |
 * | `hiddenNumbers` | the user's `hidden_listings` |
 * | `blockedAuthorKeys` | the user's `blocked_authors` |
 * | `rentedByVotes` | `listing_marks` with a `rented_at` among the numbers asked |
 * | `realtorAuthorKeys` | every `author_marks` key with a `realtor_marked_at`, cached `REALTOR_KEYS_SECONDS` |
 *
 * `ListingOverlay` reads the per-user sets once per request's context and the ones that take numbers once per list.
 * A write of the user flushes nothing shared: the listing caches hold no per-user data, and only the realtor keys,
 * the same for everyone, are cached here — as a list of strings, never an object (`serializable_classes => false`),
 * read back only when it still is one. A mark row without its time marks nothing (stage B locks such a row while it
 * recounts). The kill switches of the two detectors (stage B) are checked before these reads.
 */
final class EloquentOverlayData implements OverlayData
{
    /** The cache key of the marked realtor keys; its value holds author keys, so Telescope keeps no entry of it. */
    public const string REALTOR_KEYS = 'personal:realtor-author-keys';

    public const int REALTOR_KEYS_SECONDS = 60;

    /** Numbers per `whereIn`, well below the bound parameters SQLite and PostgreSQL accept. */
    private const int CHUNK = 1000;

    public function favorites(User $user, array $numbers): array
    {
        return $this->numbersAmong(Favorite::query()->where('user_id', $user->id), $numbers);
    }

    public function viewed(User $user, array $numbers): array
    {
        return $this->numbersAmong(ListingView::query()->where('user_id', $user->id), $numbers);
    }

    public function hiddenNumbers(User $user): array
    {
        return self::ints(HiddenListing::query()->where('user_id', $user->id)->pluck('listing_number')->all());
    }

    public function blockedAuthorKeys(User $user): array
    {
        return self::strings(BlockedAuthor::query()->where('user_id', $user->id)->pluck('author_key')->all());
    }

    public function rentedByVotes(array $numbers): array
    {
        return $this->numbersAmong(ListingMark::query()->whereNotNull('rented_at'), $numbers);
    }

    public function realtorAuthorKeys(): array
    {
        $cached = Cache::get(self::REALTOR_KEYS);

        if (is_array($cached) && array_is_list($cached)) {
            $strings = self::strings($cached);

            if ($strings === $cached) {
                return $strings;
            }
        }

        $keys = self::strings(AuthorMark::query()->whereNotNull('realtor_marked_at')->pluck('author_key')->all());
        Cache::put(self::REALTOR_KEYS, $keys, self::REALTOR_KEYS_SECONDS);

        return $keys;
    }

    /**
     * The numbers among `$numbers` the query's rows hold, in chunks.
     *
     * @template TModel of Model
     *
     * @param  Builder<TModel>  $query
     * @param  list<int>  $numbers
     * @return list<int>
     */
    private function numbersAmong(Builder $query, array $numbers): array
    {
        $found = [];

        foreach (array_chunk(array_values(array_unique($numbers)), self::CHUNK) as $chunk) {
            $found = [...$found, ...self::ints((clone $query)->whereIn('listing_number', $chunk)->pluck('listing_number')->all())];
        }

        return $found;
    }

    /**
     * @param  array<array-key, mixed>  $values
     * @return list<int>
     */
    private static function ints(array $values): array
    {
        $ints = [];

        foreach ($values as $value) {
            if (is_numeric($value)) {
                $ints[] = (int) $value;
            }
        }

        return $ints;
    }

    /**
     * @param  array<array-key, mixed>  $values
     * @return list<string>
     */
    private static function strings(array $values): array
    {
        return array_values(array_filter($values, is_string(...)));
    }
}
