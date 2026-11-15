<?php

namespace App\Services\Sources\Contracts;

use App\Exceptions\Sources\SourceUnavailable;
use App\Services\Sources\Data\LandingLive;
use App\Services\Sources\Data\LandingPins;
use App\Services\Sources\SourceContext;

/**
 * The public landing's live numbers and map pins (ADR-0017, WP-13). Display names follow the context's locale; the
 * answers carry no phone, no listing text and no author.
 */
interface LandingSource
{
    /** @throws SourceUnavailable */
    public function live(SourceContext $context): LandingLive;

    /**
     * @param  'rent'|'sale'  $deal
     *
     * @throws SourceUnavailable
     */
    public function pins(string $deal, SourceContext $context): LandingPins;
}
