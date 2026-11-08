<?php

use App\Jobs\Media\GenerateImageVariantsJob;
use App\Models\MediaFile;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;

beforeEach(function (): void {
    Storage::fake('public');
    Storage::fake('local');
    Storage::fake('tmp');
    Queue::fake();
    config(['media.public_url' => 'https://cdn.homi.test']);
});

function uploaderUser(array $abilities = ['media:write']): User
{
    $user = User::factory()->create();
    Sanctum::actingAs($user, $abilities);

    return $user;
}

it('uploads a public image, stores the original and queues the variants job', function (): void {
    uploaderUser();

    $response = $this->postJson('/api/v1/media', [
        'file' => UploadedFile::fake()->image('flat.jpg', 1200, 800),
        'visibility' => 'public',
    ]);

    $response->assertCreated()
        ->assertJsonPath('success', true)
        ->assertJsonPath('data.visibility', 'public')
        ->assertJsonPath('data.status', 'pending')
        ->assertJsonPath('data.width', 1200)
        ->assertJsonPath('data.mime', 'image/jpeg');

    $media = MediaFile::query()->sole();
    expect($response->json('data.id'))->toBe($media->id)
        ->and($response->json('data.urls.original'))->toBe('https://cdn.homi.test/'.$media->key)
        ->and($media->disk)->toBe('public')
        ->and($media->uploaded_by)->not->toBeNull();

    Storage::disk('public')->assertExists($media->key);
    Queue::assertPushedOn('media', GenerateImageVariantsJob::class, fn (GenerateImageVariantsJob $job): bool => $job->file->is($media));
});

it('stores a private image on the private disk and returns a temporary url', function (): void {
    uploaderUser();

    $response = $this->postJson('/api/v1/media', [
        'file' => UploadedFile::fake()->image('passport.jpg', 600, 400),
        'visibility' => 'private',
    ]);

    $response->assertCreated()->assertJsonPath('data.visibility', 'private');

    // Storage::fake() swaps temporaryUrl() for a dummy; the real signed route is covered by PrivateMediaAccessTest.
    $media = MediaFile::query()->sole();
    expect($media->disk)->toBe('local')
        ->and($response->json('data.urls.original'))->toContain('expiration=')
        ->and($response->json('data.urls.original'))->not->toStartWith('https://cdn.homi.test');

    Storage::disk('local')->assertExists($media->key);
    Storage::disk('public')->assertMissing($media->key);
});

it('returns the existing media when the same bytes are uploaded again', function (): void {
    uploaderUser();
    $file = UploadedFile::fake()->image('same.jpg', 300, 200);

    $first = $this->postJson('/api/v1/media', ['file' => $file])->assertCreated();
    $second = $this->postJson('/api/v1/media', ['file' => UploadedFile::fake()->createWithContent('other-name.jpg', $file->getContent())])->assertCreated();

    expect($second->json('data.id'))->toBe($first->json('data.id'))
        ->and(MediaFile::query()->count())->toBe(1);
});

it('rejects a file that is not an image', function (): void {
    uploaderUser();

    $this->postJson('/api/v1/media', ['file' => UploadedFile::fake()->createWithContent('notes.txt', 'plain text')])
        ->assertUnprocessable()
        ->assertJsonPath('success', false)
        ->assertJsonStructure(['message', 'errors' => ['file']]);

    expect(MediaFile::query()->count())->toBe(0);
});

it('requires a file', function (): void {
    uploaderUser();

    $this->postJson('/api/v1/media', ['visibility' => 'public'])
        ->assertUnprocessable()
        ->assertJsonPath('success', false)
        ->assertJsonValidationErrors(['file']);
});

it('rejects unauthenticated uploads', function (): void {
    $this->postJson('/api/v1/media', ['file' => UploadedFile::fake()->image('x.jpg')])
        ->assertUnauthorized()
        ->assertJsonPath('success', false);
});

it('rejects tokens without the media:write ability', function (): void {
    uploaderUser(['intake:write']);

    $this->postJson('/api/v1/media', ['file' => UploadedFile::fake()->image('x.jpg')])
        ->assertForbidden()
        ->assertJsonPath('success', false);
});

it('shows a media file with its variant urls', function (): void {
    uploaderUser();
    $media = MediaFile::factory()->ready()->create();

    $this->getJson("/api/v1/media/{$media->id}")
        ->assertOk()
        ->assertJsonPath('data.id', $media->id)
        ->assertJsonPath('data.status', 'ready')
        ->assertJsonPath('data.urls.original', 'https://cdn.homi.test/'.$media->key)
        ->assertJsonPath('data.urls.variants.640', 'https://cdn.homi.test/derived/'.$media->sha256.'/640.webp');
});

it('returns a 404 envelope for an unknown media id', function (): void {
    uploaderUser();

    $this->getJson('/api/v1/media/01JZZZZZZZZZZZZZZZZZZZZZZZ')
        ->assertNotFound()
        ->assertJsonPath('success', false);
});

it('deletes the original, its variants and the row', function (): void {
    uploaderUser();
    $media = MediaFile::factory()->ready()->create();
    $disk = Storage::disk('public');
    $disk->put($media->key, 'original');
    foreach ($media->variants as $key) {
        $disk->put($key, 'variant');
    }

    $this->deleteJson("/api/v1/media/{$media->id}")->assertNoContent();

    $disk->assertMissing($media->key);
    foreach ($media->variants as $key) {
        $disk->assertMissing($key);
    }
    expect(MediaFile::query()->find($media->id))->toBeNull();
});

it('reports that presigned uploads are unavailable on local disks', function (): void {
    uploaderUser();

    $this->postJson('/api/v1/media/presign', ['filename' => 'photo.jpg', 'mime' => 'image/jpeg', 'bytes' => 123_456])
        ->assertStatus(409)
        ->assertJsonPath('success', false);
});

it('registers an object uploaded to the tmp disk as a public original', function (): void {
    $user = uploaderUser();
    $bytes = UploadedFile::fake()->image('pre.jpg', 500, 300)->getContent();
    $key = "uploads/{$user->id}/01JTESTULID.jpg";
    Storage::disk('tmp')->put($key, $bytes);

    $response = $this->postJson('/api/v1/media/register', ['key' => $key, 'visibility' => 'public']);

    $response->assertCreated()->assertJsonPath('data.visibility', 'public');
    $media = MediaFile::query()->sole();
    expect($media->sha256)->toBe(hash('sha256', (string) Storage::disk('public')->get($media->key)));
    Storage::disk('tmp')->assertMissing($key);
    Queue::assertPushed(GenerateImageVariantsJob::class);
});

it('refuses to register a key that belongs to another user', function (): void {
    uploaderUser();
    Storage::disk('tmp')->put('uploads/999/x.jpg', 'whatever');

    $this->postJson('/api/v1/media/register', ['key' => 'uploads/999/x.jpg'])
        ->assertForbidden()
        ->assertJsonPath('success', false);
});
