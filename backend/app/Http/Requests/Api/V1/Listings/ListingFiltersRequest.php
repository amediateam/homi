<?php

namespace App\Http\Requests\Api\V1\Listings;

use App\Enums\Deal;
use App\Enums\Market;
use App\Enums\OwnerFilter;
use App\Enums\PropertyType;
use App\Enums\Tenant;
use App\Services\Search\FilterRejected;
use App\Services\Search\SearchFilters;
use App\Services\Search\SearchFiltersNormaliser;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use LogicException;

/**
 * The filter parameters of the feed, count, new-since, flow and map (WP-12, "Filter parameters"): one table, one
 * request class. The rules document and pre-check the parameters; `SearchFiltersNormaliser` then builds the filters
 * with the rules that need the reference data and the deal, and a value it rejects is a `422` naming the parameter.
 * Unknown parameters are ignored; booleans are `true` or `false`; arrays are repeated bracket keys.
 */
class ListingFiltersRequest extends FormRequest
{
    private const array BOOLEAN = ['true', 'false'];

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
        $flag = ['nullable', Rule::in(self::BOOLEAN)];
        $codes = ['nullable', 'array', 'list', 'max:100'];
        $code = ['string', 'max:64'];

        return [
            'city' => ['required', 'string', 'max:64'],
            'deal' => ['required', Rule::enum(Deal::class)],
            'owner' => ['nullable', Rule::enum(OwnerFilter::class)],
            'types' => $codes,
            'types.*' => [Rule::enum(PropertyType::class)],
            'districts' => $codes,
            'districts.*' => $code,
            'zones' => $codes,
            'zones.*' => $code,
            'rooms_min' => ['nullable', 'integer', 'between:0,10'],
            'rooms_max' => ['nullable', 'integer', 'between:0,10'],
            'price_min' => ['nullable', 'integer', 'min:1'],
            'price_max' => ['nullable', 'integer', 'min:1'],
            'area_min' => ['nullable', 'integer', 'between:1,10000'],
            'area_max' => ['nullable', 'integer', 'between:1,10000'],
            'posted_days' => ['nullable', 'integer', Rule::in([1, 3, 7])],
            'furnished' => $flag,
            'renovation' => $codes,
            'renovation.*' => $code,
            'appliances' => $codes,
            'appliances.*' => $code,
            'floor_not_first' => $flag,
            'floor_not_last' => $flag,
            'near_metro' => $flag,
            'below_median' => $flag,
            'pets' => $flag,
            'pets_only' => $flag,
            'market' => ['nullable', Rule::enum(Market::class)],
            'tenant' => ['nullable', Rule::enum(Tenant::class)],
            'polygon' => ['nullable', 'string', 'max:2000'],
        ];
    }

    /** The normalised filters; available once the request is validated. */
    public function filters(): SearchFilters
    {
        return $this->filters ?? throw new LogicException('The filters exist only after validation.');
    }

    protected function passedValidation(): void
    {
        try {
            $this->filters = app(SearchFiltersNormaliser::class)->normalise($this->validated());
        } catch (FilterRejected $e) {
            throw ValidationException::withMessages([$e->field => $e->getMessage()]);
        }
    }
}
