<?php

namespace Database\Factories;

use App\Enums\MediaOwnerType;
use App\Models\MediaFile;
use App\Models\MediaFileReference;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Database\Eloquent\Model;

/**
 * @extends Factory<MediaFileReference>
 */
class MediaFileReferenceFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'media_file_id' => MediaFile::factory(),
            'owner_type' => MediaOwnerType::User,
            'owner_id' => fn (): string => (string) User::factory()->create()->id,
        ];
    }

    public function heldBy(Model $actor): static
    {
        return $this->state(fn (): array => [
            'owner_type' => MediaOwnerType::fromActor($actor),
            'owner_id' => MediaOwnerType::ownerId($actor),
        ]);
    }
}
