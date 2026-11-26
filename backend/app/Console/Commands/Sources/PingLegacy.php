<?php

namespace App\Console\Commands\Sources;

use App\Exceptions\AccessDenied;
use App\Exceptions\ApiException;
use App\Services\Sources\Legacy\LegacyCall;
use App\Services\Sources\Legacy\LegacyClient;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Config;

/**
 * The first thing the production track runs after installing the legacy service key (WP-41): one `GET /api/cities`
 * through `LegacyClient`, with its limiter, breaker and error mapping. It prints the outcome, the latency and the
 * number of cities, never the key or a value of the answer. It refuses to run on the fixtures (`legacy.fake`),
 * because a success there proves nothing about the key.
 */
#[Signature('legacy:ping')]
#[Description('Call GET /api/cities of the legacy API with the service key and print the outcome, the latency and the number of cities')]
class PingLegacy extends Command
{
    public function handle(LegacyClient $client): int
    {
        if (Config::boolean('legacy.fake')) {
            $this->components->error('legacy.fake is on: the legacy fixtures answer, not the legacy API. Set LEGACY_FAKE=false to ping it.');

            return self::FAILURE;
        }

        $started = hrtime(true);

        try {
            $cities = $client->get('/api/cities', [], new LegacyCall);
        } catch (ApiException $failure) {
            $reason = $failure instanceof AccessDenied ? " ({$failure->reason->value})" : '';
            $outcome = $client->lastOutcome() ?? 'unknown';
            $this->components->error("Legacy: {$outcome}, answered as {$failure->status} {$failure->errorCode}{$reason}, after {$this->elapsed($started)} ms.");

            return self::FAILURE;
        }

        $count = array_is_list($cities) ? count($cities) : 0;
        $this->components->info("Legacy: 2xx in {$this->elapsed($started)} ms, {$count} cities.");

        return $count > 0 ? self::SUCCESS : self::FAILURE;
    }

    private function elapsed(int|float $started): int
    {
        return (int) round((hrtime(true) - $started) / 1_000_000);
    }
}
