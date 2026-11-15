<?php

namespace App\Http\Resources\Api\V1;

use App\Services\Sources\Data\NamedCode;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** `{code, name}`: a district, a zone, a renovation, an appliance, a locale or a currency. */
class NamedCodeResource extends JsonResource
{
    public function __construct(private readonly NamedCode $item)
    {
        parent::__construct($item);
    }

    /** @return array{code: string, name: string} */
    public function toArray(Request $request): array
    {
        return [
            'code' => $this->item->code,
            'name' => $this->item->name,
        ];
    }
}
