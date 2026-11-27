<?php

namespace App\Exceptions;

use RuntimeException;

/**
 * A Bot API call that did not succeed (WP-43; WP-50 extends the client): Telegram's `error_code` and `description`, or
 * a call that was never answered (not configured, a timeout, a connection error, an answer that is not the Bot API's)
 * with `errorCode` null. The bot token is in the request path, so every text here has any token replaced by `bot***`
 * (`scrub()`), and no exception of the HTTP client is ever chained: their messages quote the address.
 *
 * Not an `ApiException`: a caller decides what a failed call means for its method (`ShareService` answers `502
 * share_failed`).
 */
final class TelegramException extends RuntimeException
{
    /** A token as Telegram issues it (`<bot id>:<secret>`), with or without the `bot` prefix of the request path. */
    private const string TOKEN_PATTERN = '/(?:bot)?\d{3,}:[A-Za-z0-9_-]{8,}/';

    /** The longest description kept. */
    private const int MAX_DESCRIPTION = 300;

    public readonly string $description;

    public function __construct(
        public readonly string $method,
        #[\SensitiveParameter] string $description,
        public readonly ?int $errorCode = null,
        public readonly ?int $retryAfter = null,
    ) {
        $this->description = mb_substr(self::scrub($description), 0, self::MAX_DESCRIPTION);

        parent::__construct(self::scrub("The Bot API method {$method} failed".($errorCode === null ? '' : " ({$errorCode})").": {$this->description}"));
    }

    /** The call was not sent: no usable bot token or Bot API address is configured. */
    public static function notConfigured(string $method, string $what): self
    {
        return new self($method, "not sent: {$what}");
    }

    /** The call was sent and not answered: a timeout or a connection error, named by its class only. */
    public static function transport(string $method, string $failure): self
    {
        return new self($method, 'not answered: '.class_basename($failure));
    }

    /** The text with every bot token in it replaced by `bot***`. */
    public static function scrub(#[\SensitiveParameter] string $text): string
    {
        return (string) preg_replace(self::TOKEN_PATTERN, 'bot***', $text);
    }
}
