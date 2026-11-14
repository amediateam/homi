<?php

namespace App\Http;

use App\Exceptions\ApiException;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Throwable;

/**
 * Renders every exception of an API request as the ADR-0007 error envelope, `code` included (ADR-0017).
 * Registered in bootstrap/app.php; returns null for non-API requests so the default
 * HTML rendering still applies to the Inertia pages.
 *
 * The framework prepares an exception before this callback sees it
 * (`Illuminate\Foundation\Exceptions\Handler::prepareException()`): a `ModelNotFoundException` arrives as a
 * `NotFoundHttpException`, an `AuthorizationException` (Sanctum's `MissingAbilityException` too) as an
 * `AccessDeniedHttpException` or an `HttpException` with its own status. Those codes are therefore chosen by the
 * status of the HTTP exception. An exception with its own `render()` method (`MediaException`) never gets here.
 */
final class ApiExceptionRenderer
{
    /** Codes of HTTP exceptions by status; any other status is `http_error`. */
    private const array HTTP_CODES = [
        403 => 'forbidden',
        404 => 'not_found',
        413 => 'payload_too_large',
        429 => 'rate_limited',
    ];

    public static function render(Throwable $e, Request $request): ?JsonResponse
    {
        if (! self::isApiRequest($request)) {
            return null;
        }

        return match (true) {
            $e instanceof ApiException => self::json($e->getMessage(), $e->status, $e->errorCode, headers: $e->headers, extra: $e->extra),
            $e instanceof ValidationException => self::json($e->getMessage(), $e->status, 'validation_failed', $e->errors()),
            $e instanceof AuthenticationException => self::json($e->getMessage() ?: 'Unauthenticated.', 401, 'unauthenticated'),
            $e instanceof HttpExceptionInterface => self::http($e),
            default => self::json(config('app.debug') ? $e->getMessage() : 'Server Error', 500, 'server_error'),
        };
    }

    public static function isApiRequest(Request $request): bool
    {
        return $request->is('api/*') || $request->expectsJson();
    }

    private static function http(HttpExceptionInterface $e): JsonResponse
    {
        $status = $e->getStatusCode();
        $message = match ($status) {
            404 => 'Resource not found.',
            403 => $e->getMessage() ?: 'This action is unauthorized.',
            default => $e->getMessage() ?: (Response::$statusTexts[$status] ?? 'Error'),
        };

        return self::json($message, $status, self::HTTP_CODES[$status] ?? 'http_error', headers: $e->getHeaders());
    }

    /**
     * @param  array<string, array<int, string>>|null  $errors
     * @param  array<string, string>  $headers
     * @param  array<string, mixed>  $extra
     */
    private static function json(string $message, int $status, string $code, ?array $errors = null, array $headers = [], array $extra = []): JsonResponse
    {
        $body = ['success' => false, 'message' => $message, 'code' => $code];

        if ($errors !== null) {
            $body['errors'] = $errors;
        }

        return new JsonResponse($body + $extra, $status, $headers);
    }
}
