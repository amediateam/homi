<?php

namespace App\Services\Sources;

use App\Enums\SourceDriver;
use App\Exceptions\Sources\SourceUnavailable;
use App\Models\User;
use Illuminate\Contracts\Foundation\Application;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use InvalidArgumentException;
use Laravel\Pennant\Feature;

/**
 * Picks the driver of a source feature for one request (ADR-0017, WP-10 "Flags"), in this order: the user's named
 * driver, the share driver when the user falls into the share, the driver for everyone, the configured default of
 * the environment. It never throws on a malformed stored rule: it logs and uses the default.
 */
final class SourceSelector
{
    public function __construct(
        private readonly SourceConfig $config,
        private readonly Application $app,
    ) {}

    /**
     * @throws SourceUnavailable when the default itself cannot be used here (stubs off, or an unknown name)
     * @throws InvalidArgumentException for a feature that is not configured
     */
    public function driverFor(string $feature, ?User $user): SourceDriver
    {
        $default = $this->defaultFor($feature);
        $chosen = $this->fromRule($feature, $user);

        if ($chosen !== null) {
            $driver = $this->usable($chosen);

            if ($driver !== null) {
                return $driver;
            }

            $this->logOnce($feature, "The source rule names \"{$chosen}\", which is unknown or not allowed here; using the default.");
        }

        $driver = $default === null ? null : $this->usable($default);

        if ($driver === null) {
            $this->logOnce($feature, 'The default source driver "'.($default ?? '(none)').'" cannot be used here.');

            throw new SourceUnavailable;
        }

        return $driver;
    }

    /** The configured default driver name of the feature in this environment, or null when none is configured. */
    public function defaultFor(string $feature): ?string
    {
        $default = $this->config->feature($feature)['default'];

        return $default[$this->app->environment()] ?? $default['*'] ?? null;
    }

    /** The share bucket of a user, 0…99, stable per feature and user. */
    public static function bucket(string $feature, int $userId): int
    {
        return crc32("{$feature}:{$userId}") % 100;
    }

    private function fromRule(string $feature, ?User $user): ?string
    {
        try {
            $rule = SourceRule::fromStored(Feature::globally()->value($feature));
        } catch (InvalidArgumentException $e) {
            $this->logOnce($feature, "Ignoring the malformed source rule: {$e->getMessage()}");

            return null;
        }

        if ($user !== null) {
            $id = (int) $user->getKey();

            if (isset($rule->users[$id])) {
                return $rule->users[$id];
            }

            if ($rule->shareDriver !== null && self::bucket($feature, $id) < $rule->sharePercent) {
                return $rule->shareDriver;
            }
        }

        return $rule->everyone;
    }

    private function usable(string $name): ?SourceDriver
    {
        $driver = SourceDriver::tryFrom($name);

        return $driver === SourceDriver::Stub && ! $this->config->allowStub() ? null : $driver;
    }

    /** Logs an error at most once a minute per feature and message, so a broken rule cannot flood the log. */
    private function logOnce(string $feature, string $message): void
    {
        if (Cache::add('sources:logged:'.sha1($feature."\n".$message), true, 60)) {
            Log::error($message, ['feature' => $feature]);
        }
    }
}
