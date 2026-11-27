<?php

namespace App\Listeners;

use App\Models\SourceFlagChange;
use App\Services\Personal\VoteDetectors;
use App\Services\Sources\SourceConfig;
use App\Services\Sources\SourceRuleStore;
use Illuminate\Contracts\Foundation\Application;
use Illuminate\Support\Facades\Log;
use Laravel\Pennant\Events\AllFeaturesPurged;
use Laravel\Pennant\Events\FeatureDeleted;
use Laravel\Pennant\Events\FeaturesPurged;
use Laravel\Pennant\Events\FeatureUpdated;
use Laravel\Pennant\Events\FeatureUpdatedForAllScopes;
use Laravel\Pennant\Feature;
use Laravel\Pennant\GlobalScope;

/**
 * Keeps the audit log of source rules and of the vote detectors' kill switches without gaps (WP-10, WP-44): a change
 * of a configured source feature that did not come through `sources:set` or `sources:reset`, or of a vote detector
 * that did not come through `votes:detector` — a direct `Feature::…->activate()`, `pennant:purge` — is recorded with
 * actor `unknown` and `old_rule` null, because Pennant's events do not carry the previous value; a purge or a forget
 * records `new_rule` null. A source rule is recorded as stored; a detector's update as the boolean Pennant resolves
 * the stored value to (`value !== false`: a `null`, `0` or a string is on), so the row `VoteDetectors::defaultValue()`
 * reads after a purge says what the detector was, and a null `new_rule` only ever means a purge or a forget. A
 * detector's change also logs a `warning` that names the feature only. A change is global when its scope is stored as
 * the global one (`isGlobal()`), whatever form the caller gave it in; a value stored for any other single scope is not
 * recorded: no driver reads it.
 */
final class RecordSourceFlagChange
{
    public function __construct(
        private readonly SourceConfig $config,
        private readonly SourceRuleStore $store,
        private readonly VoteDetectors $detectors,
        private readonly Application $app,
    ) {}

    public function handle(FeatureUpdated|FeatureUpdatedForAllScopes|FeatureDeleted|FeaturesPurged|AllFeaturesPurged $event): void
    {
        $detectors = array_values(VoteDetectors::FEATURES);

        [$features, $value, $updated] = match (true) {
            $event instanceof FeatureUpdated => [self::isGlobal($event->scope) ? [$event->feature] : [], $event->value, true],
            $event instanceof FeatureUpdatedForAllScopes => [[$event->feature], $event->value, true],
            $event instanceof FeatureDeleted => [self::isGlobal($event->scope) ? [$event->feature] : [], null, false],
            $event instanceof FeaturesPurged => [$event->features, null, false],
            $event instanceof AllFeaturesPurged => [[...$this->config->features(), ...$detectors], null, false],
        };

        if (! $this->store->isWriting()) {
            foreach (array_intersect($features, $this->config->features()) as $feature) {
                $this->record($feature, $value, 'Recorded from Pennant '.class_basename($event).', outside the sources:* commands.');
            }
        }

        if (! $this->detectors->isWriting()) {
            foreach (array_intersect($features, $detectors) as $feature) {
                $this->record($feature, $updated ? $value !== false : null, 'Recorded from Pennant '.class_basename($event).', outside votes:detector.');
                Log::warning('Vote detector changed outside votes:detector.', ['feature' => $feature]);
            }
        }
    }

    /**
     * Whether Pennant stores a value of the scope as the global one: the scope serialises as `GlobalScope` does — the
     * `GlobalScope` object or its stored name `'__laravel_global'` given as a string (`Feature::for('__laravel_global')`).
     */
    private static function isGlobal(mixed $scope): bool
    {
        return Feature::serializeScope($scope) === (new GlobalScope)->featureScopeSerialize();
    }

    private function record(string $feature, mixed $value, string $reason): void
    {
        SourceFlagChange::query()->create([
            'feature' => $feature,
            'old_rule' => null,
            'new_rule' => $value,
            'actor' => SourceFlagChange::UNKNOWN_ACTOR,
            'reason' => $reason,
            'environment' => $this->app->environment(),
        ]);
    }
}
