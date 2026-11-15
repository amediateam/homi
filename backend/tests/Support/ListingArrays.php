<?php

namespace Tests\Support;

/** Listing arrays in the shape of the stub fixtures (WP-12), for the data-object tests. */
final class ListingArrays
{
    /**
     * @param  array<string, mixed>  $overrides
     * @return array<string, mixed>
     */
    public static function preview(array $overrides = []): array
    {
        return [
            'number' => 100012, 'deal' => 'rent_long', 'type' => 'apartment', 'title' => '2-комн. квартира, 54 м²',
            'price' => ['display' => '$600', 'period' => '/мес', 'alt' => '≈ 7,7 млн сум', 'notes' => ['депозит $600'], 'usd' => 600, 'kind' => null],
            'rooms' => 2, 'area_total' => 54, 'floor' => 3, 'floors_total' => 9,
            'district' => ['code' => 'yunusobod', 'name' => 'Юнусабадский'], 'place' => null, 'landmark' => 'Мегапланет',
            'metro' => ['name' => 'Минор', 'km' => 0.7], 'center_km' => 4.2, 'location' => ['lat' => 41.35012, 'lon' => 69.28431],
            'photos' => ['preview' => ['https://cdn.homi.loc/stub/100012/1.jpg?e=0&s=stub'], 'count' => 8, 'cover' => null],
            'has_video' => false, 'pets_ok' => false, 'is_owner' => true, 'owner_verified' => false,
            'posted' => ['label' => 'Опубликовано', 'when' => 'вчера', 'at' => '2026-11-13T08:10:00+00:00'],
            'status_text' => null, 'market' => ['label' => null, 'median_delta' => -0.12, 'tone' => 'good'],
            'favorite' => false, 'viewed' => false, 'source_ref' => ['channel' => 'stub_channel_a', 'post_id' => 4812],
            ...$overrides,
        ];
    }

    /**
     * @param  array<string, mixed>  $overrides
     * @return array<string, mixed>
     */
    public static function details(array $overrides = []): array
    {
        $preview = self::preview();

        return [
            ...$preview,
            'photos' => [...$preview['photos'], 'items' => ['https://cdn.homi.loc/stub/100012/1.jpg?e=0&s=stub']],
            'market' => ['label' => 'Вторичка', 'code' => 'secondary', 'median_delta' => -0.12, 'tone' => 'good'],
            'facts' => [['key' => 'rooms', 'label' => 'Комнат', 'value' => '2']],
            'nearby' => [['kind' => 'park', 'name' => 'Парк', 'km' => 0.4, 'note' => null]],
            'stats' => ['days_listed' => 3, 'publications' => 2, 'channels' => 2, 'views' => 41],
            'price_history' => [['at' => '2026-11-10T07:00:00+00:00', 'channel' => 'stub_channel_a', 'url' => 'https://t.me/stub_channel_a/4790',
                'text' => null, 'kind' => 'published', 'price_usd' => 650, 'change_pct' => null]],
            'geo_radius_m' => 500, 'author' => ['kind' => 'phone', 'label' => '+998 ** *** ** 67', 'count' => 3], 'owner_label' => 'Хозяин',
            'contact' => ['has_phone' => true, 'contact_url' => null, 'contact_paid' => false],
            'summary' => 'Светлая квартира рядом с метро.', 'offers' => [['text' => 'Торг', 'url' => null]],
            'original' => ['text' => 'Сдаётся 2-комн. квартира', 'url' => 'https://t.me/stub_channel_a/4812', 'deleted' => false],
            'sources' => [['handle' => 'stub_channel_a', 'url' => 'https://t.me/stub_channel_a/4812']],
            'comparison' => ['value' => 680, 'own' => 600, 'n' => 14, 'metric' => 'month', 'scope' => 'district', 'rooms' => 2,
                'near_class' => null, 'radius_km' => null, 'district' => 'Юнусабадский', 'place_value' => null, 'note' => null,
                'updated' => '2026-11-12', 'has_reason' => false, 'price_usd' => 600, 'price_per_m2' => null],
            ...$overrides,
        ];
    }
}
