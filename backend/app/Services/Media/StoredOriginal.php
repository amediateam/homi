<?php

namespace App\Services\Media;

/**
 * Result of storing an original image: content-addressed key plus the facts needed for the DB row.
 */
final readonly class StoredOriginal
{
    public function __construct(
        public string $sha256,
        public string $mime,
        public string $ext,
        public string $disk,
        public string $key,
        public int $bytes,
        public ?int $width,
        public ?int $height,
    ) {}
}
