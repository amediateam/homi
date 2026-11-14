<?php

use App\Enums\MediaOwnerType;
use App\Enums\MediaStatus;
use App\Enums\MediaVisibility;
use App\Http\Requests\Api\V1\Media\RegisterUploadRequest;
use App\Jobs\Media\GenerateImageVariantsJob;
use App\Models\MediaFile;
use App\Models\MediaFileReference;
use App\Models\Source;
use App\Models\User;
use App\Services\Media\HashedUploader;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\Relation;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;
use Intervention\Image\ImageManager;
use Laravel\Sanctum\Sanctum;

beforeEach(function (): void {
    Storage::fake('public');
    Storage::fake('local');
    Storage::fake('tmp');
    config(['media.public_url' => 'https://cdn.homi.test']);
});

/**
 * @param  array<int, string>  $abilities
 */
function actAsMediaUser(User $user, array $abilities = ['media:write']): User
{
    app('auth')->forgetGuards();
    Sanctum::actingAs($user, $abilities);

    return $user;
}

/**
 * Sanctum::actingAs() needs an Authenticatable and a Source is not one, so a source signs in
 * with a real token through the Sanctum guard, as a collector does.
 *
 * @param  array<int, string>  $abilities
 */
function actAsMediaSource(Source $source, array $abilities = ['media:write']): Source
{
    app('auth')->forgetGuards();
    test()->withToken($source->createToken('test', $abilities)->plainTextToken);

    return $source;
}

function ownedMedia(Model $owner, string $visibility = 'public'): MediaFile
{
    $factory = MediaFile::factory()->ready();
    $media = ($visibility === 'private' ? $factory->private() : $factory)->create();
    $media->attachOwner($owner);

    return $media;
}

function putMediaObjects(MediaFile $media): void
{
    $disk = Storage::disk($media->disk);
    $disk->put($media->key, 'original');

    foreach ($media->variants ?? [] as $key) {
        $disk->put($key, 'variant');
    }
}

function assertMediaObjectsExist(MediaFile $media): void
{
    $disk = Storage::disk($media->disk);
    $disk->assertExists($media->key);

    foreach ($media->variants ?? [] as $key) {
        $disk->assertExists($key);
    }
}

/**
 * The tmp disk becomes S3-compatible, as on staging and production. Presigning signs the
 * request locally; nothing is ever sent to the endpoint.
 */
function useS3TmpDisk(): void
{
    config([
        'filesystems.disks.s3_test_tmp' => [
            'driver' => 's3',
            'key' => 'test-key',
            'secret' => 'test-secret',
            'region' => 'us-east-1',
            'bucket' => 'homi-test-tmp',
            'endpoint' => 'http://127.0.0.1:9',
            'use_path_style_endpoint' => true,
        ],
        'media.disks.tmp' => 's3_test_tmp',
    ]);
}

function imageBytes(int $width = 400, int $height = 300): string
{
    return UploadedFile::fake()->image('photo.jpg', $width, $height)->getContent();
}

it('returns 404 when another user shows a media file', function (string $visibility): void {
    $owner = User::factory()->create();
    $media = ownedMedia($owner, $visibility);

    actAsMediaUser(User::factory()->create());
    $this->getJson("/api/v1/media/{$media->id}")
        ->assertNotFound()
        ->assertExactJson(['success' => false, 'message' => 'Resource not found.', 'code' => 'not_found']);

    actAsMediaUser($owner);
    $this->getJson("/api/v1/media/{$media->id}")
        ->assertOk()
        ->assertJsonPath('data.id', $media->id);
})->with(['private', 'public']);

it('returns 404 when another user deletes a media file and keeps it intact', function (): void {
    $owner = User::factory()->create();
    $media = ownedMedia($owner);
    putMediaObjects($media);

    actAsMediaUser(User::factory()->create());
    $this->deleteJson("/api/v1/media/{$media->id}")
        ->assertNotFound()
        ->assertExactJson(['success' => false, 'message' => 'Resource not found.', 'code' => 'not_found']);

    expect(MediaFile::query()->find($media->id))->not->toBeNull()
        ->and($media->isReferencedBy($owner))->toBeTrue();
    assertMediaObjectsExist($media);
});

it('answers foreign and unknown ids with identical status, body and query count', function (string $method): void {
    $media = ownedMedia(User::factory()->create());
    actAsMediaUser(User::factory()->create());

    $probe = function (string $id) use ($method): array {
        DB::flushQueryLog();
        DB::enableQueryLog();
        $response = $this->json($method, "/api/v1/media/{$id}");
        $queries = count(DB::getQueryLog());
        DB::disableQueryLog();

        return [$response->status(), $response->getContent(), $queries];
    };

    $foreign = $probe($media->id);
    $unknown = $probe((string) Str::ulid());

    expect($foreign[0])->toBe(404)
        ->and($unknown)->toBe($foreign);
})->with(['GET', 'DELETE']);

it('never confuses a user and a source with the same id', function (): void {
    $user = User::factory()->create(['id' => 5]);
    $source = Source::factory()->create(['id' => 5]);
    $media = ownedMedia($source);

    actAsMediaUser($user);
    $this->getJson("/api/v1/media/{$media->id}")->assertNotFound();
    $this->deleteJson("/api/v1/media/{$media->id}")->assertNotFound();

    actAsMediaSource($source);
    $this->getJson("/api/v1/media/{$media->id}")->assertOk();
});

it('lets the media policy allow only actors that hold a reference', function (): void {
    $owner = User::factory()->create();
    $media = ownedMedia($owner);
    $stranger = User::factory()->create();

    expect(Gate::forUser($owner)->inspect('view', $media)->allowed())->toBeTrue()
        ->and(Gate::forUser($owner)->inspect('delete', $media)->allowed())->toBeTrue();

    $denied = Gate::forUser($stranger)->inspect('delete', $media);
    expect($denied->denied())->toBeTrue()
        ->and($denied->status())->toBe(404)
        ->and($denied->message())->toBe('Resource not found.');
});

it('creates one row and two references when two actors upload identical bytes', function (): void {
    Queue::fake();
    $bytes = imageBytes();
    $first = User::factory()->create();
    $second = Source::factory()->create();

    actAsMediaUser($first);
    $a = $this->postJson('/api/v1/media', ['file' => UploadedFile::fake()->createWithContent('a.jpg', $bytes)])->assertCreated();
    actAsMediaSource($second);
    $b = $this->postJson('/api/v1/media', ['file' => UploadedFile::fake()->createWithContent('b.jpg', $bytes)])->assertCreated();

    $media = MediaFile::query()->sole();
    expect($b->json('data.id'))->toBe($a->json('data.id'))
        ->and($media->references()->count())->toBe(2)
        ->and($media->isReferencedBy($first))->toBeTrue()
        ->and($media->isReferencedBy($second))->toBeTrue();
});

it('deletes only the caller reference when two owners share the bytes', function (): void {
    $first = User::factory()->create();
    $second = User::factory()->create();
    $media = ownedMedia($first);
    MediaFileReference::factory()->for($media)->heldBy($second)->create();
    putMediaObjects($media);

    actAsMediaUser($first);
    $this->deleteJson("/api/v1/media/{$media->id}")->assertNoContent();

    expect($media->isReferencedBy($first))->toBeFalse()
        ->and($media->isReferencedBy($second))->toBeTrue();
    assertMediaObjectsExist($media);

    actAsMediaUser($second);
    $this->getJson("/api/v1/media/{$media->id}")->assertOk();
});

it('deletes the object and its variants after the last reference', function (): void {
    $owner = User::factory()->create();
    $media = ownedMedia($owner);
    putMediaObjects($media);
    // A variant that a running job has written and the row does not list yet.
    Storage::disk('public')->put("derived/{$media->sha256}/1920.webp", 'late variant');

    actAsMediaUser($owner);
    $this->deleteJson("/api/v1/media/{$media->id}")->assertNoContent();

    expect(MediaFile::query()->find($media->id))->toBeNull()
        ->and(MediaFileReference::query()->count())->toBe(0)
        ->and(Storage::disk('public')->allFiles())->toBe([]);
});

it('keeps the objects when the same bytes were uploaded again before the delete finished', function (): void {
    $owner = User::factory()->create();
    $media = ownedMedia($owner);
    putMediaObjects($media);

    // The same bytes arrive again after the row is gone and before the storage cleanup runs.
    MediaFile::deleted(function (MediaFile $deleted): void {
        MediaFile::factory()->create(['disk' => $deleted->disk, 'sha256' => $deleted->sha256, 'key' => $deleted->key]);
    });

    actAsMediaUser($owner);
    $this->deleteJson("/api/v1/media/{$media->id}")->assertNoContent();

    expect(MediaFile::query()->where('sha256', $media->sha256)->count())->toBe(1);
    assertMediaObjectsExist($media);
});

it('re-creates the object with a fresh reference when deleted bytes are uploaded again', function (): void {
    Queue::fake();
    $owner = actAsMediaUser(User::factory()->create());
    $bytes = imageBytes();

    $first = $this->postJson('/api/v1/media', ['file' => UploadedFile::fake()->createWithContent('a.jpg', $bytes)])->assertCreated();
    $this->deleteJson('/api/v1/media/'.$first->json('data.id'))->assertNoContent();
    $second = $this->postJson('/api/v1/media', ['file' => UploadedFile::fake()->createWithContent('a.jpg', $bytes)])->assertCreated();

    $media = MediaFile::query()->sole();
    expect($second->json('data.id'))->not->toBe($first->json('data.id'))
        ->and($media->isReferencedBy($owner))->toBeTrue();
    Storage::disk('public')->assertExists($media->key);
});

it('refuses to register an upload under another actor type prefix', function (): void {
    $user = User::factory()->create(['id' => 5]);
    $source = Source::factory()->create(['id' => 5]);
    $sourceKey = 'uploads/source/5/01JTESTULIDSOURCE.jpg';
    $userKey = 'uploads/user/5/01JTESTULIDUSER.jpg';
    Storage::disk('tmp')->put($sourceKey, imageBytes());
    Storage::disk('tmp')->put($userKey, imageBytes());

    actAsMediaUser($user);
    $this->postJson('/api/v1/media/register', ['key' => $sourceKey])
        ->assertForbidden()
        ->assertJsonPath('reason', 'forbidden_upload')
        ->assertJsonPath('code', 'forbidden_upload');

    actAsMediaSource($source);
    $this->postJson('/api/v1/media/register', ['key' => $userKey])
        ->assertForbidden()
        ->assertJsonPath('reason', 'forbidden_upload');

    expect(MediaFile::query()->count())->toBe(0);
    Storage::disk('tmp')->assertExists([$sourceKey, $userKey]);
});

it('issues presign keys under the actor type prefix', function (): void {
    useS3TmpDisk();
    $payload = ['filename' => 'flat.jpg', 'mime' => 'image/jpeg', 'bytes' => 123_456];

    $user = actAsMediaUser(User::factory()->create());
    $userKey = $this->postJson('/api/v1/media/presign', $payload)->assertCreated()->json('data.key');

    $source = actAsMediaSource(Source::factory()->create());
    $sourceKey = $this->postJson('/api/v1/media/presign', $payload)->assertCreated()->json('data.key');

    expect($userKey)->toMatch("#^uploads/user/{$user->id}/[0-9A-Z]{26}\.jpg$#")
        ->and($sourceKey)->toMatch("#^uploads/source/{$source->id}/[0-9A-Z]{26}\.jpg$#");
});

it('rejects a register key in the old form with 422', function (): void {
    $user = actAsMediaUser(User::factory()->create());
    $key = "uploads/{$user->id}/01JTESTULID.jpg";
    Storage::disk('tmp')->put($key, imageBytes());

    $this->postJson('/api/v1/media/register', ['key' => $key])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['key']);

    expect(MediaFile::query()->count())->toBe(0);
});

it('accepts a register key in the new form', function (Closure $actAs, string $type): void {
    Queue::fake();
    $actor = $actAs();
    $key = "uploads/{$type}/{$actor->getKey()}/01JTESTULID.jpg";
    Storage::disk('tmp')->put($key, imageBytes());

    $this->postJson('/api/v1/media/register', ['key' => $key, 'visibility' => 'public'])->assertCreated();

    $media = MediaFile::query()->sole();
    expect($media->isReferencedBy($actor))->toBeTrue();
    Storage::disk('tmp')->assertMissing($key);
})->with([
    'user' => [fn (): User => actAsMediaUser(User::factory()->create()), 'user'],
    'source' => [fn (): Source => actAsMediaSource(Source::factory()->create()), 'source'],
]);

it('stores no uploader for a source actor', function (): void {
    Queue::fake();
    // A user with the same number must not become the uploader of the source's file.
    User::factory()->create(['id' => 7]);
    $source = actAsMediaSource(Source::factory()->create(['id' => 7]));

    $this->postJson('/api/v1/media', ['file' => UploadedFile::fake()->image('flat.jpg', 400, 300)])->assertCreated();

    $media = MediaFile::query()->sole();
    $reference = $media->references()->sole();
    expect($media->uploaded_by)->toBeNull()
        ->and($reference->owner_type)->toBe(MediaOwnerType::Source)
        ->and($reference->owner_id)->toBe('7');
});

it('stores the uploader and a user reference for a user actor', function (): void {
    Queue::fake();
    $user = actAsMediaUser(User::factory()->create());

    $this->postJson('/api/v1/media', ['file' => UploadedFile::fake()->image('flat.jpg', 400, 300)])->assertCreated();

    $media = MediaFile::query()->sole();
    $reference = $media->references()->sole();
    expect($media->uploaded_by)->toBe($user->id)
        ->and($reference->owner_type)->toBe(MediaOwnerType::User)
        ->and($reference->owner_id)->toBe((string) $user->id);
});

it('backfills a user reference for rows that existed before the migration', function (): void {
    $migration = require collect(glob(database_path('migrations/*_create_media_file_references_table.php')))->sole();
    $user = User::factory()->create();

    $migration->down();
    $owned = MediaFile::factory()->create(['uploaded_by' => $user->id]);
    $orphan = MediaFile::factory()->create(['uploaded_by' => null]);
    $migration->up();

    expect($owned->isReferencedBy($user))->toBeTrue()
        ->and($owned->references()->sole()->owner_type)->toBe(MediaOwnerType::User)
        ->and($orphan->isReferenced())->toBeFalse();
});

it('keeps one reference when the same actor attaches twice', function (): void {
    $user = User::factory()->create();
    $media = MediaFile::factory()->create();

    $first = $media->attachOwner($user);
    $second = $media->attachOwner($user);

    expect($second->is($first))->toBeTrue()
        ->and($media->references()->count())->toBe(1);
});

it('keeps existing sanctum tokens resolvable without a morph map', function (): void {
    $user = User::factory()->create();
    $user->createToken('existing', ['media:write']);
    $source = Source::factory()->create();
    $source->createToken('existing', ['intake:write']);

    expect(Relation::morphMap())->toBe([])
        ->and($user->tokens()->count())->toBe(1)
        ->and($source->tokens()->count())->toBe(1)
        ->and($user->tokens()->sole()->tokenable_type)->toBe(User::class);
});

it('drops the variants job when the media row was deleted before it ran', function (): void {
    $media = MediaFile::factory()->create();
    $media->delete();
    $failures = 0;
    Queue::failing(function () use (&$failures): void {
        $failures++;
    });

    GenerateImageVariantsJob::dispatchSync($media);

    expect($failures)->toBe(0);
});

it('removes its own variants when the row disappears during the run', function (): void {
    $stored = app(HashedUploader::class)->storeBytes(imageBytes(700, 500), MediaVisibility::Public);
    $media = MediaFile::fromStored($stored, MediaVisibility::Public);
    $job = new GenerateImageVariantsJob($media);
    // The delete commits while the job is running.
    MediaFile::query()->whereKey($media->id)->delete();

    $job->handle(app(ImageManager::class));

    expect(Storage::disk('public')->allFiles("derived/{$media->sha256}"))->toBe([])
        ->and(MediaFile::query()->find($media->id))->toBeNull();
});

it('keeps the variants when the same bytes were uploaded again during the run', function (): void {
    $stored = app(HashedUploader::class)->storeBytes(imageBytes(700, 500), MediaVisibility::Public);
    $media = MediaFile::fromStored($stored, MediaVisibility::Public);
    $job = new GenerateImageVariantsJob($media);
    MediaFile::query()->whereKey($media->id)->delete();
    MediaFile::fromStored($stored, MediaVisibility::Public);

    $job->handle(app(ImageManager::class));

    expect(Storage::disk('public')->allFiles("derived/{$media->sha256}"))->toHaveCount(2);
});

it('does not bring a deleted row back when the variants job fails', function (): void {
    $media = MediaFile::factory()->create();
    $job = new GenerateImageVariantsJob($media);
    MediaFile::query()->whereKey($media->id)->delete();

    $job->failed(new RuntimeException('decoder exploded'));

    expect(MediaFile::query()->count())->toBe(0);
});

it('answers a malformed media id like an unknown one without touching the database', function (string $method, string $id): void {
    actAsMediaUser(User::factory()->create());

    DB::flushQueryLog();
    DB::enableQueryLog();
    $response = $this->json($method, "/api/v1/media/{$id}");
    $queries = count(DB::getQueryLog());
    DB::disableQueryLog();

    $response->assertNotFound()->assertExactJson(['success' => false, 'message' => 'Resource not found.', 'code' => 'not_found']);
    expect($queries)->toBe(0);
})->with(['GET', 'DELETE'])->with(['not-a-ulid', '%00', '01JTESTULIDTOOLONGXXXXXXXXXX']);

it('rejects a register key with a trailing newline', function (): void {
    $rules = (new RegisterUploadRequest)->rules();

    expect(Validator::make(['key' => "uploads/user/5/01JTESTULID.jpg\n"], $rules)->fails())->toBeTrue()
        ->and(Validator::make(['key' => 'uploads/user/5/01JTESTULID.jpg'], $rules)->fails())->toBeFalse();
});

it('derives the variants again when the same bytes arrive for a failed row', function (): void {
    Queue::fake();
    actAsMediaUser(User::factory()->create());
    $bytes = imageBytes();

    $this->postJson('/api/v1/media', ['file' => UploadedFile::fake()->createWithContent('a.jpg', $bytes)])->assertCreated();
    MediaFile::query()->sole()->forceFill(['status' => MediaStatus::Failed])->save();
    $this->postJson('/api/v1/media', ['file' => UploadedFile::fake()->createWithContent('a.jpg', $bytes)])->assertCreated();

    Queue::assertPushed(GenerateImageVariantsJob::class, 2);
});

it('clears the uploader when the uploader leaves and another owner stays', function (): void {
    $uploader = User::factory()->create();
    $other = User::factory()->create();
    $media = MediaFile::factory()->ready()->create(['uploaded_by' => $uploader->id]);
    $media->attachOwner($uploader);
    $media->attachOwner($other);

    actAsMediaUser($uploader);
    $this->deleteJson("/api/v1/media/{$media->id}")->assertNoContent();

    expect($media->refresh()->uploaded_by)->toBeNull()
        ->and($media->isReferencedBy($other))->toBeTrue();
});

it('throttles reads of media files per actor', function (): void {
    actAsMediaUser(User::factory()->create());
    $unknown = (string) Str::ulid();

    foreach (range(1, 120) as $attempt) {
        $this->getJson("/api/v1/media/{$unknown}")->assertNotFound();
    }

    $this->getJson("/api/v1/media/{$unknown}")->assertTooManyRequests();
});
