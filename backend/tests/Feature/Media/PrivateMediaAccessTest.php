<?php

use App\Enums\MediaVisibility;
use App\Models\MediaFile;
use App\Services\Media\HashedUploader;
use App\Services\Media\MediaUrlBuilder;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Storage;

// Storage::fake() replaces temporaryUrl() with a dummy URL, so the private disk is the real
// `local` driver pointed at a throw-away root: the signed `storage.local` route is exercised for real.
const PRIVATE_TEST_ROOT = __DIR__.'/../../../storage/framework/testing/private-disk';

beforeEach(function (): void {
    File::deleteDirectory(PRIVATE_TEST_ROOT);
    config(['filesystems.disks.local.root' => PRIVATE_TEST_ROOT]);
    Storage::forgetDisk('local');
    Storage::fake('public');
    config(['media.public_url' => 'https://cdn.homi.test']);
});

afterEach(function (): void {
    File::deleteDirectory(PRIVATE_TEST_ROOT);
});

function privateMediaFile(): MediaFile
{
    $stored = app(HashedUploader::class)->storeUploadedFile(UploadedFile::fake()->image('contract.jpg', 400, 300), MediaVisibility::Private);

    return MediaFile::fromStored($stored, MediaVisibility::Private);
}

it('serves a private original through its signed temporary url only', function (): void {
    $media = privateMediaFile();
    $url = app(MediaUrlBuilder::class)->original($media);

    expect($url)->not->toStartWith('https://cdn.homi.test')
        ->and($url)->toContain('signature=');

    $this->get($url)->assertOk()->assertHeader('Content-Type', 'image/jpeg');
});

it('refuses a tampered or expired signature', function (): void {
    $media = privateMediaFile();
    $url = app(MediaUrlBuilder::class)->original($media);

    $this->get($url.'tampered')->assertForbidden();

    $this->travel((int) config('media.temporary_url_minutes') + 1)->minutes();
    $this->get($url)->assertForbidden();
});

it('never writes private files to the public disk', function (): void {
    $media = privateMediaFile();

    Storage::disk('public')->assertMissing($media->key);
    expect(Storage::disk('public')->allFiles())->toBe([])
        ->and(file_exists(PRIVATE_TEST_ROOT.'/'.$media->key))->toBeTrue();
});
