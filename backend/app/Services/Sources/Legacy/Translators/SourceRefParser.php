<?php

namespace App\Services\Sources\Legacy\Translators;

use App\Services\Sources\Data\SourceRef;

/**
 * Where a legacy listing was published (`source_ref`, `25` §5, Q-API-063): the channel and post of a public Telegram
 * post link, `https://t.me/<channel>/<post id>` or `https://t.me/s/<channel>/<post id>`. A private link
 * (`t.me/c/<id>/…`), an invite or a link without a post id has none. Pure.
 */
final class SourceRefParser
{
    /** A public channel name (letters, digits, `_`, starting with a letter) and a numeric post id. */
    private const string PATTERN = '~^https://t\.me/(?:s/)?([a-z][a-z0-9_]{3,63})/(\d{1,18})/?(?:\?[^#\s]*)?(?:#\S*)?$~i';

    private function __construct() {}

    public static function parse(?string $url): ?SourceRef
    {
        $parts = self::parts($url);

        return $parts === null ? null : SourceRef::fromArray($parts);
    }

    /**
     * The channel and post of a post link, in the array shape of the stub fixtures.
     *
     * @return array{channel: string, post_id: int}|null
     */
    public static function parts(?string $url): ?array
    {
        if ($url === null || preg_match(self::PATTERN, trim($url), $match) !== 1) {
            return null;
        }

        return ['channel' => $match[1], 'post_id' => (int) $match[2]];
    }

    /**
     * The source of a legacy item or card: its `original_url`, else the first `sources[].url`; `null` when neither is a
     * post link (a preview carries neither).
     *
     * @param  array<array-key, mixed>  $item
     * @return array{channel: string, post_id: int}|null
     */
    public static function fromCard(array $item): ?array
    {
        $parts = self::parts(LegacyValue::string($item, 'original_url'));
        $sources = $item['sources'] ?? null;
        $first = is_array($sources) && array_is_list($sources) && is_array($sources[0] ?? null) ? $sources[0] : [];

        return $parts ?? self::parts(LegacyValue::string($first, 'url'));
    }
}
