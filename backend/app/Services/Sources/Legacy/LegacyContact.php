<?php

namespace App\Services\Sources\Legacy;

use App\Services\Listings\AuthorKey;
use InvalidArgumentException;

/**
 * What a raw legacy card says about reaching its author (WP-43, Q-API-062), read before the translators drop the
 * number (DEC-52): the phone when `AuthorKey::e164()` reads `phone` as one number (the reading of the author key; a
 * phone that is not one number is not disclosed), legacy's `phone_display`, and whether the card carries a call link
 * (`call_url`). `variant()` decides per card under `legacy.contact.mode`; the card's `contact.has_phone` is that
 * variant not being `null`, so the card never promises a contact the method would refuse.
 *
 * | Mode    | A phone (variant A, HOMI's call link) | No phone, a call link (variant B) | Neither |
 * | ------- | ------------------------------------- | --------------------------------- | ------- |
 * | `auto`  | `phone`                               | `link`                            | `null`  |
 * | `phone` | `phone`                               | `null`                            | `null`  |
 * | `link`  | `link`                                | `link`                            | `null`  |
 *
 * `toArray()` is what the encrypted contact entry of `LegacyListingSource` holds; it never enters a log line.
 */
final readonly class LegacyContact
{
    public const string PHONE = 'phone';

    public const string LINK = 'link';

    /** The longest `phone_display` kept; a longer one is not a display of one number. */
    public const int MAX_DISPLAY = 64;

    public function __construct(
        #[\SensitiveParameter] public ?string $phone,
        #[\SensitiveParameter] public ?string $display,
        public bool $hasLink,
    ) {}

    /** @param  array<array-key, mixed>  $card  a raw legacy card */
    public static function fromCard(#[\SensitiveParameter] array $card): self
    {
        $display = $card['phone_display'] ?? null;
        $display = is_string($display) ? trim($display) : '';
        $link = $card['call_url'] ?? null;

        return new self(
            AuthorKey::e164($card['phone'] ?? null),
            $display !== '' && mb_strlen($display) <= self::MAX_DISPLAY ? $display : null,
            is_string($link) && trim($link) !== '',
        );
    }

    /**
     * The stored form, as `toArray()` wrote it.
     *
     * @param  array<array-key, mixed>  $data
     *
     * @throws InvalidArgumentException when it is not
     */
    public static function fromArray(#[\SensitiveParameter] array $data): self
    {
        $phone = $data['p'] ?? null;
        $display = $data['d'] ?? null;
        $hasLink = $data['l'] ?? null;

        if (array_keys($data) !== ['p', 'd', 'l'] || ($phone !== null && AuthorKey::e164($phone) !== $phone)
            || ($display !== null && ! is_string($display)) || ! is_bool($hasLink)) {
            throw new InvalidArgumentException('A stored legacy contact has another shape.');
        }

        return new self($phone, $display, $hasLink);
    }

    /** @return array{p: string|null, d: string|null, l: bool} */
    public function toArray(): array
    {
        return ['p' => $this->phone, 'd' => $this->display, 'l' => $this->hasLink];
    }

    /** `PHONE` (variant A), `LINK` (variant B) or `null` (no contact) under a mode of `legacy.contact.mode`. */
    public function variant(string $mode): ?string
    {
        return match ($mode) {
            self::PHONE => $this->phone !== null ? self::PHONE : null,
            self::LINK => $this->phone !== null || $this->hasLink ? self::LINK : null,
            default => $this->phone !== null ? self::PHONE : ($this->hasLink ? self::LINK : null),
        };
    }

    /** The display of variant A's number: legacy's when it reads as the same number, else HOMI's form. */
    public function phoneDisplay(): ?string
    {
        if ($this->phone === null) {
            return null;
        }

        return $this->display !== null && AuthorKey::e164($this->display) === $this->phone ? $this->display : self::format($this->phone);
    }

    /** HOMI's form of an E.164 number: `+998 90 123-45-67` for an Uzbek one, else the number as it is. */
    public static function format(#[\SensitiveParameter] string $phone): string
    {
        return preg_match('/^\+998(\d{2})(\d{3})(\d{2})(\d{2})$/', $phone, $groups) === 1
            ? "+998 {$groups[1]} {$groups[2]}-{$groups[3]}-{$groups[4]}"
            : $phone;
    }
}
