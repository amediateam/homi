<?php

namespace Tests\Support;

use App\Enums\SourceDriver;
use App\Http\Controllers\Api\V1\ApiController;
use Illuminate\Http\JsonResponse;

/** `GET /api/v1/_test/sourced` and `GET /api/v1/_test/sourced-list`: what the OpenAPI export sees of the helpers. */
final class FakeSourcedController extends ApiController
{
    public function show(): JsonResponse
    {
        return $this->sourced(new FakeSourcedResource(['number' => 7, 'title' => 'Flat']), SourceDriver::Stub);
    }

    public function index(): JsonResponse
    {
        return $this->cursorPage(FakeSourcedResource::collection([['number' => 7, 'title' => 'Flat']]), $this->nextCursor(), SourceDriver::Stub);
    }

    /** A real page has a cursor or none; the export must see `string|null`, not the literal of one call. */
    private function nextCursor(): ?string
    {
        return request()->query('cursor') === null ? null : 'next';
    }
}
