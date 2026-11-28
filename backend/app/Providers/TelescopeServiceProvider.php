<?php

namespace App\Providers;

use App\Http\Controllers\Pages\CallPageController;
use App\Http\DashboardAccess;
use App\Models\User;
use App\Services\Telegram\TelegramClient;
use Illuminate\Support\Facades\Gate;
use Laravel\Telescope\EntryType;
use Laravel\Telescope\IncomingEntry;
use Laravel\Telescope\Telescope;
use Laravel\Telescope\TelescopeApplicationServiceProvider;

class TelescopeServiceProvider extends TelescopeApplicationServiceProvider
{
    /**
     * The cache keys whose cache events and Redis commands are never kept (WP-42, WP-43), behind any cache prefix: a
     * translation (`<driver>:translation:…`), the encrypted contact entry and the cached card and preview of a legacy
     * listing (`legacy:v1:listings:{contact,card,preview}:…`), and a user's day of disclosures (`contact:<user
     * id>:<day>`).
     */
    private const string SENSITIVE_KEYS = '/[a-z]:translation:|legacy:v1:listings:(?:contact|card|preview):|contact:\d+:\d{4}-\d{2}-\d{2}|personal:realtor-author-keys/';

    /**
     * Register any application services.
     */
    public function register(): void
    {
        // Telescope::night();

        $this->hideSensitiveRequestDetails();

        $isLocal = $this->app->environment('local');

        Telescope::filter(function (IncomingEntry $entry) use ($isLocal): bool {
            if (self::isLegacyCall($entry) || self::isCallPage($entry) || self::isBotApiCall($entry) || self::isSensitiveCache($entry) || self::isSensitiveRedisCommand($entry)) {
                return false;
            }

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
     * An outgoing request to the legacy API (WP-41): never kept, in any environment. Its response bodies will carry
     * phone numbers (the card and the contact of WP-42 and WP-43), and the watcher's `ignore_hosts` option does not
     * cover a failed connection, whose entry keeps the request's payload.
     */
    private static function isLegacyCall(IncomingEntry $entry): bool
    {
        if ($entry->type !== EntryType::CLIENT_REQUEST) {
            return false;
        }

        $uri = $entry->content['uri'] ?? null;
        $legacy = parse_url(config()->string('legacy.base_url'), PHP_URL_HOST);

        $host = is_string($uri) ? parse_url($uri, PHP_URL_HOST) : null;

        // Guzzle writes the request's host in lower case; the configured one may not be.
        return is_string($host) && is_string($legacy) && strtolower($host) === strtolower($legacy);
    }

    /**
     * An outgoing request to the Telegram Bot API (WP-43, `TelegramClient`): never kept, in any environment. Its address
     * holds the bot token (SEC-REQ-013), and its payload a Telegram user id and a listing's text. The host is the
     * client's own (`TelegramClient::host()`: trimmed and lower-cased), so both read the address one way.
     */
    private static function isBotApiCall(IncomingEntry $entry): bool
    {
        if ($entry->type !== EntryType::CLIENT_REQUEST) {
            return false;
        }

        $uri = $entry->content['uri'] ?? null;
        $api = TelegramClient::host();
        $host = is_string($uri) ? parse_url($uri, PHP_URL_HOST) : null;

        return is_string($host) && $api !== null && strtolower($host) === $api;
    }

    /**
     * A cache event on a translation, contact, listing card or day-of-disclosures key (`SENSITIVE_KEYS`): never kept,
     * in any environment, since the cache watcher keeps the key and the value read or written — a translated text, an
     * encrypted number, a card, or the user id and the listings a user asked a number for (SEC-REQ-047).
     */
    private static function isSensitiveCache(IncomingEntry $entry): bool
    {
        $key = $entry->content['key'] ?? null;

        return $entry->type === EntryType::CACHE && is_string($key) && preg_match(self::SENSITIVE_KEYS, $key) === 1;
    }

    /**
     * A Redis command on a translation, contact or listing card key (`SENSITIVE_KEYS`): never kept, in any
     * environment, since the Redis watcher keeps the whole command, the value written included — a translated text,
     * an encrypted number, a card or the listings a user asked a number for.
     */
    private static function isSensitiveRedisCommand(IncomingEntry $entry): bool
    {
        $command = $entry->content['command'] ?? null;

        return $entry->type === EntryType::REDIS && is_string($command) && preg_match(self::SENSITIVE_KEYS, $command) === 1;
    }

    /**
     * A request of HOMI's call page (WP-43, `GET /call/{token}`): never kept, in any environment. Its address holds the
     * call token, a credential for the author's number, and its answer shows that number (SEC-REQ-026, SEC-REQ-047).
     * Known by the controller that answered it (whatever spelling of the address reached it: the router decodes
     * `/call%2F<token>` to the page) and, for an address no route took, by its path: decoded once, its leading slashes
     * collapsed (`parse_url()` would read `//call/<token>` as a host), starting with `/call` in any case.
     */
    private static function isCallPage(IncomingEntry $entry): bool
    {
        if ($entry->type !== EntryType::REQUEST) {
            return false;
        }

        $action = $entry->content['controller_action'] ?? null;

        if (is_string($action) && ($action === CallPageController::class || str_starts_with($action, CallPageController::class.'@'))) {
            return true;
        }

        $uri = $entry->content['uri'] ?? null;

        if (! is_string($uri)) {
            return false;
        }

        $path = (string) preg_replace('#^/+#', '/', rawurldecode(explode('?', $uri, 2)[0]));

        return preg_match('#^/+call(/|$)#i', $path) === 1;
    }

    /**
     * Prevent sensitive request details from being logged by Telescope.
     */
    protected function hideSensitiveRequestDetails(): void
    {
        // The legacy service key travels in a configurable header of an outgoing request (WP-41); Telescope's client
        // request watcher masks the request headers named here. In every environment, local included.
        Telescope::hideRequestHeaders([strtolower(config()->string('legacy.auth.header'))]);

        // The answer of `POST /listings/{number}/contact` (WP-43) is the one disclosure of an author's number, and its
        // `call_url` carries a call token: none of the three is kept, in every environment, local included.
        Telescope::hideResponseParameters(['data.phone', 'data.phone_display', 'data.call_url']);

        // The answer of `POST /listings/{number}/translation` (WP-43) is a translated text, which never reaches a log:
        // its `data.text` is not kept either, in every environment.
        Telescope::hideResponseParameters(['data.text']);

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
