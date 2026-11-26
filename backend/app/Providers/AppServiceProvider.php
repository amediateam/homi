<?php

namespace App\Providers;

use App\Http\DashboardAccess;
use App\Http\OpenApi\ApiErrorSchema;
use App\Http\OpenApi\RelativeServer;
use App\Models\User;
use App\Services\Identity\TelegramInitDataVerifier;
use Carbon\CarbonImmutable;
use Dedoc\Scramble\Scramble;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Config\Repository;
use Illuminate\Contracts\Foundation\Application;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Date;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;
use Illuminate\Validation\Rules\Password;
use Intervention\Image\Drivers\Gd\Driver as GdDriver;
use Intervention\Image\ImageManager;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        // GD is the image driver (app.uz convention); Imagick is also installed if ever needed.
        $this->app->singleton(ImageManager::class, fn (): ImageManager => new ImageManager(new GdDriver));

        // Built on each resolution, so the token and the window are read from the configuration of the moment.
        $this->app->bind(TelegramInitDataVerifier::class, fn (Application $app): TelegramInitDataVerifier => new TelegramInitDataVerifier(
            self::configString($app, 'telegram.bot.token'),
            $app->make(Repository::class)->integer('telegram.initdata.max_age', 3600),
        ));
    }

    /** A string value of the configuration, or `''` when it is missing or not a string (an unset env key is null). */
    private static function configString(Application $app, string $key): string
    {
        $value = $app->make(Repository::class)->get($key);

        return is_string($value) ? $value : '';
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        $this->configureDefaults();
        $this->configureRateLimiting();
        $this->configureApiDocs();
    }

    /**
     * `/docs/api` (Scramble): open locally; elsewhere behind the same nginx basic auth as Horizon and Telescope.
     * nginx sets the user only in the `/telescope` and `/horizon` locations today, so the docs answer 403 on staging
     * and production until the production track adds `/docs/api` there.
     */
    protected function configureApiDocs(): void
    {
        Gate::define('viewApiDocs', fn (?User $user = null): bool => DashboardAccess::allows(request()));

        Scramble::configure()->withDocumentTransformers([ApiErrorSchema::class, RelativeServer::class]);
    }

    /**
     * Configure default behaviors for production-ready applications.
     */
    protected function configureDefaults(): void
    {
        Date::use(CarbonImmutable::class);

        DB::prohibitDestructiveCommands(
            app()->isProduction(),
        );

        Password::defaults(fn (): ?Password => app()->isProduction()
            ? Password::min(12)
                ->mixedCase()
                ->letters()
                ->numbers()
                ->symbols()
                ->uncompromised()
            : null,
        );
    }

    /**
     * Named limiters (app.uz catalogue A5, adapted): `api` is attached to the whole /api/v1 group in
     * routes/api.php; the others are attached per route group.
     */
    protected function configureRateLimiting(): void
    {
        RateLimiter::for('api', fn (Request $request): Limit => Limit::perMinute(120)->by($this->actorKey($request)));

        RateLimiter::for('uploads', fn (Request $request): Limit => Limit::perMinute(30)->by($this->actorKey($request)));

        // The owner cabinet (WP-80, SEC-REQ-027): every owner write; publish and the phone request each, per route; the
        // place and demand lookups of the form.
        RateLimiter::for('owner-writes', fn (Request $request): Limit => Limit::perMinute(60)->by($this->actorKey($request)));
        RateLimiter::for('owner-publish', fn (Request $request): Limit => Limit::perHour(10)->by($this->actorKey($request).'|'.$request->route()?->getName()));
        RateLimiter::for('owner-place', fn (Request $request): Limit => Limit::perMinute(60)->by($this->actorKey($request)));
        RateLimiter::for('owner-demand', fn (Request $request): Limit => Limit::perMinute(30)->by($this->actorKey($request)));

        // Collector pushes: generous per token, still bounded (ADR-0009 §2).
        RateLimiter::for('intake', fn (Request $request): Limit => Limit::perMinute(600)->by($this->actorKey($request)));

        // Telegram delivers from a handful of IPs; the limit only guards against floods.
        RateLimiter::for('telegram-webhook', fn (Request $request): Limit => Limit::perMinute(3000)->by((string) $request->ip()));
    }

    /**
     * Rate-limit key: the authenticated model (users and sources do not collide) or the IP.
     * The key comes from the model because a `Source` is not Authenticatable and has no
     * `getAuthIdentifier()`.
     */
    private function actorKey(Request $request): string
    {
        $actor = $request->user();

        return $actor instanceof Model ? $actor::class.':'.$actor->getKey() : (string) $request->ip();
    }
}
