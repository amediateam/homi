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
 * | a phone that is not one number (two numbers, a name with it, slashes)  | none                                  | —               |
 * | no phone, a public source channel (`SourceRefParser::fromCard()`)        | `source:<channel>`, lower-cased       | `source`        |
 * | neither                                                                | none                                  | —               |
 *
 * The HMAC's key is `contacts.author_key_secret`. Blank or shorter than `MIN_SECRET_BYTES`, it derives no `phone:` key
 * (an HMAC with a short key could be reversed over the phone space), and a card with a phone is then filed under no
 * author at all, never under its channel: one channel carries many phone authors, and one `source:` key for all of
 * them would let a user who blocks one hide every other. A warning says so at most once a minute. A phone `e164()`
 * cannot read as one number is filed under no author either, for the same reason, without a warning. `source:` stays
 * for a card without a phone: its `phone` is missing, `null` or blank.
 *
 * Counted as absent: an operator value that is not printable ASCII or too long for the column, and one whose digits
 * form a phone number — `e164()` reads it as one (eight digits or more, separators left out), or nine digits stand in a
 * row once the separators a number is written with are left out (`LinkGuard::safe()`'s rule) — so no number is filed
 * raw as `legacy:+998…`; such a card falls through to the phone rule. Also absent: a kind longer than `MAX_KIND`. The
 * key is a keyed hash of a person's number, so it is personal data for the security review of WP-70, not an opaque
 * id.
 */
final readonly class AuthorKey
{
    /** The shortest secret that derives a `phone:` key. */
    public const int MIN_SECRET_BYTES = 32;

    /** The width of `listing_refs.author_key`. */
    public const int MAX_LENGTH = 96;

    /** The width of `listing_refs.author_kind`. */
    public const int MAX_KIND = 8;

    /** The prefix of a key derived from a phone number. */
    public const string PHONE = 'phone:';

    /** The prefix of the operator's own key. */
    public const string LEGACY = 'legacy:';

    /** The prefix of a key that only names the source channel. */
    public const string SOURCE = 'source:';

    /** How many hex digits of the HMAC the key keeps (128 bits). */
    private const int HASH_HEX = 32;

    public function __construct(public string $key, public ?string $kind) {}

    /**
     * The prefixes of the filed keys this key may replace (`ListingRefs::remember()`): a key of its own kind, and a
     * `source:` key for a `phone:` or `legacy:` one. A `phone:` and a `legacy:` key never replace each other, and a key
     * of no known kind replaces none (only a row without a key takes it).
     *
     * @return list<string>
     */
    public function replaces(): array
    {
        foreach ([self::PHONE, self::LEGACY] as $prefix) {
            if (str_starts_with($this->key, $prefix)) {
                return [$prefix, self::SOURCE];
            }
        }

        return str_starts_with($this->key, self::SOURCE) ? [self::SOURCE] : [];
    }

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
            return new self(self::LEGACY.$operator, self::kindOf($card));
        }

        $written = $card['phone'] ?? null;
        $phone = self::e164($written);

        if ($phone !== null) {
            if (strlen($secret) >= self::MIN_SECRET_BYTES) {
                return new self(self::PHONE.self::phoneHash($phone, $secret), 'phone');
            }

            self::warnShortSecret();

            return null;
        }

        if (! self::blank($written)) {
            return null;
        }

        $channel = SourceRefParser::fromCard($card)['channel'] ?? null;

        return $channel === null ? null : new self(self::SOURCE.$channel, 'source');
    }

    /**
     * A phone number in E.164 (`+` and 8 to 15 digits), or `null` when the value is not one. Whitespace and the
     * separators of `PhoneMasker::SEPARATORS` (dashes, the minus sign, dots, underscores, brackets) are dropped,
     * fullwidth digits and plus are read as ASCII; nine digits without a `+` are an Uzbek number without its country
     * code (`998`).
     */
    public static function e164(#[\SensitiveParameter] mixed $phone): ?string
    {
        if (! is_string($phone)) {
            return null;
        }

        $compact = (string) preg_replace('/[\s'.PhoneMasker::SEPARATORS.']/u', '', PhoneMasker::asciiDigits(str_replace('＋', '+', $phone)));

        if (preg_match('/^(\+?)(\d{8,15})$/', $compact, $match) !== 1) {
            return null;
        }

        return '+'.($match[1] === '' && strlen($match[2]) === 9 ? '998'.$match[2] : $match[2]);
    }

    /** A phone value that says there is no phone: missing, `null`, `false`, or only whitespace. */
    private static function blank(#[\SensitiveParameter] mixed $phone): bool
    {
        return $phone === null || $phone === false || (is_string($phone) && preg_match('/^\s*$/u', $phone) === 1);
    }

    private static function phoneHash(#[\SensitiveParameter] string $phone, #[\SensitiveParameter] string $secret): string
    {
        return substr(hash_hmac('sha256', $phone, $secret), 0, self::HASH_HEX);
    }

    /** The operator's value as text that fits the column after `legacy:` and is not a phone number, else `null`. */
    private static function operatorValue(#[\SensitiveParameter] mixed $value): ?string
    {
        if (is_int($value)) {
            $value = (string) $value;
        }

        if (! is_string($value)) {
            return null;
        }

        $value = trim($value);
        $room = self::MAX_LENGTH - strlen(self::LEGACY);

        if (preg_match('/^[\x21-\x7e]{1,'.$room.'}$/', $value) !== 1
            || self::e164($value) !== null
            || preg_match('/\d{9,}/', (string) preg_replace('/[\s\-._()+]+/', '', $value)) === 1) {
            return null;
        }

        return $value;
    }

    /**
     * `author.kind` of the card when it is a short lower-case word.
     *
     * @param  array<array-key, mixed>  $card
     */
    private static function kindOf(#[\SensitiveParameter] array $card): ?string
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
