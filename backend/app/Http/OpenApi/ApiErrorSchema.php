<?php

namespace App\Http\OpenApi;

use Dedoc\Scramble\Contracts\DocumentTransformer;
use Dedoc\Scramble\OpenApiContext;
use Dedoc\Scramble\Support\Generator\OpenApi;
use Dedoc\Scramble\Support\Generator\Response;
use Dedoc\Scramble\Support\Generator\Schema;
use Dedoc\Scramble\Support\Generator\Types\ArrayType;
use Dedoc\Scramble\Support\Generator\Types\BooleanType;
use Dedoc\Scramble\Support\Generator\Types\ObjectType;
use Dedoc\Scramble\Support\Generator\Types\StringType;

/**
 * Every error answer of /api/v1 has one body, written by `ApiExceptionRenderer` (ADR-0007 as amended by ADR-0017):
 * `{"success": false, "message", "code", "errors"?}`. Scramble documents each exception with its own default body;
 * this transformer adds the shared `ApiError` schema and points every error response at it.
 */
final class ApiErrorSchema implements DocumentTransformer
{
    public function handle(OpenApi $document, OpenApiContext $context): void
    {
        $schema = Schema::fromType($document->components->addSchema('ApiError', Schema::fromType($this->type())));

        foreach ($document->components->responses as $response) {
            if ($response instanceof Response) {
                $response->setContent('application/json', $schema);
            }
        }

        foreach ($document->paths as $path) {
            foreach ($path->operations as $operation) {
                foreach ($operation->responses as $response) {
                    if ($response instanceof Response && (int) $response->code >= 400) {
                        $response->setContent('application/json', $schema);
                    }
                }
            }
        }
    }

    private function type(): ObjectType
    {
        return (new ObjectType)
            ->addProperty('success', (new BooleanType)->enum([false]))
            ->addProperty('message', (new StringType)->setDescription('Human-readable summary; not for program logic.'))
            ->addProperty('code', (new StringType)->setDescription('Stable machine-readable code, snake_case (docs/api/README.md).'))
            ->addProperty('errors', (new ObjectType)
                ->setDescription('Validation errors by field (422).')
                ->additionalProperties((new ArrayType)->setItems(new StringType)))
            ->setRequired(['success', 'message', 'code']);
    }
}
