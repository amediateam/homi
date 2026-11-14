<?php

namespace App\Services\Sources\Data;

/** A code with its name in the request's language: a district, a zone, a renovation, an appliance, a locale. */
final readonly class NamedCode
{
    public function __construct(
        public string $code,
        public string $name,
    ) {}

    /** @param  array<array-key, mixed>  $data */
    public static function fromArray(array $data): self
    {
        return new self(Fields::string($data, 'code'), Fields::string($data, 'name'));
    }

    /**
     * @param  array<array-key, mixed>  $data
     * @return list<self>
     */
    public static function listFrom(array $data, string $key): array
    {
        return array_map(self::fromArray(...), Fields::objects($data, $key));
    }
}
