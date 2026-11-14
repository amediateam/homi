<?php

use App\Enums\MediaVisibility;
use App\Models\MediaFile;
use App\Models\MediaFileReference;
use App\Models\User;
use App\Services\Media\StoredOriginal;

/*
 * The case WP-00 left to the pgsql group (KI-25): one user uploads the same bytes ten times at
 * once. Each child process runs the database half of an upload (MediaController::store after the
 * object is stored), so the race is between ten real PostgreSQL transactions; the objects
 * themselves are not written, because a child process cannot use a faked disk.
 */
it('keeps one media row and one reference when one user records the same bytes ten times in parallel', function (): void {
    $userId = User::factory()->create()->id;
    $sha256 = hash('sha256', 'the same bytes');

    $upload = static function () use ($userId, $sha256): string {
        $stored = new StoredOriginal($sha256, 'image/png', 'png', 'public', "originals/{$sha256}.png", 2048, 64, 64);

        return MediaFile::recordFor(User::query()->findOrFail($userId), $stored, MediaVisibility::Public)->id;
    };

    $ids = concurrently(array_fill(0, 10, $upload));

    expect(array_unique($ids))->toHaveCount(1)
        ->and(MediaFile::query()->count())->toBe(1)
        ->and(MediaFileReference::query()->count())->toBe(1)
        ->and(MediaFileReference::query()->value('media_file_id'))->toBe($ids[0]);
});
