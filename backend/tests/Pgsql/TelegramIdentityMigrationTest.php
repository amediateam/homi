<?php

use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Tests\Support\LegacyUserRows;

/*
 * The users migration of WP-40 over the rows of the schema before it, on PostgreSQL without the transaction of
 * `RefreshDatabase` (the feature suite runs the same inside it, on SQLite locally and on PostgreSQL in the backend CI):
 * `down()` first, the old rows, then `up()` again, which leaves the schema as the group found it. `up()`
 * runs inside one transaction, as the Migrator runs a migration on PostgreSQL (its grammar supports transactional
 * schema changes), so the deletes and the fill run in the same transaction as the column changes around them.
 */
it('deletes the stub user and its tokens and gives every other user its own analytics id on PostgreSQL', function (): void {
    $migration = LegacyUserRows::migration();
    $migration->down();
    $rows = LegacyUserRows::insert();
    expect(fn () => DB::table('users')->insert(['email' => 'nameless@example.com', 'password' => 'x']))->toThrow(QueryException::class);

    DB::transaction(fn () => $migration->up());

    $distinctIds = DB::table('users')->orderBy('id')->pluck('analytics_distinct_id', 'id');
    expect($distinctIds->keys()->all())->toBe([$rows['first'], $rows['second']])
        ->and($distinctIds->every(fn (mixed $id): bool => is_string($id) && Str::isUuid($id, 4)))->toBeTrue()
        ->and($distinctIds->unique())->toHaveCount(2)
        ->and(DB::table('personal_access_tokens')->orderBy('id')->pluck('id')->all())->toBe([$rows['first_token'], $rows['source_token']])
        ->and(fn () => DB::table('users')->insert(['telegram_user_id' => 279058398]))->toThrow(QueryException::class)
        ->and(fn () => DB::table('users')->insert(['analytics_distinct_id' => $distinctIds->first(), 'telegram_user_id' => 279058398]))->toThrow(QueryException::class);

    DB::table('users')->insert(['analytics_distinct_id' => (string) Str::uuid(), 'telegram_user_id' => 279058397]);
    expect(Schema::getColumnType('users', 'last_seen_at'))->toBe('timestamptz')
        ->and(DB::table('users')->whereNull('name')->count())->toBe(1);
});
