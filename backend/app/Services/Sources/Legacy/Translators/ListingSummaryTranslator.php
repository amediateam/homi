<?php

namespace App\Services\Sources\Legacy\Translators;

use App\Enums\Deal;
use App\Enums\ListingOrigin;
use App\Enums\PriceKind;
use App\Exceptions\Sources\LegacyContractError;
use App\Services\Listings\PhoneMasker;
use App\Services\Listings\PhotoUrlRewriter;
use App\Services\Sources\Data\ListingSummary;
use App\Services\Sources\Legacy\LegacyFeedCursor;
use DateTimeImmutable;
use Exception;
use InvalidArgumentException;

/**
 * A legacy `ListingPreview` (`08` §1.8) as a listing preview (WP-12), and a `FeedPage` as its items and cursor. Pure:
 * the photo rewriter, the district matcher and the native floor are given, so the unit suite tests it without the
 * application.
 *
 * - Required: `id` (a whole number ≥ 1 below the native floor; a collision with a HOMI number is never served) and
 *   `photos_preview` (a list); of a page `items` (a list) and the key `next_cursor` (a string of at most
 *   `LegacyFeedCursor::MAX_LEGACY_BYTES` bytes, or `null`; an empty string ends the list like `null` and is noted).
 * - `title` = `short_title`, else the part of `title` before « · », else `''`; `price` through `PriceParser` with
 *   `usd`, else `price_usd`; `deal` ← `deal_type` when it is a deal (cards only; `null` on previews and for another
 *   value); `type` is always `null` (legacy sends no type code).
 * - `posted`: `label` and `when` are the parts of `age` around its first « · » (one part is the `label`, as legacy
 *   showed it; no `age` is `''` twice); `at` ← `posted_at` when it is an ISO 8601 time with a zone (`Z` or an offset),
 *   written as `DATE_ATOM` in that zone; anything else is `null`.
 * - `floor` keeps `0` and negative values; only a missing or `null` floor is `null`. `metro.km`, `center_km`, `lat` and
 *   `lon` are numbers or `null`; `location` needs both coordinates. `district.code` through `DistrictMatcher`.
 * - `photos`: the rewritten `photos_preview` and `cover`; `count` ← `photos_count`, else the number of addresses sent,
 *   less the addresses the rewriter dropped (they can never be shown), and `0` without a media base.
 * - `has_video` = truthiness of `video`; `pets_ok` and `owner_verified` are `true` only when legacy says so;
 *   `is_owner` a boolean or `null`; `source_ref` from `original_url` or the first `sources[].url` that `LinkGuard`
 *   keeps (cards only).
 * - Ignored: `favorite`, `viewed` (they belong to nobody under a service key), the unread `photos_total`, `tone`,
 *   `label`, `priced` of `08` §1.8.
 *
 * Every optional key present with a value HOMI cannot use (another type, a fraction where a whole number belongs, an
 * unknown `deal_type` or `price_kind`, a `posted_at` without a zone) reads as its empty value and is noted in the
 * `Coercions` of the answer, under its place (`items.3.floor`).
 *
 * `title` is masked here as `ListingSummary::fromArray()` masks it (DEC-52), so the array a cache keeps holds no raw
 * number either; masking is idempotent.
 */
final class ListingSummaryTranslator
{
    public const string PATH = '/api/feed';

    /** The separator of legacy's composed strings (`title`, `price`, `age`). */
    private const string SEPARATOR = '/\s*·\s*/u';

    /** An ISO 8601 time with a zone: date, `T`, hours and minutes, optional seconds and fraction, `Z` or an offset. */
    private const string POSTED_AT = '/^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,6})?)?(?:Z|[+-](?:0\d|1[0-4]):?[0-5]\d)$/D';

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
     * @param  Coercions|null  $seen  collects the keys whose values could not be used as sent
     * @return array{items: list<array<string, mixed>>, next_cursor: string|null}
     *
     * @throws LegacyContractError
     */
    public function page(array $answer, ?string $city = null, ?Coercions $seen = null): array
    {
        $items = LegacyValue::requiredList($answer, 'items', self::PATH);

        if (! array_key_exists('next_cursor', $answer)) {
            throw LegacyContractError::key(self::PATH, 'next_cursor', 'missing');
        }

        $cursor = $answer['next_cursor'];

        if ($cursor !== null && ! is_string($cursor)) {
            throw LegacyContractError::key(self::PATH, 'next_cursor', 'not a string or null');
        }

        if (is_string($cursor) && strlen($cursor) > LegacyFeedCursor::MAX_LEGACY_BYTES) {
            throw LegacyContractError::key(self::PATH, 'next_cursor', 'longer than '.LegacyFeedCursor::MAX_LEGACY_BYTES.' bytes');
        }

        if ($cursor === '') {
            $seen?->note('next_cursor');
        }

        $previews = [];

        foreach ($items as $index => $item) {
            if (! is_array($item)) {
                throw LegacyContractError::key(self::PATH, "items.{$index}", 'not an object');
            }

            $previews[] = $this->translate($item, $city, self::PATH, "items.{$index}.", $seen);
        }

        return ['items' => $previews, 'next_cursor' => $cursor === '' ? null : $cursor];
    }

    /**
     * @param  array<array-key, mixed>  $item  a decoded `ListingPreview`
     *
     * @throws LegacyContractError
     */
    public function toData(array $item, ?string $city = null, string $path = self::PATH, ?Coercions $seen = null): ListingSummary
    {
        return ListingSummary::fromArray($this->translate($item, $city, $path, '', $seen));
    }

    /**
     * The preview in the array shape of the stub fixtures, checked by `ListingSummary::fromArray()`.
     *
     * @param  array<array-key, mixed>  $item
     * @param  string  $path  the legacy path, for the error (`/api/feed`, `/api/listings/{n}`)
     * @param  string  $prefix  the dotted place of the item in the answer, for the error and the notes (`items.3.`)
     * @return array<string, mixed>
     *
     * @throws LegacyContractError
     */
    public function translate(array $item, ?string $city = null, string $path = self::PATH, string $prefix = '', ?Coercions $seen = null): array
    {
        $number = $this->number($item, $path, $prefix);
        $photos = LegacyValue::requiredList($item, 'photos_preview', $path, $prefix);
        $preview = $this->fields($item, $number, $photos, $city, $seen?->at($prefix));

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
     * @param  Coercions|null  $seen  the notes of the item, already placed (`items.3.`)
     * @return array<string, mixed>
     */
    public function fields(array $item, int $number, array $photos, ?string $city, ?Coercions $seen = null): array
    {
        $district = LegacyValue::string($item, 'district_name', $seen);
        $metro = LegacyValue::string($item, 'metro', $seen);
        $lat = LegacyValue::number($item, 'lat', $seen);
        $lon = LegacyValue::number($item, 'lon', $seen);
        $kind = LegacyValue::string($item, 'price_kind', $seen);
        $usd = PriceParser::usdOf($item, 'usd', $seen) ?? PriceParser::usdOf($item, 'price_usd', $seen);
        $preview = $this->photos->rewriteAll($photos);

        if ($kind !== null && PriceKind::tryFrom($kind) === null) {
            $seen?->note('price_kind');
        }

        return [
            'number' => $number,
            'origin' => ListingOrigin::Legacy->value,
            'deal' => self::deal($item, $seen),
            'type' => null,
            'title' => PhoneMasker::mask(self::title($item, $seen)),
            'price' => PriceParser::parts(LegacyValue::string($item, 'price', $seen), $kind, $usd),
            'rooms' => LegacyValue::count($item, 'rooms', $seen),
            'area_total' => LegacyValue::number($item, 'area_total', $seen),
            'floor' => LegacyValue::int($item, 'floor', $seen),
            'floors_total' => LegacyValue::count($item, 'floors_total', $seen),
            'district' => $district === null ? null : ['code' => $this->districts->code($district, $city), 'name' => $district],
            'place' => LegacyValue::string($item, 'place', $seen),
            'landmark' => LegacyValue::string($item, 'landmark', $seen),
            'metro' => $metro === null ? null : ['name' => $metro, 'km' => LegacyValue::number($item, 'metro_km', $seen)],
            'center_km' => LegacyValue::number($item, 'center_km', $seen),
            'location' => $lat === null || $lon === null ? null : ['lat' => $lat, 'lon' => $lon],
            'photos' => [
                'preview' => $preview,
                'count' => $this->photoCount($item, count($photos), count($preview), $seen),
                'cover' => isset($item['cover']) ? $this->photos->rewrite($item['cover']) : null,
            ],
            'has_video' => LegacyValue::truthy($item, 'video'),
            'pets_ok' => LegacyValue::flag($item, 'pets_ok', $seen),
            'is_owner' => LegacyValue::bool($item, 'is_owner', $seen),
            'owner_verified' => LegacyValue::flag($item, 'owner_verified', $seen),
            'posted' => self::posted($item, $seen),
            'status_text' => LegacyValue::string($item, 'status_text', $seen),
            'market' => [
                'label' => LegacyValue::string($item, 'market', $seen),
                'median_delta' => LegacyValue::number($item, 'median_delta', $seen),
                'tone' => LegacyValue::string($item, 'median_tone', $seen),
            ],
            'favorite' => false,
            'viewed' => false,
            'source_ref' => SourceRefParser::fromCard($item),
        ];
    }

    /**
     * The photo count of a preview: legacy's `photos_count` (else the addresses sent) less the addresses the rewriter
     * dropped, never below the addresses kept; `0` without a media base, where every list is empty.
     *
     * @param  array<array-key, mixed>  $item
     */
    private function photoCount(array $item, int $sent, int $kept, ?Coercions $seen): int
    {
        $count = LegacyValue::count($item, 'photos_count', $seen) ?? $sent;

        return $this->photos->isConfigured() ? max($kept, $count - ($sent - $kept)) : 0;
    }

    /** @param  array<array-key, mixed>  $item  `deal_type` when it is a deal, else `null` (an optional key; another value is noted) */
    private static function deal(array $item, ?Coercions $seen): ?string
    {
        $deal = $item['deal_type'] ?? null;

        if ($deal !== null && (! is_string($deal) || Deal::tryFrom($deal) === null)) {
            $seen?->note('deal_type');

            return null;
        }

        return $deal;
    }

    /** @param  array<array-key, mixed>  $item */
    private static function title(array $item, ?Coercions $seen): string
    {
        $short = LegacyValue::string($item, 'short_title', $seen);
        $title = LegacyValue::string($item, 'title', $seen);

        if ($short !== null) {
            return trim($short);
        }

        return $title === null ? '' : trim((string) (preg_split(self::SEPARATOR, $title, 2) ?: [''])[0]);
    }

    /**
     * @param  array<array-key, mixed>  $item
     * @return array{label: string, when: string, at: string|null}
     */
    private static function posted(array $item, ?Coercions $seen): array
    {
        $age = LegacyValue::string($item, 'age', $seen);
        $parts = $age === null ? ['', ''] : array_map(trim(...), preg_split(self::SEPARATOR, $age, 2) ?: []);
        $at = LegacyValue::string($item, 'posted_at', $seen);
        $time = $at === null ? null : self::postedAt(trim($at));

        if ($at !== null && $time === null) {
            $seen?->note('posted_at');
        }

        return [
            'label' => (string) ($parts[0] ?? ''),
            'when' => (string) ($parts[1] ?? ''),
            'at' => $time,
        ];
    }

    /** An ISO 8601 time with a zone as `DATE_ATOM` in that zone; `null` for anything else (a date alone, no zone, `tomorrow`). */
    private static function postedAt(string $at): ?string
    {
        if (preg_match(self::POSTED_AT, $at, $date) !== 1 || ! checkdate((int) $date[2], (int) $date[3], (int) $date[1])) {
            return null;
        }

        try {
            return (new DateTimeImmutable($at))->format(DATE_ATOM);
        } catch (Exception) {
            return null;
        }
    }
}
