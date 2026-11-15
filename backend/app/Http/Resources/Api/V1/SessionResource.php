<?php

namespace App\Http\Resources\Api\V1;

use DateTimeInterface;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\NewAccessToken;

/**
 * The answer of `POST /auth/telegram` (WP-11): an opaque bearer token, when it expires, and the object of `GET /me`.
 *
 * @property-read NewAccessToken $resource
 */
class SessionResource extends JsonResource
{
    /** @param  array<array-key, mixed>  $me */
    public function __construct(
        private readonly NewAccessToken $token,
        private readonly DateTimeInterface $expiresAt,
        private readonly array $me,
    ) {
        parent::__construct($token);
    }

    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'token' => $this->token->plainTextToken,
            'token_type' => 'Bearer',
            'expires_at' => Carbon::instance($this->expiresAt)->utc()->toIso8601String(),
            'user' => new MeResource($this->me),
        ];
    }
}
