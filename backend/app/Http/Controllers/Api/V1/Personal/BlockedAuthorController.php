<?php

namespace App\Http\Controllers\Api\V1\Personal;

use App\Enums\SourceDriver;
use App\Exceptions\Sources\SourceNotFound;
use App\Http\Controllers\Api\V1\ApiController;
use App\Http\Resources\Api\V1\BlockedAuthorResultResource;
use App\Services\Personal\BlockedAuthor;
use App\Services\Sources\SourceManager;
use App\Services\Sources\Stub\StubListingRefs;
use App\Services\Sources\Stub\StubResponder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/**
 * Blocking the author of a listing on stubs (WP-13; HOMI's table from WP-44). The author is the card's `author`
 * (`404 not_found` when the listing has none); the entry id and the author's other listings come from
 * `hidden/blocked_author.json`. Both calls are idempotent.
 */
class BlockedAuthorController extends ApiController
{
    public function __construct(private readonly StubResponder $stubs, private readonly SourceManager $sources, private readonly StubListingRefs $refs) {}

    /** `PUT /listings/{number}/blocked-author`. */
    public function update(Request $request, int $number): JsonResponse
    {
        $context = $this->stubs->check($request);
        $card = $this->sources->listings('source.listings.card', $context)->source->details($number > 0 ? $number : throw new SourceNotFound('Listing not found.'), $context);

        if ($card->authorKind === null || $card->authorLabel === null) {
            throw new SourceNotFound('The listing has no author.');
        }

        $entry = new BlockedAuthor(
            id: $this->refs->entryId('hidden/blocked_author'),
            kind: $card->authorKind,
            label: $card->authorLabel,
            count: (int) $card->authorCount,
            listingNumbers: $this->refs->numbers('hidden/blocked_author', 'listing_numbers'),
        );

        return $this->sourced(new BlockedAuthorResultResource($entry), SourceDriver::Stub);
    }

    /** `DELETE /listings/{number}/blocked-author`: the undo by listing. */
    public function destroy(Request $request, int $number): Response
    {
        $this->stubs->check($request);

        return $number > 0 ? $this->noContent() : throw new SourceNotFound('Listing not found.');
    }
}
