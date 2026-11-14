<?php

namespace App\Exceptions;

use RuntimeException;
use Throwable;

/**
 * An outcome of an /api/v1 method that the client handles by its `code` (ADR-0007 as amended by ADR-0017).
 * `ApiExceptionRenderer` writes it as `{"success": false, "message", "code", ...$extra}` with its status and headers.
 *
 * The code lives in `errorCode`: PHP refuses to redeclare `Exception::$code` as a typed or readonly property.
 */
abstract class ApiException extends RuntimeException
{
    /**
     * @param  array<string, string>  $headers
     * @param  array<string, mixed>  $extra  more top-level keys of the error body; they never replace `success`, `message` or `code`
     */
    public function __construct(
        string $message,
        public readonly int $status,
        public readonly string $errorCode,
        public readonly array $headers = [],
        public readonly array $extra = [],
        ?Throwable $previous = null,
    ) {
        parent::__construct($message, 0, $previous);
    }
}
