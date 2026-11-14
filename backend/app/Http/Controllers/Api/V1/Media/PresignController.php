<?php

namespace App\Http\Controllers\Api\V1\Media;

use App\Enums\MediaOwnerType;
use App\Exceptions\MediaException;
use App\Http\Controllers\Api\V1\ApiController;
use App\Http\Requests\Api\V1\Media\PresignRequest;
use App\Http\Requests\Api\V1\Media\RegisterUploadRequest;
use App\Http\Resources\Api\V1\MediaFileResource;
use App\Jobs\Media\GenerateImageVariantsJob;
use App\Models\MediaFile;
use App\Services\Media\HashedUploader;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Filesystem\AwsS3V3Adapter;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * Direct-to-storage uploads (master prompt §7.3): the client PUTs the bytes to a presigned
 * URL on the tmp disk, then registers the key so HOMI validates and promotes it to an original.
 * Available only where the tmp disk is S3-compatible (staging/production).
 *
 * Keys are `uploads/{owner_type}/{owner_id}/{ulid}.{ext}`: the actor type is part of the prefix,
 * so a user and a source with the same id never share one (SEC-027).
 */
class PresignController extends ApiController
{
    /**
     * Create a presigned PUT URL on the tmp disk.
     */
    public function store(PresignRequest $request): JsonResponse
    {
        $diskName = (string) config('media.disks.tmp');
        $disk = Storage::disk($diskName);

        if (! $disk instanceof AwsS3V3Adapter) {
            throw MediaException::presignUnavailable($diskName);
        }

        /** @var array<string, string> $allowed */
        $allowed = config('media.allowed_mimes');
        $mime = (string) $request->validated('mime');
        $key = sprintf('%s%s.%s', $this->uploadPrefix($this->actor($request)), Str::ulid(), $allowed[$mime]);
        $expiresAt = now()->addMinutes((int) config('media.presign_minutes', 15));

        ['url' => $url, 'headers' => $headers] = $disk->temporaryUploadUrl($key, $expiresAt, ['ContentType' => $mime]);

        return $this->success([
            'method' => 'PUT',
            'url' => $url,
            'headers' => $headers,
            'key' => $key,
            'expires_at' => $expiresAt->toIso8601String(),
        ], status: 201);
    }

    /**
     * Register an object uploaded through a presigned URL as a media file.
     */
    public function register(RegisterUploadRequest $request, HashedUploader $uploader): JsonResponse
    {
        $actor = $this->actor($request);
        $key = (string) $request->validated('key');

        if (! str_starts_with($key, $this->uploadPrefix($actor))) {
            throw MediaException::foreignUpload();
        }

        $tmp = Storage::disk((string) config('media.disks.tmp'));
        $bytes = $tmp->get($key);

        if ($bytes === null) {
            throw MediaException::uploadNotFound($key);
        }

        $visibility = $request->visibility();
        $stored = $uploader->storeBytes($bytes, $visibility);
        $media = MediaFile::recordFor($actor, $stored, $visibility);
        $tmp->delete($key);

        if ($media->wasRecentlyCreated) {
            GenerateImageVariantsJob::dispatch($media)->afterCommit();
        }

        return $this->success(new MediaFileResource($media), status: 201);
    }

    private function uploadPrefix(Model $actor): string
    {
        return sprintf('%s/%s/%s/', config('media.paths.uploads'), MediaOwnerType::fromActor($actor)->value, MediaOwnerType::ownerId($actor));
    }
}
