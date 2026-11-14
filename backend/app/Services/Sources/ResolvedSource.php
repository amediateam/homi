<?php

namespace App\Services\Sources;

use App\Enums\SourceDriver;

/**
 * The driver that a feature resolved to and the instance bound to it. The controller writes `driver` into
 * `meta.source` (`ApiController::sourced()`, `cursorPage()`).
 *
 * @template-covariant TSource of object
 */
final readonly class ResolvedSource
{
    /**
     * @param  TSource  $source
     */
    public function __construct(
        public SourceDriver $driver,
        public object $source,
    ) {}
}
