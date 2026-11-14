<?php

namespace App\Services\Sources;

use InvalidArgumentException;

/**
 * The stored value of a source feature (ADR-0017): one rule per feature in Pennant's global scope, so a changed
 * default is never shadowed by values resolved earlier per user.
 *
 *     {"everyone": "legacy", "share": {"driver": "native", "percent": 10}, "users": {"42": "native"}}
 *
 * Every part is optional; an empty rule means "use the configured default". Driver names are kept as written:
 * the selector decides whether a name is usable here.
 */
final readonly class SourceRule
{
    /**
     * @param  array<int, string>  $users  user id => driver name
     */
    public function __construct(
        public ?string $everyone = null,
        public ?string $shareDriver = null,
        public int $sharePercent = 0,
        public array $users = [],
    ) {}

    /**
     * @throws InvalidArgumentException when the value is not a rule
     */
    public static function fromStored(mixed $value): self
    {
        if (! is_array($value)) {
            throw new InvalidArgumentException('The stored value is not a rule.');
        }

        $unknown = array_diff(array_keys($value), ['everyone', 'share', 'users']);

        if ($unknown !== []) {
            throw new InvalidArgumentException('Unknown rule keys: '.implode(', ', $unknown).'.');
        }

        $everyone = $value['everyone'] ?? null;

        if ($everyone !== null && ! is_string($everyone)) {
            throw new InvalidArgumentException('"everyone" must be a driver name.');
        }

        [$shareDriver, $sharePercent] = self::share($value['share'] ?? null);

        return new self($everyone, $shareDriver, $sharePercent, self::users($value['users'] ?? []));
    }

    public function isEmpty(): bool
    {
        return $this->toArray() === [];
    }

    /** @return array{everyone?: string, share?: array{driver: string, percent: int}, users?: array<int, string>} */
    public function toArray(): array
    {
        $rule = [];

        if ($this->everyone !== null) {
            $rule['everyone'] = $this->everyone;
        }

        if ($this->shareDriver !== null) {
            $rule['share'] = ['driver' => $this->shareDriver, 'percent' => $this->sharePercent];
        }

        if ($this->users !== []) {
            $rule['users'] = $this->users;
        }

        return $rule;
    }

    public function withEveryone(?string $driver): self
    {
        return new self($driver, $this->shareDriver, $this->sharePercent, $this->users);
    }

    public function withShare(?string $driver, int $percent = 0): self
    {
        if ($percent < 0 || $percent > 100) {
            throw new InvalidArgumentException('The share is a percentage from 0 to 100.');
        }

        return new self($this->everyone, $driver, $driver === null ? 0 : $percent, $this->users);
    }

    /** @param  list<int>  $userIds */
    public function withUsers(array $userIds, string $driver): self
    {
        return new self($this->everyone, $this->shareDriver, $this->sharePercent, array_replace($this->users, array_fill_keys($userIds, $driver)));
    }

    /** @param  list<int>  $userIds */
    public function withoutUsers(array $userIds): self
    {
        return new self($this->everyone, $this->shareDriver, $this->sharePercent, array_diff_key($this->users, array_flip($userIds)));
    }

    /** @return array{0: string|null, 1: int} */
    private static function share(mixed $share): array
    {
        if ($share === null) {
            return [null, 0];
        }

        if (! is_array($share) || ! is_string($share['driver'] ?? null) || ! is_int($share['percent'] ?? null)
            || $share['percent'] < 0 || $share['percent'] > 100 || count($share) !== 2) {
            throw new InvalidArgumentException('"share" must be {"driver": name, "percent": 0…100}.');
        }

        return [$share['driver'], $share['percent']];
    }

    /** @return array<int, string> */
    private static function users(mixed $users): array
    {
        if (! is_array($users)) {
            throw new InvalidArgumentException('"users" must map user ids to driver names.');
        }

        foreach ($users as $id => $driver) {
            if (! is_int($id) || ! is_string($driver)) {
                throw new InvalidArgumentException('"users" must map user ids to driver names.');
            }
        }

        return $users;
    }
}
