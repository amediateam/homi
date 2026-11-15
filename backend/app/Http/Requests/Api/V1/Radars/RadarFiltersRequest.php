<?php

namespace App\Http\Requests\Api\V1\Radars;

use App\Services\Search\FilterRejected;
use App\Services\Search\SearchFilters;
use App\Services\Search\SearchFiltersNormaliser;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\ValidationException;
use LogicException;

/**
 * A radar body with filters (WP-13): `filters` is normalised by the filter rules of WP-12 for a radar (`forRadar`),
 * and a value it rejects is a `422` under `filters.<key>`. `relaxed` names the relaxed rule the radar came from.
 */
abstract class RadarFiltersRequest extends FormRequest
{
    private ?SearchFilters $filters = null;

    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, array<int, mixed>>
     */
    public function rules(): array
    {
        return [
            'filters' => ['required', 'array'],
            'relaxed' => ['nullable', 'string', 'regex:/^[a-z_]{1,32}$/'],
        ];
    }

    /** The normalised filters; available once the request is validated. */
    public function filters(): SearchFilters
    {
        return $this->filters ?? throw new LogicException('The filters exist only after validation.');
    }

    protected function passedValidation(): void
    {
        /** @var array<array-key, mixed> $filters */
        $filters = $this->validated('filters');

        try {
            $this->filters = app(SearchFiltersNormaliser::class)->normalise($filters, forRadar: true);
        } catch (FilterRejected $e) {
            throw ValidationException::withMessages(["filters.{$e->field}" => $e->getMessage()]);
        }
    }
}
