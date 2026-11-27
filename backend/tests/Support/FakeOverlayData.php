<?php

namespace Tests\Support;

use App\Models\User;
use App\Services\Listings\Contracts\OverlayData;

/**
 * HOMI's overlay data as a test sets it (WP-42): favourites, opened, hidden listings and blocked author keys per user
 * id, and the outcomes of votes for everyone. `reads` counts every call and `calls` the calls of each method, so a
 * test can see that a set is read once.
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

    /** @var array<string, int> method name => calls */
    public array $calls = [];

    /** Binds a new instance and answers it, so the overlay of every request reads it. */
    public static function bind(): self
    {
        $data = new self;
        app()->instance(OverlayData::class, $data);

        return $data;
    }

    /** The calls of one method so far. */
    public function callsOf(string $method): int
    {
        return $this->calls[$method] ?? 0;
    }

    private function read(string $method): void
    {
        $this->reads++;
        $this->calls[$method] = $this->callsOf($method) + 1;
    }

    public function favorites(User $user, array $numbers): array
    {
        $this->read(__FUNCTION__);

        return array_values(array_intersect($this->favorites[$user->id] ?? [], $numbers));
    }

    public function viewed(User $user, array $numbers): array
    {
        $this->read(__FUNCTION__);

        return array_values(array_intersect($this->viewed[$user->id] ?? [], $numbers));
    }

    public function hiddenNumbers(User $user): array
    {
        $this->read(__FUNCTION__);

        return $this->hidden[$user->id] ?? [];
    }

    public function blockedAuthorKeys(User $user): array
    {
        $this->read(__FUNCTION__);

        return $this->blocked[$user->id] ?? [];
    }

    public function rentedByVotes(array $numbers): array
    {
        $this->read(__FUNCTION__);

        return array_values(array_intersect($this->rented, $numbers));
    }

    public function realtorAuthorKeys(): array
    {
        $this->read(__FUNCTION__);

        return $this->realtors;
    }
}
