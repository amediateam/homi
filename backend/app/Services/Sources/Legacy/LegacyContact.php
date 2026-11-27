<?php

namespace App\Services\Sources\Legacy;

use App\Services\Listings\AuthorKey;
use InvalidArgumentException;

/**
 * What a raw legacy card says about reaching its author (WP-43, Q-API-062), read before the translators drop the
 * number (DEC-52): the phone when `AuthorKey::e164()` reads `phone` as one number (the reading of the author key; a
 * phone that is not one number is not disclosed), legacy's `phone_display`, and whether the card carries a call link
 * (`call_url`). `variant()` decides per card under `legacy.contact.mode`; the card's `contact.has_phone` is that
 * variant not being `null`, so the card promises a contact only where the method has one to give — except that a
 * variant B link legacy then answers for a host or port HOMI does not allow (`LegacyListingSource::callUrl()`) is
 * refused, which the card cannot know.
 *
 * | Mode    | A phone (variant A, HOMI's call link) | No phone, a call link (variant B) | Neither |
 * | ------- | ------------------------------------- | --------------------------------- | ------- |
 * | `auto`  | `phone`                               | `link`                            | `null`  |
 * | `phone` | `phone`                               | `null`                            | `null`  |
 * | `link`  | `link`                                | `link`                            | `null`  |
 *
 * `toArray()` is what the encrypted contact entry of `LegacyListingSource` holds (as `kept()` gives it for the mode);
 * it never enters a log line.
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

    /**
     * What the contact entry keeps under a mode of `legacy.contact.mode` (data minimisation): under `link` no phone,
     * since variant B never answers one, and `hasLink` then says whether legacy can give a call link at all (a phone or
     * a link in the card), so the entry decides the variant as the card did; under any other mode the contact as read.
     */
    public function kept(string $mode): self
    {
        return $mode === self::LINK ? new self(null, $this->display, $this->phone !== null || $this->hasLink) : $this;
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

    /**
     * The display of variant B: legacy's `phone_display` only when `AuthorKey::e164()` reads it as one number, else
     * `null`, so a link-only answer never carries other digits (hours, a part of a number, two numbers).
     */
    public function linkDisplay(): ?string
    {
        return AuthorKey::e164($this->display) !== null ? $this->display : null;
    }

    /** HOMI's form of an E.164 number: `+998 90 123-45-67` for an Uzbek one, else the number as it is. */
    public static function format(#[\SensitiveParameter] string $phone): string
    {
        return preg_match('/^\+998(\d{2})(\d{3})(\d{2})(\d{2})$/', $phone, $groups) === 1
            ? "+998 {$groups[1]} {$groups[2]}-{$groups[3]}-{$groups[4]}"
            : $phone;
    }
}
