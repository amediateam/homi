<?php

namespace App\Console\Commands\Sources;

use App\Services\Sources\SourceConfig;
use App\Services\Sources\SourceManager;
use App\Services\Sources\SourceRule;
use App\Services\Sources\SourceRuleStore;
use App\Services\Sources\SourceSelector;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use InvalidArgumentException;

#[Signature('sources:list')]
#[Description('List the source features: capability, default here, stored rule and bound drivers')]
class ListSources extends Command
{
    public function handle(SourceConfig $config, SourceSelector $selector, SourceManager $manager, SourceRuleStore $store): int
    {
        $features = $config->features();

        if ($features === []) {
            $this->components->info('No source features are configured (config/sources.php).');

            return self::SUCCESS;
        }

        $this->table(['Feature', 'Capability', 'Default here', 'Rule', 'Bound drivers'], array_map(fn (string $feature): array => [
            $feature,
            $config->feature($feature)['capability'],
            $selector->defaultFor($feature) ?? '(none)',
            $this->rule($store->stored($feature)),
            implode(', ', $manager->boundDrivers($feature)) ?: '(none)',
        ], $features));

        return self::SUCCESS;
    }

    private function rule(mixed $stored): string
    {
        $json = (string) json_encode($stored, JSON_UNESCAPED_SLASHES);

        try {
            return SourceRule::fromStored($stored)->isEmpty() ? '(none)' : $json;
        } catch (InvalidArgumentException) {
            return "malformed, ignored: {$json}";
        }
    }
}
