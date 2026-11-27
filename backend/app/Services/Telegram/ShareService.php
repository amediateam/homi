<?php

namespace App\Services\Telegram;

use App\Enums\SourceDriver;
use App\Exceptions\Listings\ShareFailed;
use App\Exceptions\TelegramException;
use App\Models\User;
use App\Services\Listings\PhoneMasker;
use App\Services\Sources\Data\ListingSummary;
use App\Services\Sources\SourceContext;
use App\Services\Sources\SourceManager;
use Carbon\CarbonImmutable;
use Illuminate\Contracts\Cache\Repository;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Log;

/**
 * The share of a listing (WP-43, API-017, BR-APP-038, DEC-40): a prepared inline message of HOMI's bot for
 * `WebApp.shareMessage`, behind `POST /listings/{number}/share`. Native: `meta.source` is `native` on every driver. In
 * this order:
 *
 * 1. the cache `share:<user id>:<number>:<locale>`: a hit answers the stored id until one minute before its expiry
 *    (LB-API-046: two taps share one message; the key names the user, so no user is ever given another's id);
 * 2. a miss reads the preview (`ListingSource::preview()` of `source.listings.card`; an unknown listing is `404
 *    not_found`) and calls `savePreparedInlineMessage` (Bot API 10.5) once — never retried inside the request — with
 *    `user_id` = the caller's Telegram id, an `article` result whose `input_message_content` is the text «title ·
 *    price · price kind · district» (the Mini App's `shareText()`: the empty parts left out; masked, then
 *    HTML-escaped under `parse_mode: HTML`, SEC-REQ-020), its `reply_markup` one `url` button
 *    `https://t.me/<bot username>?startapp=l_<number>` (a `web_app` button works only in the bot's own chat), and
 *    `allow_user_chats`, `allow_bot_chats`, `allow_group_chats` and `allow_channel_chats` all true;
 * 3. the returned `id` is stored for `expiration_date` − now − 60 s (not at all when that is not positive) and
 *    answered with that expiry.
 *
 * Any Bot API error or timeout, a blank or malformed token or bot username (`TELEGRAM_BOT_TOKEN`,
 * `TELEGRAM_BOT_USERNAME`), a caller without a Telegram id, or an answer without an id and an expiry is `502
 * share_failed`, so the client falls back to its `t.me` link; a warning names the internal user id, the listing number
 * and Telegram's error code, never the text, the Telegram id or the token. A request with a stub scenario while the
 * card source is the stub driver neither reads nor writes the cache, so the scenario is answered every time. While
 * `sources.native_stubs` is on, the route's stub answers instead and nothing here runs (`NativeStubs`, WP-40).
 */
final readonly class ShareService
{
    public const string METHOD = 'savePreparedInlineMessage';

    /** How long before its expiry a cached id is no longer answered, in seconds. */
    public const int MARGIN_SECONDS = 60;

    /** The longest title taken into the message, in characters (the Bot API allows 4 096 for the whole text). */
    private const int MAX_TITLE = 512;

    private const string SEPARATOR = ' · ';

    public function __construct(private SourceManager $sources, private TelegramClient $telegram, private Repository $cache) {}

    /**
     * The prepared message of the listing for the user, reused within its lifetime. Fails with `ShareFailed` or the
     * preview's `SourceNotFound` / `SourceUnavailable`; these are not `@throws` tags, which the OpenAPI export would
     * read as answers of the method.
     */
    public function prepare(User $user, int $number, SourceContext $context): PreparedShare
    {
        $key = self::key($user, $number, $context->locale);
        $resolved = $this->sources->listings('source.listings.card', $context);
        $cacheable = $resolved->driver !== SourceDriver::Stub || $context->scenario === null;
        $cached = $cacheable ? $this->cached($key) : null;

        if ($cached !== null) {
            return $cached;
        }

        $listing = $resolved->source->preview($number, $context);
        $username = self::botUsername();

        if ($user->telegram_user_id === null || $username === null) {
            Log::warning('A listing share was not prepared: '.($username === null ? 'TELEGRAM_BOT_USERNAME is blank or malformed.' : 'the user has no Telegram id.'), ['user' => $user->id, 'listing' => $number]);

            throw new ShareFailed;
        }

        try {
            $answer = $this->telegram->call(self::METHOD, $this->message($user->telegram_user_id, $listing, $username, $context->locale));
        } catch (TelegramException $failure) {
            Log::warning('A listing share was not prepared: the Bot API failed.', ['user' => $user->id, 'listing' => $number, 'error_code' => $failure->errorCode]);

            throw new ShareFailed;
        }

        $id = $answer['id'] ?? null;
        $expires = $answer['expiration_date'] ?? null;

        if (! is_string($id) || $id === '' || ! is_int($expires)) {
            Log::warning('A listing share was not prepared: the Bot API answered no id and expiry.', ['user' => $user->id, 'listing' => $number]);

            throw new ShareFailed;
        }

        $seconds = $expires - CarbonImmutable::now()->getTimestamp() - self::MARGIN_SECONDS;

        if ($cacheable && $seconds > 0) {
            $this->cache->put($key, ['id' => $id, 'expires' => $expires], $seconds);
        }

        return new PreparedShare($id, CarbonImmutable::createFromTimestamp($expires)->toIso8601String());
    }

    /** The cache key of a user's prepared message of a listing in a locale. */
    public static function key(User $user, int $number, string $locale): string
    {
        return "share:{$user->id}:{$number}:{$locale}";
    }

    /**
     * The share text of a listing (BR-APP-038, the Mini App's `shareText()`): title · amount and period · price-kind
     * label · district, the empty parts left out, every part masked (DEC-52); plain text, the caller escapes it.
     *
     * @return list<string> the parts, the title first when there is one
     */
    public static function parts(ListingSummary $listing, string $locale): array
    {
        $kind = $listing->price?->kind;
        $parts = [
            mb_substr(trim($listing->title), 0, self::MAX_TITLE),
            $listing->price === null ? '' : $listing->price->display.($listing->price->period ?? ''),
            $kind === null ? '' : self::label("share.price_kind.{$kind->value}", $locale),
            (string) $listing->districtName,
        ];

        return array_values(array_filter(array_map(fn (string $part): string => PhoneMasker::mask(trim($part)), $parts), fn (string $part): bool => $part !== ''));
    }

    /**
     * The parameters of `savePreparedInlineMessage`.
     *
     * @return array<string, mixed>
     */
    private function message(int $telegramId, ListingSummary $listing, string $username, string $locale): array
    {
        $parts = self::parts($listing, $locale);
        $titled = $parts !== [] && trim($listing->title) !== '';
        $escaped = array_map(fn (string $part): string => htmlspecialchars($part, ENT_NOQUOTES | ENT_SUBSTITUTE, 'UTF-8'), $parts);

        if ($titled) {
            $escaped[0] = "<b>{$escaped[0]}</b>";
        }

        $untitled = self::label('share.untitled', $locale);

        return [
            'user_id' => $telegramId,
            'result' => [
                'type' => 'article',
                'id' => "l_{$listing->number}",
                'title' => $titled ? $parts[0] : $untitled,
                'input_message_content' => [
                    'message_text' => $escaped === [] ? htmlspecialchars($untitled, ENT_NOQUOTES | ENT_SUBSTITUTE, 'UTF-8') : implode(self::SEPARATOR, $escaped),
                    'parse_mode' => 'HTML',
                ],
                'reply_markup' => [
                    'inline_keyboard' => [[[
                        'text' => self::label('share.open', $locale),
                        'url' => "https://t.me/{$username}?startapp=l_{$listing->number}",
                    ]]],
                ],
            ],
            'allow_user_chats' => true,
            'allow_bot_chats' => true,
            'allow_group_chats' => true,
            'allow_channel_chats' => true,
        ];
    }

    /** The cached share; one that no longer fits or is within its last minute is a miss. */
    private function cached(string $key): ?PreparedShare
    {
        $entry = $this->cache->get($key);

        if (! is_array($entry) || ! is_string($entry['id'] ?? null) || ! is_numeric($entry['expires'] ?? null)) {
            return null;
        }

        $expires = (int) $entry['expires'];

        if ($expires - self::MARGIN_SECONDS <= CarbonImmutable::now()->getTimestamp()) {
            return null;
        }

        return new PreparedShare($entry['id'], CarbonImmutable::createFromTimestamp($expires)->toIso8601String());
    }

    /** HOMI's bot username without `@`, or `null` when it is blank or not a Telegram username. */
    private static function botUsername(): ?string
    {
        $configured = Config::get('telegram.bot.username');
        $username = is_string($configured) ? ltrim(trim($configured), '@') : '';

        return preg_match('/^[A-Za-z][A-Za-z0-9_]{4,31}$/D', $username) === 1 ? $username : null;
    }

    private static function label(string $key, string $locale): string
    {
        $text = __($key, [], $locale);

        return is_string($text) ? $text : '';
    }
}
