<?php

namespace App\Services\Sources;

use App\Models\User;
use Illuminate\Http\Request;
use InvalidArgumentException;

/**
 * Who asks and in which language and currency: every source method receives it (ADR-0017, `25` §4.1).
 */
final readonly class SourceContext
{
    /** Locales the API answers in; the first one is the fallback. */
    public const array LOCALES = ['ru', 'uz', 'en'];

    public const array CURRENCIES = ['USD', 'UZS'];

    /** Request header that picks another stub fixture or a named error (WP-10, "Stubs"). */
    public const string SCENARIO_HEADER = 'X-Stub-Scenario';

    public function __construct(
        public string $locale,
        public string $currency,
        public ?User $user = null,
        public ?string $scenario = null,
    ) {
        if (! in_array($locale, self::LOCALES, true)) {
            throw new InvalidArgumentException("Unsupported locale \"{$locale}\".");
        }

        if (! in_array($currency, self::CURRENCIES, true)) {
            throw new InvalidArgumentException("Unsupported currency \"{$currency}\".");
        }
    }

    /**
     * The locale is the first supported `Accept-Language` tag by weight, else `ru`. The currency is the signed-in
     * user's (WP-40), read from his settings row and never written: `USD` for a guest, a collector, or a user without
     * a row yet. A scenario that is not a snake_case word of at most 64 characters is dropped.
     */
    public static function fromRequest(Request $request): self
    {
        $actor = $request->user();
        $user = $actor instanceof User ? $actor : null;
        $scenario = $request->header(self::SCENARIO_HEADER);

        return new self(
            locale: self::localeOf($request),
            currency: $user?->settings?->currency->value ?? 'USD',
            user: $user,
            scenario: is_string($scenario) && preg_match('/^[a-z0-9_]{1,64}$/', $scenario) === 1 ? $scenario : null,
        );
    }

    /** The first supported `Accept-Language` tag by weight (`uz-Latn` and `uz_Latn` are `uz`), else `ru`. */
    public static function localeOf(Request $request): string
    {
        return (string) $request->getPreferredLanguage(self::LOCALES);
    }

    /** Context of a queued job or the bot: no user, no scenario. */
    public static function system(string $locale = 'ru'): self
    {
        return new self($locale, 'USD');
    }
}
