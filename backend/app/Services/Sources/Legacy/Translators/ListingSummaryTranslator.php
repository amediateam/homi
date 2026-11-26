<?php

namespace App\Services\Sources\Legacy\Translators;

use App\Enums\Deal;
use App\Enums\ListingOrigin;
use App\Exceptions\Sources\LegacyContractError;
use App\Services\Listings\PhoneMasker;
use App\Services\Listings\PhotoUrlRewriter;
use App\Services\Sources\Data\ListingSummary;
use InvalidArgumentException;

/**
 * A legacy `ListingPreview` (`08` §1.8) as a listing preview (WP-12), and a `FeedPage` as its items and cursor. Pure:
 * the photo rewriter, the district matcher and the native floor are given, so the unit suite tests it without the
 * application.
 *
 * - Required: `id` (a whole number ≥ 1 below the native floor; a collision with a HOMI number is never served) and
 *   `photos_preview` (a list); of a page `items` (a list) and the key `next_cursor` (a string or `null`; an empty
 *   string ends the list like `null`).
 * - `title` = `short_title`, else the part of `title` before « · », else `''`; `price` through `PriceParser` with
 *   `usd`, else `price_usd`; `deal` ← `deal_type` when it is a deal (cards only; `null` on previews and for another
 *   value); `type` is always `null` (legacy sends no type code).
 * - `posted`: `label` and `when` are the parts of `age` around its first « · » (one part is the `label`, as legacy
 *   showed it; no `age` is `''` twice); `at` ← `posted_at` when it is a readable time, else `null`.
 * - `floor` keeps `0` and negative values; only a missing or `null` floor is `null`. `metro.km`, `center_km`, `lat` and
 *   `lon` are numbers or `null`; `location` needs both coordinates. `district.code` through `DistrictMatcher`.
 * - `photos`: the rewritten `photos_preview` and `cover`; `count` ← `photos_count`, else the number of addresses sent.
 * - `has_video` = truthiness of `video`; `pets_ok` and `owner_verified` are `true` only when legacy says so;
 *   `is_owner` a boolean or `null`; `source_ref` from `original_url` or the first `sources[].url` (cards only).
 * - Ignored: `favorite`, `viewed` (they belong to nobody under a service key), the unread `usd`… keys of `08` §1.8.
 *
 * `title` is masked here as `ListingSummary::fromArray()` masks it (DEC-52), so the array a cache keeps holds no raw
 * number either; masking is idempotent.
 */
final class ListingSummaryTranslator
{
    public const string PATH = '/api/feed';

    /** The separator of legacy's composed strings (`title`, `price`, `age`). */
    private const string SEPARATOR = '/\s*·\s*/u';

    public function __construct(
        private readonly PhotoUrlRewriter $photos,
        private readonly DistrictMatcher $districts,
        private readonly int $nativeFloor,
    ) {}

    /**
     * A legacy feed page as its previews and legacy's cursor.
     *
     * @param  array<array-key, mixed>  $answer  the decoded `FeedPage`
     * @param  string|null  $city  the city of the filters, for the district codes
     * @return array{items: list<array<string, mixed>>, next_cursor: string|null}
     *
     * @throws LegacyContractError
     */
    public function page(array $answer, ?string $city = null): array
    {
        $items = LegacyValue::requiredList($answer, 'items', self::PATH);

        if (! array_key_exists('next_cursor', $answer)) {
            throw LegacyContractError::key(self::PATH, 'next_cursor', 'missing');
        }

        $cursor = $answer['next_cursor'];

        if ($cursor !== null && ! is_string($cursor)) {
            throw LegacyContractError::key(self::PATH, 'next_cursor', 'not a string or null');
        }

        $previews = [];

        foreach ($items as $index => $item) {
            if (! is_array($item)) {
                throw LegacyContractError::key(self::PATH, "items.{$index}", 'not an object');
            }

            $previews[] = $this->translate($item, $city, self::PATH, "items.{$index}.");
        }

        return ['items' => $previews, 'next_cursor' => $cursor === '' ? null : $cursor];
    }

    /**
     * @param  array<array-key, mixed>  $item  a decoded `ListingPreview`
     *
     * @throws LegacyContractError
     */
    public function toData(array $item, ?string $city = null, string $path = self::PATH): ListingSummary
    {
        return ListingSummary::fromArray($this->translate($item, $city, $path));
    }

    /**
     * The preview in the array shape of the stub fixtures, checked by `ListingSummary::fromArray()`.
     *
     * @param  array<array-key, mixed>  $item
     * @param  string  $path  the legacy path, for the error (`/api/feed`, `/api/listings/{n}`)
     * @param  string  $prefix  the dotted place of the item in the answer, for the error (`items.3.`)
     * @return array<string, mixed>
     *
     * @throws LegacyContractError
     */
    public function translate(array $item, ?string $city = null, string $path = self::PATH, string $prefix = ''): array
    {
        $number = $this->number($item, $path, $prefix);
        $photos = LegacyValue::requiredList($item, 'photos_preview', $path, $prefix);
        $preview = $this->fields($item, $number, $photos, $city);

        try {
            ListingSummary::fromArray($preview);
        } catch (InvalidArgumentException $invalid) {
            throw LegacyValue::refused($path, $invalid, $prefix);
        }

        return $preview;
    }

    /**
     * The required `id`.
     *
     * @param  array<array-key, mixed>  $item
     *
     * @throws LegacyContractError
     */
    public function number(array $item, string $path, string $prefix = ''): int
    {
        $id = Whole::of($item['id'] ?? null);

        if (! is_int($id) || $id < 1) {
            throw LegacyContractError::key($path, "{$prefix}id", 'missing or not a positive whole number');
        }

        return $id < $this->nativeFloor ? $id : throw LegacyContractError::key($path, "{$prefix}id", 'at or above the native number floor');
    }

    /**
     * The preview fields of an item or a card, its required keys already read; not checked yet.
     *
     * @param  array<array-key, mixed>  $item
     * @param  list<mixed>  $photos  the addresses of the preview photos as legacy sent them
     * @return array<string, mixed>
     */
    public function fields(array $item, int $number, array $photos, ?string $city): array
    {
        $district = LegacyValue::string($item, 'district_name');
        $metro = LegacyValue::string($item, 'metro');
        $lat = LegacyValue::number($item, 'lat');
        $lon = LegacyValue::number($item, 'lon');
        $count = LegacyValue::int($item, 'photos_count');
        $usd = PriceParser::usd($item['usd'] ?? null) ?? PriceParser::usd($item['price_usd'] ?? null);

        return [
            'number' => $number,
            'origin' => ListingOrigin::Legacy->value,
            'deal' => self::deal($item),
            'type' => null,
            'title' => PhoneMasker::mask(self::title($item)),
            'price' => PriceParser::parts(LegacyValue::string($item, 'price'), LegacyValue::string($item, 'price_kind'), $usd),
            'rooms' => LegacyValue::int($item, 'rooms'),
            'area_total' => LegacyValue::number($item, 'area_total'),
            'floor' => LegacyValue::int($item, 'floor'),
            'floors_total' => LegacyValue::int($item, 'floors_total'),
            'district' => $district === null ? null : ['code' => $this->districts->code($district, $city), 'name' => $district],
            'place' => LegacyValue::string($item, 'place'),
            'landmark' => LegacyValue::string($item, 'landmark'),
            'metro' => $metro === null ? null : ['name' => $metro, 'km' => LegacyValue::number($item, 'metro_km')],
            'center_km' => LegacyValue::number($item, 'center_km'),
            'location' => $lat === null || $lon === null ? null : ['lat' => $lat, 'lon' => $lon],
            'photos' => [
                'preview' => $this->photos->rewriteAll($photos),
                'count' => $count !== null && $count >= 0 ? $count : count($photos),
                'cover' => isset($item['cover']) ? $this->photos->rewrite($item['cover']) : null,
            ],
            'has_video' => LegacyValue::truthy($item, 'video'),
            'pets_ok' => ($item['pets_ok'] ?? null) === true,
            'is_owner' => LegacyValue::bool($item, 'is_owner'),
            'owner_verified' => ($item['owner_verified'] ?? null) === true,
            'posted' => self::posted($item),
            'status_text' => LegacyValue::string($item, 'status_text'),
            'market' => [
                'label' => LegacyValue::string($item, 'market'),
                'median_delta' => LegacyValue::number($item, 'median_delta'),
                'tone' => LegacyValue::string($item, 'median_tone'),
            ],
            'favorite' => false,
            'viewed' => false,
            'source_ref' => SourceRefParser::fromCard($item),
        ];
    }

    /** @param  array<array-key, mixed>  $item  `deal_type` when it is a deal, else `null` (an optional key) */
    private static function deal(array $item): ?string
    {
        $deal = $item['deal_type'] ?? null;

        return is_string($deal) && Deal::tryFrom($deal) !== null ? $deal : null;
    }

    /** @param  array<array-key, mixed>  $item */
    private static function title(array $item): string
    {
        $short = LegacyValue::string($item, 'short_title');

        if ($short !== null) {
            return trim($short);
        }

        $title = LegacyValue::string($item, 'title');

        return $title === null ? '' : trim((string) (preg_split(self::SEPARATOR, $title, 2) ?: [''])[0]);
    }

    /**
     * @param  array<array-key, mixed>  $item
     * @return array{label: string, when: string, at: string|null}
     */
    private static function posted(array $item): array
    {
        $age = LegacyValue::string($item, 'age');
        $parts = $age === null ? ['', ''] : array_map(trim(...), preg_split(self::SEPARATOR, $age, 2) ?: []);
        $at = LegacyValue::string($item, 'posted_at');

        return [
            'label' => (string) ($parts[0] ?? ''),
            'when' => (string) ($parts[1] ?? ''),
            'at' => $at !== null && strtotime($at) !== false ? $at : null,
        ];
    }
}
