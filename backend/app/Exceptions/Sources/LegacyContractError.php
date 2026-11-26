<?php

namespace App\Exceptions\Sources;

/**
 * Legacy answered something its contract (`08`) does not allow: a `2xx` that is empty or not JSON, a `422` to a
 * request HOMI validated first, a missing or mistyped required key. A legacy release that changed a shape fails here
 * and in the golden contract test, not in a user's hands (RK-26): the user sees `503 source_unavailable`.
 *
 * It carries the path template and the names of the offending keys, never a value: whoever catches it logs those
 * at `error`. Its message is `SourceUnavailable`'s default, so the public body says nothing about legacy. It never
 * chains the HTTP client's exception, whose message quotes the response body.
 */
final class LegacyContractError extends SourceUnavailable
{
    /** @param  list<string>  $keys  the offending key names, dotted (`cities.0.center`) */
    public function __construct(public readonly string $path, public readonly string $problem, public readonly array $keys = [])
    {
        parent::__construct();
    }

    /** A required key is missing or has the wrong type. */
    public static function key(string $path, string $key, string $problem = 'missing or of the wrong type'): self
    {
        return new self($path, $problem, [$key]);
    }

    /**
     * What a log line may carry: the path template, the problem and key names, never a value.
     *
     * @return array{path: string, problem: string, keys: list<string>}
     */
    public function context(): array
    {
        return ['path' => $this->path, 'problem' => $this->problem, 'keys' => $this->keys];
    }
}
