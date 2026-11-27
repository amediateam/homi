<?php

namespace App\Services\Listings;

use App\Exceptions\Sources\SourceUnavailable;
use App\Models\User;
use App\Services\Sources\SourceContext;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\App;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Log;
use InvalidArgumentException;
use JsonException;

/**
 * HOMI's call links (WP-43, variant A; KV-BE-037, SEC-REQ-026): `<call page base>/call/<token>`, where the token is
 * the base64url of `{"n": number, "u": user id, "l": locale, "x": expiry}`, a dot, and the base64url of the
 * HMAC-SHA-256 of that encoded payload under `contacts.call_link_signing_key`. Stateless: no table. The token never
 * holds the phone number; the call page reads it from the source on every visit, so a withdrawn listing is `404` at
 * once even with a valid token, and a token for one listing can never show another.
 *
 * - `issue()` signs with the current key; a link is valid `contacts.call_link_ttl` seconds (600) and is not
 *   single-use (Q-API-042): the client fetches a new one two minutes early (API-009).
 * - `verify()` compares with `hash_equals` under the current key and, while it is set, the previous one
 *   (`contacts.call_link_signing_key_previous`, a rotation). It gives the claims of a correctly signed token, expired
 *   or not (`CallLinkClaims::expired()`, with 60 s of skew), and `null` for anything else.
 * - A key shorter than `MIN_SECRET_BYTES` is no key. Without one, in `local` and `testing` a key derived from
 *   `app.key` is used, so the services run without env; elsewhere `issue()` is `SourceUnavailable` (`503`) with a
 *   warning at most once a minute — never a link signed with a weak key — and `verify()` accepts nothing.
 *
 * The token and the keys never reach a log line or an exception message.
 */
final class CallLinkService
{
    /** The shortest signing key used. */
    public const int MIN_SECRET_BYTES = 32;

    /** The longest token read; a real one is about 130 characters. */
    public const int MAX_TOKEN_LENGTH = 512;

    /** The payload's keys, in the order they are signed. */
    private const array CLAIMS = ['n', 'u', 'l', 'x'];

    /**
     * A new link for the user to call the author of the listing; its pages speak `$locale`.
     *
     * @throws SourceUnavailable when no signing key is configured outside `local` and `testing`
     */
    public function issue(User $user, int $number, string $locale): CallLink
    {
        if ($number < 1 || ! in_array($locale, SourceContext::LOCALES, true)) {
            throw new InvalidArgumentException('A call link names a listing number and a locale HOMI serves.');
        }

        $secret = self::currentSecret();

        if ($secret === null) {
            if (Cache::add('listings:once:call_link_key', 1, 60)) {
                Log::warning('CALL_LINK_SIGNING_KEY is blank or shorter than 32 bytes: no call link is issued.');
            }

            throw new SourceUnavailable('No call link can be issued.');
        }

        $expires = CarbonImmutable::now()->addSeconds(max(1, Config::integer('contacts.call_link_ttl')));
        $payload = self::encode(json_encode(
            ['n' => $number, 'u' => $user->id, 'l' => $locale, 'x' => $expires->getTimestamp()],
            JSON_THROW_ON_ERROR,
        ));

        return new CallLink(self::base().'/call/'.$payload.'.'.self::sign($payload, $secret), $expires);
    }

    /** The claims of a token signed by HOMI (expired ones included), else `null`. */
    public function verify(#[\SensitiveParameter] string $token): ?CallLinkClaims
    {
        if (strlen($token) > self::MAX_TOKEN_LENGTH || preg_match('/^([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/', $token, $parts) !== 1) {
            return null;
        }

        [, $payload, $signature] = $parts;
        $signed = false;

        foreach (array_filter([self::currentSecret(), self::previousSecret()]) as $secret) {
            $signed = hash_equals(self::sign($payload, $secret), $signature) || $signed;
        }

        return $signed ? self::claims($payload) : null;
    }

    /** The origin of the call page: `contacts.call_page_base`, else `app.url`, without a trailing slash. */
    public static function base(): string
    {
        $base = Config::get('contacts.call_page_base');

        return rtrim(is_string($base) && trim($base) !== '' ? trim($base) : Config::string('app.url'), '/');
    }

    /** The claims of a signed payload, when it is exactly what `issue()` writes. */
    private static function claims(string $payload): ?CallLinkClaims
    {
        $json = base64_decode(strtr($payload, '-_', '+/'), true);

        try {
            $claims = is_string($json) ? json_decode($json, true, 2, JSON_THROW_ON_ERROR) : null;
        } catch (JsonException) {
            return null;
        }

        if (! is_array($claims) || array_keys($claims) !== self::CLAIMS) {
            return null;
        }

        ['n' => $number, 'u' => $user, 'l' => $locale, 'x' => $expires] = $claims;

        if (! is_int($number) || $number < 1 || ! is_int($user) || $user < 1 || ! is_int($expires)
            || ! is_string($locale) || ! in_array($locale, SourceContext::LOCALES, true)) {
            return null;
        }

        return new CallLinkClaims($number, $user, $locale, $expires);
    }

    /** The configured key when it is long enough; else, in `local` and `testing` only, one derived from `app.key`. */
    private static function currentSecret(): ?string
    {
        $configured = self::secret('contacts.call_link_signing_key');

        if ($configured !== null) {
            return $configured;
        }

        $appKey = Config::get('app.key');

        return App::environment(['local', 'testing']) ? hash_hmac('sha256', 'homi-call-link', is_string($appKey) ? $appKey : '') : null;
    }

    /** The previous key while it is set and long enough: tokens it signed are still accepted. */
    private static function previousSecret(): ?string
    {
        return self::secret('contacts.call_link_signing_key_previous');
    }

    private static function secret(string $key): ?string
    {
        $secret = Config::get($key);

        return is_string($secret) && strlen($secret) >= self::MIN_SECRET_BYTES ? $secret : null;
    }

    private static function sign(string $payload, #[\SensitiveParameter] string $secret): string
    {
        return self::encode(hash_hmac('sha256', $payload, $secret, true));
    }

    private static function encode(string $bytes): string
    {
        return rtrim(strtr(base64_encode($bytes), '+/', '-_'), '=');
    }
}
