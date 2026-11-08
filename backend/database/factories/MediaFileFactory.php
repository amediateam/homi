<?php

namespace Database\Factories;

use App\Enums\MediaStatus;
use App\Enums\MediaVisibility;
use App\Models\MediaFile;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<MediaFile>
 */
class MediaFileFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $sha = hash('sha256', $this->faker->unique()->uuid());

        return [
            'disk' => 'public',
            'key' => 'originals/'.$sha.'.jpg',
            'sha256' => $sha,
            'mime' => 'image/jpeg',
            'ext' => 'jpg',
            'bytes' => $this->faker->numberBetween(10_000, 2_000_000),
            'width' => 1200,
            'height' => 800,
            'visibility' => MediaVisibility::Public,
            'status' => MediaStatus::Pending,
            'variants' => null,
            'uploaded_by' => null,
        ];
    }

    public function private(): static
    {
        return $this->state(fn (): array => ['disk' => 'local', 'visibility' => MediaVisibility::Private]);
    }

    public function ready(): static
    {
        return $this->state(fn (array $attributes): array => [
            'status' => MediaStatus::Ready,
            'variants' => collect([320, 640, 1024])->mapWithKeys(fn (int $w): array => [$w => 'derived/'.$attributes['sha256'].'/'.$w.'.webp'])->all(),
        ]);
    }
}
