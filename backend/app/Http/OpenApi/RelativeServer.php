<?php

namespace App\Http\OpenApi;

use Dedoc\Scramble\Contracts\DocumentTransformer;
use Dedoc\Scramble\OpenApiContext;
use Dedoc\Scramble\Support\Generator\OpenApi;
use Dedoc\Scramble\Support\Generator\Server;

/**
 * Names the server as `/api/v1`, relative to the host that serves the document (OpenAPI 3.1 allows it). Scramble
 * would build an absolute URL from `APP_URL`, so the committed `docs/api/openapi.json` would differ between machines
 * and CI would report it stale.
 */
final class RelativeServer implements DocumentTransformer
{
    public function handle(OpenApi $document, OpenApiContext $context): void
    {
        $document->servers = [Server::make('/'.trim((string) config('scramble.api_path', 'api/v1'), '/'))];
    }
}
