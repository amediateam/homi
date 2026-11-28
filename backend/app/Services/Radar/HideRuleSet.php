<?php

namespace App\Services\Radar;

use App\Enums\Radar\HideRuleKind;
use App\Models\RadarHideRule;

/**
 * The hide rules of one radar, read once (WP-45, `RadarHideRuleService::rulesFor()`): whether a listing's channel,
 * district code or author key is kept out of this radar's starter, previews and deliveries (the matcher of WP-46). A
 * channel compares without `@` and case. The set holds author keys: never log it.
 */
final readonly class HideRuleSet
{
    /**
     * @param  array<string, true>  $channels
     * @param  array<string, true>  $districts
     * @param  array<string, true>  $authors
     */
    private function __construct(private array $channels, private array $districts, private array $authors) {}

    /** @param  iterable<RadarHideRule>  $rules */
    public static function of(iterable $rules): self
    {
        $targets = ['channel' => [], 'district' => [], 'author' => []];

        foreach ($rules as $rule) {
            $target = $rule->kind === HideRuleKind::Channel ? self::channel($rule->target) : $rule->target;
            $targets[$rule->kind->value][$target] = true;
        }

        return new self($targets['channel'], $targets['district'], $targets['author']);
    }

    public static function none(): self
    {
        return new self([], [], []);
    }

    /** A channel name as rules store and compare it: without `@` and surrounding spaces, in lower case. */
    public static function channel(string $name): string
    {
        return strtolower(ltrim(trim($name), '@'));
    }

    public function isEmpty(): bool
    {
        return $this->channels === [] && $this->districts === [] && $this->authors === [];
    }

    /** Whether an author key is needed to apply the set (the starter reads `listing_refs` only then). */
    public function hasAuthorRules(): bool
    {
        return $this->authors !== [];
    }

    public function excludes(?string $channel, ?string $districtCode, ?string $authorKey): bool
    {
        return ($channel !== null && isset($this->channels[self::channel($channel)]))
            || ($districtCode !== null && isset($this->districts[$districtCode]))
            || ($authorKey !== null && isset($this->authors[$authorKey]));
    }
}
