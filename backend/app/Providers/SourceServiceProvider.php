<?php

namespace App\Providers;

use App\Services\Listings\Contracts\ListingExclusion;
use App\Services\Listings\Contracts\OverlayData;
use App\Services\Listings\Contracts\OwnerOverlayData;
use App\Services\Listings\ListingOverlay;
use App\Services\Listings\NullOverlayData;
use App\Services\Listings\NullOwnerOverlayData;
use App\Services\Sources\Legacy\LegacyFakeServer;
use App\Services\Sources\SourceConfig;
use App\Services\Sources\SourceManager;
use App\Services\Sources\SourceRuleStore;
use App\Services\Sources\SourceSelector;
use App\Services\Sources\Stub\FixtureStore;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\ServiceProvider;
use Laravel\Pennant\Feature;
use LogicException;

/**
 * Source drivers of /api/v1 (ADR-0017, `config/sources.php`). Every configured feature is defined in Pennant with a
 * static empty rule: the one stored value of a feature lives in Pennant's global scope. The stub mode of the native
 * methods is refused outside `local` and `testing` (WP-40), and the legacy fixtures in production (WP-41).
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
        // One instance per process, so each legacy fixture is read once.
        $this->app->singleton(LegacyFakeServer::class, fn (): LegacyFakeServer => new LegacyFakeServer(resource_path('fixtures/legacy')));
        // HOMI's per-user part of listing answers (WP-42): the overlay is also what the legacy feed pager leaves out.
        // One instance per request or queued job (`scoped`), shared by the pager and the controller, so the caller's
        // sets are read once per request and never kept across requests by a long-running worker.
        // Its data has no tables before WP-44 (favourites, hidden, blocked, votes), WP-84 and WP-85 (owner parts).
        $this->app->scoped(ListingOverlay::class);
        $this->app->bind(ListingExclusion::class, ListingOverlay::class);
        $this->app->bind(OverlayData::class, NullOverlayData::class);
        $this->app->bind(OwnerOverlayData::class, NullOwnerOverlayData::class);
    }

    public function boot(): void
    {
        $config = $this->app->make(SourceConfig::class);
        $this->refuseNativeStubsOutsideDevelopment($config);
        $this->refuseLegacyFixturesInProduction();

        foreach ($config->features() as $feature) {
            Feature::define($feature, []);
        }
    }

    /**
     * The stub mode of the native methods (`SOURCES_NATIVE_STUBS`, WP-40) answers every sign-in with the stub user, so
     * it may run only in `local` and `testing`: anywhere else the application refuses to boot with it.
     *
     * @throws LogicException
     */
    private function refuseNativeStubsOutsideDevelopment(SourceConfig $config): void
    {
        if ($config->nativeStubs() && ! $this->app->environment(['local', 'testing'])) {
            throw new LogicException('SOURCES_NATIVE_STUBS is allowed only in the local and testing environments.');
        }
    }

    /**
     * The legacy fixtures (`legacy.fake`, WP-41) answer instead of the legacy API, so production refuses to boot with
     * them: a production server talks to legacy or does not answer from it at all.
     *
     * @throws LogicException
     */
    private function refuseLegacyFixturesInProduction(): void
    {
        if (Config::boolean('legacy.fake') && $this->app->environment('production')) {
            throw new LogicException('LEGACY_FAKE is not allowed in the production environment.');
        }
    }
}
