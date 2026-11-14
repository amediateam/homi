<?php

namespace App\Services\Sources;

use Illuminate\Contracts\Config\Repository;
use InvalidArgumentException;

/**
 * Reads `config/sources.php`. Feature names contain dots, so the features map is always read whole; nothing reads a
 * feature through a dotted config key.
 */
final class SourceConfig
{
    public function __construct(private readonly Repository $config) {}

    public function allowStub(): bool
    {
        return (bool) $this->config->get('sources.allow_stub', true);
    }

    /** @return list<string> */
    public function features(): array
    {
        return array_keys($this->map('sources.features'));
    }

    /**
     * @return array{capability: string, default: array<string, string>}
     *
     * @throws InvalidArgumentException for a feature that is not configured
     */
    public function feature(string $name): array
    {
        $feature = $this->map('sources.features')[$name] ?? null;

        if (! is_array($feature) || ! is_string($feature['capability'] ?? null) || ! is_array($feature['default'] ?? null)) {
            throw new InvalidArgumentException("Unknown source feature \"{$name}\".");
        }

        /** @var array<string, string> $default */
        $default = $feature['default'];

        return ['capability' => $feature['capability'], 'default' => $default];
    }

    /**
     * @return array{contract: class-string, drivers: array<string, class-string>}
     *
     * @throws InvalidArgumentException for a capability that is not configured
     */
    public function capability(string $name): array
    {
        $capability = $this->map('sources.capabilities')[$name] ?? null;

        if (! is_array($capability) || ! is_string($capability['contract'] ?? null) || ! is_array($capability['drivers'] ?? null)) {
            throw new InvalidArgumentException("Unknown source capability \"{$name}\".");
        }

        /** @var array{contract: class-string, drivers: array<string, class-string>} $capability */
        return $capability;
    }

    /** @return array<string, mixed> */
    private function map(string $key): array
    {
        $map = $this->config->get($key, []);

        return is_array($map) ? $map : [];
    }
}
