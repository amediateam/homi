<?php

namespace Tests\Support;

use App\Http\Controllers\Api\V1\ApiController;
use App\Models\User;
use App\Services\Sources\SourceContext;
use App\Services\Sources\SourceManager;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use Laravel\Pennant\Feature;

/** `GET /api/v1/_test/fake`: a controller written the way the contract packages write theirs (WP-10). */
final class FakeCapabilityController extends ApiController
{
    public const string FEATURE = 'source.fake';

    /**
     * Configures the capability `fake`, the feature `source.fake` and the route.
     *
     * @param  array<string, string>  $default  environment name or `*` => driver
     * @param  array<string, class-string<FakeCapability>>  $drivers
     */
    public static function install(array $default = ['*' => 'stub'], array $drivers = ['stub' => FakeStubSource::class, 'legacy' => FakeLegacySource::class]): void
    {
        // Feature names contain dots, so the features map is written whole, never through a dotted config key.
        config([
            'sources.capabilities.fake' => ['contract' => FakeCapability::class, 'drivers' => $drivers],
            'sources.features' => [...config('sources.features', []), self::FEATURE => ['capability' => 'fake', 'default' => $default]],
        ]);
        Feature::define(self::FEATURE, []);
        Route::get('api/v1/_test/fake', self::class);
    }

    /**
     * Stores the rule of `source.fake` the way an operator change would, without the commands.
     *
     * @param  array<string, mixed>  $rule
     */
    public static function storeRule(array $rule): void
    {
        Feature::globally()->activate(self::FEATURE, $rule);
    }

    /** A user that exists only in memory: the selector needs nothing but the id. */
    public static function user(int $id): User
    {
        return (new User)->forceFill(['id' => $id]);
    }

    public function __invoke(Request $request, SourceManager $sources): JsonResponse
    {
        $context = SourceContext::fromRequest($request);
        $resolved = $sources->resolve(self::FEATURE, $context);

        return $this->sourced($resolved->source->answer($context), $resolved->driver);
    }
}
