<?php

namespace App\Services\Media;

use App\Enums\MediaVisibility;
use App\Exceptions\MediaException;
use finfo;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Intervention\Image\Encoders\GifEncoder;
use Intervention\Image\Encoders\JpegEncoder;
use Intervention\Image\Encoders\PngEncoder;
use Intervention\Image\Encoders\WebpEncoder;
use Intervention\Image\Exceptions\RuntimeException as ImageException;
use Intervention\Image\ImageManager;
use Intervention\Image\Interfaces\EncodedImageInterface;
use Intervention\Image\Interfaces\ImageInterface;

/**
 * Validate → normalise → store an original image under `originals/{sha256}.{ext}`.
 *
 * Ported from app.uz `Services/Media/HashedUploader` (catalogue A6): the MIME type is sniffed
 * from the bytes, the image is decoded and re-encoded (orientation applied, EXIF/metadata
 * dropped) and the key is the SHA-256 of the stored bytes, so identical uploads share one object.
 */
final class HashedUploader
{
    public function __construct(private readonly ImageManager $images) {}

    public function storeUploadedFile(UploadedFile $file, MediaVisibility $visibility): StoredOriginal
    {
        return $this->storeBytes((string) $file->get(), $visibility);
    }

    public function storeBytes(string $bytes, MediaVisibility $visibility): StoredOriginal
    {
        $maxBytes = (int) config('media.max_bytes');
        if (strlen($bytes) > $maxBytes) {
            throw MediaException::tooLarge(strlen($bytes), $maxBytes);
        }

        $mime = (string) ((new finfo(FILEINFO_MIME_TYPE))->buffer($bytes) ?: 'application/octet-stream');
        /** @var array<string, string> $allowed */
        $allowed = config('media.allowed_mimes', []);
        if (! isset($allowed[$mime])) {
            throw MediaException::unsupportedMime($mime);
        }
        $ext = $allowed[$mime];

        try {
            $image = $this->images->decodeBinary($bytes);
        } catch (ImageException) {
            throw MediaException::undecodable();
        }

        $maxDimension = (int) config('media.max_dimension');
        if ($image->width() > $maxDimension || $image->height() > $maxDimension) {
            throw MediaException::tooBig($image->width(), $image->height(), $maxDimension);
        }

        $encoded = (string) $this->encode($image->orient(), $mime);
        $sha256 = hash('sha256', $encoded);
        $disk = $visibility->disk();
        $key = config('media.paths.originals').'/'.$sha256.'.'.$ext;

        $storage = Storage::disk($disk);
        if (! $storage->exists($key)) {
            $storage->put($key, $encoded, [
                'visibility' => $visibility->value,
                'ContentType' => $mime,
                'CacheControl' => 'public, max-age=31536000, immutable',
            ]);
        }

        return new StoredOriginal($sha256, $mime, $ext, $disk, $key, strlen($encoded), $image->width(), $image->height());
    }

    /**
     * Re-encode in the original format: strips metadata and normalises the byte stream.
     */
    private function encode(ImageInterface $image, string $mime): EncodedImageInterface
    {
        return $image->encode(match ($mime) {
            'image/png' => new PngEncoder,
            'image/webp' => new WebpEncoder(quality: 90),
            'image/gif' => new GifEncoder,
            default => new JpegEncoder(quality: 90),
        });
    }
}
