<?php

namespace Tests\Support;

use App\Models\User;
use App\Services\Listings\Contracts\OverlayData;

/**
 * HOMI's overlay data as a test sets it (WP-42): favourites, opened, hidden listings and blocked author keys per user
 * id, and the outcomes of votes for everyone. `reads` counts the calls, so a test can see that a list is read once.
 */
final class FakeOverlayData implements OverlayData
{
    /** @var array<int, list<int>> */
    public array $favorites = [];

    /** @var array<int, list<int>> */
    public array $viewed = [];

    /** @var array<int, list<int>> */
    public array $hidden = [];

    /** @var array<int, list<string>> */
    public array $blocked = [];

    /** @var list<int> */
    public array $rented = [];

    /** @var list<string> */
    public array $realtors = [];

    public int $reads = 0;

    /** Binds a new instance and answers it, so the overlay of every request reads it. */
    public static function bind(): self
    {
        $data = new self;
        app()->instance(OverlayData::class, $data);

        return $data;
    }

    public function favorites(User $user, array $numbers): array
    {
        $this->reads++;

        return array_values(array_intersect($this->favorites[$user->id] ?? [], $numbers));
    }

    public function viewed(User $user, array $numbers): array
    {
        $this->reads++;

        return array_values(array_intersect($this->viewed[$user->id] ?? [], $numbers));
    }

    public function hiddenNumbers(User $user): array
    {
        $this->reads++;

        return $this->hidden[$user->id] ?? [];
    }

    public function blockedAuthorKeys(User $user): array
    {
        $this->reads++;

        return $this->blocked[$user->id] ?? [];
    }

    public function rentedByVotes(array $numbers): array
    {
        $this->reads++;

        return array_values(array_intersect($this->rented, $numbers));
    }

    public function realtorAuthorKeys(): array
    {
        $this->reads++;

        return $this->realtors;
    }
}
