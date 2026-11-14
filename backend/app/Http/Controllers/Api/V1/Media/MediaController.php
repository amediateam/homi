<?php

namespace App\Http\Controllers\Api\V1\Media;

use App\Http\Controllers\Api\V1\ApiController;
use App\Http\Requests\Api\V1\Media\StoreMediaRequest;
use App\Http\Resources\Api\V1\MediaFileResource;
use App\Jobs\Media\GenerateImageVariantsJob;
use App\Models\MediaFile;
use App\Services\Media\HashedUploader;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Storage;

/**
 * Media files: upload (multipart), show, delete. Variants are derived asynchronously.
 *
 * Access goes through the caller's reference (WP-00): a file the caller does not hold answers
 * exactly like an unknown id (SEC-REQ-014).
 */
class MediaController extends ApiController
{
    /**
     * Upload an image.
     *
     * Stores the original under a content-addressed key and queues WebP variants; uploading the
     * same bytes again returns the existing media file and makes the caller one of its owners.
     */
    public function store(StoreMediaRequest $request, HashedUploader $uploader): JsonResponse
    {
        /** @var UploadedFile $upload */
        $upload = $request->file('file');
        $visibility = $request->visibility();

        $stored = $uploader->storeUploadedFile($upload, $visibility);
        $media = MediaFile::recordFor($this->actor($request), $stored, $visibility);

        if ($media->wasRecentlyCreated) {
            GenerateImageVariantsJob::dispatch($media)->afterCommit();
        }

        return $this->success(new MediaFileResource($media), status: 201);
    }

    /**
     * Show a media file with its public or temporary URLs.
     */
    public function show(Request $request, string $media): JsonResponse
    {
        $file = MediaFile::query()->ownedBy($this->actor($request))->findOrFail($media);
        Gate::authorize('view', $file);

        return $this->success(new MediaFileResource($file));
    }

    /**
     * Delete the caller's reference to a media file.
     *
     * The original, its variants and the record go with the last reference; while another owner
     * holds the file it stays readable for them.
     */
    public function destroy(Request $request, string $media): Response
    {
        $actor = $this->actor($request);

        DB::transaction(function () use ($actor, $media): void {
            $file = MediaFile::query()->ownedBy($actor)->lockForUpdate()->findOrFail($media);
            Gate::authorize('delete', $file);

            $file->references()->heldBy($actor)->delete();

            if ($file->isReferenced()) {
                return;
            }

            $file->delete();
            DB::afterCommit(fn () => $this->deleteObjects($file));
        });

        return $this->noContent();
    }

    /**
     * Remove the original and the whole derived directory (a running job may have written
     * variants the row does not list yet), unless the same bytes were recorded again meanwhile.
     */
    private function deleteObjects(MediaFile $file): void
    {
        if ($file->contentIsRecorded()) {
            return;
        }

        $disk = Storage::disk($file->disk);
        $disk->delete($file->key);
        $disk->deleteDirectory(config('media.paths.derived').'/'.$file->sha256);
    }
}
