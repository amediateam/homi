<?php

namespace App\Services\Radars;

use App\Enums\RadarMode;
use App\Services\Search\SearchFilters;

/**
 * A radar (WP-13; HOMI's table from WP-45): its id (ULID), whether it sends, `instant` or `digest`, how many listings
 * its hide rules suppress, when it was made and the 25-key filters. `preview` is answered only when asked for
 * (`$previewAsked`) and is null when it could not be computed.
 */
final readonly class Radar
{
    public function __construct(
        public string $id,
        public bool $active,
        public RadarMode $mode,
        public int $hidden,
        public string $createdAt,
        public SearchFilters $filters,
        public bool $previewAsked = false,
        public ?RadarPreview $preview = null,
    ) {}

    /** The same radar after one change of `PATCH`, new filters, or with its preview. */
    public function with(?bool $active = null, ?RadarMode $mode = null, ?int $hidden = null, ?SearchFilters $filters = null): self
    {
        return clone ($this, [
            'active' => $active ?? $this->active,
            'mode' => $mode ?? $this->mode,
            'hidden' => $hidden ?? $this->hidden,
            'filters' => $filters ?? $this->filters,
        ]);
    }

    public function withPreview(?RadarPreview $preview): self
    {
        return clone ($this, ['previewAsked' => true, 'preview' => $preview]);
    }
}
