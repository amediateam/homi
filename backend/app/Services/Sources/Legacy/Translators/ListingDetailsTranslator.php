<?php

namespace App\Services\Sources\Legacy\Translators;

use App\Enums\ContactMode;
use App\Enums\OwnerTier;
use App\Exceptions\Sources\LegacyContractError;
use App\Services\Listings\PhoneMasker;
use App\Services\Listings\PhotoUrlRewriter;
use App\Services\Sources\Data\ListingDetails;
use App\Services\Sources\Data\ListingNearby;
use InvalidArgumentException;

/**
 * A legacy `ListingDetails` (`08` §1.8, API-008) as the full card of `GET /listings/{number}` (WP-12, WP-80): the
 * preview of `ListingSummaryTranslator` plus the card's parts. Pure.
 *
 * - Required: `id`, `photos`, `facts` and `sources` (lists); `photos_preview` is optional on a card (else the
 *   preview is `photos`), and `photos_count` (else the number of `photos` sent).
 *   The `id` may differ from the number asked for: a merged duplicate answers with the surviving listing.
 * - No number of the author leaves: `phone`, `phone_display` and `call_url` are not mapped; `contact` gets
 *   `contact_url` (only an `https` link without a run of nine digits, which could be the number in a `wa.me` link)
 *   and `contact_paid`, and `has_phone: false` until WP-43 writes the contact method. `title`, `summary`,
 *   `original.text`, `offers[].text`, `price_history[].text`, `author.label` and `owner.description` are masked here,
 *   as the data objects mask them (DEC-52), so the array a cache keeps holds no raw number.
 * - `history` → `price_history` (`channel` without `@`); `owner` → `owner_label`, without a label the tier already
 *   says (BR-API-189: «Проверенный хозяин…», «Хозяин — со слов объявления» and their uz and en texts); `market_code` →
 *   `market.code`; `original_text`, `original_url`, `post_deleted` → `original`; `nearby` keeps the first `park` and the
 *   first `school`.
 * - `comparison` only when `median` is truthy and `median_value` a number: the `median_*` keys without the prefix,
 *   `has_reason` = truthiness of `median_reason`, `price_usd` and `price_per_m2` from the card.
 * - The owner part (WP-80): `owner.tier` is `self` with `owner_self`, `verified` with `owner_verified`, `claimed` with
 *   `is_owner` alone, else `null`; `contact.mode` `open` → `phone`, `gate` → `phone` with a phone, else `hidden` while
 *   the relay is off (DEC-75; WP-87 passes `relay: true`, then `request`). `owner_mine`, `owner_listing_id`,
 *   `my_request` and `owner_entry` belong to nobody under a service key and are ignored: `mine`, `listing_id`,
 *   `contact.request` and `entry` are per user and written by the overlay (DEC-94), never cached.
 * - A card with only the required keys gives `null` or the empty value everywhere else: `stats` `0`, `0`, `0` and
 *   `views: null`, `title` and `posted` `''`, every flag `false`.
 */
final class ListingDetailsTranslator
{
    public const string PATH = '/api/listings/{n}';

    /** Labels that only repeat the owner tier (BR-API-189), in the three languages legacy formats them in. */
    public const array TIER_LABELS = [
        'Проверенный хозяин', 'Хозяин — со слов объявления',
        'Tasdiqlangan uy egasi', 'Uy egasi — eʼlonga koʻra',
        'Verified owner', 'Owner — per the listing',
    ];

    private readonly ListingSummaryTranslator $summary;

    /**
     * @param  int  $nativeFloor  the first number of HOMI's own listings (`ListingNumber::floor()`)
     * @param  bool  $relay  whether a `gate` listing takes requests (WP-87, DEC-75); off until then
     */
    public function __construct(
        private readonly PhotoUrlRewriter $photos,
        DistrictMatcher $districts,
        int $nativeFloor,
        private readonly bool $relay = false,
    ) {
        $this->summary = new ListingSummaryTranslator($photos, $districts, $nativeFloor);
    }

    /**
     * @param  array<array-key, mixed>  $card  the decoded legacy card
     *
     * @throws LegacyContractError
     */
    public function toData(array $card): ListingDetails
    {
        return ListingDetails::fromArray($this->translate($card));
    }

    /**
     * The card in the array shape of the stub catalogue (`resources/fixtures/v1/listings/catalog.json`, without its
     * `stub` part), checked by `ListingDetails::fromArray()`.
     *
     * @param  array<array-key, mixed>  $card
     * @return array<string, mixed>
     *
     * @throws LegacyContractError
     */
    public function translate(array $card): array
    {
        $number = $this->summary->number($card, self::PATH);
        $photos = LegacyValue::requiredList($card, 'photos', self::PATH);
        $facts = LegacyValue::requiredList($card, 'facts', self::PATH);
        $sources = LegacyValue::requiredList($card, 'sources', self::PATH);
        $ownPreview = is_array($card['photos_preview'] ?? null) && array_is_list($card['photos_preview']);
        $preview = $this->summary->fields($card, $number, $ownPreview ? $card['photos_preview'] : [], null);
        $items = $this->photos->rewriteAll($photos);
        $count = LegacyValue::int($card, 'photos_count');
        $preview['photos'] = [
            'preview' => $ownPreview ? $preview['photos']['preview'] : $items,
            'count' => $count !== null && $count >= 0 ? $count : count($photos),
            'cover' => $preview['photos']['cover'],
            'items' => $items,
        ];
        $preview['market'] = ['label' => $preview['market']['label'], 'code' => LegacyValue::string($card, 'market_code')] + $preview['market'];

        $details = $preview + [
            'facts' => self::facts($facts),
            'nearby' => self::nearby($card),
            'stats' => self::stats($card),
            'price_history' => self::history($card),
            'geo_radius_m' => LegacyValue::int($card, 'geo_radius_m'),
            'author' => self::author($card),
            'owner_label' => self::ownerLabel($card),
            'contact' => [
                'has_phone' => false,
                'contact_url' => self::safeLink(LegacyValue::string($card, 'contact_url')),
                'contact_paid' => ($card['contact_paid'] ?? null) === true,
                'mode' => $this->mode($card),
                'request' => null,
            ],
            'summary' => self::masked(LegacyValue::string($card, 'summary')),
            'offers' => self::offers($card),
            'original' => [
                'text' => self::masked(LegacyValue::string($card, 'original_text')),
                'url' => LegacyValue::string($card, 'original_url'),
                'deleted' => ($card['post_deleted'] ?? null) === true,
            ],
            'sources' => self::sources($sources),
            'comparison' => self::comparison($card),
            'owner' => [
                'tier' => self::tier($card),
                'mine' => false,
                'listing_id' => null,
                'response_minutes' => LegacyValue::int($card, 'response_minutes'),
                'description' => self::masked(LegacyValue::string($card, 'owner_description')),
            ],
        ];

        try {
            ListingDetails::fromArray($details);
        } catch (InvalidArgumentException $invalid) {
            throw LegacyValue::refused(self::PATH, $invalid);
        }

        return $details;
    }

    /** @param  array<array-key, mixed>  $card */
    private function mode(array $card): ?string
    {
        return match ($card['contact_mode'] ?? null) {
            'open' => ContactMode::Phone->value,
            'gate' => LegacyValue::string($card, 'phone') !== null ? ContactMode::Phone->value : ($this->relay ? ContactMode::Request->value : ContactMode::Hidden->value),
            default => null,
        };
    }

    /** @param  array<array-key, mixed>  $card */
    private static function tier(array $card): ?string
    {
        return match (true) {
            ($card['owner_self'] ?? null) === true => OwnerTier::Self->value,
            ($card['owner_verified'] ?? null) === true => OwnerTier::Verified->value,
            ($card['is_owner'] ?? null) === true => OwnerTier::Claimed->value,
            default => null,
        };
    }

    /** @param  array<array-key, mixed>  $card */
    private static function ownerLabel(array $card): ?string
    {
        $label = LegacyValue::string($card, 'owner');

        foreach (self::TIER_LABELS as $tier) {
            if ($label !== null && str_starts_with(trim($label), $tier)) {
                return null;
            }
        }

        return $label;
    }

    /**
     * @param  list<mixed>  $facts
     * @return list<array<array-key, mixed>>
     */
    private static function facts(array $facts): array
    {
        $unique = [];

        foreach ($facts as $index => $fact) {
            if (! is_array($fact)) {
                throw LegacyContractError::key(self::PATH, "facts.{$index}", 'not an object');
            }

            $value = $fact['value'] ?? null;
            $fact = ['key' => $fact['key'] ?? null, 'label' => $fact['label'] ?? null, 'value' => is_int($value) || is_float($value) ? (string) $value : $value];
            $key = is_string($fact['key']) ? $fact['key'] : "#{$index}";
            $unique[$key] ??= $fact;
        }

        return array_values($unique);
    }

    /**
     * @param  array<array-key, mixed>  $card
     * @return list<array<string, mixed>>
     */
    private static function nearby(array $card): array
    {
        $nearby = [];

        foreach (LegacyValue::objects($card, 'nearby', self::PATH) as $place) {
            $kind = $place['kind'] ?? null;

            if (is_string($kind) && in_array($kind, ListingNearby::KINDS, true) && ! isset($nearby[$kind])) {
                $nearby[$kind] = ['kind' => $kind, 'name' => $place['name'] ?? null, 'km' => LegacyValue::number($place, 'km'), 'note' => LegacyValue::string($place, 'note')];
            }
        }

        return array_values($nearby);
    }

    /**
     * @param  array<array-key, mixed>  $card
     * @return array{days_listed: int, publications: int, channels: int, views: int|null}
     */
    private static function stats(array $card): array
    {
        $stats = is_array($card['stats'] ?? null) ? $card['stats'] : [];

        return [
            'days_listed' => LegacyValue::int($stats, 'days_listed') ?? 0,
            'publications' => LegacyValue::int($stats, 'publications') ?? 0,
            'channels' => LegacyValue::int($stats, 'channels') ?? 0,
            'views' => LegacyValue::int($stats, 'views'),
        ];
    }

    /**
     * @param  array<array-key, mixed>  $card
     * @return list<array<string, mixed>>
     */
    private static function history(array $card): array
    {
        return array_map(fn (array $event): array => [
            'at' => $event['at'] ?? null,
            'channel' => ($channel = LegacyValue::string($event, 'channel')) === null ? null : ltrim($channel, '@'),
            'url' => LegacyValue::string($event, 'url'),
            'text' => self::masked(LegacyValue::string($event, 'text')),
            'kind' => LegacyValue::string($event, 'kind'),
            'price_usd' => PriceParser::usd($event['price_usd'] ?? null),
            'change_pct' => LegacyValue::number($event, 'change_pct'),
        ], LegacyValue::objects($card, 'history', self::PATH));
    }

    /**
     * @param  array<array-key, mixed>  $card
     * @return array<string, mixed>|null
     */
    private static function author(array $card): ?array
    {
        $author = $card['author'] ?? null;

        if ($author === null) {
            return null;
        }

        if (! is_array($author)) {
            throw LegacyContractError::key(self::PATH, 'author', 'not an object or null');
        }

        $label = $author['label'] ?? null;

        return [
            'kind' => $author['kind'] ?? null,
            'label' => is_string($label) ? PhoneMasker::mask($label) : $label,
            'count' => LegacyValue::int($author, 'count') ?? 0,
        ];
    }

    /**
     * @param  array<array-key, mixed>  $card
     * @return list<array<string, mixed>>
     */
    private static function offers(array $card): array
    {
        return array_map(fn (array $offer): array => [
            'text' => is_string($offer['text'] ?? null) ? PhoneMasker::mask($offer['text']) : ($offer['text'] ?? null),
            'url' => self::safeLink(LegacyValue::string($offer, 'url')),
        ], LegacyValue::objects($card, 'offers', self::PATH));
    }

    /**
     * @param  list<mixed>  $sources
     * @return list<array<string, mixed>>
     */
    private static function sources(array $sources): array
    {
        $links = [];

        foreach ($sources as $index => $source) {
            if (! is_array($source)) {
                throw LegacyContractError::key(self::PATH, "sources.{$index}", 'not an object');
            }

            $handle = $source['handle'] ?? null;
            $links[] = ['handle' => is_string($handle) ? ltrim($handle, '@') : $handle, 'url' => $source['url'] ?? null];
        }

        return $links;
    }

    /**
     * @param  array<array-key, mixed>  $card
     * @return array<string, mixed>|null
     */
    private static function comparison(array $card): ?array
    {
        $value = LegacyValue::number($card, 'median_value');

        if (! LegacyValue::truthy($card, 'median') || $value === null) {
            return null;
        }

        return [
            'value' => $value,
            'own' => LegacyValue::number($card, 'median_own'),
            'n' => LegacyValue::int($card, 'median_n'),
            'metric' => LegacyValue::string($card, 'median_metric'),
            'scope' => LegacyValue::string($card, 'median_scope'),
            'rooms' => LegacyValue::int($card, 'median_rooms'),
            'near_class' => LegacyValue::string($card, 'median_near_class'),
            'radius_km' => LegacyValue::number($card, 'median_radius_km'),
            'district' => LegacyValue::string($card, 'median_district'),
            'place_value' => LegacyValue::number($card, 'median_place_value'),
            'note' => LegacyValue::string($card, 'median_note'),
            'updated' => LegacyValue::string($card, 'median_updated'),
            'has_reason' => LegacyValue::truthy($card, 'median_reason'),
            'price_usd' => PriceParser::usd($card['price_usd'] ?? null),
            'price_per_m2' => LegacyValue::number($card, 'price_per_m2'),
        ];
    }

    /** A link the author wrote, only over `https` and without a run of nine digits (a phone number in a `wa.me` link). */
    private static function safeLink(?string $url): ?string
    {
        return $url !== null && preg_match('~^https://\S+$~i', $url) === 1 && preg_match('/\d{9,}/', $url) !== 1 ? $url : null;
    }

    private static function masked(?string $text): ?string
    {
        return $text === null ? null : PhoneMasker::mask($text);
    }
}
