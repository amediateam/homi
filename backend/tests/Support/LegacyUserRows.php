<?php

namespace Tests\Support;

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * The rows the users table held before WP-40 — the stub user of WP-11 with its tokens, two ordinary users with one
 * token, and a collector token whose id equals the stub user's — for the tests of the migration
 * `add_telegram_identity_to_users_table`, which run its `down()` and `up()` over them.
 */
final class LegacyUserRows
{
    public const string MIGRATION = 'migrations/2026_11_26_100040_add_telegram_identity_to_users_table.php';

    public static function migration(): Migration
    {
        return require database_path(self::MIGRATION);
    }

    /**
     * Inserts the rows through the query builder, as the schema before WP-40 takes them.
     *
     * @return array{stub: int, first: int, second: int, stub_tokens: list<int>, first_token: int, source_token: int}
     */
    public static function insert(): array
    {
        $now = now();
        $stub = (int) DB::table('users')->insertGetId(['name' => 'HOMI stub user', 'email' => 'stub@homi.invalid', 'password' => 'x', 'created_at' => $now, 'updated_at' => $now]);
        $first = (int) DB::table('users')->insertGetId(['name' => 'Test User', 'email' => 'test@example.com', 'password' => 'x', 'created_at' => $now, 'updated_at' => $now]);
        $second = (int) DB::table('users')->insertGetId(['name' => 'Other User', 'email' => 'other@example.com', 'password' => 'x', 'created_at' => $now, 'updated_at' => $now]);

        return [
            'stub' => $stub,
            'first' => $first,
            'second' => $second,
            'stub_tokens' => [self::token('App\Models\User', $stub, 'a'), self::token('App\Models\User', $stub, 'b')],
            'first_token' => self::token('App\Models\User', $first, 'c'),
            'source_token' => self::token('App\Models\Source', $stub, 'd'),
        ];
    }

    private static function token(string $type, int $id, string $seed): int
    {
        return (int) DB::table('personal_access_tokens')->insertGetId([
            'tokenable_type' => $type,
            'tokenable_id' => $id,
            'name' => 'miniapp',
            'token' => hash('sha256', $seed),
            'abilities' => '["app:read","app:write"]',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }
}
