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
use Laravel\Pennant\GlobalScope;

/**
 * Keeps the audit log of source rules and of the vote detectors' kill switches without gaps (WP-10, WP-44): a change
 * of a configured source feature that did not come through `sources:set` or `sources:reset`, or of a vote detector
 * that did not come through `votes:detector` — a direct `Feature::…->activate()`, `pennant:purge` — is recorded with
 * actor `unknown` and `old_rule` null, because Pennant's events do not carry the previous value; a purge or a forget
 * records `new_rule` null. A detector's change also logs a `warning` that names the feature only. A value stored for a
 * single scope other than the global one is not recorded: no driver reads it.
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

        [$features, $value] = match (true) {
            $event instanceof FeatureUpdated => [$event->scope instanceof GlobalScope ? [$event->feature] : [], $event->value],
            $event instanceof FeatureUpdatedForAllScopes => [[$event->feature], $event->value],
            $event instanceof FeatureDeleted => [$event->scope instanceof GlobalScope ? [$event->feature] : [], null],
            $event instanceof FeaturesPurged => [$event->features, null],
            $event instanceof AllFeaturesPurged => [[...$this->config->features(), ...$detectors], null],
        };

        if (! $this->store->isWriting()) {
            foreach (array_intersect($features, $this->config->features()) as $feature) {
                $this->record($feature, $value, 'Recorded from Pennant '.class_basename($event).', outside the sources:* commands.');
            }
        }

        if (! $this->detectors->isWriting()) {
            foreach (array_intersect($features, $detectors) as $feature) {
                $this->record($feature, $value, 'Recorded from Pennant '.class_basename($event).', outside votes:detector.');
                Log::warning('Vote detector changed outside votes:detector.', ['feature' => $feature]);
            }
        }
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
