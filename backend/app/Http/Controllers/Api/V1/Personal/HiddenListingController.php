<?php

namespace App\Http\Controllers\Api\V1\Personal;

use App\Exceptions\Sources\SourceNotFound;
use App\Http\Controllers\Api\V1\ApiController;
use App\Services\Sources\Stub\StubListingRefs;
use App\Services\Sources\Stub\StubResponder;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/**
 * Hidden listings on stubs (WP-13; HOMI's table from WP-44). Both calls are idempotent; `DELETE` is also the undo
 * after a `fraud` report and does not look the listing up.
 */
class HiddenListingController extends ApiController
{
    public function __construct(private readonly StubResponder $stubs, private readonly StubListingRefs $refs) {}

    /** `PUT /hidden/listings/{number}`: the listing must exist. */
    public function update(Request $request, int $number): Response
    {
        $context = $this->stubs->check($request);
        $this->refs->preview($number > 0 ? $number : throw new SourceNotFound('Listing not found.'), $context);

        return $this->noContent();
    }

    /** `DELETE /hidden/listings/{number}`. */
    public function destroy(Request $request, int $number): Response
    {
        $this->stubs->check($request);

        return $number > 0 ? $this->noContent() : throw new SourceNotFound('Listing not found.');
    }
}
