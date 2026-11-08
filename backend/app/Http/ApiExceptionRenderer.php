<?php

namespace App\Http;

use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Throwable;

/**
 * Renders every exception of an API request as the ADR-0007 error envelope.
 * Registered in bootstrap/app.php; returns null for non-API requests so the default
 * HTML rendering still applies to the Inertia pages.
 */
final class ApiExceptionRenderer
{
    public static function render(Throwable $e, Request $request): ?JsonResponse
    {
        if (! self::isApiRequest($request)) {
            return null;
        }

        return match (true) {
            $e instanceof ValidationException => self::json($e->getMessage(), $e->status, $e->errors()),
            $e instanceof AuthenticationException => self::json($e->getMessage() ?: 'Unauthenticated.', 401),
            $e instanceof AuthorizationException => self::json(
                $e->getMessage() ?: 'This action is unauthorized.',
                $e->hasStatus() ? (int) $e->status() : 403,
            ),
            $e instanceof ModelNotFoundException, $e instanceof NotFoundHttpException => self::json('Resource not found.', 404),
            $e instanceof HttpExceptionInterface => self::json(
                $e->getMessage() ?: (Response::$statusTexts[$e->getStatusCode()] ?? 'Error'),
                $e->getStatusCode(),
                headers: $e->getHeaders(),
            ),
            default => self::json(config('app.debug') ? $e->getMessage() : 'Server Error', 500),
        };
    }

    public static function isApiRequest(Request $request): bool
    {
        return $request->is('api/*') || $request->expectsJson();
    }

    /**
     * @param  array<string, array<int, string>>|null  $errors
     * @param  array<string, string>  $headers
     */
    private static function json(string $message, int $status, ?array $errors = null, array $headers = []): JsonResponse
    {
        $body = ['success' => false, 'message' => $message];

        if ($errors !== null) {
            $body['errors'] = $errors;
        }

        return new JsonResponse($body, $status, $headers);
    }
}
