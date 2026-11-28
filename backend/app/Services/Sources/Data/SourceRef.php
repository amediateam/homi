<?php

namespace App\Services\Sources\Data;

/** Where a listing was published (`25` §5, Q-API-063): the channel without `@` and the numeric post id. */
final readonly class SourceRef
{
    public function __construct(public string $channel, public int $postId) {}

    /** @param  array<array-key, mixed>  $data */
    public static function fromArray(array $data): self
    {
        return new self(ltrim(Fields::string($data, 'channel'), '@'), Fields::int($data, 'post_id'));
    }

    /**
     * The v1 array `fromArray()` reads back.
     *
     * @return array{channel: string, post_id: int}
     */
    public function toArray(): array
    {
        return ['channel' => $this->channel, 'post_id' => $this->postId];
    }
}
