<?php

namespace App\Providers;

use App\Services\Sources\SourceConfig;
use App\Services\Sources\SourceManager;
use App\Services\Sources\SourceRuleStore;
use App\Services\Sources\SourceSelector;
use App\Services\Sources\Stub\FixtureStore;
use Illuminate\Support\ServiceProvider;
use Laravel\Pennant\Feature;

/**
 * Source drivers of /api/v1 (ADR-0017, `config/sources.php`). Every configured feature is defined in Pennant with a
 * static empty rule: the one stored value of a feature lives in Pennant's global scope.
 */
class SourceServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->singleton(SourceConfig::class);
        $this->app->singleton(SourceSelector::class);
        $this->app->singleton(SourceManager::class);
        // One instance, so the audit listener sees that the store is writing.
        $this->app->singleton(SourceRuleStore::class);
        // One instance per process, so each fixture is decoded once.
        $this->app->singleton(FixtureStore::class, fn (): FixtureStore => new FixtureStore(resource_path('fixtures/v1')));
    }

    public function boot(): void
    {
        foreach ($this->app->make(SourceConfig::class)->features() as $feature) {
            Feature::define($feature, []);
        }
    }
}
