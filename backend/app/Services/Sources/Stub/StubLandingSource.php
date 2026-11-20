<?php

namespace App\Services\Sources\Stub;

use App\Services\Sources\Contracts\LandingSource;
use App\Services\Sources\Data\LandingLive;
use App\Services\Sources\Data\LandingPins;
use App\Services\Sources\SourceContext;
use App\Services\Sources\SourceManager;
use Illuminate\Support\Facades\Config;

/**
 * The stub driver of the landing capability (WP-13): `landing/live.json`, `landing/pins.rent.json` and
 * `landing/pins.sale.json`. The fixtures name districts by code (`district_code`); the stub adds the name in the
 * context's locale from the reference data, and `{media}` becomes `config('media.public_url')`. The showcase counts
 * keep the bare code: the landing names those districts from its own texts.
 */
final class StubLandingSource implements LandingSource
{
    public function __construct(private readonly FixtureStore $fixtures, private readonly SourceManager $sources) {}

    public function live(SourceContext $context): LandingLive
    {
        return LandingLive::fromArray($this->localised($this->fixtures->pick($context, 'landing/live'), $context));
    }

    public function pins(string $deal, SourceContext $context): LandingPins
    {
        return LandingPins::fromArray($this->localised($this->fixtures->pick($context, "landing/pins.{$deal}"), $context));
    }

    /**
     * The fixture with each `district_code` of a listing replaced by a `district` object and the media token filled.
     *
     * @param  array<array-key, mixed>  $data
     * @return array<array-key, mixed>
     */
    private function localised(array $data, SourceContext $context): array
    {
        $names = $this->districtNames($context);
        $media = rtrim(Config::string('media.public_url'), '/');

        foreach (['latest', 'pins'] as $list) {
            if (! is_array($data[$list] ?? null)) {
                continue;
            }

            foreach ($data[$list] as $i => $item) {
                if (! is_array($item)) {
                    continue;
                }

                $code = $item['district_code'] ?? null;
                unset($item['district_code']);
                $item['district'] = is_string($code) ? ['code' => $code, 'name' => $names[$code] ?? $code] : null;

                if (is_string($item['photo_url'] ?? null)) {
                    $item['photo_url'] = str_replace('{media}', $media, $item['photo_url']);
                }

                $data[$list][$i] = $item;
            }
        }

        return $data;
    }

    /** @return array<string, string> district code => name in the context's locale */
    private function districtNames(SourceContext $context): array
    {
        $reference = $this->sources->reference('source.reference', $context)->source->reference(new SourceContext($context->locale, $context->currency));
        $names = [];

        foreach ($reference->cities as $city) {
            foreach ($city->districts as $district) {
                $names[$district->code] = $district->name;
            }
        }

        return $names;
    }
}
