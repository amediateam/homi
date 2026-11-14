<?php

namespace App\Providers;

use Carbon\CarbonImmutable;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Date;
use Illuminate\Support\Facades\DB;
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
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        $this->configureDefaults();
        $this->configureRateLimiting();
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
