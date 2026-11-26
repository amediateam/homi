<?php

namespace App\Services\Sources\Legacy\Translators;

/**
 * The keys of one legacy answer whose values HOMI could not use as sent (WP-42, RK-26): an optional key of another type
 * read as `null` or its default, a fraction rounded where a whole number belongs, an unknown code, a list item that
 * does not fit and was left out. The answer is still served; the source logs these keys once per answer, so a legacy
 * release that changes a field shows up in the logs instead of hiding behind defaults.
 *
 * It holds the dotted key names HOMI's translators spell (`floor`, `items.3.floor`, `history.0.at`), positions
 * included — never a value and never a key name taken from the answer. At most `MAX_KEYS` distinct names are kept;
 * `count()` counts every note. `at()` gives a view that writes into the same collection under a prefix, for a nested
 * object or a list item.
 */
final class Coercions
{
    /** The most distinct key names one answer keeps for its log line. */
    public const int MAX_KEYS = 25;

    /** @var array<string, true> */
    private array $keys = [];

    private int $count = 0;

    private function __construct(private readonly ?self $root, private readonly string $prefix) {}

    /** A new, empty collection for one answer. */
    public static function collect(): self
    {
        return new self(null, '');
    }

    /** A view of this collection whose keys start with `$prefix` (`stats.`, `items.3.`). */
    public function at(string $prefix): self
    {
        return new self($this->root ?? $this, $this->prefix.$prefix);
    }

    public function note(string $key): void
    {
        ($this->root ?? $this)->add($this->prefix.$key);
    }

    /** @return list<string> the distinct key names, in the order first noted */
    public function keys(): array
    {
        return array_map(strval(...), array_keys(($this->root ?? $this)->keys));
    }

    /** How many values were noted, repeats included. */
    public function count(): int
    {
        return ($this->root ?? $this)->count;
    }

    private function add(string $key): void
    {
        $this->count++;

        if (isset($this->keys[$key]) || count($this->keys) < self::MAX_KEYS) {
            $this->keys[$key] = true;
        }
    }
}
