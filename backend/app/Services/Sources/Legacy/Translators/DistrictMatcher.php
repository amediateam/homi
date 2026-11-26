<?php

namespace App\Services\Sources\Legacy\Translators;

use App\Exceptions\ApiException;
use App\Services\Sources\Contracts\ReferenceSource;
use App\Services\Sources\Data\ReferenceData;
use App\Services\Sources\SourceContext;

/**
 * The district code of a legacy `district_name` (WP-42, WP-12 `district.code`): legacy sends the name only, in the
 * request's language, so HOMI compares it with the districts of the reference data of the same language.
 *
 * Names are compared case-insensitively, with `ё` as `е`, every apostrophe as `'`, hyphens and runs of spaces as one
 * space; when that finds nothing, a trailing «район», «р-н», «tumani» or «district», and then a Russian adjective ending
 * «ский» («Юнусабадский» → «Юнусабад»), are tried away. With a city (the feed's and the map's filters) only its
 * districts count; without one (a card names no city) every city's do, and a name two cities give different codes is
 * ambiguous. No match, an ambiguous name and an unavailable reference source give `null`, never a failed card (brief
 * rule 16); `misses()` counts them for the caller's log or metric. Pure, except `fromSource()`, which reads the source.
 */
final class DistrictMatcher
{
    /** Generic words after a district name, in the normalised form. */
    private const array GENERIC = [' район', ' р н', ' tumani', ' district'];

    /** @var array<string, array<string, string>> city code => normalised district name => district code */
    private array $index = [];

    private int $misses = 0;

    public function __construct(?ReferenceData $reference)
    {
        foreach ($reference->cities ?? [] as $city) {
            foreach ($city->districts as $district) {
                $this->index[$city->code][self::normal($district->name)] = $district->code;
            }
        }
    }

    /** The matcher of the context's language; an unavailable reference source gives one that matches nothing. */
    public static function fromSource(ReferenceSource $source, SourceContext $context): self
    {
        try {
            return new self($source->reference($context));
        } catch (ApiException) {
            return new self(null);
        }
    }

    public function code(?string $name, ?string $city = null): ?string
    {
        if ($name === null || trim($name) === '') {
            return null;
        }

        $cities = $city !== null && isset($this->index[$city]) ? [$this->index[$city]] : array_values($this->index);

        foreach (self::candidates($name) as $candidate) {
            $codes = array_values(array_unique(array_filter(array_map(fn (array $districts): ?string => $districts[$candidate] ?? null, $cities))));

            if (count($codes) === 1) {
                return $codes[0];
            }

            if (count($codes) > 1) {
                break;
            }
        }

        $this->misses++;

        return null;
    }

    /** How many names found no single district since this matcher was made. */
    public function misses(): int
    {
        return $this->misses;
    }

    /** @return list<string> the forms of a legacy name to look up, the most literal first */
    private static function candidates(string $name): array
    {
        $normal = self::normal($name);
        $bare = $normal;

        foreach (self::GENERIC as $word) {
            if (str_ends_with($bare, $word)) {
                $bare = substr($bare, 0, -strlen($word));

                break;
            }
        }

        $candidates = [$normal, $bare];

        if (str_ends_with($bare, 'ский')) {
            $candidates[] = substr($bare, 0, -strlen('ский'));
        }

        return array_values(array_unique(array_filter($candidates, fn (string $candidate): bool => $candidate !== '')));
    }

    private static function normal(string $name): string
    {
        $name = mb_strtolower(trim($name));
        $name = strtr($name, ['ё' => 'е', 'ʻ' => "'", 'ʼ' => "'", '’' => "'", '‘' => "'", '`' => "'"]);

        return trim((string) preg_replace('/[\s\-‐–—]+/u', ' ', $name));
    }
}
