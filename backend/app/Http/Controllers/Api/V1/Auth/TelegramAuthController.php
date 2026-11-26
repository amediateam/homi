<?php

namespace App\Http\Controllers\Api\V1\Auth;

use App\Enums\SourceDriver;
use App\Exceptions\AccessDenied;
use App\Exceptions\Identity\InitDataExpired;
use App\Exceptions\Identity\InvalidInitData;
use App\Http\Controllers\Api\V1\ApiController;
use App\Http\Requests\Api\V1\Auth\TelegramSignInRequest;
use App\Http\Resources\Api\V1\SessionResource;
use App\Services\Identity\MeProfile;
use App\Services\Identity\TelegramSignIn;
use Illuminate\Http\Exceptions\ThrottleRequestsException;
use Illuminate\Http\JsonResponse;

/**
 * `POST /auth/telegram` (WP-11; native since WP-40): exchanges the Telegram launch value for a bearer token of the
 * signed-in user and answers it with his `GET /me` object. `TelegramSignIn` verifies, counts, resolves the user, asks
 * the access gate and issues the token. Its stub body answers from `NativeStubs` while `SOURCES_NATIVE_STUBS` is on.
 */
class TelegramAuthController extends ApiController
{
    /**
     * @throws InvalidInitData
     * @throws InitDataExpired
     * @throws ThrottleRequestsException
     * @throws AccessDenied
     */
    public function __invoke(TelegramSignInRequest $request, TelegramSignIn $signIn, MeProfile $profile): JsonResponse
    {
        $session = $signIn->exchange($request->initData());

        return $this->sourced(new SessionResource($session->token, $session->expiresAt, $profile->for($session->user)), SourceDriver::Native);
    }
}
