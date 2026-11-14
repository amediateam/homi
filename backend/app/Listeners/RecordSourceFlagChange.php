<?php

namespace App\Listeners;

use App\Models\SourceFlagChange;
use App\Services\Sources\SourceConfig;
use App\Services\Sources\SourceRuleStore;
use Illuminate\Contracts\Foundation\Application;
use Laravel\Pennant\Events\AllFeaturesPurged;
use Laravel\Pennant\Events\FeatureDeleted;
use Laravel\Pennant\Events\FeaturesPurged;
use Laravel\Pennant\Events\FeatureUpdated;
use Laravel\Pennant\Events\FeatureUpdatedForAllScopes;
use Laravel\Pennant\GlobalScope;

/**
 * Keeps the audit log of source rules without gaps (WP-10): a change of a configured source feature that did not
 * come through `sources:set` or `sources:reset` — a direct `Feature::…->activate()`, `pennant:purge` — is recorded
 * with actor `unknown` and `old_rule` null, because Pennant's events do not carry the previous value. A value stored
 * for a single scope other than the global one is not recorded: no driver reads it.
 */
final class RecordSourceFlagChange
{
    public function __construct(
        private readonly SourceConfig $config,
        private readonly SourceRuleStore $store,
        private readonly Application $app,
    ) {}

    public function handle(FeatureUpdated|FeatureUpdatedForAllScopes|FeatureDeleted|FeaturesPurged|AllFeaturesPurged $event): void
    {
        if ($this->store->isWriting()) {
            return;
        }

        [$features, $value] = match (true) {
            $event instanceof FeatureUpdated => [$event->scope instanceof GlobalScope ? [$event->feature] : [], $event->value],
            $event instanceof FeatureUpdatedForAllScopes => [[$event->feature], $event->value],
            $event instanceof FeatureDeleted => [$event->scope instanceof GlobalScope ? [$event->feature] : [], null],
            $event instanceof FeaturesPurged => [$event->features, null],
            $event instanceof AllFeaturesPurged => [$this->config->features(), null],
        };

        foreach (array_intersect($features, $this->config->features()) as $feature) {
            SourceFlagChange::query()->create([
                'feature' => $feature,
                'old_rule' => null,
                'new_rule' => $value,
                'actor' => SourceFlagChange::UNKNOWN_ACTOR,
                'reason' => 'Recorded from Pennant '.class_basename($event).', outside the sources:* commands.',
                'environment' => $this->app->environment(),
            ]);
        }
    }
}
