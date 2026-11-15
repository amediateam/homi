<?php

namespace App\Http\Resources\Api\V1;

use App\Services\Sources\Data\ListingTranslation;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * `data` of `POST /listings/{number}/translation` (WP-12): the original text in the request locale, masked.
 *
 * @property-read ListingTranslation $resource
 */
class TranslationResource extends JsonResource
{
    public function __construct(private readonly ListingTranslation $translation)
    {
        parent::__construct($translation);
    }

    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return ['text' => $this->translation->text, 'locale' => $this->translation->locale];
    }
}
