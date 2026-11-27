<?php

namespace App\Services\Sources\Legacy\Translators;

use App\Enums\ContactMode;
use App\Enums\OwnerTier;
use App\Exceptions\Sources\LegacyContractError;
use App\Services\Listings\LinkGuard;
use App\Services\Listings\PhoneMasker;
use App\Services\Listings\PhotoUrlRewriter;
use App\Services\Sources\Data\ListingDetails;
use App\Services\Sources\Data\ListingFact;
use App\Services\Sources\Data\ListingNearby;
use App\Services\Sources\Data\ListingOffer;
use App\Services\Sources\Data\ListingSourceLink;
use App\Services\Sources\Data\PriceEvent;
use InvalidArgumentException;

/**
 * A legacy `ListingDetails` (`08` §1.8, API-008) as the full card of `GET /listings/{number}` (WP-12, WP-80): the
 * preview of `ListingSummaryTranslator` plus the card's parts. Pure.
 *
 * - Required: `id`, `photos`, `facts` and `sources` (lists); `photos_preview` is optional on a card (else the
 *   preview is `photos`). `photos.count` is `photos_count` (else the number of `photos` sent), at most the addresses
 *   kept in `items`, and `0` without a media base. The `id` may differ from the number asked for: a merged duplicate
 *   answers with the surviving listing.
 * - Strict only there (and in the preview's `id` and `photos_preview`): an item of `facts`, `sources`, `nearby`,
 *   `history` or `offers` that does not fit its data object is left out, `stats` and `author` values that do not fit
 *   are their defaults (`0`, `null`), and an optional list that is not one is `[]` — each noted in the answer's
 *   `Coercions` under its place (`history.0.at`, `stats.days_listed`), so one bad part never fails a card.
 * - No number of the author leaves: `phone`, `phone_display` and `call_url` are not mapped; `contact` gets
 *   `contact_url` and `contact_paid`, and `has_phone: false` until WP-43 writes the contact method. The links
 *   `contact_url`, `offers[].url`, `original.url`, `sources[].url` and `history[].url` pass `LinkGuard` (an
 *   `https` link that cannot carry a phone number, else `null`; a source whose link is dropped is left out).
 *   `title`, `place`, `landmark`, `facts[].value`, `nearby[].note`, `summary`, `original.text`, `offers[].text`,
 *   `price_history[].text`, `author.label`, `owner_label` and `owner.description` are masked here, as the data objects
 *   mask them (DEC-52), so the array a cache keeps holds no raw number. Labels, directory names (district, metro, a
 *   park's name) and formatted prices are the source's own and stay as sent.
 * - A channel or author name that could be a phone number (nine digits or more, `LinkGuard::safeName()`) is never
 *   shown: a `history[].channel` is `null`, a `sources[]` item with such a `handle` is left out, each noted.
 * - `history` → `price_history` (`channel` without `@`); `owner` → `owner_label`, without a label the tier already
 *   says (BR-API-189: «Проверенный хозяин…», «Хозяин — со слов объявления» and their uz and en texts); `market_code` →
 *   `market.code`; `original_text`, `original_url`, `post_deleted` → `original`; `nearby` keeps the first `park` and the
 *   first `school` (another kind is noted).
 * - `comparison` only when `median` is truthy and `median_value` a number: the `median_*` keys without the prefix,
 *   `has_reason` = truthiness of `median_reason`, `price_usd` and `price_per_m2` from the card.
 * - The owner part (WP-80): `owner.tier` is `self` with `owner_self`, `verified` with `owner_verified`, `claimed` with
 *   `is_owner` alone, else `null`; `contact.mode` `open` → `phone`, `gate` → `phone` with a phone, else `hidden` while
 *   the relay is off (DEC-75; WP-87 passes `relay: true`, then `request`); another mode is `null` and noted.
 *   `owner_mine`, `owner_listing_id`, `my_request` and `owner_entry` belong to nobody under a service key and are
 *   ignored: `mine`, `listing_id`, `contact.request` and `entry` are per user and written by the overlay (DEC-94),
 *   never cached.
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
    public function toData(array $card, ?Coercions $seen = null): ListingDetails
    {
        return ListingDetails::fromArray($this->translate($card, $seen));
    }

    /**
     * The card in the array shape of the stub catalogue (`resources/fixtures/v1/listings/catalog.json`, without its
     * `stub` part), checked by `ListingDetails::fromArray()`.
     *
     * @param  array<array-key, mixed>  $card
     * @param  Coercions|null  $seen  collects the keys whose values could not be used as sent
     * @return array<string, mixed>
     *
     * @throws LegacyContractError
     */
    public function translate(array $card, ?Coercions $seen = null): array
    {
        $number = $this->summary->number($card, self::PATH);
        $photos = LegacyValue::requiredList($card, 'photos', self::PATH);
        $facts = LegacyValue::requiredList($card, 'facts', self::PATH);
        $sources = LegacyValue::requiredList($card, 'sources', self::PATH);
        $ownPreview = is_array($card['photos_preview'] ?? null) && array_is_list($card['photos_preview']);

        if (! $ownPreview && ($card['photos_preview'] ?? null) !== null) {
            $seen?->note('photos_preview');
        }

        $preview = $this->summary->fields($card, $number, $ownPreview ? $card['photos_preview'] : [], null, $seen);
        $items = $this->photos->rewriteAll($photos);
        $total = LegacyValue::count($card, 'photos_count') ?? count($photos);
        $preview['photos'] = [
            'preview' => $ownPreview ? $preview['photos']['preview'] : $items,
            'count' => $this->photos->isConfigured() ? min($total, count($items)) : 0,
            'cover' => $preview['photos']['cover'],
            'items' => $items,
        ];
        $preview['market'] = ['label' => $preview['market']['label'], 'code' => LegacyValue::string($card, 'market_code', $seen)] + $preview['market'];

        $details = $preview + [
            'facts' => self::facts($facts, $seen),
            'nearby' => self::nearby($card, $seen),
            'stats' => self::stats($card, $seen),
            'price_history' => self::history($card, $seen),
            'geo_radius_m' => LegacyValue::count($card, 'geo_radius_m', $seen),
            'author' => self::author($card, $seen),
            'owner_label' => self::ownerLabel($card, $seen),
            'contact' => [
                'has_phone' => false,
                'contact_url' => LinkGuard::safe(LegacyValue::string($card, 'contact_url', $seen)),
                'contact_paid' => LegacyValue::flag($card, 'contact_paid', $seen),
                'mode' => $this->mode($card, $seen),
                'request' => null,
            ],
            'summary' => self::masked(LegacyValue::string($card, 'summary', $seen)),
            'offers' => self::offers($card, $seen),
            'original' => [
                'text' => self::masked(LegacyValue::string($card, 'original_text', $seen)),
                'url' => LinkGuard::safe(LegacyValue::string($card, 'original_url', $seen)),
                'deleted' => LegacyValue::flag($card, 'post_deleted', $seen),
            ],
            'sources' => self::sources($sources, $seen),
            'comparison' => self::comparison($card, $seen),
            'owner' => [
                'tier' => self::tier($card, $seen),
                'mine' => false,
                'listing_id' => null,
                'response_minutes' => LegacyValue::count($card, 'response_minutes', $seen),
                'description' => self::masked(LegacyValue::string($card, 'owner_description', $seen)),
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
    private function mode(array $card, ?Coercions $seen): ?string
    {
        $sent = $card['contact_mode'] ?? null;
        $mode = match ($sent) {
            'open' => ContactMode::Phone->value,
            'gate' => LegacyValue::string($card, 'phone') !== null ? ContactMode::Phone->value : ($this->relay ? ContactMode::Request->value : ContactMode::Hidden->value),
            default => null,
        };

        if ($sent !== null && $mode === null) {
            $seen?->note('contact_mode');
        }

        return $mode;
    }

    /** @param  array<array-key, mixed>  $card */
    private static function tier(array $card, ?Coercions $seen): ?string
    {
        return match (true) {
            LegacyValue::flag($card, 'owner_self', $seen) => OwnerTier::Self->value,
            LegacyValue::flag($card, 'owner_verified') => OwnerTier::Verified->value,
            LegacyValue::flag($card, 'is_owner') => OwnerTier::Claimed->value,
            default => null,
        };
    }

    /** @param  array<array-key, mixed>  $card  legacy's `owner` label, masked, unless the tier already says it */
    private static function ownerLabel(array $card, ?Coercions $seen): ?string
    {
        $label = LegacyValue::string($card, 'owner', $seen);

        foreach (self::TIER_LABELS as $tier) {
            if ($label !== null && str_starts_with(trim($label), $tier)) {
                return null;
            }
        }

        return self::masked($label);
    }

    /**
     * @param  list<mixed>  $facts
     * @return list<array<array-key, mixed>>
     */
    private static function facts(array $facts, ?Coercions $seen): array
    {
        $unique = [];

        foreach ($facts as $index => $fact) {
            if (! is_array($fact)) {
                $seen?->note("facts.{$index}");

                continue;
            }

            $value = $fact['value'] ?? null;
            $value = is_int($value) || is_float($value) ? (string) $value : $value;
            $fact = ['key' => $fact['key'] ?? null, 'label' => $fact['label'] ?? null, 'value' => is_string($value) ? PhoneMasker::mask($value) : $value];

            if (LegacyValue::fits(ListingFact::fromArray(...), $fact, "facts.{$index}.", $seen) && is_string($fact['key'])) {
                $unique[$fact['key']] ??= $fact;
            }
        }

        return array_values($unique);
    }

    /**
     * @param  array<array-key, mixed>  $card
     * @return list<array<string, mixed>>
     */
    private static function nearby(array $card, ?Coercions $seen): array
    {
        $nearby = [];

        foreach (LegacyValue::objects($card, 'nearby', $seen) as $index => $place) {
            $kind = $place['kind'] ?? null;
            $at = $seen?->at("nearby.{$index}.");

            if (! is_string($kind) || ! in_array($kind, ListingNearby::KINDS, true)) {
                $at?->note('kind');

                continue;
            }

            $entry = ['kind' => $kind, 'name' => $place['name'] ?? null, 'km' => LegacyValue::number($place, 'km', $at), 'note' => self::masked(LegacyValue::string($place, 'note', $at))];

            if (! isset($nearby[$kind]) && LegacyValue::fits(ListingNearby::fromArray(...), $entry, "nearby.{$index}.", $seen)) {
                $nearby[$kind] = $entry;
            }
        }

        return array_values($nearby);
    }

    /**
     * @param  array<array-key, mixed>  $card
     * @return array{days_listed: int, publications: int, channels: int, views: int|null}
     */
    private static function stats(array $card, ?Coercions $seen): array
    {
        $stats = $card['stats'] ?? null;

        if ($stats !== null && ! is_array($stats)) {
            $seen?->note('stats');
        }

        $stats = is_array($stats) ? $stats : [];
        $at = $seen?->at('stats.');

        return [
            'days_listed' => LegacyValue::count($stats, 'days_listed', $at) ?? 0,
            'publications' => LegacyValue::count($stats, 'publications', $at) ?? 0,
            'channels' => LegacyValue::count($stats, 'channels', $at) ?? 0,
            'views' => LegacyValue::count($stats, 'views', $at),
        ];
    }

    /**
     * @param  array<array-key, mixed>  $card
     * @return list<array<string, mixed>>
     */
    private static function history(array $card, ?Coercions $seen): array
    {
        $events = [];

        foreach (LegacyValue::objects($card, 'history', $seen) as $index => $event) {
            $at = $seen?->at("history.{$index}.");
            $channel = self::name(LegacyValue::string($event, 'channel', $at), 'channel', $at);
            $entry = [
                'at' => $event['at'] ?? null,
                'channel' => $channel === null ? null : ltrim($channel, '@'),
                'url' => LinkGuard::safe(LegacyValue::string($event, 'url', $at)),
                'text' => self::masked(LegacyValue::string($event, 'text', $at)),
                'kind' => LegacyValue::string($event, 'kind', $at),
                'price_usd' => PriceParser::usdOf($event, 'price_usd', $at),
                'change_pct' => LegacyValue::number($event, 'change_pct', $at),
            ];

            if (LegacyValue::fits(PriceEvent::fromArray(...), $entry, "history.{$index}.", $seen)) {
                $events[] = $entry;
            }
        }

        return $events;
    }

    /**
     * @param  array<array-key, mixed>  $card
     * @return array<string, mixed>|null
     */
    private static function author(array $card, ?Coercions $seen): ?array
    {
        $author = $card['author'] ?? null;

        if ($author === null) {
            return null;
        }

        if (! is_array($author)) {
            $seen?->note('author');

            return null;
        }

        foreach (['kind', 'label'] as $key) {
            if (! is_string($author[$key] ?? null)) {
                $seen?->note("author.{$key}");

                return null;
            }
        }

        return [
            'kind' => $author['kind'],
            'label' => PhoneMasker::mask($author['label']),
            'count' => LegacyValue::count($author, 'count', $seen?->at('author.')) ?? 0,
        ];
    }

    /**
     * @param  array<array-key, mixed>  $card
     * @return list<array<string, mixed>>
     */
    private static function offers(array $card, ?Coercions $seen): array
    {
        $offers = [];

        foreach (LegacyValue::objects($card, 'offers', $seen) as $index => $offer) {
            $text = $offer['text'] ?? null;
            $entry = [
                'text' => is_string($text) ? PhoneMasker::mask($text) : $text,
                'url' => LinkGuard::safe(LegacyValue::string($offer, 'url', $seen?->at("offers.{$index}."))),
            ];

            if (LegacyValue::fits(ListingOffer::fromArray(...), $entry, "offers.{$index}.", $seen)) {
                $offers[] = $entry;
            }
        }

        return $offers;
    }

    /**
     * The source links whose items fit and whose link the card may carry (`LinkGuard`); a dropped link drops its item.
     *
     * @param  list<mixed>  $sources
     * @return list<array<string, mixed>>
     */
    private static function sources(array $sources, ?Coercions $seen): array
    {
        $links = [];

        foreach ($sources as $index => $source) {
            if (! is_array($source)) {
                $seen?->note("sources.{$index}");

                continue;
            }

            $handle = $source['handle'] ?? null;
            $link = ['handle' => is_string($handle) ? ltrim($handle, '@') : $handle, 'url' => $source['url'] ?? null];

            if (LegacyValue::fits(ListingSourceLink::fromArray(...), $link, "sources.{$index}.", $seen) && is_string($link['url'])) {
                $url = LinkGuard::safe($link['url']);

                if ($url !== null && self::name($link['handle'], 'handle', $seen?->at("sources.{$index}.")) !== null) {
                    $links[] = ['handle' => $link['handle'], 'url' => $url];
                }
            }
        }

        return $links;
    }

    /**
     * @param  array<array-key, mixed>  $card
     * @return array<string, mixed>|null
     */
    private static function comparison(array $card, ?Coercions $seen): ?array
    {
        $value = LegacyValue::number($card, 'median_value', $seen);

        if (! LegacyValue::truthy($card, 'median') || $value === null) {
            return null;
        }

        return [
            'value' => $value,
            'own' => LegacyValue::number($card, 'median_own', $seen),
            'n' => LegacyValue::count($card, 'median_n', $seen),
            'metric' => LegacyValue::string($card, 'median_metric', $seen),
            'scope' => LegacyValue::string($card, 'median_scope', $seen),
            'rooms' => LegacyValue::count($card, 'median_rooms', $seen),
            'near_class' => LegacyValue::string($card, 'median_near_class', $seen),
            'radius_km' => LegacyValue::number($card, 'median_radius_km', $seen),
            'district' => LegacyValue::string($card, 'median_district', $seen),
            'place_value' => LegacyValue::number($card, 'median_place_value', $seen),
            'note' => LegacyValue::string($card, 'median_note', $seen),
            'updated' => LegacyValue::string($card, 'median_updated', $seen),
            'has_reason' => LegacyValue::truthy($card, 'median_reason'),
            'price_usd' => PriceParser::usdOf($card, 'price_usd', $seen),
            'price_per_m2' => LegacyValue::number($card, 'price_per_m2', $seen),
        ];
    }

    /** A channel or author name the card may show (`LinkGuard::safeName()`); one it may not is `null` and noted. */
    private static function name(mixed $name, string $key, ?Coercions $seen): ?string
    {
        if (! is_string($name)) {
            return null;
        }

        $safe = LinkGuard::safeName($name);

        if ($safe === null) {
            $seen?->note($key);
        }

        return $safe;
    }

    private static function masked(?string $text): ?string
    {
        return $text === null ? null : PhoneMasker::mask($text);
    }
}
