<?php

namespace App\Services\Identity;

use App\Models\User;
use Carbon\CarbonImmutable;
use Laravel\Sanctum\NewAccessToken;

/** A Telegram sign-in that went through (WP-40): the HOMI user, his new bearer token and when it expires. */
final readonly class TelegramSession
{
    public function __construct(
        public User $user,
        public NewAccessToken $token,
        public CarbonImmutable $expiresAt,
    ) {}
}
