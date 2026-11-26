<?php

use App\Models\User;
use App\Services\Identity\TokenIssuer;
use Laravel\Sanctum\PersonalAccessToken;

/*
 * WP-40, ADR-0003: one user signs in from six tabs at once. Each child process issues a token in its own PostgreSQL
 * connection with a cap of two; the issuer holds the user's row while it revokes the surplus, so exactly the two newest
 * tokens must stay. The cap is set inside each child, which never sees the parent's configuration, and every child
 * waits for one moment two seconds ahead, so that the issues overlap instead of following the boots.
 */
it('keeps exactly the cap of unexpired tokens when six tokens of one user are issued at once', function (): void {
    $id = User::factory()->telegram()->create()->id;
    $startAt = microtime(true) + 2.0;

    $issue = static function () use ($id, $startAt): int {
        config(['access.max_tokens' => 2]);
        $user = User::query()->findOrFail($id);

        if ($startAt > microtime(true)) {
            time_sleep_until($startAt);
        }

        return (int) app(TokenIssuer::class)->issue($user)->accessToken->getKey();
    };

    $issued = concurrently(array_fill(0, 6, $issue));
    sort($issued);

    $kept = PersonalAccessToken::query()
        ->where('tokenable_id', $id)
        ->where('name', TokenIssuer::NAME)
        ->where('expires_at', '>', now())
        ->orderBy('id')
        ->pluck('id')
        ->all();

    expect(array_unique($issued))->toHaveCount(6)
        ->and($kept)->toBe(array_slice($issued, -2))
        ->and(PersonalAccessToken::query()->count())->toBe(2);
});
