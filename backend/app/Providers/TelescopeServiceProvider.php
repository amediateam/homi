<?php

namespace App\Providers;

use App\Http\DashboardAccess;
use App\Models\User;
use Illuminate\Support\Facades\Gate;
use Laravel\Telescope\IncomingEntry;
use Laravel\Telescope\Telescope;
use Laravel\Telescope\TelescopeApplicationServiceProvider;

class TelescopeServiceProvider extends TelescopeApplicationServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        // Telescope::night();

        $this->hideSensitiveRequestDetails();

        $isLocal = $this->app->environment('local');

        Telescope::filter(function (IncomingEntry $entry) use ($isLocal): bool {
            return $isLocal ||
                   (bool) config('telescope.record_all') ||
                   $entry->isReportableException() ||
                   $entry->isFailedRequest() ||
                   $entry->isFailedJob() ||
                   $entry->isScheduledTask() ||
                   $entry->hasMonitoredTag();
        });
    }

    /**
     * Prevent sensitive request details from being logged by Telescope.
     */
    protected function hideSensitiveRequestDetails(): void
    {
        if ($this->app->environment('local')) {
            return;
        }

        // The raw Telegram launch data of sign-in and of the request method (WP-80) is never kept, under either
        // spelling, nor the bearer token a sign-in answers (SEC-REQ-047). `authorization` is hidden by Telescope itself.
        Telescope::hideRequestParameters(['_token', 'init_data', 'initData']);
        Telescope::hideResponseParameters(['data.token']);

        // The parameters above are masked in the payload only, but a request entry also keeps its full address: the
        // same parameters are masked in its query string. A tag callback runs on every entry before the filters
        // decide; it adds no tag.
        Telescope::tag(function (IncomingEntry $entry): array {
            if (is_string($entry->content['uri'] ?? null)) {
                $entry->content['uri'] = self::maskQuery($entry->content['uri'], Telescope::$hiddenRequestParameters);
            }

            return [];
        });

        Telescope::hideRequestHeaders([
            'cookie',
            'set-cookie',
            'x-csrf-token',
            'x-xsrf-token',
            'x-telegram-bot-api-secret-token',
        ]);
    }

    /**
     * The address with the value of every hidden parameter in its query string replaced by Telescope's mask. A pair
     * matches by the name PHP reads into the payload: decoded, cut before the first `[` (so `init_data[0]=…` is masked
     * too), with `.` and spaces read as `_` (so `init.data=…` is masked, as its payload key `init_data` is). Masking a
     * masked address changes nothing.
     *
     * @param  array<int, string>  $hidden
     */
    private static function maskQuery(string $uri, array $hidden): string
    {
        if (! str_contains($uri, '?')) {
            return $uri;
        }

        [$path, $query] = explode('?', $uri, 2);

        $pairs = array_map(function (string $pair) use ($hidden): string {
            $key = explode('=', $pair, 2)[0];
            $name = str_replace(['.', ' '], '_', explode('[', urldecode($key), 2)[0]);

            return in_array($name, $hidden, true) ? $key.'=********' : $pair;
        }, explode('&', $query));

        return $path.'?'.implode('&', $pairs);
    }

    /**
     * Register the Telescope gate.
     *
     * This gate determines who can access Telescope in non-local environments. There are no
     * dashboard users in the database: nginx basic auth decides (DashboardAccess).
     */
    protected function gate(): void
    {
        Gate::define('viewTelescope', fn (?User $user = null): bool => DashboardAccess::allows(request()));
    }
}
