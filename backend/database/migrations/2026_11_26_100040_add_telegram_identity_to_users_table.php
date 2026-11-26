<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

/**
 * A HOMI user is a Telegram user of HOMI's bot (WP-40, DEC-40): `name`, `email` and `password` become nullable, and the
 * user gains the Telegram identity and the few facts HOMI keeps of a launch — never a name, a username or a photo
 * address (SEC-REQ-004).
 *
 * The stub user of WP-11 (`stub@homi.invalid`) and its tokens are deleted: on the servers no stub session may
 * survive. Tokens are a morph relation without a foreign key, so they are deleted by hand first.
 *
 * `analytics_distinct_id` is added nullable, filled with a random UUID for every remaining row, then made `NOT NULL`
 * and unique: SQLite refuses `ADD COLUMN … NOT NULL` without a default, even on an empty table.
 *
 * `down()` drops the new columns. It cannot bring back the stub user or its tokens (the stub sign-in of
 * `SOURCES_NATIVE_STUBS` creates the stub user again on its next call), and it makes `name`, `email` and `password`
 * required again only when every row has them: a user created by a Telegram sign-in has none, and the migration does
 * not invent them.
 */
return new class extends Migration
{
    private const string STUB_USER_EMAIL = 'stub@homi.invalid';

    private const string USER_MORPH_CLASS = 'App\Models\User';

    public function up(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->string('name')->nullable()->change();
            $table->string('email')->nullable()->change();
            $table->string('password')->nullable()->change();

            $table->unsignedBigInteger('telegram_user_id')->nullable()->unique();
            $table->boolean('is_premium')->default(false);
            $table->boolean('has_username')->default(false);
            $table->boolean('has_photo')->default(false);
            $table->string('language_code', 8)->nullable();
            $table->string('bot_chat_state', 16)->default('never');
            $table->uuid('analytics_distinct_id')->nullable();
            $table->boolean('is_team')->default(false);
            $table->string('first_start_param', 64)->nullable();
            $table->timestampTz('last_seen_at')->nullable();
        });

        $this->deleteStubUser();
        $this->fillDistinctIds();

        Schema::table('users', function (Blueprint $table): void {
            $table->uuid('analytics_distinct_id')->nullable(false)->change();
            $table->unique('analytics_distinct_id');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->dropUnique(['telegram_user_id']);
            $table->dropUnique(['analytics_distinct_id']);
        });

        Schema::table('users', function (Blueprint $table): void {
            $table->dropColumn([
                'telegram_user_id', 'is_premium', 'has_username', 'has_photo', 'language_code', 'bot_chat_state',
                'analytics_distinct_id', 'is_team', 'first_start_param', 'last_seen_at',
            ]);
        });

        $incomplete = DB::table('users')->whereNull('name')->orWhereNull('email')->orWhereNull('password')->exists();

        if (! $incomplete) {
            Schema::table('users', function (Blueprint $table): void {
                $table->string('name')->nullable(false)->change();
                $table->string('email')->nullable(false)->change();
                $table->string('password')->nullable(false)->change();
            });
        }
    }

    private function deleteStubUser(): void
    {
        $ids = DB::table('users')->where('email', self::STUB_USER_EMAIL)->pluck('id');

        if ($ids->isEmpty()) {
            return;
        }

        DB::table('personal_access_tokens')
            ->where('tokenable_type', self::USER_MORPH_CLASS)
            ->whereIn('tokenable_id', $ids)
            ->delete();
        DB::table('users')->whereIn('id', $ids)->delete();
    }

    private function fillDistinctIds(): void
    {
        DB::table('users')->whereNull('analytics_distinct_id')->select('id')->lazyById()->each(
            function (stdClass $user): void {
                DB::table('users')->where('id', $user->id)->update(['analytics_distinct_id' => (string) Str::uuid()]);
            },
        );
    }
};
