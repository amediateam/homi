<?php

namespace App\Services\Sources\Contracts;

use App\Services\Sources\Data\CityStats;
use App\Services\Sources\Data\ReferenceData;
use App\Services\Sources\SourceContext;

/** Reference data and city statistics (ADR-0017; methods since WP-11). */
interface ReferenceSource
{
    /** The directories in the context's locale (`GET /reference`). */
    public function reference(SourceContext $context): ReferenceData;

    /**
     * One entry per city of the reference data (`GET /cities`).
     *
     * @return list<CityStats>
     */
    public function cities(SourceContext $context): array;
}
