<?php

namespace App\Exceptions;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use RuntimeException;

/**
 * A media request that cannot be fulfilled; rendered as the API error envelope with a
 * machine-readable `reason`, repeated as `code` (ADR-0017). Validation-type failures (422) also fill
 * `errors.file`. The framework calls `render()` before any render callback, so `ApiExceptionRenderer`
 * never sees this exception.
 */
class MediaException extends RuntimeException
{
    public function __construct(
        string $message,
        public readonly string $reason,
        public readonly int $status = 422,
        public readonly string $field = 'file',
    ) {
        parent::__construct($message);
    }

    public static function unsupportedMime(string $mime): self
    {
        return new self("Unsupported file type \"{$mime}\". Allowed: JPEG, PNG, WebP, GIF.", 'unsupported_mime');
    }

    public static function tooLarge(int $bytes, int $max): self
    {
        return new self(sprintf('The file is %d bytes; the limit is %d bytes.', $bytes, $max), 'too_large');
    }

    public static function tooBig(int $width, int $height, int $max): self
    {
        return new self(sprintf('The image is %dx%d px; each side may be at most %d px.', $width, $height, $max), 'too_big');
    }

    public static function undecodable(): self
    {
        return new self('The file could not be decoded as an image.', 'undecodable');
    }

    public static function presignUnavailable(string $disk): self
    {
        return new self(
            "Direct uploads are not available in this environment (disk \"{$disk}\" has no presigned URLs). Upload through POST /api/v1/media instead.",
            'presign_unavailable',
            409,
            'key',
        );
    }

    public static function uploadNotFound(string $key): self
    {
        return new self("No uploaded object found at \"{$key}\" (expired or never uploaded).", 'upload_not_found', 404, 'key');
    }

    public static function foreignUpload(): self
    {
        return new self('This upload key does not belong to the authenticated user.', 'forbidden_upload', 403, 'key');
    }

    public function render(Request $request): JsonResponse
    {
        $body = ['success' => false, 'message' => $this->getMessage(), 'code' => $this->reason, 'reason' => $this->reason];

        if ($this->status === 422) {
            $body['errors'] = [$this->field => [$this->getMessage()]];
        }

        return new JsonResponse($body, $this->status);
    }
}
