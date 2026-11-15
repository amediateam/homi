<?php

namespace App\Services\Sources\Stub;

use App\Models\User;
use Illuminate\Support\Str;

/**
 * The one user of the stub sign-in (WP-11): every stub session is a token of this user, so `auth:sanctum` works
 * unchanged on every route. `name` and `password` are required columns until WP-40, so it gets a fixed name and a
 * random password that nobody knows.
 */
final class StubUser
{
    public const string EMAIL = 'stub@homi.invalid';

    public static function get(): User
    {
        return User::query()->firstOrCreate(
            ['email' => self::EMAIL],
            ['name' => 'HOMI stub user', 'password' => Str::password(40)],
        );
    }
}
