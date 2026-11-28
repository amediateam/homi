<?php

namespace App\Services\Radar;

use App\Services\Sources\SourceContext;
use InvalidArgumentException;

/**
 * Where a radar was turned on and in which language and currency (WP-45). `entry` is kept for statistics only
 * (BR-API-086): the six places of the Mini App (`StoreRadarRequest::ENTRIES`: the filters sheet, the new-radar sheet,
 * the few-results note, the follow nudge, the feed card, the return banner) and the bot's wizard and free text (WP-54).
 * `relaxed` is the code of the flow option the user picked in the filters sheet: stored as `relax_code`, never applied
 * (LB-API-035). `locale` and `currency` are those the starter is read in.
 */
final readonly class RadarCreateContext
{
    /** @var list<string> */
    public const array ENTRIES = ['filters', 'empty', 'few', 'prompt', 'feed', 'return', 'bot_wizard', 'bot_text'];

    public function __construct(
        public ?string $entry,
        public ?string $relaxed = null,
        public string $locale = 'ru',
        public string $currency = 'USD',
    ) {
        if ($entry !== null && ! in_array($entry, self::ENTRIES, true)) {
            throw new InvalidArgumentException('Unknown radar entry.');
        }

        if ($relaxed !== null && preg_match('/^[a-z_]{1,32}$/', $relaxed) !== 1) {
            throw new InvalidArgumentException('A relaxed code is 1 to 32 lower-case letters or underscores.');
        }

        if (! in_array($locale, SourceContext::LOCALES, true) || ! in_array($currency, SourceContext::CURRENCIES, true)) {
            throw new InvalidArgumentException('Unsupported locale or currency of a radar write.');
        }
    }
}
