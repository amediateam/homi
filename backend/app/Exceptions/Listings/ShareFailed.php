<?php

namespace App\Exceptions\Listings;

use App\Exceptions\ApiException;
use Throwable;

/** Telegram did not prepare the share message; the client falls back to the `t.me` link (WP-12, BR-APP-038). */
final class ShareFailed extends ApiException
{
    public function __construct(string $message = 'The share message could not be prepared.', ?Throwable $previous = null)
    {
        parent::__construct($message, 502, 'share_failed', previous: $previous);
    }
}
