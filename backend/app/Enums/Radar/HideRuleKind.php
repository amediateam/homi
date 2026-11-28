<?php

namespace App\Enums\Radar;

/**
 * What a radar's hide rule keeps out (WP-45, `radar_hide_rules.kind`): a channel without `@`, a district code of the
 * reference data, or an author key of `listing_refs` (only while `radar.author_hide_rules` is on).
 */
enum HideRuleKind: string
{
    case Channel = 'channel';
    case District = 'district';
    case Author = 'author';
}
