<?php

namespace App\Services\Sources;

use App\Exceptions\Sources\SourceUnavailable;
use App\Services\Sources\Contracts\LandingSource;
use App\Services\Sources\Contracts\ListingSource;
use App\Services\Sources\Contracts\ReferenceSource;
use Illuminate\Contracts\Container\Container;
use LogicException;

/**
 * Gives a controller the instance of the driver that a method's feature names (ADR-0017):
 *
 *     $resolved = $this->sources->listings('source.listings.feed', $context);
 *     $page = $resolved->source->feed($query, $context);
 *     return $this->cursorPage(ListingPreviewResource::collection($page->items), $page->nextCursor, $resolved->driver);
 */
final class SourceManager
{
    public function __construct(
        private readonly SourceConfig $config,
        private readonly SourceSelector $selector,
        private readonly Container $container,
    ) {}

    /**
     * @return ResolvedSource<object>
     *
     * @throws SourceUnavailable when the chosen driver is not bound for the capability
     */
    public function resolve(string $feature, SourceContext $context): ResolvedSource
    {
        $capability = $this->config->feature($feature)['capability'];

        return $this->resolveAs($feature, $context, $this->config->capability($capability)['contract']);
    }

    /** @return ResolvedSource<ReferenceSource> */
    public function reference(string $feature, SourceContext $context): ResolvedSource
    {
        return $this->typed($feature, $context, 'reference', ReferenceSource::class);
    }

    /** @return ResolvedSource<ListingSource> */
    public function listings(string $feature, SourceContext $context): ResolvedSource
    {
        return $this->typed($feature, $context, 'listings', ListingSource::class);
    }

    /** @return ResolvedSource<LandingSource> */
    public function landing(string $feature, SourceContext $context): ResolvedSource
    {
        return $this->typed($feature, $context, 'landing', LandingSource::class);
    }

    /** @return list<string> the driver names bound for the capability of the feature */
    public function boundDrivers(string $feature): array
    {
        return array_keys($this->config->capability($this->config->feature($feature)['capability'])['drivers']);
    }

    /**
     * @template TSource of object
     *
     * @param  class-string<TSource>  $contract
     * @return ResolvedSource<TSource>
     */
    private function typed(string $feature, SourceContext $context, string $capability, string $contract): ResolvedSource
    {
        $actual = $this->config->feature($feature)['capability'];

        if ($actual !== $capability) {
            throw new LogicException("The source feature \"{$feature}\" belongs to the capability \"{$actual}\", not \"{$capability}\".");
        }

        return $this->resolveAs($feature, $context, $contract);
    }

    /**
     * @template TSource of object
     *
     * @param  class-string<TSource>  $contract
     * @return ResolvedSource<TSource>
     */
    private function resolveAs(string $feature, SourceContext $context, string $contract): ResolvedSource
    {
        $capability = $this->config->feature($feature)['capability'];
        $driver = $this->selector->driverFor($feature, $context->user);
        $class = $this->config->capability($capability)['drivers'][$driver->value]
            ?? throw new SourceUnavailable("No \"{$driver->value}\" driver is bound for \"{$feature}\".");
        $source = $this->container->make($class);

        if (! $source instanceof $contract) {
            throw new LogicException("The \"{$driver->value}\" driver of \"{$feature}\" ({$class}) does not implement {$contract}.");
        }

        return new ResolvedSource($driver, $source);
    }
}
