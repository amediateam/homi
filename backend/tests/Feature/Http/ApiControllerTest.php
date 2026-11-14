<?php

use App\Enums\SourceDriver;
use App\Http\Controllers\Api\V1\ApiController;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Http\Resources\Json\ResourceCollection;
use Illuminate\Pagination\LengthAwarePaginator;

function apiControllerForTest(): ApiController
{
    return new class extends ApiController
    {
        public function ok(): JsonResponse
        {
            return $this->success(['a' => 1]);
        }

        public function created(): JsonResponse
        {
            return $this->success(['id' => 'x'], 'Created', 201);
        }

        public function withMeta(): JsonResponse
        {
            return $this->success([1, 2], meta: ['count' => 2]);
        }

        public function failed(): JsonResponse
        {
            return $this->error('Nope', 404, ['field' => ['is wrong']]);
        }

        public function failedWithCode(): JsonResponse
        {
            return $this->error('Gone', 410, code: 'listing_gone');
        }

        /** @param  array<string, mixed>  $meta */
        public function fromSource(mixed $data, SourceDriver $source, array $meta = [], int $status = 200): JsonResponse
        {
            return $this->sourced($data, $source, $meta, $status);
        }

        public function cursor(ResourceCollection $items, ?string $next, SourceDriver $source): JsonResponse
        {
            return $this->cursorPage($items, $next, $source);
        }

        public function page(): JsonResponse
        {
            $paginator = new LengthAwarePaginator(
                items: [['id' => 21], ['id' => 22]],
                total: 45,
                perPage: 20,
                currentPage: 2,
                options: ['path' => 'https://api.homi.test/api/v1/items', 'pageName' => 'page[number]'],
            );

            return $this->paginated($paginator, JsonResource::class);
        }
    };
}

it('wraps data in the success envelope without a message by default', function (): void {
    $response = apiControllerForTest()->ok();

    expect($response->getStatusCode())->toBe(200)
        ->and($response->getData(true))->toBe(['success' => true, 'data' => ['a' => 1]]);
});

it('includes the message and status when given', function (): void {
    $response = apiControllerForTest()->created();

    expect($response->getStatusCode())->toBe(201)
        ->and($response->getData(true))->toBe(['success' => true, 'message' => 'Created', 'data' => ['id' => 'x']]);
});

it('includes meta only when provided', function (): void {
    $data = apiControllerForTest()->withMeta()->getData(true);

    expect($data)->toBe(['success' => true, 'data' => [1, 2], 'meta' => ['count' => 2]]);
});

it('formats errors with success false, message, the default code and errors', function (): void {
    $response = apiControllerForTest()->failed();

    expect($response->getStatusCode())->toBe(404)
        ->and($response->getData(true))->toBe(['success' => false, 'message' => 'Nope', 'code' => 'error', 'errors' => ['field' => ['is wrong']]]);
});

it('writes the given error code', function (): void {
    $response = apiControllerForTest()->failedWithCode();

    expect($response->getStatusCode())->toBe(410)
        ->and($response->getData(true))->toBe(['success' => false, 'message' => 'Gone', 'code' => 'listing_gone']);
});

it('paginates with the ADR-0007 meta and links shape', function (): void {
    $data = apiControllerForTest()->page()->getData(true);

    expect($data['success'])->toBeTrue()
        ->and($data['data'])->toBe([['id' => 21], ['id' => 22]])
        ->and($data['meta'])->toBe(['page' => 2, 'size' => 20, 'total' => 45, 'last_page' => 3])
        ->and($data['links']['next'])->toContain('page%5Bnumber%5D=3')
        ->and($data['links']['prev'])->toContain('page%5Bnumber%5D=1');
});

it('says which driver produced the data', function (): void {
    $response = apiControllerForTest()->fromSource(['a' => 1], SourceDriver::Stub);

    expect($response->getStatusCode())->toBe(200)
        ->and($response->getData(true))->toBe(['success' => true, 'data' => ['a' => 1], 'meta' => ['source' => 'stub']]);
});

it('adds meta and a status to a sourced answer and keeps the driver honest', function (): void {
    $response = apiControllerForTest()->fromSource(['id' => 1], SourceDriver::Legacy, ['source' => 'native', 'total' => 3], 201);

    expect($response->getStatusCode())->toBe(201)
        ->and($response->getData(true))->toBe(['success' => true, 'data' => ['id' => 1], 'meta' => ['source' => 'legacy', 'total' => 3]]);
});

it('resolves a resource in a sourced answer', function (): void {
    $data = apiControllerForTest()->fromSource(new JsonResource(['id' => 9]), SourceDriver::Native)->getData(true);

    expect($data)->toBe(['success' => true, 'data' => ['id' => 9], 'meta' => ['source' => 'native']]);
});

it('ends a cursor list with a null next cursor', function (): void {
    $data = apiControllerForTest()->cursor(JsonResource::collection([['id' => 1], ['id' => 2]]), null, SourceDriver::Stub)->getData(true);

    expect($data)->toBe(['success' => true, 'data' => [['id' => 1], ['id' => 2]], 'meta' => ['next_cursor' => null, 'source' => 'stub']]);
});

it('carries the next cursor of a cursor list', function (): void {
    $data = apiControllerForTest()->cursor(JsonResource::collection([['id' => 1]]), 'c2', SourceDriver::Legacy)->getData(true);

    expect($data)->toBe(['success' => true, 'data' => [['id' => 1]], 'meta' => ['next_cursor' => 'c2', 'source' => 'legacy']]);
});

it('writes a cursor list as a JSON list even when the keys have gaps', function (): void {
    $fromArray = apiControllerForTest()->cursor(JsonResource::collection([3 => ['id' => 3], 7 => ['id' => 7]]), null, SourceDriver::Stub);
    $fromCollection = apiControllerForTest()->cursor(JsonResource::collection(collect([['id' => 1], null, ['id' => 2]])->filter()), null, SourceDriver::Stub);

    expect($fromArray->getContent())->toContain('"data":[{"id":3},{"id":7}]')
        ->and($fromCollection->getContent())->toContain('"data":[{"id":1},{"id":2}]');
});
