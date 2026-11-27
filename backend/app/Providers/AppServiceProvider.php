<?php

namespace App\Providers;

use App\Http\Controllers\Pages\CallPageController;
use App\Http\DashboardAccess;
use App\Http\OpenApi\ApiErrorSchema;
use App\Http\OpenApi\RelativeServer;
use App\Models\User;
use App\Services\Access\RateLimits;
use App\Services\Identity\TelegramInitDataVerifier;
use App\Services\Sources\SourceContext;
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
use Symfony\Component\HttpFoundation\Response;

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
     * Named limiters (app.uz catalogue A5, adapted), attached per route in routes/api.php: every /api/v1 route carries
     * at least one. The `v1-*` limiters read their counts from `config/rate_limits.php` (WP-40, SEC-REQ-027) on every
     * request. The bearer routes count per actor (`actorKey()`, after authentication), the public ones per client
     * address. The daily cap on opening full cards is not a limiter: `CountListingOpens` counts only answered cards.
     */
    protected function configureRateLimiting(): void
    {
        RateLimiter::for('v1-auth', fn (Request $request): Limit => Limit::perMinute(RateLimits::value('auth.per_address'))->by((string) $request->ip()));
        RateLimiter::for('v1-public', fn (Request $request): Limit => Limit::perMinute(RateLimits::value('public.per_minute'))->by((string) $request->ip()));
        RateLimiter::for('v1-me', fn (Request $request): Limit => Limit::perMinute(RateLimits::value('me.per_minute'))->by($this->actorKey($request)));
        RateLimiter::for('v1-reads', fn (Request $request): Limit => Limit::perMinute(RateLimits::value('reads.per_minute'))->by($this->actorKey($request)));
        RateLimiter::for('v1-listing', fn (Request $request): Limit => Limit::perMinute(RateLimits::value('listing.per_minute'))->by($this->actorKey($request)));
        RateLimiter::for('v1-contact', fn (Request $request): Limit => Limit::perHour(RateLimits::value('contact.per_hour'))->by($this->actorKey($request)));
        // `v1-translation` (`rate_limits.translation.per_hour`) is no route limiter: `TranslationService` counts only the
        // cache misses of a user (WP-43), and the route is read under `v1-reads`.
        RateLimiter::for('v1-share', fn (Request $request): Limit => Limit::perHour(RateLimits::value('share.per_hour'))->by($this->actorKey($request)));
        RateLimiter::for('v1-lists', fn (Request $request): Limit => Limit::perMinute(RateLimits::value('lists.per_minute'))->by($this->actorKey($request)));
        RateLimiter::for('v1-reports', fn (Request $request): Limit => Limit::perDay(RateLimits::value('reports.per_day'))->by($this->actorKey($request)));
        RateLimiter::for('v1-radars', fn (Request $request): Limit => Limit::perMinute(RateLimits::value('radars.per_minute'))->by($this->actorKey($request)));
        RateLimiter::for('v1-media', fn (Request $request): Limit => Limit::perMinute(RateLimits::value('media.per_minute'))->by($this->actorKey($request)));

        // Analytics events beyond the limit are dropped, not refused (KV-BE-010, API-034): the client never retries them.
        RateLimiter::for('v1-events', fn (Request $request): Limit => Limit::perMinute(RateLimits::value('events.per_minute'))
            ->by($this->actorKey($request))
            ->response(fn (): Response => response()->noContent()));

        RateLimiter::for('uploads', fn (Request $request): Limit => Limit::perMinute(30)->by($this->actorKey($request)));

        // The owner cabinet (WP-80, SEC-REQ-027): every owner write; publish and the phone request each, per route; the
        // place and demand lookups of the form.
        RateLimiter::for('owner-writes', fn (Request $request): Limit => Limit::perMinute(60)->by($this->actorKey($request)));
        RateLimiter::for('owner-publish', fn (Request $request): Limit => Limit::perHour(10)->by($this->actorKey($request).'|'.$request->route()?->getName()));
        RateLimiter::for('owner-place', fn (Request $request): Limit => Limit::perMinute(60)->by($this->actorKey($request)));
        RateLimiter::for('owner-demand', fn (Request $request): Limit => Limit::perMinute(30)->by($this->actorKey($request)));

        // Collector pushes: generous per token, still bounded (ADR-0009 §2).
        RateLimiter::for('intake', fn (Request $request): Limit => Limit::perMinute(600)->by($this->actorKey($request)));

        // HOMI's call page (WP-43): opened from the external browser without a session, so counted per address; the
        // excess gets the page's own `429`, with its headers.
        RateLimiter::for('call-page', fn (Request $request): Limit => Limit::perMinute(30)
            ->by((string) $request->ip())
            ->response(fn (Request $request, array $headers): Response => CallPageController::page('call.unavailable', 429, SourceContext::localeOf($request), headers: $headers)));

        // Telegram delivers from a handful of IPs; the limit only guards against floods.
        RateLimiter::for('telegram-webhook', fn (Request $request): Limit => Limit::perMinute(3000)->by((string) $request->ip()));
    }

    /**
     * Rate-limit key: `user:<internal id>` for a HOMI user (never a Telegram id, WP-40), the class and id of any other
     * authenticated model (a collector's `Source`, which is not Authenticatable and has no `getAuthIdentifier()`; users
     * and sources do not collide), else the client address.
     */
    private function actorKey(Request $request): string
    {
        $actor = $this->actor($request);

        return match (true) {
            $actor instanceof User => 'user:'.$actor->getKey(),
            $actor instanceof Model => $actor::class.':'.$actor->getKey(),
            default => (string) $request->ip(),
        };
    }

    /**
     * The authenticated model of the request: Sanctum signs in a HOMI user or a collector's `Source` (the media
     * routes), although the default guard's provider names only users; null for a guest.
     */
    private function actor(Request $request): ?Model
    {
        $actor = $request->user();

        return $actor instanceof Model ? $actor : null;
    }
}
