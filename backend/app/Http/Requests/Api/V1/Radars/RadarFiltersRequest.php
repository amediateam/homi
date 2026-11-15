<?php

namespace App\Http\Requests\Api\V1\Radars;

use App\Services\Search\FilterRejected;
use App\Services\Search\SearchFilters;
use App\Services\Search\SearchFiltersNormaliser;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\ValidationException;
use Illuminate\Validation\Validator;
use LogicException;

/**
 * A radar body with filters (WP-13): `filters` is normalised by the filter rules of WP-12 for a radar (`forRadar`),
 * and a value it rejects is a `422` under `filters.<key>`. `relaxed` names the relaxed rule the radar came from.
 *
 * `filters` is checked in `after()`, not in `rules()`: Scramble reads the `array` rule as a list of strings, so the
 * export takes the object type from the `#[BodyParameter]` of the controller (as `props` of `POST /events`).
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
            'relaxed' => ['nullable', 'string', 'regex:/^[a-z_]{1,32}$/'],
        ];
    }

    /** The normalised filters; available once the request is validated. */
    public function filters(): SearchFilters
    {
        return $this->filters ?? throw new LogicException('The filters exist only after validation.');
    }

    /** @return list<callable(Validator): void> */
    public function after(): array
    {
        return [function (Validator $validator): void {
            $filters = $this->input('filters');

            if (! is_array($filters) || $filters === [] || array_is_list($filters)) {
                $validator->errors()->add('filters', 'The filters field must be an object with at least city and deal.');
            }
        }];
    }

    protected function passedValidation(): void
    {
        /** @var array<array-key, mixed> $filters */
        $filters = $this->input('filters');

        try {
            $this->filters = app(SearchFiltersNormaliser::class)->normalise($filters, forRadar: true);
        } catch (FilterRejected $e) {
            throw ValidationException::withMessages(["filters.{$e->field}" => $e->getMessage()]);
        }
    }
}
