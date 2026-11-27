<?php

namespace App\Http\Controllers\Api\V1\Personal;

use App\Exceptions\Sources\SourceNotFound;
use App\Http\Controllers\Api\V1\ApiController;
use App\Services\Personal\HiddenService;
use App\Services\Personal\ListingResolver;
use App\Services\Sources\SourceContext;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/**
 * Hidden listings in HOMI's table (WP-44; the shapes of WP-13). Both calls are idempotent; `DELETE` is also the undo
 * after a `fraud` report and does not look the listing up. While `sources.native_stubs` is on, `NativeStubs` answers
 * the stub bodies of WP-13 instead.
 */
class HiddenListingController extends ApiController
{
    public function __construct(private readonly HiddenService $hidden, private readonly ListingResolver $resolver) {}

    /** `PUT /hidden/listings/{number}`: the listing must exist. */
    public function update(Request $request, int $number): Response
    {
        $this->hidden->hide($this->signedInUser($request), $this->resolver->resolve($number, SourceContext::fromRequest($request)));

        return $this->noContent();
    }

    /** `DELETE /hidden/listings/{number}`. */
    public function destroy(Request $request, int $number): Response
    {
        if ($number < 1) {
            throw new SourceNotFound('Listing not found.');
        }

        $this->hidden->unhide($this->signedInUser($request), $number);

        return $this->noContent();
    }
}
