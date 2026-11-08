<?php

use App\Enums\MediaStatus;
use App\Enums\MediaVisibility;
use App\Jobs\Media\GenerateImageVariantsJob;
use App\Models\MediaFile;
use App\Services\Media\HashedUploader;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

beforeEach(function (): void {
    Storage::fake('public');
});

function storedMediaFile(int $width, int $height): MediaFile
{
    $stored = app(HashedUploader::class)->storeUploadedFile(UploadedFile::fake()->image('photo.jpg', $width, $height), MediaVisibility::Public);

    return MediaFile::fromStored($stored, MediaVisibility::Public);
}

it('derives webp variants up to the original width and marks the file ready', function (): void {
    $file = storedMediaFile(1200, 800);

    GenerateImageVariantsJob::dispatchSync($file);

    $disk = Storage::disk('public');
    $disk->assertExists("derived/{$file->sha256}/320.webp");
    $disk->assertExists("derived/{$file->sha256}/640.webp");
    $disk->assertExists("derived/{$file->sha256}/1024.webp");
    $disk->assertMissing("derived/{$file->sha256}/1920.webp");

    $bytes = (string) $disk->get("derived/{$file->sha256}/640.webp");
    expect(substr($bytes, 0, 4))->toBe('RIFF')
        ->and(substr($bytes, 8, 4))->toBe('WEBP');

    $file->refresh();
    expect($file->status)->toBe(MediaStatus::Ready)
        ->and(array_keys($file->variants))->toBe([320, 640, 1024])
        ->and($file->variants[640])->toBe("derived/{$file->sha256}/640.webp");
});

it('is idempotent when run twice', function (): void {
    $file = storedMediaFile(700, 500);

    GenerateImageVariantsJob::dispatchSync($file);
    GenerateImageVariantsJob::dispatchSync($file);

    expect(Storage::disk('public')->files("derived/{$file->sha256}"))->toHaveCount(2)
        ->and($file->refresh()->status)->toBe(MediaStatus::Ready);
});

it('produces no variants for images narrower than the smallest size', function (): void {
    $file = storedMediaFile(200, 100);

    GenerateImageVariantsJob::dispatchSync($file);

    expect(Storage::disk('public')->exists("derived/{$file->sha256}"))->toBeFalse()
        ->and($file->refresh()->status)->toBe(MediaStatus::Ready)
        ->and($file->variants)->toBe([]);
});

it('records a failure on the media row when the job finally fails', function (): void {
    $file = MediaFile::factory()->create();

    (new GenerateImageVariantsJob($file))->failed(new RuntimeException('decoder exploded'));

    $file->refresh();
    expect($file->status)->toBe(MediaStatus::Failed);
});

it('runs on the media queue with retries', function (): void {
    $job = new GenerateImageVariantsJob(MediaFile::factory()->make());

    expect($job->queue)->toBe('media')
        ->and($job->tries)->toBe(3)
        ->and($job->backoff)->toBe(30);
});
