<?php

namespace App\Http\Controllers\Api\V1\Auth;

use App\Enums\SourceDriver;
use App\Exceptions\Identity\InitDataExpired;
use App\Exceptions\Identity\InvalidInitData;
use App\Http\Controllers\Api\V1\ApiController;
use App\Http\Controllers\Api\V1\MeController;
use App\Http\Requests\Api\V1\Auth\TelegramSignInRequest;
use App\Http\Resources\Api\V1\SessionResource;
use App\Services\Sources\Stub\StubResponder;
use App\Services\Sources\Stub\StubUser;
use Illuminate\Http\JsonResponse;

/**
 * `POST /auth/telegram` on stubs (WP-11): any valid body signs in the stub user; nothing is verified. The token is a
 * real Sanctum token (abilities `app:read`, `app:write`, 24 hours), so `auth:sanctum` works unchanged. WP-40 replaces
 * the body with the real verification and keeps this one for the end-to-end suite.
 */
class TelegramAuthController extends ApiController
{
    /** @var list<string> */
    public const array ABILITIES = ['app:read', 'app:write'];

    public function __invoke(TelegramSignInRequest $request, StubResponder $stubs): JsonResponse
    {
        $me = $stubs->fixture('me/default', $request, MeController::SCENARIOS, [
            'auth_expired' => fn (): InitDataExpired => new InitDataExpired,
            'invalid_init_data' => fn (): InvalidInitData => new InvalidInitData,
        ]);
        $expiresAt = now()->addDay();
        $token = StubUser::get()->createToken('miniapp', self::ABILITIES, $expiresAt);

        return $this->sourced(new SessionResource($token, $expiresAt, $me), SourceDriver::Stub);
    }
}
