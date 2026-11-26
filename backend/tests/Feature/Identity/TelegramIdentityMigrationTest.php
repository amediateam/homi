<?php

use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Tests\Support\LegacyUserRows;

/*
 * The users migration of WP-40 over the rows of the schema before it: `down()` first, the old rows, then `up()` again.
 * The suite runs on SQLite locally and on PostgreSQL in the backend CI (`.github/workflows/backend.yml`), inside the
 * transaction of `RefreshDatabase`; a failing statement would abort that transaction on PostgreSQL, so each statement
 * expected to fail runs in its own savepoint (`DB::transaction()`), which rolls back to the savepoint and rethrows.
 */

it('deletes the stub user and its tokens and gives every other user its own analytics id', function (): void {
    $migration = LegacyUserRows::migration();
    $migration->down();
    $rows = LegacyUserRows::insert();

    $migration->up();

    $distinctIds = DB::table('users')->orderBy('id')->pluck('analytics_distinct_id', 'id');
    expect($distinctIds->keys()->all())->toBe([$rows['first'], $rows['second']])
        ->and($distinctIds->every(fn (mixed $id): bool => is_string($id) && Str::isUuid($id, 4)))->toBeTrue()
        ->and($distinctIds->unique())->toHaveCount(2)
        ->and(DB::table('personal_access_tokens')->orderBy('id')->pluck('id')->all())->toBe([$rows['first_token'], $rows['source_token']])
        ->and(DB::table('users')->where('id', $rows['first'])->value('bot_chat_state'))->toBe('never')
        ->and((bool) DB::table('users')->where('id', $rows['first'])->value('is_team'))->toBeFalse();
});

it('requires a unique analytics id and lets a user go without a name, an email or a password', function (): void {
    DB::table('users')->insert(['analytics_distinct_id' => '5f0c2b1e-7a36-4c59-9d4e-2f1a6b7c8d90', 'telegram_user_id' => 279058397]);

    expect(fn () => DB::transaction(fn () => DB::table('users')->insert(['telegram_user_id' => 279058398])))->toThrow(QueryException::class)
        ->and(fn () => DB::transaction(fn () => DB::table('users')->insert(['analytics_distinct_id' => '5f0c2b1e-7a36-4c59-9d4e-2f1a6b7c8d90', 'telegram_user_id' => 279058398])))->toThrow(QueryException::class)
        ->and(fn () => DB::transaction(fn () => DB::table('users')->insert(['analytics_distinct_id' => (string) Str::uuid(), 'telegram_user_id' => 279058397])))->toThrow(QueryException::class)
        ->and(DB::table('users')->count())->toBe(1);
});

it('drops the new columns and makes the old ones required again when every row has them', function (): void {
    LegacyUserRows::migration()->down();

    expect(Schema::hasColumns('users', ['telegram_user_id', 'analytics_distinct_id', 'last_seen_at']))->toBeFalse()
        ->and(Schema::hasColumns('users', ['name', 'email', 'password']))->toBeTrue()
        ->and(fn () => DB::transaction(fn () => DB::table('users')->insert(['email' => 'nameless@example.com', 'password' => 'x'])))->toThrow(QueryException::class);

    LegacyUserRows::migration()->up();
});

it('keeps the old columns nullable on the way down while a Telegram user has none of them', function (): void {
    DB::table('users')->insert(['analytics_distinct_id' => (string) Str::uuid(), 'telegram_user_id' => 279058397]);

    LegacyUserRows::migration()->down();

    expect(Schema::hasColumn('users', 'telegram_user_id'))->toBeFalse()
        ->and(DB::table('users')->count())->toBe(1);
    DB::table('users')->insert(['email' => 'nameless@example.com']);
    expect(DB::table('users')->count())->toBe(2);

    DB::table('users')->delete();
    LegacyUserRows::migration()->up();
});
