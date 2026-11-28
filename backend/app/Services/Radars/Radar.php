<?php

namespace App\Services\Radars;

use App\Enums\RadarMode;
use App\Models\Radar as RadarModel;
use App\Services\Search\SearchFilters;

/**
 * A radar (WP-13; HOMI's table from WP-45): its id (ULID), whether it sends, `instant` or `digest`, how many listings
 * its hide rules suppress, when it was made and the 25-key filters. `preview` is answered only when asked for
 * (`$previewAsked`) and is null when it could not be computed. `fromModel()` answers a stored radar.
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

    /** A radar of HOMI's table (WP-45): `hidden` is its `hidden_count`, `created_at` in ISO 8601. */
    public static function fromModel(RadarModel $radar): self
    {
        return new self(
            id: $radar->id,
            active: $radar->active,
            mode: $radar->mode,
            hidden: $radar->hidden_count,
            createdAt: $radar->created_at->toIso8601String(),
            filters: $radar->searchFilters(),
        );
    }

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
