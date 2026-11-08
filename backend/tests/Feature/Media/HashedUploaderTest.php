<?php

use App\Enums\MediaVisibility;
use App\Exceptions\MediaException;
use App\Services\Media\HashedUploader;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

beforeEach(function (): void {
    Storage::fake('public');
    Storage::fake('local');
});

it('stores a jpeg under a content-addressed key with its dimensions', function (): void {
    $stored = app(HashedUploader::class)->storeUploadedFile(UploadedFile::fake()->image('photo.jpg', 1200, 800), MediaVisibility::Public);

    expect($stored->mime)->toBe('image/jpeg')
        ->and($stored->ext)->toBe('jpg')
        ->and($stored->width)->toBe(1200)
        ->and($stored->height)->toBe(800)
        ->and($stored->disk)->toBe('public')
        ->and($stored->key)->toMatch('/^originals\/[0-9a-f]{64}\.jpg$/');

    Storage::disk('public')->assertExists($stored->key);

    $bytes = Storage::disk('public')->get($stored->key);
    expect($stored->sha256)->toBe(hash('sha256', $bytes))
        ->and($stored->bytes)->toBe(strlen($bytes));
});

it('returns the same key for identical bytes', function (): void {
    $file = UploadedFile::fake()->image('photo.jpg', 300, 200);
    $uploader = app(HashedUploader::class);

    $first = $uploader->storeBytes($file->getContent(), MediaVisibility::Public);
    $second = $uploader->storeBytes($file->getContent(), MediaVisibility::Public);

    expect($second->key)->toBe($first->key)
        ->and(Storage::disk('public')->files('originals'))->toHaveCount(1);
});

it('stores private originals on the private disk only', function (): void {
    $stored = app(HashedUploader::class)->storeUploadedFile(UploadedFile::fake()->image('doc.jpg', 300, 200), MediaVisibility::Private);

    expect($stored->disk)->toBe('local');
    Storage::disk('local')->assertExists($stored->key);
    Storage::disk('public')->assertMissing($stored->key);
});

it('keeps png as png', function (): void {
    $stored = app(HashedUploader::class)->storeUploadedFile(UploadedFile::fake()->image('pixel.png', 100, 100), MediaVisibility::Public);

    expect($stored->mime)->toBe('image/png')
        ->and($stored->ext)->toBe('png')
        ->and($stored->key)->toEndWith('.png');
});

it('rejects content that is not an allowed image whatever the file name says', function (): void {
    $fake = UploadedFile::fake()->createWithContent('photo.jpg', 'definitely not an image');

    expect(fn () => app(HashedUploader::class)->storeUploadedFile($fake, MediaVisibility::Public))
        ->toThrow(fn (MediaException $e) => expect($e->reason)->toBe('unsupported_mime')->and($e->status)->toBe(422));

    expect(Storage::disk('public')->allFiles())->toBe([]);
});

it('rejects files over the configured byte limit', function (): void {
    config(['media.max_bytes' => 1024]);

    expect(fn () => app(HashedUploader::class)->storeUploadedFile(UploadedFile::fake()->image('big.jpg', 1200, 800), MediaVisibility::Public))
        ->toThrow(fn (MediaException $e) => expect($e->reason)->toBe('too_large'));
});

it('rejects images over the configured dimension limit', function (): void {
    config(['media.max_dimension' => 500]);

    expect(fn () => app(HashedUploader::class)->storeUploadedFile(UploadedFile::fake()->image('wide.jpg', 1200, 800), MediaVisibility::Public))
        ->toThrow(fn (MediaException $e) => expect($e->reason)->toBe('too_big'));
});
