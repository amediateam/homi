<?php

namespace Tests\Support;

use App\Models\Radar;
use App\Models\User;
use ArrayObject;
use Closure;
use Illuminate\Database\Events\QueryExecuted;
use Illuminate\Support\Facades\DB;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;

/** The radar route tests of WP-45: sign-in, bodies, the stored state of a user's radars and counted calls. */
final class RadarApi
{
    /** An id no radar has. */
    public const string UNKNOWN_ID = '01JF0000000000000000000099';

    /** Signs the user in for the next requests with the abilities of a Mini App token. */
    public static function actAs(User $user): void
    {
        app('auth')->forgetGuards();
        Sanctum::actingAs($user, ['app:read', 'app:write']);
    }

    /**
     * A `POST /radars` body: Tashkent long rent with the given filters.
     *
     * @param  array<string, mixed>  $filters
     * @param  array<string, mixed>  $overrides
     * @return array<string, mixed>
     */
    public static function body(array $filters = [], array $overrides = []): array
    {
        return ['filters' => ['city' => 'tashkent', 'deal' => 'rent_long', ...$filters], 'entry' => 'filters', ...$overrides];
    }

    /**
     * Every radar of the user with its hide rules, as stored.
     *
     * @return list<array<string, mixed>>
     */
    public static function rowsOf(User $user): array
    {
        return array_map(fn (object $row): array => [
            ...(array) $row,
            'rules' => DB::table('radar_hide_rules')->where('radar_id', $row->id)->orderBy('id')->get()->map(fn (object $rule): array => (array) $rule)->all(),
        ], DB::table('radars')->where('user_id', $user->id)->orderBy('id')->get()->all());
    }

    /**
     * The response of the call and the statements it sent.
     *
     * @param  Closure(): TestResponse  $call
     * @return array{0: TestResponse, 1: list<string>}
     */
    public static function counted(Closure $call): array
    {
        $statements = new ArrayObject;
        DB::listen(function (QueryExecuted $query) use ($statements): void {
            $statements[] = $query->sql;
        });
        $response = $call();

        return [$response, array_values($statements->getArrayCopy())];
    }

    /**
     * The statements among them that name a radar table.
     *
     * @param  list<string>  $statements
     * @return list<string>
     */
    public static function radarStatements(array $statements): array
    {
        return array_values(array_filter($statements, fn (string $sql): bool => preg_match('/\b(?:radars|radar_hide_rules)\b/', $sql) === 1));
    }

    /**
     * Another user's call on the owner's radar answers exactly as a call on an unknown id — status, body and the
     * number of statements (`15` §3.1 rows 1–3, SEC-REQ-014) — and leaves the owner's radars as they were.
     *
     * @param  array<string, mixed>  $body
     */
    public static function assertForeignLikeUnknown(User $owner, Radar $radar, string $method, string $suffix, array $body): void
    {
        $before = self::rowsOf($owner);
        self::actAs(User::factory()->create());
        // The first calls read the caller's standing at the access gate and the source rules, which are then kept.
        test()->getJson('/api/v1/radars')->assertOk();
        test()->json($method, '/api/v1/radars/'.self::UNKNOWN_ID.$suffix, $body)->assertNotFound();

        [$foreign, $foreignStatements] = self::counted(fn (): TestResponse => test()->json($method, "/api/v1/radars/{$radar->id}{$suffix}", $body));
        [$unknown, $unknownStatements] = self::counted(fn (): TestResponse => test()->json($method, '/api/v1/radars/'.self::UNKNOWN_ID.$suffix, $body));

        $foreign->assertNotFound()->assertJsonPath('code', 'not_found');
        expect($foreign->status())->toBe($unknown->status())
            ->and($foreign->getContent())->toBe($unknown->getContent())
            ->and(count($foreignStatements))->toBe(count($unknownStatements))
            ->and(self::rowsOf($owner))->toBe($before);
    }
}
