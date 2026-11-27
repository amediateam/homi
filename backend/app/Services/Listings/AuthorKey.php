<?php

namespace App\Services\Listings;

use App\Services\Sources\Legacy\Translators\SourceRefParser;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Log;

/**
 * Who wrote a listing, as HOMI files it (WP-42, "`listing_refs` and author keys"): a pseudonymous key, never a phone
 * number, and its kind. Read from the raw legacy card, before the translators drop the number (DEC-52), in this order:
 *
 * | Case                                                                   | Key                                   | Kind            |
 * | ---------------------------------------------------------------------- | ------------------------------------- | --------------- |
 * | the operator's stable author key (the field `legacy.fields.author_key`) | `legacy:<value>`                      | `author.kind`   |
 * | a phone, in E.164                                                      | `phone:` + 32 hex of HMAC-SHA-256      | `phone`         |
 * | no phone, a public source channel (`SourceRefParser::fromCard()`)        | `source:<channel>`, lower-cased       | `source`        |
 * | neither                                                                | none                                  | —               |
 *
 * The HMAC's key is `contacts.author_key_secret`. Blank or shorter than `MIN_SECRET_BYTES`, it derives no `phone:` key
 * (an HMAC with a short key could be reversed over the phone space): the author falls back to his source channel or
 * none, and a warning says so at most once a minute. An operator value that is not printable ASCII or too long for the
 * column, a kind longer than `MAX_KIND`, and a phone that is not a number count as absent. The key is a keyed hash
 * of a person's number, so it is personal data for the security review of WP-70, not an opaque id.
 */
final readonly class AuthorKey
{
    /** The shortest secret that derives a `phone:` key. */
    public const int MIN_SECRET_BYTES = 32;

    /** The width of `listing_refs.author_key`. */
    public const int MAX_LENGTH = 96;

    /** The width of `listing_refs.author_kind`. */
    public const int MAX_KIND = 8;

    /** How many hex digits of the HMAC the key keeps (128 bits). */
    private const int HASH_HEX = 32;

    public function __construct(public string $key, public ?string $kind) {}

    /**
     * The author key of a raw legacy card, with the operator field of `legacy.fields.author_key` and the secret of
     * `contacts.author_key_secret`.
     *
     * @param  array<array-key, mixed>  $legacyCard
     */
    public static function fromCard(#[\SensitiveParameter] array $legacyCard): ?self
    {
        return self::derive($legacyCard, Config::string('legacy.fields.author_key'), Config::string('contacts.author_key_secret'));
    }

    /**
     * The rule of the class over the given operator field name (blank: none) and secret.
     *
     * @param  array<array-key, mixed>  $card
     */
    public static function derive(#[\SensitiveParameter] array $card, string $field, #[\SensitiveParameter] string $secret): ?self
    {
        $operator = $field === '' ? null : self::operatorValue($card[$field] ?? null);

        if ($operator !== null) {
            return new self("legacy:{$operator}", self::kindOf($card));
        }

        $phone = self::e164($card['phone'] ?? null);

        if ($phone !== null) {
            if (strlen($secret) >= self::MIN_SECRET_BYTES) {
                return new self('phone:'.self::phoneHash($phone, $secret), 'phone');
            }

            self::warnShortSecret();
        }

        $channel = SourceRefParser::fromCard($card)['channel'] ?? null;

        return $channel === null ? null : new self("source:{$channel}", 'source');
    }

    /**
     * A phone number in E.164 (`+` and 8 to 15 digits), or `null` when the value is not one. Spaces, dashes, dots and
     * brackets are dropped; nine digits without a `+` are an Uzbek number without its country code (`998`).
     */
    public static function e164(#[\SensitiveParameter] mixed $phone): ?string
    {
        if (! is_string($phone)) {
            return null;
        }

        $compact = (string) preg_replace('/[\s\-().]/u', '', $phone);

        if (preg_match('/^(\+?)(\d{8,15})$/', $compact, $match) !== 1) {
            return null;
        }

        return '+'.($match[1] === '' && strlen($match[2]) === 9 ? '998'.$match[2] : $match[2]);
    }

    private static function phoneHash(#[\SensitiveParameter] string $phone, #[\SensitiveParameter] string $secret): string
    {
        return substr(hash_hmac('sha256', $phone, $secret), 0, self::HASH_HEX);
    }

    /** The operator's value as text that fits the column after `legacy:`, else `null`. */
    private static function operatorValue(mixed $value): ?string
    {
        if (is_int($value)) {
            $value = (string) $value;
        }

        if (! is_string($value)) {
            return null;
        }

        $value = trim($value);
        $room = self::MAX_LENGTH - strlen('legacy:');

        return preg_match('/^[\x21-\x7e]{1,'.$room.'}$/', $value) === 1 ? $value : null;
    }

    /**
     * `author.kind` of the card when it is a short lower-case word.
     *
     * @param  array<array-key, mixed>  $card
     */
    private static function kindOf(array $card): ?string
    {
        $author = $card['author'] ?? null;
        $kind = is_array($author) ? ($author['kind'] ?? null) : null;

        return is_string($kind) && preg_match('/^[a-z_]{1,'.self::MAX_KIND.'}$/', $kind) === 1 ? $kind : null;
    }

    private static function warnShortSecret(): void
    {
        if (Cache::add('listings:once:author_key_secret', 1, 60)) {
            Log::warning('AUTHOR_KEY_SECRET is blank or shorter than 32 bytes: no phone author keys are derived.');
        }
    }
}
