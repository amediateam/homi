<?php

namespace App\Http\Controllers\Api\V1\Media;

use App\Http\Controllers\Api\V1\ApiController;
use App\Http\Requests\Api\V1\Media\StoreMediaRequest;
use App\Http\Resources\Api\V1\MediaFileResource;
use App\Jobs\Media\GenerateImageVariantsJob;
use App\Models\MediaFile;
use App\Services\Media\HashedUploader;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Response;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

/**
 * Media files: upload (multipart), show, delete. Variants are derived asynchronously.
 */
class MediaController extends ApiController
{
    /**
     * Upload an image.
     *
     * Stores the original under a content-addressed key and queues WebP variants; uploading the
     * same bytes again returns the existing media file.
     */
    public function store(StoreMediaRequest $request, HashedUploader $uploader): JsonResponse
    {
        /** @var UploadedFile $upload */
        $upload = $request->file('file');
        $visibility = $request->visibility();

        $stored = $uploader->storeUploadedFile($upload, $visibility);
        $media = MediaFile::fromStored($stored, $visibility, (int) $request->user()?->getAuthIdentifier() ?: null);

        if ($media->wasRecentlyCreated) {
            GenerateImageVariantsJob::dispatch($media)->afterCommit();
        }

        return $this->success(new MediaFileResource($media), status: 201);
    }

    /**
     * Show a media file with its public or temporary URLs.
     */
    public function show(MediaFile $media): JsonResponse
    {
        return $this->success(new MediaFileResource($media));
    }

    /**
     * Delete a media file, its variants and its record.
     */
    public function destroy(MediaFile $media): Response
    {
        Storage::disk($media->disk)->delete([$media->key, ...array_values($media->variants ?? [])]);
        $media->delete();

        return $this->noContent();
    }
}
