<?php

namespace App\Services\Sources\Stub;

use App\Exceptions\Sources\SourceUnavailable;
use App\Services\Sources\SourceContext;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Http\Exceptions\ThrottleRequestsException;
use InvalidArgumentException;
use JsonException;

/**
 * Fixtures of the stub drivers (WP-10, `25` §4.4): `resources/fixtures/v1/<area>/<name>.json`, in the shape of the
 * data objects, sanitised — no real phones, names, addresses or channel names. Each file is decoded once per process.
 * The frontend reads the same store through `@homi/testing` (`fixture("<area>/<name>")`).
 */
final class FixtureStore
{
    /** Scenarios every stub method knows: `X-Stub-Scenario: <name>` answers with this error. */
    public const array RESERVED_SCENARIOS = ['source_unavailable', 'rate_limited', 'unauthenticated', 'forbidden'];

    /** @var array<string, array<array-key, mixed>> */
    private array $decoded = [];

    public function __construct(private readonly string $root) {}

    public function root(): string
    {
        return $this->root;
    }

    /**
     * @return array<array-key, mixed>
     *
     * @throws InvalidArgumentException on a malformed or unknown name
     */
    public function get(string $name): array
    {
        if (isset($this->decoded[$name])) {
            return $this->decoded[$name];
        }

        // `<area>/<name>`; a part after the area may hold dots between words (`reference/default.ru`), never `..`.
        if (preg_match('#^[a-z0-9_-]+(/[a-z0-9_-]+(\.[a-z0-9_-]+)*)*$#', $name) !== 1) {
            throw new InvalidArgumentException("Invalid stub fixture name \"{$name}\": use <area>/<name> without the extension.");
        }

        $path = "{$this->root}/{$name}.json";

        if (! is_file($path)) {
            throw new InvalidArgumentException("Unknown stub fixture \"{$name}\" ({$path}).");
        }

        try {
            $data = json_decode((string) file_get_contents($path), true, flags: JSON_THROW_ON_ERROR);
        } catch (JsonException $e) {
            throw new InvalidArgumentException("The stub fixture \"{$name}\" is not valid JSON: {$e->getMessage()}", previous: $e);
        }

        if (! is_array($data)) {
            throw new InvalidArgumentException("The stub fixture \"{$name}\" is not a JSON object or list.");
        }

        return $this->decoded[$name] = $data;
    }

    /**
     * The fixture of the request's scenario. A reserved scenario throws its error; a scenario that the method does
     * not name is ignored, so one header value can stay set across several requests.
     *
     * @param  array<string, string>  $scenarios  scenario => fixture name, the scenarios this method knows
     * @return array<array-key, mixed>
     */
    public function pick(SourceContext $context, string $default, array $scenarios = []): array
    {
        $scenario = $context->scenario;

        match ($scenario) {
            'source_unavailable' => throw new SourceUnavailable('Stub scenario source_unavailable.'),
            'rate_limited' => throw new ThrottleRequestsException('Too Many Attempts.', headers: ['Retry-After' => '60']),
            'unauthenticated' => throw new AuthenticationException,
            'forbidden' => throw new AuthorizationException('Stub scenario forbidden.'),
            default => null,
        };

        return $this->get($scenario !== null && isset($scenarios[$scenario]) ? $scenarios[$scenario] : $default);
    }
}
