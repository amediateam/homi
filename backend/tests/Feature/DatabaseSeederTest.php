<?php

use App\Models\User;

/** `php artisan db:seed` runs without model events (`WithoutModelEvents`), so the factory itself gives each user his analytics id. */
it('seeds the database', function (): void {
    $this->seed();

    $user = User::query()->sole();
    expect($user->email)->toBe('test@example.com')
        ->and($user->analytics_distinct_id)->toBeString()->toMatch('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/');
});
