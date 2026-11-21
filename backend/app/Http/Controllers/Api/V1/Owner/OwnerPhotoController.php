<?php

namespace App\Http\Controllers\Api\V1\Owner;

use App\Enums\SourceDriver;
use App\Exceptions\MediaException;
use App\Http\Controllers\Api\V1\ApiController;
use App\Http\Requests\Api\V1\Owner\OrderOwnerPhotosRequest;
use App\Http\Requests\Api\V1\Owner\StoreOwnerPhotoRequest;
use App\Http\Resources\Api\V1\OwnerListingResource;
use App\Services\Sources\Stub\StubOwner;
use App\Services\Sources\Stub\StubResponder;
use finfo;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Config;

/**
 * The photos of an owner listing on stubs (WP-80; real from WP-84, through `HashedUploader`, never `POST /media`): add
 * one (`201`, last), remove one, set the order. Scenarios: `owner_disabled`, `listing_locked`.
 */
class OwnerPhotoController extends ApiController
{
    public function __construct(private readonly StubResponder $stubs, private readonly StubOwner $owner) {}

    public function store(StoreOwnerPhotoRequest $request, string $id): JsonResponse
    {
        $this->owner->entry($id);
        $context = $this->stubs->check($request, OwnerErrors::of(['owner_disabled']));
        $file = $request->file('file');
        $bytes = $file instanceof UploadedFile ? (string) file_get_contents($file->getRealPath()) : '';

        // The checks of `HashedUploader`, which WP-84 calls; the stub stores nothing.
        if (strlen($bytes) > Config::integer('media.max_bytes')) {
            throw MediaException::tooLarge(strlen($bytes), Config::integer('media.max_bytes'));
        }

        $mime = (string) ((new finfo(FILEINFO_MIME_TYPE))->buffer($bytes) ?: 'application/octet-stream');

        if (! array_key_exists($mime, Config::array('media.allowed_mimes'))) {
            throw MediaException::unsupportedMime($mime);
        }

        return $this->sourced(new OwnerListingResource($this->owner->addPhoto($id, $context)), SourceDriver::Stub, status: 201);
    }

    public function destroy(Request $request, string $id, string $photo): JsonResponse
    {
        $this->owner->entry($id);
        $context = $this->stubs->check($request, OwnerErrors::of(['owner_disabled']));

        return $this->sourced(new OwnerListingResource($this->owner->removePhoto($id, $photo, $context)), SourceDriver::Stub);
    }

    public function order(OrderOwnerPhotosRequest $request, string $id): JsonResponse
    {
        $this->owner->entry($id);
        $context = $this->stubs->check($request, OwnerErrors::of(['owner_disabled']));

        return $this->sourced(new OwnerListingResource($this->owner->orderPhotos($id, $request->ids(), $context)), SourceDriver::Stub);
    }
}
