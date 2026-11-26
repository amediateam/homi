<?php

namespace App\Services\Sources\Stub;

use App\Enums\SourceDriver;
use App\Exceptions\Identity\InitDataExpired;
use App\Exceptions\Identity\InvalidInitData;
use App\Exceptions\Identity\InvalidInitDataReason;
use App\Http\Requests\Api\V1\Auth\TelegramSignInRequest;
use App\Http\Requests\Api\V1\UpdateSettingsRequest;
use App\Http\Resources\Api\V1\MeResource;
use App\Http\Resources\Api\V1\SessionResource;
use App\Http\Resources\Api\V1\SettingsResource;
use App\Services\Identity\TokenIssuer;
use Illuminate\Contracts\Container\Container;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use LogicException;

/**
 * The stub answers of the native methods whose controllers stage C has replaced (WP-40, `25` §9): while
 * `config('sources.native_stubs')` is on, `AnswerNativeStubs` answers a route named here with its stub body instead of
 * the controller, so the end-to-end suite keeps running on stubs. The switch exists only in `local` and `testing`
 * (`SourceServiceProvider` refuses it elsewhere).
 *
 * Rule for every package of stage C: when a stub controller body is replaced, the old body moves here, unchanged; it
 * is not deleted. Each body is called through the container, so its form request validates as it did in the
 * controller, and it answers the envelope of `ApiController::sourced()` with `meta.source = stub`.
 *
 * WP-40 moved here: sign-in (every value signs in the one stub user, nothing is verified, the token is not capped),
 * `GET /me`, `GET /settings` and `PATCH /settings`.
 */
final readonly class NativeStubs
{
    /**
     * The stub scenarios of the user object; sign-in answers the same user. `replay` is a profile sampled for replay
     * (`analytics.replay: true`, `replay_rate: 1`) for WP-32's analytics specs. Every profile has requests waiting for
     * none (`owner.pending: 0`), so the owner signals of WP-82 stay quiet; `owner_pending` has two, as the stub list's
     * listing `01JF…03`.
     *
     * @var array<string, string>
     */
    public const array ME_SCENARIOS = [
        'first_launch' => 'me/first_launch',
        'no_city' => 'me/no_city',
        'uz' => 'me/uz',
        'en' => 'me/en',
        'owner_empty' => 'me/owner_empty',
        'owner_waitlisted' => 'me/owner_waitlisted',
        'replay' => 'me/replay',
        'owner_pending' => 'me/owner_pending',
    ];

    /**
     * The scenario `card_rich` answers the settings of a user who chose the `rich` card style.
     *
     * @var array<string, string>
     */
    public const array SETTINGS_SCENARIOS = ['card_rich' => 'settings/card_rich'];

    /** @var array<string, string> route name => the method of this class that answers it */
    private const array ROUTES = [
        'api.v1.auth.telegram' => 'signIn',
        'api.v1.me.show' => 'me',
        'api.v1.settings.show' => 'settings',
        'api.v1.settings.update' => 'updateSettings',
    ];

    public function __construct(private Container $container) {}

    /** @return list<string> the route names that have a stub answer */
    public function routes(): array
    {
        return array_keys(self::ROUTES);
    }

    public function answers(string $route): bool
    {
        return isset(self::ROUTES[$route]);
    }

    /** The stub answer of the route; its dependencies (the form request among them) are resolved by the container. */
    public function answer(string $route): JsonResponse
    {
        $answer = $this->container->call([$this, self::ROUTES[$route]]);

        return $answer instanceof JsonResponse ? $answer : throw new LogicException("The stub of {$route} gave no JSON answer.");
    }

    /** `POST /auth/telegram` on stubs (WP-11): any valid body signs in the stub user; a real token of 24 hours. */
    public function signIn(TelegramSignInRequest $request, StubResponder $stubs): JsonResponse
    {
        $me = $stubs->fixture('me/default', $request, self::ME_SCENARIOS, [
            'auth_expired' => fn (): InitDataExpired => new InitDataExpired,
            'invalid_init_data' => fn (): InvalidInitData => new InvalidInitData(InvalidInitDataReason::BadSignature),
        ]);
        $expiresAt = now()->addDay();
        $token = StubUser::get()->createToken(TokenIssuer::NAME, TokenIssuer::ABILITIES, $expiresAt);

        return $this->sourced(new SessionResource($token, $expiresAt, $me));
    }

    /** `GET /me` on stubs (WP-11). */
    public function me(Request $request, StubResponder $stubs): JsonResponse
    {
        return $this->sourced(new MeResource($stubs->fixture('me/default', $request, self::ME_SCENARIOS)));
    }

    /** `GET /settings` on stubs (WP-11). */
    public function settings(Request $request, StubResponder $stubs): JsonResponse
    {
        return $this->sourced(new SettingsResource($stubs->fixture('settings/default', $request, self::SETTINGS_SCENARIOS)));
    }

    /** `PATCH /settings` on stubs (WP-11): validates and answers the fixture with the sent keys overlaid; nothing is stored. */
    public function updateSettings(UpdateSettingsRequest $request, StubResponder $stubs): JsonResponse
    {
        $settings = array_replace($stubs->fixture('settings/default', $request, self::SETTINGS_SCENARIOS), $request->validated());

        return $this->sourced(new SettingsResource($settings));
    }

    /** The envelope of `ApiController::sourced()` for a stub answer without extra meta. */
    private function sourced(JsonResource $data): JsonResponse
    {
        return response()->json([
            'success' => true,
            'data' => $data,
            'meta' => ['source' => SourceDriver::Stub],
        ]);
    }
}
