<?php

namespace App\Services\Identity;

use Carbon\CarbonImmutable;

/**
 * What HOMI keeps of a verified Telegram launch (WP-40, SEC-REQ-004): the Telegram user id, four flags, the language
 * tag, the launch time and the start parameter. It never holds a name, a username or a photo address; `hasUsername`
 * and `hasPhoto` only say whether Telegram sent one. `fingerprint` (the first 12 hex digits of the SHA-256 of the
 * value's `hash`) names the value in logs and in the exchange counter without revealing it.
 */
final readonly class TelegramInitData
{
    public function __construct(
        public int $telegramUserId,
        public bool $isPremium,
        public bool $hasUsername,
        public bool $hasPhoto,
        public bool $allowsWriteToPm,
        public ?string $languageCode,
        public CarbonImmutable $authDate,
        public ?string $startParam,
        public string $fingerprint,
    ) {}
}
